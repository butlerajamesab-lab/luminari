/**
 * Signal Governance Service
 * 
 * Implements the enhanced signal governance layer:
 * T1. Confidence scoring (0-100) using weighted factor model
 * T2. Dataset provenance tracking
 * T3. Signal audit logging (generation steps, verification, factor breakdown)
 * T4. Escalation tier assignment
 * T5. Extended signal explanation templates
 * 
 * This layer governs interpretation, confidence scoring, and provenance tracking.
 * It does NOT modify the signal detection logic itself.
 * 
 * NOTE: The DB tables use two naming conventions:
 *   - Old tables (detected_signals, confidence_factors, etc.): snake_case columns
 *   - New tables (escalation_thresholds, knowledge_*): camelCase columns
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────

export interface ConfidenceFactor {
  id: number;
  factorName: string;
  weight: number;
  description: string;
  scoringRules: Record<string, unknown> | null;
  version: string | null;
}

export interface ConfidenceBreakdown {
  factorName: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  rationale: string;
}

export interface ConfidenceResult {
  totalScore: number;
  tier: EscalationTier;
  breakdown: ConfidenceBreakdown[];
  verificationStatus: "verified" | "partial" | "unverified";
}

export interface EscalationTier {
  tierName: string;
  minScore: number;
  maxScore: number;
  action: string;
  notifyRoles: string[];
  autoEscalate: boolean;
}

export interface ExtendedTemplate {
  templateId: string;
  signalType: string;
  templateText: string;
  severityLevel: string | null;
  confidenceRequired: number;
  verificationMethod: string | null;
  falsePositiveRisks: string | null;
}

export interface DetectedSignalInput {
  signalType: string;
  datasetId: string;
  ingestRunId?: number;
  title: string;
  explanation?: string;
  severityLevel: string;
  jurisdictionScope?: string;
  statisticalContext?: Record<string, unknown>;
  sourceRecordIds?: string[];
  // Scoring inputs
  sampleSize?: number;
  recordCount?: number;
  temporalSpan?: number; // in days
  geographicScope?: string;
  hasCorroboration?: boolean;
  dataQuality?: number; // 0-100
  // Gate enforcement: required linkage to sunam_gate_log
  gateLogId: number;
}

export interface GovernedSignal {
  signalId: string;
  signalType: string;
  datasetId: string;
  ingestRunId: number | null;
  title: string;
  explanation: string;
  confidenceScore: number;
  severityLevel: string;
  jurisdictionScope: string | null;
  statisticalContext: Record<string, unknown> | null;
  sourceRecordIds: string[] | null;
  extractionTimestamp: number;
  escalationTier: string;
  templateUsed: string | null;
}

// ─── Confidence Factor Loading ──────────────────────────────────

let cachedFactors: ConfidenceFactor[] | null = null;
let cachedTiers: EscalationTier[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

async function loadFactors(): Promise<ConfidenceFactor[]> {
  if (cachedFactors && Date.now() - cacheTimestamp < CACHE_TTL) return cachedFactors;
  try {
    const rows = await db.execute(
      sql`SELECT id, factorName, weight, description, scoringRules, version FROM confidence_factors ORDER BY id`
    );
    const arr = (rows as any)[0];
    if (!arr || arr.length === 0) {
      cachedFactors = [];
      cacheTimestamp = Date.now();
      return cachedFactors;
    }
    cachedFactors = arr.map((r: any) => ({
      id: r.id,
      factorName: r.factorName,
      weight: parseFloat(r.weight),
      description: r.description,
      scoringRules: typeof r.scoringRules === 'string' ? JSON.parse(r.scoringRules) : (r.scoringRules || null),
      version: r.version || null,
    }));
    cacheTimestamp = Date.now();
    return cachedFactors!;
  } catch (err) {
    console.error('[SignalGovernance] loadFactors error, returning empty:', (err as Error).message);
    cachedFactors = [];
    cacheTimestamp = Date.now();
    return cachedFactors;
  }
}

async function loadTiers(): Promise<EscalationTier[]> {
  if (cachedTiers && Date.now() - cacheTimestamp < CACHE_TTL) return cachedTiers;
  const rows = await db.execute(
    sql`SELECT * FROM escalation_thresholds ORDER BY minScore DESC`
  );
  cachedTiers = (rows as any)[0].map((r: any) => ({
    tierName: r.tierName,
    minScore: r.minScore,
    maxScore: r.maxScore,
    action: r.action,
    notifyRoles: typeof r.notifyRoles === "string" ? JSON.parse(r.notifyRoles) : (r.notifyRoles || []),
    autoEscalate: Boolean(r.autoEscalate),
  }));
  return cachedTiers!;
}

// ─── T1. Confidence Scoring ─────────────────────────────────────

/**
 * Calculate signal confidence score (0-100) using the weighted factor model.
 * 
 * Loads factors from confidence_factors table, scores each factor based on
 * the signal input, and produces a weighted sum.
 * 
 * Factor scoring uses heuristic rules based on factor_name:
 * - entity_resolution_confidence, entity_classification_confidence → entity quality
 * - temporal_density → temporal consistency
 * - complaint_severity_consistency → data quality
 * - geographic_dispersion → geographic scope
 * - baseline_adjustment → statistical significance
 * - donor_disclosure_gap, expenditure_timing_pattern → corroboration
 * - entity_network_analysis → cross-validation
 */
export async function calculateSignalConfidence(
  input: DetectedSignalInput
): Promise<ConfidenceResult> {
  const factors = await loadFactors();
  const tiers = await loadTiers();
  const breakdown: ConfidenceBreakdown[] = [];

  // Use all factors (the table no longer has a signalType column)
  const scoringFactors = factors;
  const totalWeight = scoringFactors.reduce((sum, f) => sum + f.weight, 0);

  for (const factor of scoringFactors) {
    const normalizedWeight = totalWeight > 0 ? factor.weight / totalWeight : 1 / scoringFactors.length;
    const { rawScore, rationale } = scoreFactor(factor, input);
    breakdown.push({
      factorName: factor.factorName,
      weight: normalizedWeight,
      rawScore,
      weightedScore: Math.round(rawScore * normalizedWeight * 100) / 100,
      rationale,
    });
  }

  const totalScore = Math.min(100, Math.max(0,
    Math.round(breakdown.reduce((sum, b) => sum + b.weightedScore, 0))
  ));

  const tier = tiers.find(t => totalScore >= t.minScore && totalScore <= t.maxScore)
    || { tierName: "monitoring_only", minScore: 0, maxScore: 50, action: "Log and monitor", notifyRoles: [], autoEscalate: false };

  const verifiedCount = breakdown.filter(b => b.rawScore >= 60).length;
  const verificationStatus: ConfidenceResult["verificationStatus"] =
    verifiedCount >= scoringFactors.length * 0.8 ? "verified" :
    verifiedCount >= scoringFactors.length * 0.5 ? "partial" : "unverified";

  return { totalScore, tier, breakdown, verificationStatus };
}

function scoreFactor(factor: ConfidenceFactor, input: DetectedSignalInput): { rawScore: number; rationale: string } {
  const name = factor.factorName.toLowerCase();

  // Entity resolution / classification confidence
  if (name.includes("entity_resolution") || name.includes("entity_classification")) {
    const n = input.sampleSize || input.recordCount || 0;
    if (n >= 1000) return { rawScore: 95, rationale: `Entity pool ${n} — excellent resolution confidence` };
    if (n >= 100) return { rawScore: 75, rationale: `Entity pool ${n} — good resolution confidence` };
    if (n >= 10) return { rawScore: 50, rationale: `Entity pool ${n} — minimum resolution confidence` };
    return { rawScore: 20, rationale: `Entity pool ${n} — low resolution confidence` };
  }

  // Temporal density
  if (name.includes("temporal")) {
    const span = input.temporalSpan || 0;
    if (span >= 365) return { rawScore: 90, rationale: `Temporal span ${span} days — long-term density` };
    if (span >= 90) return { rawScore: 70, rationale: `Temporal span ${span} days — medium-term density` };
    if (span >= 30) return { rawScore: 50, rationale: `Temporal span ${span} days — short-term density` };
    return { rawScore: 25, rationale: `Temporal span ${span} days — insufficient density` };
  }

  // Complaint severity consistency / data quality
  if (name.includes("severity") || name.includes("quality")) {
    const quality = input.dataQuality || 50;
    return { rawScore: quality, rationale: `Data quality/severity consistency score: ${quality}/100` };
  }

  // Geographic dispersion
  if (name.includes("geographic")) {
    const scope = input.geographicScope || input.jurisdictionScope || "unknown";
    if (scope === "national" || scope === "statewide") return { rawScore: 90, rationale: `Geographic scope: ${scope}` };
    if (scope === "regional" || scope === "multi_county") return { rawScore: 70, rationale: `Geographic scope: ${scope}` };
    if (scope === "local" || scope === "county") return { rawScore: 50, rationale: `Geographic scope: ${scope}` };
    return { rawScore: 30, rationale: `Geographic scope: ${scope} — limited` };
  }

  // Baseline adjustment / statistical significance
  if (name.includes("baseline")) {
    const ctx = input.statisticalContext as any;
    if (ctx?.deviation && ctx.deviation >= 3) return { rawScore: 95, rationale: `Deviation ${ctx.deviation}σ — highly significant` };
    if (ctx?.deviation && ctx.deviation >= 2) return { rawScore: 75, rationale: `Deviation ${ctx.deviation}σ — significant` };
    if (ctx?.deviation && ctx.deviation >= 1.5) return { rawScore: 55, rationale: `Deviation ${ctx.deviation}σ — marginally significant` };
    if (ctx?.percentChange && Math.abs(ctx.percentChange) >= 50) return { rawScore: 70, rationale: `${ctx.percentChange}% change — notable` };
    return { rawScore: 40, rationale: "Statistical significance not determinable from available context" };
  }

  // Donor disclosure gap / expenditure timing / corroboration
  if (name.includes("disclosure") || name.includes("expenditure") || name.includes("network")) {
    if (input.hasCorroboration) return { rawScore: 85, rationale: "Signal corroborated by additional data source" };
    return { rawScore: 35, rationale: "No cross-dataset corroboration available" };
  }

  // Default
  return { rawScore: 50, rationale: `Default score for factor: ${factor.factorName}` };
}

// ─── T2. Dataset Provenance ─────────────────────────────────────

export async function getProvenance(datasetId: string): Promise<Record<string, unknown> | null> {
  const rows = await db.execute(
    sql`SELECT * FROM dataset_provenance WHERE datasetId = ${datasetId} LIMIT 1`
  );
  const arr = (rows as any)[0];
  return arr.length > 0 ? arr[0] : null;
}

export async function updateProvenance(
  datasetId: string,
  updates: { lastFetched?: number; recordCount?: number; qualityScore?: number }
): Promise<void> {
  const setClauses: string[] = [];
  if (updates.lastFetched !== undefined) setClauses.push(`lastFetched = ${updates.lastFetched}`);
  if (updates.recordCount !== undefined) setClauses.push(`recordCount = ${updates.recordCount}`);
  if (updates.qualityScore !== undefined) setClauses.push(`qualityScore = ${updates.qualityScore}`);
  if (setClauses.length === 0) return;

  try {
    await db.execute(
      sql.raw(`UPDATE dataset_provenance SET ${setClauses.join(", ")} WHERE datasetId = '${datasetId}'`)
    );
  } catch (err) {
    console.error('[SignalGovernance] updateProvenance error (non-fatal):', (err as Error).message);
  }
}

// ─── T3. Signal Storage & Audit Logging ─────────────────────────

function generateSignalId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "sig-";
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Store a governed signal in the detected_signals table and log the generation steps.
 * This is the main entry point for the governance layer.
 * 
 * Uses the actual DB column names (snake_case) for detected_signals and signal_generation_log.
 */
export async function storeGovernedSignal(
  input: DetectedSignalInput
): Promise<GovernedSignal> {
  // GATE ENFORCEMENT: reject any write without a valid gate_log linkage
  if (!input.gateLogId || typeof input.gateLogId !== 'number' || input.gateLogId <= 0) {
    throw new Error(
      `[GATE ENFORCEMENT] storeGovernedSignal rejected: gateLogId is required. ` +
      `Received: ${JSON.stringify(input.gateLogId)}. ` +
      `All writes to detected_signals must originate from a Sunam gate decision.`
    );
  }
  const signalId = generateSignalId();
  const now = Date.now();

  // T1. Calculate confidence
  const confidence = await calculateSignalConfidence(input);

  // T5. Find matching template
  const template = await findTemplate(input.signalType);
  const explanation = template
    ? renderTemplate(template.templateText, input)
    : (input.explanation || `${input.signalType} signal detected in dataset ${input.datasetId}`);

  // T4. Determine escalation tier
  const escalationTier = confidence.tier.tierName;

  // Store the signal — detected_signals has BOTH camelCase and snake_case columns (both NOT NULL)
  // We must populate both sets to avoid NOT NULL constraint violations
  await db.execute(sql`
    INSERT INTO detected_signals
      (signal_id, signal_type, dataset_id, detection_timestamp, confidence_score,
       source_record_ids, extraction_timestamp, jurisdiction_scope, severity_level,
       plain_language_explanation, escalation_status, created_at, updated_at,
       gate_decision_id,
       signalType, datasetId, confidenceScore, severity, title, explanation,
       jurisdiction, detectedAt, createdAt, sunam_status)
    VALUES
      (${signalId}, ${input.signalType}, ${input.datasetId}, ${now}, ${confidence.totalScore},
       ${JSON.stringify(input.sourceRecordIds || [])}, ${now},
       ${input.jurisdictionScope || null}, ${input.severityLevel},
       ${explanation}, ${escalationTier}, ${now}, ${now},
       ${input.gateLogId},
       ${input.signalType}, ${input.datasetId || ''}, ${confidence.totalScore}, ${input.severityLevel}, ${input.title}, ${explanation},
       ${input.jurisdictionScope || null}, ${now}, ${now}, ${'governed'})
  `);

  // T3. Log generation steps using actual DB column names
  await logGenerationStep(signalId, "confidence_calculation", template?.templateId || null, {
    inputFactors: {
      sampleSize: input.sampleSize,
      temporalSpan: input.temporalSpan,
      geographicScope: input.geographicScope,
      dataQuality: input.dataQuality,
      hasCorroboration: input.hasCorroboration,
    },
  }, confidence.verificationStatus, confidence.breakdown);

  await logGenerationStep(signalId, "escalation_assignment", null, {
    confidenceScore: confidence.totalScore,
    assignedTier: escalationTier,
    tierAction: confidence.tier.action,
  }, "verified", null);

  if (template) {
    await logGenerationStep(signalId, "template_rendering", template.templateId, {
      signalType: input.signalType,
      datasetId: input.datasetId,
      confidenceRequired: template.confidenceRequired,
      meetsThreshold: confidence.totalScore >= template.confidenceRequired,
    }, confidence.totalScore >= template.confidenceRequired ? "verified" : "partial", null);
  }

  // T2. Update provenance
  if (input.datasetId) {
    await updateProvenance(input.datasetId, { lastFetched: now });
  }

  return {
    signalId,
    signalType: input.signalType,
    datasetId: input.datasetId,
    ingestRunId: input.ingestRunId || null,
    title: input.title,
    explanation,
    confidenceScore: confidence.totalScore,
    severityLevel: input.severityLevel,
    jurisdictionScope: input.jurisdictionScope || null,
    statisticalContext: input.statisticalContext || null,
    sourceRecordIds: input.sourceRecordIds || null,
    extractionTimestamp: now,
    escalationTier,
    templateUsed: template?.templateId || null,
  };
}

async function logGenerationStep(
  signalId: string,
  stepName: string,
  templateUsed: string | null,
  parameters: Record<string, unknown>,
  verificationResult: string,
  factorBreakdown: ConfidenceBreakdown[] | null
): Promise<void> {
  // template_id is INT in the DB, verification_results is JSON
  const templateIdInt = templateUsed ? parseInt(templateUsed, 10) || null : null;
  const verificationJson = JSON.stringify({ status: verificationResult });
  const factorsJson = factorBreakdown ? JSON.stringify(factorBreakdown) : null;
  const paramsJson = JSON.stringify(parameters);
  try {
    await db.execute(sql`
      INSERT INTO signal_generation_log
        (signalId, stepName, templateUsed, parameters, verificationResult, factorBreakdown, createdAt, timestamp)
      VALUES
        (${signalId}, ${stepName}, ${templateUsed || null}, ${paramsJson},
         ${verificationResult}, ${factorsJson}, ${Date.now()}, ${Date.now()})
    `);
  } catch (err) {
    console.error('[SignalGovernance] logGenerationStep error (non-fatal):', (err as Error).message);
  }
}

// ─── T5. Extended Templates ─────────────────────────────────────

async function findTemplate(signalType: string): Promise<ExtendedTemplate | null> {
  try {
    const rows = await db.execute(
      sql`SELECT * FROM signal_explanations_extended
          WHERE signalType = ${signalType}
          LIMIT 1`
    );
    const arr = (rows as any)[0];
    if (!arr || arr.length === 0) return null;
    return parseTemplate(arr[0]);
  } catch (err) {
    console.error('[SignalGovernance] findTemplate error, returning null:', (err as Error).message);
    return null;
  }
}

function parseTemplate(row: any): ExtendedTemplate {
  return {
    templateId: row.templateId,
    signalType: row.signalType,
    templateText: row.templateText,
    severityLevel: row.severityLevel || null,
    confidenceRequired: row.confidenceRequired || 0,
    verificationMethod: row.verificationMethod || null,
    falsePositiveRisks: typeof row.falsePositiveRisks === 'string' ? row.falsePositiveRisks : JSON.stringify(row.falsePositiveRisks || null),
  };
}

function renderTemplate(template: string, input: DetectedSignalInput): string {
  return template
    .replace(/\{signal_type\}/g, input.signalType)
    .replace(/\{dataset_id\}/g, input.datasetId)
    .replace(/\{severity\}/g, input.severityLevel)
    .replace(/\{jurisdiction\}/g, input.jurisdictionScope || "unknown")
    .replace(/\{title\}/g, input.title)
    .replace(/\{sample_size\}/g, String(input.sampleSize || "N/A"))
    .replace(/\{record_count\}/g, String(input.recordCount || "N/A"));
}

// ─── Dashboard Queries ──────────────────────────────────────────

export interface SignalDashboardEntry {
  signalId: string;
  signalType: string;
  datasetId: string;
  title: string;
  explanation: string | null;
  confidenceScore: number;
  severityLevel: string;
  jurisdictionScope: string | null;
  escalationTier: string | null;
  extractionTimestamp: number;
  sourceName: string | null;
  sourceJurisdiction: string | null;
}

/**
 * Query signals for the dashboard view, ranked by confidence score, severity, and timestamp.
 * Uses actual DB column names (snake_case).
 */
export async function getSignalDashboard(opts?: {
  datasetId?: string;
  severityLevel?: string;
  escalationTier?: string;
  minConfidence?: number;
  governedOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ signals: SignalDashboardEntry[]; total: number }> {
  const conditions: string[] = [];
  if (opts?.governedOnly) conditions.push(`ds.gate_decision_id IS NOT NULL`);
  if (opts?.datasetId) conditions.push(`COALESCE(ds.datasetId, ds.dataset_id) = '${opts.datasetId}'`);
  if (opts?.severityLevel) conditions.push(`COALESCE(ds.severity, ds.severity_level) = '${opts.severityLevel}'`);
  if (opts?.escalationTier) conditions.push(`ds.escalation_status = '${opts.escalationTier}'`);
  if (opts?.minConfidence) conditions.push(`COALESCE(ds.confidenceScore, ds.confidence_score) >= ${opts.minConfidence}`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;

  const countRows = await db.execute(
    sql.raw(`SELECT COUNT(*) as cnt FROM detected_signals ds ${whereClause}`)
  );
  const total = (countRows as any)[0][0].cnt;

  const rows = await db.execute(
    sql.raw(`
      SELECT ds.id, ds.signal_id, ds.signalType, ds.datasetId,
             ds.title as signal_title,
             COALESCE(ds.plain_language_explanation, ds.explanation) as explanation,
             COALESCE(ds.confidenceScore, ds.confidence_score) as conf_score,
             COALESCE(ds.severity, ds.severity_level) as sev_level,
             COALESCE(ds.jurisdiction, ds.jurisdiction_scope) as juris_scope,
             ds.escalation_status as escalation_tier,
             COALESCE(ds.detectedAt, ds.extraction_timestamp) as detect_ts,
             ds.gate_decision_id, ds.sunam_status, ds.sunamScore,
             dp.sourceName as source_name, dp.jurisdiction as source_jurisdiction
      FROM detected_signals ds
      LEFT JOIN dataset_provenance dp ON ds.datasetId = dp.datasetId
      ${whereClause}
      ORDER BY conf_score DESC,
               CASE sev_level
                 WHEN 'critical' THEN 1
                 WHEN 'high' THEN 2
                 WHEN 'medium' THEN 3
                 WHEN 'low' THEN 4
                 ELSE 5
               END,
               detect_ts DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
  );

  return {
    signals: (rows as any)[0].map((r: any) => ({
      signalId: r.signal_id || `ds-${r.id}`,
      signalType: r.signalType || r.signal_type,
      datasetId: r.datasetId || r.dataset_id,
      title: r.signal_title || r.signalType || r.signal_type,
      explanation: r.explanation,
      confidenceScore: Number(r.conf_score) || 0,
      severityLevel: r.sev_level || 'medium',
      jurisdictionScope: r.juris_scope,
      escalationTier: r.escalation_tier,
      extractionTimestamp: Number(r.detect_ts),
      sourceName: r.source_name,
      sourceJurisdiction: r.source_jurisdiction,
      gateDecisionId: r.gate_decision_id,
      sunamStatus: r.sunam_status,
      sunamScore: r.sunamScore ? Number(r.sunamScore) : null,
    })),
    total,
  };
}

/**
 * Get the audit trail for a specific signal.
 * Uses actual DB column names (snake_case).
 */
export async function getSignalAuditTrail(signalId: string): Promise<{
  signal: GovernedSignal | null;
  generationLog: Array<{
    stepName: string;
    templateUsed: string | null;
    parameters: Record<string, unknown>;
    verificationResult: string;
    factorBreakdown: ConfidenceBreakdown[] | null;
    createdAt: number;
  }>;
}> {
  const signalRows = await db.execute(
    sql`SELECT * FROM detected_signals WHERE signal_id = ${signalId} LIMIT 1`
  );
  const signalArr = (signalRows as any)[0];
  const signal = signalArr.length > 0 ? parseDetectedSignal(signalArr[0]) : null;

  const logRows = await db.execute(
    sql`SELECT * FROM signal_generation_log WHERE signal_id = ${signalId} ORDER BY created_at`
  );
  const generationLog = (logRows as any)[0].map((r: any) => ({
    stepName: r.generation_step,
    templateUsed: r.template_id ? String(r.template_id) : null,
    parameters: typeof r.input_parameters === "string" ? JSON.parse(r.input_parameters) : (r.input_parameters || {}),
    verificationResult: (() => {
      const vr = typeof r.verification_results === "string" ? JSON.parse(r.verification_results) : r.verification_results;
      return vr?.status || (typeof vr === "string" ? vr : "unknown");
    })(),
    factorBreakdown: r.confidence_factors
      ? (typeof r.confidence_factors === "string" ? JSON.parse(r.confidence_factors) : r.confidence_factors)
      : null,
    createdAt: Number(r.created_at),
  }));

  return { signal, generationLog };
}

/**
 * Get escalation tier summary — count of signals per tier.
 */
export async function getEscalationSummary(): Promise<Array<{
  tierName: string;
  action: string;
  signalCount: number;
  autoEscalate: boolean;
}>> {
  const tiers = await loadTiers();
  const results = [];

  for (const tier of tiers) {
    const rows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM detected_signals
          WHERE escalation_status = ${tier.tierName}`
    );
    results.push({
      tierName: tier.tierName,
      action: tier.action,
      signalCount: (rows as any)[0][0].cnt,
      autoEscalate: tier.autoEscalate,
    });
  }

  return results;
}

function parseDetectedSignal(row: any): GovernedSignal {
  return {
    signalId: row.signal_id,
    signalType: row.signal_type,
    datasetId: row.dataset_id,
    ingestRunId: null,
    title: row.signal_type,
    explanation: row.plain_language_explanation || "",
    confidenceScore: row.confidence_score,
    severityLevel: row.severity_level,
    jurisdictionScope: row.jurisdiction_scope,
    statisticalContext: null,
    sourceRecordIds: typeof row.source_record_ids === "string"
      ? JSON.parse(row.source_record_ids) : (row.source_record_ids || null),
    extractionTimestamp: Number(row.extraction_timestamp),
    escalationTier: row.escalation_status,
    templateUsed: null,
  };
}


// ═══════════════════════════════════════════════════════════════════════
// GATE ENFORCEMENT: Single authorized UPDATE path for detected_signals
// ═══════════════════════════════════════════════════════════════════════

/**
 * Update a governed signal's metadata fields.
 * This is the ONLY authorized way to UPDATE detected_signals.
 * 
 * Allowed updates: confidence_score, percentage_change, escalation_status,
 * observed_value, updated_at.
 * 
 * Does NOT allow changing: signal_id, signal_type, dataset_id, gate_decision_id.
 */
export async function updateGovernedSignal(
  signalId: string,
  updates: {
    confidenceScore?: number;
    percentageChange?: number;
    escalationStatus?: string;
    observedValue?: number;
    reason: string; // audit trail: why this update is happening
  }
): Promise<void> {
  if (!signalId) {
    throw new Error("[GATE ENFORCEMENT] updateGovernedSignal: signalId is required");
  }

  const setClauses: string[] = [];
  const now = Date.now();

  if (updates.confidenceScore !== undefined) {
    setClauses.push(`confidence_score = ${updates.confidenceScore}`);
  }
  if (updates.percentageChange !== undefined) {
    setClauses.push(`percentage_change = ${updates.percentageChange}`);
  }
  if (updates.escalationStatus !== undefined) {
    setClauses.push(`escalation_status = '${updates.escalationStatus}'`);
  }
  if (updates.observedValue !== undefined) {
    setClauses.push(`observed_value = ${updates.observedValue}`);
  }
  setClauses.push(`updated_at = ${now}`);

  if (setClauses.length <= 1) {
    // Only updated_at — nothing meaningful to change
    return;
  }

  await db.execute(sql.raw(
    `UPDATE detected_signals SET ${setClauses.join(", ")} WHERE signal_id = '${signalId}'`
  ));

  // Audit log
  console.log(
    `[GATE ENFORCEMENT] updateGovernedSignal: ${signalId} updated. ` +
    `Reason: ${updates.reason}. Fields: ${setClauses.join(", ")}`
  );
}

/**
 * Bulk update percentage_change for signals with expected values.
 * This is the ONLY authorized bulk UPDATE path for detected_signals.
 */
export async function bulkUpdatePercentageChange(): Promise<number> {
  const [result] = await db.execute(sql`
    UPDATE detected_signals
    SET percentage_change = CASE
      WHEN expected_value IS NOT NULL AND expected_value != 0
      THEN ROUND(((observed_value - expected_value) / expected_value) * 100, 2)
      ELSE percentage_change
    END,
    updated_at = ${Date.now()}
    WHERE expected_value IS NOT NULL AND expected_value != 0
  `);
  const affected = (result as any)?.affectedRows || 0;
  console.log(`[GATE ENFORCEMENT] bulkUpdatePercentageChange: ${affected} signals updated`);
  return affected;
}
