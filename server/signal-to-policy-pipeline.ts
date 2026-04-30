/**
 * Signal-to-Policy Pipeline
 *
 * STP1. Policy Impact Mapping — map patterns to affected laws and policy levers
 * STP2. Policy Signal Detection — detect policy implications from patterns
 * STP3. Policy Recommendation Generation — generate structured reform proposals
 * STP4. Policy Dashboard — aggregate policy data for display
 * STP5. Civic Escalation — generate policy briefs, legislative memos, public comments
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── STP1. Policy Impact Mapping ────────────────────────────────────────────
export interface PolicyImpact {
  patternType: string;
  affectedLaws: string[];
  affectedAgencies: string[];
  regulatoryGaps: string[];
  policyLevers: string[];
}

export async function getPolicyImpactMap(patternType: string): Promise<PolicyImpact | null> {
  const [rows] = await db.execute(sql`
    SELECT * FROM policy_impact_map WHERE pattern_type = ${patternType} LIMIT 1
  `);
  const row = (rows as unknown as any[])[0];
  if (!row) return null;

  return {
    patternType: row.pattern_type,
    affectedLaws: parseJson(row.affected_laws, []),
    affectedAgencies: parseJson(row.affected_agencies, []),
    regulatoryGaps: parseJson(row.regulatory_gaps, []),
    policyLevers: parseJson(row.policy_levers, []),
  };
}

export async function getAllPolicyImpactMaps(): Promise<PolicyImpact[]> {
  const [rows] = await db.execute(sql`SELECT * FROM policy_impact_map ORDER BY pattern_type`);
  return (rows as unknown as any[]).map(row => ({
    patternType: row.pattern_type,
    affectedLaws: parseJson(row.affected_laws, []),
    affectedAgencies: parseJson(row.affected_agencies, []),
    regulatoryGaps: parseJson(row.regulatory_gaps, []),
    policyLevers: parseJson(row.policy_levers, []),
  }));
}

// ─── STP2. Policy Signal Detection ──────────────────────────────────────────
export interface PolicySignal {
  patternId: string;
  patternName: string;
  patternType: string;
  trendClassification: string;
  pressureIndex: number;
  policyRiskScore: number;
  recommendedReforms: string[];
  urgency: 'critical' | 'high' | 'moderate' | 'low';
}

export async function detectPolicyImplications(patternId: string): Promise<PolicySignal | null> {
  // Get pattern details
  const [patternRows] = await db.execute(sql`
    SELECT pr.*, tr.trend_classification, tr.pressure_index, tr.momentum_direction,
           tr.growth_rate_7d
    FROM pattern_registry pr
    LEFT JOIN trend_registry tr ON tr.pattern_id = pr.pattern_id AND tr.is_current = 1
    WHERE pr.pattern_id = ${patternId}
  `);
  const pattern = (patternRows as unknown as any[])[0];
  if (!pattern) return null;

  // Get policy impact map for this pattern type
  const impact = await getPolicyImpactMap(pattern.pattern_type);

  // Calculate policy risk score
  const pressureIndex = Number(pattern.pressure_index) || 0;
  const confidence = Number(pattern.confidence_score) || 0;
  const signalCount = Number(pattern.signal_count) || 0;
  const growthRate = Number(pattern.growth_rate_7d) || 0;

  const policyRiskScore = Math.min(100, Math.round(
    pressureIndex * 0.3 +
    confidence * 0.2 +
    Math.min(signalCount * 2, 30) +
    (growthRate > 0 ? growthRate * 0.5 : 0)
  ));

  const urgency: PolicySignal['urgency'] =
    policyRiskScore >= 80 ? 'critical' :
    policyRiskScore >= 60 ? 'high' :
    policyRiskScore >= 40 ? 'moderate' : 'low';

  const recommendedReforms = impact?.policyLevers || [];

  return {
    patternId,
    patternName: pattern.pattern_name,
    patternType: pattern.pattern_type,
    trendClassification: pattern.trend_classification || 'stable',
    pressureIndex,
    policyRiskScore,
    recommendedReforms,
    urgency,
  };
}

// ─── STP3. Policy Recommendation Generation ─────────────────────────────────
export interface PolicyRecommendation {
  id?: number;
  title: string;
  description: string;
  problemStatement: string;
  evidencePatterns: string[];
  affectedPopulation: string;
  proposedSolution: string;
  urgency: string;
  policyRiskScore: number;
  status: string;
}

export async function generatePolicyRecommendation(
  patternId: string
): Promise<PolicyRecommendation> {
  const signal = await detectPolicyImplications(patternId);
  if (!signal) throw new Error(`Pattern ${patternId} not found`);

  const impact = await getPolicyImpactMap(signal.patternType);

  // Get signal count and affected entities
  const [entityRows] = await db.execute(sql`
    SELECT COUNT(DISTINCT entity_name) as entities, COUNT(*) as signals
    FROM detected_signals
    WHERE signal_type = ${signal.patternType.replace(/_pattern$/, '')}
      AND status = 'active'
  `);
  const entityCount = Number((entityRows as unknown as any[])[0]?.entities) || 0;
  const signalCount = Number((entityRows as unknown as any[])[0]?.signals) || 0;

  // Get geographic spread
  const [geoRows] = await db.execute(sql`
    SELECT COUNT(DISTINCT jurisdiction) as jurisdictions
    FROM detected_signals
    WHERE signal_type = ${signal.patternType.replace(/_pattern$/, '')}
      AND status = 'active'
  `);
  const jurisdictionCount = Number((geoRows as unknown as any[])[0]?.jurisdictions) || 0;

  const title = `Strengthen ${signal.patternType.replace(/_/g, ' ')} enforcement`;
  const problemStatement = `${signalCount} ${signal.patternType.replace(/_/g, ' ')} complaints across ${entityCount} entities in ${jurisdictionCount} jurisdictions.`;
  const affectedPopulation = `Estimated ${signalCount * 5} individuals affected based on signal density.`;
  const proposedSolution = (impact?.policyLevers || []).join('; ') || 'Increase enforcement and reporting requirements.';

  const recommendation: PolicyRecommendation = {
    title,
    description: `Policy recommendation based on ${signal.patternName} (${signal.trendClassification} trend, pressure index ${signal.pressureIndex}).`,
    problemStatement,
    evidencePatterns: [patternId],
    affectedPopulation,
    proposedSolution,
    urgency: signal.urgency,
    policyRiskScore: signal.policyRiskScore,
    status: 'draft',
  };

  // Store recommendation
  const nowMs = Date.now();
  const [result] = await db.execute(sql`
    INSERT INTO policy_recommendations (title, description, problem_statement,
      evidence_patterns, affected_population, proposed_solution, urgency,
      policy_risk_score, status, created_at, updated_at)
    VALUES (${recommendation.title}, ${recommendation.description},
      ${recommendation.problemStatement}, ${JSON.stringify(recommendation.evidencePatterns)},
      ${recommendation.affectedPopulation}, ${recommendation.proposedSolution},
      ${recommendation.urgency}, ${recommendation.policyRiskScore}, 'draft', ${nowMs}, ${nowMs})
  `);
  recommendation.id = (result as any).insertId;

  return recommendation;
}

// ─── STP4. Policy Dashboard ─────────────────────────────────────────────────
export async function getPolicyDashboard(): Promise<{
  recommendations: PolicyRecommendation[];
  policySignals: PolicySignal[];
  impactMaps: PolicyImpact[];
  totalPatterns: number;
  criticalIssues: number;
}> {
  // Get all recommendations
  const [recRows] = await db.execute(sql`
    SELECT * FROM policy_recommendations ORDER BY policy_risk_score DESC LIMIT 20
  `);
  const recommendations: PolicyRecommendation[] = (recRows as unknown as any[]).map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    problemStatement: r.problem_statement,
    evidencePatterns: parseJson(r.evidence_patterns, []),
    affectedPopulation: r.affected_population,
    proposedSolution: r.proposed_solution,
    urgency: r.urgency,
    policyRiskScore: Number(r.policy_risk_score),
    status: r.status,
  }));

  // Get active patterns with high pressure
  const [patternRows] = await db.execute(sql`
    SELECT pattern_id FROM pattern_registry
    WHERE confidence_score >= 50
    ORDER BY signal_count DESC LIMIT 10
  `);

  const policySignals: PolicySignal[] = [];
  for (const p of (patternRows as unknown as any[]).slice(0, 5)) {
    const signal = await detectPolicyImplications(p.pattern_id);
    if (signal) policySignals.push(signal);
  }

  const impactMaps = await getAllPolicyImpactMaps();

  const [totalRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM pattern_registry`);
  const totalPatterns = Number((totalRows as unknown as any[])[0]?.cnt) || 0;

  const criticalIssues = policySignals.filter(s => s.urgency === 'critical').length;

  return { recommendations, policySignals, impactMaps, totalPatterns, criticalIssues };
}

// ─── STP5. Civic Escalation Documents ───────────────────────────────────────
export function generatePolicyBrief(recommendation: PolicyRecommendation): string {
  const lines: string[] = [];
  lines.push('POLICY BRIEF');
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`Title: ${recommendation.title}`);
  lines.push(`Urgency: ${recommendation.urgency.toUpperCase()}`);
  lines.push(`Risk Score: ${recommendation.policyRiskScore}/100`);
  lines.push('');
  lines.push('PROBLEM STATEMENT');
  lines.push('─'.repeat(40));
  lines.push(recommendation.problemStatement);
  lines.push('');
  lines.push('AFFECTED POPULATION');
  lines.push('─'.repeat(40));
  lines.push(recommendation.affectedPopulation);
  lines.push('');
  lines.push('EVIDENCE BASE');
  lines.push('─'.repeat(40));
  lines.push(recommendation.description);
  lines.push(`Patterns: ${recommendation.evidencePatterns.join(', ')}`);
  lines.push('');
  lines.push('PROPOSED SOLUTION');
  lines.push('─'.repeat(40));
  lines.push(recommendation.proposedSolution);
  lines.push('');
  lines.push('═'.repeat(50));
  lines.push(`Generated: ${new Date().toISOString()}`);
  return lines.join('\n');
}

export function generateLegislativeMemo(recommendation: PolicyRecommendation): string {
  const lines: string[] = [];
  lines.push('LEGISLATIVE MEMORANDUM');
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`RE: ${recommendation.title}`);
  lines.push(`Date: ${new Date().toLocaleDateString()}`);
  lines.push(`Priority: ${recommendation.urgency.toUpperCase()}`);
  lines.push('');
  lines.push('SUMMARY');
  lines.push('─'.repeat(40));
  lines.push(recommendation.description);
  lines.push('');
  lines.push('BACKGROUND');
  lines.push('─'.repeat(40));
  lines.push(recommendation.problemStatement);
  lines.push('');
  lines.push('IMPACT ASSESSMENT');
  lines.push('─'.repeat(40));
  lines.push(recommendation.affectedPopulation);
  lines.push(`Policy Risk Score: ${recommendation.policyRiskScore}/100`);
  lines.push('');
  lines.push('RECOMMENDATION');
  lines.push('─'.repeat(40));
  lines.push(recommendation.proposedSolution);
  lines.push('');
  lines.push('ACTION REQUESTED');
  lines.push('─'.repeat(40));
  lines.push('Review and consider legislative action to address the identified systemic issues.');
  lines.push('');
  lines.push('═'.repeat(50));
  return lines.join('\n');
}

export function generatePublicComment(recommendation: PolicyRecommendation): string {
  const lines: string[] = [];
  lines.push('PUBLIC COMMENT DRAFT');
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`Subject: ${recommendation.title}`);
  lines.push('');
  lines.push('To Whom It May Concern,');
  lines.push('');
  lines.push(`I am writing to bring attention to a systemic issue identified through data analysis: ${recommendation.problemStatement}`);
  lines.push('');
  lines.push(`${recommendation.affectedPopulation}`);
  lines.push('');
  lines.push(`Based on our analysis (risk score: ${recommendation.policyRiskScore}/100), we recommend: ${recommendation.proposedSolution}`);
  lines.push('');
  lines.push('We urge prompt action to address these concerns.');
  lines.push('');
  lines.push('Respectfully submitted,');
  lines.push('[Name]');
  lines.push('[Organization]');
  lines.push('');
  lines.push('═'.repeat(50));
  return lines.join('\n');
}

// ─── STP6. Full Pipeline ────────────────────────────────────────────────────
export async function runSignalToPolicyPipeline(patternId: string): Promise<{
  policySignal: PolicySignal | null;
  recommendation: PolicyRecommendation | null;
  impactMap: PolicyImpact | null;
}> {
  const policySignal = await detectPolicyImplications(patternId);
  if (!policySignal) return { policySignal: null, recommendation: null, impactMap: null };

  const impactMap = await getPolicyImpactMap(policySignal.patternType);

  let recommendation: PolicyRecommendation | null = null;
  if (policySignal.policyRiskScore >= 40) {
    recommendation = await generatePolicyRecommendation(patternId);
  }

  return { policySignal, recommendation, impactMap };
}

function parseJson(val: any, fallback: any): any {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
