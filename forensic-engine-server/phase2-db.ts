/**
 * Phase-2 Read-Only Projection Layer — Database Helpers
 *
 * Structural invariants:
 * 1. Phase-2 NEVER mutates Phase-1 tables (quotes, entities, claims, findings, events, etc.)
 * 2. Phase-2 ONLY accepts sealed snapshots (status = 'sealed')
 * 3. Phase-2 enforces cross-case isolation (snapshot.caseId must match run.caseId)
 * 4. Phase-2 enforces tenant isolation (user must own or collaborate on the case)
 * 5. Phase-2 reads extraction outputs in read-only mode via snapshotId
 *
 * Data flow:
 * T1. User requests Phase-2 run for a sealed snapshot
 * T2. System verifies: snapshot sealed, case ownership, case-snapshot binding
 * T3. System creates phase2_run record
 * T4. System reads Phase-1 extraction data (read-only) via snapshotId
 * T5. System writes derived artifacts to phase2_evidence_requirements / phase2_structured_notes
 * T6. System marks run complete
 */

import { db } from "./db";
import * as dbHelpers from "./db";
import {
  phase2Runs, phase2EvidenceRequirements, phase2StructuredNotes,
  corpusSnapshots, documents, quotes, entities, claims, findings, events,
  signalFlags, documentCorrelations, relationships,
  type Phase2Run, type Phase2EvidenceRequirement, type Phase2StructuredNote,
} from "../drizzle/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ENGINE_VERSION } from "../shared/const";

// ─── Snapshot Enforcement ───

/**
 * Verify that a snapshot is sealed and belongs to the specified case.
 * Rejects open snapshots and cross-case access.
 */
export async function verifySealedSnapshot(snapshotId: number, caseId: number): Promise<void> {
  const snapshot = await dbHelpers.getSnapshot(snapshotId);
  if (!snapshot) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Snapshot ${snapshotId} not found.`,
    });
  }
  if (snapshot.status !== "sealed") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Snapshot ${snapshotId} is not sealed (status: ${snapshot.status}). Phase-2 requires a sealed snapshot.`,
    });
  }
  if (snapshot.caseId !== caseId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Snapshot ${snapshotId} does not belong to case ${caseId}. Cross-case access denied.`,
    });
  }
}

/**
 * Verify tenant isolation: user must own or have collaborator access to the case.
 */
export async function verifyTenantAccess(caseId: number, userId: number): Promise<void> {
  // verifyCaseOwnership throws NOT_FOUND or FORBIDDEN if access is denied
  await dbHelpers.verifyCaseOwnership(caseId, userId);
}

// ─── Phase-2 Run Management ───

/**
 * Create a Phase-2 run. Enforces:
 * - Snapshot must be sealed
 * - Snapshot must belong to the specified case
 * - User must have access to the case
 */
export async function createPhase2Run(
  caseId: number,
  snapshotId: number,
  userId: number,
): Promise<Phase2Run> {
  // T2. Verify all preconditions
  await verifyTenantAccess(caseId, userId);
  await verifySealedSnapshot(snapshotId, caseId);

  const now = Date.now();
  const [result] = await db.insert(phase2Runs).values({
    caseId,
    snapshotId,
    engineVersionReference: ENGINE_VERSION,
    status: "open",
    createdAt: now,
  });

  const id = result.insertId;
  const [run] = await db.select().from(phase2Runs).where(eq(phase2Runs.id, id));
  return run;
}

/**
 * Get a Phase-2 run by ID.
 */
export async function getPhase2Run(runId: number): Promise<Phase2Run | null> {
  const [row] = await db.select().from(phase2Runs).where(eq(phase2Runs.id, runId));
  return row ?? null;
}

/**
 * List Phase-2 runs for a case.
 */
export async function listPhase2Runs(caseId: number): Promise<Phase2Run[]> {
  return db.select().from(phase2Runs)
    .where(eq(phase2Runs.caseId, caseId))
    .orderBy(desc(phase2Runs.createdAt));
}

/**
 * List Phase-2 runs for a specific snapshot.
 */
export async function listPhase2RunsBySnapshot(snapshotId: number): Promise<Phase2Run[]> {
  return db.select().from(phase2Runs)
    .where(eq(phase2Runs.snapshotId, snapshotId))
    .orderBy(desc(phase2Runs.createdAt));
}

/**
 * Mark a Phase-2 run as complete.
 */
export async function completePhase2Run(runId: number): Promise<void> {
  const run = await getPhase2Run(runId);
  if (!run) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Phase-2 run ${runId} not found.` });
  }
  if (run.status !== "open") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Phase-2 run ${runId} is already ${run.status}. Only open runs can be completed.`,
    });
  }
  await db.update(phase2Runs).set({ status: "complete" }).where(eq(phase2Runs.id, runId));
}

/**
 * Mark a Phase-2 run as error.
 */
export async function errorPhase2Run(runId: number): Promise<void> {
  await db.update(phase2Runs).set({ status: "error" }).where(eq(phase2Runs.id, runId));
}

// ─── Phase-2 Derived Artifacts ───

/**
 * Create a Phase-2 evidence requirement record.
 * The run must be open and the snapshotId must match the run's snapshotId.
 */
export async function createEvidenceRequirement(
  runId: number,
  payload: Record<string, unknown>,
): Promise<Phase2EvidenceRequirement> {
  const run = await getPhase2Run(runId);
  if (!run) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Phase-2 run ${runId} not found.` });
  }
  if (run.status !== "open") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Phase-2 run ${runId} is ${run.status}. Artifacts can only be added to open runs.`,
    });
  }

  const now = Date.now();
  const [result] = await db.insert(phase2EvidenceRequirements).values({
    runId,
    snapshotId: run.snapshotId,
    payload,
    createdAt: now,
  });

  const id = result.insertId;
  const [row] = await db.select().from(phase2EvidenceRequirements).where(eq(phase2EvidenceRequirements.id, id));
  return row;
}

/**
 * Create a Phase-2 structured note record.
 * The run must be open and the snapshotId must match the run's snapshotId.
 */
export async function createStructuredNote(
  runId: number,
  payload: Record<string, unknown>,
  temporalAnchors?: string[],
): Promise<Phase2StructuredNote> {
  const run = await getPhase2Run(runId);
  if (!run) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Phase-2 run ${runId} not found.` });
  }
  if (run.status !== "open") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Phase-2 run ${runId} is ${run.status}. Artifacts can only be added to open runs.`,
    });
  }

  const now = Date.now();
  const [result] = await db.insert(phase2StructuredNotes).values({
    runId,
    snapshotId: run.snapshotId,
    payload,
    temporalAnchors: temporalAnchors ?? [],
    createdAt: now,
  });

  const id = result.insertId;
  const [row] = await db.select().from(phase2StructuredNotes).where(eq(phase2StructuredNotes.id, id));
  return row;
}

/**
 * List evidence requirements for a run.
 */
export async function listEvidenceRequirements(runId: number): Promise<Phase2EvidenceRequirement[]> {
  return db.select().from(phase2EvidenceRequirements)
    .where(eq(phase2EvidenceRequirements.runId, runId))
    .orderBy(asc(phase2EvidenceRequirements.id));
}

/**
 * List structured notes for a run.
 */
export async function listStructuredNotes(runId: number): Promise<Phase2StructuredNote[]> {
  return db.select().from(phase2StructuredNotes)
    .where(eq(phase2StructuredNotes.runId, runId))
    .orderBy(asc(phase2StructuredNotes.id));
}

// ─── Read-Only Phase-1 Data Access ───

/**
 * Read extraction outputs tied to a sealed snapshot (read-only).
 * Returns document count, quote count, entity count, etc.
 */
export async function getSnapshotExtractionSummary(snapshotId: number) {
  const [docCount] = await db.select({ count: documents.id }).from(documents).where(eq(documents.snapshotId, snapshotId));
  const [quoteCount] = await db.select({ count: quotes.id }).from(quotes).where(eq(quotes.snapshotId, snapshotId));
  const [entityCount] = await db.select({ count: entities.id }).from(entities).where(eq(entities.snapshotId, snapshotId));
  const [claimCount] = await db.select({ count: claims.id }).from(claims).where(eq(claims.snapshotId, snapshotId));
  const [findingCount] = await db.select({ count: findings.id }).from(findings).where(eq(findings.snapshotId, snapshotId));
  const [eventCount] = await db.select({ count: events.id }).from(events).where(eq(events.snapshotId, snapshotId));
  const [flagCount] = await db.select({ count: signalFlags.id }).from(signalFlags).where(eq(signalFlags.snapshotId, snapshotId));
  const [corrCount] = await db.select({ count: documentCorrelations.id }).from(documentCorrelations).where(eq(documentCorrelations.snapshotId, snapshotId));

  // Note: These are COUNT queries that return the id field, not actual counts.
  // We need to use SQL count function. For simplicity, use the array length approach.
  const docs = await db.select({ id: documents.id }).from(documents).where(eq(documents.snapshotId, snapshotId));
  const quotesArr = await db.select({ id: quotes.id }).from(quotes).where(eq(quotes.snapshotId, snapshotId));
  const entitiesArr = await db.select({ id: entities.id }).from(entities).where(eq(entities.snapshotId, snapshotId));
  const claimsArr = await db.select({ id: claims.id }).from(claims).where(eq(claims.snapshotId, snapshotId));
  const findingsArr = await db.select({ id: findings.id }).from(findings).where(eq(findings.snapshotId, snapshotId));
  const eventsArr = await db.select({ id: events.id }).from(events).where(eq(events.snapshotId, snapshotId));
  const flagsArr = await db.select({ id: signalFlags.id }).from(signalFlags).where(eq(signalFlags.snapshotId, snapshotId));
  const corrsArr = await db.select({ id: documentCorrelations.id }).from(documentCorrelations).where(eq(documentCorrelations.snapshotId, snapshotId));

  return {
    snapshotId,
    documents: docs.length,
    quotes: quotesArr.length,
    entities: entitiesArr.length,
    claims: claimsArr.length,
    findings: findingsArr.length,
    events: eventsArr.length,
    signalFlags: flagsArr.length,
    documentCorrelations: corrsArr.length,
  };
}

/**
 * Read documents tied to a snapshot (read-only projection).
 */
export async function getSnapshotDocuments(snapshotId: number) {
  return db.select({
    id: documents.id,
    caseId: documents.caseId,
    filename: documents.filename,
    fileType: documents.fileType,
    sha256Hash: documents.sha256Hash,
    status: documents.status,
    documentType: documents.documentType,
    snapshotId: documents.snapshotId,
  }).from(documents)
    .where(eq(documents.snapshotId, snapshotId))
    .orderBy(asc(documents.id));
}

/**
 * Read the snapshot metadata (read-only).
 */
export async function getSnapshotMetadata(snapshotId: number) {
  const snapshot = await dbHelpers.getSnapshot(snapshotId);
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    caseId: snapshot.caseId,
    version: snapshot.version,
    engineVersion: snapshot.engineVersion,
    documentIds: snapshot.documentIds,
    documentHashes: snapshot.documentHashes,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    sealedAt: snapshot.sealedAt,
    signature: snapshot.signature ? "present" : null,
    signatureAlgorithm: snapshot.signatureAlgorithm,
    publicKeyFingerprint: snapshot.publicKeyFingerprint,
  };
}

// ─── Export Helpers ───

/**
 * Get all Phase-2 artifacts for a snapshot (for export bundle).
 */
export async function getPhase2ExportData(snapshotId: number) {
  const runs = await db.select().from(phase2Runs)
    .where(eq(phase2Runs.snapshotId, snapshotId))
    .orderBy(asc(phase2Runs.id));

  if (runs.length === 0) return null;

  const runIds = runs.map(r => r.id);
  const evidenceReqs: Phase2EvidenceRequirement[] = [];
  const structuredNotes: Phase2StructuredNote[] = [];

  for (const runId of runIds) {
    const reqs = await listEvidenceRequirements(runId);
    const notes = await listStructuredNotes(runId);
    evidenceReqs.push(...reqs);
    structuredNotes.push(...notes);
  }

  return {
    runs: runs.map(r => ({
      id: r.id,
      caseId: r.caseId,
      snapshotId: r.snapshotId,
      engineVersionReference: r.engineVersionReference,
      status: r.status,
      createdAt: r.createdAt,
    })),
    evidenceRequirements: evidenceReqs.map(r => ({
      id: r.id,
      runId: r.runId,
      snapshotId: r.snapshotId,
      payload: r.payload,
      createdAt: r.createdAt,
    })),
    structuredNotes: structuredNotes.map(n => ({
      id: n.id,
      runId: n.runId,
      snapshotId: n.snapshotId,
      payload: n.payload,
      createdAt: n.createdAt,
    })),
  };
}
