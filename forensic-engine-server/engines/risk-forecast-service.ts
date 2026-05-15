/**
 * Engine 3: Systemic Risk Forecast Engine
 * 
 * Predicts which harm patterns will escalate based on:
 * - Signal growth velocity (30%)
 * - Complaint acceleration (25%)
 * - Geographic expansion (20%)
 * - Entity concentration (15%)
 * - Regulatory gap score (10%)
 * 
 * Risk categories:
 * 0-20: Stable
 * 21-40: Watch
 * 41-60: Emerging Risk
 * 61-80: Escalation Likely
 * 81-100: Systemic Crisis Risk
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

function classifyForecastRisk(score: number): string {
  if (score >= 81) return "Systemic Crisis Risk";
  if (score >= 61) return "Escalation Likely";
  if (score >= 41) return "Emerging Risk";
  if (score >= 21) return "Watch";
  return "Stable";
}

export interface ForecastResult {
  patternId: number | null;
  entityName: string;
  riskForecastScore: number;
  riskCategory: string;
  predictedSignalGrowth: number;
  predictedPressureIndex: number;
  predictedGeographicSpread: number;
  predictedEntityCount: number;
  confidenceLevel: number;
}

export interface ForecastSummary {
  totalForecasts: number;
  crisisRisk: number;
  escalationLikely: number;
  emergingRisk: number;
  watch: number;
  stable: number;
  avgForecastScore: number;
  topRisks: ForecastResult[];
  earlyWarnings: ForecastResult[];
}

/**
 * Generate risk forecasts based on current signal and harm data
 */
export async function generateRiskForecasts(horizonDays: number = 30): Promise<{ processed: number; errors: string[] }> {
  const now = Date.now();
  const errors: string[] = [];
  let processed = 0;

  try {
    // Get entities with harm scores
    const entities = await db.execute(sql`
      SELECT e.id, e.entity_name, e.industry_sector,
             s.systemic_harm_score, s.complaint_count, s.litigation_count,
             s.enforcement_count, s.geographic_spread, s.pattern_acceleration
      FROM harm_index_entities e
      JOIN harm_index_scores s ON s.entity_id = e.id
      WHERE s.id = (SELECT MAX(s2.id) FROM harm_index_scores s2 WHERE s2.entity_id = e.id)
      ORDER BY s.systemic_harm_score DESC
      LIMIT 200
    `);

    // Get signal velocity (signals in last 30 days vs previous 30 days)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);

    for (const entity of entities[0] as unknown as any[]) {
      const entityName = entity.entity_name;
      const currentHarmScore = Number(entity.systemic_harm_score) || 0;

      // Signal growth velocity
      const recentSignals = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM detected_signals 
        WHERE entity_id = ${entityName} AND detection_timestamp >= ${thirtyDaysAgo}
      `);
      const priorSignals = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM detected_signals 
        WHERE entity_id = ${entityName} AND detection_timestamp >= ${sixtyDaysAgo} AND detection_timestamp < ${thirtyDaysAgo}
      `);

      const recentCount = Number((recentSignals[0] as unknown as any[])[0]?.cnt) || 0;
      const priorCount = Number((priorSignals[0] as unknown as any[])[0]?.cnt) || 0;
      const signalGrowth = priorCount > 0 ? ((recentCount - priorCount) / priorCount) * 100 : (recentCount > 0 ? 100 : 0);

      // Complaint acceleration
      const complaintCount = Number(entity.complaint_count) || 0;
      const complaintAcceleration = Math.min(100, complaintCount * 2);

      // Geographic spread
      const geoSpread = Number(entity.geographic_spread) || 0;

      // Entity concentration (how many datasets mention this entity)
      const datasetSpread = await db.execute(sql`
        SELECT COUNT(DISTINCT sourceDataset) as cnt FROM ingested_records 
        WHERE normalizedEntity = ${entityName}
      `);
      const entityConcentration = Math.min(100, (Number((datasetSpread[0] as unknown as any[])[0]?.cnt) || 0) * 20);

      // Regulatory gap (inverse of enforcement count — fewer enforcements = bigger gap)
      const enforcementCount = Number(entity.enforcement_count) || 0;
      const regulatoryGap = complaintCount > 0 
        ? Math.min(100, Math.max(0, (1 - enforcementCount / Math.max(1, complaintCount)) * 100))
        : 0;

      // Weighted forecast score
      const forecastScore = Math.round(
        (Math.min(100, Math.abs(signalGrowth)) * 0.30 +
         complaintAcceleration * 0.25 +
         geoSpread * 0.20 +
         entityConcentration * 0.15 +
         regulatoryGap * 0.10) * 100
      ) / 100;

      const riskCategory = classifyForecastRisk(forecastScore);
      const confidenceLevel = Math.min(0.95, 0.4 + (complaintCount / 100) * 0.3 + (recentCount / 10) * 0.25);

      // Predicted harm score (current + projected growth)
      const growthFactor = signalGrowth > 0 ? 1 + (signalGrowth / 100) * 0.3 : 1;
      const predictedHarmScore = Math.min(100, Math.round(currentHarmScore * growthFactor * 100) / 100);

      // Insert forecast
      await db.execute(sql`
        INSERT INTO risk_forecasts 
        (pattern_id, forecast_date, forecast_horizon_days, predicted_signal_growth,
         predicted_pressure_index, predicted_geographic_spread, predicted_entity_count,
         risk_forecast_score, confidence_level, created_at)
        VALUES (NULL, ${now}, ${horizonDays}, ${signalGrowth},
                ${complaintAcceleration}, ${geoSpread}, ${recentCount},
                ${forecastScore}, ${confidenceLevel}, ${now})
      `);

      // Insert entity risk projection
      await db.execute(sql`
        INSERT INTO entity_risk_projection 
        (entity_id, entity_name, industry_sector, current_harm_score, 
         predicted_harm_score, risk_category, projection_horizon_days, created_at)
        VALUES (${entity.id}, ${entityName}, ${entity.industry_sector},
                ${currentHarmScore}, ${predictedHarmScore}, ${riskCategory}, ${horizonDays}, ${now})
      `);

      processed++;
    }
  } catch (err: any) {
    errors.push(err.message || "Unknown error during risk forecast generation");
  }

  return { processed, errors };
}

/**
 * Get forecast summary
 */
export async function getRiskForecastSummary(): Promise<ForecastSummary> {
  const projections = await db.execute(sql`
    SELECT erp.id, erp.entity_name, erp.industry_sector, 
           erp.current_harm_score, erp.predicted_harm_score, erp.risk_category,
           erp.projection_horizon_days
    FROM entity_risk_projection erp
    WHERE erp.id = (
      SELECT MAX(erp2.id) FROM entity_risk_projection erp2 
      WHERE erp2.entity_name = erp.entity_name
    )
    ORDER BY erp.predicted_harm_score DESC
  `);

  const forecasts: ForecastResult[] = (projections[0] as unknown as any[]).map(r => ({
    patternId: null,
    entityName: r.entity_name,
    riskForecastScore: Number(r.predicted_harm_score) || 0,
    riskCategory: r.risk_category || "Stable",
    predictedSignalGrowth: 0,
    predictedPressureIndex: 0,
    predictedGeographicSpread: 0,
    predictedEntityCount: 0,
    confidenceLevel: 0,
  }));

  const crisisRisk = forecasts.filter(f => f.riskCategory === "Systemic Crisis Risk").length;
  const escalationLikely = forecasts.filter(f => f.riskCategory === "Escalation Likely").length;
  const emergingRisk = forecasts.filter(f => f.riskCategory === "Emerging Risk").length;
  const watch = forecasts.filter(f => f.riskCategory === "Watch").length;
  const stable = forecasts.filter(f => f.riskCategory === "Stable").length;
  const avgScore = forecasts.length > 0
    ? Math.round(forecasts.reduce((sum, f) => sum + f.riskForecastScore, 0) / forecasts.length * 100) / 100
    : 0;

  return {
    totalForecasts: forecasts.length,
    crisisRisk,
    escalationLikely,
    emergingRisk,
    watch,
    stable,
    avgForecastScore: avgScore,
    topRisks: forecasts.slice(0, 20),
    earlyWarnings: forecasts.filter(f => f.riskForecastScore >= 80).slice(0, 10),
  };
}
