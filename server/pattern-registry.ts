/**
 * Pattern Registry Engine
 * 
 * Aggregates signals from the Signal Engine into structured systemic patterns.
 * Implements:
 * - Pattern creation from signal clusters (threshold-based)
 * - Weighted confidence scoring per pattern type
 * - Decay lifecycle: active → dormant → archived with reactivation
 * - Evolution snapshots for trend analysis
 * - Pattern relationship discovery
 */
import { db } from "./db";
import {
  patternRegistry, patternSignalLinks, patternMetadata,
  patternEvolution, patternRelationships,
  patternConfidenceFactors, patternDecayRules, patternCreationThresholds,
} from "../drizzle/schema";
import { eq, and, sql, desc, gte, lte, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Types ───

interface SignalRow {
  signal_id: string;
  signal_type: string;
  dataset_id: string;
  confidence_score: number;
  detection_timestamp: number;
  jurisdiction_scope: string;
  severity_level: string;
  affected_entities: Record<string, unknown> | null;
  geographic_focus: Record<string, unknown> | null;
  plain_language_explanation: string | null;
  source_record_ids: string[] | null;
}

interface ThresholdRow {
  pattern_type: string;
  signal_type: string;
  trigger_threshold: number;
  confidence_threshold: number;
  time_window_days: number;
  description: string | null;
}

// ─── Evaluate Signals for Pattern Formation ───

export async function evaluateSignalsForPatterns(): Promise<{
  patternsCreated: number;
  patternsUpdated: number;
  patternsDecayed: number;
}> {
  const now = Date.now();
  let patternsCreated = 0;
  let patternsUpdated = 0;

  // 1. Load all creation thresholds
  const thresholds = await db.select().from(patternCreationThresholds);

  for (const threshold of thresholds) {
    const windowStart = now - (threshold.timeWindowDays * 24 * 60 * 60 * 1000);

    // 2. Query signals matching this threshold's signal type within the time window
    let signalQuery: string;
    let signalParams: unknown[];

    if (threshold.signalType === "any") {
      // Cross-jurisdictional: any signal type
      signalQuery = `
        SELECT signal_id, signal_type, dataset_id, confidence_score,
               detection_timestamp, jurisdiction_scope, severity_level,
               affected_entities, geographic_focus, plain_language_explanation,
               source_record_ids
        FROM detected_signals
        WHERE detection_timestamp >= ?
          AND confidence_score >= ?
        ORDER BY detection_timestamp DESC
      `;
      signalParams = [windowStart, threshold.confidenceThreshold];
    } else {
      signalQuery = `
        SELECT signal_id, signal_type, dataset_id, confidence_score,
               detection_timestamp, jurisdiction_scope, severity_level,
               affected_entities, geographic_focus, plain_language_explanation,
               source_record_ids
        FROM detected_signals
        WHERE signal_type = ?
          AND detection_timestamp >= ?
          AND confidence_score >= ?
        ORDER BY detection_timestamp DESC
      `;
      signalParams = [threshold.signalType, windowStart, threshold.confidenceThreshold];
    }

    const [signals] = await db.execute(sql.raw(signalQuery.replace(/\?/g, () => {
      const val = signalParams.shift();
      return typeof val === "string" ? `'${val}'` : String(val);
    }))) as unknown as [SignalRow[]];

    // 3. Check if signal count meets trigger threshold
    if (signals.length < threshold.triggerThreshold) continue;

    // 4. Check if a pattern of this type already exists and is active
    const existingPatterns = await db.select()
      .from(patternRegistry)
      .where(and(
        eq(patternRegistry.patternType, threshold.patternType),
        eq(patternRegistry.signalType, threshold.signalType),
        eq(patternRegistry.decayStatus, "active"),
      ));

    if (existingPatterns.length > 0) {
      // Update existing pattern with new signal data
      for (const existing of existingPatterns) {
        await updatePatternWithSignals(existing, signals, now);
        patternsUpdated++;
      }
    } else {
      // Create new pattern
      // @ts-ignore pre-existing type mismatch
      await createPatternFromSignals(threshold, signals, now);
      patternsCreated++;
    }
  }

  // 5. Run decay lifecycle
  const patternsDecayed = await runDecayLifecycle(now);

  return { patternsCreated, patternsUpdated, patternsDecayed };
}

// ─── Create Pattern from Signals ───

async function createPatternFromSignals(
  threshold: ThresholdRow,
  signals: SignalRow[],
  now: number,
): Promise<string> {
  const patternId = randomUUID();

  // Aggregate signal data
  const agg = aggregateSignalData(signals);
  // @ts-ignore pre-existing type mismatch
  const confidence = await calculatePatternConfidence(threshold.patternType, signals, agg);

  // Generate pattern name and description
  // @ts-ignore pre-existing type mismatch
  const patternName = generatePatternName(threshold.patternType, agg);
  // @ts-ignore pre-existing type mismatch
  const patternDescription = generatePatternDescription(threshold.patternType, signals, agg);

  // Determine time span
  const timestamps = signals.map(s => s.detection_timestamp).filter(Boolean);
  const timeSpanDays = timestamps.length > 1
    ? Math.ceil((Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60 * 1000))
    : 0;

  await db.insert(patternRegistry).values({
    patternId,
    patternName,
    patternDescription,
    // @ts-ignore pre-existing type mismatch
    patternType: threshold.patternType,
    // @ts-ignore pre-existing type mismatch
    signalType: threshold.signalType,
    // @ts-ignore pre-existing type mismatch
    triggerThreshold: threshold.triggerThreshold,
    // @ts-ignore pre-existing type mismatch
    confidenceThreshold: threshold.confidenceThreshold,
    confidenceScore: confidence,
    jurisdictionScope: agg.primaryJurisdiction,
    firstDetected: Math.min(...timestamps),
    lastConfirmed: Math.max(...timestamps),
    lastUpdated: now,
    signalCount: signals.length,
    uniqueEntitiesCount: agg.uniqueEntities,
    geographicSpread: agg.geographicAreas,
    timeSpanDays,
    decayStatus: "active",
    relatedLaws: agg.relatedLaws,
    relatedAgencies: agg.relatedAgencies,
    harmDomains: agg.harmDomains,
    metadata: { signalTypes: agg.signalTypeCounts, avgConfidence: agg.avgConfidence },
    createdAt: now,
    updatedAt: now,
  });

  // Link signals to pattern
  for (const signal of signals) {
    await db.insert(patternSignalLinks).values({
      patternId,
      signalId: signal.signal_id,
      signalType: signal.signal_type,
      confidenceAtLink: signal.confidence_score,
      contributingFactor: String(1.0 / signals.length),
      linkedAt: now,
      datasetId: signal.dataset_id,
      sourceRecordIds: signal.source_record_ids,
    }).onDuplicateKeyUpdate({ set: { confidenceAtLink: signal.confidence_score } });
  }

  // Create initial evolution snapshot
  await db.insert(patternEvolution).values({
    patternId,
    snapshotDate: now,
    signalCount: signals.length,
    confidenceScore: String(confidence),
    geographicSpread: agg.geographicAreas,
    status: "active",
    notes: `Pattern created with ${signals.length} signals`,
    createdAt: now,
  });

  return patternId;
}

// ─── Update Pattern with New Signals ───

async function updatePatternWithSignals(
  pattern: typeof patternRegistry.$inferSelect,
  signals: SignalRow[],
  now: number,
): Promise<void> {
  // Get existing linked signal IDs
  const existingLinks = await db.select({ signalId: patternSignalLinks.signalId })
    .from(patternSignalLinks)
    .where(eq(patternSignalLinks.patternId, pattern.patternId));
  const existingIds = new Set(existingLinks.map((l: any) => l.signalId));

  // Find new signals not yet linked
  const newSignals = signals.filter(s => !existingIds.has(s.signal_id));
  if (newSignals.length === 0) return;

  // Link new signals
  for (const signal of newSignals) {
    await db.insert(patternSignalLinks).values({
      patternId: pattern.patternId,
      signalId: signal.signal_id,
      signalType: signal.signal_type,
      confidenceAtLink: signal.confidence_score,
      contributingFactor: String(1.0 / signals.length),
      linkedAt: now,
      datasetId: signal.dataset_id,
      sourceRecordIds: signal.source_record_ids,
    }).onDuplicateKeyUpdate({ set: { confidenceAtLink: signal.confidence_score } });
  }

  // Recalculate aggregates
  const agg = aggregateSignalData(signals);
  const confidence = await calculatePatternConfidence(pattern.patternType || "", signals, agg);

  const timestamps = signals.map(s => s.detection_timestamp).filter(Boolean);
  const timeSpanDays = timestamps.length > 1
    ? Math.ceil((Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60 * 1000))
    : pattern.timeSpanDays || 0;

  await db.update(patternRegistry)
    .set({
      confidenceScore: confidence,
      lastConfirmed: Math.max(...timestamps),
      lastUpdated: now,
      signalCount: signals.length,
      uniqueEntitiesCount: agg.uniqueEntities,
      geographicSpread: agg.geographicAreas,
      timeSpanDays,
      relatedLaws: agg.relatedLaws,
      relatedAgencies: agg.relatedAgencies,
      harmDomains: agg.harmDomains,
      metadata: { signalTypes: agg.signalTypeCounts, avgConfidence: agg.avgConfidence },
      updatedAt: now,
    })
    .where(eq(patternRegistry.patternId, pattern.patternId));

  // Add evolution snapshot
  await db.insert(patternEvolution).values({
    patternId: pattern.patternId,
    snapshotDate: now,
    signalCount: signals.length,
    confidenceScore: String(confidence),
    geographicSpread: agg.geographicAreas,
    status: "active",
    notes: `Updated with ${newSignals.length} new signals (total: ${signals.length})`,
    createdAt: now,
  });
}

// ─── Aggregate Signal Data ───

interface SignalAggregation {
  uniqueEntities: number;
  geographicAreas: number;
  avgConfidence: number;
  primaryJurisdiction: string;
  signalTypeCounts: Record<string, number>;
  relatedLaws: string[];
  relatedAgencies: string[];
  harmDomains: string[];
  entities: string[];
  counties: string[];
}

function aggregateSignalData(signals: SignalRow[]): SignalAggregation {
  const entities = new Set<string>();
  const counties = new Set<string>();
  const signalTypeCounts: Record<string, number> = {};
  const jurisdictions: Record<string, number> = {};

  for (const s of signals) {
    // Count signal types
    signalTypeCounts[s.signal_type] = (signalTypeCounts[s.signal_type] || 0) + 1;

    // Track jurisdictions
    if (s.jurisdiction_scope) {
      jurisdictions[s.jurisdiction_scope] = (jurisdictions[s.jurisdiction_scope] || 0) + 1;
    }

    // Extract entities
    if (s.affected_entities) {
      const ae = typeof s.affected_entities === "string"
        ? JSON.parse(s.affected_entities)
        : s.affected_entities;
      if (ae.company) entities.add(String(ae.company));
      if (ae.entity) entities.add(String(ae.entity));
      if (ae.agency) entities.add(String(ae.agency));
    }

    // Extract geographic areas
    if (s.geographic_focus) {
      const gf = typeof s.geographic_focus === "string"
        ? JSON.parse(s.geographic_focus)
        : s.geographic_focus;
      if (gf.county) counties.add(String(gf.county));
      if (gf.city) counties.add(String(gf.city));
    }
  }

  // Determine primary jurisdiction
  const primaryJurisdiction = Object.entries(jurisdictions)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || "local";

  // Average confidence
  const avgConfidence = signals.length > 0
    ? Math.round(signals.reduce((sum, s) => sum + (s.confidence_score || 0), 0) / signals.length)
    : 0;

  return {
    uniqueEntities: entities.size,
    geographicAreas: counties.size,
    avgConfidence,
    primaryJurisdiction,
    signalTypeCounts,
    relatedLaws: [],
    relatedAgencies: Array.from(entities).slice(0, 10),
    harmDomains: Object.keys(signalTypeCounts),
    entities: Array.from(entities),
    counties: Array.from(counties),
  };
}

// ─── Calculate Pattern Confidence ───

export async function calculatePatternConfidence(
  patternType: string,
  signals: SignalRow[],
  agg: SignalAggregation,
): Promise<number> {
  // Load confidence factors for this pattern type
  const factors = await db.select()
    .from(patternConfidenceFactors)
    .where(eq(patternConfidenceFactors.patternType, patternType));

  if (factors.length === 0) {
    // Fallback: use average signal confidence
    return agg.avgConfidence;
  }

  let totalWeight = 0;
  let weightedScore = 0;

  for (const factor of factors) {
    const weight = factor.weight || 0;
    totalWeight += weight;

    let score = 0;
    switch (factor.factorName) {
      case "signal_consistency": {
        // How consistently signals point to same entity/issue
        const typeCount = Object.keys(agg.signalTypeCounts).length;
        score = typeCount === 1 ? 100 : Math.max(20, 100 - (typeCount - 1) * 15);
        break;
      }
      case "temporal_density": {
        // Clustering of signals within time window
        const timestamps = signals.map(s => s.detection_timestamp).filter(Boolean);
        if (timestamps.length > 1) {
          const span = Math.max(...timestamps) - Math.min(...timestamps);
          const daysSpan = span / (24 * 60 * 60 * 1000);
          const density = signals.length / Math.max(daysSpan, 1);
          score = Math.min(100, Math.round(density * 20));
        } else {
          score = 50;
        }
        break;
      }
      case "geographic_spread":
      case "geographic_dispersion": {
        // Distribution across jurisdictions
        score = Math.min(100, agg.geographicAreas * 20);
        break;
      }
      case "severity_trend": {
        // Whether signals are increasing in severity
        const severityMap: Record<string, number> = {
          critical: 100, high: 80, medium: 60, low: 40, info: 20,
        };
        const severities = signals.map(s => severityMap[s.severity_level] || 50);
        if (severities.length > 1) {
          const firstHalf = severities.slice(0, Math.floor(severities.length / 2));
          const secondHalf = severities.slice(Math.floor(severities.length / 2));
          const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          score = avgSecond >= avgFirst ? Math.min(100, Math.round(avgSecond)) : Math.round(avgFirst * 0.7);
        } else {
          score = 50;
        }
        break;
      }
      case "signal_confidence_avg": {
        score = agg.avgConfidence;
        break;
      }
      case "entity_diversity": {
        score = Math.min(100, agg.uniqueEntities * 12);
        break;
      }
      case "temporal_alignment": {
        // Correlation of signal timestamps
        const ts = signals.map(s => s.detection_timestamp).filter(Boolean).sort();
        if (ts.length > 2) {
          const gaps = ts.slice(1).map((t, i) => t - ts[i]);
          const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          const variance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
          const cv = Math.sqrt(variance) / Math.max(avgGap, 1);
          score = Math.min(100, Math.round((1 - Math.min(cv, 1)) * 100));
        } else {
          score = 50;
        }
        break;
      }
      case "harm_type_consistency": {
        const types = Object.keys(agg.signalTypeCounts);
        score = types.length <= 2 ? 90 : Math.max(30, 100 - types.length * 10);
        break;
      }
      default:
        score = 50;
    }

    weightedScore += score * weight;
  }

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : agg.avgConfidence;
}

// ─── Decay Lifecycle ───

export async function runDecayLifecycle(now: number): Promise<number> {
  const rules = await db.select().from(patternDecayRules);
  let decayed = 0;

  for (const rule of rules) {
    const dormantCutoff = now - (rule.dormantAfterDays! * 24 * 60 * 60 * 1000);
    const archiveCutoff = now - (rule.archiveAfterDays! * 24 * 60 * 60 * 1000);

    // Active → Dormant: no confirmation in dormant_after_days
    const [dormantResult] = await db.execute(sql`
      UPDATE pattern_registry
      SET decay_status = 'dormant',
          decay_reason = ${`No confirming signals for ${rule.dormantAfterDays} days`},
          updated_at = ${now}
      WHERE pattern_type = ${rule.patternType}
        AND decay_status = 'active'
        AND last_confirmed < ${dormantCutoff}
    `);
    decayed += (dormantResult as any).affectedRows || 0;

    // Dormant → Archived: dormant for archive_after_days
    const [archiveResult] = await db.execute(sql`
      UPDATE pattern_registry
      SET decay_status = 'archived',
          decay_reason = ${`Dormant for ${rule.archiveAfterDays} days, archived`},
          updated_at = ${now}
      WHERE pattern_type = ${rule.patternType}
        AND decay_status = 'dormant'
        AND last_confirmed < ${archiveCutoff}
    `);
    decayed += (archiveResult as any).affectedRows || 0;
  }

  return decayed;
}

// ─── Reactivate Dormant Pattern ───

export async function checkReactivation(patternId: string, now: number): Promise<boolean> {
  const [pattern] = await db.select()
    .from(patternRegistry)
    .where(eq(patternRegistry.patternId, patternId));

  if (!pattern || pattern.decayStatus !== "dormant") return false;

  // Get reactivation threshold for this pattern type
  const [rule] = await db.select()
    .from(patternDecayRules)
    .where(eq(patternDecayRules.patternType, pattern.patternType || ""));

  if (!rule) return false;

  // Count new signals since pattern went dormant
  const [newSignals] = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM detected_signals
    WHERE signal_type = ${pattern.signalType}
      AND detection_timestamp > ${pattern.lastConfirmed}
      AND confidence_score >= ${pattern.confidenceThreshold}
  `) as unknown as [{ cnt: number }[]];

  if (newSignals[0].cnt >= rule.reactivationThreshold!) {
    await db.update(patternRegistry)
      .set({
        decayStatus: "active",
        decayReason: null,
        lastConfirmed: now,
        updatedAt: now,
      })
      .where(eq(patternRegistry.patternId, patternId));

    await db.insert(patternEvolution).values({
      patternId,
      snapshotDate: now,
      signalCount: pattern.signalCount,
      confidenceScore: String(pattern.confidenceScore),
      geographicSpread: pattern.geographicSpread,
      status: "reactivated",
      notes: `Reactivated with ${newSignals[0].cnt} new signals`,
      createdAt: now,
    });

    return true;
  }

  return false;
}

// ─── Pattern Relationship Discovery ───

export async function discoverRelationships(): Promise<number> {
  const now = Date.now();
  const activePatterns = await db.select()
    .from(patternRegistry)
    .where(eq(patternRegistry.decayStatus, "active"));

  let discovered = 0;

  for (let i = 0; i < activePatterns.length; i++) {
    for (let j = i + 1; j < activePatterns.length; j++) {
      const a = activePatterns[i];
      const b = activePatterns[j];

      // Check for shared signals
      const [shared] = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM pattern_signal_links psl1
        JOIN pattern_signal_links psl2 ON psl1.signal_id = psl2.signal_id
        WHERE psl1.pattern_id = ${a.patternId}
          AND psl2.pattern_id = ${b.patternId}
      `) as unknown as [{ cnt: number }[]];

      if (shared[0].cnt > 0) {
        const confidence = Math.min(100, Math.round(shared[0].cnt * 15));
        const relType = determineRelationshipType(a, b);

        // Upsert relationship
        const existing = await db.select()
          .from(patternRelationships)
          .where(and(
            eq(patternRelationships.sourcePatternId, a.patternId),
            eq(patternRelationships.targetPatternId, b.patternId),
          ));

        if (existing.length === 0) {
          await db.insert(patternRelationships).values({
            sourcePatternId: a.patternId,
            targetPatternId: b.patternId,
            relationshipType: relType,
            confidenceScore: confidence,
            discoveredAt: now,
            lastObserved: now,
            metadata: { sharedSignals: shared[0].cnt },
          });
          discovered++;
        } else {
          await db.update(patternRelationships)
            .set({
              confidenceScore: confidence,
              lastObserved: now,
              metadata: { sharedSignals: shared[0].cnt },
            })
            .where(eq(patternRelationships.id, existing[0].id));
        }
      }
    }
  }

  return discovered;
}

function determineRelationshipType(
  a: typeof patternRegistry.$inferSelect,
  b: typeof patternRegistry.$inferSelect,
): string {
  // If one pattern started before the other, it may "precede" it
  if (a.firstDetected && b.firstDetected) {
    const diff = Math.abs(a.firstDetected - b.firstDetected);
    if (diff > 30 * 24 * 60 * 60 * 1000) {
      return a.firstDetected < b.firstDetected ? "precedes" : "follows";
    }
  }

  // Same pattern type = related_to
  if (a.patternType === b.patternType) return "related_to";

  // Different types with shared signals = contributes_to
  return "contributes_to";
}

// ─── Query Functions ───

export async function getPatternDashboard(filters?: {
  status?: string;
  patternType?: string;
  minConfidence?: number;
}) {
  let query = db.select().from(patternRegistry);

  const conditions = [];
  if (filters?.status) conditions.push(eq(patternRegistry.decayStatus, filters.status));
  if (filters?.patternType) conditions.push(eq(patternRegistry.patternType, filters.patternType));
  if (filters?.minConfidence) conditions.push(gte(patternRegistry.confidenceScore, filters.minConfidence));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const patterns = await query.orderBy(desc(patternRegistry.confidenceScore));

  // Get summary counts
  const [summary] = await db.execute(sql`
    SELECT
      COUNT(CASE WHEN decay_status = 'active' THEN 1 END) as active_count,
      COUNT(CASE WHEN decay_status = 'dormant' THEN 1 END) as dormant_count,
      COUNT(CASE WHEN decay_status = 'archived' THEN 1 END) as archived_count,
      COUNT(CASE WHEN confidence_score >= 85 THEN 1 END) as critical_count,
      COUNT(CASE WHEN confidence_score >= 70 AND confidence_score < 85 THEN 1 END) as high_count,
      COUNT(CASE WHEN confidence_score >= 50 AND confidence_score < 70 THEN 1 END) as emerging_count,
      COUNT(*) as total_count
    FROM pattern_registry
  `) as unknown as [Record<string, number>[]];

  return {
    patterns,
    summary: summary[0],
  };
}

export async function getPatternDetail(patternId: string) {
  const [pattern] = await db.select()
    .from(patternRegistry)
    .where(eq(patternRegistry.patternId, patternId));

  if (!pattern) return null;

  // Get linked signals
  const linkedSignals = await db.select()
    .from(patternSignalLinks)
    .where(eq(patternSignalLinks.patternId, patternId))
    .orderBy(desc(patternSignalLinks.linkedAt));

  // Get metadata
  const metadata = await db.select()
    .from(patternMetadata)
    .where(eq(patternMetadata.patternId, patternId));

  // Get evolution history
  const evolution = await db.select()
    .from(patternEvolution)
    .where(eq(patternEvolution.patternId, patternId))
    .orderBy(desc(patternEvolution.snapshotDate));

  // Get relationships
  const relationships = await db.execute(sql`
    SELECT pr.*, 
      CASE WHEN pr.source_pattern_id = ${patternId} THEN pr.target_pattern_id ELSE pr.source_pattern_id END as related_pattern_id,
      p.pattern_name as related_pattern_name,
      p.pattern_type as related_pattern_type,
      p.confidence_score as related_confidence
    FROM pattern_relationships pr
    JOIN pattern_registry p ON (
      CASE WHEN pr.source_pattern_id = ${patternId} THEN pr.target_pattern_id ELSE pr.source_pattern_id END
    ) = p.pattern_id
    WHERE pr.source_pattern_id = ${patternId} OR pr.target_pattern_id = ${patternId}
  `);

  // Get confidence factors for this pattern type
  const confidenceFactors = await db.select()
    .from(patternConfidenceFactors)
    .where(eq(patternConfidenceFactors.patternType, pattern.patternType || ""));

  return {
    pattern,
    linkedSignals,
    metadata,
    evolution,
    relationships: (relationships as unknown as unknown[][])[0] || [],
    confidenceFactors,
  };
}

export async function getPatternEvolutionTimeline(patternId: string) {
  return db.select()
    .from(patternEvolution)
    .where(eq(patternEvolution.patternId, patternId))
    .orderBy(patternEvolution.snapshotDate);
}

export async function getPatternRelationshipGraph() {
  const patterns = await db.select({
    patternId: patternRegistry.patternId,
    patternName: patternRegistry.patternName,
    patternType: patternRegistry.patternType,
    confidenceScore: patternRegistry.confidenceScore,
    decayStatus: patternRegistry.decayStatus,
    signalCount: patternRegistry.signalCount,
  }).from(patternRegistry)
    .where(eq(patternRegistry.decayStatus, "active"));

  const relationships = await db.select()
    .from(patternRelationships);

  return { nodes: patterns, edges: relationships };
}

// ─── Helper: Generate Pattern Name ───

function generatePatternName(patternType: string, agg: SignalAggregation): string {
  const typeLabels: Record<string, string> = {
    repeat_offender: "Repeat Offender Pattern",
    industry_crisis: "Industry-Wide Crisis",
    geographic_hotspot: "Geographic Hotspot",
    systemic_delay: "Systemic Delay Pattern",
    status_anomaly_pattern: "Status Anomaly Pattern",
    dark_money_network: "Dark Money Network",
    campaign_finance_ring: "Campaign Finance Ring",
    lobbying_concentration: "Lobbying Concentration",
    election_integrity_risk: "Election Integrity Risk",
    cross_jurisdictional: "Cross-Jurisdictional Pattern",
  };

  const label = typeLabels[patternType] || "Detected Pattern";
  const location = agg.counties.length > 0 ? ` — ${agg.counties[0]}` : "";
  const entity = agg.entities.length > 0 ? ` (${agg.entities[0]})` : "";

  return `${label}${entity}${location}`;
}

function generatePatternDescription(
  patternType: string,
  signals: SignalRow[],
  agg: SignalAggregation,
): string {
  const parts: string[] = [];
  parts.push(`${signals.length} signals aggregated into a ${patternType.replace(/_/g, " ")} pattern.`);

  if (agg.uniqueEntities > 0) {
    parts.push(`${agg.uniqueEntities} distinct entities involved.`);
  }
  if (agg.geographicAreas > 0) {
    parts.push(`Spanning ${agg.geographicAreas} geographic area(s).`);
  }
  parts.push(`Average signal confidence: ${agg.avgConfidence}%.`);
  parts.push(`Primary jurisdiction: ${agg.primaryJurisdiction}.`);

  return parts.join(" ");
}

// ─── Mission Control Summary ───

export async function getPatternSummaryForMissionControl() {
  const [rows] = await db.execute(sql`
    SELECT
      pattern_id, pattern_name, pattern_type, confidence_score,
      decay_status, signal_count, jurisdiction_scope, last_confirmed,
      geographic_spread, unique_entities_count, time_span_days
    FROM pattern_registry
    WHERE decay_status IN ('active', 'dormant')
    ORDER BY
      CASE WHEN confidence_score >= 85 THEN 0
           WHEN confidence_score >= 70 THEN 1
           ELSE 2 END,
      confidence_score DESC
    LIMIT 20
  `) as unknown as [Record<string, unknown>[]];

  const critical = rows.filter(r => (r.confidence_score as number) >= 85);
  const high = rows.filter(r => (r.confidence_score as number) >= 70 && (r.confidence_score as number) < 85);
  const emerging = rows.filter(r => (r.confidence_score as number) < 70);

  return { critical, high, emerging, total: rows.length };
}
