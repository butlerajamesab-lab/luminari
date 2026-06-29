import { db } from "../db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import {
  patternEntitySummary,
  patternResponsibleAgencies,
  detectedSignals,
  patternRegistry,
  entityRegistry,
  type PatternEntitySummaryRow,
  type PatternResponsibleAgencyRow,
} from "../../drizzle/schema";

// ─── Entity Breakdown Aggregation ────────────────────────────────────
// Scans all detected signals for a pattern and aggregates entity metrics

export async function generateEntityBreakdown(patternId: number): Promise<PatternEntitySummaryRow[]> {
  // Get all signals for this pattern
  const signals = await db
    .select()
    .from(detectedSignals)
    .where(eq(detectedSignals.patternTypeId, String(patternId)));

  // Aggregate by entity name
  const entityMap = new Map<string, {
    entityName: string;
    entityType: string | null;
    complaintCount: number;
    lawsuitCount: number;
    enforcementActions: number;
    patternInvolvementCount: number;
    signalTypes: Set<string>;
  }>();

  for (const sig of signals) {
    const name = sig.entityId;
    if (!name || name === "Unknown" || name === "N/A") continue;

    const existing = entityMap.get(name) || {
      entityName: name,
      entityType: sig.entityRole || null,
      complaintCount: 0,
      lawsuitCount: 0,
      enforcementActions: 0,
      patternInvolvementCount: 0,
      signalTypes: new Set<string>(),
    };

    existing.patternInvolvementCount++;
    if (sig.signalType) existing.signalTypes.add(sig.signalType);
    // TODO: entity-transparency confidence scoring may need review after detected_signals migration

    // Categorize by signal type
    const type = sig.signalType || "";
    if (type.includes("repeat_entity") || type.includes("complaint")) {
      existing.complaintCount += 1;
    } else if (type.includes("litigation") || type.includes("lawsuit")) {
      existing.lawsuitCount++;
    } else if (type.includes("enforcement") || type.includes("regulatory")) {
      existing.enforcementActions++;
    }

    entityMap.set(name, existing);
  }

  // Also check entity_registry for cross-stream counts
  const registryEntities = await db.select().from(entityRegistry);
  const registryMap = new Map(registryEntities.map((e: any) => [e.entityName, e]));

  // Upsert into pattern_entity_summary
  const results: PatternEntitySummaryRow[] = [];
  const now = Date.now();

  for (const [, entity] of entityMap) {
    const regEntry = registryMap.get(entity.entityName);
    const confidence = calculateEntityConfidence(entity, regEntry);

    // Delete existing entry for this pattern+entity
    await db.delete(patternEntitySummary).where(
      and(
        eq(patternEntitySummary.patternId, patternId),
        eq(patternEntitySummary.entityName, entity.entityName)
      )
    );

    const [inserted] = await db.insert(patternEntitySummary).values({
      patternId,
      entityName: entity.entityName,
      entityType: entity.entityType || regEntry?.entityType || null,
      complaintCount: entity.complaintCount,
      lawsuitCount: entity.lawsuitCount,
      enforcementActions: entity.enforcementActions,
      patternInvolvementCount: entity.patternInvolvementCount,
      confidenceScore: confidence,
      createdAt: now,
      updatedAt: now,
    });

    // Fetch the inserted row
    const rows = await db.select().from(patternEntitySummary)
      .where(and(
        eq(patternEntitySummary.patternId, patternId),
        eq(patternEntitySummary.entityName, entity.entityName)
      ))
      .limit(1);
    if (rows[0]) results.push(rows[0]);
  }

  return results;
}

function calculateEntityConfidence(
  entity: { complaintCount: number; lawsuitCount: number; enforcementActions: number; signalTypes: Set<string> },
  regEntry?: { signalCount?: number | null; patternCount?: number | null } | null
): number {
  let score = 0;

  // Signal volume (up to 30 points)
  const totalSignals = entity.complaintCount + entity.lawsuitCount + entity.enforcementActions;
  score += Math.min(30, totalSignals * 3);

  // Multi-stream bonus (up to 25 points)
  score += Math.min(25, entity.signalTypes.size * 8);

  // Enforcement weight (up to 20 points)
  score += Math.min(20, entity.enforcementActions * 10);

  // Litigation weight (up to 15 points)
  score += Math.min(15, entity.lawsuitCount * 5);

  // Registry cross-reference bonus (up to 10 points)
  if (regEntry) {
    score += Math.min(10, (regEntry.patternCount || 0) * 3);
  }

  return Math.min(100, score);
}

// ─── Get Entity Breakdown for Pattern ────────────────────────────────

export async function getEntityBreakdown(patternId: number): Promise<PatternEntitySummaryRow[]> {
  return db
    .select()
    .from(patternEntitySummary)
    .where(eq(patternEntitySummary.patternId, patternId))
    .orderBy(desc(patternEntitySummary.confidenceScore));
}

// ─── Responsible Agency Mapping ──────────────────────────────────────

export async function generateResponsibleAgencyMapping(patternId: number): Promise<PatternResponsibleAgencyRow[]> {
  // Get pattern info
  const patterns = await db.select().from(patternRegistry).where(eq(patternRegistry.id, patternId)).limit(1);
  const pattern = patterns[0];
  if (!pattern) return [];

  // Get signals for jurisdiction and agency inference
  const signals = await db.select().from(detectedSignals)
    .where(eq(detectedSignals.patternTypeId, String(patternId)));

  // Infer agencies from pattern category and jurisdiction
  const agencyMap = new Map<string, {
    agencyName: string;
    jurisdiction: string;
    role: string;
    complaintsReceived: number;
    investigationsOpened: number;
    penaltiesIssued: number;
  }>();

  // Determine agencies based on pattern type and jurisdiction
  // @ts-ignore pre-existing type mismatch
  const category = (pattern.patternType || pattern.claimType || "").toLowerCase();
  // @ts-ignore pre-existing type mismatch
  const jurisdiction = pattern.jurisdiction || "Federal";

  // Map categories to responsible agencies
  const agencyMappings = inferAgencies(category, jurisdiction);

  for (const mapping of agencyMappings) {
    const key = `${mapping.agencyName}|${mapping.jurisdiction}`;
    agencyMap.set(key, {
      ...mapping,
      complaintsReceived: signals.length,
      investigationsOpened: 0,
      penaltiesIssued: 0,
    });
  }

  // Count enforcement-type signals as investigations/penalties
  for (const sig of signals) {
    const type = sig.signalType || "";
    for (const [key, agency] of agencyMap) {
      if (type.includes("enforcement")) {
        agency.investigationsOpened++;
      }
      if (type.includes("penalty") || type.includes("fine")) {
        agency.penaltiesIssued++;
      }
      agencyMap.set(key, agency);
    }
  }

  // Upsert into pattern_responsible_agencies
  const now = Date.now();
  const results: PatternResponsibleAgencyRow[] = [];

  // Clear existing entries for this pattern
  await db.delete(patternResponsibleAgencies).where(eq(patternResponsibleAgencies.patternId, patternId));

  for (const [, agency] of agencyMap) {
    await db.insert(patternResponsibleAgencies).values({
      patternId,
      agencyName: agency.agencyName,
      jurisdiction: agency.jurisdiction,
      role: agency.role,
      complaintsReceived: agency.complaintsReceived,
      investigationsOpened: agency.investigationsOpened,
      penaltiesIssued: agency.penaltiesIssued,
      createdAt: now,
      updatedAt: now,
    });

    const rows = await db.select().from(patternResponsibleAgencies)
      .where(and(
        eq(patternResponsibleAgencies.patternId, patternId),
        eq(patternResponsibleAgencies.agencyName, agency.agencyName)
      ))
      .limit(1);
    if (rows[0]) results.push(rows[0]);
  }

  return results;
}

function inferAgencies(category: string, jurisdiction: string): Array<{
  agencyName: string; jurisdiction: string; role: string;
}> {
  const agencies: Array<{ agencyName: string; jurisdiction: string; role: string }> = [];

  // Consumer protection patterns
  if (category.includes("consumer") || category.includes("complaint") || category.includes("bbb")) {
    agencies.push({ agencyName: "Federal Trade Commission (FTC)", jurisdiction: "Federal", role: "primary_regulator" });
    agencies.push({ agencyName: "Consumer Financial Protection Bureau (CFPB)", jurisdiction: "Federal", role: "co_regulator" });
    agencies.push({ agencyName: `${jurisdiction} Attorney General`, jurisdiction, role: "state_enforcement" });
  }

  // Financial patterns
  if (category.includes("financ") || category.includes("bank") || category.includes("loan") || category.includes("credit")) {
    agencies.push({ agencyName: "Consumer Financial Protection Bureau (CFPB)", jurisdiction: "Federal", role: "primary_regulator" });
    agencies.push({ agencyName: "Securities and Exchange Commission (SEC)", jurisdiction: "Federal", role: "co_regulator" });
    agencies.push({ agencyName: `${jurisdiction} Department of Financial Institutions`, jurisdiction, role: "state_enforcement" });
  }

  // Health care patterns
  if (category.includes("health") || category.includes("medical") || category.includes("pharma")) {
    agencies.push({ agencyName: "Department of Health and Human Services (HHS)", jurisdiction: "Federal", role: "primary_regulator" });
    agencies.push({ agencyName: "Food and Drug Administration (FDA)", jurisdiction: "Federal", role: "co_regulator" });
    agencies.push({ agencyName: `${jurisdiction} Department of Health`, jurisdiction, role: "state_enforcement" });
  }

  // Telecom patterns
  if (category.includes("telecom") || category.includes("internet") || category.includes("cable")) {
    agencies.push({ agencyName: "Federal Communications Commission (FCC)", jurisdiction: "Federal", role: "primary_regulator" });
    agencies.push({ agencyName: "Federal Trade Commission (FTC)", jurisdiction: "Federal", role: "co_regulator" });
  }

  // Environmental patterns
  if (category.includes("environ") || category.includes("pollut") || category.includes("toxic")) {
    agencies.push({ agencyName: "Environmental Protection Agency (EPA)", jurisdiction: "Federal", role: "primary_regulator" });
    agencies.push({ agencyName: `${jurisdiction} Department of Ecology`, jurisdiction, role: "state_enforcement" });
  }

  // Housing patterns
  if (category.includes("hous") || category.includes("rent") || category.includes("landlord") || category.includes("property")) {
    agencies.push({ agencyName: "Department of Housing and Urban Development (HUD)", jurisdiction: "Federal", role: "primary_regulator" });
    agencies.push({ agencyName: `${jurisdiction} Office of the Attorney General`, jurisdiction, role: "state_enforcement" });
  }

  // Auto/vehicle patterns
  if (category.includes("auto") || category.includes("vehicle") || category.includes("car")) {
    agencies.push({ agencyName: "National Highway Traffic Safety Administration (NHTSA)", jurisdiction: "Federal", role: "primary_regulator" });
    agencies.push({ agencyName: "Federal Trade Commission (FTC)", jurisdiction: "Federal", role: "co_regulator" });
    agencies.push({ agencyName: `${jurisdiction} Department of Licensing`, jurisdiction, role: "state_enforcement" });
  }

  // Campaign finance / political patterns
  if (category.includes("campaign") || category.includes("election") || category.includes("political") || category.includes("legislat")) {
    agencies.push({ agencyName: "Federal Election Commission (FEC)", jurisdiction: "Federal", role: "primary_regulator" });
    agencies.push({ agencyName: `${jurisdiction} Public Disclosure Commission`, jurisdiction, role: "state_enforcement" });
  }

  // Default: general oversight
  if (agencies.length === 0) {
    agencies.push({ agencyName: "Federal Trade Commission (FTC)", jurisdiction: "Federal", role: "general_oversight" });
    agencies.push({ agencyName: `${jurisdiction} Attorney General`, jurisdiction, role: "state_enforcement" });
  }

  return agencies;
}

export async function getResponsibleAgencies(patternId: number): Promise<PatternResponsibleAgencyRow[]> {
  return db
    .select()
    .from(patternResponsibleAgencies)
    .where(eq(patternResponsibleAgencies.patternId, patternId))
    .orderBy(desc(patternResponsibleAgencies.complaintsReceived));
}

// ─── Top Entities Leaderboard ────────────────────────────────────────

export interface LeaderboardEntry {
  entityName: string;
  entityType: string | null;
  signalCount: number;
  patternCount: number;
  crossStreamCount: number;
  totalScore: number;
  confidenceScore: number;
}

export async function getTopEntitiesLeaderboard(limit: number = 20): Promise<LeaderboardEntry[]> {
  // Aggregate from pattern_entity_summary
  const summaries = await db
    .select({
      entityName: patternEntitySummary.entityName,
      entityType: patternEntitySummary.entityType,
      totalComplaints: sql<number>`SUM(${patternEntitySummary.complaintCount})`,
      totalLawsuits: sql<number>`SUM(${patternEntitySummary.lawsuitCount})`,
      totalEnforcement: sql<number>`SUM(${patternEntitySummary.enforcementActions})`,
      patternCount: sql<number>`COUNT(DISTINCT ${patternEntitySummary.patternId})`,
      avgConfidence: sql<number>`AVG(${patternEntitySummary.confidenceScore})`,
    })
    .from(patternEntitySummary)
    .groupBy(patternEntitySummary.entityName, patternEntitySummary.entityType)
    .orderBy(desc(sql`SUM(${patternEntitySummary.complaintCount}) + SUM(${patternEntitySummary.lawsuitCount}) + SUM(${patternEntitySummary.enforcementActions})`))
    .limit(limit);

  return summaries.map((s: any) => {
    const signalCount = (s.totalComplaints || 0) + (s.totalLawsuits || 0) + (s.totalEnforcement || 0);
    // Cross-stream = number of distinct evidence types present
    let crossStreamCount = 0;
    if ((s.totalComplaints || 0) > 0) crossStreamCount++;
    if ((s.totalLawsuits || 0) > 0) crossStreamCount++;
    if ((s.totalEnforcement || 0) > 0) crossStreamCount++;

    return {
      entityName: s.entityName,
      entityType: s.entityType,
      signalCount,
      patternCount: s.patternCount || 0,
      crossStreamCount,
      totalScore: signalCount * (1 + crossStreamCount * 0.5) * (1 + (s.patternCount || 0) * 0.3),
      confidenceScore: Math.round(s.avgConfidence || 0),
    };
  }).sort((a: any, b: any) => b.totalScore - a.totalScore);
}

// ─── Investigative Brief Generation ──────────────────────────────────

export interface InvestigativeBrief {
  patternId: number;
  patternSummary: string;
  entitiesInvolved: Array<{
    entityName: string;
    entityType: string | null;
    complaintCount: number;
    lawsuitCount: number;
    enforcementActions: number;
    confidenceScore: number;
  }>;
  agenciesResponsible: Array<{
    agencyName: string;
    jurisdiction: string | null;
    role: string | null;
    complaintsReceived: number;
    investigationsOpened: number;
    penaltiesIssued: number;
  }>;
  signalTimeline: Array<{
    date: string;
    signalType: string;
    title: string;
    entityName: string | null;
  }>;
  litigationActivity: Array<{
    signalType: string;
    title: string;
    entityName: string | null;
  }>;
  regulatoryActions: Array<{
    signalType: string;
    title: string;
    entityName: string | null;
  }>;
  generatedAt: number;
}

export async function generateInvestigativeBrief(patternId: number): Promise<InvestigativeBrief> {
  // Get pattern info
  const patterns = await db.select().from(patternRegistry).where(eq(patternRegistry.id, patternId)).limit(1);
  const pattern = patterns[0];

  // Get entity breakdown
  const entities = await getEntityBreakdown(patternId);

  // Get responsible agencies
  const agencies = await getResponsibleAgencies(patternId);

  // Get all signals for timeline
  const signals = await db.select().from(detectedSignals)
    .where(eq(detectedSignals.patternTypeId, String(patternId)))
    .orderBy(desc(detectedSignals.detectionTimestamp));

  // Build signal timeline
  const signalTimeline = signals.map((s: any) => ({
    date: new Date(s.detectionTimestamp).toISOString().split("T")[0],
    signalType: s.signalType || "unknown",
    title: s.plainLanguageExplanation || "",
    entityName: s.entityId || null,
  }));

  // Filter litigation and regulatory signals
  const litigationActivity = signals
    .filter((s: any) => (s.signalType || "").includes("litigation") || (s.signalType || "").includes("lawsuit"))
    .map((s: any) => ({
      signalType: s.signalType || "unknown",
      title: s.plainLanguageExplanation || "",
      entityName: s.entityId || null,
    }));

  const regulatoryActions = signals
    .filter((s: any) => (s.signalType || "").includes("enforcement") || (s.signalType || "").includes("regulatory"))
    .map((s: any) => ({
      signalType: s.signalType || "unknown",
      title: s.plainLanguageExplanation || "",
      entityName: s.entityId || null,
    }));

  // Build pattern summary
  const patternSummary = pattern
    // @ts-ignore pre-existing type mismatch
    ? `Pattern "${pattern.patternName}" (${pattern.patternType || "unknown type"}) detected in ${pattern.jurisdiction || "unknown jurisdiction"} jurisdiction. ${pattern.claimType ? `Claim type: ${pattern.claimType}.` : ""} ${entities.length} entities identified across ${signals.length} signals.`
    : `Pattern #${patternId} — ${entities.length} entities identified.`;

  return {
    patternId,
    patternSummary,
    entitiesInvolved: entities.map(e => ({
      entityName: e.entityName,
      entityType: e.entityType,
      complaintCount: e.complaintCount || 0,
      lawsuitCount: e.lawsuitCount || 0,
      enforcementActions: e.enforcementActions || 0,
      confidenceScore: e.confidenceScore || 0,
    })),
    agenciesResponsible: agencies.map(a => ({
      agencyName: a.agencyName,
      jurisdiction: a.jurisdiction,
      role: a.role,
      complaintsReceived: a.complaintsReceived || 0,
      investigationsOpened: a.investigationsOpened || 0,
      penaltiesIssued: a.penaltiesIssued || 0,
    })),
    signalTimeline,
    litigationActivity,
    regulatoryActions,
    generatedAt: Date.now(),
  };
}

// ─── Entity Transparency Stats ───────────────────────────────────────

export async function getEntityTransparencyStats() {
  const [entityCount] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${patternEntitySummary.entityName})` })
    .from(patternEntitySummary);

  const [agencyCount] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${patternResponsibleAgencies.agencyName})` })
    .from(patternResponsibleAgencies);

  const [patternsCovered] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${patternEntitySummary.patternId})` })
    .from(patternEntitySummary);

  const [highConfidence] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(patternEntitySummary)
    .where(gte(patternEntitySummary.confidenceScore, 70));

  return {
    totalEntities: entityCount?.count || 0,
    totalAgencies: agencyCount?.count || 0,
    patternsCovered: patternsCovered?.count || 0,
    highConfidenceEntities: highConfidence?.count || 0,
  };
}
