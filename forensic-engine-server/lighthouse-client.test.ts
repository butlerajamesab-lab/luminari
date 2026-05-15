/**
 * lighthouse-client.test.ts
 *
 * Validates Lighthouse Supabase credentials and canonical view accessibility.
 * All tests are read-only — no writes to Lighthouse.
 */

import { describe, it, expect } from "vitest";
import {
  checkLighthouseConnectivity,
  getActivePatterns,
  getActiveTrends,
  getActiveStrategies,
  getGateDecisions,
  getSignalLineage,
  getPipelineHealth,
} from "./services/lighthouseClient.js";

describe("Lighthouse Client — Credential & Connectivity", () => {
  it("should have LIGHTHOUSE_SUPABASE_URL configured", () => {
    expect(process.env.LIGHTHOUSE_SUPABASE_URL).toBeTruthy();
    expect(process.env.LIGHTHOUSE_SUPABASE_URL).toMatch(/^https:\/\//);
  });

  it("should have LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY configured", () => {
    expect(process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    expect(process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY!.length).toBeGreaterThan(20);
  });

  it("should connect to Lighthouse and reach v_pipeline_health", async () => {
    const reachable = await checkLighthouseConnectivity();
    expect(reachable).toBe(true);
  }, 15_000);
});

describe("Lighthouse Client — Canonical View Reads", () => {
  it("should fetch v_active_patterns", async () => {
    const patterns = await getActivePatterns({ limit: 10 });
    expect(Array.isArray(patterns)).toBe(true);
    if (patterns.length > 0) {
      expect(patterns[0]).toHaveProperty("pattern_id");
      expect(patterns[0]).toHaveProperty("pattern_type");
      expect(patterns[0]).toHaveProperty("confidence_score");
    }
  }, 15_000);

  it("should fetch v_active_trends", async () => {
    const trends = await getActiveTrends({ limit: 10 });
    expect(Array.isArray(trends)).toBe(true);
    if (trends.length > 0) {
      expect(trends[0]).toHaveProperty("trend_id");
      expect(trends[0]).toHaveProperty("pressure_index");
      expect(trends[0]).toHaveProperty("trend_classification");
    }
  }, 15_000);

  it("should fetch v_active_strategies", async () => {
    const strategies = await getActiveStrategies({ limit: 10 });
    expect(Array.isArray(strategies)).toBe(true);
    if (strategies.length > 0) {
      expect(strategies[0]).toHaveProperty("id");
      expect(strategies[0]).toHaveProperty("urgency_level");
      expect(strategies[0]).toHaveProperty("strategy_scope");
    }
  }, 15_000);

  it("should fetch v_gate_decisions", async () => {
    const decisions = await getGateDecisions({ limit: 10 });
    expect(Array.isArray(decisions)).toBe(true);
    if (decisions.length > 0) {
      expect(decisions[0]).toHaveProperty("gate_log_id");
      expect(decisions[0]).toHaveProperty("decision");
      expect(decisions[0]).toHaveProperty("composite_score");
    }
  }, 15_000);

  it("should fetch v_signal_lineage", async () => {
    const lineage = await getSignalLineage({ limit: 10 });
    expect(Array.isArray(lineage)).toBe(true);
    if (lineage.length > 0) {
      expect(lineage[0]).toHaveProperty("detected_signal_id");
      expect(lineage[0]).toHaveProperty("gate_decision");
    }
  }, 15_000);

  it("should fetch v_pipeline_health single row", async () => {
    const health = await getPipelineHealth();
    expect(health).not.toBeNull();
    if (health) {
      expect(health).toHaveProperty("total_signals");
      expect(health).toHaveProperty("active_patterns");
      expect(health).toHaveProperty("current_trends");
      expect(health).toHaveProperty("active_strategies");
      expect(typeof health.total_signals).toBe("number");
    }
  }, 15_000);
});
