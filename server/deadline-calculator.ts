/**
 * Deadline Calculator & Pipeline Documents Loader
 * 
 * Provides typed access to statutory_deadlines.json and pipeline_documents.json.
 * Calculates remaining days from trigger events and detects document gaps.
 * 
 * Read-only — no mutations to existing engines.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

type StateCode = "WA" | "OR" | "CA";

interface StateDeadlineDetail {
  days: number | null;
  statute: string | null;
  notes: string;
}

interface DeadlineEntry {
  deadline_id: string;
  action: string;
  trigger_event: string;
  federal: StateDeadlineDetail;
  states: Partial<Record<StateCode, StateDeadlineDetail>>;
  urgency: "critical" | "high" | "medium" | "low";
  category: string;
}

interface PipelineDeadlines {
  pipeline_id: string;
  deadlines: DeadlineEntry[];
}

interface DeadlinesRegistry {
  meta: Record<string, unknown>;
  deadlines: PipelineDeadlines[];
}

interface DocumentEntry {
  doc_id: string;
  label: string;
  category: string;
  priority: "required" | "recommended";
  notes: string;
}

interface PipelineDocuments {
  pipeline_id: string;
  documents: DocumentEntry[];
}

interface DocumentsRegistry {
  meta: Record<string, unknown>;
  pipelines: PipelineDocuments[];
}

// ─── Computed types returned by functions ────────────────────────────────────

export interface DeadlineResult {
  deadline_id: string;
  action: string;
  trigger_event: string;
  urgency: "critical" | "high" | "medium" | "low";
  category: string;
  days: number | null;
  statute: string | null;
  notes: string;
  source: "state" | "federal";
  remaining_days: number | null;
  status: "expired" | "urgent" | "approaching" | "active" | "no_deadline";
}

export interface DocumentGapResult {
  pipeline_id: string;
  total_documents: number;
  required_documents: number;
  recommended_documents: number;
  uploaded_ids: string[];
  missing_required: DocumentEntry[];
  missing_recommended: DocumentEntry[];
  completion_percentage: number;
  required_completion_percentage: number;
}

// ─── Registry Loading ────────────────────────────────────────────────────────

const configDir = join(import.meta.dirname, "config");

function loadDeadlines(): DeadlinesRegistry {
  const raw = readFileSync(join(configDir, "statutory_deadlines.json"), "utf-8");
  return JSON.parse(raw);
}

function loadDocuments(): DocumentsRegistry {
  const raw = readFileSync(join(configDir, "pipeline_documents.json"), "utf-8");
  return JSON.parse(raw);
}

const DEADLINES = loadDeadlines();
const DOCUMENTS = loadDocuments();

// ─── Deadline Index ──────────────────────────────────────────────────────────

const deadlinesByPipeline = new Map<string, DeadlineEntry[]>();
for (const pd of DEADLINES.deadlines) {
  deadlinesByPipeline.set(pd.pipeline_id, pd.deadlines);
}

const documentsByPipeline = new Map<string, DocumentEntry[]>();
for (const pd of DOCUMENTS.pipelines) {
  documentsByPipeline.set(pd.pipeline_id, pd.documents);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get all deadlines for a pipeline, resolved for a specific state.
 * State-specific deadlines override federal when available.
 * If triggerDate is provided, calculates remaining days and status.
 */
export function getDeadlines(
  pipelineId: string,
  state?: StateCode,
  triggerDates?: Record<string, Date>
): DeadlineResult[] {
  const entries = deadlinesByPipeline.get(pipelineId);
  if (!entries) return [];

  const now = new Date();

  return entries.map((entry) => {
    // Resolve state-specific or fall back to federal
    const stateDetail = state ? entry.states[state] : undefined;
    const resolved = stateDetail || entry.federal;
    const source: "state" | "federal" = stateDetail ? "state" : "federal";

    // Calculate remaining days if trigger date provided
    let remaining_days: number | null = null;
    let status: DeadlineResult["status"] = "no_deadline";

    if (resolved.days !== null) {
      const triggerDate = triggerDates?.[entry.trigger_event];
      if (triggerDate) {
        const deadlineDate = new Date(triggerDate);
        deadlineDate.setDate(deadlineDate.getDate() + resolved.days);
        const diffMs = deadlineDate.getTime() - now.getTime();
        remaining_days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (remaining_days < 0) {
          status = "expired";
        } else if (remaining_days <= 7) {
          status = "urgent";
        } else if (remaining_days <= 30) {
          status = "approaching";
        } else {
          status = "active";
        }
      } else {
        status = "active"; // Has a deadline but no trigger date provided
      }
    }

    return {
      deadline_id: entry.deadline_id,
      action: entry.action,
      trigger_event: entry.trigger_event,
      urgency: entry.urgency,
      category: entry.category,
      days: resolved.days,
      statute: resolved.statute,
      notes: resolved.notes,
      source,
      remaining_days,
      status,
    };
  });
}

/**
 * Get only critical/urgent deadlines for a pipeline.
 */
export function getCriticalDeadlines(
  pipelineId: string,
  state?: StateCode,
  triggerDates?: Record<string, Date>
): DeadlineResult[] {
  return getDeadlines(pipelineId, state, triggerDates).filter(
    (d) => d.status === "expired" || d.status === "urgent" || d.urgency === "critical"
  );
}

/**
 * Get all required documents for a pipeline.
 */
export function getRequiredDocuments(pipelineId: string): DocumentEntry[] {
  const docs = documentsByPipeline.get(pipelineId);
  if (!docs) return [];
  return docs;
}

/**
 * Detect document gaps: compare uploaded document IDs against required list.
 * Returns missing required and recommended documents with completion percentages.
 */
export function detectDocumentGaps(
  pipelineId: string,
  uploadedDocIds: string[]
): DocumentGapResult | null {
  const docs = documentsByPipeline.get(pipelineId);
  if (!docs) return null;

  const uploadedSet = new Set(uploadedDocIds);
  const required = docs.filter((d) => d.priority === "required");
  const recommended = docs.filter((d) => d.priority === "recommended");

  const missingRequired = required.filter((d) => !uploadedSet.has(d.doc_id));
  const missingRecommended = recommended.filter((d) => !uploadedSet.has(d.doc_id));

  const totalUploaded = docs.filter((d) => uploadedSet.has(d.doc_id)).length;
  const requiredUploaded = required.filter((d) => uploadedSet.has(d.doc_id)).length;

  return {
    pipeline_id: pipelineId,
    total_documents: docs.length,
    required_documents: required.length,
    recommended_documents: recommended.length,
    uploaded_ids: uploadedDocIds,
    missing_required: missingRequired,
    missing_recommended: missingRecommended,
    completion_percentage: docs.length > 0 ? Math.round((totalUploaded / docs.length) * 100) : 0,
    required_completion_percentage:
      required.length > 0 ? Math.round((requiredUploaded / required.length) * 100) : 0,
  };
}

/**
 * Get all pipeline IDs that have deadlines registered.
 */
export function getDeadlinePipelineIds(): string[] {
  return Array.from(deadlinesByPipeline.keys());
}

/**
 * Get all pipeline IDs that have documents registered.
 */
export function getDocumentPipelineIds(): string[] {
  return Array.from(documentsByPipeline.keys());
}

/**
 * Get statistics about the registries.
 */
export function getRegistryStats() {
  const totalDeadlines = Array.from(deadlinesByPipeline.values()).reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  const totalDocuments = Array.from(documentsByPipeline.values()).reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  const totalRequired = Array.from(documentsByPipeline.values()).reduce(
    (sum, arr) => sum + arr.filter((d) => d.priority === "required").length,
    0
  );

  return {
    deadlines: {
      pipelines: deadlinesByPipeline.size,
      total: totalDeadlines,
    },
    documents: {
      pipelines: documentsByPipeline.size,
      total: totalDocuments,
      required: totalRequired,
      recommended: totalDocuments - totalRequired,
    },
  };
}
