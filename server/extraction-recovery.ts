/**
 * Extraction Recovery Pipeline — Snapshot-Safe Retry Mechanism
 *
 * Provides deterministic failure classification, controlled reprocessing
 * with exponential backoff, snapshot immutability preservation, and
 * full audit trail logging.
 *
 * Core Principles:
 *  1. Sealed snapshots are never mutated.
 *  2. Recovery reprocessing produces a new snapshot.
 *  3. All retry actions are logged in the audit trail.
 *  4. Retryable vs non-retryable errors are deterministically classified.
 *  5. No duplicate document rows are created.
 *  6. No silent overwrites.
 */

import * as db from "./db";
import { ENGINE_VERSION } from "../shared/const";

// ─── Constants ───────────────────────────────────────────────────────────────

export const RECOVERY_MAX_RETRIES = 5;
export const RECOVERY_BASE_DELAY_MS = 2_000; // 2s base
export const RECOVERY_MAX_CONCURRENT = 5;

// ─── Step 1: Failure Classification ──────────────────────────────────────────

/**
 * Retryable error patterns — service-level transient failures.
 * Matched via explicit substring matching only. No heuristics.
 */
const RETRYABLE_PATTERNS: string[] = [
  // Service temporarily unavailable
  "service temporarily",
  "temporarily unavailable",
  "temporarily at capacity",
  "503",
  "502",
  "500",
  // Rate limiting
  "too many requests",
  "rate limit",
  "429",
  "Too Many Requests",
  // Usage exhaustion (transient — may be restored)
  "412",
  "usage exhausted",
  "Precondition Failed",
  // Network / timeout
  "network",
  "timeout",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "socket hang up",
  // JSON parse errors from truncated responses
  "unexpected end of JSON",
  "Unexpected end of JSON",
  "JSON.parse",
];

/**
 * Non-retryable error patterns — deterministic failures that will
 * produce the same result on every attempt.
 */
const NON_RETRYABLE_PATTERNS: string[] = [
  "No text could be extracted",
  "no text extracted",
  "unsupported file type",
  "Unsupported file type",
  "corrupted file",
  "Empty archive",
  "zero extractable content",
  "invalid PDF",
  "Invalid PDF",
  "password protected",
  "Password protected",
  "encrypted file",
];

/**
 * Deterministic failure classifier.
 * Returns 'retryable' or 'non_retryable' based on explicit string matching.
 * If the error matches a non-retryable pattern, it is non-retryable regardless
 * of any retryable pattern matches (non-retryable takes precedence).
 * If no pattern matches, defaults to 'non_retryable' (conservative).
 */
export function classifyExtractionFailure(
  errorMessage: string
): "retryable" | "non_retryable" {
  if (!errorMessage || errorMessage.trim().length === 0) {
    return "non_retryable";
  }

  // Non-retryable takes precedence
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (errorMessage.includes(pattern)) {
      return "non_retryable";
    }
  }

  // Check retryable patterns
  for (const pattern of RETRYABLE_PATTERNS) {
    if (errorMessage.includes(pattern)) {
      return "retryable";
    }
  }

  // Default: non-retryable (conservative — unknown errors don't auto-retry)
  return "non_retryable";
}

// ─── Step 2: Recovery Types ──────────────────────────────────────────────────

export interface RecoveryRequest {
  caseId: number;
  snapshotId: number;
  documentIds?: number[];
  retryOnly?: boolean; // default true — only retry retryable failures
}

export interface RecoveryDocumentResult {
  documentId: number;
  filename: string;
  previousStatus: string;
  previousError: string | null;
  classification: "retryable" | "non_retryable";
  action: "queued" | "skipped_non_retryable" | "skipped_max_retries" | "skipped_not_failed";
  newSnapshotId?: number;
}

export interface RecoveryResult {
  caseId: number;
  sourceSnapshotId: number;
  newSnapshotId: number | null;
  snapshotCreated: boolean;
  totalEligible: number;
  totalQueued: number;
  totalSkipped: number;
  documents: RecoveryDocumentResult[];
}

// ─── Step 2: Recovery Orchestrator ───────────────────────────────────────────

/**
 * Identify documents eligible for extraction recovery.
 * Eligible = status in ('error', 'failed_permanent', 'retrying') within the given snapshot.
 */
export async function identifyRecoverableDocuments(
  caseId: number,
  snapshotId: number,
  documentIds?: number[]
): Promise<Array<{
  id: number;
  filename: string;
  status: string;
  errorMessage: string | null;
  retryCount: number;
  snapshotId: number;
}>> {
  const allDocs = await db.listDocuments(caseId);
  const failedStatuses = ["error", "failed_permanent", "retrying"];

  return allDocs.filter((d) => {
    // Must be in the specified snapshot
    if (d.snapshotId !== snapshotId) return false;
    // Must be in a failed state
    if (!failedStatuses.includes(d.status)) return false;
    // If specific documentIds requested, filter to those
    if (documentIds && documentIds.length > 0) {
      if (!documentIds.includes(d.id)) return false;
    }
    return true;
  }).map((d) => ({
    id: d.id,
    filename: d.filename,
    status: d.status,
    errorMessage: d.errorMessage,
    retryCount: d.retryCount ?? 0,
    snapshotId: d.snapshotId,
  }));
}

/**
 * Execute extraction recovery for a case/snapshot.
 *
 * If the snapshot is sealed, a new snapshot is created and documents
 * are rebound to it before reprocessing. The old snapshot remains immutable.
 *
 * Documents are classified and only retryable failures are queued
 * (unless retryOnly=false, which queues all failed documents).
 *
 * Each retry attempt is logged in the audit trail.
 */
export async function executeExtractionRecovery(
  request: RecoveryRequest,
  userId: number
): Promise<RecoveryResult> {
  const { caseId, snapshotId, documentIds, retryOnly = true } = request;

  // 1. Validate snapshot exists
  const snapshot = await db.getSnapshot(snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }
  if (snapshot.caseId !== caseId) {
    throw new Error(`Snapshot ${snapshotId} does not belong to case ${caseId}`);
  }

  // 2. Identify recoverable documents
  const recoverableDocs = await identifyRecoverableDocuments(
    caseId,
    snapshotId,
    documentIds
  );

  // 3. If snapshot is sealed, create a new snapshot
  let newSnapshotId: number | null = null;
  let snapshotCreated = false;
  const isSealed = snapshot.status === "sealed";

  if (isSealed && recoverableDocs.length > 0) {
    // Gather ALL documents from the sealed snapshot (not just failed ones)
    const allSnapshotDocs = await db.listDocuments(caseId);
    const docsInSnapshot = allSnapshotDocs.filter(
      (d) => d.snapshotId === snapshotId
    );
    const docIds = docsInSnapshot.map((d) => d.id);
    const docHashes: Record<string, string> = {};
    for (const d of docsInSnapshot) {
      if (d.sha256Hash) docHashes[String(d.id)] = d.sha256Hash;
    }

    const newSnapshot = await db.createCorpusSnapshot({
      caseId,
      engineVersion: ENGINE_VERSION,
      documentIds: docIds,
      documentHashes: docHashes,
    });
    newSnapshotId = newSnapshot.id;
    snapshotCreated = true;

    // Rebind ALL documents from the sealed snapshot to the new one
    const { documents } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    for (const doc of docsInSnapshot) {
      await db.db
        .update(documents)
        .set({ snapshotId: newSnapshot.id })
        .where(eq(documents.id, doc.id));
    }

    // Log snapshot creation
    await db.logAudit({
      caseId,
      userId,
      action: "recovery_snapshot_created",
      targetType: "snapshot",
      targetId: newSnapshot.id,
      details: {
        sourceSnapshotId: snapshotId,
        sourceVersion: snapshot.version,
        newVersion: newSnapshot.version,
        documentCount: docIds.length,
        recoverableCount: recoverableDocs.length,
      },
    });
  }

  const targetSnapshotId = newSnapshotId ?? snapshotId;

  // 4. Classify and process each document
  const results: RecoveryDocumentResult[] = [];
  let totalQueued = 0;
  let totalSkipped = 0;

  for (const doc of recoverableDocs) {
    const classification = classifyExtractionFailure(doc.errorMessage || "");

    // Skip non-retryable if retryOnly mode
    if (retryOnly && classification === "non_retryable") {
      results.push({
        documentId: doc.id,
        filename: doc.filename,
        previousStatus: doc.status,
        previousError: doc.errorMessage,
        classification,
        action: "skipped_non_retryable",
      });
      totalSkipped++;
      continue;
    }

    // Skip if already at max recovery retries
    if (doc.retryCount >= RECOVERY_MAX_RETRIES) {
      results.push({
        documentId: doc.id,
        filename: doc.filename,
        previousStatus: doc.status,
        previousError: doc.errorMessage,
        classification,
        action: "skipped_max_retries",
      });
      totalSkipped++;
      continue;
    }

    // Queue for reprocessing
    // Reset status to 'uploaded' so the pipeline picks it up fresh
    await db.updateDocumentAnalysis(doc.id, {
      status: "uploaded",
      errorMessage: `Recovery queued (attempt ${doc.retryCount + 1}/${RECOVERY_MAX_RETRIES})`,
    });

    // Log audit trail entry for this retry attempt
    await db.logAudit({
      caseId,
      userId,
      action: "retry_extraction",
      targetType: "document",
      targetId: doc.id,
      details: {
        previousStatus: doc.status,
        previousError: doc.errorMessage,
        classification,
        retryAttempt: doc.retryCount + 1,
        maxRetries: RECOVERY_MAX_RETRIES,
        targetSnapshotId,
        snapshotCreated,
      },
    });

    results.push({
      documentId: doc.id,
      filename: doc.filename,
      previousStatus: doc.status,
      previousError: doc.errorMessage,
      classification,
      action: "queued",
      newSnapshotId: snapshotCreated ? newSnapshotId! : undefined,
    });
    totalQueued++;
  }

  // 5. Enqueue queued documents into the processing pipeline with backoff
  const queuedDocs = results.filter((r) => r.action === "queued");
  if (queuedDocs.length > 0) {
    // Dynamic import to avoid circular dependency
    const { enqueueDocument } = await import("./analysis-pipeline");

    // Stagger enqueue with exponential backoff per document
    for (let i = 0; i < queuedDocs.length; i++) {
      const doc = queuedDocs[i];
      const currentDoc = await db.getDocument(doc.documentId);
      const attempt = currentDoc?.retryCount ?? 0;
      const delayMs = Math.pow(2, attempt) * RECOVERY_BASE_DELAY_MS;

      // Stagger: each document gets an additional offset based on position
      // to respect concurrency cap
      const batchIndex = Math.floor(i / RECOVERY_MAX_CONCURRENT);
      const totalDelay = delayMs + batchIndex * RECOVERY_BASE_DELAY_MS;

      setTimeout(() => {
    // @ts-ignore
        enqueueDocument(doc.documentId, caseId);
      }, totalDelay);
    }
  }

  // 6. Log recovery summary
  await db.logAudit({
    caseId,
    userId,
    action: "extraction_recovery_completed",
    targetType: "case",
    targetId: caseId,
    details: {
      sourceSnapshotId: snapshotId,
      targetSnapshotId,
      snapshotCreated,
      totalEligible: recoverableDocs.length,
      totalQueued,
      totalSkipped,
      documentResults: results.map((r) => ({
        documentId: r.documentId,
        action: r.action,
        classification: r.classification,
      })),
    },
  });

  return {
    caseId,
    sourceSnapshotId: snapshotId,
    newSnapshotId,
    snapshotCreated,
    totalEligible: recoverableDocs.length,
    totalQueued,
    totalSkipped,
    documents: results,
  };
}

// ─── Utility: Compute Backoff Delay ──────────────────────────────────────────

/**
 * Compute exponential backoff delay for a given attempt number.
 * delay = 2^attempt * baseDelay
 * Capped at 60 seconds.
 */
export function computeBackoffDelay(attempt: number): number {
  const delay = Math.pow(2, attempt) * RECOVERY_BASE_DELAY_MS;
  return Math.min(delay, 60_000); // cap at 60s
}
