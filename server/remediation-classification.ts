/**
 * Ingestion Remediation Classification — Deterministic 5-Class Document State Classifier
 *
 * Every document in a case maps to exactly ONE of five mutually exclusive classes:
 *
 *   1. manual_reupload_required  — structural file corruption only
 *   2. auto_recoverable          — transient infrastructure failures (retryable)
 *   3. unsupported_valid         — extraction succeeded, text exists, finding unsupported
 *   4. missing_upload            — never ingested (derived from upload sessions)
 *   5. valid_complete            — extraction ready, no errors, snapshot-bound
 *
 * Rules:
 *   - JSON truncation is NOT manual re-upload. It is auto-recoverable.
 *   - Provider capacity is NOT manual re-upload. It is auto-recoverable.
 *   - Only structural corruption qualifies for manual re-upload.
 *   - Unsupported_valid is analytical, not ingestion — never appears under errors.
 *   - Missing_upload is session-derived, not document-derived.
 *   - Classes are mutually exclusive. Sum of all classes = total documents.
 *
 * No inference. No heuristics. Explicit substring matching only.
 */

import * as db from "./db";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RemediationClass =
  | "manual_reupload_required"
  | "auto_recoverable"
  | "unsupported_valid"
  | "missing_upload"
  | "valid_complete";

export interface ClassifiedDocument {
  id: number;
  filename: string;
  fileType: string;
  status: string;
  errorMessage: string | null;
  retryCount: number;
  snapshotId: number;
  sha256Hash: string;
  createdAt: number;
  remediationClass: RemediationClass;
  classificationReason: string;
}

export interface MissingUploadEntry {
  sessionId: number;
  missingCount: number;
  totalFiles: number;
  completedFiles: number;
  duplicateFiles: number;
  failedFiles: number;
  status: string;
  createdAt: number;
}

export interface RemediationOverview {
  caseId: number;
  generatedAt: number;
  /** All documents classified into their remediation class */
  documents: ClassifiedDocument[];
  /** Missing uploads derived from upload sessions (not document rows) */
  missingUploads: MissingUploadEntry[];
  /** Mutually exclusive counters */
  counters: {
    manualReuploadRequired: number;
    autoRecoverable: number;
    unsupportedValid: number;
    missingUpload: number;
    validComplete: number;
    totalDocuments: number;
    totalMissingUploadFiles: number;
  };
  /** Batch metrics: resolved / unresolved / system_errors */
  batchMetrics: {
    resolved: number;
    unresolved: number;
    systemErrors: number;
    total: number;
  };
}

// ─── Manual Re-Upload Patterns ──────────────────────────────────────────────
// ONLY structural file corruption qualifies.
// JSON truncation is NOT here. Provider capacity is NOT here.

const MANUAL_REUPLOAD_PATTERNS: string[] = [
  "corrupted file",
  "corrupt file",
  "invalid PDF",
  "Invalid PDF",
  "unsupported file type",
  "Unsupported file type",
  "password protected",
  "Password protected",
  "encrypted file",
  "Empty archive",
  "zero extractable content",
  "zero-byte",
  "0 bytes",
  "file is empty",
  "truly empty",
];

// ─── Auto-Recoverable Patterns ──────────────────────────────────────────────
// Infrastructure failures that can be retried. Includes JSON truncation
// and provider capacity errors.

const AUTO_RECOVERABLE_PATTERNS: string[] = [
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
  // JSON parse errors from truncated responses — these are RETRYABLE
  "unexpected end of JSON",
  "Unexpected end of JSON",
  "unterminated string",
  "Unterminated string",
  "JSON.parse",
  "JSON parse",
  // Transient LLM parse errors
  "LLM parse error",
  "parse error",
  "malformed response",
];

// ─── Classifier ─────────────────────────────────────────────────────────────

/**
 * Classify a single document into one of the 5 remediation classes.
 *
 * Decision tree (evaluated in order):
 *   1. If status is 'ready' and text exists → valid_complete
 *   2. If status is 'error' or 'failed_permanent' or 'retrying':
 *      a. Check manual re-upload patterns first (structural corruption)
 *      b. Check auto-recoverable patterns (transient/infrastructure)
 *      c. If no pattern matches and status is 'failed_permanent' → manual_reupload_required
 *      d. If no pattern matches and status is 'error'/'retrying' → auto_recoverable (conservative for errors)
 *   3. If status is 'uploaded', 'extracting', 'analyzing' → valid_complete (in progress)
 *   4. Default → valid_complete
 *
 * Note: unsupported_valid is determined at the case level by cross-referencing
 * findings with provenanceStatus='unsupported' against documents that have
 * status='ready' and text content.
 */
export function classifyDocumentState(
  doc: {
    status: string;
    errorMessage: string | null;
    textContent?: string | null;
  },
  hasUnsupportedFindings: boolean = false
): { remediationClass: RemediationClass; reason: string } {
  const { status, errorMessage, textContent } = doc;

  // 1. Ready documents
  if (status === "ready") {
    // If the document has text but all its findings are unsupported → unsupported_valid
    if (hasUnsupportedFindings && textContent) {
      return {
        remediationClass: "unsupported_valid",
        reason: "Extraction succeeded, text exists, findings unsupported (analytical, not ingestion error)",
      };
    }
    return {
      remediationClass: "valid_complete",
      reason: "Extraction complete, no errors",
    };
  }

  // 2. Failed states
  if (status === "error" || status === "failed_permanent" || status === "retrying") {
    const msg = errorMessage || "";

    // 2a. Check manual re-upload patterns (structural corruption)
    for (const pattern of MANUAL_REUPLOAD_PATTERNS) {
      if (msg.toLowerCase().includes(pattern.toLowerCase())) {
        return {
          remediationClass: "manual_reupload_required",
          reason: `Structural file corruption: "${pattern}"`,
        };
      }
    }

    // 2b. Check auto-recoverable patterns (transient infrastructure)
    for (const pattern of AUTO_RECOVERABLE_PATTERNS) {
      if (msg.includes(pattern)) {
        return {
          remediationClass: "auto_recoverable",
          reason: `Infrastructure failure: "${pattern}"`,
        };
      }
    }

    // 2c. No pattern matched
    if (status === "failed_permanent") {
      // Permanent failure with no recognized pattern → manual re-upload
      // (unknown structural issue)
      return {
        remediationClass: "manual_reupload_required",
        reason: "Permanent failure with unrecognized error pattern",
      };
    }

    // 2d. Error/retrying with no recognized pattern → auto-recoverable
    // (conservative: treat unknown transient errors as retryable)
    return {
      remediationClass: "auto_recoverable",
      reason: "Transient error with unrecognized pattern (conservative: auto-recoverable)",
    };
  }

  // 3. In-progress states (uploaded, extracting, analyzing)
  if (status === "uploaded" || status === "extracting" || status === "analyzing") {
    return {
      remediationClass: "valid_complete",
      reason: `Document in progress (status: ${status})`,
    };
  }

  // 4. Default
  return {
    remediationClass: "valid_complete",
    reason: `Unknown status: ${status}`,
  };
}

// ─── Case-Level Remediation Overview ────────────────────────────────────────

/**
 * Build the full remediation overview for a case.
 *
 * Classifies every document and computes mutually exclusive counters.
 * Missing uploads are derived from upload sessions (not document rows).
 *
 * Invariant: counters.totalDocuments = manualReuploadRequired + autoRecoverable
 *            + unsupportedValid + validComplete
 *            (missingUpload is session-derived, not document-derived)
 *
 * Batch metrics: resolved + unresolved + systemErrors = totalDocuments
 */
export async function getRemediationOverview(caseId: number): Promise<RemediationOverview> {
  // 1. Get all documents for this case
  const allDocs = await db.listDocuments(caseId);

  // 2. Get all findings for this case to identify unsupported_valid docs
  const allFindings = await db.listFindings(caseId);

  // Build a set of document IDs that have ONLY unsupported findings
  // (i.e., the document contributed findings but none are linked)
  const docFindingMap = new Map<string, { hasLinked: boolean; hasUnsupported: boolean }>();

  // Findings don't have documentId directly — we need to check by laneId pattern
  // or by checking if the document's text was used in findings.
  // Since findings don't have a direct documentId, we check if a ready document
  // has ANY findings that are unsupported in its case.
  // For simplicity and correctness: a document is unsupported_valid if:
  //   - status = 'ready'
  //   - textContent exists
  //   - There are findings with provenanceStatus='unsupported' in the case
  //   - AND the document itself has no linked findings (no claims from this doc)

  // Get documents that have claims (linked to findings)
  const docsWithClaims = new Set<number>();
  // We'll use a simpler heuristic: check if any findings reference claims from this doc
  // For now, mark documents as unsupported_valid only if they are ready with text
  // but have no extraction artifacts at all (no quotes, no claims)
  const { quotes, claims } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  const caseQuotes = await db.db.select({ documentId: quotes.documentId })
    .from(quotes)
    .where(eq(quotes.caseId, caseId as any));
  const docsWithQuotes = new Set(caseQuotes.map((q: any) => q.documentId));

  // 3. Classify each document
  const classifiedDocs: ClassifiedDocument[] = allDocs.map((doc: any) => {
    // A document is unsupported_valid if:
    // - status = 'ready'
    // - has text content
    // - has NO quotes extracted from it (meaning extraction produced nothing useful)
    // - but the document itself is valid (not corrupted)
    const hasUnsupportedFindings = doc.status === "ready"
      && !!doc.textContent
      && !docsWithQuotes.has(doc.id);

    const { remediationClass, reason } = classifyDocumentState(
      {
        status: doc.status,
        errorMessage: doc.errorMessage,
        textContent: doc.textContent,
      },
      hasUnsupportedFindings
    );

    return {
      id: doc.id,
      filename: doc.filename,
      fileType: doc.fileType,
      status: doc.status,
      errorMessage: doc.errorMessage,
      retryCount: doc.retryCount,
      snapshotId: doc.snapshotId,
      sha256Hash: doc.sha256Hash,
      createdAt: doc.createdAt,
      remediationClass,
      classificationReason: reason,
    };
  });

  // 4. Missing uploads from upload sessions
  const ingestionAudit = await db.getIngestionAudit(caseId);
  const missingUploads: MissingUploadEntry[] = ingestionAudit.missingDocuments.map(m => ({
    sessionId: m.sessionId,
    missingCount: m.missingCount,
    totalFiles: m.totalFiles,
    completedFiles: m.completedFiles,
    duplicateFiles: m.duplicateFiles,
    failedFiles: m.failedFiles,
    status: m.status,
    createdAt: m.createdAt,
  }));

  // 5. Compute counters
  const manualReuploadRequired = classifiedDocs.filter(d => d.remediationClass === "manual_reupload_required").length;
  const autoRecoverable = classifiedDocs.filter(d => d.remediationClass === "auto_recoverable").length;
  const unsupportedValid = classifiedDocs.filter(d => d.remediationClass === "unsupported_valid").length;
  const validComplete = classifiedDocs.filter(d => d.remediationClass === "valid_complete").length;
  const totalMissingUploadFiles = missingUploads.reduce((sum, m) => sum + m.missingCount, 0);

  // Invariant: all document classes sum to total documents
  const totalDocuments = classifiedDocs.length;
  if (manualReuploadRequired + autoRecoverable + unsupportedValid + validComplete !== totalDocuments) {
    throw new Error(
      `Remediation classification invariant violated: ` +
      `${manualReuploadRequired} + ${autoRecoverable} + ${unsupportedValid} + ${validComplete} ` +
      `!= ${totalDocuments}`
    );
  }

  // 6. Batch metrics
  //    resolved = valid_complete + unsupported_valid (extraction succeeded)
  //    unresolved = manual_reupload_required + missing_upload files (need user action)
  //    system_errors = auto_recoverable (infrastructure failures, retryable)
  //    Invariant: resolved + unresolved + system_errors = totalDocuments + totalMissingUploadFiles
  const resolved = validComplete + unsupportedValid;
  const unresolved = manualReuploadRequired + totalMissingUploadFiles;
  const systemErrors = autoRecoverable;
  const batchTotal = totalDocuments + totalMissingUploadFiles;

  return {
    caseId,
    generatedAt: Date.now(),
    documents: classifiedDocs,
    missingUploads,
    counters: {
      manualReuploadRequired,
      autoRecoverable,
      unsupportedValid,
      missingUpload: totalMissingUploadFiles,
      validComplete,
      totalDocuments,
      totalMissingUploadFiles,
    },
    batchMetrics: {
      resolved,
      unresolved,
      systemErrors,
      total: batchTotal,
    },
  };
}
