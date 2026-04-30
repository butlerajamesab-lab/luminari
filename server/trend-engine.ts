/**
 * Trend & Pressure Engine Service
 * 
 * Analyzes patterns from the Pattern Registry and determines whether
 * systemic issues are emerging, accelerating, stable, declining, or critical.
 * 
 * Classification Rules:
 *   critical:     pressure >= 85 OR growth30d >= 100
 *   accelerating: growth30d >= 25 AND growth7d > growth30d * 1.2
 *   emerging:     growth30d >= 10 AND < 25 AND pressure < 70
 *   stable:       abs(growth30d) < 10 AND pressure 30-70
 *   declining:    growth30d <= -10
 *   default:      growth30d > 0 → emerging, else stable
 * 
 * Pressure Index (0-100): 6-component weighted scoring
 *   volume:    25% — LEAST(signalCount/10*10, 100)
 *   velocity:  20% — LEAST(growthRate*2, 100)
 *   geographic:15% — LEAST(spread*15, 100)
 *   severity:  20% — critical=100, high=80, medium=50, low=20
 *   entity:    10% — LEAST(entityCount*10, 100)
 *   temporal:  10% — LEAST(density*20, 100)
 * 
 * Momentum: rising (7d > 30d*1.2), falling (7d < 30d*0.8), plateau (between for 3+ periods)
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── T1. Trend Classification ────────────────────────────────────────

export function classifyTrend(
  growth30d: number,
  growth7d: number,
  pressure: number,
  prevClassification: string | null,
  geoExpansion: number
): string {
  // Rule 1: Critical — pressure >= 85 OR growth30d >= 100
  if (pressure >= 85 || growth30d >= 100) return "critical";

  // Rule 2: Accelerating — growth30d >= 25 AND growth7d outpacing 30d by 20%+
  if (growth30d >= 25 && growth7d > growth30d * 1.2) return "accelerating";

  // Rule 3: Emerging — moderate growth, pressure below warning
  if (growth30d >= 10 && growth30d < 25 && pressure < 70) return "emerging";

  // Rule 4: Stable — low growth, moderate pressure
  if (Math.abs(growth30d) < 10 && pressure >= 30 && pressure <= 70) return "stable";

  // Rule 5: Declining — negative growth
  if (growth30d <= -10) return "declining";

  // Default fallback
  return growth30d > 0 ? "emerging" : "stable";
}

// ─── T2. Pressure Index Calculation ──────────────────────────────────

export interface PressureComponents {
  signalCount: number;
  growthRate: number;
  geographicSpread: number;
  avgSeverity: string; // "critical" | "high" | "medium" | "low"
  entityCount: number;
  signalDensity: number;
}

export interface PressureBreakdown {
  volumePressure: number;
  velocityPressure: number;
  geographicPressure: number;
  severityPressure: number;
  entityPressure: number;
  temporalPressure: number;
  pressureIndex: number;
}

const SEVERITY_SCORES: Record<string, number> = {
  critical: 100,
  high: 80,
  medium: 50,
  low: 20,
};

export function calculatePressureIndex(components: PressureComponents): PressureBreakdown {
  const volumePressure = Math.min(Math.round((components.signalCount / 10) * 10), 100);
  const velocityPressure = Math.min(Math.round(components.growthRate * 2), 100);
  const geographicPressure = Math.min(Math.round(components.geographicSpread * 15), 100);
  const severityPressure = SEVERITY_SCORES[components.avgSeverity] || 50;
  const entityPressure = Math.min(Math.round(components.entityCount * 10), 100);
  const temporalPressure = Math.min(Math.round(components.signalDensity * 20), 100);

  // Weighted sum: volume 25%, velocity 20%, geo 15%, severity 20%, entity 10%, temporal 10%
  const pressureIndex = Math.round(
    volumePressure * 0.25 +
    velocityPressure * 0.20 +
    geographicPressure * 0.15 +
    severityPressure * 0.20 +
    entityPressure * 0.10 +
    temporalPressure * 0.10
  );

  return {
    volumePressure,
    velocityPressure,
    geographicPressure,
    severityPressure,
    entityPressure,
    temporalPressure,
    pressureIndex: Math.min(pressureIndex, 100),
  };
}

// ─── T3. Momentum Detection ─────────────────────────────────────────

export function detectMomentum(
  growth7d: number,
  growth30d: number,
  plateauPeriods: number = 0
): string {
  if (growth7d > growth30d * 1.2) return "rising";
  if (growth7d < growth30d * 0.8) return "falling";
  if (plateauPeriods >= 3) return "plateau";
  return "plateau";
}

// ─── T4. Geographic Expansion Rate ───────────────────────────────────

export function calculateGeographicExpansion(
  currentSpread: number,
  previousSpread: number
): number {
  if (previousSpread === 0) return currentSpread > 0 ? 100 : 0;
  return Math.round(((currentSpread - previousSpread) / previousSpread) * 100);
}

// ─── T5. Growth Rate Calculation ─────────────────────────────────────

export function calculateGrowthRate(
  currentCount: number,
  previousCount: number
): number {
  if (previousCount === 0) return currentCount > 0 ? 100 : 0;
  return Math.round(((currentCount - previousCount) / previousCount) * 100);
}

// ─── T6. Signal Density ─────────────────────────────────────────────

export function calculateSignalDensity(
  signalCount: number,
  timeSpanDays: number
): number {
  if (timeSpanDays === 0) return signalCount > 0 ? signalCount : 0;
  return Math.round((signalCount / timeSpanDays) * 100) / 100;
}

// ─── T7. Alert Rule Evaluation ───────────────────────────────────────

interface AlertRule {
  rule_id: number;
  rule_name: string;
  condition_type: string;
  threshold_value: number;
  threshold_direction: string;
  alert_severity: string;
}

interface TrendMetrics {
  growth_rate_7d: number;
  growth_rate_30d: number;
  pressure_index: number;
  geographic_expansion_rate: number;
  new_regions_count: number;
  momentum_direction: string;
}

export interface TriggeredAlert {
  ruleId: number;
  ruleName: string;
  severity: string;
  conditionType: string;
  currentValue: number;
  threshold: number;
}

export function evaluateAlertRules(
  rules: AlertRule[],
  metrics: TrendMetrics
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const rule of rules) {
    let currentValue = 0;

    switch (rule.condition_type) {
      case "growth_rate_7d":
        currentValue = metrics.growth_rate_7d;
        break;
      case "growth_rate_30d":
        currentValue = metrics.growth_rate_30d;
        break;
      case "pressure_index":
        currentValue = metrics.pressure_index;
        break;
      case "geographic_expansion_rate":
        currentValue = metrics.geographic_expansion_rate;
        break;
      case "new_regions_count":
        currentValue = metrics.new_regions_count;
        break;
      case "momentum_direction":
        // Special: crosses means momentum changed
        // We encode this as 1 if changed, 0 if not — caller must track previous
        currentValue = 0; // Default: no change
        break;
      default:
        continue;
    }

    let triggered_flag = false;
    switch (rule.threshold_direction) {
      case "above":
        triggered_flag = currentValue > rule.threshold_value;
        break;
      case "below":
        triggered_flag = currentValue < rule.threshold_value;
        break;
      case "crosses":
        triggered_flag = currentValue >= rule.threshold_value;
        break;
    }

    if (triggered_flag) {
      triggered.push({
        ruleId: rule.rule_id,
        ruleName: rule.rule_name,
        severity: rule.alert_severity,
        conditionType: rule.condition_type,
        currentValue,
        threshold: rule.threshold_value,
      });
    }
  }

  return triggered;
}

// ─── T8. Update Single Pattern Trend ─────────────────────────────────

export async function updatePatternTrend(patternId: string): Promise<{
  trendId: string;
  classification: string;
  pressureIndex: number;
  momentum: string;
  alerts: TriggeredAlert[];
}> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Step 1: Get pattern data from pattern_registry
  const [pattern] = await db.execute(sql`
    SELECT pattern_id, pattern_type, signal_count, confidence_score, 
            geographic_spread, severity, jurisdiction, first_seen, last_seen
     FROM pattern_registry WHERE pattern_id = ${patternId}
  `) as unknown as any[];
  if (!pattern || pattern.length === 0) throw new Error(`Pattern ${patternId} not found`);
  const p = pattern[0];

  // Step 2: Get previous snapshot for growth rate calculation
  const [prevSnapshots] = await db.execute(sql`
    SELECT signal_count, geographic_spread, snapshot_date, pressure_at_snapshot, momentum_at_snapshot
     FROM trend_snapshots WHERE pattern_id = ${patternId} ORDER BY snapshot_date DESC LIMIT 3
  `) as unknown as any[];

  const prevSnapshot = prevSnapshots.length > 0 ? prevSnapshots[0] : null;
  const prevSignalCount = prevSnapshot ? Number(prevSnapshot.signal_count) : 0;
  const prevGeoSpread = prevSnapshot ? Number(prevSnapshot.geographic_spread) : 0;
  const plateauPeriods = prevSnapshots.filter(
    (s: any) => s.momentum_at_snapshot === "plateau"
  ).length;

  // Step 3: Get 7d, 30d, 90d snapshots for growth rates
  const signalCount = Number(p.signal_count) || 0;
  const geoSpread = Number(p.geographic_spread) || 0;
  const confidence = Number(p.confidence_score) || 0;

  const firstSeen = p.first_seen ? new Date(p.first_seen) : now;
  const timeSpanDays = Math.max(1, Math.round((now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24)));

  // Calculate growth rates from snapshots at different time horizons
  const [snap7d] = await db.execute(sql`
    SELECT signal_count FROM trend_snapshots 
     WHERE pattern_id = ${patternId} AND snapshot_date <= DATE_SUB(${todayStr}, INTERVAL 7 DAY) 
     ORDER BY snapshot_date DESC LIMIT 1
  `) as unknown as any[];
  const [snap30d] = await db.execute(sql`
    SELECT signal_count FROM trend_snapshots 
     WHERE pattern_id = ${patternId} AND snapshot_date <= DATE_SUB(${todayStr}, INTERVAL 30 DAY) 
     ORDER BY snapshot_date DESC LIMIT 1
  `) as unknown as any[];
  const [snap90d] = await db.execute(sql`
    SELECT signal_count FROM trend_snapshots 
     WHERE pattern_id = ${patternId} AND snapshot_date <= DATE_SUB(${todayStr}, INTERVAL 90 DAY) 
     ORDER BY snapshot_date DESC LIMIT 1
  `) as unknown as any[];

  const count7d = snap7d.length > 0 ? Number(snap7d[0].signal_count) : 0;
  const count30d = snap30d.length > 0 ? Number(snap30d[0].signal_count) : 0;
  const count90d = snap90d.length > 0 ? Number(snap90d[0].signal_count) : 0;

  const growth7d = calculateGrowthRate(signalCount, count7d || signalCount);
  const growth30d = calculateGrowthRate(signalCount, count30d || signalCount);
  const growth90d = calculateGrowthRate(signalCount, count90d || signalCount);

  // Step 4: Calculate pressure
  const density = calculateSignalDensity(signalCount, timeSpanDays);
  const severity = p.severity || "medium";

  // Get entity count from linked signals
  const [entityResult] = await db.execute(sql`
    SELECT COUNT(DISTINCT ds.signal_type) as entity_count 
     FROM pattern_signal_links psl 
     JOIN detected_signals ds ON psl.signal_id = ds.signal_id 
     WHERE psl.pattern_id = ${patternId}
  `) as unknown as any[];
  const entityCount = entityResult.length > 0 ? Number(entityResult[0].entity_count) : 1;

  const pressureBreakdown = calculatePressureIndex({
    signalCount,
    growthRate: Math.abs(growth30d),
    geographicSpread: geoSpread,
    avgSeverity: severity,
    entityCount,
    signalDensity: density,
  });

  // Step 5: Detect momentum
  const geoExpansion = calculateGeographicExpansion(geoSpread, prevGeoSpread);
  const momentum = detectMomentum(growth7d, growth30d, plateauPeriods);

  // Step 6: Classify trend
  const prevClassification = prevSnapshot ? prevSnapshot.momentum_at_snapshot : null;
  const classification = classifyTrend(growth30d, growth7d, pressureBreakdown.pressureIndex, prevClassification, geoExpansion);

  // Step 7: Acceleration rate
  const accelerationRate = growth30d !== 0 ? Math.round(((growth7d - growth30d) / Math.abs(growth30d)) * 100) : 0;

  // Step 8: Upsert trend_registry
  const [existing] = await db.execute(sql`
    SELECT trend_id FROM trend_registry WHERE pattern_id = ${patternId} AND is_current = TRUE
  `) as unknown as any[];

  const densityTrend = density > 1 ? "increasing" : density < 0.5 ? "decreasing" : "stable";
  const pressureFactorsJson = JSON.stringify(pressureBreakdown);

  let trendId: string;
  if (existing.length > 0) {
    trendId = existing[0].trend_id;
    await db.execute(sql`
      UPDATE trend_registry SET
        trend_classification = ${classification}, momentum_direction = ${momentum}, pressure_index = ${pressureBreakdown.pressureIndex},
        current_signal_count = ${signalCount}, current_confidence_score = ${confidence}, current_geographic_spread = ${geoSpread},
        current_time_span_days = ${timeSpanDays}, growth_rate_7d = ${growth7d}, growth_rate_30d = ${growth30d}, growth_rate_90d = ${growth90d},
        acceleration_rate = ${accelerationRate}, momentum_score = ${pressureBreakdown.pressureIndex}, geographic_expansion_rate = ${geoExpansion},
        new_regions_count = ${0}, signal_density = ${density}, density_trend = ${densityTrend},
        pressure_factors = ${pressureFactorsJson}, last_calculated = NOW(), updated_at = NOW()
       WHERE trend_id = ${trendId}
    `);
  } else {
    trendId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO trend_registry (trend_id, pattern_id, trend_classification, momentum_direction, pressure_index,
        current_signal_count, current_confidence_score, current_geographic_spread, current_time_span_days,
        growth_rate_7d, growth_rate_30d, growth_rate_90d, acceleration_rate, momentum_score,
        geographic_expansion_rate, new_regions_count, signal_density, density_trend,
        pressure_factors, last_calculated, is_current)
       VALUES (${trendId}, ${patternId}, ${classification}, ${momentum}, ${pressureBreakdown.pressureIndex},
        ${signalCount}, ${confidence}, ${geoSpread}, ${timeSpanDays},
        ${growth7d}, ${growth30d}, ${growth90d}, ${accelerationRate}, ${pressureBreakdown.pressureIndex},
        ${geoExpansion}, ${0}, ${density}, ${densityTrend},
        ${pressureFactorsJson}, NOW(), TRUE)
    `);
  }

  // Step 9: Record snapshot
  const growthSinceLast = calculateGrowthRate(signalCount, prevSignalCount);
  const snapshotId = crypto.randomUUID();
  const snapshotDataJson = JSON.stringify({ classification, growth7d, growth30d, growth90d, geoExpansion });
  await db.execute(sql`
    INSERT INTO trend_snapshots (snapshot_id, pattern_id, snapshot_date, signal_count, confidence_score,
      geographic_spread, time_span_days, growth_rate_since_last, momentum_at_snapshot, pressure_at_snapshot, snapshot_data)
     VALUES (${snapshotId}, ${patternId}, ${todayStr}, ${signalCount}, ${confidence},
      ${geoSpread}, ${timeSpanDays}, ${growthSinceLast}, ${momentum}, ${pressureBreakdown.pressureIndex},
      ${snapshotDataJson})
  `);

  // Step 10: Record pressure metrics
  const criticalCrossed = pressureBreakdown.pressureIndex >= 85;
  const warningCrossed = pressureBreakdown.pressureIndex >= 70;
  const metricId = crypto.randomUUID();
  const alertTriggered = criticalCrossed || warningCrossed;
  const alertLevel = criticalCrossed ? "critical" : warningCrossed ? "warning" : "info";
  await db.execute(sql`
    INSERT INTO trend_pressure_metrics (metric_id, pattern_id, snapshot_date,
      volume_pressure, velocity_pressure, geographic_pressure, severity_pressure, entity_pressure, temporal_pressure,
      pressure_index, critical_threshold_crossed, warning_threshold_crossed, alert_triggered, alert_level)
     VALUES (${metricId}, ${patternId}, ${todayStr},
      ${pressureBreakdown.volumePressure}, ${pressureBreakdown.velocityPressure},
      ${pressureBreakdown.geographicPressure}, ${pressureBreakdown.severityPressure},
      ${pressureBreakdown.entityPressure}, ${pressureBreakdown.temporalPressure},
      ${pressureBreakdown.pressureIndex}, ${criticalCrossed}, ${warningCrossed},
      ${alertTriggered}, ${alertLevel})
  `);

  // Step 11: Evaluate alert rules
  const [alertRules] = await db.execute(sql`
    SELECT rule_id, rule_name, condition_type, threshold_value, threshold_direction, alert_severity
     FROM trend_alert_rules WHERE is_active = TRUE
  `) as unknown as any[];

  const alerts = evaluateAlertRules(alertRules, {
    growth_rate_7d: growth7d,
    growth_rate_30d: growth30d,
    pressure_index: pressureBreakdown.pressureIndex,
    geographic_expansion_rate: geoExpansion,
    new_regions_count: 0,
    momentum_direction: momentum,
  });

  return {
    trendId,
    classification,
    pressureIndex: pressureBreakdown.pressureIndex,
    momentum,
    alerts,
  };
}

// ─── T9. Update All Trends (Daily Batch) ─────────────────────────────

export async function updateAllTrends(): Promise<{
  patternsProcessed: number;
  classifications: Record<string, number>;
  alertsTriggered: number;
}> {
  // Get all active patterns from pattern_registry
  const [patterns] = await db.execute(
    `SELECT pattern_id FROM pattern_registry WHERE decay_status = 'active'`
  ) as unknown as any[];

  const classifications: Record<string, number> = {
    critical: 0,
    accelerating: 0,
    emerging: 0,
    stable: 0,
    declining: 0,
  };
  let totalAlerts = 0;

  for (const pattern of patterns) {
    try {
      const result = await updatePatternTrend(pattern.pattern_id);
      classifications[result.classification] = (classifications[result.classification] || 0) + 1;
      totalAlerts += result.alerts.length;
    } catch (err) {
      console.error(`[TrendEngine] Failed to update trend for pattern ${pattern.pattern_id}:`, err);
    }
  }

  return {
    patternsProcessed: patterns.length,
    classifications,
    alertsTriggered: totalAlerts,
  };
}

// ─── T10. Get Trend Dashboard Data ───────────────────────────────────

export async function getTrendDashboard(filters?: {
  classification?: string;
  minPressure?: number;
  limit?: number;
  offset?: number;
}): Promise<{ trends: any[]; total: number; summary: any }> {
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  // Build dynamic conditions using sql fragments
  const conditions: any[] = [sql`tr.is_current = TRUE`];
  if (filters?.classification) {
    conditions.push(sql`tr.trend_classification = ${filters.classification}`);
  }
  if (filters?.minPressure) {
    conditions.push(sql`tr.pressure_index >= ${filters.minPressure}`);
  }

  // Combine conditions with AND
  let whereFragment = conditions[0];
  for (let i = 1; i < conditions.length; i++) {
    whereFragment = sql`${whereFragment} AND ${conditions[i]}`;
  }

  const [countResult] = await db.execute(sql`
    SELECT COUNT(*) as total FROM trend_registry tr WHERE ${whereFragment}
  `) as unknown as any[];
  const total = Number(countResult[0]?.total) || 0;

  const [trends] = await db.execute(sql`
    SELECT tr.*, pr.pattern_type, pr.pattern_name, pr.confidence_score, pr.jurisdiction_scope
     FROM trend_registry tr
     LEFT JOIN pattern_registry pr ON tr.pattern_id = pr.pattern_id
     WHERE ${whereFragment}
     ORDER BY tr.pressure_index DESC, tr.growth_rate_30d DESC
     LIMIT ${limit} OFFSET ${offset}
  `) as unknown as any[];

  // Summary counts
  const [summaryResult] = await db.execute(sql`
    SELECT 
       SUM(CASE WHEN trend_classification = 'critical' THEN 1 ELSE 0 END) as critical_count,
       SUM(CASE WHEN trend_classification = 'accelerating' THEN 1 ELSE 0 END) as accelerating_count,
       SUM(CASE WHEN trend_classification = 'emerging' THEN 1 ELSE 0 END) as emerging_count,
       SUM(CASE WHEN trend_classification = 'stable' THEN 1 ELSE 0 END) as stable_count,
       SUM(CASE WHEN trend_classification = 'declining' THEN 1 ELSE 0 END) as declining_count,
       AVG(pressure_index) as avg_pressure,
       MAX(pressure_index) as max_pressure
     FROM trend_registry WHERE is_current = TRUE
  `) as unknown as any[];

  return {
    trends,
    total,
    summary: summaryResult[0] || {},
  };
}

// ─── T11. Get Trend Detail ───────────────────────────────────────────

export async function getTrendDetail(patternId: string): Promise<{
  trend: any;
  snapshots: any[];
  pressureHistory: any[];
  alerts: TriggeredAlert[];
}> {
  const [trendRows] = await db.execute(sql`
    SELECT tr.*, pr.pattern_type, pr.pattern_name, pr.confidence_score, pr.jurisdiction_scope, pr.related_laws, pr.related_agencies
     FROM trend_registry tr
     LEFT JOIN pattern_registry pr ON tr.pattern_id = pr.pattern_id
     WHERE tr.pattern_id = ${patternId} AND tr.is_current = TRUE
  `) as unknown as any[];

  const [snapshots] = await db.execute(sql`
    SELECT * FROM trend_snapshots WHERE pattern_id = ${patternId} ORDER BY snapshot_date DESC LIMIT 90
  `) as unknown as any[];

  const [pressureHistory] = await db.execute(sql`
    SELECT * FROM trend_pressure_metrics WHERE pattern_id = ${patternId} ORDER BY snapshot_date DESC LIMIT 30
  `) as unknown as any[];

  // Evaluate current alerts
  const [alertRules] = await db.execute(sql`
    SELECT rule_id, rule_name, condition_type, threshold_value, threshold_direction, alert_severity
     FROM trend_alert_rules WHERE is_active = TRUE
  `) as unknown as any[];

  const trend = trendRows[0] || null;
  const alerts = trend
    ? evaluateAlertRules(alertRules, {
        growth_rate_7d: Number(trend.growth_rate_7d) || 0,
        growth_rate_30d: Number(trend.growth_rate_30d) || 0,
        pressure_index: Number(trend.pressure_index) || 0,
        geographic_expansion_rate: Number(trend.geographic_expansion_rate) || 0,
        new_regions_count: Number(trend.new_regions_count) || 0,
        momentum_direction: trend.momentum_direction || "plateau",
      })
    : [];

  return { trend, snapshots, pressureHistory, alerts };
}

// ─── T12. Get Mission Control Summary ────────────────────────────────

export async function getMissionControlSummary(): Promise<{
  totalTrends: number;
  criticalCount: number;
  acceleratingCount: number;
  emergingCount: number;
  avgPressure: number;
  maxPressure: number;
  topCritical: any[];
  recentAlerts: any[];
}> {
  const [summary] = await db.execute(sql`
    SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN trend_classification = 'critical' THEN 1 ELSE 0 END) as critical_count,
       SUM(CASE WHEN trend_classification = 'accelerating' THEN 1 ELSE 0 END) as accelerating_count,
       SUM(CASE WHEN trend_classification = 'emerging' THEN 1 ELSE 0 END) as emerging_count,
       ROUND(AVG(pressure_index)) as avg_pressure,
       MAX(pressure_index) as max_pressure
     FROM trend_registry WHERE is_current = TRUE
  `) as unknown as any[];

  const [topCritical] = await db.execute(sql`
    SELECT tr.trend_id, tr.pattern_id, tr.trend_classification, tr.pressure_index, 
            tr.growth_rate_30d, tr.momentum_direction,
            pr.pattern_name, pr.pattern_type, pr.confidence_score
     FROM trend_registry tr
     LEFT JOIN pattern_registry pr ON tr.pattern_id = pr.pattern_id
     WHERE tr.is_current = TRUE AND tr.trend_classification IN ('critical', 'accelerating')
     ORDER BY tr.pressure_index DESC LIMIT 5
  `) as unknown as any[];

  const [recentAlerts] = await db.execute(sql`
    SELECT tpm.pattern_id, tpm.pressure_index, tpm.alert_level, tpm.snapshot_date,
            pr.pattern_name, pr.pattern_type
     FROM trend_pressure_metrics tpm
     LEFT JOIN pattern_registry pr ON tpm.pattern_id = pr.pattern_id
     WHERE tpm.alert_triggered = TRUE
     ORDER BY tpm.created_at DESC LIMIT 10
  `) as unknown as any[];

  const s = summary[0] || {};
  return {
    totalTrends: Number(s.total) || 0,
    criticalCount: Number(s.critical_count) || 0,
    acceleratingCount: Number(s.accelerating_count) || 0,
    emergingCount: Number(s.emerging_count) || 0,
    avgPressure: Number(s.avg_pressure) || 0,
    maxPressure: Number(s.max_pressure) || 0,
    topCritical,
    recentAlerts,
  };
}

// ─── T13. Get Alert Rules ────────────────────────────────────────────

export async function getAlertRules(): Promise<any[]> {
  const [rules] = await db.execute(sql`
    SELECT * FROM trend_alert_rules ORDER BY rule_id
  `) as unknown as any[];
  return rules;
}
