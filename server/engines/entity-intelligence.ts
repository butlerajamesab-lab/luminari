/**
 * Entity Intelligence Layer (Session 72)
 *
 * T1. Extract entity mentions from signals and ingested records
 * T2. Resolve aliases to canonical entity names
 * T3. Classify entities by type (corporation, attorney, government_agency, etc.)
 * T4. Build entity profiles with aggregated metrics
 * T5. Detect and store entity relationships
 * T6. Compute entity confidence scores
 *
 * This layer sits between the Signal Engine and the Pattern Registry,
 * converting raw text mentions into structured, queryable entity profiles.
 */

import { db } from "../db";
import {
  entityRegistry,
  entityRelationships,
  detectedSignals,
  ingestedRecords,
  patternRegistry,
} from "../../drizzle/schema";
import { eq, and, sql, desc, asc, count, like, or } from "drizzle-orm";

// ─── Alias Resolution Map ───
// Common corporate aliases that should resolve to a single canonical name
const ALIAS_MAP: Record<string, string[]> = {
  "Amazon.com": ["Amazon", "Amazon Inc", "Amazon.com Inc", "Amazon Services LLC", "Amazon Web Services", "AWS"],
  "Facebook/Meta": ["Facebook", "Meta", "Meta Platforms", "Facebook Inc", "Meta Platforms Inc"],
  "Google": ["Google LLC", "Alphabet", "Alphabet Inc", "Google Inc"],
  "Apple": ["Apple Inc", "Apple Computer"],
  "Microsoft": ["Microsoft Corp", "Microsoft Corporation"],
  "Comcast/Xfinity": ["Comcast", "Xfinity", "Comcast Corporation", "Comcast Cable"],
  "AT&T": ["AT&T Inc", "AT&T Mobility", "ATT", "AT and T"],
  "Verizon": ["Verizon Communications", "Verizon Wireless"],
  "Wells Fargo": ["Wells Fargo Bank", "Wells Fargo & Company"],
  "Bank of America": ["Bank of America Corp", "BofA"],
  "JPMorgan Chase": ["JPMorgan", "Chase", "JP Morgan", "Chase Bank"],
  "Equifax": ["Equifax Inc"],
  "Experian": ["Experian PLC"],
  "TransUnion": ["TransUnion LLC"],
};

// Build reverse lookup: alias → canonical name
const REVERSE_ALIAS: Record<string, string> = {};
for (const [canonical, aliases] of Object.entries(ALIAS_MAP)) {
  for (const alias of aliases) {
    REVERSE_ALIAS[alias.toLowerCase()] = canonical;
  }
  REVERSE_ALIAS[canonical.toLowerCase()] = canonical;
}

// ─── Entity Type Classification Rules ───
const GOVERNMENT_KEYWORDS = [
  "department", "agency", "commission", "bureau", "office of",
  "administration", "authority", "board of", "federal", "state of",
  "county of", "city of", "FTC", "FCC", "SEC", "CFPB", "DOL", "HUD",
  "EPA", "FDA", "DOJ", "IRS",
];

const NONPROFIT_KEYWORDS = [
  "ACLU", "EFF", "NAACP", "NCLC", "Legal Aid", "Foundation",
  "Institute", "Association", "Society", "Coalition", "Alliance",
  "Center for", "National Consumer",
];

const LAW_FIRM_KEYWORDS = [
  "LLP", "Law Offices", "Law Firm", "& Associates", "Attorneys at Law",
  "Legal Group", "Law Group",
];

const CORP_KEYWORDS = [
  "Inc", "LLC", "Corp", "Corporation", "Ltd", "Company", "Co.",
  "Holdings", "Enterprises", "Group", "Partners",
];

// ─── T1. Entity Extraction ───

export interface ExtractedEntity {
  entityName: string;
  entityContext: string;
  entityRole: string;
  entitySource: string;
}

/**
 * Extract entity mentions from a signal's title and metadata.
 */
export function extractEntitiesFromSignal(signal: {
  signalType: string;
  title: string;
  entityName?: string | null;
  datasetId?: string | null;
  metadata?: any;
}): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // Direct entity name from signal
  if (signal.entityName && signal.entityName.trim().length > 1) {
    entities.push({
      entityName: signal.entityName.trim(),
      entityContext: signal.title,
      entityRole: inferRoleFromSignalType(signal.signalType),
      entitySource: signal.datasetId ?? "detected_signals",
    });
  }

  return entities;
}

function inferRoleFromSignalType(signalType: string): string {
  switch (signalType) {
    case "repeat_entity": return "subject";
    case "frequency_spike": return "sector";
    case "geographic_cluster": return "location";
    case "status_delay": return "affected_system";
    case "trend_anomaly": return "trend_subject";
    default: return "mentioned";
  }
}

// ─── T2. Entity Resolution ───

/**
 * Resolve an entity name to its canonical form using alias matching
 * and normalized name comparison.
 */
export function resolveEntityName(rawName: string): string {
  const normalized = rawName.trim();
  const lower = normalized.toLowerCase();

  // Direct alias match
  if (REVERSE_ALIAS[lower]) {
    return REVERSE_ALIAS[lower];
  }

  // Fuzzy suffix matching (e.g., "Amazon.com Services" → "Amazon.com")
  for (const [canonical, aliases] of Object.entries(ALIAS_MAP)) {
    if (lower.startsWith(canonical.toLowerCase())) return canonical;
    for (const alias of aliases) {
      if (lower.startsWith(alias.toLowerCase())) return canonical;
    }
  }

  return normalized;
}

// ─── T3. Entity Classification ───

export type EntityType =
  | "person" | "attorney" | "law_firm" | "corporation" | "business"
  | "government_agency" | "nonprofit" | "individual_litigant"
  | "organization" | "unknown";

/**
 * Classify an entity by type based on its name and context.
 */
export function classifyEntityType(name: string, context?: string): EntityType {
  const upper = name.toUpperCase();
  const lower = name.toLowerCase();

  // Government agencies
  for (const kw of GOVERNMENT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "government_agency";
  }

  // Nonprofits
  for (const kw of NONPROFIT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "nonprofit";
  }

  // Law firms
  for (const kw of LAW_FIRM_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "law_firm";
  }

  // Corporations (explicit suffixes)
  for (const kw of CORP_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "corporation";
  }

  // Known corporations from alias map
  if (REVERSE_ALIAS[lower]) return "corporation";

  // Person detection: "LASTNAME FIRSTNAME" pattern (all caps, no corp suffix)
  const isAllCaps = upper === name && name.includes(" ");
  if (isAllCaps && name.split(" ").length >= 2) {
    // Check if it looks like a person name (no corp keywords)
    const hasCorpWord = CORP_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
    if (!hasCorpWord) return "person";
  }

  // Default: if it has a dot (like Amazon.com) → business
  if (name.includes(".com") || name.includes(".org") || name.includes(".net")) {
    return "business";
  }

  return "unknown";
}

/**
 * Infer industry from entity name and context.
 */
export function inferIndustry(entityName: string, context?: string): string | null {
  const lower = entityName.toLowerCase();

  const industryMap: Record<string, string[]> = {
    "Technology": ["amazon", "google", "apple", "microsoft", "facebook", "meta"],
    "Telecommunications": ["comcast", "xfinity", "at&t", "verizon", "t-mobile", "sprint"],
    "Financial Services": ["wells fargo", "bank of america", "jpmorgan", "chase", "citibank"],
    "Credit Reporting": ["equifax", "experian", "transunion"],
    "Insurance": ["state farm", "allstate", "geico", "progressive"],
    "Healthcare": ["unitedhealth", "anthem", "cigna", "aetna", "humana"],
    "Real Estate": ["zillow", "redfin", "realtor"],
    "Automotive": ["tesla", "ford", "gm", "general motors", "toyota"],
    "Retail": ["walmart", "target", "costco"],
    "Energy": ["exxon", "chevron", "shell", "bp"],
  };

  for (const [industry, keywords] of Object.entries(industryMap)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return industry;
    }
  }

  return null;
}

// ─── T4. Entity Profile Management ───

/**
 * Register or update an entity in the entity_registry.
 * Uses upsert logic: if canonical name exists, update counts; otherwise insert.
 */
export async function registerEntity(params: {
  entityName: string;
  entityType?: EntityType;
  industry?: string | null;
  jurisdiction?: string | null;
  source?: string;
}) {
  const canonicalName = resolveEntityName(params.entityName);
  const entityType = params.entityType ?? classifyEntityType(canonicalName);
  const industry = params.industry ?? inferIndustry(canonicalName);
  const now = Date.now();

  // Check if entity already exists
  const [existing] = await db
    .select()
    .from(entityRegistry)
    .where(eq(entityRegistry.canonicalName, canonicalName))
    .limit(1);

  if (existing) {
    // Update last seen and counts
    await db
      .update(entityRegistry)
      .set({
        lastSeenAt: now,
        updatedAt: now,
        ...(industry && !existing.industry ? { industry } : {}),
        ...(params.jurisdiction && !existing.jurisdiction ? { jurisdiction: params.jurisdiction } : {}),
      })
      .where(eq(entityRegistry.id, existing.id));
    return existing;
  }

  // Insert new entity
  const aliases = ALIAS_MAP[canonicalName] ?? [];
  const [inserted] = await db.insert(entityRegistry).values({
    entityName: params.entityName,
    canonicalName,
    entityType,
    industry,
    jurisdiction: params.jurisdiction ?? null,
    aliases: aliases.length > 0 ? aliases : null,
    corporateParent: null,
    confidenceScore: 50,
    complaintCount: 0,
    litigationCount: 0,
    enforcementCount: 0,
    patternCount: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return { id: inserted.insertId, canonicalName, entityType };
}

/**
 * Get a full entity profile with aggregated metrics.
 */
export async function getEntityProfile(entityId: number) {
  const [entity] = await db
    .select()
    .from(entityRegistry)
    .where(eq(entityRegistry.id, entityId))
    .limit(1);

  if (!entity) return null;

  // Get relationships
  const relationships = await db
    .select()
    .from(entityRelationships)
    .where(
      or(
        eq(entityRelationships.entityIdA, entityId),
        eq(entityRelationships.entityIdB, entityId)
      )
    );

  // Get related entity names
  const relatedEntityIds = relationships.map((r: any) =>
    r.entityIdA === entityId ? r.entityIdB : r.entityIdA
  );

  let relatedEntities: { id: number; canonicalName: string; entityType: string }[] = [];
  if (relatedEntityIds.length > 0) {
    relatedEntities = await db
      .select({
        id: entityRegistry.id,
        canonicalName: entityRegistry.canonicalName,
        entityType: entityRegistry.entityType,
      })
      .from(entityRegistry)
      .where(sql`${entityRegistry.id} IN (${sql.join(relatedEntityIds.map((id: any) => sql`${id}`), sql`, `)})`);
  }

  // Count signals mentioning this entity
  const [signalCount] = await db
    .select({ count: count() })
    .from(detectedSignals)
    .where(eq(detectedSignals.entityId, entity.canonicalName));

  return {
    ...entity,
    signalCount: signalCount?.count ?? 0,
    relationships: relationships.map((r: any) => ({
      ...r,
      relatedEntityName: relatedEntities.find(
        e => e.id === (r.entityIdA === entityId ? r.entityIdB : r.entityIdA)
      )?.canonicalName ?? "Unknown",
    })),
    relatedEntities,
  };
}

/**
 * List all entities with optional filters.
 */
export async function listEntities(params?: {
  entityType?: EntityType;
  industry?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params?.entityType) conditions.push(eq(entityRegistry.entityType, params.entityType));
  if (params?.industry) conditions.push(eq(entityRegistry.industry, params.industry));
  if (params?.search) conditions.push(like(entityRegistry.canonicalName, `%${params.search}%`));

  const entities = await db
    .select()
    .from(entityRegistry)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(entityRegistry.confidenceScore))
    .limit(params?.limit ?? 50)
    .offset(params?.offset ?? 0);

  const [total] = await db
    .select({ count: count() })
    .from(entityRegistry)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return { entities, total: total?.count ?? 0 };
}

// ─── T5. Entity Relationships ───

/**
 * Create or update a relationship between two entities.
 */
export async function createRelationship(params: {
  entityIdA: number;
  entityIdB: number;
  relationshipType: "subsidiary" | "parent_company" | "legal_representation" |
    "regulatory_target" | "corporate_affiliation" | "ownership" |
    "co_defendant" | "opposing_party";
  confidenceScore?: number;
  evidenceSource?: string;
}) {
  // Check for existing relationship
  const [existing] = await db
    .select()
    .from(entityRelationships)
    .where(
      and(
        eq(entityRelationships.entityIdA, params.entityIdA),
        eq(entityRelationships.entityIdB, params.entityIdB),
        eq(entityRelationships.relationshipType, params.relationshipType)
      )
    )
    .limit(1);

  if (existing) {
    // Update confidence if higher
    if ((params.confidenceScore ?? 50) > existing.confidenceScore) {
      await db
        .update(entityRelationships)
        .set({ confidenceScore: params.confidenceScore ?? 50 })
        .where(eq(entityRelationships.id, existing.id));
    }
    return existing;
  }

  const [inserted] = await db.insert(entityRelationships).values({
    entityIdA: params.entityIdA,
    entityIdB: params.entityIdB,
    relationshipType: params.relationshipType,
    confidenceScore: params.confidenceScore ?? 50,
    evidenceSource: params.evidenceSource ?? null,
    createdAt: Date.now(),
  });

  return { id: inserted.insertId };
}

// ─── T6. Entity Confidence Score ───

/**
 * Recompute confidence score for an entity based on cross-stream confirmation.
 */
export async function recomputeConfidence(entityId: number) {
  const [entity] = await db
    .select()
    .from(entityRegistry)
    .where(eq(entityRegistry.id, entityId))
    .limit(1);

  if (!entity) return 0;

  // Base score from mention frequency
  let score = 0;
  const totalMentions = entity.complaintCount + entity.litigationCount +
    entity.enforcementCount + entity.patternCount;

  // Frequency component (0-30)
  score += Math.min(30, totalMentions * 2);

  // Cross-stream confirmation (0-30)
  let streams = 0;
  if (entity.complaintCount > 0) streams++;
  if (entity.litigationCount > 0) streams++;
  if (entity.enforcementCount > 0) streams++;
  if (entity.patternCount > 0) streams++;
  score += streams * 7.5;

  // Evidence strength — known entities get a boost (0-20)
  if (REVERSE_ALIAS[entity.canonicalName.toLowerCase()]) score += 15;
  if (entity.entityType !== "unknown") score += 5;

  // Relationship network (0-20)
  const [relCount] = await db
    .select({ count: count() })
    .from(entityRelationships)
    .where(
      or(
        eq(entityRelationships.entityIdA, entityId),
        eq(entityRelationships.entityIdB, entityId)
      )
    );
  score += Math.min(20, (relCount?.count ?? 0) * 5);

  const finalScore = Math.min(100, Math.round(score));

  await db
    .update(entityRegistry)
    .set({ confidenceScore: finalScore, updatedAt: Date.now() })
    .where(eq(entityRegistry.id, entityId));

  return finalScore;
}

/**
 * Update entity counts from live signals.
 */
export async function updateEntityCounts(entityId: number) {
  const [entity] = await db
    .select()
    .from(entityRegistry)
    .where(eq(entityRegistry.id, entityId))
    .limit(1);

  if (!entity) return;

  // Count signals by type
  const [complaints] = await db
    .select({ count: count() })
    .from(detectedSignals)
    .where(
      and(
        eq(detectedSignals.entityId, entity.canonicalName),
        eq(detectedSignals.signalType, "repeat_entity")
      )
    );

  // Count patterns
  const [patterns] = await db
    .select({ count: count() })
    .from(patternRegistry)
    .where(like(patternRegistry.patternName, `%${entity.canonicalName}%`));

  await db
    .update(entityRegistry)
    .set({
      complaintCount: complaints?.count ?? 0,
      patternCount: patterns?.count ?? 0,
      updatedAt: Date.now(),
    })
    .where(eq(entityRegistry.id, entityId));
}

/**
 * Bulk process: scan all active signals and register entities.
 */
export async function processSignalsForEntities() {
  const signals = await db
    .select()
    .from(detectedSignals);

  let registered = 0;
  let skipped = 0;

  for (const signal of signals) {
    const extracted = extractEntitiesFromSignal({
      signalType: signal.signalType,
      title: signal.plainLanguageExplanation,
      entityName: signal.entityId,
      datasetId: signal.datasetId,
    });

    for (const entity of extracted) {
      const entityType = classifyEntityType(entity.entityName);
      // Skip non-entity types
      if (entityType === "person" || entityType === "unknown") {
        skipped++;
        continue;
      }

      await registerEntity({
        entityName: entity.entityName,
        entityType,
        source: entity.entitySource,
      });
      registered++;
    }
  }

  return { registered, skipped, totalSignals: signals.length };
}

/**
 * Get entity stats summary.
 */
export async function getEntityStats() {
  const [total] = await db.select({ count: count() }).from(entityRegistry);

  const byType = await db
    .select({
      entityType: entityRegistry.entityType,
      cnt: count(),
    })
    .from(entityRegistry)
    .groupBy(entityRegistry.entityType);

  const [relCount] = await db.select({ count: count() }).from(entityRelationships);

  const topEntities = await db
    .select()
    .from(entityRegistry)
    .orderBy(desc(entityRegistry.confidenceScore))
    .limit(10);

  return {
    totalEntities: total?.count ?? 0,
    totalRelationships: relCount?.count ?? 0,
    byType: Object.fromEntries(byType.map((b: any) => [b.entityType, b.cnt])),
    topEntities,
  };
}
