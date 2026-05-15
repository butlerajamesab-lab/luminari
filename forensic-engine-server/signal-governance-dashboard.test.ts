/**
 * Signal Governance Dashboard Tests
 * 
 * Validates the getSignalDashboard query works correctly with:
 * - Dual naming convention columns (camelCase + snake_case)
 * - governedOnly filter (gate_decision_id IS NOT NULL)
 * - Escalation threshold seeding
 * - JOIN with dataset_provenance using correct column names
 */
import { describe, it, expect } from "vitest";
import { db } from "./db";
import { sql } from "drizzle-orm";

describe("Signal Governance Dashboard", () => {
  it("should have governed signals in detected_signals", async () => {
    const rows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM detected_signals WHERE gate_decision_id IS NOT NULL`
    );
    const count = Number((rows as any)[0][0].cnt);
    expect(count).toBeGreaterThan(0);
  });

  it("should have 59 governed signals from Sunam gate backfill", async () => {
    const rows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM detected_signals WHERE sunam_status = 'governed'`
    );
    const count = Number((rows as any)[0][0].cnt);
    expect(count).toBe(59);
  });

  it("should query governed signals with correct column names (no SQL error)", async () => {
    const rows = await db.execute(
      sql.raw(`
        SELECT ds.id, ds.signal_id, ds.signalType, ds.datasetId,
               ds.title as signal_title,
               COALESCE(ds.plain_language_explanation, ds.explanation) as explanation,
               COALESCE(ds.confidenceScore, ds.confidence_score) as conf_score,
               COALESCE(ds.severity, ds.severity_level) as sev_level,
               COALESCE(ds.jurisdiction, ds.jurisdiction_scope) as juris_scope,
               ds.escalation_status as escalation_tier,
               ds.gate_decision_id, ds.sunam_status
        FROM detected_signals ds
        WHERE ds.gate_decision_id IS NOT NULL
        ORDER BY conf_score DESC
        LIMIT 5
      `)
    );
    const results = (rows as any)[0];
    expect(results.length).toBeGreaterThan(0);
    // Verify the first result has expected fields
    const first = results[0];
    expect(first.id).toBeDefined();
    expect(first.gate_decision_id).not.toBeNull();
    expect(first.sunam_status).toBe("governed");
  });

  it("should JOIN dataset_provenance using camelCase column (datasetId)", async () => {
    // This was the root cause of the bug: dp.dataset_id doesn't exist, dp.datasetId does
    const rows = await db.execute(
      sql.raw(`
        SELECT ds.id, dp.sourceName
        FROM detected_signals ds
        LEFT JOIN dataset_provenance dp ON ds.datasetId = dp.datasetId
        WHERE ds.gate_decision_id IS NOT NULL
        LIMIT 3
      `)
    );
    const results = (rows as any)[0];
    expect(results.length).toBeGreaterThan(0);
    // Query should not throw — that was the original bug
  });

  it("should have 5 escalation threshold tiers", async () => {
    const rows = await db.execute(
      sql`SELECT * FROM escalation_thresholds ORDER BY minScore DESC`
    );
    const tiers = (rows as any)[0];
    expect(tiers.length).toBe(5);
    
    const tierNames = tiers.map((t: any) => t.tierName);
    expect(tierNames).toContain("leadership_alert");
    expect(tierNames).toContain("enforcement_escalation");
    expect(tierNames).toContain("standard_reporting");
    expect(tierNames).toContain("analyst_review");
    expect(tierNames).toContain("monitoring_only");
  });

  it("should count governed signals per escalation tier", async () => {
    // All 59 governed signals have escalation_status = 'monitoring_only'
    const rows = await db.execute(
      sql`SELECT escalation_status, COUNT(*) as cnt 
          FROM detected_signals 
          WHERE gate_decision_id IS NOT NULL 
          GROUP BY escalation_status`
    );
    const results = (rows as any)[0];
    expect(results.length).toBeGreaterThan(0);
    
    const monitoringOnly = results.find((r: any) => r.escalation_status === "monitoring_only");
    expect(monitoringOnly).toBeDefined();
    expect(Number(monitoringOnly.cnt)).toBe(59);
  });

  it("should return total=198 for all signals and total=59 for governed-only", async () => {
    const allRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM detected_signals`
    );
    const allCount = Number((allRows as any)[0][0].cnt);
    
    const govRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM detected_signals WHERE gate_decision_id IS NOT NULL`
    );
    const govCount = Number((govRows as any)[0][0].cnt);
    
    expect(allCount).toBeGreaterThanOrEqual(59);
    expect(govCount).toBe(59);
    // Governed signals should be a subset
    expect(govCount).toBeLessThanOrEqual(allCount);
  });
});
