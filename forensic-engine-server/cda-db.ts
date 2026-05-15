/**
 * CDA v1.0-PATCH3 — Database Helpers
 *
 * CRUD for all S1–S8 tables + run management.
 * Returns raw Drizzle rows. No business logic.
 * Wipe-and-rebuild for idempotent dev re-runs.
 */

import { eq, sql, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  cdaRuns, cdaDocuments, cdaQuotes, cdaClaimLedger,
  cdaDenialReasons, cdaPolicyClauses, cdaComparisonMatrix,
  cdaEvidenceGaps, cdaContradictions,
  type CdaRun, type CdaDocument, type CdaQuote,
  type CdaClaimLedger, type CdaDenialReason, type CdaPolicyClause,
  type CdaComparisonRow, type CdaEvidenceGap, type CdaContradiction,
} from "../drizzle/cda-schema";

// ═══════════════════════════════════════════════════════════════════════
// Run Management
// ═══════════════════════════════════════════════════════════════════════

export async function createRun(data: {
  caseId: number;
  userId: number;
  policyDocId: number;
  denialDocId: number;
  claimSummaryDocId: number;
}): Promise<number> {
  const [result] = await db.insert(cdaRuns).values({
    caseId: data.caseId,
    userId: data.userId,
    policyDocId: data.policyDocId,
    denialDocId: data.denialDocId,
    claimSummaryDocId: data.claimSummaryDocId,
    startedAt: Date.now(),
  });
  return result.insertId;
}

export async function getRun(runId: number): Promise<CdaRun | null> {
  const [row] = await db.select().from(cdaRuns).where(eq(cdaRuns.id, runId));
  return row ?? null;
}

export async function listRunsForUser(userId: number): Promise<CdaRun[]> {
  return db.select().from(cdaRuns)
    .where(eq(cdaRuns.userId, userId))
    .orderBy(desc(cdaRuns.startedAt));
}

export async function listRunsForCase(caseId: number): Promise<CdaRun[]> {
  return db.select().from(cdaRuns)
    .where(eq(cdaRuns.caseId, caseId))
    .orderBy(desc(cdaRuns.startedAt));
}

export async function updateRunStatus(
  runId: number,
  status: string,
  extra?: {
    endConditionMet?: boolean;
    unmetCriteria?: string[];
    activeFailureFlags?: string[];
    completedAt?: number;
    errorMessage?: string;
  },
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (extra?.endConditionMet !== undefined) updates.endConditionMet = extra.endConditionMet;
  if (extra?.unmetCriteria !== undefined) updates.unmetCriteria = extra.unmetCriteria;
  if (extra?.activeFailureFlags !== undefined) updates.activeFailureFlags = extra.activeFailureFlags;
  if (extra?.completedAt !== undefined) updates.completedAt = extra.completedAt;
  if (extra?.errorMessage !== undefined) updates.errorMessage = extra.errorMessage;
  await db.update(cdaRuns).set(updates).where(eq(cdaRuns.id, runId));
}

/** Find an active (non-terminal) CDA run for the same case + same doc IDs */
export async function findActiveRunForDocs(
  caseId: number,
  policyDocId: number,
  denialDocId: number,
  claimSummaryDocId: number,
): Promise<CdaRun | null> {
  const activeStatuses = [
    "created", "classifying", "extracting", "normalizing",
    "parsing_denial", "parsing_policy", "linking", "comparing",
    "detecting_contradictions", "generating_artifacts", "validating",
  ];
  const runs = await db.select().from(cdaRuns)
    .where(and(
      eq(cdaRuns.caseId, caseId),
      eq(cdaRuns.policyDocId, policyDocId),
      eq(cdaRuns.denialDocId, denialDocId),
      eq(cdaRuns.claimSummaryDocId, claimSummaryDocId),
    ));
  // Filter in JS since status enum check is complex in SQL
  return runs.find(r => activeStatuses.includes(r.status)) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// S1: Document Index
// ═══════════════════════════════════════════════════════════════════════

export async function insertDocument(data: {
  runId: number;
  docType: string;
  receivedDate?: string | null;
  fileName: string;
  source?: string;
  pageCount?: number;
  hash: string;
  sourceDocumentId?: number | null;
  classificationRule?: string | null;
}): Promise<number> {
  const [result] = await db.insert(cdaDocuments).values(data as any);
  return result.insertId;
}

export async function getDocuments(runId: number): Promise<CdaDocument[]> {
  return db.select().from(cdaDocuments).where(eq(cdaDocuments.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S2: Quote Ledger
// ═══════════════════════════════════════════════════════════════════════

export async function insertQuote(data: {
  runId: number;
  docId: number;
  page?: number | null;
  locationHint?: string | null;
  quoteText: string;
  categoryTag: string;
  extractionMethod?: string;
  confidence?: string;
  infoLayer?: string;
}): Promise<number> {
  const [result] = await db.insert(cdaQuotes).values(data as any);
  return result.insertId;
}

export async function insertQuotes(data: Array<{
  runId: number;
  docId: number;
  page?: number | null;
  locationHint?: string | null;
  quoteText: string;
  categoryTag: string;
  extractionMethod?: string;
  confidence?: string;
  infoLayer?: string;
}>): Promise<number[]> {
  if (data.length === 0) return [];
  const results: number[] = [];
  for (const row of data) {
    const id = await insertQuote(row);
    results.push(id);
  }
  return results;
}

export async function getQuotes(runId: number): Promise<CdaQuote[]> {
  return db.select().from(cdaQuotes).where(eq(cdaQuotes.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S3: Claim Ledger
// ═══════════════════════════════════════════════════════════════════════

export async function insertClaimLedger(data: {
  runId: number;
  claimId?: string | null;
  policyNumber?: string | null;
  insuredName?: string | null;
  insurerName?: string | null;
  lossDate?: string | null;
  denialDate?: string | null;
  coverageTypes?: string[] | null;
  claimedItems?: string | null;
  claimedAmount?: string | null;
  paidAmount?: string | null;
  communicationChannels?: string[] | null;
  sourceQuotes?: Array<{ field: string; quoteId: number; label?: string }> | null;
  formatInferredFields?: string[] | null;
}): Promise<number> {
  const [result] = await db.insert(cdaClaimLedger).values(data as any);
  return result.insertId;
}

export async function getClaimLedger(runId: number): Promise<CdaClaimLedger | null> {
  const [row] = await db.select().from(cdaClaimLedger).where(eq(cdaClaimLedger.runId, runId));
  return row ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// S4: Denial Reason Ledger
// ═══════════════════════════════════════════════════════════════════════

export async function insertDenialReason(data: {
  runId: number;
  claimId?: string | null;
  reasonTextVerbatim: string;
  normalizedReasonCode: string;
  citedPolicyRefsVerbatim?: string | null;
  citedFactsVerbatim?: string | null;
  sourceQuoteIds?: number[] | null;
  infoLayer?: string;
}): Promise<number> {
  const [result] = await db.insert(cdaDenialReasons).values(data as any);
  return result.insertId;
}

export async function getDenialReasons(runId: number): Promise<CdaDenialReason[]> {
  return db.select().from(cdaDenialReasons).where(eq(cdaDenialReasons.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S5: Policy Clause Ledger
// ═══════════════════════════════════════════════════════════════════════

export async function insertPolicyClause(data: {
  runId: number;
  clauseTextVerbatim: string;
  sectionHeading?: string | null;
  clauseType: string;
  definedTerms?: string[] | null;
  effectiveScopeNote?: string | null;
  sourceQuoteIds?: number[] | null;
  infoLayer?: string;
}): Promise<number> {
  const [result] = await db.insert(cdaPolicyClauses).values(data as any);
  return result.insertId;
}

export async function getPolicyClauses(runId: number): Promise<CdaPolicyClause[]> {
  return db.select().from(cdaPolicyClauses).where(eq(cdaPolicyClauses.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S6: Comparison Matrix
// ═══════════════════════════════════════════════════════════════════════

export async function insertComparisonRow(data: {
  runId: number;
  reasonId: number;
  clauseId?: number | null;
  linkingBasis: string;
  matchType?: string | null;
  mismatchType?: string | null;
  requiredEvidence?: string | null;
  missingEvidence?: string | null;
  conflictEvidence?: string | null;
  supportingQuoteIds?: number[] | null;
  notes?: string | null;
}): Promise<number> {
  const [result] = await db.insert(cdaComparisonMatrix).values(data as any);
  return result.insertId;
}

export async function getComparisonMatrix(runId: number): Promise<CdaComparisonRow[]> {
  return db.select().from(cdaComparisonMatrix).where(eq(cdaComparisonMatrix.runId, runId));
}

export async function updateComparisonRow(
  rowId: number,
  data: {
    matchType?: string | null;
    mismatchType?: string | null;
    requiredEvidence?: string | null;
    missingEvidence?: string | null;
    conflictEvidence?: string | null;
    supportingQuoteIds?: number[] | null;
    resolutionMethod?: string | null;
    t7TranscriptId?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  await db.update(cdaComparisonMatrix).set(data as any).where(eq(cdaComparisonMatrix.id, rowId));
}

// ═══════════════════════════════════════════════════════════════════════
// S7: Evidence Gap Register
// ═══════════════════════════════════════════════════════════════════════

export async function insertEvidenceGap(data: {
  runId: number;
  gapType: string;
  requiredItem: string;
  whyRequired: string;
  howToObtain?: string | null;
  priorityLevel: string;
  linkedReasonIds?: number[] | null;
  linkedTransformation?: string | null;
  failureFlag?: string | null;
}): Promise<number> {
  const [result] = await db.insert(cdaEvidenceGaps).values(data as any);
  return result.insertId;
}

export async function getEvidenceGaps(runId: number): Promise<CdaEvidenceGap[]> {
  return db.select().from(cdaEvidenceGaps).where(eq(cdaEvidenceGaps.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S8: Contradiction Register
// ═══════════════════════════════════════════════════════════════════════

export async function insertContradiction(data: {
  runId: number;
  conflictType: string;
  claimReference?: string | null;
  denialReference?: string | null;
  policyReference?: string | null;
  explanation: string;
  linkedQuoteIds?: number[] | null;
}): Promise<number> {
  const [result] = await db.insert(cdaContradictions).values(data as any);
  return result.insertId;
}

export async function getContradictions(runId: number): Promise<CdaContradiction[]> {
  return db.select().from(cdaContradictions).where(eq(cdaContradictions.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// Bulk Snapshot — for end condition validator
// ═══════════════════════════════════════════════════════════════════════

export async function getFullRunSnapshot(runId: number) {
  const [run, s1, s2, s3, s4, s5, s6, s7, s8] = await Promise.all([
    getRun(runId),
    getDocuments(runId),
    getQuotes(runId),
    getClaimLedger(runId),
    getDenialReasons(runId),
    getPolicyClauses(runId),
    getComparisonMatrix(runId),
    getEvidenceGaps(runId),
    getContradictions(runId),
  ]);
  return {
    run,
    s1_documents: s1,
    s2_quotes: s2,
    s3_claim_ledger: s3,
    s4_denial_reasons: s4,
    s5_policy_clauses: s5,
    s6_comparison_matrix: s6,
    s7_evidence_gaps: s7,
    s8_contradictions: s8,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Row Counts — for end condition validator
// ═══════════════════════════════════════════════════════════════════════

export async function getRunRowCounts(runId: number) {
  const countQuery = async (table: any) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(eq(table.runId, runId));
    return result?.count ?? 0;
  };

  const [s1, s2, s3, s4, s5, s6, s7, s8] = await Promise.all([
    countQuery(cdaDocuments),
    countQuery(cdaQuotes),
    countQuery(cdaClaimLedger),
    countQuery(cdaDenialReasons),
    countQuery(cdaPolicyClauses),
    countQuery(cdaComparisonMatrix),
    countQuery(cdaEvidenceGaps),
    countQuery(cdaContradictions),
  ]);

  return {
    s1_documents: s1,
    s2_quotes: s2,
    s3_claim_ledger: s3,
    s4_denial_reasons: s4,
    s5_policy_clauses: s5,
    s6_comparison_matrix: s6,
    s7_evidence_gaps: s7,
    s8_contradictions: s8,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Wipe-and-Rebuild — Idempotent dev re-runs
// ═══════════════════════════════════════════════════════════════════════

/**
 * Delete all data from a given stage onwards for a run.
 * Use before re-running the pipeline from that stage.
 */
export async function wipeFromStage(runId: number, fromStage: "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8" | "T9"): Promise<void> {
  const stageOrder = ["T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"];
  const idx = stageOrder.indexOf(fromStage);

  // Wipe in reverse dependency order
  if (idx <= 7) await db.delete(cdaContradictions).where(eq(cdaContradictions.runId, runId));  // S8
  if (idx <= 6) await db.delete(cdaEvidenceGaps).where(eq(cdaEvidenceGaps.runId, runId));     // S7
  if (idx <= 5) await db.delete(cdaComparisonMatrix).where(eq(cdaComparisonMatrix.runId, runId)); // S6
  if (idx <= 3) await db.delete(cdaPolicyClauses).where(eq(cdaPolicyClauses.runId, runId));   // S5
  if (idx <= 2) await db.delete(cdaDenialReasons).where(eq(cdaDenialReasons.runId, runId));   // S4
  if (idx <= 1) await db.delete(cdaClaimLedger).where(eq(cdaClaimLedger.runId, runId));       // S3
  if (idx <= 0) await db.delete(cdaQuotes).where(eq(cdaQuotes.runId, runId));                 // S2
}

/**
 * Delete ALL data for a run (S1–S8 + run record). Full reset.
 */
export async function deleteRunData(runId: number): Promise<void> {
  await db.delete(cdaContradictions).where(eq(cdaContradictions.runId, runId));
  await db.delete(cdaEvidenceGaps).where(eq(cdaEvidenceGaps.runId, runId));
  await db.delete(cdaComparisonMatrix).where(eq(cdaComparisonMatrix.runId, runId));
  await db.delete(cdaPolicyClauses).where(eq(cdaPolicyClauses.runId, runId));
  await db.delete(cdaDenialReasons).where(eq(cdaDenialReasons.runId, runId));
  await db.delete(cdaClaimLedger).where(eq(cdaClaimLedger.runId, runId));
  await db.delete(cdaQuotes).where(eq(cdaQuotes.runId, runId));
  await db.delete(cdaDocuments).where(eq(cdaDocuments.runId, runId));
  await db.delete(cdaRuns).where(eq(cdaRuns.id, runId));
}
