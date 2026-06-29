/**
 * CDA v2.0 — Database Helpers
 *
 * CRUD for all S0–S8 tables + run management.
 * Returns raw Drizzle rows. No business logic.
 * UUID-based (forward direction — PostgreSQL/Supabase).
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
  caseId?: string | null;
  userId?: number | null;
  policyDocId?: string | null;
  denialDocId?: string | null;
  claimSummaryDocId?: string | null;
}): Promise<string> {
  const [result] = await db.insert(cdaRuns).values({
    caseId: data.caseId ?? undefined,
    userId: data.userId ?? undefined,
    policyDocId: data.policyDocId ?? undefined,
    denialDocId: data.denialDocId ?? undefined,
    claimSummaryDocId: data.claimSummaryDocId ?? undefined,
    startedAt: Date.now(),
  }).returning({ id: cdaRuns.id });
  return result.id;
}

export async function getRun(runId: string): Promise<CdaRun | null> {
  const [row] = await db.select().from(cdaRuns).where(eq(cdaRuns.id, runId));
  return row ?? null;
}

export async function listRunsForUser(userId: number): Promise<CdaRun[]> {
  return db.select().from(cdaRuns)
    .where(eq(cdaRuns.userId, userId))
    .orderBy(desc(cdaRuns.startedAt));
}

export async function listRunsForCase(caseId: string): Promise<CdaRun[]> {
  return db.select().from(cdaRuns)
    .where(eq(cdaRuns.caseId, caseId))
    .orderBy(desc(cdaRuns.startedAt));
}

export async function updateRunStatus(
  runId: string,
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
  caseId: string,
  policyDocId: string,
  denialDocId: string,
  claimSummaryDocId: string,
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
  return runs.find((r: any) => activeStatuses.includes(r.status)) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// S1: Document Index
// ═══════════════════════════════════════════════════════════════════════

export async function insertDocument(data: {
  runId: string;
  docType: string;
  receivedDate?: string | null;
  fileName: string;
  source?: string;
  pageCount?: number;
  hash: string;
  sourceDocumentId?: string | null;
  classificationRule?: string | null;
}): Promise<string> {
  const [result] = await db.insert(cdaDocuments).values(data as any).returning({ id: cdaDocuments.id });
  return result.id;
}

export async function getDocuments(runId: string): Promise<CdaDocument[]> {
  return db.select().from(cdaDocuments).where(eq(cdaDocuments.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S2: Quote Ledger
// ═══════════════════════════════════════════════════════════════════════

export async function insertQuote(data: {
  runId: string;
  docId: string;
  page?: number | null;
  locationHint?: string | null;
  quoteText: string;
  categoryTag: string;
  extractionMethod?: string;
  confidence?: string;
  infoLayer?: string;
}): Promise<string> {
  const [result] = await db.insert(cdaQuotes).values(data as any).returning({ id: cdaQuotes.id });
  return result.id;
}

export async function insertQuotes(data: Array<{
  runId: string;
  docId: string;
  page?: number | null;
  locationHint?: string | null;
  quoteText: string;
  categoryTag: string;
  extractionMethod?: string;
  confidence?: string;
  infoLayer?: string;
}>): Promise<string[]> {
  if (data.length === 0) return [];
  const results: string[] = [];
  for (const row of data) {
    const id = await insertQuote(row);
    results.push(id);
  }
  return results;
}

export async function getQuotes(runId: string): Promise<CdaQuote[]> {
  return db.select().from(cdaQuotes).where(eq(cdaQuotes.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S3: Claim Ledger
// ═══════════════════════════════════════════════════════════════════════

export async function insertClaimLedger(data: {
  runId: string;
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
  sourceQuotes?: Array<{ field: string; quoteId: string; label?: string }> | null;
  formatInferredFields?: string[] | null;
}): Promise<string> {
  const [result] = await db.insert(cdaClaimLedger).values(data as any).returning({ id: cdaClaimLedger.id });
  return result.id;
}

export async function getClaimLedger(runId: string): Promise<CdaClaimLedger | null> {
  const [row] = await db.select().from(cdaClaimLedger).where(eq(cdaClaimLedger.runId, runId));
  return row ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// S4: Denial Reason Ledger
// ═══════════════════════════════════════════════════════════════════════

export async function insertDenialReason(data: {
  runId: string;
  claimId?: string | null;
  reasonTextVerbatim: string;
  normalizedReasonCode: string;
  citedPolicyRefsVerbatim?: string | null;
  citedFactsVerbatim?: string | null;
  sourceQuoteIds?: string[] | null;
  infoLayer?: string;
}): Promise<string> {
  const [result] = await db.insert(cdaDenialReasons).values(data as any).returning({ id: cdaDenialReasons.id });
  return result.id;
}

export async function getDenialReasons(runId: string): Promise<CdaDenialReason[]> {
  return db.select().from(cdaDenialReasons).where(eq(cdaDenialReasons.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S5: Policy Clause Ledger
// ═══════════════════════════════════════════════════════════════════════

export async function insertPolicyClause(data: {
  runId: string;
  clauseTextVerbatim: string;
  sectionHeading?: string | null;
  clauseType: string;
  definedTerms?: string[] | null;
  effectiveScopeNote?: string | null;
  sourceQuoteIds?: string[] | null;
  infoLayer?: string;
}): Promise<string> {
  const [result] = await db.insert(cdaPolicyClauses).values(data as any).returning({ id: cdaPolicyClauses.id });
  return result.id;
}

export async function getPolicyClauses(runId: string): Promise<CdaPolicyClause[]> {
  return db.select().from(cdaPolicyClauses).where(eq(cdaPolicyClauses.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S6: Comparison Matrix
// ═══════════════════════════════════════════════════════════════════════

export async function insertComparisonRow(data: {
  runId: string;
  reasonId?: string | null;
  clauseId?: string | null;
  linkingBasis: string;
  matchType?: string | null;
  mismatchType?: string | null;
  requiredEvidence?: string | null;
  missingEvidence?: string | null;
  conflictEvidence?: string | null;
  supportingQuoteIds?: string[] | null;
  notes?: string | null;
}): Promise<string> {
  const [result] = await db.insert(cdaComparisonMatrix).values(data as any).returning({ id: cdaComparisonMatrix.id });
  return result.id;
}

export async function getComparisonMatrix(runId: string): Promise<CdaComparisonRow[]> {
  return db.select().from(cdaComparisonMatrix).where(eq(cdaComparisonMatrix.runId, runId));
}

export async function updateComparisonRow(
  rowId: string,
  data: {
    matchType?: string | null;
    mismatchType?: string | null;
    requiredEvidence?: string | null;
    missingEvidence?: string | null;
    conflictEvidence?: string | null;
    supportingQuoteIds?: string[] | null;
    resolutionStatus?: string | null;
    resolutionNotes?: string | null;
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
  runId: string;
  gapType: string;
  description?: string;
  requiredItem?: string | null;
  whyRequired?: string | null;
  howToObtain?: string | null;
  priorityLevel?: string | null;
  linkedReasonIds?: string[] | null;
  linkedClauseIds?: string[] | null;
  linkedTransformation?: string | null;
  severity?: string | null;
  failureFlag?: string | null;
}): Promise<string> {
  const [result] = await db.insert(cdaEvidenceGaps).values(data as any).returning({ id: cdaEvidenceGaps.id });
  return result.id;
}

export async function getEvidenceGaps(runId: string): Promise<CdaEvidenceGap[]> {
  return db.select().from(cdaEvidenceGaps).where(eq(cdaEvidenceGaps.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// S8: Contradiction Register
// ═══════════════════════════════════════════════════════════════════════

export async function insertContradiction(data: {
  runId: string;
  conflictType: string;
  claimReference?: string | null;
  denialReference?: string | null;
  policyReference?: string | null;
  explanation: string;
  linkedQuoteIds?: string[] | null;
}): Promise<string> {
  const [result] = await db.insert(cdaContradictions).values(data as any).returning({ id: cdaContradictions.id });
  return result.id;
}

export async function getContradictions(runId: string): Promise<CdaContradiction[]> {
  return db.select().from(cdaContradictions).where(eq(cdaContradictions.runId, runId));
}

// ═══════════════════════════════════════════════════════════════════════
// Bulk Snapshot — for end condition validator
// ═══════════════════════════════════════════════════════════════════════

export async function getFullRunSnapshot(runId: string) {
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

export async function getRunRowCounts(runId: string) {
  const countQuery = async (table: any) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(eq(table.runId, runId));
    return Number(result?.count ?? 0);
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
export async function wipeFromStage(runId: string, fromStage: "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8" | "T9"): Promise<void> {
  const stageOrder = ["T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"];
  const idx = stageOrder.indexOf(fromStage);

  // Wipe in reverse dependency order
  if (idx <= 7) await db.delete(cdaContradictions).where(eq(cdaContradictions.runId, runId));
  if (idx <= 6) await db.delete(cdaEvidenceGaps).where(eq(cdaEvidenceGaps.runId, runId));
  if (idx <= 5) await db.delete(cdaComparisonMatrix).where(eq(cdaComparisonMatrix.runId, runId));
  if (idx <= 3) await db.delete(cdaPolicyClauses).where(eq(cdaPolicyClauses.runId, runId));
  if (idx <= 2) await db.delete(cdaDenialReasons).where(eq(cdaDenialReasons.runId, runId));
  if (idx <= 1) await db.delete(cdaClaimLedger).where(eq(cdaClaimLedger.runId, runId));
  if (idx <= 0) await db.delete(cdaQuotes).where(eq(cdaQuotes.runId, runId));
}

/**
 * Delete ALL data for a run (S1–S8 + run record). Full reset.
 */
export async function deleteRunData(runId: string): Promise<void> {
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
