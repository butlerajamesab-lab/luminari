/**
 * Pattern Detection Engine — Session 7
 *
 * Deterministic cross-case pattern detection. No LLM calls.
 *
 * Architecture:
 * T1. Signature generation: canonical, lowercase, composite keys
 * T2. Pattern registration: upsert pattern + record occurrence
 * T3. Detection rules: entity_recurrence, agency_behavior, denial_language_pattern,
 *     foia_denial_pattern, record_gap_pattern, regulatory_violation_pattern
 * T4. Detection hooks: incremental, triggered during pipeline execution
 * T5. Query helpers: getPatternsForCase, getCasesForPattern, getPatternSummary
 *
 * Constraints:
 * - All detection is deterministic (no LLM)
 * - Signatures are canonical and lowercase
 * - Detection runs incrementally (new evidence only, not full DB scan)
 * - Duplicate occurrences are prevented by UNIQUE constraint
 */

import { createHash } from "crypto";
import { db } from "./db";
import {
  patterns, patternTypes, patternOccurrences,
  entities, foiaRequests, missingRecords, claims, findings,
  cases,
} from "../drizzle/schema";
import type { PatternTypeValue } from "../drizzle/schema";
import { eq, and, sql, inArray, desc, count } from "drizzle-orm";

// ─── T1. Signature Generation ───

/**
 * Generate a deterministic canonical signature for a pattern.
 *
 * T1.1: Normalize all string components to lowercase, trimmed.
 * T1.2: Sort components alphabetically by key.
 * T1.3: Join as "key=value" pairs separated by "|".
 * T1.4: SHA-256 hash the joined string.
 * T1.5: Prefix with pattern type for readability.
 *
 * Example:
 *   generateSignature("entity_recurrence", { entityName: "John Doe", entityType: "person" })
 *   → "entity_recurrence:sha256(entityname=john doe|entitytype=person)"
 */
export function generateSignature(
  patternType: PatternTypeValue,
  components: Record<string, string | number>,
): string {
  // T1.1: Normalize values
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(components)) {
    const normalizedKey = key.toLowerCase().trim();
    const normalizedValue = String(value).toLowerCase().trim();
    normalized[normalizedKey] = normalizedValue;
  }

  // T1.2: Sort by key
  const sortedKeys = Object.keys(normalized).sort();

  // T1.3: Join
  const joined = sortedKeys.map(k => `${k}=${normalized[k]}`).join("|");

  // T1.4: Hash
  const hash = createHash("sha256").update(joined).digest("hex").slice(0, 32);

  // T1.5: Prefix
  return `${patternType}:${hash}`;
}

/**
 * Normalize an entity name for signature matching.
 * T1.6: Lowercase, trim, collapse whitespace, remove common suffixes.
 */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(inc|llc|corp|ltd|co|dept|department)\b\.?/gi, "")
    .trim();
}

/**
 * Normalize an agency name for signature matching.
 * T1.7: Lowercase, trim, collapse whitespace.
 */
export function normalizeAgencyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ─── T2. Pattern Registration ───

/**
 * Look up a pattern type ID by its string value.
 * Caches results in-memory for the process lifetime.
 */
export const patternTypeCache = new Map<string, number>();

export async function getPatternTypeId(patternType: PatternTypeValue): Promise<number> {
  if (patternTypeCache.has(patternType)) {
    return patternTypeCache.get(patternType)!;
  }

  const [row] = await db.select({ id: patternTypes.id })
    .from(patternTypes)
    .where(eq(patternTypes.patternType, patternType));

  if (!row) {
    throw new Error(`Pattern type "${patternType}" not found in pattern_types table.`);
  }

  patternTypeCache.set(patternType, row.id);
  return row.id;
}

/**
 * Register a pattern occurrence. Upserts the pattern (by signature) and
 * records the occurrence (deduplicated by UNIQUE constraint).
 *
 * T2.1: Look up or create pattern by signature.
 * T2.2: Update lastSeenAt and occurrenceCount on existing patterns.
 * T2.3: Insert occurrence (skip if duplicate via UNIQUE constraint).
 *
 * Returns { patternId, occurrenceId, isNewPattern, isNewOccurrence }.
 */
export async function registerPatternOccurrence(params: {
  patternType: PatternTypeValue;
  signatureComponents: Record<string, string | number>;
  description: string;
  caseId: number;
  evidenceReferenceId: number;
  evidenceReferenceType: string;
  entityId?: number;
  agencyId?: number;
}): Promise<{
  patternId: number;
  occurrenceId: number | null;
  isNewPattern: boolean;
  isNewOccurrence: boolean;
}> {
  const signature = generateSignature(params.patternType, params.signatureComponents);
  const patternTypeId = await getPatternTypeId(params.patternType);
  const now = Date.now();

  // T2.1: Upsert pattern
  let isNewPattern = false;
  let [existingPattern] = await db.select({ id: patterns.id })
    .from(patterns)
    .where(eq(patterns.signature, signature));

  let patternId: number;

  if (existingPattern) {
    patternId = existingPattern.id;
    // T2.2: Update lastSeenAt and increment occurrenceCount
    await db.update(patterns)
      .set({
        lastSeenAt: now,
        occurrenceCount: sql`${patterns.occurrenceCount} + 1`,
      })
      .where(eq(patterns.id, patternId));
  } else {
    isNewPattern = true;
    const [inserted] = await db.insert(patterns).values({
      patternTypeId,
      signature,
      description: params.description,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      createdAt: now,
    });
    patternId = inserted.insertId;
  }

  // T2.3: Insert occurrence (deduplicated by UNIQUE constraint)
  let occurrenceId: number | null = null;
  let isNewOccurrence = false;

  try {
    const [inserted] = await db.insert(patternOccurrences).values({
      patternId,
      caseId: params.caseId,
      entityId: params.entityId ?? null,
      agencyId: params.agencyId ?? null,
      evidenceReferenceId: params.evidenceReferenceId,
      evidenceReferenceType: params.evidenceReferenceType,
      createdAt: now,
    });
    occurrenceId = inserted.insertId;
    isNewOccurrence = true;
  } catch (err: any) {
    // Duplicate entry — occurrence already exists
    if (err.code === "ER_DUP_ENTRY" || err.message?.includes("Duplicate entry") || err.cause?.message?.includes("Duplicate entry")) {
      // Revert the occurrenceCount increment since this was a duplicate
      if (!isNewPattern) {
        await db.update(patterns)
          .set({
            occurrenceCount: sql`GREATEST(${patterns.occurrenceCount} - 1, 1)`,
          })
          .where(eq(patterns.id, patternId));
      }
    } else {
      throw err;
    }
  }

  return { patternId, occurrenceId, isNewPattern, isNewOccurrence };
}

// ─── T3. Detection Rules ───

/**
 * T3.1: Entity Recurrence Detection
 *
 * Detects when the same entity (by normalized name + type) appears
 * in more than one case.
 *
 * Runs incrementally: given a set of entity IDs from the current pipeline run,
 * checks if any matching entities exist in other cases.
 */
export async function detectEntityRecurrence(
  caseId: number,
  entityIds: number[],
): Promise<{ detected: number; registered: number }> {
  if (entityIds.length === 0) return { detected: 0, registered: 0 };

  // Load entities for this case
  const caseEntities = await db.select({
    id: entities.id,
    name: entities.name,
    type: entities.type,
    caseId: entities.caseId,
  })
    .from(entities)
    .where(inArray(entities.id, entityIds));

  let detected = 0;
  let registered = 0;

  for (const entity of caseEntities) {
    const normalizedName = normalizeEntityName(entity.name);
    if (!normalizedName) continue;

    // Find matching entities in OTHER cases
    const matches = await db.select({
      id: entities.id,
      caseId: entities.caseId,
      name: entities.name,
    })
      .from(entities)
      .where(
        and(
          sql`LOWER(${entities.name}) LIKE ${`%${normalizedName}%`}`,
          eq(entities.type, entity.type),
          sql`${entities.caseId} != ${caseId}`,
        )
      );

    if (matches.length > 0) {
      detected++;
      const result = await registerPatternOccurrence({
        patternType: "entity_recurrence",
        signatureComponents: {
          entityName: normalizedName,
          entityType: entity.type,
        },
        description: `Entity "${entity.name}" (${entity.type}) appears across multiple cases.`,
        caseId,
        evidenceReferenceId: entity.id,
        evidenceReferenceType: "entity",
        entityId: entity.id,
      });

      if (result.isNewOccurrence) registered++;

      // Also register occurrences for the matching entities in other cases
      for (const match of matches) {
        const matchResult = await registerPatternOccurrence({
          patternType: "entity_recurrence",
          signatureComponents: {
            entityName: normalizedName,
            entityType: entity.type,
          },
          description: `Entity "${match.name}" (${entity.type}) appears across multiple cases.`,
          caseId: match.caseId,
          evidenceReferenceId: match.id,
          evidenceReferenceType: "entity",
          entityId: match.id,
        });
        if (matchResult.isNewOccurrence) registered++;
      }
    }
  }

  return { detected, registered };
}

/**
 * T3.2: FOIA Denial Pattern Detection
 *
 * Detects when FOIA requests to the same agency repeatedly result in
 * denial or partial_denial across cases.
 */
export async function detectFoiaDenialPattern(
  caseId: number,
  foiaRequestIds: number[],
): Promise<{ detected: number; registered: number }> {
  if (foiaRequestIds.length === 0) return { detected: 0, registered: 0 };

  // Load denied/partial FOIA requests for this case
  const deniedRequests = await db.select({
    id: foiaRequests.id,
    agencyId: foiaRequests.agencyId,
    agencyName: foiaRequests.agencyName,
    domain: foiaRequests.domain,
    status: foiaRequests.status,
  })
    .from(foiaRequests)
    .where(
      and(
        inArray(foiaRequests.id, foiaRequestIds),
        inArray(foiaRequests.status, ["denied", "partial_denial"]),
      )
    );

  let detected = 0;
  let registered = 0;

  for (const req of deniedRequests) {
    if (!req.agencyName) continue;

    const normalizedAgency = normalizeAgencyName(req.agencyName);

    // Find other denied requests to the same agency in OTHER cases
    const otherDenials = await db.select({
      id: foiaRequests.id,
      caseId: foiaRequests.caseId,
    })
      .from(foiaRequests)
      .where(
        and(
          sql`LOWER(${foiaRequests.agencyName}) = ${normalizedAgency}`,
          inArray(foiaRequests.status, ["denied", "partial_denial"]),
          sql`${foiaRequests.caseId} != ${caseId}`,
        )
      );

    if (otherDenials.length > 0) {
      detected++;
      const result = await registerPatternOccurrence({
        patternType: "foia_denial_pattern",
        signatureComponents: {
          agencyName: normalizedAgency,
          domain: req.domain,
        },
        description: `FOIA requests to "${req.agencyName}" repeatedly denied across cases.`,
        caseId,
        evidenceReferenceId: req.id,
        evidenceReferenceType: "foia_request",
        agencyId: req.agencyId ?? undefined,
      });
      if (result.isNewOccurrence) registered++;
    }
  }

  return { detected, registered };
}

/**
 * T3.3: Record Gap Pattern Detection
 *
 * Detects when the same type of missing record appears across multiple cases,
 * suggesting a systemic gap.
 */
export async function detectRecordGapPattern(
  caseId: number,
  missingRecordIds: number[],
): Promise<{ detected: number; registered: number }> {
  if (missingRecordIds.length === 0) return { detected: 0, registered: 0 };

  // Load missing records for this case
  const caseGaps = await db.select({
    id: missingRecords.id,
    recordType: missingRecords.recordType,
    domain: missingRecords.domain,
    agencyType: missingRecords.agencyType,
  })
    .from(missingRecords)
    .where(inArray(missingRecords.id, missingRecordIds));

  let detected = 0;
  let registered = 0;

  for (const gap of caseGaps) {
    // Find same record type gaps in OTHER cases
    const otherGaps = await db.select({
      id: missingRecords.id,
      caseId: missingRecords.caseId,
    })
      .from(missingRecords)
      .where(
        and(
          eq(missingRecords.recordType, gap.recordType),
          eq(missingRecords.domain, gap.domain),
          sql`${missingRecords.caseId} != ${caseId}`,
        )
      );

    if (otherGaps.length > 0) {
      detected++;
      const result = await registerPatternOccurrence({
        patternType: "record_gap_pattern",
        signatureComponents: {
          recordType: gap.recordType,
          domain: gap.domain,
          agencyType: gap.agencyType || "unknown",
        },
        description: `Missing "${gap.recordType}" records detected across multiple ${gap.domain} cases.`,
        caseId,
        evidenceReferenceId: gap.id,
        evidenceReferenceType: "missing_record",
      });
      if (result.isNewOccurrence) registered++;
    }
  }

  return { detected, registered };
}

/**
 * T3.4: Agency Behavior Pattern Detection
 *
 * Detects when the same agency exhibits repeated behavioral patterns
 * across cases (e.g., systematic delays, non-compliance with FOIA).
 * Triggered when FOIA requests are submitted and tracked.
 */
export async function detectAgencyBehaviorPattern(
  caseId: number,
  foiaRequestIds: number[],
): Promise<{ detected: number; registered: number }> {
  if (foiaRequestIds.length === 0) return { detected: 0, registered: 0 };

  // Load FOIA requests for this case that have been submitted
  const caseRequests = await db.select({
    id: foiaRequests.id,
    agencyId: foiaRequests.agencyId,
    agencyName: foiaRequests.agencyName,
    domain: foiaRequests.domain,
    status: foiaRequests.status,
    submittedAt: foiaRequests.submittedAt,
    responseDueAt: foiaRequests.responseDueAt,
    responseReceivedAt: foiaRequests.responseReceivedAt,
  })
    .from(foiaRequests)
    .where(inArray(foiaRequests.id, foiaRequestIds));

  let detected = 0;
  let registered = 0;

  // Check for overdue responses (agency non-compliance)
  const now = Date.now();
  const overdueRequests = caseRequests.filter(
    r => r.responseDueAt && r.responseDueAt < now && !r.responseReceivedAt
      && !["records_produced", "closed"].includes(r.status)
  );

  for (const req of overdueRequests) {
    if (!req.agencyName) continue;
    const normalizedAgency = normalizeAgencyName(req.agencyName);

    // Find other overdue requests to the same agency
    const otherOverdue = await db.select({
      id: foiaRequests.id,
      caseId: foiaRequests.caseId,
    })
      .from(foiaRequests)
      .where(
        and(
          sql`LOWER(${foiaRequests.agencyName}) = ${normalizedAgency}`,
          sql`${foiaRequests.responseDueAt} < ${now}`,
          sql`${foiaRequests.responseReceivedAt} IS NULL`,
          sql`${foiaRequests.caseId} != ${caseId}`,
        )
      );

    if (otherOverdue.length > 0) {
      detected++;
      const result = await registerPatternOccurrence({
        patternType: "agency_behavior",
        signatureComponents: {
          agencyName: normalizedAgency,
          behaviorType: "overdue_response",
        },
        description: `"${req.agencyName}" has overdue FOIA responses across multiple cases.`,
        caseId,
        evidenceReferenceId: req.id,
        evidenceReferenceType: "foia_request",
        agencyId: req.agencyId ?? undefined,
      });
      if (result.isNewOccurrence) registered++;
    }
  }

  return { detected, registered };
}

/**
 * T3.5: Denial Language Pattern Detection (CDA)
 *
 * Detects when the same normalized denial reason code appears across
 * multiple CDA runs in different cases.
 *
 * This imports from the CDA schema tables directly.
 */
export async function detectDenialLanguagePattern(
  caseId: number,
  runId: number,
): Promise<{ detected: number; registered: number }> {
  // Import CDA tables dynamically to avoid circular deps
  const { cdaDenialReasons, cdaRuns } = await import("../drizzle/cda-schema");

  // Get denial reasons for this run
  const runReasons = await db.select({
    id: cdaDenialReasons.id,
    normalizedReasonCode: cdaDenialReasons.normalizedReasonCode,
    reasonTextVerbatim: cdaDenialReasons.reasonTextVerbatim,
  })
    .from(cdaDenialReasons)
    .where(eq(cdaDenialReasons.runId, runId));

  let detected = 0;
  let registered = 0;

  for (const reason of runReasons) {
    // Find same reason code in OTHER cases' CDA runs
    const otherReasons = await db.select({
      id: cdaDenialReasons.id,
      runId: cdaDenialReasons.runId,
    })
      .from(cdaDenialReasons)
      .innerJoin(cdaRuns, eq(cdaDenialReasons.runId, cdaRuns.id))
      .where(
        and(
          eq(cdaDenialReasons.normalizedReasonCode, reason.normalizedReasonCode),
          sql`${cdaRuns.caseId} != ${caseId}`,
        )
      );

    if (otherReasons.length > 0) {
      detected++;
      const result = await registerPatternOccurrence({
        patternType: "denial_language_pattern",
        signatureComponents: {
          normalizedReasonCode: reason.normalizedReasonCode,
        },
        description: `Denial reason "${reason.normalizedReasonCode}" appears across multiple cases.`,
        caseId,
        evidenceReferenceId: reason.id,
        evidenceReferenceType: "cda_denial_reason",
      });
      if (result.isNewOccurrence) registered++;
    }
  }

  return { detected, registered };
}

// ─── T4. Composite Detection Hook ───

/**
 * Run all applicable pattern detection rules for a case.
 * Called incrementally during pipeline execution.
 *
 * T4.1: Determine which detection rules apply based on available data.
 * T4.2: Run each applicable rule.
 * T4.3: Return aggregate results.
 */
export async function runPatternDetection(params: {
  caseId: number;
  entityIds?: number[];
  foiaRequestIds?: number[];
  missingRecordIds?: number[];
  cdaRunId?: number;
}): Promise<{
  totalDetected: number;
  totalRegistered: number;
  results: Record<string, { detected: number; registered: number }>;
}> {
  const results: Record<string, { detected: number; registered: number }> = {};
  let totalDetected = 0;
  let totalRegistered = 0;

  // T4.1-T4.2: Run applicable rules
  if (params.entityIds && params.entityIds.length > 0) {
    const entityResult = await detectEntityRecurrence(params.caseId, params.entityIds);
    results.entity_recurrence = entityResult;
    totalDetected += entityResult.detected;
    totalRegistered += entityResult.registered;
  }

  if (params.foiaRequestIds && params.foiaRequestIds.length > 0) {
    const foiaDenialResult = await detectFoiaDenialPattern(params.caseId, params.foiaRequestIds);
    results.foia_denial_pattern = foiaDenialResult;
    totalDetected += foiaDenialResult.detected;
    totalRegistered += foiaDenialResult.registered;

    const agencyResult = await detectAgencyBehaviorPattern(params.caseId, params.foiaRequestIds);
    results.agency_behavior = agencyResult;
    totalDetected += agencyResult.detected;
    totalRegistered += agencyResult.registered;
  }

  if (params.missingRecordIds && params.missingRecordIds.length > 0) {
    const gapResult = await detectRecordGapPattern(params.caseId, params.missingRecordIds);
    results.record_gap_pattern = gapResult;
    totalDetected += gapResult.detected;
    totalRegistered += gapResult.registered;
  }

  if (params.cdaRunId) {
    const denialResult = await detectDenialLanguagePattern(params.caseId, params.cdaRunId);
    results.denial_language_pattern = denialResult;
    totalDetected += denialResult.detected;
    totalRegistered += denialResult.registered;
  }

  return { totalDetected, totalRegistered, results };
}

// ─── T5. Query Helpers ───

/**
 * Get all patterns detected for a specific case, with occurrence details.
 */
export async function getPatternsForCase(caseId: number): Promise<{
  patternId: number;
  patternType: string;
  signature: string;
  description: string;
  occurrenceCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  caseOccurrences: {
    id: number;
    evidenceReferenceId: number;
    evidenceReferenceType: string;
    entityId: number | null;
    agencyId: number | null;
    createdAt: number;
  }[];
}[]> {
  // Get all occurrences for this case
  const occurrences = await db.select({
    occurrenceId: patternOccurrences.id,
    patternId: patternOccurrences.patternId,
    evidenceReferenceId: patternOccurrences.evidenceReferenceId,
    evidenceReferenceType: patternOccurrences.evidenceReferenceType,
    entityId: patternOccurrences.entityId,
    agencyId: patternOccurrences.agencyId,
    occurrenceCreatedAt: patternOccurrences.createdAt,
    // Pattern fields
    patternType: patternTypes.patternType,
    signature: patterns.signature,
    description: patterns.description,
    occurrenceCount: patterns.occurrenceCount,
    firstSeenAt: patterns.firstSeenAt,
    lastSeenAt: patterns.lastSeenAt,
  })
    .from(patternOccurrences)
    .innerJoin(patterns, eq(patternOccurrences.patternId, patterns.id))
    .innerJoin(patternTypes, eq(patterns.patternTypeId, patternTypes.id))
    .where(eq(patternOccurrences.caseId, caseId))
    .orderBy(desc(patterns.occurrenceCount));

  // Group by pattern
  const patternMap = new Map<number, {
    patternId: number;
    patternType: string;
    signature: string;
    description: string;
    occurrenceCount: number;
    firstSeenAt: number;
    lastSeenAt: number;
    caseOccurrences: {
      id: number;
      evidenceReferenceId: number;
      evidenceReferenceType: string;
      entityId: number | null;
      agencyId: number | null;
      createdAt: number;
    }[];
  }>();

  for (const row of occurrences) {
    if (!patternMap.has(row.patternId)) {
      patternMap.set(row.patternId, {
        patternId: row.patternId,
        patternType: row.patternType,
        signature: row.signature,
        description: row.description,
        occurrenceCount: row.occurrenceCount,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        caseOccurrences: [],
      });
    }
    patternMap.get(row.patternId)!.caseOccurrences.push({
      id: row.occurrenceId,
      evidenceReferenceId: row.evidenceReferenceId,
      evidenceReferenceType: row.evidenceReferenceType,
      entityId: row.entityId,
      agencyId: row.agencyId,
      createdAt: row.occurrenceCreatedAt,
    });
  }

  return Array.from(patternMap.values());
}

/**
 * Get all cases that share a specific pattern, with case metadata.
 */
export async function getCasesForPattern(patternId: number): Promise<{
  caseId: number;
  caseName: string;
  pipelineType: string | null;
  occurrenceCount: number;
  firstSeen: number;
}[]> {
  const rows = await db.select({
    caseId: patternOccurrences.caseId,
    caseName: cases.name,
    pipelineType: cases.pipelineType,
    occurrenceCount: count(patternOccurrences.id),
    firstSeen: sql<number>`MIN(${patternOccurrences.createdAt})`,
  })
    .from(patternOccurrences)
    .innerJoin(cases, eq(patternOccurrences.caseId, cases.id))
    .where(eq(patternOccurrences.patternId, patternId))
    .groupBy(patternOccurrences.caseId, cases.name, cases.pipelineType)
    .orderBy(desc(count(patternOccurrences.id)));

  return rows.map(r => ({
    caseId: r.caseId,
    caseName: r.caseName,
    pipelineType: r.pipelineType,
    occurrenceCount: Number(r.occurrenceCount),
    firstSeen: Number(r.firstSeen),
  }));
}

/**
 * Get a summary of all patterns across all cases for the current user.
 * Used for the global pattern view.
 */
export async function getPatternSummary(userId: number): Promise<{
  patternId: number;
  patternType: string;
  description: string;
  occurrenceCount: number;
  caseCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
}[]> {
  const rows = await db.select({
    patternId: patterns.id,
    patternType: patternTypes.patternType,
    description: patterns.description,
    occurrenceCount: patterns.occurrenceCount,
    caseCount: sql<number>`COUNT(DISTINCT ${patternOccurrences.caseId})`,
    firstSeenAt: patterns.firstSeenAt,
    lastSeenAt: patterns.lastSeenAt,
  })
    .from(patterns)
    .innerJoin(patternTypes, eq(patterns.patternTypeId, patternTypes.id))
    .innerJoin(patternOccurrences, eq(patternOccurrences.patternId, patterns.id))
    .innerJoin(cases, eq(patternOccurrences.caseId, cases.id))
    .where(eq(cases.userId, userId))
    .groupBy(patterns.id, patternTypes.patternType, patterns.description,
      patterns.occurrenceCount, patterns.firstSeenAt, patterns.lastSeenAt)
    .orderBy(desc(patterns.occurrenceCount));

  return rows.map(r => ({
    patternId: r.patternId,
    patternType: r.patternType,
    description: r.description,
    occurrenceCount: r.occurrenceCount,
    caseCount: Number(r.caseCount),
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
  }));
}

/**
 * Get pattern count for a case (lightweight summary for Case Overview).
 */
export async function getPatternCountForCase(caseId: number): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  const rows = await db.select({
    patternType: patternTypes.patternType,
    count: count(patternOccurrences.id),
  })
    .from(patternOccurrences)
    .innerJoin(patterns, eq(patternOccurrences.patternId, patterns.id))
    .innerJoin(patternTypes, eq(patterns.patternTypeId, patternTypes.id))
    .where(eq(patternOccurrences.caseId, caseId))
    .groupBy(patternTypes.patternType);

  const byType: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byType[row.patternType] = Number(row.count);
    total += Number(row.count);
  }

  return { total, byType };
}

// ─── T6. Trend Data (Pattern Trend Visualization) ───

/**
 * A single data point in the pattern trend timeline.
 * Each point represents the cumulative count of pattern occurrences
 * for a given type on a specific date.
 */
export interface TrendDataPoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Pattern type key */
  patternType: string;
  /** Number of new occurrences on this date */
  count: number;
  /** Running cumulative total up to and including this date */
  cumulative: number;
}

/**
 * Get pattern trend data for a user's cases.
 *
 * T6.1: Query all pattern occurrences for the user's cases, grouped by date and type.
 * T6.2: Build cumulative running totals per type.
 * T6.3: Return both daily counts and cumulative totals for flexible charting.
 *
 * The data is suitable for:
 * - Area/line chart showing cumulative growth of patterns over time
 * - Bar chart showing daily detection volume
 * - Stacked chart showing type breakdown
 */
export async function getPatternTrendData(userId: number): Promise<{
  points: TrendDataPoint[];
  typeLabels: Record<string, string>;
  totalOccurrences: number;
  dateRange: { earliest: string | null; latest: string | null };
}> {
  // T6.1: Query occurrences grouped by date and pattern type
  const rows = await db.select({
    patternType: patternTypes.patternType,
    createdAt: patternOccurrences.createdAt,
    occCount: count(patternOccurrences.id),
  })
    .from(patternOccurrences)
    .innerJoin(patterns, eq(patternOccurrences.patternId, patterns.id))
    .innerJoin(patternTypes, eq(patterns.patternTypeId, patternTypes.id))
    .innerJoin(cases, eq(patternOccurrences.caseId, cases.id))
    .where(eq(cases.userId, userId))
    .groupBy(
      patternTypes.patternType,
      sql`DATE(FROM_UNIXTIME(${patternOccurrences.createdAt} / 1000))`
    )
    .orderBy(
      sql`DATE(FROM_UNIXTIME(${patternOccurrences.createdAt} / 1000))`,
      patternTypes.patternType
    );

  // T6.2: Build daily counts keyed by date+type
  const dailyMap = new Map<string, Map<string, number>>();
  const allTypes = new Set<string>();

  for (const row of rows) {
    const dateStr = new Date(row.createdAt).toISOString().split("T")[0];
    allTypes.add(row.patternType);

    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, new Map());
    }
    const typeMap = dailyMap.get(dateStr)!;
    typeMap.set(row.patternType, (typeMap.get(row.patternType) || 0) + Number(row.occCount));
  }

  // Sort dates chronologically
  const sortedDates = Array.from(dailyMap.keys()).sort();
  const sortedTypes = Array.from(allTypes).sort();

  // T6.3: Build cumulative running totals
  const cumulatives: Record<string, number> = {};
  for (const t of sortedTypes) {
    cumulatives[t] = 0;
  }

  const points: TrendDataPoint[] = [];
  let totalOccurrences = 0;

  for (const date of sortedDates) {
    const typeMap = dailyMap.get(date)!;
    for (const type of sortedTypes) {
      const dayCount = typeMap.get(type) || 0;
      cumulatives[type] += dayCount;
      totalOccurrences += dayCount;

      // Only emit points where there's activity or a cumulative > 0
      if (cumulatives[type] > 0) {
        points.push({
          date,
          patternType: type,
          count: dayCount,
          cumulative: cumulatives[type],
        });
      }
    }
  }

  // Type labels for display
  const typeLabels: Record<string, string> = {
    entity_recurrence: "Entity Recurrence",
    agency_behavior: "Agency Behavior",
    denial_language_pattern: "Denial Language",
    foia_denial_pattern: "FOIA Denial",
    record_gap_pattern: "Record Gap",
    regulatory_violation_pattern: "Regulatory Violation",
  };

  return {
    points,
    typeLabels,
    totalOccurrences,
    dateRange: {
      earliest: sortedDates[0] || null,
      latest: sortedDates[sortedDates.length - 1] || null,
    },
  };
}
