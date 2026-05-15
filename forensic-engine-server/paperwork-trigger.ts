/**
 * Automated Paperwork Trigger
 *
 * Listens to strategy step state changes and auto-generates required documents.
 *
 * PT1. Map step types → document templates (cease-and-desist → enforcement letter, etc.)
 * PT2. Trigger generation when step becomes ready / in_progress / completed
 * PT3. Attach generated documents to case record
 * PT4. Store documents in Evidence Lab
 * PT5. Preserve linkage to strategy step, pattern, and intervention
 * PT6. Make documents available in Shop Office and exportable via PDF / print / LumenSend
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { generateDocument } from "./paperwork-engine";

// ─── PT1. Step Type → Document Template Mapping ──────────────────────────────

export interface StepDocMapping {
  stepTypePattern: RegExp;
  documentType: string;
  templateLabel: string;
  triggerOn: ("ready" | "in_progress" | "completed")[];
}

export const STEP_DOC_MAPPINGS: StepDocMapping[] = [
  {
    stepTypePattern: /cease.?and.?desist|cease_desist|c&d/i,
    documentType: "cease_desist",
    templateLabel: "Enforcement Letter — Cease & Desist",
    triggerOn: ["ready", "in_progress"],
  },
  {
    stepTypePattern: /complaint|agency.?complaint|file.?complaint/i,
    documentType: "complaint_filing",
    templateLabel: "Agency Complaint Template",
    triggerOn: ["ready", "in_progress"],
  },
  {
    stepTypePattern: /oversight|oversight.?request|legislative.?brief/i,
    documentType: "formal_response",
    templateLabel: "Oversight Briefing Package",
    triggerOn: ["ready"],
  },
  {
    stepTypePattern: /regulatory.?notice|notice.?package|agency.?notice/i,
    documentType: "demand_letter",
    templateLabel: "Regulatory Notice Package",
    triggerOn: ["ready"],
  },
  {
    stepTypePattern: /foia|records?.?request|public.?records/i,
    documentType: "foia_request",
    templateLabel: "FOIA / Records Request",
    triggerOn: ["in_progress"],
  },
  {
    stepTypePattern: /appeal|administrative.?appeal/i,
    documentType: "appeal_letter",
    templateLabel: "Appeal Letter",
    triggerOn: ["ready", "in_progress"],
  },
  {
    stepTypePattern: /grievance|formal.?grievance/i,
    documentType: "grievance",
    templateLabel: "Formal Grievance Filing",
    triggerOn: ["ready"],
  },
  {
    stepTypePattern: /demand|demand.?letter/i,
    documentType: "demand_letter",
    templateLabel: "Demand Letter",
    triggerOn: ["ready", "in_progress"],
  },
  {
    stepTypePattern: /investigation|investigation.?package|evidence.?package/i,
    documentType: "complaint_filing",
    templateLabel: "Investigation Package",
    triggerOn: ["in_progress"],
  },
  {
    stepTypePattern: /enforcement|enforcement.?referral/i,
    documentType: "cease_desist",
    templateLabel: "Enforcement Referral Letter",
    triggerOn: ["ready", "in_progress"],
  },
];

// ─── PT2. Resolve Mapping for a Step ─────────────────────────────────────────

export function resolveDocMapping(
  stepType: string,
  stepName: string,
  stepDescription: string
): StepDocMapping | null {
  const combined = `${stepType} ${stepName} ${stepDescription}`.toLowerCase();
  for (const mapping of STEP_DOC_MAPPINGS) {
    if (mapping.stepTypePattern.test(combined)) {
      return mapping;
    }
  }
  return null;
}

// ─── PT3. Check if Document Already Generated for Step ───────────────────────

async function hasExistingDoc(stepId: string, documentType: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT id FROM generated_documents
    WHERE metadata->>'$.strategyStepId' = ${stepId}
      AND documentType = ${documentType}
    LIMIT 1
  `);
  return (rows as unknown as any[]).length > 0;
}

// ─── PT4. Generate Document and Store in Evidence Lab ────────────────────────

export async function triggerPaperworkForStep(params: {
  stepId: string;
  pathId: string;
  newStatus: string;
  caseId: number;
  userId: number;
  patternId?: string;
  strategyId?: string;
}): Promise<{
  triggered: boolean;
  documentId?: number;
  documentType?: string;
  reason: string;
}> {
  // Fetch step details
  const [stepRows] = await db.execute(sql`
    SELECT step_id, step_name, step_type, step_description, documentation_required
    FROM strategy_steps WHERE step_id = ${params.stepId}
  `);
  const step = (stepRows as unknown as any[])[0];
  if (!step) {
    return { triggered: false, reason: "Step not found" };
  }

  // Resolve mapping
  const mapping = resolveDocMapping(
    step.step_type || "",
    step.step_name || "",
    step.step_description || ""
  );
  if (!mapping) {
    return { triggered: false, reason: `No document mapping for step type: ${step.step_type}` };
  }

  // Check if this status triggers generation
  if (!mapping.triggerOn.includes(params.newStatus as any)) {
    return {
      triggered: false,
      reason: `Status '${params.newStatus}' does not trigger for ${mapping.documentType}`,
    };
  }

  // Check if already generated
  const exists = await hasExistingDoc(params.stepId, mapping.documentType);
  if (exists) {
    return { triggered: false, reason: "Document already generated for this step" };
  }

  // Generate document via Paperwork Engine
  const docId = await generateDocument({
    caseId: params.caseId,
    userId: params.userId,
    documentType: mapping.documentType,
    customInstructions: `Auto-generated for strategy step: ${step.step_name}. ${step.step_description || ""}`,
  });

  // Update metadata to link to strategy step, pattern, and intervention
  const metadata = JSON.stringify({
    strategyStepId: params.stepId,
    strategyPathId: params.pathId,
    patternId: params.patternId || null,
    strategyId: params.strategyId || null,
    autoGenerated: true,
    triggerStatus: params.newStatus,
    templateLabel: mapping.templateLabel,
  });
  await db.execute(sql`
    UPDATE generated_documents
    SET metadata = ${metadata}
    WHERE id = ${docId}
  `);

  // PT4. Store in Evidence Lab
  await db.execute(sql`
    INSERT INTO evidence_items (caseId, evidenceType, title, description, sourceName, fileReference, metadata, createdAt, updatedAt)
    VALUES (
      ${params.caseId},
      'generated_document',
      ${`[Auto] ${mapping.templateLabel} — ${step.step_name}`},
      ${`Auto-generated document for strategy step "${step.step_name}" (${mapping.documentType}). Linked to path ${params.pathId}.`},
      'Paperwork Trigger Engine',
      ${`generated_doc:${docId}`},
      ${JSON.stringify({
        generatedDocId: docId,
        strategyStepId: params.stepId,
        strategyPathId: params.pathId,
        patternId: params.patternId,
        documentType: mapping.documentType,
      })},
      ${Date.now()},
      ${Date.now()}
    )
  `);

  return {
    triggered: true,
    documentId: docId,
    documentType: mapping.documentType,
    reason: `Generated ${mapping.templateLabel} for step "${step.step_name}"`,
  };
}

// ─── PT5. Batch Trigger for All Steps in a Path ─────────────────────────────

export async function triggerPaperworkForPath(params: {
  pathId: string;
  caseId: number;
  userId: number;
  patternId?: string;
  strategyId?: string;
  statusFilter?: string;
}): Promise<{
  total: number;
  triggered: number;
  skipped: number;
  results: Array<{
    stepId: string;
    stepName: string;
    triggered: boolean;
    documentId?: number;
    reason: string;
  }>;
}> {
  const statusClause = params.statusFilter
    ? sql`AND step_status = ${params.statusFilter}`
    : sql`AND step_status IN ('ready', 'in_progress', 'completed')`;

  const [steps] = await db.execute(sql`
    SELECT step_id, step_name, step_status
    FROM strategy_steps
    WHERE path_id = ${params.pathId} ${statusClause}
    ORDER BY step_number ASC
  `);

  const results: any[] = [];
  let triggered = 0;
  let skipped = 0;

  for (const step of steps as unknown as any[]) {
    const result = await triggerPaperworkForStep({
      stepId: step.step_id,
      pathId: params.pathId,
      newStatus: step.step_status,
      caseId: params.caseId,
      userId: params.userId,
      patternId: params.patternId,
      strategyId: params.strategyId,
    });
    results.push({
      stepId: step.step_id,
      stepName: step.step_name,
      triggered: result.triggered,
      documentId: result.documentId,
      reason: result.reason,
    });
    if (result.triggered) triggered++;
    else skipped++;
  }

  return {
    total: (steps as unknown as any[]).length,
    triggered,
    skipped,
    results,
  };
}

// ─── PT6. Get Auto-Generated Documents for a Step ───────────────────────────

export async function getAutoGeneratedDocsForStep(stepId: string): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT id, caseId, documentType, title, genDocStatus, createdAt, metadata
    FROM generated_documents
    WHERE metadata->>'$.strategyStepId' = ${stepId}
    ORDER BY createdAt DESC
  `);
  return rows as unknown as any[];
}

// ─── PT7. Get Auto-Generated Documents for a Path ───────────────────────────

export async function getAutoGeneratedDocsForPath(pathId: string): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT id, caseId, documentType, title, genDocStatus, createdAt, metadata
    FROM generated_documents
    WHERE metadata->>'$.strategyPathId' = ${pathId}
    ORDER BY createdAt DESC
  `);
  return rows as unknown as any[];
}

// ─── PT8. Get Trigger Status Summary ────────────────────────────────────────

export async function getPaperworkTriggerStatus(): Promise<{
  totalAutoGenerated: number;
  byDocumentType: Record<string, number>;
  recentTriggers: any[];
}> {
  const [countRows] = await db.execute(sql`
    SELECT COUNT(*) as total FROM generated_documents
    WHERE metadata->>'$.autoGenerated' = 'true'
  `);
  const [typeRows] = await db.execute(sql`
    SELECT documentType, COUNT(*) as cnt FROM generated_documents
    WHERE metadata->>'$.autoGenerated' = 'true'
    GROUP BY documentType
  `);
  const [recentRows] = await db.execute(sql`
    SELECT id, caseId, documentType, title, genDocStatus, createdAt, metadata
    FROM generated_documents
    WHERE metadata->>'$.autoGenerated' = 'true'
    ORDER BY createdAt DESC
    LIMIT 20
  `);

  const byDocumentType: Record<string, number> = {};
  for (const row of typeRows as unknown as any[]) {
    byDocumentType[row.documentType] = Number(row.cnt);
  }

  return {
    totalAutoGenerated: Number((countRows as unknown as any[])[0]?.total) || 0,
    byDocumentType,
    recentTriggers: recentRows as unknown as any[],
  };
}
