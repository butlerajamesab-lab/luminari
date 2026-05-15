/**
 * Intervention Submission Workflow
 *
 * Guided multi-step flow for escalating patterns to external authorities.
 *
 * SW1. Create draft submission with endpoint + pattern context
 * SW2. Attach supporting evidence from case and Evidence Lab
 * SW3. Generate submission package (documents + evidence bundle)
 * SW4. Confirm and record submission with full audit trail
 * SW5. Track submission status through lifecycle
 * SW6. Support resume from any step if interrupted
 *
 * Statuses: draft → ready_to_submit → submitted → under_review → response_received → closed
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { buildInterventionAction, gatherEvidenceBundle } from "./intervention-action-builder";
import { triggerPaperworkForPath } from "./paperwork-trigger";

// ─── SW1. Create Draft Submission ────────────────────────────────────────────

export async function createDraftSubmission(params: {
  endpointId: string;
  patternId?: string;
  strategyId?: string;
  pathId?: string;
  caseId?: number;
  actionType: string;
  actionDescription?: string;
  submittedBy: string;
}): Promise<{
  submissionId: string;
  status: string;
  endpoint: any;
}> {
  const submissionId = randomUUID();
  const now = new Date();

  // Fetch endpoint details
  const [epRows] = await db.execute(sql`
    SELECT * FROM intervention_endpoints WHERE endpoint_id = ${params.endpointId}
  `);
  const endpoint = (epRows as unknown as any[])[0];
  if (!endpoint) throw new Error("Endpoint not found");

  await db.execute(sql`
    INSERT INTO intervention_submissions (
      submission_id, endpoint_id, pattern_id, strategy_id, path_id, case_id,
      action_type, action_description, response_status, submitted_by,
      created_at, updated_at
    ) VALUES (
      ${submissionId}, ${params.endpointId},
      ${params.patternId || null}, ${params.strategyId || null},
      ${params.pathId || null}, ${params.caseId || null},
      ${params.actionType}, ${params.actionDescription || null},
      'draft', ${params.submittedBy},
      ${now}, ${now}
    )
  `);

  return { submissionId, status: "draft", endpoint };
}

// ─── SW2. Attach Evidence to Submission ──────────────────────────────────────

export async function attachEvidence(params: {
  submissionId: string;
  caseId?: number;
  patternId?: string;
  additionalEvidence?: Array<{ title: string; type: string; reference: string }>;
}): Promise<{
  evidenceCount: number;
  evidenceBundle: any;
}> {
  // Gather evidence from case + pattern
  let bundle: any = { items: [], caseEvidence: [], patternSignals: [] };

  if (params.caseId || params.patternId) {
    try {
      bundle = await gatherEvidenceBundle({
        caseId: params.caseId,
        patternId: params.patternId,
      });
    } catch (e) {
      // If evidence gathering fails, continue with empty bundle
      console.warn("[SubmissionWorkflow] Evidence gathering partial:", e);
    }
  }

  // Add any additional evidence items
  if (params.additionalEvidence) {
    bundle.items = [...(bundle.items || []), ...params.additionalEvidence];
  }

  // Store evidence bundle on the submission
  await db.execute(sql`
    UPDATE intervention_submissions
    SET evidence_bundle = ${JSON.stringify(bundle)}, updated_at = ${new Date()}
    WHERE submission_id = ${params.submissionId}
  `);

  const totalItems = (bundle.items?.length || 0) +
    (bundle.caseEvidence?.length || 0) +
    (bundle.patternSignals?.length || 0);

  return { evidenceCount: totalItems, evidenceBundle: bundle };
}

// ─── SW3. Generate Submission Package ────────────────────────────────────────

export async function generateSubmissionPackage(params: {
  submissionId: string;
  caseId?: number;
  userId: number;
  pathId?: string;
  patternId?: string;
  strategyId?: string;
}): Promise<{
  documentsGenerated: number;
  documents: any[];
  packageReady: boolean;
}> {
  // Fetch submission details
  const [subRows] = await db.execute(sql`
    SELECT s.*, e.agency_name, e.submission_format, e.required_documents, e.intervention_type
    FROM intervention_submissions s
    LEFT JOIN intervention_endpoints e ON s.endpoint_id = e.endpoint_id
    WHERE s.submission_id = ${params.submissionId}
  `);
  const submission = (subRows as unknown as any[])[0];
  if (!submission) throw new Error("Submission not found");

  const documents: any[] = [];

  // If there's a strategy path, trigger paperwork for all eligible steps
  if (params.pathId && params.caseId) {
    try {
      const pathResult = await triggerPaperworkForPath({
        pathId: params.pathId,
        caseId: params.caseId,
        userId: params.userId,
        patternId: params.patternId,
        strategyId: params.strategyId,
      });
      for (const r of pathResult.results) {
        if (r.triggered && r.documentId) {
          documents.push({
            documentId: r.documentId,
            stepId: r.stepId,
            stepName: r.stepName,
            source: "auto_trigger",
          });
        }
      }
    } catch (e) {
      console.warn("[SubmissionWorkflow] Path paperwork trigger partial:", e);
    }
  }

  // Build intervention action for the submission type
  try {
    const action = await buildInterventionAction({
      actionType: submission.action_type as any,
      endpointId: submission.endpoint_id,
      caseId: params.caseId,
      patternId: params.patternId,
    });
    if (action.submissionPackage) {
      documents.push({
        source: "action_builder",
        actionType: submission.action_type,
        package: action.submissionPackage,
      });
    }
  } catch (e) {
    console.warn("[SubmissionWorkflow] Action build partial:", e);
  }

  // Update submission with documents
  await db.execute(sql`
    UPDATE intervention_submissions
    SET documents_sent = ${JSON.stringify(documents)},
        response_status = 'ready_to_submit',
        updated_at = ${new Date()}
    WHERE submission_id = ${params.submissionId}
  `);

  return {
    documentsGenerated: documents.length,
    documents,
    packageReady: true,
  };
}

// ─── SW4. Confirm and Submit ─────────────────────────────────────────────────

export async function confirmSubmission(params: {
  submissionId: string;
  submittedBy: string;
  trackingIdentifier?: string;
  notes?: string;
}): Promise<{
  submissionId: string;
  status: string;
  submissionDate: Date;
  trackingIdentifier: string;
}> {
  const now = new Date();
  const trackingId = params.trackingIdentifier || `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await db.execute(sql`
    UPDATE intervention_submissions
    SET response_status = 'submitted',
        submission_date = ${now},
        tracking_identifier = ${trackingId},
        submitted_by = ${params.submittedBy},
        updated_at = ${now}
    WHERE submission_id = ${params.submissionId}
  `);

  return {
    submissionId: params.submissionId,
    status: "submitted",
    submissionDate: now,
    trackingIdentifier: trackingId,
  };
}

// ─── SW5. Update Submission Status ───────────────────────────────────────────

export async function transitionSubmissionStatus(params: {
  submissionId: string;
  newStatus: string;
  responseDetails?: string;
  followupRequired?: boolean;
  followupDate?: string;
}): Promise<{ success: boolean; status: string }> {
  const validStatuses = ["draft", "ready_to_submit", "submitted", "under_review", "response_received", "closed"];
  if (!validStatuses.includes(params.newStatus)) {
    throw new Error(`Invalid status: ${params.newStatus}. Valid: ${validStatuses.join(", ")}`);
  }

  const now = new Date();
  const updates: any = {
    status: params.newStatus,
    updatedAt: now,
  };

  if (params.newStatus === "response_received" || params.newStatus === "under_review") {
    await db.execute(sql`
      UPDATE intervention_submissions
      SET response_status = ${params.newStatus},
          response_date = ${now},
          response_details = COALESCE(${params.responseDetails || null}, response_details),
          followup_required = ${params.followupRequired ? 1 : 0},
          followup_date = ${params.followupDate ? new Date(params.followupDate) : null},
          updated_at = ${now}
      WHERE submission_id = ${params.submissionId}
    `);
  } else {
    await db.execute(sql`
      UPDATE intervention_submissions
      SET response_status = ${params.newStatus},
          response_details = COALESCE(${params.responseDetails || null}, response_details),
          updated_at = ${now}
      WHERE submission_id = ${params.submissionId}
    `);
  }

  return { success: true, status: params.newStatus };
}

// ─── SW6. Get Submission Workflow State ───────────────────────────────────────

export async function getSubmissionWorkflowState(submissionId: string): Promise<{
  submission: any;
  endpoint: any;
  evidence: any;
  documents: any;
  currentStep: number;
  steps: Array<{ step: number; label: string; status: "completed" | "current" | "pending" }>;
}> {
  const [rows] = await db.execute(sql`
    SELECT s.*, e.agency_name, e.agency_abbreviation, e.intervention_type,
           e.contact_method, e.submission_format, e.required_documents, e.escalation_level
    FROM intervention_submissions s
    LEFT JOIN intervention_endpoints e ON s.endpoint_id = e.endpoint_id
    WHERE s.submission_id = ${submissionId}
  `);
  const row = (rows as unknown as any[])[0];
  if (!row) throw new Error("Submission not found");

  // Determine current step based on status
  const statusToStep: Record<string, number> = {
    draft: 1,
    ready_to_submit: 4,
    submitted: 5,
    under_review: 6,
    response_received: 6,
    closed: 6,
  };
  const currentStep = statusToStep[row.response_status] || 1;

  // Determine step completion
  const hasEvidence = row.evidence_bundle && JSON.parse(row.evidence_bundle || "{}").items?.length > 0;
  const hasDocs = row.documents_sent && JSON.parse(row.documents_sent || "[]").length > 0;

  const steps = [
    {
      step: 1,
      label: "Select Endpoint",
      status: row.endpoint_id ? "completed" as const : "current" as const,
    },
    {
      step: 2,
      label: "Review Intervention",
      status: currentStep > 1 ? "completed" as const : currentStep === 1 && row.endpoint_id ? "current" as const : "pending" as const,
    },
    {
      step: 3,
      label: "Attach Evidence",
      status: hasEvidence ? "completed" as const : currentStep >= 3 ? "current" as const : "pending" as const,
    },
    {
      step: 4,
      label: "Generate Package",
      status: hasDocs ? "completed" as const : currentStep >= 4 ? "current" as const : "pending" as const,
    },
    {
      step: 5,
      label: "Confirm & Submit",
      status: row.response_status === "submitted" || row.response_status === "under_review" || row.response_status === "response_received" || row.response_status === "closed"
        ? "completed" as const
        : currentStep >= 5 ? "current" as const : "pending" as const,
    },
    {
      step: 6,
      label: "Track Response",
      status: row.response_status === "closed" ? "completed" as const
        : row.response_status === "under_review" || row.response_status === "response_received" ? "current" as const
        : "pending" as const,
    },
  ];

  return {
    submission: row,
    endpoint: {
      agencyName: row.agency_name,
      abbreviation: row.agency_abbreviation,
      interventionType: row.intervention_type,
      contactMethod: row.contact_method,
      submissionFormat: row.submission_format,
      requiredDocuments: row.required_documents,
      escalationLevel: row.escalation_level,
    },
    evidence: row.evidence_bundle ? JSON.parse(row.evidence_bundle || "{}") : null,
    documents: row.documents_sent ? JSON.parse(row.documents_sent || "[]") : [],
    currentStep,
    steps,
  };
}

// ─── SW7. List Active Workflows ──────────────────────────────────────────────

export async function listActiveWorkflows(params?: {
  caseId?: number;
  patternId?: string;
  status?: string;
}): Promise<any[]> {
  let whereClause = sql`1=1`;
  if (params?.caseId) whereClause = sql`${whereClause} AND s.case_id = ${params.caseId}`;
  if (params?.patternId) whereClause = sql`${whereClause} AND s.pattern_id = ${params.patternId}`;
  if (params?.status) whereClause = sql`${whereClause} AND s.response_status = ${params.status}`;

  const [rows] = await db.execute(sql`
    SELECT s.submission_id, s.endpoint_id, s.pattern_id, s.strategy_id, s.path_id,
           s.case_id, s.action_type, s.response_status, s.submission_date,
           s.tracking_identifier, s.submitted_by, s.created_at,
           e.agency_name, e.agency_abbreviation, e.intervention_type
    FROM intervention_submissions s
    LEFT JOIN intervention_endpoints e ON s.endpoint_id = e.endpoint_id
    WHERE ${whereClause}
    ORDER BY s.created_at DESC
    LIMIT 50
  `);
  return rows as unknown as any[];
}

// ─── SW8. Get Workflow Summary ───────────────────────────────────────────────

export async function getWorkflowSummary(): Promise<{
  totalWorkflows: number;
  byStatus: Record<string, number>;
  drafts: number;
  readyToSubmit: number;
  submitted: number;
  underReview: number;
  responseReceived: number;
  closed: number;
  recentActivity: any[];
}> {
  const [statusRows] = await db.execute(sql`
    SELECT response_status, COUNT(*) as cnt
    FROM intervention_submissions
    GROUP BY response_status
  `);
  const [recentRows] = await db.execute(sql`
    SELECT s.submission_id, s.action_type, s.response_status, s.submission_date,
           s.tracking_identifier, s.submitted_by,
           e.agency_name, e.agency_abbreviation
    FROM intervention_submissions s
    LEFT JOIN intervention_endpoints e ON s.endpoint_id = e.endpoint_id
    ORDER BY s.updated_at DESC
    LIMIT 10
  `);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows as unknown as any[]) {
    byStatus[row.response_status] = Number(row.cnt);
    total += Number(row.cnt);
  }

  return {
    totalWorkflows: total,
    byStatus,
    drafts: byStatus["draft"] || 0,
    readyToSubmit: byStatus["ready_to_submit"] || 0,
    submitted: byStatus["submitted"] || 0,
    underReview: byStatus["under_review"] || 0,
    responseReceived: byStatus["response_received"] || 0,
    closed: byStatus["closed"] || 0,
    recentActivity: recentRows as unknown as any[],
  };
}
