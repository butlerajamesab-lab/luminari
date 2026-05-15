/**
 * Phase-2 Domain Logic v1 — Evidence Requirement Runner
 *
 * Orchestrates the full evidence detection lifecycle:
 * T1. Create Phase-2 run (with sealed snapshot + tenant enforcement).
 * T2. Read denial letter text from snapshot documents (read-only).
 * T3. Scan text for target phrases using deterministic regex patterns.
 * T4. For each detected phrase, insert structured requirement into phase2_evidence_requirements.
 * T5. Mark run complete.
 *
 * Scope constraints:
 * - No mutation of Phase-1 tables.
 * - No narrative generation.
 * - No legal conclusions.
 * - No scoring.
 * - Structured checklist entries only.
 */

import { db } from "./db";
import * as phase2Db from "./phase2-db";
import { documents, quotes } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  scanTextForPatterns,
  aggregateRequirements,
  type PhraseMatch,
  type DetectionResult,
} from "./phase2-evidence-detection";

// ─── Read-Only Data Access for Detection ───

/**
 * Read all documents tied to a snapshot. Read-only — no mutations.
 */
async function getSnapshotDocumentsWithText(snapshotId: number) {
  return db.select({
    id: documents.id,
    caseId: documents.caseId,
    filename: documents.filename,
    textContent: documents.textContent,
    documentType: documents.documentType,
    snapshotId: documents.snapshotId,
  }).from(documents)
    .where(eq(documents.snapshotId, snapshotId));
}

/**
 * Read all quotes tied to a snapshot. Read-only — no mutations.
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
    .where(eq(quotes.snapshotId, snapshotId));
}

// ─── Evidence Detection Runner ───

export interface EvidenceRunResult {
  runId: number;
  snapshotId: number;
  caseId: number;
  status: "complete" | "error";
  detection: DetectionResult;
  requirementsInserted: number;
  error?: string;
}

/**
 * Run the evidence requirement detection engine against a sealed snapshot.
 *
 * Data flow:
 * 1. Create Phase-2 run (enforces sealed, tenant, case isolation).
 * 2. Read documents and quotes from snapshot (read-only).
 * 3. Scan document text and quote text for medical denial patterns.
 * 4. Aggregate matches into deduplicated requirements.
 * 5. Insert each requirement into phase2_evidence_requirements.
 * 6. Mark run complete.
 */
export async function runEvidenceDetection(
  caseId: number,
  snapshotId: number,
  userId: number,
): Promise<EvidenceRunResult> {
  // T1. Create Phase-2 run (sealed + tenant + case enforcement happens inside)
  const run = await phase2Db.createPhase2Run(caseId, snapshotId, userId);

  try {
    // T2. Read denial letter text from snapshot (read-only)
    const docs = await getSnapshotDocumentsWithText(snapshotId);
    const snapshotQuotes = await getSnapshotQuotes(snapshotId);

    // T3. Scan for target phrases
    const allMatches: PhraseMatch[] = [];

    // Scan document full text
    for (const doc of docs) {
      if (doc.textContent) {
        const docMatches = scanTextForPatterns(
          doc.textContent,
          doc.id,
        );
        allMatches.push(...docMatches);
      }
    }

    // Scan individual quotes (more granular, with page numbers)
    for (const q of snapshotQuotes) {
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

    // T4. Aggregate into deduplicated requirements
    const requirements = aggregateRequirements(allMatches);

    const detection: DetectionResult = {
      snapshotId,
      documentsScanned: docs.length,
      quotesScanned: snapshotQuotes.length,
      matches: allMatches,
      requirements,
    };

    // T5. Insert each requirement into phase2_evidence_requirements
    let inserted = 0;
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
      inserted++;
    }

    // T6. Mark run complete
    await phase2Db.completePhase2Run(run.id);

    return {
      runId: run.id,
      snapshotId,
      caseId,
      status: "complete",
      detection,
      requirementsInserted: inserted,
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
      detection: {
        snapshotId,
        documentsScanned: 0,
        quotesScanned: 0,
        matches: [],
        requirements: [],
      },
      requirementsInserted: 0,
      error: errorMsg,
    };
  }
}
