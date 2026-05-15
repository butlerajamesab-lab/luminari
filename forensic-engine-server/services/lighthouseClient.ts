/**
 * lighthouseClient.ts
 *
 * Single-responsibility service for all Lighthouse Supabase reads.
 *
 * Architectural contract:
 *   - Consumes ONLY canonical governed views (v_active_patterns, v_active_trends, etc.)
 *   - NEVER reads from substrate tables directly (pattern_registry, trend_registry, etc.)
 *   - NEVER writes to Lighthouse from this client
 *   - Credentials are server-side only — this file must never be imported by frontend code
 *   - All fetches are typed, retried, and audit-logged
 *
 * Canonical views exposed:
 *   v_active_patterns       → getActivePatterns()
 *   v_active_trends         → getActiveTrends()
 *   v_active_strategies     → getActiveStrategies()
 *   v_signal_lineage        → getSignalLineage()
 *   v_gate_decisions        → getGateDecisions()
 *   v_staged_signals        → getStagedSignals()
 *   v_pipeline_health       → getPipelineHealth()
 */

import { ENV } from "../_core/env.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LighthousePattern {
  pattern_id: string;
  pattern_name: string;
  pattern_type: string;
  domain: string | null;
  jurisdiction: string;
  signal_count: number;
  confidence_score: number;
  geographic_spread: number | null;
  time_span_days: number | null;
  decay_status: string;
  first_detected: string;
  last_confirmed: string;
  harm_domains: string[] | null;
  related_laws: string[] | null;
  related_agencies: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface LighthouseTrend {
  trend_id: string;
  pattern_id: string;
  trend_classification: string;
  domain: string | null;
  jurisdiction: string;
  momentum_direction: string;
  pressure_index: number;
  current_signal_count: number;
  current_confidence_score: number;
  growth_rate_7d: number | null;
  growth_rate_30d: number | null;
  growth_rate_90d: number | null;
  forecast_30d_signal_count: number | null;
  forecast_confidence: number | null;
  projected_peak_date: string | null;
  is_current: boolean;
  last_calculated: string;
  created_at: string;
  updated_at: string;
}

export interface LighthouseStrategy {
  id: string;
  strategy_hash: string;
  title: string;
  description: string | null;
  strategy_scope: string;
  urgency_level: string;
  intervention_class: string | null;
  jurisdiction_scope: string | null;
  escalation_template: string | null;
  rule_path: string | null;
  action_eligibility: Record<string, unknown> | null;
  path_status: string;
  trend_id: string | null;
  pattern_id: string | null;
  case_id: string | null;
  created_at: string;
  trend_classification: string | null;
  pressure_index: number | null;
  trend_domain: string | null;
  pattern_name: string | null;
  pattern_signal_count: number | null;
}

export interface LighthouseSignalLineage {
  detected_signal_id: string;
  signal_type: string;
  jurisdiction_raw_value: string;
  confidence_score: number;
  severity: string | null;
  detected_at: string | null;
  source_system: string | null;
  source_connector_id: string | null;
  gate_log_id: string | null;
  gate_decision: string | null;
  gate_composite_score: number | null;
  score_provenance_confidence: number | null;
  score_source_trust_tier: number | null;
  score_jurisdiction_validity: number | null;
  score_temporal_relevance: number | null;
  score_duplicate_probability: number | null;
  score_extraction_completeness: number | null;
  score_schema_validity: number | null;
  score_contradiction_flags: number | null;
  gate_decided_at: string | null;
  linked_pattern_id: string | null;
  pattern_name: string | null;
  pattern_signal_count: number | null;
  pattern_confidence: number | null;
  linked_trend_id: string | null;
  trend_classification: string | null;
  pressure_index: number | null;
}

export interface LighthouseGateDecision {
  gate_log_id: string;
  signal_type: string;
  source_system: string;
  source_connector_id: string | null;
  jurisdiction_raw_value: string;
  dataset_id: string | null;
  decision: string;
  composite_score: number;
  profile_name: string | null;
  score_provenance_confidence: number;
  score_source_trust_tier: number;
  score_jurisdiction_validity: number;
  score_temporal_relevance: number;
  score_schema_validity: number;
  score_duplicate_probability: number;
  score_extraction_completeness: number;
  score_contradiction_flags: number;
  decision_reason: string | null;
  evaluated_at: string;
  gate_hash: string;
  signal_hash: string;
  payload_hash: string;
  decision_hash: string;
  was_promoted: boolean;
  promoted_at: string | null;
  detected_signal_id: string | null;
  staging_id: string | null;
  staging_resolved: boolean | null;
  staging_notes: string | null;
}

export interface LighthouseStagedSignal {
  staging_id: string;
  gate_log_id: string;
  signal_type: string;
  source_system: string;
  jurisdiction_raw_value: string;
  gate_decision: string;
  confidence_score: number;
  severity: string | null;
  decision_reason: string | null;
  reviewer_notes: string | null;
  resolved: boolean;
  staged_at: string;
  age_hours: number;
}

export interface LighthousePipelineHealth {
  health_checked_at: string;
  total_signals: number;
  gate_promoted: number;
  legacy_ungated: number;
  last_signal_at: string | null;
  total_decisions: number;
  promoted: number;
  staged_or_held: number;
  rejected: number;
  last_gate_at: string | null;
  avg_gate_score: number | null;
  pending_review: number;
  pending_escalation: number;
  active_patterns: number;
  current_trends: number;
  active_strategies: number;
  last_pattern_run: string | null;
  last_trend_run: string | null;
  last_strategy_run: string | null;
  pattern_runs_sealed: number;
  trend_runs_sealed: number;
  strategy_runs_sealed: number;
  live_signals_total: number;
  signal_freshness: string;
  staging_health: string;
  pattern_engine_health: string;
}

// ── Internal fetch helpers ────────────────────────────────────────────────────

const TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;

function lighthouseUrl(): string {
  const url = ENV.lighthouseSupabaseUrl;
  if (!url) throw new Error("[lighthouseClient] LIGHTHOUSE_SUPABASE_URL is not configured");
  return url.replace(/\/$/, "");
}

function lighthouseKey(): string {
  const key = ENV.lighthouseSupabaseServiceRoleKey;
  if (!key) throw new Error("[lighthouseClient] LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY is not configured");
  return key;
}

async function fetchView<T>(
  viewName: string,
  params: Record<string, string> = {},
  attempt = 0
): Promise<T[]> {
  const base = lighthouseUrl();
  const key = lighthouseKey();

  const query = new URLSearchParams({ select: "*", ...params });
  const url = `${base}/rest/v1/${viewName}?${query.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[lighthouseClient] ${viewName} HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    return (await res.json()) as T[];
  } catch (err: unknown) {
    if (attempt < MAX_RETRIES) {
      const delay = 300 * (attempt + 1);
      await new Promise((r) => setTimeout(r, delay));
      return fetchView<T>(viewName, params, attempt + 1);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[lighthouseClient] Failed to fetch ${viewName} after ${MAX_RETRIES + 1} attempts: ${msg}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSingleRow<T>(viewName: string, params: Record<string, string> = {}): Promise<T | null> {
  const rows = await fetchView<T>(viewName, { ...params, limit: "1" });
  return rows[0] ?? null;
}

// ── Public API — governed view reads only ────────────────────────────────────

/** Active patterns from v_active_patterns */
export async function getActivePatterns(opts: {
  jurisdiction?: string;
  signalType?: string;
  limit?: number;
} = {}): Promise<LighthousePattern[]> {
  const params: Record<string, string> = {
    order: "signal_count.desc,confidence_score.desc",
    limit: String(opts.limit ?? 100),
  };
  if (opts.jurisdiction) params["jurisdiction"] = `eq.${opts.jurisdiction}`;
  if (opts.signalType) params["pattern_type"] = `eq.${opts.signalType}`;
  return fetchView<LighthousePattern>("v_active_patterns", params);
}

/** Active trends from v_active_trends */
export async function getActiveTrends(opts: {
  jurisdiction?: string;
  classification?: string;
  limit?: number;
} = {}): Promise<LighthouseTrend[]> {
  const params: Record<string, string> = {
    order: "pressure_index.desc,current_signal_count.desc",
    limit: String(opts.limit ?? 100),
  };
  if (opts.jurisdiction) params["jurisdiction"] = `eq.${opts.jurisdiction}`;
  if (opts.classification) params["trend_classification"] = `eq.${opts.classification}`;
  return fetchView<LighthouseTrend>("v_active_trends", params);
}

/** Active strategies from v_active_strategies */
export async function getActiveStrategies(opts: {
  jurisdictionScope?: string;
  urgency?: string;
  scope?: string;
  limit?: number;
} = {}): Promise<LighthouseStrategy[]> {
  const params: Record<string, string> = {
    order: "created_at.desc",
    limit: String(opts.limit ?? 100),
  };
  if (opts.jurisdictionScope) params["jurisdiction_scope"] = `eq.${opts.jurisdictionScope}`;
  if (opts.urgency) params["urgency_level"] = `eq.${opts.urgency}`;
  if (opts.scope) params["strategy_scope"] = `eq.${opts.scope}`;
  return fetchView<LighthouseStrategy>("v_active_strategies", params);
}

/** Full signal lineage trace from v_signal_lineage */
export async function getSignalLineage(opts: {
  signalType?: string;
  decision?: string;
  limit?: number;
} = {}): Promise<LighthouseSignalLineage[]> {
  const params: Record<string, string> = {
    order: "detected_at.desc.nullslast",
    limit: String(opts.limit ?? 200),
  };
  if (opts.signalType) params["signal_type"] = `eq.${opts.signalType}`;
  if (opts.decision) params["gate_decision"] = `eq.${opts.decision}`;
  return fetchView<LighthouseSignalLineage>("v_signal_lineage", params);
}

/** Gate decision log from v_gate_decisions */
export async function getGateDecisions(opts: {
  decision?: string;
  sourceSystem?: string;
  limit?: number;
} = {}): Promise<LighthouseGateDecision[]> {
  const params: Record<string, string> = {
    order: "evaluated_at.desc",
    limit: String(opts.limit ?? 200),
  };
  if (opts.decision) params["decision"] = `eq.${opts.decision}`;
  if (opts.sourceSystem) params["source_system"] = `eq.${opts.sourceSystem}`;
  return fetchView<LighthouseGateDecision>("v_gate_decisions", params);
}

/** Staged signals pending review from v_staged_signals */
export async function getStagedSignals(): Promise<LighthouseStagedSignal[]> {
  return fetchView<LighthouseStagedSignal>("v_staged_signals", {
    order: "staged_at.asc",
  });
}

/** Single-row pipeline health summary from v_pipeline_health */
export async function getPipelineHealth(): Promise<LighthousePipelineHealth | null> {
  return fetchSingleRow<LighthousePipelineHealth>("v_pipeline_health");
}

/** Connectivity check — returns true if Lighthouse is reachable */
export async function checkLighthouseConnectivity(): Promise<boolean> {
  try {
    await fetchView("v_pipeline_health", { limit: "1" });
    return true;
  } catch {
    return false;
  }
}
