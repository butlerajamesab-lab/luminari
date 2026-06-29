/**
 * Phase-2 Orchestration Layer — Combined Analysis Runner
 *
 * Deterministic orchestration of Phase-2 engines:
 * T1. Validate: snapshotId exists, snapshot is sealed, tenant isolation, lane isolation.
 * T2. Create a unified phase2_run record (status = 'open').
 * T3. Execute Evidence Requirement Engine (v1) — inserts into phase2_evidence_requirements.
 * T4. Execute Structured Notes Engine (v2) — inserts into phase2_structured_notes.
 * T4c. Execute Temporal Gap Detection — identifies undocumented gaps >= 90 days, inserts gap notes.
 * T5. Mark phase2_run.status = 'complete'.
 *
 * Execution order is fixed: v1 → v2 → gap detection (each step may reference prior output).
 * No parallel execution. No LLM enrichment. No inference chaining.
 *
 * Idempotency: Multiple runs per snapshot are allowed. Each invocation creates a new
 * phase2_run record. This allows re-analysis after corpus changes or engine upgrades.
 *
 * Scope constraints:
 * - No mutation of Phase-1 tables.
 * - No resealing of snapshots.
 * - No signing changes.
 * - No cross-tenant access.
 */

import { db } from "./db";
import * as phase2Db from "./phase2-db";
import { documents, quotes, entities, entityRoles, claims, events, signalFlags, phase2EvidenceRequirements, phase2Runs } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  scanTextForPatterns,
  aggregateRequirements,
  type PhraseMatch,
  type DetectionResult,
} from "./phase2-evidence-detection";
import {
  runAllChecks,
  buildStructuredNotesPayload,
  type SnapshotData,
  type StructuredNote,
} from "./phase2-structured-notes-detection";
import { extractTemporalAnchors, extractAnchorsForNote } from "./phase2-temporal-anchors";
import {
  detectTemporalGaps,
  buildGapNotePayloads,
  gapNoteAlreadyExists,
  mergeAnchors,
  type GapDetectionResult,
} from "./phase2-temporal-gap-detection";

// ─── Read-Only Data Access ───

/**
 * Read all documents with text content tied to a snapshot. Read-only.
 */
async function getSnapshotDocumentsWithText(snapshotId: number) {
  return db.select({
    id: documents.id,
    caseId: documents.caseId,
    fileName: documents.fileName,
    textContent: documents.textContent,
    documentType: documents.documentType,
    snapshotId: documents.snapshotId,
  }).from(documents)
    .where(eq(documents.snapshotId, snapshotId as any));
}

/**
 * Read all quotes tied to a snapshot. Read-only.
 */
async function getSnapshotQuotes(snapshotId: number) {
  return db.select({
    id: quotes.id,
    documentId: quotes.documentId,
    text: quotes.text,
    pageNumber: quotes.pageNumber,
    laneId: quotes.laneId,
    snapshotId: quotes.snapshotId,
  }).from(quotes)
    .where(eq(quotes.snapshotId, snapshotId as any));
}

/**
 * Load full snapshot data for structured notes engine. Read-only.
 */
async function loadSnapshotDataForNotes(snapshotId: number, runId: number): Promise<SnapshotData> {
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

  // Read evidence requirements from the CURRENT run (just inserted by v1 engine)
  const reqs = await db.select({
    id: phase2EvidenceRequirements.id,
    runId: phase2EvidenceRequirements.runId,
    payload: phase2EvidenceRequirements.payload,
  }).from(phase2EvidenceRequirements)
    .where(eq(phase2EvidenceRequirements.runId, runId));

  const evidenceReqs = reqs.map((r: any) => ({
    id: r.id,
    runId: r.runId,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));

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

// ─── Orchestration Result Types ───

export interface FullAnalysisResult {
  runId: number;
  snapshotId: number;
  caseId: number;
  status: "complete" | "error";
  executionOrder: ["evidence_detection_v1", "structured_notes_v2", "temporal_gap_detection"];
  idempotencyPolicy: "multiple_runs_allowed";
  evidenceDetection: {
    documentsScanned: number;
    quotesScanned: number;
    matchCount: number;
    requirementsInserted: number;
  };
  structuredNotes: {
    checksRun: number;
    notesGenerated: number;
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
  };
  temporalGapDetection: {
    anchorsAnalyzed: number;
    gapsDetected: number;
    gapNotesInserted: number;
    thresholdDays: number;
  };
  error?: string;
}

// ─── Orchestration Runner ───

/**
 * Run full Phase-2 analysis against a sealed snapshot.
 *
 * Execution flow:
 * T1. Validate preconditions (sealed, tenant, case).
 * T2. Create unified phase2_run record.
 * T3. Execute Evidence Requirement Engine (v1).
 * T4. Execute Structured Notes Engine (v2) — reads v1 output from same run.
 * T5. Mark run complete.
 *
 * On failure at any step: mark run as error, do not mutate Phase-1.
 */
export async function runFullAnalysis(
  caseId: number,
  snapshotId: number,
  userId: number,
): Promise<FullAnalysisResult> {
  // T1. Validate preconditions (sealed snapshot, tenant isolation, case binding)
  // createPhase2Run enforces all three checks internally
  const run = await phase2Db.createPhase2Run(caseId, snapshotId, userId);

  try {
    // ── T3. Evidence Requirement Engine (v1) ──
    const docs = await getSnapshotDocumentsWithText(snapshotId);
    const snapshotQuotesArr = await getSnapshotQuotes(snapshotId);

    const allMatches: PhraseMatch[] = [];

    // Scan document full text
    for (const doc of docs) {
      if (doc.textContent) {
        const docMatches = scanTextForPatterns(doc.textContent, doc.id);
        allMatches.push(...docMatches);
      }
    }

    // Scan individual quotes
    for (const q of snapshotQuotesArr) {
      if (q.text) {
        const quoteMatches = scanTextForPatterns(
          q.text,
          q.documentId,
          q.id,
          q.pageNumber ?? undefined,
        );
        allMatches.push(...quoteMatches);
      }
    }

    // Aggregate into deduplicated requirements
    const requirements = aggregateRequirements(allMatches);

    // Insert each requirement into phase2_evidence_requirements
    let requirementsInserted = 0;
    for (const req of requirements) {
      await phase2Db.createEvidenceRequirement(run.id, {
        patternId: req.patternId,
        category: req.category,
        type: req.type,
        action: req.action,
        description: req.description,
        priority: req.priority,
        matchCount: req.matchCount,
        sourceDocumentIds: req.sourceDocumentIds,
        sourceQuoteIds: req.sourceQuoteIds,
        sampleMatchedText: req.sampleMatchedText,
      });
      requirementsInserted++;
    }

    // ── T4. Structured Notes Engine (v2) ──
    // Load snapshot data including the evidence requirements just inserted by v1
    const snapshotData = await loadSnapshotDataForNotes(snapshotId, run.id);
    const notes = runAllChecks(snapshotData);

    // T4b. Extract temporal anchors from snapshot data
    const allAnchors = extractTemporalAnchors(snapshotData);

    // Insert each note as a structured note artifact with temporal anchors
    for (const note of notes) {
      const payload = buildStructuredNotesPayload(snapshotId, [note]);
      const noteAnchors = extractAnchorsForNote(note, allAnchors);
      await phase2Db.createStructuredNote(run.id, payload, noteAnchors);
    }

    // ── T4c. Temporal Gap Detection ──
    // Collect all temporal anchors from the snapshot data (events, claims, documents)
    const snapshotAnchors = extractTemporalAnchors(snapshotData);

    // Also collect anchors from the structured notes just inserted
    const noteAnchorsAll: string[] = [];
    for (const note of notes) {
      const na = extractAnchorsForNote(note, snapshotAnchors);
      noteAnchorsAll.push(...na);
    }

    // Merge all anchors into a single sorted, deduplicated array
    const allTemporalAnchors = mergeAnchors(snapshotAnchors, noteAnchorsAll);

    // Detect gaps
    const gapResult: GapDetectionResult = detectTemporalGaps(allTemporalAnchors);

    // Build gap note payloads
    const gapPayloads = buildGapNotePayloads(snapshotId, gapResult.gaps);

    // Idempotency: check existing notes for this snapshot to avoid duplicates
    const existingNotes = await phase2Db.listStructuredNotes(run.id);
    let gapNotesInserted = 0;
    for (const gapPayload of gapPayloads) {
      const gap = gapResult.gaps[gapPayloads.indexOf(gapPayload)];
      if (!gapNoteAlreadyExists(existingNotes, gap)) {
        await phase2Db.createStructuredNote(
          run.id,
          gapPayload.payload,
          gapPayload.temporalAnchors,
        );
        gapNotesInserted++;
      }
    }

    // ── T5. Mark run complete ──
    await phase2Db.completePhase2Run(run.id);

    return {
      runId: run.id,
      snapshotId,
      caseId,
      status: "complete",
      executionOrder: ["evidence_detection_v1", "structured_notes_v2", "temporal_gap_detection"],
      idempotencyPolicy: "multiple_runs_allowed",
      evidenceDetection: {
        documentsScanned: docs.length,
        quotesScanned: snapshotQuotesArr.length,
        matchCount: allMatches.length,
        requirementsInserted,
      },
      structuredNotes: {
        checksRun: 5,
        notesGenerated: notes.length,
        dataStats: {
          documents: snapshotData.documents.length,
          quotes: snapshotData.quotes.length,
          entities: snapshotData.entities.length,
          entityRoles: snapshotData.entityRoles.length,
          claims: snapshotData.claims.length,
          events: snapshotData.events.length,
          signalFlags: snapshotData.signalFlags.length,
          evidenceRequirements: snapshotData.evidenceRequirements.length,
        },
      },
      temporalGapDetection: {
        anchorsAnalyzed: gapResult.anchorsAnalyzed,
        gapsDetected: gapResult.gapsDetected,
        gapNotesInserted,
        thresholdDays: gapResult.thresholdDays,
      },
    };
  } catch (err: unknown) {
    // Mark run as error on failure — no Phase-1 mutation
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
      executionOrder: ["evidence_detection_v1", "structured_notes_v2", "temporal_gap_detection"],
      idempotencyPolicy: "multiple_runs_allowed",
      evidenceDetection: {
        documentsScanned: 0,
        quotesScanned: 0,
        matchCount: 0,
        requirementsInserted: 0,
      },
      structuredNotes: {
        checksRun: 0,
        notesGenerated: 0,
        dataStats: {
          documents: 0, quotes: 0, entities: 0, entityRoles: 0,
          claims: 0, events: 0, signalFlags: 0, evidenceRequirements: 0,
        },
      },
      temporalGapDetection: {
        anchorsAnalyzed: 0,
        gapsDetected: 0,
        gapNotesInserted: 0,
        thresholdDays: 90,
      },
      error: errorMsg,
    };
  }
}
