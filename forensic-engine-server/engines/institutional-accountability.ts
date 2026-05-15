/**
 * Institutional Accountability Engine (Session 72)
 *
 * T1. Map patterns to responsible institutions (regulators, agencies, oversight bodies)
 * T2. Detect enforcement gaps (high pattern pressure vs low institutional response)
 * T3. Calculate accountability scores (0-100) per institution
 * T4. Track institution activity (investigations, enforcement, hearings)
 * T5. Generate accountability alerts when scores drop below thresholds
 *
 * Input: pattern_registry, detected_signals, entity_registry
 * Output: institution_registry, pattern_institution_links, institution_activity
 */

import { db } from "../db";
import {
  institutionRegistry,
  patternInstitutionLinks,
  institutionActivity,
  patternRegistry,
  detectedSignals,
} from "../../drizzle/schema";
import { eq, and, sql, desc, count, like, or, gte, lte } from "drizzle-orm";

// ─── Jurisdiction-to-Institution Mapping ───
// Maps industry/jurisdiction combos to responsible oversight institutions
const INSTITUTION_MAP: {
  name: string;
  type: "regulator" | "enforcement_agency" | "oversight_body" | "legislative_committee" |
    "inspector_general" | "licensing_board" | "administrative_court";
  industries: string[];
  jurisdictions: string[];
  powerLevel: "full" | "limited" | "advisory" | "none";
  parent?: string;
}[] = [
  {
    name: "Federal Trade Commission (FTC)",
    type: "regulator",
    industries: ["Consumer Protection", "Technology", "Retail", "Health Care", "Advertising"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "full",
  },
  {
    name: "Consumer Financial Protection Bureau (CFPB)",
    type: "regulator",
    industries: ["Financial Services", "Credit Reporting", "Lending", "Debt Collection"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "full",
  },
  {
    name: "Federal Communications Commission (FCC)",
    type: "regulator",
    industries: ["Telecommunications", "Broadcasting", "Internet"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "full",
  },
  {
    name: "Securities and Exchange Commission (SEC)",
    type: "regulator",
    industries: ["Financial Services", "Securities", "Investment"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "full",
  },
  {
    name: "Department of Justice (DOJ)",
    type: "enforcement_agency",
    industries: ["All"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "full",
  },
  {
    name: "Environmental Protection Agency (EPA)",
    type: "regulator",
    industries: ["Energy", "Manufacturing", "Chemical", "Environmental"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "full",
  },
  {
    name: "Food and Drug Administration (FDA)",
    type: "regulator",
    industries: ["Healthcare", "Pharmaceutical", "Food"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "full",
  },
  {
    name: "Department of Labor (DOL)",
    type: "regulator",
    industries: ["Employment", "Labor", "Workplace Safety"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "full",
  },
  {
    name: "Washington State Attorney General",
    type: "enforcement_agency",
    industries: ["All"],
    jurisdictions: ["WA", "Washington"],
    powerLevel: "full",
    parent: "Washington State Government",
  },
  {
    name: "Better Business Bureau (BBB)",
    type: "oversight_body",
    industries: ["All"],
    jurisdictions: ["National", "US"],
    powerLevel: "advisory",
  },
  {
    name: "Government Accountability Office (GAO)",
    type: "oversight_body",
    industries: ["All"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "advisory",
  },
  {
    name: "Office of Inspector General (OIG)",
    type: "inspector_general",
    industries: ["All"],
    jurisdictions: ["Federal", "US"],
    powerLevel: "limited",
  },
];

// ─── T1. Institution Mapping ───

/**
 * Find institutions responsible for a given industry and jurisdiction.
 */
export function findResponsibleInstitutions(
  industry: string | null,
  jurisdiction: string | null
): typeof INSTITUTION_MAP {
  return INSTITUTION_MAP.filter(inst => {
    const industryMatch = inst.industries.includes("All") ||
      (industry && inst.industries.some(i =>
        i.toLowerCase().includes(industry.toLowerCase()) ||
        industry.toLowerCase().includes(i.toLowerCase())
      ));
    const jurisdictionMatch = !jurisdiction ||
      inst.jurisdictions.some(j =>
        j.toLowerCase() === jurisdiction.toLowerCase() ||
        jurisdiction.toLowerCase().includes(j.toLowerCase())
      );
    return industryMatch && jurisdictionMatch;
  });
}

/**
 * Register an institution in the registry (upsert).
 */
export async function registerInstitution(params: {
  name: string;
  type: "regulator" | "enforcement_agency" | "oversight_body" | "legislative_committee" |
    "inspector_general" | "licensing_board" | "administrative_court";
  jurisdiction?: string;
  industryScope?: string;
  powerLevel?: "full" | "limited" | "advisory" | "none";
  parent?: string;
}) {
  const [existing] = await db
    .select()
    .from(institutionRegistry)
    .where(eq(institutionRegistry.institutionName, params.name))
    .limit(1);

  if (existing) return existing;

  const [inserted] = await db.insert(institutionRegistry).values({
    institutionName: params.name,
    institutionType: params.type,
    jurisdiction: params.jurisdiction ?? null,
    industryScope: params.industryScope ?? null,
    enforcementPowerLevel: params.powerLevel ?? "limited",
    parentInstitution: params.parent ?? null,
    accountabilityScore: 50,
    createdAt: Date.now(),
  });

  return { id: inserted.insertId, name: params.name };
}

/**
 * Link a pattern to responsible institutions.
 */
export async function linkPatternToInstitutions(patternId: number, industry: string | null, jurisdiction: string | null) {
  const institutions = findResponsibleInstitutions(industry, jurisdiction);
  const linked: { institutionName: string; responsibilityType: string }[] = [];

  for (const inst of institutions) {
    // Register institution if not exists
    const registered = await registerInstitution({
      name: inst.name,
      type: inst.type,
      jurisdiction: inst.jurisdictions[0],
      industryScope: inst.industries.includes("All") ? "All" : inst.industries[0],
      powerLevel: inst.powerLevel,
      parent: inst.parent,
    });

    const instId = "id" in registered ? registered.id : (registered as any).id;
    if (!instId) continue;

    // Determine responsibility type
    const responsibilityType = inst.type === "regulator" ? "primary_regulator" as const :
      inst.type === "enforcement_agency" ? "enforcement_authority" as const :
      inst.type === "oversight_body" ? "oversight_authority" as const :
      "secondary_regulator" as const;

    // Check if link already exists
    const [existingLink] = await db
      .select()
      .from(patternInstitutionLinks)
      .where(
        and(
          eq(patternInstitutionLinks.patternId, patternId),
          eq(patternInstitutionLinks.institutionId, instId)
        )
      )
      .limit(1);

    if (!existingLink) {
      await db.insert(patternInstitutionLinks).values({
        patternId,
        institutionId: instId,
        responsibilityType,
        responseStatus: "unknown",
        confidenceScore: 60,
        createdAt: Date.now(),
      });
    }

    linked.push({ institutionName: inst.name, responsibilityType });
  }

  return linked;
}

// ─── T2. Enforcement Gap Detection ───

export interface EnforcementGap {
  institutionId: number;
  institutionName: string;
  patternCount: number;
  activeSignals: number;
  enforcementActions: number;
  gapScore: number; // 0-100, higher = bigger gap
  gapDescription: string;
}

/**
 * Detect enforcement gaps: institutions with high pattern pressure
 * but low enforcement activity.
 */
export async function detectEnforcementGaps(): Promise<EnforcementGap[]> {
  const institutions = await db.select().from(institutionRegistry);
  const gaps: EnforcementGap[] = [];

  for (const inst of institutions) {
    // Count linked patterns
    const [patternCount] = await db
      .select({ count: count() })
      .from(patternInstitutionLinks)
      .where(eq(patternInstitutionLinks.institutionId, inst.id));

    // Count enforcement activities
    const [enforcementCount] = await db
      .select({ count: count() })
      .from(institutionActivity)
      .where(
        and(
          eq(institutionActivity.institutionId, inst.id),
          eq(institutionActivity.activityType, "enforcement_action")
        )
      );

    const patterns = patternCount?.count ?? 0;
    const enforcements = enforcementCount?.count ?? 0;

    if (patterns === 0) continue;

    // Gap score: high patterns + low enforcement = high gap
    const ratio = patterns > 0 ? enforcements / patterns : 1;
    let gapScore = 0;

    if (ratio === 0 && patterns > 0) {
      gapScore = Math.min(100, 50 + patterns * 10);
    } else if (ratio < 0.1) {
      gapScore = Math.min(90, 40 + patterns * 5);
    } else if (ratio < 0.3) {
      gapScore = Math.min(70, 30 + patterns * 3);
    } else if (ratio < 0.5) {
      gapScore = Math.min(50, 20 + patterns * 2);
    } else {
      gapScore = Math.max(0, 10 - enforcements);
    }

    let gapDescription = "";
    if (gapScore >= 70) {
      gapDescription = `Critical enforcement gap: ${patterns} patterns linked but only ${enforcements} enforcement actions taken`;
    } else if (gapScore >= 40) {
      gapDescription = `Moderate enforcement gap: ${patterns} patterns with ${enforcements} enforcement responses`;
    } else {
      gapDescription = `Low gap: ${patterns} patterns with ${enforcements} enforcement responses`;
    }

    gaps.push({
      institutionId: inst.id,
      institutionName: inst.institutionName,
      patternCount: patterns,
      activeSignals: 0,
      enforcementActions: enforcements,
      gapScore,
      gapDescription,
    });
  }

  return gaps.sort((a, b) => b.gapScore - a.gapScore);
}

// ─── T3. Accountability Score Calculation ───

/**
 * Calculate accountability score for an institution (0-100).
 * Higher = more accountable.
 *
 * Factors:
 * - Response rate to linked patterns (0-30)
 * - Enforcement action frequency (0-25)
 * - Response timeliness (0-20)
 * - Enforcement power utilization (0-15)
 * - Transparency (public statements, hearings) (0-10)
 */
export async function calculateAccountabilityScore(institutionId: number): Promise<number> {
  const [inst] = await db
    .select()
    .from(institutionRegistry)
    .where(eq(institutionRegistry.id, institutionId))
    .limit(1);

  if (!inst) return 0;

  // Count linked patterns
  const [patternCount] = await db
    .select({ count: count() })
    .from(patternInstitutionLinks)
    .where(eq(patternInstitutionLinks.institutionId, institutionId));

  // Count patterns with active response
  const [activeResponses] = await db
    .select({ count: count() })
    .from(patternInstitutionLinks)
    .where(
      and(
        eq(patternInstitutionLinks.institutionId, institutionId),
        sql`${patternInstitutionLinks.responseStatus} != 'unknown'`,
        sql`${patternInstitutionLinks.responseStatus} != 'inactive'`
      )
    );

  // Count activities by type
  const activities = await db
    .select({
      activityType: institutionActivity.activityType,
      cnt: count(),
    })
    .from(institutionActivity)
    .where(eq(institutionActivity.institutionId, institutionId))
    .groupBy(institutionActivity.activityType);

  const activityMap = Object.fromEntries(activities.map(a => [a.activityType, a.cnt]));
  const totalPatterns = patternCount?.count ?? 0;
  const totalActiveResponses = activeResponses?.count ?? 0;

  let score = 0;

  // Response rate (0-30)
  if (totalPatterns > 0) {
    score += Math.round((totalActiveResponses / totalPatterns) * 30);
  } else {
    score += 15; // Neutral if no patterns
  }

  // Enforcement frequency (0-25)
  const enforcements = activityMap["enforcement_action"] ?? 0;
  if (totalPatterns > 0) {
    const enforcementRate = enforcements / totalPatterns;
    score += Math.min(25, Math.round(enforcementRate * 50));
  } else {
    score += 12;
  }

  // Enforcement power utilization (0-15)
  if (inst.enforcementPowerLevel === "full" && enforcements > 0) score += 15;
  else if (inst.enforcementPowerLevel === "limited" && enforcements > 0) score += 12;
  else if (inst.enforcementPowerLevel === "advisory") score += 8;
  else score += 3;

  // Transparency: hearings + public statements (0-10)
  const hearings = activityMap["hearing_announced"] ?? 0;
  const statements = activityMap["public_statement"] ?? 0;
  score += Math.min(10, (hearings + statements) * 3);

  // Response timeliness (0-20) — based on how many have response dates
  const [timeliness] = await db
    .select({ count: count() })
    .from(patternInstitutionLinks)
    .where(
      and(
        eq(patternInstitutionLinks.institutionId, institutionId),
        sql`${patternInstitutionLinks.responseDate} IS NOT NULL`
      )
    );

  if (totalPatterns > 0) {
    const timelyRate = (timeliness?.count ?? 0) / totalPatterns;
    score += Math.round(timelyRate * 20);
  } else {
    score += 10;
  }

  const finalScore = Math.min(100, Math.max(0, score));

  // Update the institution's accountability score
  await db
    .update(institutionRegistry)
    .set({ accountabilityScore: finalScore })
    .where(eq(institutionRegistry.id, institutionId));

  return finalScore;
}

// ─── T4. Institution Activity Tracking ───

/**
 * Record an institution activity event.
 */
export async function recordInstitutionActivity(params: {
  institutionId: number;
  activityType: "investigation_opened" | "enforcement_action" | "hearing_announced" |
    "regulation_proposed" | "policy_change" | "public_statement";
  patternId?: number;
  entityName?: string;
  description?: string;
  actionDate?: number;
  sourceStream?: string;
}) {
  const [inserted] = await db.insert(institutionActivity).values({
    institutionId: params.institutionId,
    activityType: params.activityType,
    patternId: params.patternId ?? null,
    entityName: params.entityName ?? null,
    actionDescription: params.description ?? null,
    actionDate: params.actionDate ?? Date.now(),
    sourceStream: params.sourceStream ?? null,
    confidenceScore: 60,
    createdAt: Date.now(),
  });

  // Update the pattern-institution link if applicable
  if (params.patternId) {
    const statusMap: Record<string, "monitoring" | "investigating" | "enforcing" | "policy_action"> = {
      investigation_opened: "investigating",
      enforcement_action: "enforcing",
      hearing_announced: "monitoring",
      regulation_proposed: "policy_action",
      policy_change: "policy_action",
      public_statement: "monitoring",
    };

    await db
      .update(patternInstitutionLinks)
      .set({
        responseStatus: statusMap[params.activityType] ?? "monitoring",
        responseDate: Date.now(),
      })
      .where(
        and(
          eq(patternInstitutionLinks.patternId, params.patternId),
          eq(patternInstitutionLinks.institutionId, params.institutionId)
        )
      );
  }

  return { id: inserted.insertId };
}

// ─── T5. Accountability Alerts ───

export interface AccountabilityAlert {
  institutionId: number;
  institutionName: string;
  accountabilityScore: number;
  alertLevel: "critical" | "warning" | "watch";
  description: string;
}

/**
 * Generate accountability alerts for institutions below thresholds.
 */
export async function generateAccountabilityAlerts(): Promise<AccountabilityAlert[]> {
  const institutions = await db.select().from(institutionRegistry);
  const alerts: AccountabilityAlert[] = [];

  for (const inst of institutions) {
    const score = await calculateAccountabilityScore(inst.id);

    if (score < 25) {
      alerts.push({
        institutionId: inst.id,
        institutionName: inst.institutionName,
        accountabilityScore: score,
        alertLevel: "critical",
        description: `${inst.institutionName} accountability score critically low (${score}/100). Significant enforcement gap detected.`,
      });
    } else if (score < 40) {
      alerts.push({
        institutionId: inst.id,
        institutionName: inst.institutionName,
        accountabilityScore: score,
        alertLevel: "warning",
        description: `${inst.institutionName} accountability score below threshold (${score}/100). Response rate needs improvement.`,
      });
    } else if (score < 55) {
      alerts.push({
        institutionId: inst.id,
        institutionName: inst.institutionName,
        accountabilityScore: score,
        alertLevel: "watch",
        description: `${inst.institutionName} accountability score moderate (${score}/100). Monitoring for changes.`,
      });
    }
  }

  return alerts.sort((a, b) => a.accountabilityScore - b.accountabilityScore);
}

/**
 * Get institution stats summary.
 */
export async function getInstitutionStats() {
  const [total] = await db.select({ count: count() }).from(institutionRegistry);
  const [links] = await db.select({ count: count() }).from(patternInstitutionLinks);
  const [activities] = await db.select({ count: count() }).from(institutionActivity);

  const byType = await db
    .select({
      institutionType: institutionRegistry.institutionType,
      cnt: count(),
    })
    .from(institutionRegistry)
    .groupBy(institutionRegistry.institutionType);

  const topInstitutions = await db
    .select()
    .from(institutionRegistry)
    .orderBy(desc(institutionRegistry.accountabilityScore))
    .limit(10);

  return {
    totalInstitutions: total?.count ?? 0,
    totalLinks: links?.count ?? 0,
    totalActivities: activities?.count ?? 0,
    byType: Object.fromEntries(byType.map(b => [b.institutionType, b.cnt])),
    topInstitutions,
  };
}

/**
 * List all institutions with optional filters.
 */
export async function listInstitutions(params?: {
  type?: string;
  jurisdiction?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params?.type) conditions.push(eq(institutionRegistry.institutionType, params.type as any));
  if (params?.jurisdiction) conditions.push(eq(institutionRegistry.jurisdiction, params.jurisdiction));
  if (params?.search) conditions.push(like(institutionRegistry.institutionName, `%${params.search}%`));

  const institutions = await db
    .select()
    .from(institutionRegistry)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(institutionRegistry.accountabilityScore))
    .limit(params?.limit ?? 50)
    .offset(params?.offset ?? 0);

  const [totalResult] = await db
    .select({ count: count() })
    .from(institutionRegistry)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return { institutions, total: totalResult?.count ?? 0 };
}

/**
 * Seed default institutions from the mapping.
 */
export async function seedDefaultInstitutions() {
  let seeded = 0;
  for (const inst of INSTITUTION_MAP) {
    const result = await registerInstitution({
      name: inst.name,
      type: inst.type,
      jurisdiction: inst.jurisdictions[0],
      industryScope: inst.industries.includes("All") ? "All" : inst.industries.join(", "),
      powerLevel: inst.powerLevel,
      parent: inst.parent,
    });
    if ("id" in result && typeof result.id === "number") seeded++;
  }
  return { seeded, total: INSTITUTION_MAP.length };
}
