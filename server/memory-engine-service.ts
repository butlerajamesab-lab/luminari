/**
 * Memory Engine Service
 * 
 * T1. Outcome events from intervention_outcomes → strategy_memory records
 * T2. strategy_memory records → aggregated strategy_memory_summary
 * T3. strategy_memory_summary → strategy generation consultation (best-performing strategies by pattern+jurisdiction)
 * T4. Memory dashboard → surfaced in Diagnostics for analyst review
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────

export interface MemoryRecord {
  memoryId: string;
  patternType: string;
  claimType: string;
  jurisdiction: string;
  strategyId: string;
  interventionType: string;
  signalsBefore: number;
  signalsAfter: number;
  pressureBefore: number;
  pressureAfter: number;
  timeToImpactDays: number;
  cost: number;
  successScore: number;
  confidenceScore: number;
  outcomeId: string;
  caseId: string;
  notes: string;
  createdAt: number;
}

export interface MemorySummary {
  patternType: string;
  strategyId: string;
  jurisdiction: string;
  claimType: string;
  avgSuccessScore: number;
  avgCost: number;
  avgTimeToImpact: number;
  successRate: number;
  sampleSize: number;
  lastUpdated: number;
}

export interface StrategyRecommendation {
  strategyId: string;
  avgSuccessScore: number;
  avgCost: number;
  avgTimeToImpact: number;
  successRate: number;
  sampleSize: number;
  recommendation: string;
}

// ── T1: Capture Outcome → Memory ───────────────────────────────────────

export async function captureOutcomeToMemory(params: {
  outcomeId: string;
  caseId: string;
  patternType: string;
  claimType: string;
  jurisdiction: string;
  strategyId: string;
  remedyTemplateId?: string;
  interventionType: string;
  signalsBefore: number;
  signalsAfter: number;
  pressureBefore: number;
  pressureAfter: number;
  timeToImpactDays: number;
  cost: number;
}): Promise<MemoryRecord> {
  const memoryId = `MEM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const now = Date.now();

  // T1.1: Calculate success score from signal reduction and pressure change
  const signalReduction = params.signalsBefore > 0
    ? ((params.signalsBefore - params.signalsAfter) / params.signalsBefore) * 100
    : 0;
  const pressureReduction = params.pressureBefore > 0
    ? ((params.pressureBefore - params.pressureAfter) / params.pressureBefore) * 100
    : 0;
  const successScore = Math.min(100, Math.max(0, (signalReduction * 0.6 + pressureReduction * 0.4)));

  // T1.2: Confidence based on data completeness
  let confidenceScore = 50;
  if (params.signalsBefore > 0 && params.signalsAfter >= 0) confidenceScore += 15;
  if (params.pressureBefore > 0) confidenceScore += 15;
  if (params.timeToImpactDays > 0) confidenceScore += 10;
  if (params.cost > 0) confidenceScore += 10;
  confidenceScore = Math.min(100, confidenceScore);

  const remedyTplId = params.remedyTemplateId || null;

  await db.execute(
    sql`INSERT INTO strategy_memory (memory_id, pattern_type, claim_type, jurisdiction, strategy_id, remedy_template_id, intervention_type, signals_before, signals_after, pressure_before, pressure_after, time_to_impact_days, cost, success_score, confidence_score, outcome_id, case_id, notes, created_at)
     VALUES (${memoryId}, ${params.patternType}, ${params.claimType}, ${params.jurisdiction}, ${params.strategyId},
     ${remedyTplId}, ${params.interventionType},
     ${params.signalsBefore}, ${params.signalsAfter}, ${params.pressureBefore}, ${params.pressureAfter},
     ${params.timeToImpactDays}, ${params.cost}, ${successScore}, ${confidenceScore},
     ${params.outcomeId}, ${params.caseId}, ${''}, ${now})`
  );

  return {
    memoryId, patternType: params.patternType, claimType: params.claimType,
    jurisdiction: params.jurisdiction, strategyId: params.strategyId,
    interventionType: params.interventionType,
    signalsBefore: params.signalsBefore, signalsAfter: params.signalsAfter,
    pressureBefore: params.pressureBefore, pressureAfter: params.pressureAfter,
    timeToImpactDays: params.timeToImpactDays, cost: params.cost,
    successScore, confidenceScore, outcomeId: params.outcomeId,
    caseId: params.caseId, notes: '', createdAt: now
  };
}

// ── T2: Aggregate Memory → Summary ─────────────────────────────────────

export async function aggregateMemorySummaries(): Promise<{ updated: number }> {
  const now = Date.now();

  // T2.1: Get distinct groupings
  const [groups] = await db.execute(
    sql`SELECT pattern_type, strategy_id, jurisdiction, claim_type,
            AVG(success_score) as avg_score,
            AVG(cost) as avg_cost,
            AVG(time_to_impact_days) as avg_time,
            SUM(CASE WHEN success_score >= 50 THEN 1 ELSE 0 END) as successes,
            COUNT(*) as total
     FROM strategy_memory
     GROUP BY pattern_type, strategy_id, jurisdiction, claim_type`
  );

  let updated = 0;
  for (const g of groups as unknown as any[]) {
    const successRate = g.total > 0 ? (g.successes / g.total) * 100 : 0;
    const pType = g.pattern_type;
    const sId = g.strategy_id;
    const jur = g.jurisdiction || '';
    const cType = g.claim_type || '';
    const avgScore = g.avg_score;
    const avgCost = g.avg_cost;
    const avgTime = Math.round(g.avg_time);
    const total = g.total;

    // Check if exists
    const [existing] = await db.execute(
      sql`SELECT id FROM strategy_memory_summary WHERE pattern_type = ${pType} AND strategy_id = ${sId} AND jurisdiction = ${jur} AND claim_type = ${cType}`
    );

    if ((existing as unknown as any[]).length > 0) {
      await db.execute(
        sql`UPDATE strategy_memory_summary SET avg_success_score = ${avgScore}, avg_cost = ${avgCost}, avg_time_to_impact = ${avgTime}, success_rate = ${successRate}, sample_size = ${total}, last_updated = ${now} WHERE pattern_type = ${pType} AND strategy_id = ${sId} AND jurisdiction = ${jur} AND claim_type = ${cType}`
      );
    } else {
      await db.execute(
        sql`INSERT INTO strategy_memory_summary (pattern_type, strategy_id, jurisdiction, claim_type, avg_success_score, avg_cost, avg_time_to_impact, success_rate, sample_size, last_updated)
         VALUES (${pType}, ${sId}, ${jur}, ${cType}, ${avgScore}, ${avgCost}, ${avgTime}, ${successRate}, ${total}, ${now})`
      );
    }
    updated++;
  }

  return { updated };
}

// ── T3: Consult Memory for Strategy Generation ─────────────────────────

export async function consultMemoryForStrategy(params: {
  patternType: string;
  jurisdiction?: string;
  claimType?: string;
}): Promise<StrategyRecommendation[]> {
  // Build query with sql tagged template
  let baseQuery = sql`SELECT strategy_id, avg_success_score, avg_cost, avg_time_to_impact, success_rate, sample_size
               FROM strategy_memory_summary
               WHERE pattern_type = ${params.patternType}`;

  if (params.jurisdiction) {
    baseQuery = sql`${baseQuery} AND (jurisdiction = ${params.jurisdiction} OR jurisdiction = '')`;
  }
  if (params.claimType) {
    baseQuery = sql`${baseQuery} AND (claim_type = ${params.claimType} OR claim_type = '')`;
  }

  baseQuery = sql`${baseQuery} ORDER BY avg_success_score DESC LIMIT 10`;

  const [rows] = await db.execute(baseQuery);

  return (rows as unknown as any[]).map(r => ({
    strategyId: r.strategy_id,
    avgSuccessScore: Number(r.avg_success_score),
    avgCost: Number(r.avg_cost),
    avgTimeToImpact: Number(r.avg_time_to_impact),
    successRate: Number(r.success_rate),
    sampleSize: Number(r.sample_size),
    recommendation: r.avg_success_score >= 70
      ? 'highly_recommended'
      : r.avg_success_score >= 50
        ? 'recommended'
        : r.avg_success_score >= 30
          ? 'use_with_caution'
          : 'not_recommended'
  }));
}

// ── T4: Memory Dashboard ───────────────────────────────────────────────

export async function getMemoryDashboard(): Promise<{
  totalMemories: number;
  totalSummaries: number;
  avgSuccessScore: number;
  topStrategies: StrategyRecommendation[];
  recentMemories: MemoryRecord[];
  byPatternType: { patternType: string; count: number; avgScore: number }[];
  byJurisdiction: { jurisdiction: string; count: number; avgScore: number }[];
}> {
  const [countR] = await db.execute(sql`SELECT COUNT(*) as cnt FROM strategy_memory`);
  const [summaryR] = await db.execute(sql`SELECT COUNT(*) as cnt FROM strategy_memory_summary`);
  const [avgR] = await db.execute(sql`SELECT AVG(success_score) as avg_val FROM strategy_memory`);

  const [topR] = await db.execute(
    sql`SELECT strategy_id, avg_success_score, avg_cost, avg_time_to_impact, success_rate, sample_size
     FROM strategy_memory_summary
     ORDER BY avg_success_score DESC LIMIT 5`
  );

  const [recentR] = await db.execute(
    sql`SELECT memory_id, pattern_type, claim_type, jurisdiction, strategy_id, intervention_type,
            signals_before, signals_after, pressure_before, pressure_after,
            time_to_impact_days, cost, success_score, confidence_score, outcome_id, case_id, notes, created_at
     FROM strategy_memory ORDER BY created_at DESC LIMIT 10`
  );

  const [byPatternR] = await db.execute(
    sql`SELECT pattern_type, COUNT(*) as cnt, AVG(success_score) as avg_val
     FROM strategy_memory GROUP BY pattern_type ORDER BY cnt DESC`
  );

  const [byJurisR] = await db.execute(
    sql`SELECT jurisdiction, COUNT(*) as cnt, AVG(success_score) as avg_val
     FROM strategy_memory WHERE jurisdiction IS NOT NULL AND jurisdiction != ''
     GROUP BY jurisdiction ORDER BY cnt DESC`
  );

  return {
    totalMemories: (countR as any)[0].cnt,
    totalSummaries: (summaryR as any)[0].cnt,
    avgSuccessScore: Number((avgR as any)[0].avg_val) || 0,
    topStrategies: (topR as unknown as any[]).map(r => ({
      strategyId: r.strategy_id,
      avgSuccessScore: Number(r.avg_success_score),
      avgCost: Number(r.avg_cost),
      avgTimeToImpact: Number(r.avg_time_to_impact),
      successRate: Number(r.success_rate),
      sampleSize: Number(r.sample_size),
      recommendation: r.avg_success_score >= 70 ? 'highly_recommended' : r.avg_success_score >= 50 ? 'recommended' : 'use_with_caution'
    })),
    recentMemories: (recentR as unknown as any[]).map(r => ({
      memoryId: r.memory_id,
      patternType: r.pattern_type,
      claimType: r.claim_type,
      jurisdiction: r.jurisdiction,
      strategyId: r.strategy_id,
      interventionType: r.intervention_type,
      signalsBefore: r.signals_before,
      signalsAfter: r.signals_after,
      pressureBefore: Number(r.pressure_before),
      pressureAfter: Number(r.pressure_after),
      timeToImpactDays: r.time_to_impact_days,
      cost: Number(r.cost),
      successScore: Number(r.success_score),
      confidenceScore: Number(r.confidence_score),
      outcomeId: r.outcome_id,
      caseId: r.case_id,
      notes: r.notes,
      createdAt: Number(r.created_at)
    })),
    byPatternType: (byPatternR as unknown as any[]).map(r => ({
      patternType: r.pattern_type,
      count: r.cnt,
      avgScore: Number(r.avg_val)
    })),
    byJurisdiction: (byJurisR as unknown as any[]).map(r => ({
      jurisdiction: r.jurisdiction,
      count: r.cnt,
      avgScore: Number(r.avg_val)
    }))
  };
}

// ── List Memory Records ────────────────────────────────────────────────

export async function listMemoryRecords(params: {
  patternType?: string;
  jurisdiction?: string;
  limit?: number;
}): Promise<MemoryRecord[]> {
  const lim = params.limit || 50;
  let query = sql`SELECT * FROM strategy_memory WHERE 1=1`;
  if (params.patternType) { query = sql`${query} AND pattern_type = ${params.patternType}`; }
  if (params.jurisdiction) { query = sql`${query} AND jurisdiction = ${params.jurisdiction}`; }
  query = sql`${query} ORDER BY created_at DESC LIMIT ${lim}`;

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(r => ({
    memoryId: r.memory_id,
    patternType: r.pattern_type,
    claimType: r.claim_type,
    jurisdiction: r.jurisdiction,
    strategyId: r.strategy_id,
    interventionType: r.intervention_type,
    signalsBefore: r.signals_before,
    signalsAfter: r.signals_after,
    pressureBefore: Number(r.pressure_before),
    pressureAfter: Number(r.pressure_after),
    timeToImpactDays: r.time_to_impact_days,
    cost: Number(r.cost),
    successScore: Number(r.success_score),
    confidenceScore: Number(r.confidence_score),
    outcomeId: r.outcome_id,
    caseId: r.case_id,
    notes: r.notes,
    createdAt: Number(r.created_at)
  }));
}
