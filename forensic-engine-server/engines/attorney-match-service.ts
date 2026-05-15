/**
 * Engine 7: Attorney Match Engine
 * 
 * Matches cases to qualified attorneys based on:
 * - Practice area match (35%)
 * - Jurisdiction match (30%)
 * - Damages range match (20%)
 * - Pattern/claim type match (15%)
 * 
 * Features:
 * - Attorney registry management
 * - Weighted matching algorithm
 * - Outcome tracking
 * - Match analytics
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface Attorney {
  id: number;
  name: string;
  firmName: string | null;
  barNumber: string | null;
  jurisdiction: string | null;
  practiceAreas: string[];
  yearsExperience: number;
  acceptsContingency: boolean;
  acceptsProBono: boolean;
  acceptsNewClients: boolean;
  contactEmail: string | null;
  website: string | null;
}

export interface AttorneyMatch {
  attorney: Attorney;
  matchScore: number;
  practiceMatchScore: number;
  jurisdictionMatchScore: number;
  damagesMatchScore: number;
  patternMatchScore: number;
}

export interface MatchRequest {
  caseId: number;
  claimType: string;
  jurisdiction: string;
  estimatedDamages?: number;
  needsContingency?: boolean;
  needsProBono?: boolean;
}

/**
 * Find matching attorneys for a case
 */
export async function findMatchingAttorneys(request: MatchRequest): Promise<AttorneyMatch[]> {
  const now = Date.now();

  // Get all active attorneys
  const attorneys = await db.execute(sql`
    SELECT id, name, firm_name, bar_number, jurisdiction, practice_areas,
           years_experience, accepts_contingency, accepts_pro_bono, accepts_new_clients,
           contact_email, website
    FROM attorney_registry
    WHERE accepts_new_clients = TRUE
    ORDER BY years_experience DESC
  `);

  const matches: AttorneyMatch[] = [];

  for (const row of attorneys[0] as unknown as any[]) {
    const practiceAreas: string[] = row.practice_areas 
      ? (typeof row.practice_areas === 'string' ? JSON.parse(row.practice_areas) : row.practice_areas) 
      : [];

    const attorney: Attorney = {
      id: row.id,
      name: row.name,
      firmName: row.firm_name,
      barNumber: row.bar_number,
      jurisdiction: row.jurisdiction,
      practiceAreas,
      yearsExperience: Number(row.years_experience) || 0,
      acceptsContingency: !!row.accepts_contingency,
      acceptsProBono: !!row.accepts_pro_bono,
      acceptsNewClients: !!row.accepts_new_clients,
      contactEmail: row.contact_email,
      website: row.website,
    };

    // Filter: contingency/pro bono requirements
    if (request.needsContingency && !attorney.acceptsContingency) continue;
    if (request.needsProBono && !attorney.acceptsProBono) continue;

    // Score: Practice area match (35%)
    const claimNormalized = request.claimType.toLowerCase().replace(/_/g, " ");
    const practiceMatch = practiceAreas.some(pa => {
      const paNorm = pa.toLowerCase().replace(/_/g, " ");
      return paNorm.includes(claimNormalized) || claimNormalized.includes(paNorm) ||
             paNorm.split(" ").some(w => claimNormalized.includes(w));
    });
    const practiceMatchScore = practiceMatch ? 85 + Math.min(15, attorney.yearsExperience) : 
      practiceAreas.length > 0 ? 20 : 10;

    // Score: Jurisdiction match (30%)
    const jurisdictionMatch = attorney.jurisdiction && request.jurisdiction &&
      (attorney.jurisdiction.toLowerCase() === request.jurisdiction.toLowerCase() ||
       attorney.jurisdiction.toLowerCase().includes(request.jurisdiction.toLowerCase()) ||
       request.jurisdiction.toLowerCase().includes(attorney.jurisdiction.toLowerCase()));
    const jurisdictionMatchScore = jurisdictionMatch ? 90 : 
      attorney.jurisdiction?.toLowerCase().includes("federal") ? 50 : 20;

    // Score: Damages match (20%)
    let damagesMatchScore = 50; // default
    if (request.estimatedDamages) {
      if (request.estimatedDamages > 100000 && attorney.yearsExperience >= 10) damagesMatchScore = 90;
      else if (request.estimatedDamages > 25000 && attorney.yearsExperience >= 5) damagesMatchScore = 80;
      else if (request.estimatedDamages <= 25000) damagesMatchScore = 70;
      else damagesMatchScore = 40;
    }

    // Score: Pattern match (15%)
    const patternMatchScore = practiceMatch ? 80 : 30;

    // Weighted composite
    const matchScore = Math.round(
      (practiceMatchScore * 0.35 +
       jurisdictionMatchScore * 0.30 +
       damagesMatchScore * 0.20 +
       patternMatchScore * 0.15) * 100
    ) / 100;

    matches.push({
      attorney,
      matchScore,
      practiceMatchScore,
      jurisdictionMatchScore,
      damagesMatchScore,
      patternMatchScore,
    });

    // Save match to DB
    await db.execute(sql`
      INSERT INTO attorney_case_match 
      (case_id, attorney_id, match_score, practice_match_score, jurisdiction_match_score,
       damages_match_score, pattern_match_score, created_at)
      VALUES (${request.caseId}, ${attorney.id}, ${matchScore}, ${practiceMatchScore},
              ${jurisdictionMatchScore}, ${damagesMatchScore}, ${patternMatchScore}, ${now})
    `);
  }

  // Sort by match score descending
  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches.slice(0, 10);
}

/**
 * Add an attorney to the registry
 */
export async function addAttorney(attorney: Omit<Attorney, "id">): Promise<number> {
  const now = Date.now();
  await db.execute(sql`
    INSERT INTO attorney_registry 
    (name, firm_name, bar_number, jurisdiction, practice_areas, years_experience,
     accepts_contingency, accepts_pro_bono, accepts_new_clients, contact_email, website, created_at)
    VALUES (${attorney.name}, ${attorney.firmName}, ${attorney.barNumber}, ${attorney.jurisdiction},
            ${JSON.stringify(attorney.practiceAreas)}, ${attorney.yearsExperience},
            ${attorney.acceptsContingency}, ${attorney.acceptsProBono}, ${attorney.acceptsNewClients},
            ${attorney.contactEmail}, ${attorney.website}, ${now})
  `);

  const result = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
  return (result[0] as unknown as any[])[0]?.id;
}

/**
 * Get all attorneys
 */
export async function getAttorneyRegistry(): Promise<Attorney[]> {
  const results = await db.execute(sql`
    SELECT id, name, firm_name, bar_number, jurisdiction, practice_areas,
           years_experience, accepts_contingency, accepts_pro_bono, accepts_new_clients,
           contact_email, website
    FROM attorney_registry
    ORDER BY name ASC
  `);

  return (results[0] as unknown as any[]).map(r => ({
    id: r.id,
    name: r.name,
    firmName: r.firm_name,
    barNumber: r.bar_number,
    jurisdiction: r.jurisdiction,
    practiceAreas: r.practice_areas ? (typeof r.practice_areas === 'string' ? JSON.parse(r.practice_areas) : r.practice_areas) : [],
    yearsExperience: Number(r.years_experience) || 0,
    acceptsContingency: !!r.accepts_contingency,
    acceptsProBono: !!r.accepts_pro_bono,
    acceptsNewClients: !!r.accepts_new_clients,
    contactEmail: r.contact_email,
    website: r.website,
  }));
}

/**
 * Record an outcome for an attorney match
 */
export async function recordOutcome(
  caseId: number, 
  attorneyId: number, 
  outcome: { contactMade?: boolean; representationAccepted?: boolean; representationDeclined?: boolean; caseResult?: string; settlementAmount?: number }
): Promise<void> {
  const now = Date.now();
  await db.execute(sql`
    INSERT INTO attorney_outcomes 
    (case_id, attorney_id, contact_made, representation_accepted, representation_declined,
     case_result, settlement_amount, created_at)
    VALUES (${caseId}, ${attorneyId}, ${outcome.contactMade ?? false}, 
            ${outcome.representationAccepted ?? false}, ${outcome.representationDeclined ?? false},
            ${outcome.caseResult ?? null}, ${outcome.settlementAmount ?? null}, ${now})
  `);
}

/**
 * Get match analytics
 */
export async function getMatchAnalytics(): Promise<{
  totalAttorneys: number;
  totalMatches: number;
  avgMatchScore: number;
  contactRate: number;
  acceptanceRate: number;
}> {
  const totalAttorneys = await db.execute(sql`SELECT COUNT(*) as cnt FROM attorney_registry`);
  const totalMatches = await db.execute(sql`SELECT COUNT(*) as cnt FROM attorney_case_match`);
  const avgScore = await db.execute(sql`SELECT AVG(match_score) as avg FROM attorney_case_match`);
  const outcomes = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN contact_made = TRUE THEN 1 ELSE 0 END) as contacted,
      SUM(CASE WHEN representation_accepted = TRUE THEN 1 ELSE 0 END) as accepted
    FROM attorney_outcomes
  `);

  const outcomeRow = (outcomes[0] as unknown as any[])[0] || {};
  const total = Number(outcomeRow.total) || 0;

  return {
    totalAttorneys: Number((totalAttorneys[0] as unknown as any[])[0]?.cnt) || 0,
    totalMatches: Number((totalMatches[0] as unknown as any[])[0]?.cnt) || 0,
    avgMatchScore: Number((avgScore[0] as unknown as any[])[0]?.avg) || 0,
    contactRate: total > 0 ? (Number(outcomeRow.contacted) || 0) / total * 100 : 0,
    acceptanceRate: total > 0 ? (Number(outcomeRow.accepted) || 0) / total * 100 : 0,
  };
}
