/**
 * Knowledge Coverage / Gap Analysis Service
 * 
 * Calculates coverage metrics across jurisdiction × claim_type dimensions.
 * Uses weighted formula to compute overall coverage scores.
 * Identifies gaps to guide future data ingestion toward ≥90% coverage.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Coverage Weights ───

export const COVERAGE_WEIGHTS = {
  statutes: 0.25,
  caseLaw: 0.25,
  procedures: 0.15,
  evidenceProfiles: 0.10,
  agencies: 0.10,
  remedyTemplates: 0.10,
  advocacyTargets: 0.05,
};

// ─── Normalized Domain Mapping ───
// Maps raw domain strings from various tables to standardized claim types

const DOMAIN_TO_CLAIM_TYPE: Record<string, string> = {
  employment: "employment",
  housing: "housing",
  consumer: "consumer_protection",
  healthcare: "healthcare",
  benefits: "benefits",
  civil_rights: "civil_rights",
  criminal_justice: "criminal_justice",
  environmental: "environmental",
  education: "education",
  immigration: "immigration",
  tribal: "tribal_rights",
  family: "family_law",
  foia: "government_transparency",
  disability: "disability_rights",
  insurance: "insurance",
  utilities: "utilities",
  wage_theft: "employment",
  debt_collection: "consumer_protection",
  market: "consumer_protection",
  securities: "consumer_protection",
  labor: "employment",
  child_welfare: "family_law",
  workplace_safety: "employment",
  veterans: "benefits",
  mental_health: "healthcare",
  native_affairs: "tribal_rights",
  oversight: "government_transparency",
};

/**
 * Normalize a comma-separated domain string into claim types
 */
function normalizeDomains(domains: string | null): string[] {
  if (!domains) return ["other"];
  return domains.split(",").map(d => {
    const trimmed = d.trim().toLowerCase();
    return DOMAIN_TO_CLAIM_TYPE[trimmed] || trimmed;
  }).filter(Boolean);
}

// ─── Standard Jurisdictions and Claim Types ───

export const STANDARD_JURISDICTIONS = [
  "Federal", "CA", "NY", "TX", "FL", "IL", "PA", "OH", "GA", "NC",
  "MI", "NJ", "VA", "WA", "AZ", "MA", "TN", "IN", "MO", "MD",
  "WI", "CO", "MN", "SC", "AL", "LA", "KY", "OR", "OK", "CT",
  "UT", "IA", "NV", "AR", "MS", "KS", "NM", "NE", "ID", "WV",
  "HI", "NH", "ME", "MT", "RI", "DE", "SD", "ND", "AK", "VT",
  "WY", "DC", "GU", "PR", "VI", "AS", "MP",
];

export const STANDARD_CLAIM_TYPES = [
  "employment", "housing", "consumer_protection", "healthcare",
  "benefits", "civil_rights", "criminal_justice", "environmental",
  "education", "immigration", "tribal_rights", "family_law",
  "government_transparency", "disability_rights", "insurance", "utilities",
];

// ─── Coverage Calculation ───

export interface CoverageCell {
  jurisdiction: string;
  claimType: string;
  statuteCount: number;
  caseLawCount: number;
  agencyCount: number;
  proceduralCount: number;
  evidenceProfilesCount: number;
  advocacyTargetsCount: number;
  remedyTemplatesCount: number;
  deadlineRulesCount: number;
  coverageScore: number;
  missingCategories: string[];
}

/**
 * Calculate weighted coverage score from individual counts.
 * Each category is scored as min(count/target, 1.0) × weight.
 * Targets represent "adequate" coverage per cell.
 */
function calculateCoverageScore(counts: {
  statutes: number;
  caseLaw: number;
  agencies: number;
  procedures: number;
  evidenceProfiles: number;
  advocacyTargets: number;
  remedyTemplates: number;
}): number {
  const targets = {
    statutes: 3,      // 3 statutes per jurisdiction/claim
    caseLaw: 2,       // 2 case law per jurisdiction/claim
    agencies: 1,      // 1 agency per jurisdiction/claim
    procedures: 1,    // 1 procedural path
    evidenceProfiles: 1, // 1 evidence profile
    advocacyTargets: 1,  // 1 advocacy target
    remedyTemplates: 1,  // 1 remedy template
  };

  let score = 0;
  score += Math.min(counts.statutes / targets.statutes, 1.0) * COVERAGE_WEIGHTS.statutes;
  score += Math.min(counts.caseLaw / targets.caseLaw, 1.0) * COVERAGE_WEIGHTS.caseLaw;
  score += Math.min(counts.agencies / targets.agencies, 1.0) * COVERAGE_WEIGHTS.agencies;
  score += Math.min(counts.procedures / targets.procedures, 1.0) * COVERAGE_WEIGHTS.procedures;
  score += Math.min(counts.evidenceProfiles / targets.evidenceProfiles, 1.0) * COVERAGE_WEIGHTS.evidenceProfiles;
  score += Math.min(counts.advocacyTargets / targets.advocacyTargets, 1.0) * COVERAGE_WEIGHTS.advocacyTargets;
  score += Math.min(counts.remedyTemplates / targets.remedyTemplates, 1.0) * COVERAGE_WEIGHTS.remedyTemplates;

  return Math.round(score * 100);
}

/**
 * Identify which categories are missing for a given cell
 */
function getMissingCategories(counts: {
  statutes: number;
  caseLaw: number;
  agencies: number;
  procedures: number;
  evidenceProfiles: number;
  advocacyTargets: number;
  remedyTemplates: number;
}): string[] {
  const missing: string[] = [];
  if (counts.statutes === 0) missing.push("statutes");
  if (counts.caseLaw === 0) missing.push("case_law");
  if (counts.agencies === 0) missing.push("agencies");
  if (counts.procedures === 0) missing.push("procedures");
  if (counts.evidenceProfiles === 0) missing.push("evidence_profiles");
  if (counts.advocacyTargets === 0) missing.push("advocacy_targets");
  if (counts.remedyTemplates === 0) missing.push("remedy_templates");
  return missing;
}

/**
 * Run the full coverage calculation.
 * Queries each knowledge table, groups by jurisdiction × domain,
 * then calculates weighted coverage scores.
 */
export async function calculateCoverage(): Promise<{
  cells: CoverageCell[];
  overallScore: number;
  jurisdictionScores: Record<string, number>;
  claimTypeScores: Record<string, number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const now = Date.now();

  // Build a map: jurisdiction → claimType → counts
  const coverageMap = new Map<string, Map<string, {
    statutes: number;
    caseLaw: number;
    agencies: number;
    procedures: number;
    evidenceProfiles: number;
    advocacyTargets: number;
    remedyTemplates: number;
    deadlineRules: number;
  }>>();

  function ensureCell(jurisdiction: string, claimType: string) {
    if (!coverageMap.has(jurisdiction)) coverageMap.set(jurisdiction, new Map());
    const jMap = coverageMap.get(jurisdiction)!;
    if (!jMap.has(claimType)) {
      jMap.set(claimType, {
        statutes: 0, caseLaw: 0, agencies: 0, procedures: 0,
        evidenceProfiles: 0, advocacyTargets: 0, remedyTemplates: 0, deadlineRules: 0,
      });
    }
    return jMap.get(claimType)!;
  }

  // 1. Statutes (jurisdiction + domains)
  try {
    const [rows]: any = await db.execute(sql.raw(
      `SELECT jurisdiction, domains FROM legal_statutes`
    ));
    for (const r of rows as any[]) {
      const claimTypes = normalizeDomains(r.domains);
      for (const ct of claimTypes) {
        ensureCell(r.jurisdiction, ct).statutes++;
      }
    }
  } catch (e) { errors.push(`statutes: ${e}`); }

  // 2. Case Law (jurisdiction + domains)
  try {
    const [rows]: any = await db.execute(sql.raw(
      `SELECT jurisdiction, domains FROM legal_case_law`
    ));
    for (const r of rows as any[]) {
      const claimTypes = normalizeDomains(r.domains);
      for (const ct of claimTypes) {
        ensureCell(r.jurisdiction, ct).caseLaw++;
      }
    }
  } catch (e) { errors.push(`case_law: ${e}`); }

  // 3. Agency Authorities (domain → claim type, no jurisdiction column — use 'Federal')
  try {
    const [rows]: any = await db.execute(sql.raw(
      `SELECT domain FROM agency_authority_map`
    ));
    for (const r of rows as any[]) {
      const claimTypes = normalizeDomains(r.domain);
      for (const ct of claimTypes) {
        ensureCell("Federal", ct).agencies++;
      }
    }
  } catch (e) { errors.push(`agencies: ${e}`); }

  // 4. Procedural Paths (jurisdiction + claim_type)
  try {
    const [rows]: any = await db.execute(sql.raw(
      `SELECT jurisdiction, claim_type FROM procedural_paths`
    ));
    for (const r of rows as any[]) {
      const ct = DOMAIN_TO_CLAIM_TYPE[r.claim_type?.toLowerCase()] || r.claim_type?.toLowerCase() || "other";
      ensureCell(r.jurisdiction, ct).procedures++;
    }
  } catch (e) { errors.push(`procedures: ${e}`); }

  // 5. Evidence Profiles (no jurisdiction — use 'Federal', claimType from table)
  try {
    const [rows]: any = await db.execute(sql.raw(
      `SELECT claimType FROM evidence_profiles`
    ));
    for (const r of rows as any[]) {
      const ct = DOMAIN_TO_CLAIM_TYPE[r.claimType?.toLowerCase()] || r.claimType?.toLowerCase() || "other";
      ensureCell("Federal", ct).evidenceProfiles++;
    }
  } catch (e) { errors.push(`evidence_profiles: ${e}`); }

  // 6. Advocacy Targets (jurisdiction + issue_domains)
  try {
    const [rows]: any = await db.execute(sql.raw(
      `SELECT jurisdiction, issue_domains FROM advocacy_targets`
    ));
    for (const r of rows as any[]) {
      const claimTypes = normalizeDomains(r.issue_domains);
      for (const ct of claimTypes) {
        ensureCell(r.jurisdiction, ct).advocacyTargets++;
      }
    }
  } catch (e) { errors.push(`advocacy_targets: ${e}`); }

  // 7. Remedy Templates (no jurisdiction — use 'Federal')
  try {
    const [rows]: any = await db.execute(sql.raw(
      `SELECT claim_type FROM remedy_feasibility_rules`
    ));
    for (const r of rows as any[]) {
      const ct = DOMAIN_TO_CLAIM_TYPE[r.claim_type?.toLowerCase()] || r.claim_type?.toLowerCase() || "other";
      ensureCell("Federal", ct).remedyTemplates++;
    }
  } catch (e) { errors.push(`remedy_templates: ${e}`); }

  // 8. Deadline Rules (jurisdiction + claimType)
  try {
    const [rows]: any = await db.execute(sql.raw(
      `SELECT jurisdiction, claimType FROM deadline_rules`
    ));
    for (const r of rows as any[]) {
      const ct = DOMAIN_TO_CLAIM_TYPE[r.claimType?.toLowerCase()] || r.claimType?.toLowerCase() || "other";
      ensureCell(r.jurisdiction, ct).deadlineRules++;
    }
  } catch (e) { errors.push(`deadline_rules: ${e}`); }

  // Build cells array and persist to DB
  const cells: CoverageCell[] = [];
  const jurisdictionTotals = new Map<string, { sum: number; count: number }>();
  const claimTypeTotals = new Map<string, { sum: number; count: number }>();

  for (const [jurisdiction, claimMap] of coverageMap) {
    for (const [claimType, counts] of claimMap) {
      const score = calculateCoverageScore(counts);
      const missing = getMissingCategories(counts);

      cells.push({
        jurisdiction,
        claimType,
        statuteCount: counts.statutes,
        caseLawCount: counts.caseLaw,
        agencyCount: counts.agencies,
        proceduralCount: counts.procedures,
        evidenceProfilesCount: counts.evidenceProfiles,
        advocacyTargetsCount: counts.advocacyTargets,
        remedyTemplatesCount: counts.remedyTemplates,
        deadlineRulesCount: counts.deadlineRules,
        coverageScore: score,
        missingCategories: missing,
      });

      // Accumulate jurisdiction scores
      if (!jurisdictionTotals.has(jurisdiction)) jurisdictionTotals.set(jurisdiction, { sum: 0, count: 0 });
      const jt = jurisdictionTotals.get(jurisdiction)!;
      jt.sum += score;
      jt.count++;

      // Accumulate claim type scores
      if (!claimTypeTotals.has(claimType)) claimTypeTotals.set(claimType, { sum: 0, count: 0 });
      const ct = claimTypeTotals.get(claimType)!;
      ct.sum += score;
      ct.count++;
    }
  }

  // Persist to DB
  for (const cell of cells) {
    try {
      const j = cell.jurisdiction.replace(/'/g, "''");
      const c = cell.claimType.replace(/'/g, "''");
      await db.execute(sql.raw(
        `INSERT INTO knowledge_coverage_metrics 
         (jurisdiction_kcm, claim_type_kcm, statute_count, case_law_count, agency_count, 
          procedural_count, evidence_profiles_count, advocacy_targets_count, 
          remedy_templates_count, deadline_rules_count, coverage_score, last_calculated, created_at_kcm, updated_at_kcm)
         VALUES ('${j}', '${c}', ${cell.statuteCount}, ${cell.caseLawCount}, ${cell.agencyCount},
                 ${cell.proceduralCount}, ${cell.evidenceProfilesCount}, ${cell.advocacyTargetsCount},
                 ${cell.remedyTemplatesCount}, ${cell.deadlineRulesCount}, ${cell.coverageScore}, ${now}, ${now}, ${now})
         ON DUPLICATE KEY UPDATE
           statute_count = VALUES(statute_count),
           case_law_count = VALUES(case_law_count),
           agency_count = VALUES(agency_count),
           procedural_count = VALUES(procedural_count),
           evidence_profiles_count = VALUES(evidence_profiles_count),
           advocacy_targets_count = VALUES(advocacy_targets_count),
           remedy_templates_count = VALUES(remedy_templates_count),
           deadline_rules_count = VALUES(deadline_rules_count),
           coverage_score = VALUES(coverage_score),
           last_calculated = VALUES(last_calculated),
           updated_at_kcm = VALUES(updated_at_kcm)`
      ));
    } catch (e) {
      errors.push(`persist ${cell.jurisdiction}/${cell.claimType}: ${e}`);
    }
  }

  // Calculate aggregate scores
  const jurisdictionScores: Record<string, number> = {};
  for (const [j, t] of jurisdictionTotals) {
    jurisdictionScores[j] = t.count > 0 ? Math.round(t.sum / t.count) : 0;
  }

  const claimTypeScores: Record<string, number> = {};
  for (const [c, t] of claimTypeTotals) {
    claimTypeScores[c] = t.count > 0 ? Math.round(t.sum / t.count) : 0;
  }

  const overallScore = cells.length > 0
    ? Math.round(cells.reduce((s, c) => s + c.coverageScore, 0) / cells.length)
    : 0;

  return { cells, overallScore, jurisdictionScores, claimTypeScores, errors };
}

/**
 * Get coverage metrics from the database (cached results)
 */
export async function getCoverageMetrics(): Promise<CoverageCell[]> {
  const [rows]: any = await db.execute(sql.raw(
    `SELECT jurisdiction_kcm, claim_type_kcm, statute_count, case_law_count, agency_count,
            procedural_count, evidence_profiles_count, advocacy_targets_count,
            remedy_templates_count, deadline_rules_count, coverage_score
     FROM knowledge_coverage_metrics
     ORDER BY jurisdiction_kcm, claim_type_kcm`
  ));
  return (rows as any[]).map(r => ({
    jurisdiction: r.jurisdiction_kcm,
    claimType: r.claim_type_kcm,
    statuteCount: Number(r.statute_count),
    caseLawCount: Number(r.case_law_count),
    agencyCount: Number(r.agency_count),
    proceduralCount: Number(r.procedural_count),
    evidenceProfilesCount: Number(r.evidence_profiles_count),
    advocacyTargetsCount: Number(r.advocacy_targets_count),
    remedyTemplatesCount: Number(r.remedy_templates_count),
    deadlineRulesCount: Number(r.deadline_rules_count),
    coverageScore: Number(r.coverage_score),
    missingCategories: [],
  }));
}

/**
 * Get coverage for a specific jurisdiction × claim type cell
 */
export async function getCellDetail(jurisdiction: string, claimType: string): Promise<CoverageCell | null> {
  const j = jurisdiction.replace(/'/g, "''");
  const c = claimType.replace(/'/g, "''");
  const [rows]: any = await db.execute(sql.raw(
    `SELECT jurisdiction_kcm, claim_type_kcm, statute_count, case_law_count, agency_count,
            procedural_count, evidence_profiles_count, advocacy_targets_count,
            remedy_templates_count, deadline_rules_count, coverage_score
     FROM knowledge_coverage_metrics
     WHERE jurisdiction_kcm = '${j}' AND claim_type_kcm = '${c}'`
  ));
  if (!(rows as any[]).length) return null;
  const r = (rows as any[])[0];
  const counts = {
    statutes: Number(r.statute_count),
    caseLaw: Number(r.case_law_count),
    agencies: Number(r.agency_count),
    procedures: Number(r.procedural_count),
    evidenceProfiles: Number(r.evidence_profiles_count),
    advocacyTargets: Number(r.advocacy_targets_count),
    remedyTemplates: Number(r.remedy_templates_count),
  };
  return {
    jurisdiction: r.jurisdiction_kcm,
    claimType: r.claim_type_kcm,
    statuteCount: counts.statutes,
    caseLawCount: counts.caseLaw,
    agencyCount: counts.agencies,
    proceduralCount: counts.procedures,
    evidenceProfilesCount: counts.evidenceProfiles,
    advocacyTargetsCount: counts.advocacyTargets,
    remedyTemplatesCount: counts.remedyTemplates,
    deadlineRulesCount: Number(r.deadline_rules_count),
    coverageScore: Number(r.coverage_score),
    missingCategories: getMissingCategories(counts),
  };
}
