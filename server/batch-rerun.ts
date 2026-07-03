/**
 * Batch Provenance Re-Run Processor
 * 
 * Sequential processing of all unsupported findings through the document-scoped
 * matching pipeline. No parallel execution. No cross-document widening.
 * Abortable mid-run. Partial completion remains valid.
 */
import * as db from "./db";
import { matchClaimsToFinding } from "./claim-backfill";

// ─── In-memory abort flag ───
const abortFlags = new Map<number, boolean>();

export function requestAbort(batchId: number) {
  abortFlags.set(batchId, true);
}

function isAborted(batchId: number): boolean {
  return abortFlags.get(batchId) === true;
}

function clearAbortFlag(batchId: number) {
  abortFlags.delete(batchId);
}

// ─── Active batch tracking ───
let activeBatchId: number | null = null;

export function getActiveBatchIdInMemory(): number | null {
  return activeBatchId;
}

/**
 * Start a batch re-run. Processes all unsupported findings sequentially.
 * Returns the batch run ID immediately; processing continues in background.
 */
export async function startBatchRerun(userId: number): Promise<{ batchId: number; totalFindings: number }> {
  // Expire any stale running batches (e.g. from crashes, sandbox hibernation)
  await db.expireStaleBatchRuns();

  // Check no batch is already running
  const existing = await db.getActiveBatchRun();
  if (existing) {
    throw new Error("A batch re-run is already in progress (ID: " + existing.id + ")");
  }

  // Fetch all eligible findings (unsupported, not synthesis, not rerun_error from a previous batch)
  const unsupported = await db.listUnsupportedFindings();
  // Filter to only unsupported (not unsupported_synthesis)
  const eligible = unsupported.filter(f => f.provenanceStatus === "unsupported" || f.provenanceStatus === "rerun_error");

  if (eligible.length === 0) {
    throw new Error("No unsupported findings to process");
  }

  // Sort by createdAt ASC (oldest first)
  eligible.sort((a, b) => a.createdAt - b.createdAt);

  // Create batch run record
  const batchId = await db.createBatchRun(userId, eligible.length);
  activeBatchId = batchId;

  // Process in background (non-blocking)
  processBatch(batchId, userId, eligible.map((f) => f.id)).catch(err => {
    console.error(`[BatchRerun] Fatal error in batch ${batchId}:`, err);
    db.updateBatchProgress(batchId, {}).then(() => {
      // Mark as error if not already completed/aborted
      db.getBatchRunById(batchId).then(run => {
        if (run && run.status === "running") {
          db.abortBatchRun(batchId);
        }
      });
    });
    activeBatchId = null;
    clearAbortFlag(batchId);
  });

  return { batchId, totalFindings: eligible.length };
}

/**
 * Resume a batch re-run from where it left off.
 */
export async function resumeBatchRerun(batchId: number, userId: number): Promise<{ totalRemaining: number }> {
  const run = await db.getBatchRunById(batchId);
  if (!run) throw new Error("Batch run not found");
  if (run.status !== "aborted" && run.status !== "error") {
    throw new Error("Can only resume aborted or errored batch runs");
  }

  // Get all unsupported findings, filter to those after lastProcessedFindingId
  const unsupported = await db.listUnsupportedFindings();
  const eligible = unsupported.filter(f => f.provenanceStatus === "unsupported" || f.provenanceStatus === "rerun_error");
  eligible.sort((a, b) => a.createdAt - b.createdAt);

  // Filter to only findings not yet processed (after lastProcessedFindingId)
  const remaining = run.lastProcessedFindingId
    ? eligible.filter((f) => f.id > run.lastProcessedFindingId!)
    : eligible;

  if (remaining.length === 0) {
    throw new Error("No remaining findings to process");
  }

  // Reset batch to running
  await db.updateBatchProgress(batchId, {});
  const { batchRerunRuns } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await db.db.update(batchRerunRuns).set({
    status: "running",
    totalFindings: run.processedCount + remaining.length,
  }).where(eq(batchRerunRuns.id, batchId));

  activeBatchId = batchId;

  // Process in background
  processBatch(batchId, userId, remaining.map((f) => f.id), run.processedCount, run.resolvedCount, run.errorCount, run.fallbackUsageCount).catch(err => {
    console.error(`[BatchRerun] Fatal error resuming batch ${batchId}:`, err);
    activeBatchId = null;
    clearAbortFlag(batchId);
  });

  return { totalRemaining: remaining.length };
}

/**
 * Sequential batch processor. Processes one finding at a time.
 */
async function processBatch(
  batchId: number,
  userId: number,
  findingIds: number[],
  startProcessed = 0,
  startResolved = 0,
  startErrors = 0,
  startFallbackUsage = 0,
) {
  let processedCount = startProcessed;
  let resolvedCount = startResolved;
  let errorCount = startErrors;
  let fallbackUsageCount = startFallbackUsage;

  console.log(`[BatchRerun] Starting batch ${batchId}: ${findingIds.length} findings to process`);

  for (const findingId of findingIds) {
    // Check abort flag before each finding
    if (isAborted(batchId)) {
      console.log(`[BatchRerun] Batch ${batchId} aborted after ${processedCount} findings`);
      await db.abortBatchRun(batchId);
      activeBatchId = null;
      clearAbortFlag(batchId);
      return;
    }

    const previousStatus = await processSingleFinding(batchId, findingId, userId);
    processedCount++;

    if (previousStatus === "resolved") {
      resolvedCount++;
    } else if (previousStatus === "error") {
      errorCount++;
    }

    // Check if fallback was triggered
    const detail = await db.getFindingMatchDetail(findingId);
    if (detail?.finding.fallbackTriggered) {
      fallbackUsageCount++;
    }

    // Update progress after each finding
    await db.updateBatchProgress(batchId, {
      processedCount,
      resolvedCount,
      errorCount,
      stillUnsupported: findingIds.length + startProcessed - processedCount - resolvedCount - errorCount + startResolved + startErrors,
      lastProcessedFindingId: findingId,
      fallbackUsageCount,
    });
  }

  // Batch complete
  console.log(`[BatchRerun] Batch ${batchId} completed: ${processedCount} processed, ${resolvedCount} resolved, ${errorCount} errors`);
  await db.completeBatchRun(batchId);
  activeBatchId = null;
  clearAbortFlag(batchId);
}

/**
 * Process a single finding through the document-scoped matching pipeline.
 * Returns "resolved" if newly linked, "error" if failed, "unsupported" if still unlinked.
 */
async function processSingleFinding(
  batchId: number,
  findingId: number,
  userId: number,
): Promise<"resolved" | "error" | "unsupported"> {
  let finding: { id: number; caseId: any; provenanceStatus: string | null; fallbackTriggered: boolean | null; [key: string]: any } | null = null;
  try {
    const detail = await db.getFindingMatchDetail(findingId);
    if (!detail) {
      console.warn(`[BatchRerun] Finding ${findingId} not found, skipping`);
      return "error";
    }

    finding = detail.finding;
    const previousStatus = finding.provenanceStatus;

    // Gather candidate claims for this finding (document-scoped)
    const candidateClaims = detail.candidateClaims.map((c: any) => ({
      id: c.id,
      claimText: c.claimText,
      claimType: c.claimType,
      documentId: c.documentId,
    }));

    // Run document-scoped matching
    const result = await matchClaimsToFinding(
      { id: finding.id, title: finding.title, description: finding.description, findingType: finding.findingType },
      candidateClaims,
    );

    // Determine outcome
    let newStatus: string;
    if (result.matchedIds.length > 0) {
      // Successfully linked
      await db.updateFindingClaimIds(findingId, result.matchedIds as unknown as number[]);
      newStatus = "linked";
    } else {
      // Still unsupported after re-run
      newStatus = "unsupported";
      await db.updateFindingMatchMetadata(findingId, {
        candidateClaimCount: candidateClaims.length,
        fallbackTriggered: false,
        matchMetadata: {
          batchRerunId: batchId,
          reRunAt: Date.now(),
          confidence: result.confidence,
        },
      });
    }

    // Write audit log
    await db.createProvenanceAuditLog({
      caseId: finding.caseId,
      userId,
      actionType: "batch_rerun",
      targetType: "finding",
      targetId: findingId,
      details: {
        previousStatus: previousStatus ?? "unknown",
        newStatus,
        batchId,
        candidateCount: candidateClaims.length,
        matchedCount: result.matchedIds.length,
        confidence: result.confidence,
      },
    });

    return newStatus === "linked" ? "resolved" : "unsupported";
  } catch (err) {
    console.error(`[BatchRerun] Error processing finding ${findingId}:`, err);

    // Mark finding as rerun_error
    try {
      const { findings: findingsTable } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.db.update(findingsTable).set({
        provenanceStatus: "rerun_error",
        matchMetadata: {
          batchRerunId: batchId,
          error: err instanceof Error ? err.message : String(err),
          errorAt: Date.now(),
        },
      }).where(eq(findingsTable.id, findingId));

      // Write error audit log only if we loaded the finding (have caseId)
      if (finding) {
        await db.createProvenanceAuditLog({
          caseId: finding.caseId,
          userId,
          actionType: "batch_rerun",
          targetType: "finding",
          targetId: findingId,
          details: {
            previousStatus: "unsupported",
            newStatus: "rerun_error",
            batchId,
            error: true,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    } catch (logErr) {
      console.error(`[BatchRerun] Failed to log error for finding ${findingId}:`, logErr);
    }

    return "error";
  }
}
