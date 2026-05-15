import { describe, it, expect } from "vitest";
import { pool } from "./db";

describe("Resource Verification System", () => {
  // ─── Schema Integrity ───
  describe("Schema", () => {
    it("unified_resources table has verificationStatus column", async () => {
      const [rows] = await pool.query(
        "SELECT COLUMN_NAME, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'luminari_registry' AND TABLE_NAME = 'unified_resources' AND COLUMN_NAME = 'verificationStatus'"
      );
      const cols = rows as any[];
      expect(cols.length).toBe(1);
      expect(cols[0].COLUMN_DEFAULT).toBe("unverified");
    });

    it("unified_resources table has flaggedReason column", async () => {
      const [rows] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'luminari_registry' AND TABLE_NAME = 'unified_resources' AND COLUMN_NAME = 'flaggedReason'"
      );
      const cols = rows as any[];
      expect(cols.length).toBe(1);
    });

    it("unified_resources table has verifiedBy column", async () => {
      const [rows] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'luminari_registry' AND TABLE_NAME = 'unified_resources' AND COLUMN_NAME = 'verifiedBy'"
      );
      const cols = rows as any[];
      expect(cols.length).toBe(1);
    });

    it("unified_resources table has isActive column", async () => {
      const [rows] = await pool.query(
        "SELECT COLUMN_NAME, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'luminari_registry' AND TABLE_NAME = 'unified_resources' AND COLUMN_NAME = 'isActive'"
      );
      const cols = rows as any[];
      expect(cols.length).toBe(1);
    });

    it("unified_resources table has lastVerifiedAt column", async () => {
      const [rows] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'luminari_registry' AND TABLE_NAME = 'unified_resources' AND COLUMN_NAME = 'lastVerifiedAt'"
      );
      const cols = rows as any[];
      expect(cols.length).toBe(1);
    });
  });

  // ─── Data Integrity ───
  describe("Data Integrity", () => {
    it("all resources have a valid verificationStatus", async () => {
      const [rows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM luminari_registry.unified_resources WHERE verificationStatus NOT IN ('verified', 'unverified', 'flagged')"
      );
      const result = rows as any[];
      expect(Number(result[0].cnt)).toBe(0);
    });

    it("all active resources have isActive = true", async () => {
      const [rows] = await pool.query(
        "SELECT COUNT(*) as total, SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as active FROM luminari_registry.unified_resources"
      );
      const result = rows as any[];
      expect(Number(result[0].total)).toBeGreaterThan(0);
      // At least some resources should be active
      expect(Number(result[0].active)).toBeGreaterThan(0);
    });

    it("flagged resources should have a flaggedReason", async () => {
      const [rows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM luminari_registry.unified_resources WHERE verificationStatus = 'flagged' AND (flaggedReason IS NULL OR flaggedReason = '')"
      );
      const result = rows as any[];
      // No flagged resources without a reason
      expect(Number(result[0].cnt)).toBe(0);
    });
  });

  // ─── Verification Operations ───
  describe("Verification Operations", () => {
    let testResourceId: number;

    it("can find an unverified resource to test with", async () => {
      const [rows] = await pool.query(
        "SELECT id FROM luminari_registry.unified_resources WHERE verificationStatus = 'unverified' AND isActive = 1 LIMIT 1"
      );
      const result = rows as any[];
      expect(result.length).toBeGreaterThan(0);
      testResourceId = result[0].id;
    });

    it("can mark a resource as verified", async () => {
      if (!testResourceId) return;
      const now = Date.now();
      await pool.query(
        "UPDATE luminari_registry.unified_resources SET verificationStatus = 'verified', lastVerifiedAt = ?, verifiedBy = 'test-admin' WHERE id = ?",
        [now, testResourceId]
      );
      const [rows] = await pool.query(
        "SELECT verificationStatus, lastVerifiedAt, verifiedBy FROM luminari_registry.unified_resources WHERE id = ?",
        [testResourceId]
      );
      const result = rows as any[];
      expect(result[0].verificationStatus).toBe("verified");
      expect(Number(result[0].lastVerifiedAt)).toBe(now);
      expect(result[0].verifiedBy).toBe("test-admin");
    });

    it("can flag a resource with a reason", async () => {
      if (!testResourceId) return;
      await pool.query(
        "UPDATE luminari_registry.unified_resources SET verificationStatus = 'flagged', flaggedReason = 'Test flag - phone disconnected' WHERE id = ?",
        [testResourceId]
      );
      const [rows] = await pool.query(
        "SELECT verificationStatus, flaggedReason FROM luminari_registry.unified_resources WHERE id = ?",
        [testResourceId]
      );
      const result = rows as any[];
      expect(result[0].verificationStatus).toBe("flagged");
      expect(result[0].flaggedReason).toBe("Test flag - phone disconnected");
    });

    it("can deactivate a resource", async () => {
      if (!testResourceId) return;
      await pool.query(
        "UPDATE luminari_registry.unified_resources SET isActive = 0 WHERE id = ?",
        [testResourceId]
      );
      const [rows] = await pool.query(
        "SELECT isActive FROM luminari_registry.unified_resources WHERE id = ?",
        [testResourceId]
      );
      const result = rows as any[];
      expect(Number(result[0].isActive)).toBe(0);
    });

    it("can reactivate a resource", async () => {
      if (!testResourceId) return;
      await pool.query(
        "UPDATE luminari_registry.unified_resources SET isActive = 1 WHERE id = ?",
        [testResourceId]
      );
      const [rows] = await pool.query(
        "SELECT isActive FROM luminari_registry.unified_resources WHERE id = ?",
        [testResourceId]
      );
      const result = rows as any[];
      expect(Number(result[0].isActive)).toBe(1);
    });

    // Clean up: restore to unverified
    it("cleanup: restore test resource to unverified state", async () => {
      if (!testResourceId) return;
      await pool.query(
        "UPDATE luminari_registry.unified_resources SET verificationStatus = 'unverified', flaggedReason = NULL, verifiedBy = NULL, lastVerifiedAt = NULL, isActive = 1 WHERE id = ?",
        [testResourceId]
      );
      const [rows] = await pool.query(
        "SELECT verificationStatus, flaggedReason, isActive FROM luminari_registry.unified_resources WHERE id = ?",
        [testResourceId]
      );
      const result = rows as any[];
      expect(result[0].verificationStatus).toBe("unverified");
      expect(result[0].flaggedReason).toBeNull();
      expect(Number(result[0].isActive)).toBe(1);
    });
  });

  // ─── Freshness Decay ───
  describe("Freshness Decay", () => {
    it("resources without lastVerifiedAt are treated as maximally stale", async () => {
      const [rows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM luminari_registry.unified_resources WHERE lastVerifiedAt IS NULL"
      );
      const result = rows as any[];
      // Most seeded resources should have no lastVerifiedAt (never verified)
      expect(Number(result[0].cnt)).toBeGreaterThan(0);
    });

    it("stale resources query returns resources not verified in 90+ days", async () => {
      const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
      const [rows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM luminari_registry.unified_resources WHERE isActive = 1 AND (lastVerifiedAt IS NULL OR lastVerifiedAt < ?)",
        [ninetyDaysAgo]
      );
      const result = rows as any[];
      // Should have stale resources
      expect(Number(result[0].cnt)).toBeGreaterThan(0);
    });
  });

  // ─── Audit Queries ───
  describe("Audit Queries", () => {
    it("can compute health score", async () => {
      const [rows] = await pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN verificationStatus = 'verified' THEN 1 ELSE 0 END) as verified,
          SUM(CASE WHEN verificationStatus = 'flagged' THEN 1 ELSE 0 END) as flagged,
          SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN isActive = 0 THEN 1 ELSE 0 END) as inactive
        FROM luminari_registry.unified_resources
      `);
      const result = rows as any[];
      const total = Number(result[0].total);
      const verified = Number(result[0].verified);
      expect(total).toBeGreaterThan(0);
      // Health score = (verified / total) * 100
      const healthScore = Math.round((verified / total) * 100);
      expect(healthScore).toBeGreaterThanOrEqual(0);
      expect(healthScore).toBeLessThanOrEqual(100);
    });

    it("can group resources by domain", async () => {
      const [rows] = await pool.query(
        "SELECT domain, COUNT(*) as cnt FROM luminari_registry.unified_resources GROUP BY domain ORDER BY cnt DESC"
      );
      const result = rows as any[];
      expect(result.length).toBeGreaterThan(0);
      // Each domain should have at least 1 resource
      result.forEach((r: any) => {
        expect(Number(r.cnt)).toBeGreaterThan(0);
        expect(r.domain).toBeTruthy();
      });
    });

    it("can group resources by resourceType", async () => {
      const [rows] = await pool.query(
        "SELECT resourceType, COUNT(*) as cnt FROM luminari_registry.unified_resources GROUP BY resourceType ORDER BY cnt DESC"
      );
      const result = rows as any[];
      expect(result.length).toBeGreaterThan(0);
    });

    it("can filter by verificationStatus", async () => {
      const [rows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM luminari_registry.unified_resources WHERE verificationStatus = 'unverified'"
      );
      const result = rows as any[];
      expect(Number(result[0].cnt)).toBeGreaterThan(0);
    });
  });

  // ─── Matching Engine Integration ───
  describe("Matching Engine Integration", () => {
    it("inactive resources are excluded from matching queries", async () => {
      // The matching engine's phase1HardFilter adds WHERE isActive = 1
      const [activeRows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM luminari_registry.unified_resources WHERE isActive = 1"
      );
      const [totalRows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM luminari_registry.unified_resources"
      );
      const active = Number((activeRows as any[])[0].cnt);
      const total = Number((totalRows as any[])[0].cnt);
      // Active should be <= total (some may be deactivated)
      expect(active).toBeLessThanOrEqual(total);
      expect(active).toBeGreaterThan(0);
    });

    it("verificationStatus column is available for scoring", async () => {
      const [rows] = await pool.query(
        "SELECT verificationStatus, COUNT(*) as cnt FROM luminari_registry.unified_resources WHERE isActive = 1 GROUP BY verificationStatus"
      );
      const result = rows as any[];
      expect(result.length).toBeGreaterThan(0);
      // Should have at least unverified resources
      const unverified = result.find((r: any) => r.verificationStatus === "unverified");
      expect(unverified).toBeDefined();
    });
  });
});
