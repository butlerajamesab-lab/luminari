/**
 * Batch Provenance Re-Run Processor
 *
 * Sequential processing of all unsupported findings through the deterministic
 * claim-matching pipeline. No parallel execution. Abortable mid-run. Partial
 * completion remains valid and every terminal state is persisted explicitly.
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

  // Fetch all eligible findings. Valid synthesis records are intentionally not
  // part of the re-run queue; rerun_error remains eligible for recovery.
  const unsupported = await db.listUnsupportedFindings();
  const eligible = unsupported.filter(f =>
    f.provenanceStatus === "unsupported" || f.provenanceStatus === "rerun_error"
  );

  if (eligible.length === 0) {
    throw new Error("No unsupported findings to process");
  }

  // Sort by createdAt ASC (oldest first)
  eligible.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);

  // Create batch run record
  const batchId = await db.createBatchRun(userId, eligible.length);
  activeBatchId = batchId;

  // Process in background (non-blocking)
  processBatch(batchId, userId, eligible.map((f) => f.id)).catch(async err => {
    console.error(`[BatchRerun] Fatal error in batch ${batchId}:`, err);
    try {
      await db.failBatchRun(batchId);
    } catch (statusErr) {
      console.error(`[BatchRerun] Failed to persist fatal state for batch ${batchId}:`, statusErr);
    }
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

  const unsupported = await db.listUnsupportedFindings();
  const eligible = unsupported.filter(f =>
    f.provenanceStatus === "unsupported" || f.provenanceStatus === "rerun_error"
  );
  eligible.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);

  // Preserve the historical continuation rule: records with a sequence ID at or
  // below the last processed ID are not replayed in the same batch record.
  const remaining = run.lastProcessedFindingId
    ? eligible.filter((f) => f.id > run.lastProcessedFindingId!)
    : eligible;

  if (remaining.length === 0) {
    throw new Error("No remaining findings to process");
  }

  const resumedTotal = run.processedCount + remaining.length;
  await db.resumeBatchRun(batchId, resumedTotal);
  activeBatchId = batchId;

  // Process in background
  processBatch(
    batchId,
    userId,
    remaining.map((f) => f.id),
    run.processedCount,
    run.resolvedCount,
    run.errorCount,
    run.fallbackUsageCount,
  ).catch(async err => {
    console.error(`[BatchRerun] Fatal error resuming batch ${batchId}:`, err);
    try {
      await db.failBatchRun(batchId);
    } catch (statusErr) {
      console.error(`[BatchRerun] Failed to persist fatal resume state for batch ${batchId}:`, statusErr);
    }
    activeBatchId = null;
    clearAbortFlag(batchId);
  });

  return { totalRemaining: remaining.length };
}

async function runCompletedBatchAlertCheck(batchId: number) {
  try {
    // Dynamic import keeps notification governance outside the batch processor's
    // module-initialization path while making the documented post-pipeline hook
    // automatic for every successfully completed batch.
    const { checkProvenanceThresholds } = await import("./provenance-alerting");
    const result = await checkProvenanceThresholds(undefined, batchId);
    console.log(`[BatchRerun] Post-batch provenance threshold check ${batchId}: ${result.alerts.length} alert(s)`);
  } catch (err) {
    // Alert persistence/notification failure must never rewrite an already
    // completed deterministic batch into an error or aborted state.
    console.error(`[BatchRerun] Post-batch provenance threshold check failed for ${batchId}:`, err);
  }
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
  const totalFindings = startProcessed + findingIds.length;

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

    const outcome = await processSingleFinding(batchId, findingId, userId);
    processedCount++;

    if (outcome === "resolved") {
      resolvedCount++;
    } else if (outcome === "error") {
      errorCount++;
    }

    // Check if fallback was triggered from the now-persisted finding state.
    const detail = await db.getFindingMatchDetail(findingId);
    if (detail?.finding.fallbackTriggered) {
      fallbackUsageCount++;
    }

    // Every not-resolved/non-error item remains unsupported, whether it has
    // already been processed or is still waiting in this batch.
    const stillUnsupported = Math.max(totalFindings - resolvedCount - errorCount, 0);

    // Update progress after each finding
    await db.updateBatchProgress(batchId, {
      processedCount,
      resolvedCount,
      errorCount,
      stillUnsupported,
      lastProcessedFindingId: findingId,
      fallbackUsageCount,
    });
  }

  // Batch complete
  console.log(`[BatchRerun] Batch ${batchId} completed: ${processedCount} processed, ${resolvedCount} resolved, ${errorCount} errors`);
  await db.completeBatchRun(batchId);
  activeBatchId = null;
  clearAbortFlag(batchId);
  await runCompletedBatchAlertCheck(batchId);
}

/**
 * Process a single finding through the deterministic case-scoped matching
 * pipeline. Returns "resolved" if newly linked, "error" if processing failed,
 * and "unsupported" if it remains unlinked.
 */
async function processSingleFinding(
  batchId: number,
  findingId: number,
  userId: number,
): Promise<"resolved" | "error" | "unsupported"> {
  let finding: { id: number; caseId: number; provenanceStatus: string; fallbackTriggered: boolean; [key: string]: any } | null = null;
  try {
    const detail = await db.getFindingMatchDetail(findingId);
    if (!detail) {
      console.warn(`[BatchRerun] Finding ${findingId} not found, skipping`);
      return "error";
    }

    finding = detail.finding;
    const previousStatus = finding.provenanceStatus;

    // Candidate claims remain bounded to the same case as the finding. Their
    // source document IDs stay attached so the matcher can use exact document
    // references when they are present in the finding text.
    const candidateClaims = detail.candidateClaims.map((c: any) => ({
      id: String(c.id),
      claimText: c.claimText,
      claimType: c.claimType,
      documentId: c.documentId === null || c.documentId === undefined ? null : String(c.documentId),
    }));

    const result = await matchClaimsToFinding(
      {
        id: finding.id,
        title: finding.title,
        description: finding.description,
        findingType: finding.findingType,
      },
      candidateClaims,
    );

    let newStatus: "linked" | "unsupported";
    if (result.matchedIds.length > 0) {
      const matchedClaimIds = result.matchedIds.map(value => Number(value));
      if (matchedClaimIds.some(value => !Number.isSafeInteger(value) || value <= 0)) {
        throw new Error(`invalid_matched_claim_id:${result.matchedIds.join(",")}`);
      }
      await db.updateFindingClaimIds(findingId, matchedClaimIds);
      newStatus = "linked";
    } else {
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
    const message = err instanceof Error ? err.message : String(err);

    try {
      await db.markFindingRerunError(findingId, batchId, message);

      // Write error audit log only if we loaded the finding (have caseId)
      if (finding) {
        await db.createProvenanceAuditLog({
          caseId: finding.caseId,
          userId,
          actionType: "batch_rerun",
          targetType: "finding",
          targetId: findingId,
          details: {
            previousStatus: finding.provenanceStatus ?? "unsupported",
            newStatus: "rerun_error",
            batchId,
            error: true,
            message,
          },
        });
      }
    } catch (logErr) {
      console.error(`[BatchRerun] Failed to persist/log error for finding ${findingId}:`, logErr);
    }

    return "error";
  }
}
