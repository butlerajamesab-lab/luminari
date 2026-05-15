/**
 * Policy Impact Engine
 * 
 * Measures whether policy changes affect patterns detected by the system.
 * Reports observed correlations only — never claims causation.
 * 
 * Example output:
 *   "Debt collection complaints decreased 34% after WA HB 1150 became effective."
 * NOT:
 *   "HB 1150 caused the decrease."
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── PI1. Policy Event Registry ──────────────────────────────────────────────

export async function getPolicyEvents(filters?: {
  policyType?: string;
  jurisdiction?: string;
  isActive?: boolean;
}): Promise<any[]> {
  if (filters?.policyType && filters?.jurisdiction) {
    const [rows] = await db.execute(sql`
      SELECT * FROM policy_events
      WHERE policy_type = ${filters.policyType}
        AND jurisdiction = ${filters.jurisdiction}
        AND is_active = ${filters.isActive !== false ? 1 : 0}
      ORDER BY effective_date DESC
    `);
    return rows as unknown as any[];
  }
  if (filters?.policyType) {
    const [rows] = await db.execute(sql`
      SELECT * FROM policy_events
      WHERE policy_type = ${filters.policyType} AND is_active = 1
      ORDER BY effective_date DESC
    `);
    return rows as unknown as any[];
  }
  if (filters?.jurisdiction) {
    const [rows] = await db.execute(sql`
      SELECT * FROM policy_events
      WHERE jurisdiction = ${filters.jurisdiction} AND is_active = 1
      ORDER BY effective_date DESC
    `);
    return rows as unknown as any[];
  }
  const [rows] = await db.execute(sql`
    SELECT * FROM policy_events WHERE is_active = 1 ORDER BY effective_date DESC
  `);
  return rows as unknown as any[];
}

export async function getPolicyEventById(policyId: string): Promise<any | null> {
  const [rows] = await db.execute(sql`
    SELECT * FROM policy_events WHERE policy_id = ${policyId}
  `);
  return (rows as unknown as any[])[0] || null;
}

export async function createPolicyEvent(params: {
  policyName: string;
  policyType: string;
  jurisdiction?: string;
  effectiveDate?: string;
  enactedDate?: string;
  affectedDomains?: string[];
  relatedLaws?: string[];
  description?: string;
  sourceUrl?: string;
}): Promise<string> {
  const policyId = `pol-${randomUUID().slice(0, 12)}`;
  await db.execute(sql`
    INSERT INTO policy_events (
      policy_id, policy_name, policy_type, jurisdiction,
      effective_date, enacted_date, affected_domains, related_laws,
      description, source_url
    ) VALUES (
      ${policyId}, ${params.policyName}, ${params.policyType},
      ${params.jurisdiction || null},
      ${params.effectiveDate || null}, ${params.enactedDate || null},
      ${params.affectedDomains ? JSON.stringify(params.affectedDomains) : null},
      ${params.relatedLaws ? JSON.stringify(params.relatedLaws) : null},
      ${params.description || null}, ${params.sourceUrl || null}
    )
  `);
  return policyId;
}

// ─── PI2. Policy-Pattern Correlation Analysis ────────────────────────────────

export async function measurePolicyImpact(params: {
  policyId: string;
  patternId: string;
  measurementWindowDays?: number;
}): Promise<{
  impactId: number;
  baselineSignalRate: number;
  postPolicySignalRate: number;
  impactPercentage: number;
  confidenceScore: number;
  correlationStatement: string;
}> {
  const windowDays = params.measurementWindowDays || 90;
  const policy = await getPolicyEventById(params.policyId);
  if (!policy) throw new Error(`Policy ${params.policyId} not found`);

  const effectiveDate = policy.effective_date || new Date().toISOString().slice(0, 10);

  // Count signals before the policy effective date (baseline)
  const [beforeRows] = await db.execute(sql`
    SELECT COUNT(*) as signal_count, DATEDIFF(${effectiveDate}, MIN(detected_at)) as window_days
    FROM signal_registry
    WHERE pattern_id = ${params.patternId}
      AND detected_at < ${effectiveDate}
      AND detected_at >= DATE_SUB(${effectiveDate}, INTERVAL ${windowDays} DAY)
  `);
  const before = (beforeRows as unknown as any[])[0] || {};
  const beforeCount = Number(before.signal_count) || 0;
  const beforeDays = Number(before.window_days) || windowDays;

  // Count signals after the policy effective date
  const [afterRows] = await db.execute(sql`
    SELECT COUNT(*) as signal_count, DATEDIFF(NOW(), ${effectiveDate}) as window_days
    FROM signal_registry
    WHERE pattern_id = ${params.patternId}
      AND detected_at >= ${effectiveDate}
      AND detected_at <= DATE_ADD(${effectiveDate}, INTERVAL ${windowDays} DAY)
  `);
  const after = (afterRows as unknown as any[])[0] || {};
  const afterCount = Number(after.signal_count) || 0;
  const afterDays = Math.min(Number(after.window_days) || windowDays, windowDays);

  // Calculate rates (signals per day)
  const baselineRate = beforeDays > 0 ? beforeCount / beforeDays : 0;
  const postRate = afterDays > 0 ? afterCount / afterDays : 0;

  // Calculate impact percentage
  const impactPct = baselineRate > 0
    ? Math.round(((postRate - baselineRate) / baselineRate) * 10000) / 100
    : 0;

  // Calculate confidence score based on data quality
  const dataPoints = beforeCount + afterCount;
  let confidence = Math.min(95, Math.max(10,
    20 + (dataPoints * 2) + (Math.min(beforeDays, afterDays) / windowDays * 30)
  ));
  confidence = Math.round(confidence * 100) / 100;

  // Get pattern name for the correlation statement
  const [patternRows] = await db.execute(sql`
    SELECT pattern_name FROM pattern_registry WHERE pattern_id = ${params.patternId} LIMIT 1
  `);
  const patternName = (patternRows as unknown as any[])[0]?.pattern_name || "Unknown pattern";

  // Build correlation statement (observed correlation, NOT causation)
  const direction = impactPct < 0 ? "decreased" : impactPct > 0 ? "increased" : "remained stable";
  const correlationStatement = `${patternName} signals ${direction} ${Math.abs(impactPct)}% in the ${windowDays}-day window following ${policy.policy_name} (effective ${effectiveDate}). Confidence: ${confidence}%.`;

  // Store the measurement
  const [result] = await db.execute(sql`
    INSERT INTO policy_pattern_impacts (
      policy_id, pattern_id, baseline_signal_rate, post_policy_signal_rate,
      impact_percentage, confidence_score, measurement_window_days,
      measurement_start, measurement_end
    ) VALUES (
      ${params.policyId}, ${params.patternId},
      ${Math.round(baselineRate * 100) / 100}, ${Math.round(postRate * 100) / 100},
      ${impactPct}, ${confidence}, ${windowDays},
      DATE_SUB(${effectiveDate}, INTERVAL ${windowDays} DAY),
      DATE_ADD(${effectiveDate}, INTERVAL ${windowDays} DAY)
    )
  `);

  return {
    impactId: (result as any).insertId || 0,
    baselineSignalRate: Math.round(baselineRate * 100) / 100,
    postPolicySignalRate: Math.round(postRate * 100) / 100,
    impactPercentage: impactPct,
    confidenceScore: confidence,
    correlationStatement,
  };
}

// ─── PI3. Get Impact History for a Pattern ───────────────────────────────────

export async function getImpactsForPattern(patternId: string): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT ppi.*, pe.policy_name, pe.policy_type, pe.jurisdiction, pe.effective_date
    FROM policy_pattern_impacts ppi
    JOIN policy_events pe ON ppi.policy_id = pe.policy_id
    WHERE ppi.pattern_id = ${patternId}
    ORDER BY pe.effective_date DESC
  `);
  return rows as unknown as any[];
}

export async function getImpactsForPolicy(policyId: string): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT ppi.*, pr.pattern_name, pr.pattern_type
    FROM policy_pattern_impacts ppi
    JOIN pattern_registry pr ON ppi.pattern_id = pr.pattern_id
    WHERE ppi.policy_id = ${policyId}
    ORDER BY ppi.impact_percentage ASC
  `);
  return rows as unknown as any[];
}

// ─── PI4. Policy Dashboard ───────────────────────────────────────────────────

export async function getPolicyDashboard(): Promise<{
  policies: any[];
  impacts: any[];
  summary: {
    totalPolicies: number;
    totalImpactMeasurements: number;
    avgImpactPercentage: number;
    avgConfidence: number;
    policiesWithPositiveImpact: number;
    policiesWithNegativeImpact: number;
  };
}> {
  const [policyRows] = await db.execute(sql`
    SELECT pe.*,
      (SELECT COUNT(*) FROM policy_pattern_impacts WHERE policy_id = pe.policy_id) as impact_count,
      (SELECT AVG(impact_percentage) FROM policy_pattern_impacts WHERE policy_id = pe.policy_id) as avg_impact
    FROM policy_events pe WHERE pe.is_active = 1
    ORDER BY pe.effective_date DESC
  `);
  const [impactRows] = await db.execute(sql`
    SELECT ppi.*, pe.policy_name, pe.policy_type, pr.pattern_name, pr.pattern_type
    FROM policy_pattern_impacts ppi
    JOIN policy_events pe ON ppi.policy_id = pe.policy_id
    JOIN pattern_registry pr ON ppi.pattern_id = pr.pattern_id
    ORDER BY ppi.created_at DESC LIMIT 20
  `);
  const [summaryRows] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM policy_events WHERE is_active = 1) as total_policies,
      (SELECT COUNT(*) FROM policy_pattern_impacts) as total_impacts,
      (SELECT AVG(impact_percentage) FROM policy_pattern_impacts) as avg_impact,
      (SELECT AVG(confidence_score) FROM policy_pattern_impacts) as avg_confidence,
      (SELECT COUNT(DISTINCT policy_id) FROM policy_pattern_impacts WHERE impact_percentage < 0) as positive_impact,
      (SELECT COUNT(DISTINCT policy_id) FROM policy_pattern_impacts WHERE impact_percentage > 0) as negative_impact
  `);
  const s = (summaryRows as unknown as any[])[0] || {};
  return {
    policies: policyRows as unknown as any[],
    impacts: impactRows as unknown as any[],
    summary: {
      totalPolicies: Number(s.total_policies) || 0,
      totalImpactMeasurements: Number(s.total_impacts) || 0,
      avgImpactPercentage: Math.round(Number(s.avg_impact) || 0),
      avgConfidence: Math.round(Number(s.avg_confidence) || 0),
      policiesWithPositiveImpact: Number(s.positive_impact) || 0,
      policiesWithNegativeImpact: Number(s.negative_impact) || 0,
    },
  };
}

// ─── PI5. Policy Timeline for Trend Overlay ──────────────────────────────────

export async function getPolicyTimelineForTrend(params: {
  patternId?: string;
  domain?: string;
}): Promise<any[]> {
  if (params.patternId) {
    // Get policies that have measured impacts on this pattern
    const [rows] = await db.execute(sql`
      SELECT pe.policy_id, pe.policy_name, pe.policy_type, pe.jurisdiction,
             pe.effective_date, pe.description,
             ppi.impact_percentage, ppi.confidence_score,
             ppi.baseline_signal_rate, ppi.post_policy_signal_rate
      FROM policy_events pe
      LEFT JOIN policy_pattern_impacts ppi ON pe.policy_id = ppi.policy_id AND ppi.pattern_id = ${params.patternId}
      WHERE pe.is_active = 1
      ORDER BY pe.effective_date ASC
    `);
    return rows as unknown as any[];
  }
  if (params.domain) {
    const [rows] = await db.execute(sql`
      SELECT * FROM policy_events
      WHERE is_active = 1 AND JSON_CONTAINS(affected_domains, CONCAT('"', ${params.domain}, '"'))
      ORDER BY effective_date ASC
    `);
    return rows as unknown as any[];
  }
  const [rows] = await db.execute(sql`
    SELECT * FROM policy_events WHERE is_active = 1 ORDER BY effective_date ASC
  `);
  return rows as unknown as any[];
}
