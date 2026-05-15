/**
 * Evidence Confidence Engine Service
 * 
 * T1. Input: claim_type + array of evidence items → fetch matching rule from evidence_confidence_rules.
 * T2. Score: sum evidence_weights for each present evidence type.
 * T3. Penalty: if any required_evidence item is missing, subtract 30.
 * T4. Alternative bonus: if required evidence missing but alternatives present, add min(count*5, 20).
 * T5. Credibility adjustments: contradictions −15, third-party +10, self-serving −10.
 * T6. Clamp score to [0, 100].
 * T7. Pathfinding: score ≥ 80 → federal_court; ≥ 50 → agency_complaint; < 50 → evidence_gathering.
 * T8. Remedy: score ≥ 80 → STRONG litigation; ≥ 50 → MODERATE demand; < 50 → WEAK investigation.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  type: string;
  description?: string;
  source?: "first_party" | "third_party" | "government" | "employer" | "other";
  has_contradictions?: boolean;
  corroborated?: boolean;
}

export interface ConfidenceResult {
  claimType: string;
  score: number;
  level: "high" | "medium" | "low";
  requiredPresent: string[];
  requiredMissing: string[];
  supportingPresent: string[];
  alternativesUsed: string[];
  evidenceGaps: string[];
  adjustments: { reason: string; delta: number }[];
}

export interface StrategyPath {
  primaryPath: string;
  secondaryPaths: string[];
  evidencePriorities: string[];
  timelineEstimate: string;
  successProbability: string;
}

export interface RemedyRecommendation {
  recommendation: string;
  strategy: string;
  settlementRange: string;
  alternativeDispute: string;
}

export interface EvidenceConfidenceDashboard {
  totalRules: number;
  claimTypesByDomain: Record<string, number>;
  recentAnalyses: number;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

export async function calculateEvidenceConfidence(
  claimType: string,
  evidencePresent: EvidenceItem[]
): Promise<ConfidenceResult> {
  // T1: Fetch rule
  const [rows] = await db.execute(
    sql`SELECT * FROM evidence_confidence_rules WHERE claim_type = ${claimType} LIMIT 1`
  );
  const rule = (rows as unknown as any[])[0];
  if (!rule) {
    return {
      claimType,
      score: 0,
      level: "low",
      requiredPresent: [],
      requiredMissing: [],
      supportingPresent: [],
      alternativesUsed: [],
      evidenceGaps: [],
      adjustments: [{ reason: "No confidence rule found for claim type", delta: 0 }],
    };
  }

  const requiredEvidence: string[] = typeof rule.required_evidence === "string"
    ? JSON.parse(rule.required_evidence) : rule.required_evidence;
  const supportingEvidence: string[] = rule.supporting_evidence
    ? (typeof rule.supporting_evidence === "string" ? JSON.parse(rule.supporting_evidence) : rule.supporting_evidence)
    : [];
  const alternativeEvidence: string[] = rule.alternative_evidence
    ? (typeof rule.alternative_evidence === "string" ? JSON.parse(rule.alternative_evidence) : rule.alternative_evidence)
    : [];
  const weights: Record<string, number> = typeof rule.evidence_weights === "string"
    ? JSON.parse(rule.evidence_weights) : rule.evidence_weights;
  const thresholds: Record<string, number> = typeof rule.confidence_thresholds === "string"
    ? JSON.parse(rule.confidence_thresholds) : rule.confidence_thresholds;

  const presentTypes = new Set(evidencePresent.map(e => e.type));
  const adjustments: { reason: string; delta: number }[] = [];

  // T2: Sum weights for present evidence
  let score = 0;
  for (const ev of evidencePresent) {
    if (weights[ev.type]) {
      score += weights[ev.type];
      adjustments.push({ reason: `Evidence weight: ${ev.type}`, delta: weights[ev.type] });
    }
  }

  // T3: Required evidence penalty
  const requiredPresent = requiredEvidence.filter(r => presentTypes.has(r));
  const requiredMissing = requiredEvidence.filter(r => !presentTypes.has(r));
  if (requiredMissing.length > 0) {
    score -= 30;
    adjustments.push({ reason: `Missing required evidence: ${requiredMissing.join(", ")}`, delta: -30 });
  }

  // T4: Alternative evidence bonus
  const alternativesUsed: string[] = [];
  if (requiredMissing.length > 0) {
    for (const alt of alternativeEvidence) {
      if (presentTypes.has(alt)) alternativesUsed.push(alt);
    }
    if (alternativesUsed.length > 0) {
      const bonus = Math.min(alternativesUsed.length * 5, 20);
      score += bonus;
      adjustments.push({ reason: `Alternative evidence bonus (${alternativesUsed.length} items)`, delta: bonus });
    }
  }

  // T5: Credibility adjustments
  for (const ev of evidencePresent) {
    if (ev.has_contradictions) {
      score -= 15;
      adjustments.push({ reason: `Contradictions in ${ev.type}`, delta: -15 });
    }
    if (ev.source === "third_party" || ev.source === "government") {
      score += 10;
      adjustments.push({ reason: `Third-party/government source: ${ev.type}`, delta: 10 });
    }
    if (ev.source === "first_party" && !ev.corroborated) {
      score -= 10;
      adjustments.push({ reason: `Uncorroborated self-serving: ${ev.type}`, delta: -10 });
    }
  }

  // T6: Clamp
  score = Math.max(0, Math.min(100, score));

  // Determine level from thresholds
  const highThreshold = thresholds.high || 80;
  const mediumThreshold = thresholds.medium || 50;
  const level: "high" | "medium" | "low" =
    score >= highThreshold ? "high" : score >= mediumThreshold ? "medium" : "low";

  // Supporting evidence present
  const supportingPresent = supportingEvidence.filter(s => presentTypes.has(s));

  // Evidence gaps: required missing + supporting not present
  const evidenceGaps = [
    ...requiredMissing,
    ...supportingEvidence.filter(s => !presentTypes.has(s)),
  ];

  return {
    claimType,
    score,
    level,
    requiredPresent,
    requiredMissing,
    supportingPresent,
    alternativesUsed,
    evidenceGaps,
    adjustments,
  };
}

// T7: Strategy path determination
export function determineStrategyPath(
  claimType: string,
  confidenceScore: number,
  evidenceGaps: string[]
): StrategyPath {
  if (confidenceScore >= 80) {
    return {
      primaryPath: "federal_court",
      secondaryPaths: ["state_court", "agency_complaint"],
      evidencePriorities: evidenceGaps.slice(0, 3),
      timelineEstimate: "6-12 months",
      successProbability: "high",
    };
  } else if (confidenceScore >= 50) {
    return {
      primaryPath: "agency_complaint",
      secondaryPaths: ["mediation", "demand_letter"],
      evidencePriorities: evidenceGaps.slice(0, 5),
      timelineEstimate: "3-6 months",
      successProbability: "moderate",
    };
  } else {
    return {
      primaryPath: "evidence_gathering",
      secondaryPaths: ["administrative_review", "informal_resolution"],
      evidencePriorities: evidenceGaps,
      timelineEstimate: "1-3 months for investigation",
      successProbability: "low",
    };
  }
}

// T8: Remedy recommendation
export function recommendRemedy(
  confidenceScore: number,
  claimType: string
): RemedyRecommendation {
  if (confidenceScore >= 80) {
    return {
      recommendation: "STRONG - Proceed with litigation",
      strategy: "File formal complaint, seek maximum remedies",
      settlementRange: "High value",
      alternativeDispute: "Optional - strong position for mediation",
    };
  } else if (confidenceScore >= 50) {
    return {
      recommendation: "MODERATE - Consider investigation or demand letter",
      strategy: "Gather additional evidence, send demand letter",
      settlementRange: "Moderate value",
      alternativeDispute: "Recommended - mediation or arbitration",
    };
  } else {
    return {
      recommendation: "WEAK - Investigate further",
      strategy: "Focus on evidence gathering, consider administrative remedies",
      settlementRange: "Low value",
      alternativeDispute: "Best path - seek early resolution",
    };
  }
}

// Full analysis: combines scoring + pathfinding + remedy
export async function analyzeEvidenceConfidence(
  claimType: string,
  evidencePresent: EvidenceItem[]
): Promise<{
  confidence: ConfidenceResult;
  strategyPath: StrategyPath;
  remedy: RemedyRecommendation;
}> {
  const confidence = await calculateEvidenceConfidence(claimType, evidencePresent);
  const strategyPath = determineStrategyPath(claimType, confidence.score, confidence.evidenceGaps);
  const remedy = recommendRemedy(confidence.score, claimType);
  return { confidence, strategyPath, remedy };
}

// Dashboard: aggregate stats
export async function getEvidenceConfidenceDashboard(): Promise<EvidenceConfidenceDashboard> {
  const [countRows] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM evidence_confidence_rules`
  );
  const totalRules = Number((countRows as unknown as any[])[0]?.cnt || 0);

  // Group by domain prefix (claim_type often has domain prefix like employment_, housing_)
  const [domainRows] = await db.execute(
    sql`SELECT 
      CASE 
        WHEN claim_type LIKE 'employment%' OR claim_type LIKE 'wage%' OR claim_type LIKE 'wrongful%' OR claim_type LIKE 'retaliation%' OR claim_type LIKE 'workplace%' THEN 'employment'
        WHEN claim_type LIKE 'housing%' OR claim_type LIKE 'fair_housing%' OR claim_type LIKE 'tenant%' OR claim_type LIKE 'landlord%' OR claim_type LIKE 'rental%' THEN 'housing'
        WHEN claim_type LIKE 'benefit%' OR claim_type LIKE 'medicaid%' OR claim_type LIKE 'ssdi%' OR claim_type LIKE 'ssi%' OR claim_type LIKE 'snap%' OR claim_type LIKE 'tanf%' OR claim_type LIKE 'unemployment%' THEN 'benefits'
        WHEN claim_type LIKE 'civil%' OR claim_type LIKE 'disability%' OR claim_type LIKE 'ada%' OR claim_type LIKE 'voting%' OR claim_type LIKE 'police%' THEN 'civil_rights'
        ELSE 'other'
      END as domain,
      COUNT(*) as cnt
    FROM evidence_confidence_rules
    GROUP BY domain`
  );
  const claimTypesByDomain: Record<string, number> = {};
  for (const row of domainRows as unknown as any[]) {
    claimTypesByDomain[row.domain] = Number(row.cnt);
  }

  return { totalRules, claimTypesByDomain, recentAnalyses: 0 };
}

// Get all available claim types
export async function getAvailableClaimTypes(): Promise<string[]> {
  const [rows] = await db.execute(
    sql`SELECT claim_type FROM evidence_confidence_rules ORDER BY claim_type`
  );
  return (rows as unknown as any[]).map(r => r.claim_type);
}

// Get rule detail for a specific claim type
export async function getEvidenceRuleDetail(claimType: string): Promise<any | null> {
  const [rows] = await db.execute(
    sql`SELECT * FROM evidence_confidence_rules WHERE claim_type = ${claimType} LIMIT 1`
  );
  const rule = (rows as unknown as any[])[0];
  if (!rule) return null;

  return {
    claimType: rule.claim_type,
    requiredEvidence: typeof rule.required_evidence === "string" ? JSON.parse(rule.required_evidence) : rule.required_evidence,
    supportingEvidence: rule.supporting_evidence ? (typeof rule.supporting_evidence === "string" ? JSON.parse(rule.supporting_evidence) : rule.supporting_evidence) : [],
    alternativeEvidence: rule.alternative_evidence ? (typeof rule.alternative_evidence === "string" ? JSON.parse(rule.alternative_evidence) : rule.alternative_evidence) : [],
    evidenceWeights: typeof rule.evidence_weights === "string" ? JSON.parse(rule.evidence_weights) : rule.evidence_weights,
    confidenceThresholds: typeof rule.confidence_thresholds === "string" ? JSON.parse(rule.confidence_thresholds) : rule.confidence_thresholds,
    scoringLogic: rule.scoring_logic,
  };
}
