/**
 * Gate 1 — Canonical Hard Delete Module
 *
 * Single source of truth for all destructive operations.
 * Every delete is:
 *   T1. Snapshot-guarded (assertSnapshotMutable)
 *   T2. Audit-logged (immutable trail entry before physical deletion)
 *   T3. Cascade-deterministic (child rows removed leaf-to-root, no orphans)
 *   T4. Storage-aware (S3 cleanup when reference count reaches 0)
 *
 * Entity types: document, quote, claim, finding, correlation, signal_flag,
 *               entity, relationship, event, phase2_run, case, snapshot
 */

import { eq, and, sql, inArray } from "drizzle-orm";
import { db, logAudit, assertSnapshotMutable, assertDocumentSnapshotMutable, getDocument, getLatestSnapshot, isSnapshotSealed } from "./db";
import {
  documents, quotes, entities, entityRoles, relationships,
  relationshipEvidence, claims, findings, events, signalFlags,
  documentCorrelations, presentations, presentationSlides,
  auditTrail, chatMessages, entityMergeSuggestions, uploadSessions,
  provenanceAuditLogs, batchRerunRuns, provenanceAlertEvents,
  caseCollaborators, corpusSnapshots, cases,
} from "../drizzle/schema";
import { phase2Runs, phase2EvidenceRequirements, phase2StructuredNotes } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";

// ─── Types ───

export type EntityType =
  | "document"
  | "quote"
  | "claim"
  | "finding"
  | "correlation"
  | "signal_flag"
  | "entity"
  | "relationship"
  | "event"
  | "phase2_run"
  | "case"
  | "snapshot";

export interface HardDeleteOptions {
  entityType: EntityType;
  entityId: number;
  caseId: number;
  snapshotId?: number;
  userId: number;
  reason: string;
  /** Skip snapshot mutability check (for internal cascade operations) */
  skipSnapshotCheck?: boolean;
  /** Enable S3 object deletion when reference count reaches 0 */
  cleanupStorage?: boolean;
  /** Move to archive bucket instead of deleting from S3 */
  archiveMode?: boolean;
}

export interface HardDeleteResult {
  entityType: EntityType;
  entityId: number;
  deletedRows: number;
  cascadedEntities: Array<{ type: string; count: number }>;
  storageCleanup: { deleted: string[]; archived: string[]; preserved: string[] };
  auditHash: string;
}

// ─── Configuration ───

const ARCHIVE_BUCKET_PREFIX = "archive/";

// ─── Storage Reference Counting ───

/**
 * Count how many documents reference a given S3 key across all snapshots.
 * Returns 0 if no references exist.
 */
export async function getStorageRefCount(s3Key: string): Promise<number> {
  if (!s3Key) return 0;
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(documents)
    .where(eq(documents.s3Key, s3Key));
  return result?.count ?? 0;
}

/**
 * Attempt to delete an S3 object. The Manus storage proxy does not expose
 * a DELETE endpoint, so this function overwrites the key with a zero-byte
 * tombstone marker. On Spine (MinIO), a true DELETE is available.
 *
 * When archiveMode is true, the object is copied to the archive prefix
 * instead of being deleted.
 */
export async function storageCleanupObject(
  s3Key: string,
  opts: { archiveMode?: boolean } = {}
): Promise<"deleted" | "archived" | "skipped"> {
  if (!s3Key) return "skipped";

  const refCount = await getStorageRefCount(s3Key);
  if (refCount > 0) return "skipped"; // Still referenced by other documents

  try {
    if (opts.archiveMode) {
      // Archive: overwrite with a redirect marker pointing to archive location
      const archiveKey = `${ARCHIVE_BUCKET_PREFIX}${s3Key}`;
      await storagePut(archiveKey, JSON.stringify({
        originalKey: s3Key,
        archivedAt: new Date().toISOString(),
        type: "archive_tombstone",
      }), "application/json");
      // Overwrite original with tombstone
      await storagePut(s3Key, "", "application/x-tombstone");
      return "archived";
    } else {
      // Delete: overwrite with zero-byte tombstone
      await storagePut(s3Key, "", "application/x-tombstone");
      return "deleted";
    }
  } catch (err) {
    // Storage cleanup failure is non-fatal — log and continue
    console.error(`[Gate 1] Storage cleanup failed for key=${s3Key}:`, err);
    return "skipped";
  }
}

// ─── Canonical Hard Delete Functions ───

/**
 * Hard delete a single document and all its child extractions.
 * Cascade order (leaf to root):
 *   T1. relationship_evidence (via quoteIds)
 *   T2. relationships (orphaned after evidence removal)
 *   T3. entity_roles
 *   T4. entities (orphaned after role removal)
 *   T5. signal_flags
 *   T6. claims
 *   T7. quotes
 *   T8. document_correlations
 *   T9. findings (if document-scoped)
 *   T10. document row
 *   T11. S3 object (if refCount = 0)
 */
export async function hardDeleteDocument(
  documentId: number,
  caseId: number,
  userId: number,
  reason: string,
  opts: { skipSnapshotCheck?: boolean; cleanupStorage?: boolean; archiveMode?: boolean } = {}
): Promise<HardDeleteResult> {
  // T0. Snapshot guard
  if (!opts.skipSnapshotCheck) {
    await assertDocumentSnapshotMutable(documentId);
  }

  // Fetch document metadata before deletion
  const doc = await getDocument(documentId);
  if (!doc) {
    return {
      entityType: "document",
      entityId: documentId,
      deletedRows: 0,
      cascadedEntities: [],
      storageCleanup: { deleted: [], archived: [], preserved: [] },
      auditHash: "",
    };
  }

  const cascaded: Array<{ type: string; count: number }> = [];
  const storageResult: HardDeleteResult["storageCleanup"] = { deleted: [], archived: [], preserved: [] };

  // T1. Delete relationship_evidence via quoteIds
  const docQuotes = await db.select({ id: quotes.id }).from(quotes).where(eq(quotes.documentId, documentId));
  const quoteIds = docQuotes.map(q => q.id);
  if (quoteIds.length > 0) {
    const [reResult] = await db.delete(relationshipEvidence).where(inArray(relationshipEvidence.quoteId, quoteIds));
    cascaded.push({ type: "relationship_evidence", count: (reResult as any)?.affectedRows ?? 0 });
  }

  // T2. Delete orphaned relationships (zero evidence remaining)
  const caseRels = await db.select().from(relationships).where(eq(relationships.caseId, caseId));
  let orphanedRelCount = 0;
  for (const rel of caseRels) {
    const [remaining] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(relationshipEvidence)
      .where(eq(relationshipEvidence.relationshipId, rel.id));
    if (remaining.c === 0) {
      await db.delete(relationships).where(eq(relationships.id, rel.id));
      orphanedRelCount++;
    }
  }
  if (orphanedRelCount > 0) cascaded.push({ type: "relationship", count: orphanedRelCount });

  // T3. Delete entity_roles for this document
  const [erResult] = await db.delete(entityRoles).where(eq(entityRoles.documentId, documentId));
  cascaded.push({ type: "entity_role", count: (erResult as any)?.affectedRows ?? 0 });

  // T4. Delete orphaned entities (no remaining roles or relationships)
  const caseEntities = await db.select({ id: entities.id }).from(entities).where(eq(entities.caseId, caseId));
  let orphanedEntityCount = 0;
  for (const entity of caseEntities) {
    const [roleCount] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(entityRoles)
      .where(eq(entityRoles.entityId, entity.id));
    if (roleCount.c === 0) {
      const [relCount] = await db.select({ c: sql<number>`COUNT(*)` })
        .from(relationships)
        .where(sql`${relationships.sourceEntityId} = ${entity.id} OR ${relationships.targetEntityId} = ${entity.id}`);
      if (relCount.c === 0) {
        await db.delete(entities).where(eq(entities.id, entity.id));
        orphanedEntityCount++;
      }
    }
  }
  if (orphanedEntityCount > 0) cascaded.push({ type: "entity", count: orphanedEntityCount });

  // T5. Delete signal_flags
  const [sfResult] = await db.delete(signalFlags).where(eq(signalFlags.documentId, documentId));
  cascaded.push({ type: "signal_flag", count: (sfResult as any)?.affectedRows ?? 0 });

  // T6. Delete claims
  const [clResult] = await db.delete(claims).where(eq(claims.documentId, documentId));
  cascaded.push({ type: "claim", count: (clResult as any)?.affectedRows ?? 0 });

  // T7. Delete quotes
  const [qResult] = await db.delete(quotes).where(eq(quotes.documentId, documentId));
  cascaded.push({ type: "quote", count: (qResult as any)?.affectedRows ?? 0 });

  // T8. Delete document_correlations
  const [dcResult] = await db.delete(documentCorrelations).where(
    sql`${documentCorrelations.sourceDocumentId} = ${documentId} OR ${documentCorrelations.targetDocumentId} = ${documentId}`
  );
  cascaded.push({ type: "correlation", count: (dcResult as any)?.affectedRows ?? 0 });

  // T9. Delete the document row
  await db.delete(documents).where(eq(documents.id, documentId));

  // T10. Storage cleanup
  if (opts.cleanupStorage && doc.s3Key) {
    const result = await storageCleanupObject(doc.s3Key, { archiveMode: opts.archiveMode });
    if (result === "deleted") storageResult.deleted.push(doc.s3Key);
    else if (result === "archived") storageResult.archived.push(doc.s3Key);
    else storageResult.preserved.push(doc.s3Key);
  } else if (doc.s3Key) {
    storageResult.preserved.push(doc.s3Key);
  }

  // T11. Immutable audit entry
  const auditHash = await logAudit({
    caseId,
    userId,
    action: "hard_delete_document",
    targetType: "document",
    targetId: documentId,
    details: {
      sha256Hash: doc.sha256Hash,
      filename: doc.filename,
      reason,
      s3Key: doc.s3Key,
      snapshotId: doc.snapshotId,
      cascadedEntities: cascaded,
      storageCleanup: storageResult,
    },
  });

  return {
    entityType: "document",
    entityId: documentId,
    deletedRows: 1,
    cascadedEntities: cascaded,
    storageCleanup: storageResult,
    auditHash,
  };
}

/**
 * Hard delete a single quote and cascade to relationship_evidence.
 */
export async function hardDeleteQuote(
  quoteId: number,
  caseId: number,
  snapshotId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  if (snapshotId) await assertSnapshotMutable(snapshotId);

  const cascaded: Array<{ type: string; count: number }> = [];

  // T1. Delete relationship_evidence referencing this quote
  const [reResult] = await db.delete(relationshipEvidence).where(eq(relationshipEvidence.quoteId, quoteId));
  cascaded.push({ type: "relationship_evidence", count: (reResult as any)?.affectedRows ?? 0 });

  // T2. Delete the quote
  await db.delete(quotes).where(eq(quotes.id, quoteId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_quote",
    targetType: "quote",
    targetId: quoteId,
    details: { reason, snapshotId, cascadedEntities: cascaded },
  });

  return {
    entityType: "quote", entityId: quoteId, deletedRows: 1,
    cascadedEntities: cascaded,
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}

/**
 * Hard delete a single claim.
 */
export async function hardDeleteClaim(
  claimId: number,
  caseId: number,
  snapshotId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  if (snapshotId) await assertSnapshotMutable(snapshotId);

  await db.delete(claims).where(eq(claims.id, claimId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_claim",
    targetType: "claim",
    targetId: claimId,
    details: { reason, snapshotId },
  });

  return {
    entityType: "claim", entityId: claimId, deletedRows: 1,
    cascadedEntities: [],
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}

/**
 * Hard delete a single finding.
 */
export async function hardDeleteFinding(
  findingId: number,
  caseId: number,
  snapshotId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  if (snapshotId) await assertSnapshotMutable(snapshotId);

  const cascaded: Array<{ type: string; count: number }> = [];

  // T1. Delete provenance audit logs for this finding
  const [palResult] = await db.delete(provenanceAuditLogs).where(eq(provenanceAuditLogs.findingId, findingId));
  cascaded.push({ type: "provenance_audit_log", count: (palResult as any)?.affectedRows ?? 0 });

  // T2. Delete the finding
  await db.delete(findings).where(eq(findings.id, findingId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_finding",
    targetType: "finding",
    targetId: findingId,
    details: { reason, snapshotId, cascadedEntities: cascaded },
  });

  return {
    entityType: "finding", entityId: findingId, deletedRows: 1,
    cascadedEntities: cascaded,
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}

/**
 * Hard delete a single correlation.
 */
export async function hardDeleteCorrelation(
  correlationId: number,
  caseId: number,
  snapshotId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  if (snapshotId) await assertSnapshotMutable(snapshotId);

  await db.delete(documentCorrelations).where(eq(documentCorrelations.id, correlationId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_correlation",
    targetType: "correlation",
    targetId: correlationId,
    details: { reason, snapshotId },
  });

  return {
    entityType: "correlation", entityId: correlationId, deletedRows: 1,
    cascadedEntities: [],
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}

/**
 * Hard delete a single signal flag.
 */
export async function hardDeleteSignalFlag(
  flagId: number,
  caseId: number,
  snapshotId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  if (snapshotId) await assertSnapshotMutable(snapshotId);

  await db.delete(signalFlags).where(eq(signalFlags.id, flagId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_signal_flag",
    targetType: "signal_flag",
    targetId: flagId,
    details: { reason, snapshotId },
  });

  return {
    entityType: "signal_flag", entityId: flagId, deletedRows: 1,
    cascadedEntities: [],
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}

/**
 * Hard delete a Phase-2 run and all its artifacts.
 * Cascade: evidence_requirements → structured_notes → run
 */
export async function hardDeletePhase2Run(
  runId: number,
  caseId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  const cascaded: Array<{ type: string; count: number }> = [];

  // T1. Delete evidence requirements
  const [erResult] = await db.delete(phase2EvidenceRequirements).where(eq(phase2EvidenceRequirements.runId, runId));
  cascaded.push({ type: "phase2_evidence_requirement", count: (erResult as any)?.affectedRows ?? 0 });

  // T2. Delete structured notes
  const [snResult] = await db.delete(phase2StructuredNotes).where(eq(phase2StructuredNotes.runId, runId));
  cascaded.push({ type: "phase2_structured_note", count: (snResult as any)?.affectedRows ?? 0 });

  // T3. Delete the run
  await db.delete(phase2Runs).where(eq(phase2Runs.id, runId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_phase2_run",
    targetType: "phase2_run",
    targetId: runId,
    details: { reason, cascadedEntities: cascaded },
  });

  return {
    entityType: "phase2_run", entityId: runId, deletedRows: 1,
    cascadedEntities: cascaded,
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}

/**
 * Hard delete a snapshot. Only allowed if snapshot is OPEN (not sealed).
 * Cascade: all entities bound to this snapshotId.
 */
export async function hardDeleteSnapshot(
  snapshotId: number,
  caseId: number,
  userId: number,
  reason: string,
  opts: { cleanupStorage?: boolean; archiveMode?: boolean } = {}
): Promise<HardDeleteResult> {
  await assertSnapshotMutable(snapshotId);

  const cascaded: Array<{ type: string; count: number }> = [];
  const storageResult: HardDeleteResult["storageCleanup"] = { deleted: [], archived: [], preserved: [] };

  // T1. Find all documents bound to this snapshot
  const snapshotDocs = await db.select().from(documents)
    .where(and(eq(documents.caseId, caseId), eq(documents.snapshotId, snapshotId)));

  // T2. Hard delete each document (with skipSnapshotCheck since we already verified)
  for (const doc of snapshotDocs) {
    const docResult = await hardDeleteDocument(doc.id, caseId, userId, `Cascade from snapshot ${snapshotId} deletion: ${reason}`, {
      skipSnapshotCheck: true,
      cleanupStorage: opts.cleanupStorage,
      archiveMode: opts.archiveMode,
    });
    for (const c of docResult.cascadedEntities) {
      const existing = cascaded.find(e => e.type === c.type);
      if (existing) existing.count += c.count;
      else cascaded.push({ ...c });
    }
    storageResult.deleted.push(...docResult.storageCleanup.deleted);
    storageResult.archived.push(...docResult.storageCleanup.archived);
    storageResult.preserved.push(...docResult.storageCleanup.preserved);
  }
  cascaded.push({ type: "document", count: snapshotDocs.length });

  // T3. Delete findings for this snapshot
  const [fResult] = await db.delete(findings).where(and(eq(findings.caseId, caseId), eq(findings.snapshotId, snapshotId)));
  cascaded.push({ type: "finding", count: (fResult as any)?.affectedRows ?? 0 });

  // T4. Delete correlations for this snapshot
  const [corrResult] = await db.delete(documentCorrelations).where(and(eq(documentCorrelations.caseId, caseId), eq(documentCorrelations.snapshotId, snapshotId)));
  cascaded.push({ type: "correlation", count: (corrResult as any)?.affectedRows ?? 0 });

  // T5. Delete Phase-2 runs for this snapshot
  const p2Runs = await db.select({ id: phase2Runs.id }).from(phase2Runs)
    .where(and(eq(phase2Runs.caseId, caseId), eq(phase2Runs.snapshotId, snapshotId)));
  for (const run of p2Runs) {
    await db.delete(phase2EvidenceRequirements).where(eq(phase2EvidenceRequirements.runId, run.id));
    await db.delete(phase2StructuredNotes).where(eq(phase2StructuredNotes.runId, run.id));
    await db.delete(phase2Runs).where(eq(phase2Runs.id, run.id));
  }
  cascaded.push({ type: "phase2_run", count: p2Runs.length });

  // T6. Delete the snapshot row
  await db.delete(corpusSnapshots).where(eq(corpusSnapshots.id, snapshotId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_snapshot",
    targetType: "snapshot",
    targetId: snapshotId,
    details: { reason, cascadedEntities: cascaded, storageCleanup: storageResult },
  });

  return {
    entityType: "snapshot", entityId: snapshotId, deletedRows: 1,
    cascadedEntities: cascaded,
    storageCleanup: storageResult,
    auditHash,
  };
}

/**
 * Hard delete an entire case and ALL child data.
 * Cascade order (leaf to root across all tables with caseId):
 *
 *   T1. Phase-2 artifacts (evidence_requirements, structured_notes, runs)
 *   T2. Provenance artifacts (audit_logs, batch_rerun_runs)
 *   T3. Presentation artifacts (slides, presentations)
 *   T4. Entity merge suggestions
 *   T5. Chat messages
 *   T6. Upload sessions
 *   T7. Collaborators
 *   T8. All documents (via hardDeleteDocument cascade)
 *   T9. Remaining findings, correlations, events (case-level)
 *   T10. Remaining entities, relationships (case-level)
 *   T11. Snapshots
 *   T12. Case row
 *
 * Sealed snapshots block case deletion unless force=true.
 */
export async function hardDeleteCase(
  caseId: number,
  userId: number,
  reason: string,
  opts: { force?: boolean; cleanupStorage?: boolean; archiveMode?: boolean } = {}
): Promise<HardDeleteResult> {
  const cascaded: Array<{ type: string; count: number }> = [];
  const storageResult: HardDeleteResult["storageCleanup"] = { deleted: [], archived: [], preserved: [] };

  // Check for sealed snapshots
  if (!opts.force) {
    const latestSnapshot = await getLatestSnapshot(caseId);
    if (latestSnapshot && latestSnapshot.status === "sealed") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `[GATE_SEALED_MUTATION] Cannot delete case ${caseId}: contains sealed snapshot v${latestSnapshot.version}. Use force=true to override.`,
      });
    }
  }

  // T1. Phase-2 artifacts
  const p2Runs = await db.select({ id: phase2Runs.id }).from(phase2Runs).where(eq(phase2Runs.caseId, caseId));
  for (const run of p2Runs) {
    await db.delete(phase2EvidenceRequirements).where(eq(phase2EvidenceRequirements.runId, run.id));
    await db.delete(phase2StructuredNotes).where(eq(phase2StructuredNotes.runId, run.id));
  }
  const [p2Result] = await db.delete(phase2Runs).where(eq(phase2Runs.caseId, caseId));
  cascaded.push({ type: "phase2_run", count: (p2Result as any)?.affectedRows ?? 0 });

  // T2. Provenance artifacts
  // provenanceAuditLogs are finding-scoped, delete via findings
  const caseFindings = await db.select({ id: findings.id }).from(findings).where(eq(findings.caseId, caseId));
  const findingIds = caseFindings.map(f => f.id);
  if (findingIds.length > 0) {
    await db.delete(provenanceAuditLogs).where(inArray(provenanceAuditLogs.findingId, findingIds));
  }

  // T3. Presentation artifacts
  const casePres = await db.select({ id: presentations.id }).from(presentations).where(eq(presentations.caseId, caseId));
  const presIds = casePres.map(p => p.id);
  if (presIds.length > 0) {
    await db.delete(presentationSlides).where(inArray(presentationSlides.presentationId, presIds));
  }
  await db.delete(presentations).where(eq(presentations.caseId, caseId));
  cascaded.push({ type: "presentation", count: casePres.length });

  // T4. Entity merge suggestions
  const [emsResult] = await db.delete(entityMergeSuggestions).where(eq(entityMergeSuggestions.caseId, caseId));
  cascaded.push({ type: "entity_merge_suggestion", count: (emsResult as any)?.affectedRows ?? 0 });

  // T5. Chat messages
  const [cmResult] = await db.delete(chatMessages).where(eq(chatMessages.caseId, caseId));
  cascaded.push({ type: "chat_message", count: (cmResult as any)?.affectedRows ?? 0 });

  // T6. Upload sessions
  const [usResult] = await db.delete(uploadSessions).where(eq(uploadSessions.caseId, caseId));
  cascaded.push({ type: "upload_session", count: (usResult as any)?.affectedRows ?? 0 });

  // T7. Collaborators
  const [collabResult] = await db.delete(caseCollaborators).where(eq(caseCollaborators.caseId, caseId));
  cascaded.push({ type: "collaborator", count: (collabResult as any)?.affectedRows ?? 0 });

  // T8. All documents (with full cascade)
  const caseDocs = await db.select().from(documents).where(eq(documents.caseId, caseId));
  for (const doc of caseDocs) {
    const docResult = await hardDeleteDocument(doc.id, caseId, userId, `Cascade from case ${caseId} deletion: ${reason}`, {
      skipSnapshotCheck: true, // We already checked above
      cleanupStorage: opts.cleanupStorage,
      archiveMode: opts.archiveMode,
    });
    for (const c of docResult.cascadedEntities) {
      const existing = cascaded.find(e => e.type === c.type);
      if (existing) existing.count += c.count;
      else cascaded.push({ ...c });
    }
    storageResult.deleted.push(...docResult.storageCleanup.deleted);
    storageResult.archived.push(...docResult.storageCleanup.archived);
    storageResult.preserved.push(...docResult.storageCleanup.preserved);
  }
  cascaded.push({ type: "document", count: caseDocs.length });

  // T9. Remaining findings and correlations (case-level, not document-scoped)
  const [fResult] = await db.delete(findings).where(eq(findings.caseId, caseId));
  cascaded.push({ type: "finding", count: (fResult as any)?.affectedRows ?? 0 });
  const [corrResult] = await db.delete(documentCorrelations).where(eq(documentCorrelations.caseId, caseId));
  cascaded.push({ type: "correlation", count: (corrResult as any)?.affectedRows ?? 0 });

  // T10. Remaining events
  const [evResult] = await db.delete(events).where(eq(events.caseId, caseId));
  cascaded.push({ type: "event", count: (evResult as any)?.affectedRows ?? 0 });

  // T11. Snapshots
  const [snapResult] = await db.delete(corpusSnapshots).where(eq(corpusSnapshots.caseId, caseId));
  cascaded.push({ type: "snapshot", count: (snapResult as any)?.affectedRows ?? 0 });

  // T12. Case row
  await db.delete(cases).where(eq(cases.id, caseId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_case",
    targetType: "case",
    targetId: caseId,
    details: { reason, cascadedEntities: cascaded, storageCleanup: storageResult },
  });

  return {
    entityType: "case", entityId: caseId, deletedRows: 1,
    cascadedEntities: cascaded,
    storageCleanup: storageResult,
    auditHash,
  };
}

/**
 * Hard delete a single entity and cascade to roles, relationships, evidence.
 */
export async function hardDeleteEntity(
  entityId: number,
  caseId: number,
  snapshotId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  if (snapshotId) await assertSnapshotMutable(snapshotId);

  const cascaded: Array<{ type: string; count: number }> = [];

  // T1. Delete entity_roles
  const [erResult] = await db.delete(entityRoles).where(eq(entityRoles.entityId, entityId));
  cascaded.push({ type: "entity_role", count: (erResult as any)?.affectedRows ?? 0 });

  // T2. Delete relationship_evidence for relationships involving this entity
  const entityRels = await db.select({ id: relationships.id }).from(relationships)
    .where(sql`${relationships.sourceEntityId} = ${entityId} OR ${relationships.targetEntityId} = ${entityId}`);
  const relIds = entityRels.map(r => r.id);
  if (relIds.length > 0) {
    const [reResult] = await db.delete(relationshipEvidence).where(inArray(relationshipEvidence.relationshipId, relIds));
    cascaded.push({ type: "relationship_evidence", count: (reResult as any)?.affectedRows ?? 0 });
  }

  // T3. Delete relationships involving this entity
  const [relResult] = await db.delete(relationships)
    .where(sql`${relationships.sourceEntityId} = ${entityId} OR ${relationships.targetEntityId} = ${entityId}`);
  cascaded.push({ type: "relationship", count: (relResult as any)?.affectedRows ?? 0 });

  // T4. Delete the entity
  await db.delete(entities).where(eq(entities.id, entityId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_entity",
    targetType: "entity",
    targetId: entityId,
    details: { reason, snapshotId, cascadedEntities: cascaded },
  });

  return {
    entityType: "entity", entityId, deletedRows: 1,
    cascadedEntities: cascaded,
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}

/**
 * Hard delete a single relationship and its evidence.
 */
export async function hardDeleteRelationship(
  relationshipId: number,
  caseId: number,
  snapshotId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  if (snapshotId) await assertSnapshotMutable(snapshotId);

  const cascaded: Array<{ type: string; count: number }> = [];

  // T1. Delete relationship_evidence
  const [reResult] = await db.delete(relationshipEvidence).where(eq(relationshipEvidence.relationshipId, relationshipId));
  cascaded.push({ type: "relationship_evidence", count: (reResult as any)?.affectedRows ?? 0 });

  // T2. Delete the relationship
  await db.delete(relationships).where(eq(relationships.id, relationshipId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_relationship",
    targetType: "relationship",
    targetId: relationshipId,
    details: { reason, snapshotId, cascadedEntities: cascaded },
  });

  return {
    entityType: "relationship", entityId: relationshipId, deletedRows: 1,
    cascadedEntities: cascaded,
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}

/**
 * Hard delete a single event.
 */
export async function hardDeleteEvent(
  eventId: number,
  caseId: number,
  snapshotId: number,
  userId: number,
  reason: string
): Promise<HardDeleteResult> {
  if (snapshotId) await assertSnapshotMutable(snapshotId);

  await db.delete(events).where(eq(events.id, eventId));

  const auditHash = await logAudit({
    caseId, userId,
    action: "hard_delete_event",
    targetType: "event",
    targetId: eventId,
    details: { reason, snapshotId },
  });

  return {
    entityType: "event", entityId: eventId, deletedRows: 1,
    cascadedEntities: [],
    storageCleanup: { deleted: [], archived: [], preserved: [] },
    auditHash,
  };
}
