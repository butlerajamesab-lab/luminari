/**
 * Gap Detection — deterministic comparison of extracted evidence against domain obligation rules.
 *
 * T1. Fetch all documents, entities, events, and quotes for the case.
 * T2. Build a combined text corpus from document textContent, entity names/descriptions,
 *     event titles/descriptions, and quote text.
 * T3. For each obligation rule in the domain rule set, search the corpus for detection keywords.
 * T4. If no keywords match, the record is flagged as "missing" and inserted into the missing_records table.
 * T5. Existing missing_records for the case are checked — if a previously missing record is now found,
 *     its status is updated to "received". If a new gap is detected, it's inserted.
 *
 * No LLM calls. Purely deterministic keyword matching.
 */

import { db } from "./db";
import { documents, entities, events, quotes, missingRecords } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getDomainRules, type ObligationRule, type DomainRuleSet } from "./domain-rules";

// ─── Types ───

export interface GapDetectionResult {
  domain: string;
  totalRules: number;
  rulesMatched: number;
  rulesMissing: number;
  missingRecords: {
    recordType: string;
    label: string;
    severity: "critical" | "important" | "helpful";
    legalBasis: string;
    foiaEligible: boolean;
  }[];
  matchedRecords: {
    recordType: string;
    label: string;
    matchedKeywords: string[];
  }[];
}

// ─── Core Detection Logic ───

/**
 * Build a searchable text corpus from all case evidence.
 * Returns a single lowercase string for keyword matching.
 */
async function buildEvidenceCorpus(caseId: number): Promise<string> {
  // Fetch all evidence in parallel
  const [docs, ents, evts, qts] = await Promise.all([
    db.select({
      textContent: documents.textContent,
      documentType: documents.documentType,
      documentPurpose: documents.documentPurpose,
      fileName: documents.filename,
    }).from(documents).where(eq(documents.caseId, caseId as any)),

    db.select({
      name: entities.name,
      type: entities.type,
      description: entities.description,
    }).from(entities).where(eq(entities.caseId, caseId as any)),

    db.select({
      title: events.title,
      description: events.description,
      eventType: events.eventType,
    }).from(events).where(eq(events.caseId, caseId as any)),

    db.select({
      text: quotes.text,
      context: quotes.context,
    }).from(quotes).where(eq(quotes.caseId, caseId as any)),
  ]);

  // Combine all text into a single searchable corpus
  const parts: string[] = [];

  for (const doc of docs) {
    if (doc.textContent) parts.push(doc.textContent);
    if (doc.documentType) parts.push(doc.documentType);
    if (doc.documentPurpose) parts.push(doc.documentPurpose);
    if (doc.filename) parts.push(doc.filename);
  }

  for (const ent of ents) {
    parts.push(ent.name);
    if (ent.type) parts.push(ent.type);
    if (ent.description) parts.push(ent.description);
  }

  for (const evt of evts) {
    parts.push(evt.title);
    if (evt.description) parts.push(evt.description);
    if (evt.eventType) parts.push(evt.eventType);
  }

  for (const qt of qts) {
    if (qt.text) parts.push(qt.text);
    if (qt.context) parts.push(qt.context);
  }

  return parts.join(" ").toLowerCase();
}

/**
 * Check if a single obligation rule is satisfied by the evidence corpus.
 * Returns matched keywords if found, empty array if not.
 */
function matchRuleAgainstCorpus(rule: ObligationRule, corpus: string): string[] {
  const matched: string[] = [];

  for (const keyword of rule.detectionKeywords) {
    if (corpus.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }

  // Also check entity type keywords
  for (const entityType of rule.detectionEntities) {
    if (corpus.includes(entityType.toLowerCase())) {
      matched.push(`[entity:${entityType}]`);
    }
  }

  return matched;
}

/**
 * Run gap detection for a case. Compares all extracted evidence against the domain's obligation rules.
 * Returns a structured result without writing to the database.
 */
export async function detectEvidenceGaps(caseId: number, pipelineType: string): Promise<GapDetectionResult | null> {
  const ruleSet = getDomainRules(pipelineType);
  if (!ruleSet) return null; // No rules defined for this domain

  const corpus = await buildEvidenceCorpus(caseId);
  if (!corpus || corpus.trim().length === 0) return null; // No evidence to check against

  const missingList: GapDetectionResult["missingRecords"] = [];
  const matchedList: GapDetectionResult["matchedRecords"] = [];

  for (const rule of ruleSet.rules) {
    const matchedKeywords = matchRuleAgainstCorpus(rule, corpus);

    if (matchedKeywords.length > 0) {
      matchedList.push({
        recordType: rule.recordType,
        label: rule.label,
        matchedKeywords,
      });
    } else {
      missingList.push({
        recordType: rule.recordType,
        label: rule.label,
        severity: rule.severity,
        legalBasis: rule.legalBasis,
        foiaEligible: rule.foiaEligible,
      });
    }
  }

  return {
    domain: ruleSet.domain,
    totalRules: ruleSet.rules.length,
    rulesMatched: matchedList.length,
    rulesMissing: missingList.length,
    missingRecords: missingList,
    matchedRecords: matchedList,
  };
}

/**
 * Run gap detection AND persist results to the missing_records table.
 * Handles upsert logic:
 *   - New gaps → insert with status "detected"
 *   - Previously missing, now found → update status to "received"
 *   - Previously missing, still missing → no change
 *   - User-acknowledged or manually set statuses → preserved (not overwritten)
 */
export async function detectAndPersistGaps(caseId: number, pipelineType: string): Promise<GapDetectionResult | null> {
  const result = await detectEvidenceGaps(caseId, pipelineType);
  if (!result) return null;

  const now = Date.now();
  const ruleSet = getDomainRules(pipelineType)!;

  // Fetch existing missing records for this case + domain
  const existing = await db.select().from(missingRecords)
    .where(and(
      eq(missingRecords.caseId, caseId),
      eq(missingRecords.domain, result.domain),
    ));

  const existingByType: Record<string, typeof existing[number]> = {};
  for (const r of existing) {
    existingByType[r.recordType] = r;
  }
  const missingTypes = new Set(result.missingRecords.map((r: { recordType: string }) => r.recordType));

  // Insert new gaps
  for (const missing of result.missingRecords) {
    const existingRecord = existingByType[missing.recordType];
    if (!existingRecord) {
      // New gap — insert
      const rule = ruleSet.rules.find(r => r.recordType === missing.recordType)!;
      await db.insert(missingRecords).values({
        caseId,
        domain: result.domain,
        recordType: missing.recordType,
        label: missing.label,
        description: rule.description,
        legalBasis: rule.legalBasis,
        severity: missing.severity,
        agencyType: rule.agencyType,
        foiaEligible: missing.foiaEligible,
        status: "detected",
        detectedAt: now,
        updatedAt: now,
      });
    }
    // If it already exists with status "detected", leave it alone
    // If it exists with a user-set status (acknowledged, requested, not_applicable), preserve it
  }

  // Update records that were previously missing but are now found
  for (const recordType of Object.keys(existingByType)) {
    const existingRecord = existingByType[recordType];
    if (!missingTypes.has(recordType) && existingRecord.status === "detected") {
      // This record was previously missing but is now found in the evidence
      await db.update(missingRecords)
        .set({ status: "received", updatedAt: now })
        .where(eq(missingRecords.id, existingRecord.id));
    }
  }

  // ─── Pattern Detection Hook (Session 8): detect record_gap_pattern from new missing records ───
  try {
    // Collect IDs of newly inserted missing records
    const allCurrent = await db.select({ id: missingRecords.id }).from(missingRecords)
      .where(and(
        eq(missingRecords.caseId, caseId),
        eq(missingRecords.domain, result.domain),
        eq(missingRecords.status, "detected"),
      ));
    const newMissingIds = allCurrent.map((r: any) => r.id);
    if (newMissingIds.length > 0) {
      const { runPatternDetection } = await import("./pattern-detection");
      const patternResult = await runPatternDetection({
        caseId,
        missingRecordIds: newMissingIds,
      });
      if (patternResult.totalRegistered > 0) {
        console.log(`[GapDetection] Pattern detection: ${patternResult.totalRegistered} new record gap patterns registered for case ${caseId}`);
      }
    }
  } catch (patternErr) {
    console.warn("[GapDetection] Pattern detection hook failed (non-blocking):", patternErr);
  }

  return result;
}

/**
 * Get all missing records for a case, optionally filtered by status.
 */
export async function getMissingRecordsForCase(
  caseId: number,
  statusFilter?: ("detected" | "acknowledged" | "requested" | "received" | "not_applicable")[]
) {
  const rows = await db.select().from(missingRecords)
    .where(eq(missingRecords.caseId, caseId));

  if (statusFilter && statusFilter.length > 0) {
    return rows.filter((r: typeof rows[number]) => statusFilter.includes(r.status as any));
  }
  return rows;
}

/**
 * Update the status of a missing record (user action).
 */
export async function updateMissingRecordStatus(
  id: number,
  status: "detected" | "acknowledged" | "requested" | "received" | "not_applicable"
) {
  await db.update(missingRecords)
    .set({ status, updatedAt: Date.now() })
    .where(eq(missingRecords.id, id));
}

/**
 * Get a summary of missing records for a case — counts by severity and status.
 */
export async function getMissingRecordsSummary(caseId: number) {
  const rows = await db.select().from(missingRecords)
    .where(eq(missingRecords.caseId, caseId));

  const summary = {
    total: rows.length,
    bySeverity: { critical: 0, important: 0, helpful: 0 },
    byStatus: { detected: 0, acknowledged: 0, requested: 0, received: 0, not_applicable: 0 },
    activeGaps: 0, // detected + acknowledged (not yet resolved)
  };

  for (const row of rows) {
    summary.bySeverity[row.severity as keyof typeof summary.bySeverity]++;
    summary.byStatus[row.status as keyof typeof summary.byStatus]++;
    if (row.status === "detected" || row.status === "acknowledged") {
      summary.activeGaps++;
    }
  }

  return summary;
}
