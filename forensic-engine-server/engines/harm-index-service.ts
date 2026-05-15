/**
 * Engine 1: Systemic Harm Index Service
 * 
 * Calculates a 0-100 harm score for each entity based on:
 * - Complaint volume (25%)
 * - Litigation count (25%)
 * - Enforcement actions (20%)
 * - Geographic spread (15%)
 * - Pattern acceleration (15%)
 * 
 * Risk classifications:
 * 0-20: Low Risk
 * 21-40: Moderate Concern
 * 41-60: Elevated Risk
 * 61-80: High Risk Actor
 * 81-100: Critical Harm Actor
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

// Risk classification thresholds
function classifyRisk(score: number): string {
  if (score >= 81) return "Critical Harm Actor";
  if (score >= 61) return "High Risk Actor";
  if (score >= 41) return "Elevated Risk";
  if (score >= 21) return "Moderate Concern";
  return "Low Risk";
}

// Normalize a value to 0-100 scale using log scaling
function normalizeLog(value: number, maxExpected: number): number {
  if (value <= 0) return 0;
  const normalized = (Math.log(value + 1) / Math.log(maxExpected + 1)) * 100;
  return Math.min(100, Math.round(normalized * 100) / 100);
}

export interface HarmIndexEntity {
  id: number;
  entityName: string;
  entityType: string;
  industrySector: string | null;
  jurisdiction: string | null;
  systemicHarmScore: number;
  riskClassification: string;
  complaintCount: number;
  litigationCount: number;
  enforcementCount: number;
  geographicSpread: number;
  severityScore: number;
  patternAcceleration: number;
  lastUpdated: number;
}

export interface HarmIndexSummary {
  totalEntities: number;
  criticalActors: number;
  highRiskActors: number;
  elevatedRisk: number;
  moderateConcern: number;
  lowRisk: number;
  avgHarmScore: number;
  topEntities: HarmIndexEntity[];
}

/**
 * Scan all ingested records + signals to identify entities and calculate harm scores
 */
export async function calculateHarmIndex(): Promise<{ processed: number; errors: string[] }> {
  const now = Date.now();
  const errors: string[] = [];
  let processed = 0;

  try {
    // Step 1: Gather entity data from ingested_records (normalizedEntity field)
    const entityCounts = await db.execute(sql`
      SELECT normalizedEntity as entity_name, 
             COUNT(*) as complaint_count,
             COUNT(DISTINCT sourceDataset) as dataset_count
      FROM ingested_records 
      WHERE normalizedEntity IS NOT NULL AND normalizedEntity != ''
      GROUP BY normalizedEntity
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
      LIMIT 500
    `);

    // Step 2: Get litigation counts from litigation_registry
    const litigationCounts = await db.execute(sql`
      SELECT entity_name, COUNT(*) as lit_count 
      FROM litigation_registry 
      GROUP BY entity_name
    `);
    const litMap = new Map<string, number>();
    for (const row of litigationCounts[0] as unknown as any[]) {
      litMap.set((row.entity_name || "").toLowerCase(), Number(row.lit_count) || 0);
    }

    // Step 3: Get signal data for pattern acceleration
    const signalCounts = await db.execute(sql`
      SELECT entity_id as entity_name, COUNT(*) as signal_count
      FROM detected_signals
      WHERE signal_type = 'repeat_entity'
      GROUP BY entity_id
    `);
    const sigMap = new Map<string, number>();
    for (const row of signalCounts[0] as unknown as any[]) {
      sigMap.set((row.entity_name || "").toLowerCase(), Number(row.signal_count) || 0);
    }

    // Step 4: Process each entity
    for (const row of entityCounts[0] as unknown as any[]) {
      const entityName = row.entity_name;
      if (!entityName) continue;

      const complaintCount = Number(row.complaint_count) || 0;
      const datasetCount = Number(row.dataset_count) || 0;
      const litigationCount = litMap.get(entityName.toLowerCase()) || 0;
      const signalCount = sigMap.get(entityName.toLowerCase()) || 0;

      // Calculate component scores (each 0-100)
      const complaintScore = normalizeLog(complaintCount, 100);
      const litigationScore = normalizeLog(litigationCount, 20);
      const enforcementScore = normalizeLog(signalCount, 10); // signals as proxy for enforcement
      const geographicSpread = normalizeLog(datasetCount, 5) * 100 / 100;
      const patternAcceleration = signalCount > 0 ? Math.min(100, signalCount * 20) : 0;

      // Weighted composite score
      const harmScore = Math.round(
        (complaintScore * 0.25 +
         litigationScore * 0.25 +
         enforcementScore * 0.20 +
         geographicSpread * 0.15 +
         patternAcceleration * 0.15) * 100
      ) / 100;

      const riskClass = classifyRisk(harmScore);

      // Upsert entity
      await db.execute(sql`
        INSERT INTO harm_index_entities (entity_name, entity_type, first_detected, last_updated, created_at)
        VALUES (${entityName}, 'unknown', ${now}, ${now}, ${now})
        ON DUPLICATE KEY UPDATE last_updated = ${now}
      `);

      // Get entity ID
      const entityResult = await db.execute(sql`
        SELECT id FROM harm_index_entities WHERE entity_name = ${entityName} LIMIT 1
      `);
      const entityId = (entityResult[0] as unknown as any[])[0]?.id;
      if (!entityId) continue;

      // Insert score record
      await db.execute(sql`
        INSERT INTO harm_index_scores 
        (entity_id, complaint_count, litigation_count, enforcement_count, 
         geographic_spread, severity_score, pattern_acceleration, 
         systemic_harm_score, risk_classification, calculated_at)
        VALUES (${entityId}, ${complaintCount}, ${litigationCount}, ${signalCount},
                ${geographicSpread}, ${complaintScore}, ${patternAcceleration},
                ${harmScore}, ${riskClass}, ${now})
      `);

      // Insert history record
      await db.execute(sql`
        INSERT INTO harm_index_history (entity_id, systemic_harm_score, risk_classification, timestamp)
        VALUES (${entityId}, ${harmScore}, ${riskClass}, ${now})
      `);

      processed++;
    }
  } catch (err: any) {
    errors.push(err.message || "Unknown error during harm index calculation");
  }

  return { processed, errors };
}

/**
 * Get the current harm index summary
 */
export async function getHarmIndexSummary(): Promise<HarmIndexSummary> {
  // Get latest scores for each entity (most recent calculated_at)
  const results = await db.execute(sql`
    SELECT 
      e.id, e.entity_name, e.entity_type, e.industry_sector, e.jurisdiction,
      s.complaint_count, s.litigation_count, s.enforcement_count,
      s.geographic_spread, s.severity_score, s.pattern_acceleration,
      s.systemic_harm_score, s.risk_classification, s.calculated_at
    FROM harm_index_entities e
    JOIN harm_index_scores s ON s.entity_id = e.id
    WHERE s.id = (
      SELECT MAX(s2.id) FROM harm_index_scores s2 WHERE s2.entity_id = e.id
    )
    ORDER BY s.systemic_harm_score DESC
  `);

  const entities: HarmIndexEntity[] = (results[0] as unknown as any[]).map(r => ({
    id: r.id,
    entityName: r.entity_name,
    entityType: r.entity_type || "unknown",
    industrySector: r.industry_sector,
    jurisdiction: r.jurisdiction,
    systemicHarmScore: Number(r.systemic_harm_score) || 0,
    riskClassification: r.risk_classification || "Low Risk",
    complaintCount: Number(r.complaint_count) || 0,
    litigationCount: Number(r.litigation_count) || 0,
    enforcementCount: Number(r.enforcement_count) || 0,
    geographicSpread: Number(r.geographic_spread) || 0,
    severityScore: Number(r.severity_score) || 0,
    patternAcceleration: Number(r.pattern_acceleration) || 0,
    lastUpdated: Number(r.calculated_at) || 0,
  }));

  const criticalActors = entities.filter(e => e.systemicHarmScore >= 81).length;
  const highRiskActors = entities.filter(e => e.systemicHarmScore >= 61 && e.systemicHarmScore < 81).length;
  const elevatedRisk = entities.filter(e => e.systemicHarmScore >= 41 && e.systemicHarmScore < 61).length;
  const moderateConcern = entities.filter(e => e.systemicHarmScore >= 21 && e.systemicHarmScore < 41).length;
  const lowRisk = entities.filter(e => e.systemicHarmScore < 21).length;
  const avgScore = entities.length > 0
    ? Math.round(entities.reduce((sum, e) => sum + e.systemicHarmScore, 0) / entities.length * 100) / 100
    : 0;

  return {
    totalEntities: entities.length,
    criticalActors,
    highRiskActors,
    elevatedRisk,
    moderateConcern,
    lowRisk,
    avgHarmScore: avgScore,
    topEntities: entities.slice(0, 50),
  };
}

/**
 * Get harm score history for a specific entity
 */
export async function getEntityHarmHistory(entityId: number): Promise<any[]> {
  const results = await db.execute(sql`
    SELECT systemic_harm_score, risk_classification, timestamp
    FROM harm_index_history
    WHERE entity_id = ${entityId}
    ORDER BY timestamp ASC
  `);
  return (results[0] as unknown as any[]).map(r => ({
    score: Number(r.systemic_harm_score) || 0,
    classification: r.risk_classification,
    timestamp: Number(r.timestamp),
  }));
}
