/**
 * Gate Helpers — Bridge between gate-schema.ts and DB queries.
 *
 * Provides server-side functions that:
 *  1. Gather GateStageInput from DB for a given caseId/snapshotId
 *  2. Compute the current gate stage
 *  3. Assert action permissions with full DB context
 *
 * These are called from tRPC procedures to enforce the gate schema.
 */

import * as dbHelpers from "./db";
import { getQueueStatus } from "./analysis-pipeline";
import {
  computeGateStage,
  assertAllowed,
  assertMutationAllowed,
  GateError,
  GATE_ERROR_CODES,
  type GateStageInput,
  type GateStageResult,
  type GatedAction,
} from "./gate-schema";
import { classifyDocumentState } from "./remediation-classification";
import { TRPCError } from "@trpc/server";

/**
 * Build GateStageInput from DB for a given case and snapshot.
 */
export async function buildGateStageInput(caseId: number, snapshotId: number): Promise<GateStageInput> {
  const snapshot = await dbHelpers.getSnapshot(snapshotId);
  if (!snapshot) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Snapshot ${snapshotId} not found`,
    });
  }

  const allDocs = await dbHelpers.listDocuments(caseId);
  const snapshotDocs = allDocs.filter((d: any) => d.snapshotId === snapshotId);

  // Document Resolution Filter: only 'active' documents participate in gate computation.
  // Superseded, excluded, and corrupted documents are resolved — they do not block
  // extraction integrity, stage advancement, or seal readiness.
  const activeDocs = snapshotDocs.filter((d: any) => (d as any).documentResolution === 'active');

  const readyDocuments = activeDocs.filter((d: any) => d.status === "ready").length;
  const extractingDocuments = activeDocs.filter(
    (d: any) => d.status === "extracting" || d.status === "uploaded" || d.status === "analyzing" || d.status === "retrying"
  ).length;
  const errorDocuments = activeDocs.filter(
    (d: any) => d.status === "error" || d.status === "failed_permanent"
  ).length;

  // Granular extraction integrity counts (active documents only)
  const uploadedCount = activeDocs.filter((d: any) => d.status === "uploaded").length;
  const extractingCount = activeDocs.filter((d: any) => d.status === "extracting").length;
  const analyzingCount = activeDocs.filter((d: any) => d.status === "analyzing").length;
  const retryingCount = activeDocs.filter((d: any) => d.status === "retrying").length;
  const failedPermanentCount = activeDocs.filter((d: any) => d.status === "failed_permanent").length;

  // Classify error documents using remediation classifier (active documents only)
  const errorDocs = activeDocs.filter((d: any) => d.status === "error" || d.status === "failed_permanent");
  let autoRecoverableCount = 0;
  let manualReuploadCount = 0;
  for (const doc of errorDocs) {
    const classification = classifyDocumentState(doc as any);
    if (classification.remediationClass === 'auto_recoverable') autoRecoverableCount++;
    else if (classification.remediationClass === 'manual_reupload_required') manualReuploadCount++;
  }

  const stats = await dbHelpers.getCaseStats(caseId);
  const correlations = await dbHelpers.listCorrelations(caseId);
  const queueStatus = getQueueStatus();

  return {
    snapshotStatus: snapshot.status as "open" | "sealed",
    totalDocuments: activeDocs.length,
    readyDocuments,
    extractingDocuments,
    errorDocuments,
    // Granular extraction integrity
    uploadedCount,
    extractingCount,
    analyzingCount,
    retryingCount,
    autoRecoverableCount,
    manualReuploadCount,
    failedPermanentCount,
    // Downstream metrics
    totalClaims: stats.claims,
    totalCorrelations: correlations.length,
    correlationRunCompleted: correlations.length > 0,
    totalFindings: stats.findings,
    findingsRunCompleted: stats.findings > 0,
    activeWorkerJobs: queueStatus.processingCount > 0 ? 1 : 0,
    isQueueProcessing: queueStatus.processingCount > 0,
  };
}

/**
 * Compute the gate stage for a case/snapshot pair.
 */
export async function getGateStage(caseId: number, snapshotId: number): Promise<GateStageResult> {
  const input = await buildGateStageInput(caseId, snapshotId);
  return computeGateStage(input);
}

/**
 * Assert that a gated action is permitted for the given case.
 * Gathers DB state, computes gate stage, and runs assertAllowed.
 *
 * Converts GateError to TRPCError for consistent API error handling.
 */
/**
 * Actions that require extraction integrity to be complete before proceeding.
 * These are all downstream actions that depend on clean extraction state.
 */
const EXTRACTION_INTEGRITY_GATED_ACTIONS: GatedAction[] = [
  'runCorrelation',
  'runFindings',
  'sealSnapshot',
  'export',
  'runProvenanceDrilldown',
  'runPhase2Analysis',
];

export async function assertActionAllowed(
  caseId: number,
  snapshotId: number,
  action: GatedAction,
): Promise<GateStageResult> {
  const input = await buildGateStageInput(caseId, snapshotId);
  const result = computeGateStage(input);

  // T2a. Extraction integrity hard-reject for downstream actions.
  // If extraction integrity is incomplete and the action requires it,
  // throw GATE_EXTRACTION_INTEGRITY_INCOMPLETE before checking stage.
  if (!result.extractionIntegrity && EXTRACTION_INTEGRITY_GATED_ACTIONS.includes(action)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Action "${action}" rejected: extraction integrity incomplete. ` +
        `Resolve all extraction errors before proceeding. ` +
        `Stage: ${result.stages.EXTRACTION.reason}`,
      cause: {
        gateErrorCode: GATE_ERROR_CODES.EXTRACTION_INTEGRITY_INCOMPLETE,
        action,
        snapshotStatus: input.snapshotStatus,
        currentStage: result.currentStage,
        extractionIntegrity: false,
        extractionDetails: result.stages.EXTRACTION.reason,
      },
    });
  }

  try {
    assertAllowed(action, input.snapshotStatus, result.currentStage);
  } catch (err) {
    if (err instanceof GateError) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: err.message,
        cause: err.toAuditPayload(),
      });
    }
    throw err;
  }

  return result;
}

/**
 * Assert that a mutation is permitted on the given snapshot.
 * Wraps assertMutationAllowed with DB lookup and TRPCError conversion.
 */
export async function assertSnapshotMutationAllowed(
  snapshotId: number,
  action: string,
): Promise<void> {
  const snapshot = await dbHelpers.getSnapshot(snapshotId);
  if (!snapshot) return; // Non-existent snapshot — defensive allow

  if (snapshot.status === "sealed") {
    try {
      assertMutationAllowed("sealed", snapshotId, snapshot.version, action);
    } catch (err) {
      if (err instanceof GateError) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: err.message,
          cause: err.toAuditPayload(),
        });
      }
      throw err;
    }
  }
}
