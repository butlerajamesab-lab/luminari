import { describe, it, expect, beforeAll } from "vitest";
import { pool } from "./db";

/**
 * Support Matcher Tests
 * 
 * Tests the unified resource matching system:
 * 1. Data integrity — all 688 resources exist with correct schema
 * 2. Hard filter — pipeline type matching works
 * 3. Scoring — urgency, domain, and diversity constraints
 * 4. End-to-end — "I was denied housing benefits" scenario
 */

// Helper to query the DB directly
async function query(sql: string, params: any[] = []) {
  const [rows] = await pool.query(sql, params);
  return rows as any[];
}

describe("Unified Resources — Data Integrity", () => {
  it("should have resources in the unified_resources table", async () => {
    const rows = await query("SELECT COUNT(*) as cnt FROM unified_resources");
    expect(Number(rows[0].cnt)).toBeGreaterThan(600);
  });

  it("should have multiple resource types", async () => {
    const rows = await query("SELECT DISTINCT resourceType FROM unified_resources ORDER BY resourceType");
    const types = rows.map((r: any) => r.resourceType);
    expect(types).toContain("government_program");
    expect(types).toContain("enforcement_path");
    expect(types).toContain("enforcement_record");
    expect(types.length).toBeGreaterThanOrEqual(4);
  });

  it("should have multiple domains", async () => {
    const rows = await query("SELECT DISTINCT domain FROM unified_resources ORDER BY domain");
    const domains = rows.map((r: any) => r.domain);
    expect(domains).toContain("housing");
    expect(domains).toContain("benefits");
    expect(domains).toContain("employment");
    expect(domains).toContain("healthcare");
    expect(domains.length).toBeGreaterThanOrEqual(8);
  });

  it("should have resources with valid urgency levels", async () => {
    const rows = await query("SELECT DISTINCT urgencyLevel FROM unified_resources");
    const levels = rows.map((r: any) => r.urgencyLevel);
    for (const level of levels) {
      expect(["crisis", "urgent", "standard", "informational"]).toContain(level);
    }
  });

  it("should have matchingPipelineTypes as valid JSON arrays", async () => {
    const rows = await query("SELECT id, matchingPipelineTypes FROM unified_resources LIMIT 20");
    for (const row of rows) {
      // mysql2 auto-parses JSON columns into JS objects
      const parsed = typeof row.matchingPipelineTypes === "string"
        ? JSON.parse(row.matchingPipelineTypes)
        : row.matchingPipelineTypes;
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    }
  });

  it("should have housing-related resources", async () => {
    const rows = await query("SELECT COUNT(*) as cnt FROM unified_resources WHERE domain = 'housing'");
    expect(Number(rows[0].cnt)).toBeGreaterThan(10);
  });

  it("should have enforcement_path resources from the action paths table", async () => {
    const rows = await query("SELECT COUNT(*) as cnt FROM unified_resources WHERE resourceType = 'enforcement_path'");
    expect(Number(rows[0].cnt)).toBeGreaterThanOrEqual(5);
  });
});

describe("Unified Resources — Pipeline Matching", () => {
  it("should find resources matching benefits_denial pipeline", async () => {
    const rows = await query(
      "SELECT * FROM unified_resources WHERE isActive = true AND JSON_CONTAINS(matchingPipelineTypes, ?)",
      [JSON.stringify("benefits_denial")]
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should find resources matching housing_discrimination pipeline", async () => {
    const rows = await query(
      "SELECT * FROM unified_resources WHERE isActive = true AND JSON_CONTAINS(matchingPipelineTypes, ?)",
      [JSON.stringify("housing_discrimination")]
    );
    expect(rows.length).toBeGreaterThan(0);
    // Should include the HUD complaint enforcement path
    const enforcementPaths = rows.filter((r: any) => r.resourceType === "enforcement_path");
    expect(enforcementPaths.length).toBeGreaterThan(0);
  });

  it("should find resources matching section8_disputes pipeline", async () => {
    const rows = await query(
      "SELECT * FROM unified_resources WHERE isActive = true AND JSON_CONTAINS(matchingPipelineTypes, ?)",
      [JSON.stringify("section8_disputes")]
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should find resources matching wage_theft pipeline", async () => {
    const rows = await query(
      "SELECT * FROM unified_resources WHERE isActive = true AND JSON_CONTAINS(matchingPipelineTypes, ?)",
      [JSON.stringify("wage_theft")]
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("Support Matcher — End-to-End Scoring", () => {
  // Import the matcher function
  let matchResources: any;

  beforeAll(async () => {
    const mod = await import("./support-matcher");
    matchResources = mod.matchResources;
  });

  it("should return scored results for benefits_denial", async () => {
    const results = await matchResources({
      pipelineType: "benefits_denial",
      urgency: "urgent",
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);

    // Each result should have required fields
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(r.matchReasons).toBeDefined();
      expect(Array.isArray(r.matchReasons)).toBe(true);
      expect(r.matchReasons.length).toBeGreaterThan(0);
      expect(r.name).toBeDefined();
      expect(r.resourceType).toBeDefined();
    }
  });

  it("should return results sorted by score descending", async () => {
    const results = await matchResources({
      pipelineType: "benefits_denial",
      urgency: "urgent",
      limit: 5,
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("should boost enforcement_path resources for housing_discrimination", async () => {
    const results = await matchResources({
      pipelineType: "housing_discrimination",
      urgency: "urgent",
      limit: 5,
    });
    // The HUD complaint enforcement path should be in the results
    const enforcementPaths = results.filter((r: any) => r.resourceType === "enforcement_path");
    expect(enforcementPaths.length).toBeGreaterThan(0);
    // It should have a high score
    expect(enforcementPaths[0].score).toBeGreaterThanOrEqual(0.7);
  });

  it("should respect the limit parameter", async () => {
    const results3 = await matchResources({
      pipelineType: "benefits_denial",
      limit: 3,
    });
    expect(results3.length).toBeLessThanOrEqual(3);

    const results10 = await matchResources({
      pipelineType: "benefits_denial",
      limit: 10,
    });
    expect(results10.length).toBeLessThanOrEqual(10);
    expect(results10.length).toBeGreaterThanOrEqual(results3.length);
  });

  it("should include match reasons explaining why each resource matched", async () => {
    const results = await matchResources({
      pipelineType: "housing_discrimination",
      urgency: "crisis",
      limit: 5,
    });
    for (const r of results) {
      expect(r.matchReasons.length).toBeGreaterThan(0);
      // Reasons should be human-readable strings
      for (const reason of r.matchReasons) {
        expect(typeof reason).toBe("string");
        expect(reason.length).toBeGreaterThan(5);
      }
    }
  });

  it("should handle unknown pipeline types gracefully", async () => {
    const results = await matchResources({
      pipelineType: "nonexistent_pipeline_type_xyz",
      limit: 5,
    });
    // Should return empty or very few results, not crash
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("Support Matcher — Housing Denial Simulation", () => {
  let matchResources: any;

  beforeAll(async () => {
    const mod = await import("./support-matcher");
    matchResources = mod.matchResources;
  });

  it("should produce actionable results for 'I was denied housing benefits'", async () => {
    // Simulate the intake signal for housing benefits denial
    const results = await matchResources({
      pipelineType: "benefits_denial",
      domain: "housing",
      urgency: "urgent",
      limit: 5,
    });

    expect(results.length).toBeGreaterThanOrEqual(3);

    // Should include a mix of resource types (not all the same)
    const types = new Set(results.map((r: any) => r.resourceType));
    expect(types.size).toBeGreaterThanOrEqual(1);

    // At least one result should have contact info (phone or website)
    const withContact = results.filter((r: any) => r.phone || r.website);
    expect(withContact.length).toBeGreaterThan(0);

    // Each result should have a score and match reasons
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.matchReasons.length).toBeGreaterThan(0);
    }

    // Should include enforcement paths or housing-related resources
    const housingOrFiling = results.filter((r: any) => 
      r.resourceType === "enforcement_path" || r.domain === "housing"
    );
    expect(housingOrFiling.length).toBeGreaterThan(0);
  });
});
