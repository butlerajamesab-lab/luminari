/**
 * Intervention Action Builder
 * 
 * Generates intervention packages automatically by assembling evidence bundles,
 * recommended authorities, submission packages, and tracking identifiers.
 * Connects to the Paperwork Generation Engine for document production.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getEndpointById, getRoutesForPattern, createSubmission } from "./intervention-network-engine";

// ─── Action Types ────────────────────────────────────────────────────────────

export const INTERVENTION_ACTION_TYPES = [
  "agency_complaint",
  "enforcement_referral",
  "legislative_briefing",
  "oversight_request",
  "investigation_request",
  "public_report",
] as const;

export type InterventionActionType = typeof INTERVENTION_ACTION_TYPES[number];

// Map action types to paperwork document types
const ACTION_TO_DOC_TYPE: Record<string, string> = {
  agency_complaint: "complaint_filing",
  enforcement_referral: "cease_desist",
  legislative_briefing: "formal_response",
  oversight_request: "grievance",
  investigation_request: "complaint_filing",
  public_report: "formal_response",
};

// ─── IAB1. Gather Evidence Bundle ────────────────────────────────────────────

export async function gatherEvidenceBundle(params: {
  caseId?: number;
  patternId?: string;
}): Promise<{
  documents: any[];
  claims: any[];
  findings: any[];
  signals: any[];
  totalItems: number;
}> {
  const documents: any[] = [];
  const claims: any[] = [];
  const findings: any[] = [];
  const signals: any[] = [];

  if (params.caseId) {
    // Gather case-level evidence
    const [docRows] = await db.execute(sql`
      SELECT id, filename, fileType, documentType, documentPurpose, s3Url
      FROM documents WHERE caseId = ${params.caseId} AND documentResolution = 'active'
      ORDER BY createdAt DESC LIMIT 20
    `);
    documents.push(...(docRows as unknown as any[]));

    const [claimRows] = await db.execute(sql`
      SELECT id, claimType, description, severity, confidence
      FROM claims WHERE caseId = ${params.caseId}
      ORDER BY severity DESC LIMIT 15
    `);
    claims.push(...(claimRows as unknown as any[]));

    const [findingRows] = await db.execute(sql`
      SELECT id, findingType, summary, severity, confidence
      FROM findings WHERE caseId = ${params.caseId}
      ORDER BY severity DESC LIMIT 15
    `);
    findings.push(...(findingRows as unknown as any[]));
  }

  if (params.patternId) {
    // Gather pattern-level signals
    const [signalRows] = await db.execute(sql`
      SELECT signal_id, signal_type, signal_source, signal_description, severity_level, confidence_score
      FROM signal_registry WHERE pattern_id = ${params.patternId}
      ORDER BY confidence_score DESC LIMIT 20
    `);
    signals.push(...(signalRows as unknown as any[]));
  }

  return {
    documents,
    claims,
    findings,
    signals,
    totalItems: documents.length + claims.length + findings.length + signals.length,
  };
}

// ─── IAB2. Build Intervention Action ─────────────────────────────────────────

export interface InterventionAction {
  actionId: string;
  actionType: InterventionActionType;
  endpointId: string;
  agencyName: string;
  evidenceBundle: {
    documents: any[];
    claims: any[];
    findings: any[];
    signals: any[];
    totalItems: number;
  };
  documentType: string;
  submissionPackage: {
    recipientName: string;
    recipientAddress?: string;
    submissionFormat: string;
    requiredDocuments: string[];
  };
  trackingIdentifier: string;
}

export async function buildInterventionAction(params: {
  actionType: InterventionActionType;
  endpointId: string;
  caseId?: number;
  patternId?: string;
}): Promise<InterventionAction> {
  const endpoint = await getEndpointById(params.endpointId);
  if (!endpoint) throw new Error(`Endpoint ${params.endpointId} not found`);

  const evidenceBundle = await gatherEvidenceBundle({
    caseId: params.caseId,
    patternId: params.patternId,
  });

  const requiredDocs = typeof endpoint.required_documents === "string"
    ? JSON.parse(endpoint.required_documents)
    : endpoint.required_documents || [];

  const trackingId = `LUM-${params.actionType.toUpperCase().slice(0, 4)}-${Date.now().toString(36).toUpperCase()}`;

  return {
    actionId: randomUUID(),
    actionType: params.actionType,
    endpointId: params.endpointId,
    agencyName: endpoint.agency_name,
    evidenceBundle,
    documentType: ACTION_TO_DOC_TYPE[params.actionType] || "complaint_filing",
    submissionPackage: {
      recipientName: endpoint.agency_name,
      recipientAddress: endpoint.contact_details || undefined,
      submissionFormat: endpoint.submission_format || "web_form",
      requiredDocuments: requiredDocs,
    },
    trackingIdentifier: trackingId,
  };
}

// ─── IAB3. Execute Intervention (build + submit) ─────────────────────────────

export async function executeIntervention(params: {
  actionType: InterventionActionType;
  endpointId: string;
  caseId?: number;
  patternId?: string;
  strategyId?: string;
  pathId?: string;
  userId?: string;
  customDescription?: string;
}): Promise<{
  action: InterventionAction;
  submissionId: string;
}> {
  // Build the action
  const action = await buildInterventionAction({
    actionType: params.actionType,
    endpointId: params.endpointId,
    caseId: params.caseId,
    patternId: params.patternId,
  });

  // Create submission record
  const submissionId = await createSubmission({
    endpointId: params.endpointId,
    patternId: params.patternId,
    strategyId: params.strategyId,
    pathId: params.pathId,
    caseId: params.caseId,
    actionType: params.actionType,
    actionDescription: params.customDescription || `${params.actionType} to ${action.agencyName}`,
    evidenceBundle: {
      documentCount: action.evidenceBundle.documents.length,
      claimCount: action.evidenceBundle.claims.length,
      findingCount: action.evidenceBundle.findings.length,
      signalCount: action.evidenceBundle.signals.length,
    },
    submittedBy: params.userId,
  });

  return { action, submissionId };
}

// ─── IAB4. Get Recommended Actions for Pattern ───────────────────────────────

export async function getRecommendedActions(params: {
  patternType: string;
  harmDomain?: string;
  jurisdictionScope?: string;
}): Promise<{
  actions: Array<{
    actionType: string;
    endpoint: any;
    priority: number;
  }>;
}> {
  const { routes, endpoints } = await getRoutesForPattern(
    params.patternType,
    params.harmDomain,
    params.jurisdictionScope
  );

  const actions: Array<{ actionType: string; endpoint: any; priority: number }> = [];
  
  for (const endpoint of endpoints) {
    // Map intervention type to action type
    let actionType: string;
    switch (endpoint.intervention_type) {
      case "enforcement":
        actionType = "enforcement_referral";
        break;
      case "oversight":
        actionType = "oversight_request";
        break;
      case "investigation":
        actionType = "investigation_request";
        break;
      default:
        actionType = "agency_complaint";
    }
    actions.push({
      actionType,
      endpoint,
      priority: endpoint.escalation_level || 1,
    });
  }

  actions.sort((a, b) => a.priority - b.priority);
  return { actions };
}
