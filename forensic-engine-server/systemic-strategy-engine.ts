/**
 * Systemic Strategy Pathfinding Engine — Service Layer
 * 
 * Connects Pattern Registry + Trend & Pressure Engine to generate
 * recommended strategy paths for systemic issues.
 * 
 * Functions:
 *   selectStrategy(patternType, trendClassification, pressureIndex)
 *   calculateSuccessProbability(historicalRate, pressure, trend, signals, geoSpread)
 *   generateStrategyPath(patternId, strategyId, ...)
 *   evaluatePatternsForStrategies()
 *   updateStepStatus(stepId, status, notes?)
 *   updatePathStatus(pathId, status, approvedBy?)
 *   getStrategyDashboard(filters?)
 *   getStrategyPathDetail(pathId)
 *   getMissionControlStrategySummary()
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── S1. Strategy Selection ──────────────────────────────────────────────────

export async function selectStrategy(
  patternType: string,
  trendClassification: string,
  pressureIndex: number
): Promise<{
  strategyId: string;
  strategyName: string;
  strategyType: string;
  description: string;
  leadAgency: string;
  supportingAgencies: any;
  baseCostEstimate: number;
  baseDurationDays: number;
  historicalSuccessRate: number;
  avgImpactScore: number;
  primaryLaws: any;
  selectionRuleId: number;
  priorityRank: number;
} | null> {
  const [rules] = await db.execute(sql`
    SELECT r.rule_id, r.recommended_strategy_id, r.recommended_strategy_name, r.priority_rank,
           s.strategy_id, s.strategy_name, s.strategy_type, s.strategy_description,
           s.lead_agency, s.supporting_agencies, s.base_cost_estimate, s.base_duration_days,
           s.historical_success_rate, s.avg_impact_score, s.primary_laws
    FROM strategy_selection_rules r
    JOIN strategy_registry s ON r.recommended_strategy_id = s.strategy_id
    WHERE r.pattern_type = ${patternType}
      AND r.trend_classification = ${trendClassification}
      AND r.min_pressure_index <= ${pressureIndex}
      AND r.is_active = TRUE
      AND s.is_active = TRUE
    ORDER BY r.priority_rank ASC
    LIMIT 1
  `);

  const rows = rules as unknown as any[];
  if (!rows.length) return null;

  const row = rows[0];
  return {
    strategyId: row.strategy_id,
    strategyName: row.strategy_name,
    strategyType: row.strategy_type,
    description: row.strategy_description,
    leadAgency: row.lead_agency,
    supportingAgencies: typeof row.supporting_agencies === "string" ? JSON.parse(row.supporting_agencies) : row.supporting_agencies,
    baseCostEstimate: Number(row.base_cost_estimate),
    baseDurationDays: row.base_duration_days,
    historicalSuccessRate: Number(row.historical_success_rate),
    avgImpactScore: row.avg_impact_score,
    primaryLaws: typeof row.primary_laws === "string" ? JSON.parse(row.primary_laws) : row.primary_laws,
    selectionRuleId: row.rule_id,
    priorityRank: row.priority_rank,
  };
}

// ─── S2. Success Probability Calculation ─────────────────────────────────────

/**
 * Calculate success probability for a strategy applied to a specific pattern.
 * Uses historical success rates, pattern characteristics, and trend data.
 * 
 * Factors:
 *   base: historicalSuccessRate (0-100)
 *   pressureModifier: high pressure reduces probability
 *   trendModifier: critical/accelerating reduce, declining increases
 *   signalModifier: high signal count reduces (complexity)
 *   geoModifier: wide geographic spread reduces
 * 
 * Returns: clamped 0-100 integer
 */
export function calculateSuccessProbability(
  historicalSuccessRate: number,
  pressureIndex: number,
  trendClassification: string,
  signalCount: number,
  geographicSpread: number
): number {
  let probability = historicalSuccessRate;

  // Pressure modifier: high pressure reduces success probability
  if (pressureIndex >= 85) probability -= 15;
  else if (pressureIndex >= 70) probability -= 10;
  else if (pressureIndex >= 50) probability -= 5;
  else if (pressureIndex < 30) probability += 5;

  // Trend modifier
  switch (trendClassification) {
    case "critical": probability -= 20; break;
    case "accelerating": probability -= 10; break;
    case "emerging": probability -= 5; break;
    case "stable": break; // no change
    case "declining": probability += 10; break;
  }

  // Signal count modifier: complexity
  if (signalCount > 100) probability -= 15;
  else if (signalCount > 50) probability -= 10;
  else if (signalCount > 20) probability -= 5;

  // Geographic spread modifier
  if (geographicSpread > 10) probability -= 10;
  else if (geographicSpread > 5) probability -= 5;

  return Math.max(0, Math.min(100, Math.round(probability)));
}

// ─── S3. Strategy Path Generation ────────────────────────────────────────────

export async function generateStrategyPath(params: {
  patternId: string;
  strategyId: string;
  pathName: string;
  pathDescription?: string;
  trendClassification: string;
  pressureIndex: number;
  signalCount: number;
  geographicScope?: any;
  assignedLead?: string;
}): Promise<{ pathId: string; steps: string[] }> {
  const pathId = randomUUID();

  // Get strategy details for cost/duration estimation
  const [stratRows] = await db.execute(sql`
    SELECT base_cost_estimate, base_duration_days, historical_success_rate
    FROM strategy_registry WHERE strategy_id = ${params.strategyId}
  `);
  const strat = (stratRows as unknown as any[])[0];
  const successProb = calculateSuccessProbability(
    Number(strat?.historical_success_rate || 50),
    params.pressureIndex,
    params.trendClassification,
    params.signalCount,
    Array.isArray(params.geographicScope) ? params.geographicScope.length : 1
  );

  await db.execute(sql`
    INSERT INTO sys_strategy_paths (
      path_id, strategy_id, pattern_id, path_name, path_description,
      trend_classification_at_creation, pressure_index_at_creation,
      signal_count_at_creation, geographic_scope_at_creation,
      estimated_duration_days, estimated_cost, success_probability,
      assigned_lead, path_status
    ) VALUES (
      ${pathId}, ${params.strategyId}, ${params.patternId},
      ${params.pathName}, ${params.pathDescription || null},
      ${params.trendClassification}, ${params.pressureIndex},
      ${params.signalCount}, ${JSON.stringify(params.geographicScope || [])},
      ${strat?.base_duration_days || 90}, ${strat?.base_cost_estimate || "0"},
      ${successProb}, ${params.assignedLead || null}, 'proposed'
    )
  `);

  // Generate default strategy steps based on strategy type
  const [typeRows] = await db.execute(sql`
    SELECT strategy_type FROM strategy_registry WHERE strategy_id = ${params.strategyId}
  `);
  const strategyType = (typeRows as unknown as any[])[0]?.strategy_type || "investigation";
  const steps = getDefaultStepsForType(strategyType);
  const stepIds: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const stepId = randomUUID();
    stepIds.push(stepId);
    await db.execute(sql`
      INSERT INTO strategy_steps (
        step_id, path_id, step_number, step_name, step_description,
        step_type, responsible_party, estimated_duration_days, step_status
      ) VALUES (
        ${stepId}, ${pathId}, ${i + 1}, ${steps[i].name}, ${steps[i].description},
        ${steps[i].type}, ${steps[i].responsible}, ${steps[i].duration}, 'pending'
      )
    `);
  }

  return { pathId, steps: stepIds };
}

function getDefaultStepsForType(strategyType: string): Array<{
  name: string; description: string; type: string; responsible: string; duration: number;
}> {
  const baseSteps = [
    { name: "Initial Assessment", description: "Review pattern data and confirm strategy applicability", type: "assessment", responsible: "Lead Analyst", duration: 7 },
    { name: "Stakeholder Notification", description: "Notify relevant agencies and stakeholders", type: "communication", responsible: "Lead Agency", duration: 5 },
    { name: "Evidence Compilation", description: "Compile supporting evidence and documentation", type: "documentation", responsible: "Investigation Team", duration: 14 },
  ];

  switch (strategyType) {
    case "enforcement":
      return [...baseSteps,
        { name: "Legal Review", description: "Review legal authority and prepare enforcement action", type: "legal", responsible: "Legal Counsel", duration: 14 },
        { name: "Enforcement Action", description: "Execute enforcement measures", type: "enforcement", responsible: "Lead Agency", duration: 30 },
        { name: "Compliance Monitoring", description: "Monitor compliance with enforcement orders", type: "monitoring", responsible: "Compliance Team", duration: 60 },
        { name: "Outcome Assessment", description: "Assess effectiveness and document results", type: "assessment", responsible: "Lead Analyst", duration: 14 },
      ];
    case "investigation":
      return [...baseSteps,
        { name: "Investigation Plan", description: "Develop detailed investigation plan", type: "planning", responsible: "Lead Investigator", duration: 10 },
        { name: "Field Investigation", description: "Conduct field investigation and interviews", type: "investigation", responsible: "Investigation Team", duration: 30 },
        { name: "Report Preparation", description: "Prepare investigation report with findings", type: "documentation", responsible: "Lead Investigator", duration: 14 },
        { name: "Outcome Assessment", description: "Assess effectiveness and document results", type: "assessment", responsible: "Lead Analyst", duration: 7 },
      ];
    case "regulatory":
      return [...baseSteps,
        { name: "Regulatory Analysis", description: "Analyze applicable regulations and compliance gaps", type: "analysis", responsible: "Regulatory Specialist", duration: 14 },
        { name: "Regulatory Action", description: "Issue regulatory notices or orders", type: "regulatory", responsible: "Regulatory Authority", duration: 21 },
        { name: "Compliance Verification", description: "Verify compliance with regulatory requirements", type: "monitoring", responsible: "Compliance Team", duration: 30 },
        { name: "Outcome Assessment", description: "Assess effectiveness and document results", type: "assessment", responsible: "Lead Analyst", duration: 7 },
      ];
    case "emergency":
      return [
        { name: "Emergency Assessment", description: "Rapid assessment of emergency conditions", type: "assessment", responsible: "Emergency Response Lead", duration: 1 },
        { name: "Immediate Action", description: "Execute emergency protective measures", type: "enforcement", responsible: "Lead Agency", duration: 3 },
        { name: "Stakeholder Alert", description: "Alert all relevant stakeholders and agencies", type: "communication", responsible: "Communications Team", duration: 1 },
        { name: "Evidence Preservation", description: "Preserve evidence and document conditions", type: "documentation", responsible: "Investigation Team", duration: 7 },
        { name: "Sustained Response", description: "Maintain emergency response and monitoring", type: "monitoring", responsible: "Response Team", duration: 30 },
        { name: "Transition to Standard", description: "Transition from emergency to standard enforcement", type: "planning", responsible: "Lead Agency", duration: 14 },
        { name: "Outcome Assessment", description: "Assess emergency response effectiveness", type: "assessment", responsible: "Lead Analyst", duration: 7 },
      ];
    default: // administrative
      return [...baseSteps,
        { name: "Process Review", description: "Review current processes and identify improvements", type: "analysis", responsible: "Process Analyst", duration: 21 },
        { name: "Recommendation Report", description: "Prepare recommendations for process improvements", type: "documentation", responsible: "Lead Analyst", duration: 14 },
        { name: "Implementation", description: "Implement approved process changes", type: "implementation", responsible: "Agency Staff", duration: 30 },
        { name: "Outcome Assessment", description: "Assess effectiveness of changes", type: "assessment", responsible: "Lead Analyst", duration: 14 },
      ];
  }
}

// ─── S4. Evaluate All Patterns for Strategies ────────────────────────────────

export async function evaluatePatternsForStrategies(): Promise<{
  evaluated: number;
  strategiesGenerated: number;
  results: Array<{ patternId: string; patternName: string; strategyName: string | null; pathId: string | null }>;
}> {
  // Get active patterns that don't already have an active strategy path
  const [patterns] = await db.execute(sql`
    SELECT pr.pattern_id, pr.pattern_name, pr.pattern_type, pr.signal_count,
           tr.trend_classification, tr.pressure_index, pr.geographic_spread
    FROM pattern_registry pr
    LEFT JOIN trend_registry tr ON pr.pattern_id = tr.pattern_id
    WHERE pr.decay_status != 'decayed'
      AND pr.pattern_id NOT IN (
        SELECT DISTINCT pattern_id FROM sys_strategy_paths
        WHERE path_status IN ('proposed', 'approved', 'in_progress')
      )
    ORDER BY COALESCE(tr.pressure_index, 0) DESC
    LIMIT 20
  `);

  const results: Array<{ patternId: string; patternName: string; strategyName: string | null; pathId: string | null }> = [];
  let strategiesGenerated = 0;

  for (const p of patterns as unknown as any[]) {
    const trend = p.trend_classification || "stable";
    const pressure = p.pressure_index || 50;
    const strategy = await selectStrategy(p.pattern_type, trend, pressure);

    if (strategy) {
      const { pathId } = await generateStrategyPath({
        patternId: p.pattern_id,
        strategyId: strategy.strategyId,
        pathName: `${strategy.strategyName} — ${p.pattern_name}`,
        trendClassification: trend,
        pressureIndex: pressure,
        signalCount: p.signal_count || 0,
        geographicScope: [],
      });
      results.push({ patternId: p.pattern_id, patternName: p.pattern_name, strategyName: strategy.strategyName, pathId });
      strategiesGenerated++;
    } else {
      results.push({ patternId: p.pattern_id, patternName: p.pattern_name, strategyName: null, pathId: null });
    }
  }

  return { evaluated: (patterns as unknown as any[]).length, strategiesGenerated, results };
}

// ─── S5. Step & Path Status Updates ──────────────────────────────────────────

export async function updateStepStatus(
  stepId: string,
  status: string,
  notes?: string
): Promise<{ success: boolean }> {
  const now = new Date();
  if (status === "in_progress") {
    await db.execute(sql`
      UPDATE strategy_steps SET step_status = ${status}, started_at = ${now},
        notes = COALESCE(${notes || null}, notes), updated_at = ${now}
      WHERE step_id = ${stepId}
    `);
  } else if (status === "completed") {
    await db.execute(sql`
      UPDATE strategy_steps SET step_status = ${status}, completed_at = ${now},
        notes = COALESCE(${notes || null}, notes), updated_at = ${now}
      WHERE step_id = ${stepId}
    `);
  } else {
    await db.execute(sql`
      UPDATE strategy_steps SET step_status = ${status},
        notes = COALESCE(${notes || null}, notes), updated_at = ${now}
      WHERE step_id = ${stepId}
    `);
  }
  return { success: true };
}

export async function updatePathStatus(
  pathId: string,
  status: string,
  approvedBy?: string
): Promise<{ success: boolean }> {
  const now = new Date();
  if (status === "approved") {
    await db.execute(sql`
      UPDATE sys_strategy_paths SET path_status = ${status},
        approved_by = ${approvedBy || null}, approved_at = ${now}, updated_at = ${now}
      WHERE path_id = ${pathId}
    `);
  } else if (status === "in_progress") {
    await db.execute(sql`
      UPDATE sys_strategy_paths SET path_status = ${status},
        started_at = ${now}, updated_at = ${now}
      WHERE path_id = ${pathId}
    `);
  } else if (status === "completed") {
    await db.execute(sql`
      UPDATE sys_strategy_paths SET path_status = ${status},
        completed_at = ${now}, updated_at = ${now}
      WHERE path_id = ${pathId}
    `);
  } else {
    await db.execute(sql`
      UPDATE sys_strategy_paths SET path_status = ${status}, updated_at = ${now}
      WHERE path_id = ${pathId}
    `);
  }
  return { success: true };
}

// ─── S6. Dashboard Queries ───────────────────────────────────────────────────

export async function getStrategyDashboard(filters?: {
  status?: string;
  strategyType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ paths: any[]; total: number }> {
  const [rows] = await db.execute(sql`
    SELECT sp.path_id, sp.path_name, sp.path_status, sp.estimated_duration_days,
           sp.estimated_cost, sp.success_probability, sp.created_at,
           sp.trend_classification_at_creation, sp.pressure_index_at_creation,
           sp.signal_count_at_creation, sp.assigned_lead,
           sr.strategy_name, sr.strategy_type, sr.lead_agency,
           pr.pattern_type, pr.pattern_name, pr.confidence_score, pr.signal_count,
           (SELECT COUNT(*) FROM strategy_steps ss WHERE ss.path_id = sp.path_id) as total_steps
    FROM sys_strategy_paths sp
    JOIN strategy_registry sr ON sp.strategy_id = sr.strategy_id
    LEFT JOIN pattern_registry pr ON sp.pattern_id = pr.pattern_id
    ORDER BY sp.created_at DESC
    LIMIT 50
  `);

  const [countRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM sys_strategy_paths`);
  const total = Number((countRows as unknown as any[])[0]?.cnt) || 0;

  return { paths: rows as unknown as any[], total };
}

export async function getStrategyPathDetail(pathId: string): Promise<{
  path: any;
  steps: any[];
  strategy: any;
  pattern: any;
}> {
  const [pathRows] = await db.execute(sql`
    SELECT sp.*, sr.strategy_name, sr.strategy_type, sr.lead_agency,
           sr.supporting_agencies, sr.primary_laws, sr.strategy_description,
           pr.pattern_name, pr.pattern_type, pr.confidence_score
    FROM sys_strategy_paths sp
    JOIN strategy_registry sr ON sp.strategy_id = sr.strategy_id
    LEFT JOIN pattern_registry pr ON sp.pattern_id = pr.pattern_id
    WHERE sp.path_id = ${pathId}
  `);

  const [stepRows] = await db.execute(sql`
    SELECT * FROM strategy_steps WHERE path_id = ${pathId} ORDER BY step_number ASC
  `);

  const path = (pathRows as unknown as any[])[0] || null;
  return {
    path,
    steps: stepRows as unknown as any[],
    strategy: path ? {
      strategyName: path.strategy_name,
      strategyType: path.strategy_type,
      leadAgency: path.lead_agency,
      supportingAgencies: path.supporting_agencies,
      primaryLaws: path.primary_laws,
      description: path.strategy_description,
    } : null,
    pattern: path ? {
      patternName: path.pattern_name,
      patternType: path.pattern_type,
      confidenceScore: path.confidence_score,
    } : null,
  };
}

export async function getMissionControlStrategySummary(): Promise<{
  totalPaths: number;
  proposed: number;
  approved: number;
  inProgress: number;
  completed: number;
  avgSuccessProbability: number;
  totalEstimatedCost: number;
  strategiesByType: Array<{ type: string; count: number }>;
}> {
  const [summaryRows] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN path_status = 'proposed' THEN 1 ELSE 0 END) as proposed,
      SUM(CASE WHEN path_status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN path_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN path_status = 'completed' THEN 1 ELSE 0 END) as completed,
      AVG(success_probability) as avg_probability,
      SUM(COALESCE(estimated_cost, 0)) as total_cost
    FROM sys_strategy_paths
  `);
  const s = (summaryRows as unknown as any[])[0] || {};

  const [typeRows] = await db.execute(sql`
    SELECT sr.strategy_type as type, COUNT(*) as count
    FROM sys_strategy_paths sp
    JOIN strategy_registry sr ON sp.strategy_id = sr.strategy_id
    GROUP BY sr.strategy_type
    ORDER BY count DESC
  `);

  return {
    totalPaths: Number(s.total) || 0,
    proposed: Number(s.proposed) || 0,
    approved: Number(s.approved) || 0,
    inProgress: Number(s.in_progress) || 0,
    completed: Number(s.completed) || 0,
    avgSuccessProbability: Math.round(Number(s.avg_probability) || 0),
    totalEstimatedCost: Number(s.total_cost) || 0,
    strategiesByType: (typeRows as unknown as any[]).map((r: any) => ({
      type: r.type,
      count: Number(r.count),
    })),
  };
}
