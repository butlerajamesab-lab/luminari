/**
 * Phase-2 Domain Logic v2 — Structured Notes Runner
 *
 * Orchestrates the full structured notes detection lifecycle:
 * T1. Create Phase-2 run (with sealed snapshot + tenant enforcement).
 * T2. Read extraction data from snapshot (read-only).
 * T3. Read Phase-2 v1 evidence requirements (if any).
 * T4. Run all 5 structural checks against the data.
 * T5. Insert structured notes into phase2_structured_notes.
 * T6. Mark run complete.
 *
 * Scope constraints:
 * - No mutation of Phase-1 tables.
 * - No LLM invocation.
 * - No narrative generation.
 * - No scoring.
 * - Deterministic structural checks only.
 */

import { db } from "./db";
import * as phase2Db from "./phase2-db";
import {
  documents, quotes, entities, entityRoles,
  claims, events, signalFlags,
  phase2EvidenceRequirements, phase2Runs,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  runAllChecks,
  buildStructuredNotesPayload,
  type SnapshotData,
  type StructuredNote,
} from "./phase2-structured-notes-detection";
import { extractTemporalAnchors, extractAnchorsForNote } from "./phase2-temporal-anchors";

// ─── Read-Only Data Access ───

/**
 * T2. Read all extraction data tied to a snapshot. Read-only — no mutations.
 * Returns the full SnapshotData structure needed by the detection engine.
 */
async function loadSnapshotData(snapshotId: number): Promise<SnapshotData> {
  const [docs, snapshotQuotes, snapshotEntities, snapshotEntityRoles,
    snapshotClaims, snapshotEvents, snapshotSignalFlags] = await Promise.all([
    db.select({
      id: documents.id,
      fileName: documents.fileName,
      textContent: documents.textContent,
      documentType: documents.documentType,
    }).from(documents).where(eq(documents.snapshotId, snapshotId as any)),

    db.select({
      id: quotes.id,
      documentId: quotes.documentId,
      text: quotes.text,
      pageNumber: quotes.pageNumber,
    }).from(quotes).where(eq(quotes.snapshotId, snapshotId as any)),

    db.select({
      id: entities.id,
      name: entities.name,
      type: entities.type,
      description: entities.description,
    }).from(entities).where(eq(entities.snapshotId, snapshotId as any)),

    // EntityRoles don't have snapshotId — join via entities
    db.select({
      id: entityRoles.id,
      entityId: entityRoles.entityId,
      documentId: entityRoles.documentId,
      role: entityRoles.role,
    }).from(entityRoles),

    db.select({
      id: claims.id,
      documentId: claims.documentId,
      quoteId: claims.quoteId,
      claimText: claims.claimText,
      claimType: claims.claimType,
      dateReferenced: claims.dateReferenced,
      entitiesInvolved: claims.entitiesInvolved,
    }).from(claims).where(eq(claims.snapshotId, snapshotId as any)),

    db.select({
      id: events.id,
      eventType: events.eventType,
      title: events.title,
      description: events.description,
      dateOccurred: events.dateOccurred,
      entitiesInvolved: events.entitiesInvolved,
      quoteIds: events.quoteIds,
    }).from(events).where(eq(events.snapshotId, snapshotId as any)),

    db.select({
      id: signalFlags.id,
      documentId: signalFlags.documentId,
      flagType: signalFlags.flagType,
      description: signalFlags.description,
      quoteId: signalFlags.quoteId,
    }).from(signalFlags).where(eq(signalFlags.snapshotId, snapshotId)),
  ]);

  // Filter entity roles to only those belonging to entities in this snapshot
  const entityIds = new Set(snapshotEntities.map((e: any) => e.id));
  const filteredEntityRoles = snapshotEntityRoles.filter((er: any) => entityIds.has(er.entityId));

  // T3. Read Phase-2 v1 evidence requirements (if any)
  const completedRuns = await db.select({ id: phase2Runs.id })
    .from(phase2Runs)
    .where(and(
      eq(phase2Runs.snapshotId, snapshotId),
      eq(phase2Runs.status, "complete"),
    ));

  let evidenceReqs: Array<{ id: number; runId: number; payload: Record<string, unknown> }> = [];
  for (const run of completedRuns) {
    const reqs = await db.select({
      id: phase2EvidenceRequirements.id,
      runId: phase2EvidenceRequirements.runId,
      payload: phase2EvidenceRequirements.payload,
    }).from(phase2EvidenceRequirements)
      .where(eq(phase2EvidenceRequirements.runId, run.id));
    evidenceReqs.push(...reqs.map((r: any) => ({
      id: r.id,
      runId: r.runId,
      payload: (r.payload ?? {}) as Record<string, unknown>,
    })));
  }

  return {
    snapshotId,
    documents: docs,
    quotes: snapshotQuotes,
    entities: snapshotEntities,
    entityRoles: filteredEntityRoles,
    claims: snapshotClaims.map((c: any) => ({
      ...c,
      entitiesInvolved: (c.entitiesInvolved ?? null) as number[] | null,
    })),
    events: snapshotEvents.map((e: any) => ({
      ...e,
      entitiesInvolved: (e.entitiesInvolved ?? null) as number[] | null,
      quoteIds: (e.quoteIds ?? null) as number[] | null,
    })),
    signalFlags: snapshotSignalFlags,
    evidenceRequirements: evidenceReqs,
  };
}

// ─── Structured Notes Runner ───

export interface StructuredNotesRunResult {
  runId: number;
  snapshotId: number;
  caseId: number;
  status: "complete" | "error";
  notesGenerated: number;
  notes: StructuredNote[];
  dataStats: {
    documents: number;
    quotes: number;
    entities: number;
    entityRoles: number;
    claims: number;
    events: number;
    signalFlags: number;
    evidenceRequirements: number;
  };
  error?: string;
}

/**
 * Run the structured notes detection engine against a sealed snapshot.
 *
 * Data flow:
 * T1. Create Phase-2 run (enforces sealed, tenant, case isolation).
 * T2. Load all extraction data from snapshot (read-only).
 * T3. Load Phase-2 v1 evidence requirements (if any).
 * T4. Run all 5 structural checks.
 * T5. Insert each note into phase2_structured_notes.
 * T6. Mark run complete.
 */
export async function runStructuredNotesDetection(
  caseId: number,
  snapshotId: number,
  userId: number,
): Promise<StructuredNotesRunResult> {
  // T1. Create Phase-2 run (sealed + tenant + case enforcement happens inside)
  const run = await phase2Db.createPhase2Run(caseId, snapshotId, userId);

  try {
    // T2 + T3. Load snapshot data including Phase-2 v1 evidence requirements
    const data = await loadSnapshotData(snapshotId);

    // T4. Run all 5 structural checks
    const notes = runAllChecks(data);

    // T4b. Extract temporal anchors from snapshot data
    const allAnchors = extractTemporalAnchors(data);

    // T5. Insert each note as a structured note artifact with temporal anchors
    for (const note of notes) {
      const payload = buildStructuredNotesPayload(snapshotId, [note]);
      const noteAnchors = extractAnchorsForNote(note, allAnchors);
      await phase2Db.createStructuredNote(run.id, payload, noteAnchors);
    }

    // T6. Mark run complete
    await phase2Db.completePhase2Run(run.id);

    return {
      runId: run.id,
      snapshotId,
      caseId,
      status: "complete",
      notesGenerated: notes.length,
      notes,
      dataStats: {
        documents: data.documents.length,
        quotes: data.quotes.length,
        entities: data.entities.length,
        entityRoles: data.entityRoles.length,
        claims: data.claims.length,
        events: data.events.length,
        signalFlags: data.signalFlags.length,
        evidenceRequirements: data.evidenceRequirements.length,
      },
    };
  } catch (err: unknown) {
    // Mark run as error on failure
    try {
      await phase2Db.errorPhase2Run(run.id);
    } catch {
      // Ignore error-on-error
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      runId: run.id,
      snapshotId,
      caseId,
      status: "error",
      notesGenerated: 0,
      notes: [],
      dataStats: {
        documents: 0, quotes: 0, entities: 0, entityRoles: 0,
        claims: 0, events: 0, signalFlags: 0, evidenceRequirements: 0,
      },
      error: errorMsg,
    };
  }
}
