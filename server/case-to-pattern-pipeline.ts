/**
 * Case-to-Pattern Pipeline
 *
 * CTP1. Case Signal Extraction — extract signals from case data
 * CTP2. Signal Normalization — deduplicate and normalize signals
 * CTP3. Pattern Triggering — check if signal thresholds trigger patterns
 * CTP4. Case-Pattern Linking — link cases to patterns
 * CTP5. System Impact Summary — show case's contribution to systemic patterns
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── CTP1. Case Signal Extraction ──────────────────────────────────────────
export interface SignalCandidate {
  signalType: string;
  entity: string;
  jurisdiction: string;
  confidenceScore: number;
  observedValue: number;
  description: string;
}

export async function extractCaseSignals(params: {
  caseId: number;
  claimType: string;
  entities?: string[];
  agencies?: string[];
  damages?: number;
  location?: string;
  dates?: string[];
}): Promise<{ signals: SignalCandidate[]; extracted: number }> {
  const { caseId, claimType, entities = [], damages = 0, location = '' } = params;
  const signals: SignalCandidate[] = [];

  // Get case evidence to determine confidence
  const [evRows] = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM evidence_items WHERE caseId = ${caseId}
  `);
  const evidenceCount = Number((evRows as unknown as any[])[0]?.cnt) || 0;
  const baseConfidence = Math.min(30 + evidenceCount * 10, 90);

  // Generate signal from claim type
  const signalTypeMap: Record<string, string> = {
    wage_theft: 'wage_violation',
    housing_discrimination: 'housing_discrimination',
    consumer_fraud: 'consumer_fraud',
    debt_collection_harassment: 'debt_harassment',
    security_deposit: 'deposit_violation',
    habitability_violation: 'habitability_issue',
    ssdi_denial: 'benefits_denial',
    ssi_denial: 'benefits_denial',
    public_records_violation: 'transparency_violation',
    overtime_violation: 'wage_violation',
  };

  const signalType = signalTypeMap[claimType] || claimType;

  // Generate entity-level signals
  for (const entity of entities) {
    signals.push({
      signalType,
      entity,
      jurisdiction: location || 'unknown',
      confidenceScore: baseConfidence,
      observedValue: damages,
      description: `${claimType.replace(/_/g, ' ')} signal from case ${caseId} involving ${entity}`,
    });
  }

  // If no entities, generate a general signal
  if (entities.length === 0) {
    signals.push({
      signalType,
      entity: 'unknown',
      jurisdiction: location || 'unknown',
      confidenceScore: baseConfidence,
      observedValue: damages,
      description: `${claimType.replace(/_/g, ' ')} signal from case ${caseId}`,
    });
  }

  return { signals, extracted: signals.length };
}

// ─── CTP2. Signal Normalization ─────────────────────────────────────────────
/**
 * GATE ENFORCEMENT: Direct writes to detected_signals are permanently blocked.
 * All signals must flow through: live_signals → Sunam gate → detected_signals.
 *
 * Case-to-pattern signals are stored in live_signals for gate evaluation.
 * The gate decides whether they are promoted to detected_signals.
 *
 * This function now writes to live_signals only, then returns the IDs
 * for downstream pattern checking (which reads from detected_signals).
 */
export async function normalizeAndStoreSignals(
  caseId: number,
  signals: SignalCandidate[]
): Promise<{ stored: number; deduplicated: number; signalIds: string[] }> {
  let stored = 0;
  let deduplicated = 0;
  const signalIds: string[] = [];

  for (const sig of signals) {
    // Check for existing signal from same entity + type within 90 days in live_signals
    const [existing] = await db.execute(sql`
      SELECT id FROM live_signals
      WHERE signalType_ls = ${sig.signalType}
        AND canonical_entity_name LIKE ${`%${sig.entity}%`}
        AND jurisdiction_ls = ${sig.jurisdiction}
        AND detectedAt_ls > ${Date.now() - 90 * 24 * 60 * 60 * 1000}
      LIMIT 1
    `);

    if ((existing as unknown as any[]).length > 0) {
      // Deduplicate — signal already exists in live_signals
      const existingId = String((existing as unknown as any[])[0].id);
      signalIds.push(existingId);
      deduplicated++;
    } else {
      // Store in live_signals — the gate will decide promotion
      const fingerprint = `case-${caseId}-${sig.signalType}-${sig.entity}-${Date.now()}`;
      const nowMs = Date.now();
      await db.execute(sql`
        INSERT INTO live_signals
          (signalType_ls, datasetId_ls, jurisdiction_ls, domain_ls, severity_ls,
           title_ls, explanation_ls, patternSummary, supportingStatistics,
           confidenceScore, detectedAt_ls, signalFingerprint,
           canonical_entity_name, entity_role, active_ls)
        VALUES
          (${sig.signalType}, ${'case-pipeline'}, ${sig.jurisdiction}, ${'case-data'},
           ${'medium'}, ${`Case ${caseId}: ${sig.signalType.replace(/_/g, ' ')} signal`},
           ${sig.description}, ${null},
           ${JSON.stringify({ observedValue: sig.observedValue, caseId, entity: sig.entity })},
           ${sig.confidenceScore}, ${nowMs}, ${fingerprint},
           ${sig.entity}, ${'subject'}, ${1})
      `);
      const [idRows] = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
      const newId = String((idRows as unknown as any[])[0]?.id);
      signalIds.push(newId);
      stored++;
    }
  }

  console.log(
    `[GATE ENFORCEMENT] case-to-pattern-pipeline: ${stored} signals stored in live_signals ` +
    `(NOT detected_signals). ${deduplicated} deduplicated. Signals await Sunam gate evaluation.`
  );

  return { stored, deduplicated, signalIds };
}

// ─── CTP3. Pattern Triggering ───────────────────────────────────────────────
export interface PatternTriggerResult {
  patternsTriggered: { patternId: string; patternName: string; signalCount: number; threshold: number }[];
  patternsUpdated: { patternId: string; patternName: string; newSignalCount: number }[];
}

const PATTERN_THRESHOLDS: Record<string, { signals: number; days: number }> = {
  repeat_offender: { signals: 10, days: 90 },
  industry_wide: { signals: 15, days: 120 },
  geographic_cluster: { signals: 5, days: 60 },
};

export async function checkPatternTriggers(
  signalType: string,
  jurisdiction: string
): Promise<PatternTriggerResult> {
  const result: PatternTriggerResult = { patternsTriggered: [], patternsUpdated: [] };

  // Check signal density for pattern triggering
  for (const [patternType, threshold] of Object.entries(PATTERN_THRESHOLDS)) {
    const cutoff = Date.now() - threshold.days * 24 * 60 * 60 * 1000;
    const [countRows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM detected_signals
      WHERE signal_type = ${signalType}
        AND jurisdiction_scope = ${jurisdiction}
        AND created_at > ${cutoff}
        AND escalation_status = 'active'
    `);
    const signalCount = Number((countRows as unknown as any[])[0]?.cnt) || 0;

    if (signalCount >= threshold.signals) {
      // Check if pattern already exists
      const [existingPattern] = await db.execute(sql`
        SELECT pattern_id, pattern_name, signal_count FROM pattern_registry
        WHERE pattern_type = ${patternType}
          AND jurisdiction_scope = ${jurisdiction}
          AND LOWER(pattern_name) LIKE ${`%${signalType.replace(/_/g, '%')}%`}
        LIMIT 1
      `);

      if ((existingPattern as unknown as any[]).length > 0) {
        const p = (existingPattern as unknown as any[])[0];
        await db.execute(sql`
          UPDATE pattern_registry SET signal_count = ${signalCount}, updated_at = NOW()
          WHERE pattern_id = ${p.pattern_id}
        `);
        result.patternsUpdated.push({
          patternId: p.pattern_id, patternName: p.pattern_name, newSignalCount: signalCount,
        });
      } else {
        result.patternsTriggered.push({
          patternId: 'pending', patternName: `${signalType} ${patternType} in ${jurisdiction}`,
          signalCount, threshold: threshold.signals,
        });
      }
    }
  }

  return result;
}

// ─── CTP4. Case-Pattern Linking ─────────────────────────────────────────────
export async function linkCaseToPatterns(
  caseId: number,
  signalIds: string[]
): Promise<{ linked: number }> {
  let linked = 0;

  for (const signalId of signalIds) {
    // Find patterns that include this signal type
    const [sigRows] = await db.execute(sql`
      SELECT signal_type, jurisdiction_scope FROM detected_signals WHERE signal_id = ${signalId}
    `);
    const sig = (sigRows as unknown as any[])[0];
    if (!sig) continue;

    const [patterns] = await db.execute(sql`
      SELECT pattern_id FROM pattern_registry
      WHERE jurisdiction_scope = ${sig.jurisdiction_scope}
        AND LOWER(pattern_name) LIKE ${`%${sig.signal_type.replace(/_/g, '%')}%`}
    `);

    for (const p of patterns as unknown as any[]) {
      // Check if link already exists
      const [existing] = await db.execute(sql`
        SELECT id FROM case_pattern_links
        WHERE case_id = ${caseId} AND pattern_id = ${p.pattern_id}
      `);
      if ((existing as unknown as any[]).length === 0) {
        await db.execute(sql`
          INSERT INTO case_pattern_links (case_id, pattern_id, signal_id, confidence_score, linked_at)
          VALUES (${caseId}, ${p.pattern_id}, ${signalId}, 50, ${Date.now()})
        `);
        linked++;
      }
    }
  }

  return { linked };
}

// ─── CTP5. System Impact Summary ────────────────────────────────────────────
export async function getSystemImpact(caseId: number): Promise<{
  signals: any[];
  patterns: any[];
  trends: any[];
  totalContribution: number;
}> {
  // Get signals linked to this case
  const [signalRows] = await db.execute(sql`
    SELECT ds.signal_id, ds.signal_type, ds.affected_entities, ds.jurisdiction_scope,
           ds.confidence_score, ds.observed_value, ds.escalation_status
    FROM detected_signals ds
    JOIN case_pattern_links cpl ON ds.signal_id = cpl.signal_id
    WHERE cpl.case_id = ${caseId}
    GROUP BY ds.signal_id, ds.signal_type, ds.affected_entities, ds.jurisdiction_scope,
             ds.confidence_score, ds.observed_value, ds.escalation_status
  `);

  // Get patterns linked to this case
  const [patternRows] = await db.execute(sql`
    SELECT pr.pattern_id, pr.pattern_name, pr.pattern_type, pr.confidence_score,
           pr.signal_count, pr.jurisdiction_scope, MAX(cpl.confidence_score) as link_confidence
    FROM pattern_registry pr
    JOIN case_pattern_links cpl ON pr.pattern_id = cpl.pattern_id
    WHERE cpl.case_id = ${caseId}
    GROUP BY pr.pattern_id, pr.pattern_name, pr.pattern_type, pr.confidence_score,
             pr.signal_count, pr.jurisdiction_scope
  `);

  // Get trends associated with those patterns
  const patternIds = (patternRows as unknown as any[]).map(p => p.pattern_id);
  let trends: any[] = [];
  if (patternIds.length > 0) {
    try {
      const [trendRows] = await db.execute(sql`
        SELECT tr.trend_id, tr.trend_name, tr.trend_classification,
               tr.pressure_index, tr.momentum_direction, tr.growth_rate_7d
        FROM trend_registry tr
        WHERE tr.pattern_id IN (${sql.raw(patternIds.map((id: string) => `'${id}'`).join(','))})
          AND tr.is_current = 1
      `);
      trends = trendRows as unknown as any[];
    } catch { /* no trends yet */ }
  }

  return {
    signals: signalRows as unknown as any[],
    patterns: patternRows as unknown as any[],
    trends,
    totalContribution: (signalRows as unknown as any[]).length,
  };
}

// ─── CTP6. Full Pipeline ────────────────────────────────────────────────────
export async function runCaseToPatternPipeline(params: {
  caseId: number;
  claimType: string;
  entities?: string[];
  agencies?: string[];
  damages?: number;
  location?: string;
  dates?: string[];
}): Promise<{
  signalsExtracted: number;
  signalsStored: number;
  signalsDeduplicated: number;
  patternsTriggered: number;
  patternsUpdated: number;
  casePatternsLinked: number;
}> {
  // Step 1: Extract signals
  const { signals } = await extractCaseSignals(params);

  // Step 2: Normalize and store
  const { stored, deduplicated, signalIds } = await normalizeAndStoreSignals(params.caseId, signals);

  // Step 3: Check pattern triggers
  let patternsTriggered = 0;
  let patternsUpdated = 0;
  for (const sig of signals) {
    const triggerResult = await checkPatternTriggers(sig.signalType, sig.jurisdiction);
    patternsTriggered += triggerResult.patternsTriggered.length;
    patternsUpdated += triggerResult.patternsUpdated.length;
  }

  // Step 4: Link case to patterns
  const { linked } = await linkCaseToPatterns(params.caseId, signalIds);

  return {
    signalsExtracted: signals.length,
    signalsStored: stored,
    signalsDeduplicated: deduplicated,
    patternsTriggered,
    patternsUpdated,
    casePatternsLinked: linked,
  };
}
