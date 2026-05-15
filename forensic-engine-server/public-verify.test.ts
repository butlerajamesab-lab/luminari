/**
 * Public Verification Endpoint Tests
 * 
 * Validates that the public verification procedures work correctly:
 * 1. publicRecentEntries — returns entries without auth
 * 2. publicEntryDetail — returns entry metadata without auth
 * 3. publicExportLog — returns JSONL without auth
 * 4. verifyChain — returns chain status without auth
 * 5. Verifier script canonicalization matches backend
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Read the governance router to verify public procedures exist
const routerPath = join(__dirname, "routers/governance-router.ts");
const routerSource = readFileSync(routerPath, "utf-8");

// Read the governance-log service for hash logic
const govLogPath = join(__dirname, "governance-log.ts");
const govLogSource = readFileSync(govLogPath, "utf-8");

// Read the export-manifest for canonicalStringify
const manifestPath = join(__dirname, "export-manifest.ts");
const manifestSource = readFileSync(manifestPath, "utf-8");

// Read the Verify page for the verifier script
const verifyPagePath = join(__dirname, "../client/src/pages/Verify.tsx");
const verifyPageSource = readFileSync(verifyPagePath, "utf-8");

describe("Public Verification Procedures", () => {
  describe("Router Structure", () => {
    it("publicRecentEntries is a publicProcedure", () => {
      const match = routerSource.match(/publicRecentEntries:\s*(publicProcedure|adminProcedure|protectedProcedure)/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe("publicProcedure");
    });

    it("publicEntryDetail is a publicProcedure", () => {
      const match = routerSource.match(/publicEntryDetail:\s*(publicProcedure|adminProcedure|protectedProcedure)/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe("publicProcedure");
    });

    it("publicExportLog is a publicProcedure", () => {
      const match = routerSource.match(/publicExportLog:\s*(publicProcedure|adminProcedure|protectedProcedure)/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe("publicProcedure");
    });

    it("verifyChain is a publicProcedure", () => {
      const match = routerSource.match(/verifyChain:\s*(publicProcedure|adminProcedure|protectedProcedure)/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe("publicProcedure");
    });

    it("publicFeed is a publicProcedure", () => {
      const match = routerSource.match(/publicFeed:\s*(publicProcedure|adminProcedure|protectedProcedure)/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe("publicProcedure");
    });
  });

  describe("publicRecentEntries", () => {
    it("uses cursor-based pagination with limit", () => {
      expect(routerSource).toContain("publicRecentEntries");
      expect(routerSource).toContain("limit: z.number().min(1).max(100).default(25)");
      expect(routerSource).toContain("cursor: z.number().optional()");
    });

    it("returns items, hasMore, nextCursor", () => {
      // Check the return shape
      expect(routerSource).toContain("return { items, hasMore, nextCursor }");
    });

    it("orders by seqNo DESC", () => {
      // The publicRecentEntries query should use desc ordering
      expect(routerSource).toContain("desc(governanceLog.seqNo)");
    });

    it("selects only safe fields (no previousState/newState)", () => {
      // Find the publicRecentEntries select block
      const recentEntriesBlock = routerSource.substring(
        routerSource.indexOf("publicRecentEntries"),
        routerSource.indexOf("publicEntryDetail")
      );
      expect(recentEntriesBlock).toContain("seqNo: governanceLog.seqNo");
      expect(recentEntriesBlock).toContain("eventType: governanceLog.eventType");
      expect(recentEntriesBlock).toContain("component: governanceLog.component");
      expect(recentEntriesBlock).toContain("entryHash: governanceLog.entryHash");
      expect(recentEntriesBlock).not.toContain("previousState: governanceLog.previousState");
      expect(recentEntriesBlock).not.toContain("newState: governanceLog.newState");
    });
  });

  describe("publicEntryDetail", () => {
    it("accepts seqNo input", () => {
      expect(routerSource).toContain("publicEntryDetail");
      const detailBlock = routerSource.substring(
        routerSource.indexOf("publicEntryDetail"),
        routerSource.indexOf("publicExportLog")
      );
      expect(detailBlock).toContain("seqNo: z.number()");
    });

    it("returns verification-relevant fields", () => {
      const detailBlock = routerSource.substring(
        routerSource.indexOf("publicEntryDetail"),
        routerSource.indexOf("publicExportLog")
      );
      expect(detailBlock).toContain("seqNo: governanceLog.seqNo");
      expect(detailBlock).toContain("entryHash: governanceLog.entryHash");
      expect(detailBlock).toContain("previousHash: governanceLog.previousHash");
      expect(detailBlock).toContain("actorHash: governanceLog.actorHash");
      expect(detailBlock).toContain("actorRole: governanceLog.actorRole");
      expect(detailBlock).toContain("rationale: governanceLog.rationale");
    });

    it("returns null for missing entries", () => {
      const detailBlock = routerSource.substring(
        routerSource.indexOf("publicEntryDetail"),
        routerSource.indexOf("publicExportLog")
      );
      expect(detailBlock).toContain("entry ?? null");
    });
  });

  describe("publicExportLog", () => {
    it("orders by seqNo ASC for export", () => {
      const exportBlock = routerSource.substring(
        routerSource.indexOf("publicExportLog"),
        routerSource.indexOf("publicExportLog") + 1500
      );
      expect(exportBlock).toContain(".orderBy(governanceLog.seqNo)");
    });

    it("uses snake_case field names in JSONL output", () => {
      const exportBlock = routerSource.substring(
        routerSource.indexOf("publicExportLog"),
        routerSource.indexOf("publicExportLog") + 1500
      );
      expect(exportBlock).toContain("seq_no:");
      expect(exportBlock).toContain("event_type:");
      expect(exportBlock).toContain("entry_hash:");
      expect(exportBlock).toContain("previous_hash:");
      expect(exportBlock).toContain("actor_hash:");
      expect(exportBlock).toContain("actor_role:");
      expect(exportBlock).toContain("created_at:");
    });

    it("normalizes JSON fields before export", () => {
      const exportBlock = routerSource.substring(
        routerSource.indexOf("publicExportLog"),
        routerSource.indexOf("publicExportLog") + 1500
      );
      expect(exportBlock).toContain("normalizeJson");
      expect(exportBlock).toContain("JSON.parse(val)");
    });
  });

  describe("Chain Verification", () => {
    it("uses GENESIS_HASH of 64 zeros", () => {
      expect(govLogSource).toContain('"0".repeat(64)');
    });

    it("verifyGovernanceChain returns valid/totalEntries/lastValidSeqNo/breakPoint", () => {
      expect(govLogSource).toContain("valid: boolean");
      expect(govLogSource).toContain("totalEntries: number");
      expect(govLogSource).toContain("lastValidSeqNo: number");
      expect(govLogSource).toContain("breakPoint?:");
    });

    it("checks both previous_hash linkage and entry_hash recomputation", () => {
      const verifyBlock = govLogSource.substring(
        govLogSource.indexOf("function verifyGovernanceChain"),
        govLogSource.indexOf("function verifyGovernanceChain") + 2000
      );
      expect(verifyBlock).toContain("entry.previousHash !== expectedPreviousHash");
      expect(verifyBlock).toContain("recomputed !== entry.entryHash");
    });
  });

  describe("Canonicalization Consistency", () => {
    it("backend canonicalStringify sorts keys recursively", () => {
      expect(manifestSource).toContain("Object.keys(value).sort()");
    });

    it("computeEntryHash uses sorted field names in canonical payload", () => {
      // The hash payload fields must be alphabetically sorted
      const hashBlock = govLogSource.substring(
        govLogSource.indexOf("function computeEntryHash"),
        govLogSource.indexOf("function computeEntryHash") + 500
      );
      // Extract field names from the canonical object
      const fieldMatches = hashBlock.match(/(\w+):\s*entry\.\w+/g);
      expect(fieldMatches).toBeTruthy();
      const fieldNames = fieldMatches!.map(m => m.split(":")[0].trim());
      const sorted = [...fieldNames].sort();
      expect(fieldNames).toEqual(sorted);
    });

    it("verifier script uses same canonical field order", () => {
      // Extract the verifier script's canonicalStringify
      expect(verifyPageSource).toContain("function canonicalStringify(obj)");
      expect(verifyPageSource).toContain("Object.keys(value).sort()");
    });

    it("verifier script computeEntryHash uses matching field names", () => {
      // The verifier script must use the same field names as the backend
      expect(verifyPageSource).toContain("actorHash: entry.actor_hash");
      expect(verifyPageSource).toContain("actorRole: entry.actor_role");
      expect(verifyPageSource).toContain("component: entry.component");
      expect(verifyPageSource).toContain("createdAt: entry.created_at");
      expect(verifyPageSource).toContain("eventType: entry.event_type");
      expect(verifyPageSource).toContain("previousHash: entry.previous_hash");
      expect(verifyPageSource).toContain("rationale: entry.rationale");
      expect(verifyPageSource).toContain("scope: entry.scope");
    });

    it("verifier script uses same GENESIS_HASH", () => {
      expect(verifyPageSource).toContain('"0".repeat(64)');
    });
  });

  describe("Verify Page UI", () => {
    it("has ChainStatusSection component", () => {
      expect(verifyPageSource).toContain("function ChainStatusSection");
    });

    it("has RecentEntriesSection component", () => {
      expect(verifyPageSource).toContain("function RecentEntriesSection");
    });

    it("has EntryDetailPanel component", () => {
      expect(verifyPageSource).toContain("function EntryDetailPanel");
    });

    it("has ExportSection component", () => {
      expect(verifyPageSource).toContain("function ExportSection");
    });

    it("has VerifierScriptSection component", () => {
      expect(verifyPageSource).toContain("function VerifierScriptSection");
    });

    it("Copy Verification Payload includes all required fields", () => {
      expect(verifyPageSource).toContain("seq_no: entry.seqNo");
      expect(verifyPageSource).toContain("entry_hash: entry.entryHash");
      expect(verifyPageSource).toContain("previous_hash: entry.previousHash");
      expect(verifyPageSource).toContain("event_type: entry.eventType");
      expect(verifyPageSource).toContain("component_type: entry.component");
      expect(verifyPageSource).toContain("scope: { type: scope.type, id: scope.id }");
    });

    it("does not require authentication", () => {
      // The page should not import useAuth or check for login
      expect(verifyPageSource).not.toContain("useAuth()");
      expect(verifyPageSource).not.toContain("getLoginUrl");
      expect(verifyPageSource).not.toContain("protectedProcedure");
    });
  });

  describe("Route Registration", () => {
    it("/verify route is registered in App.tsx", () => {
      const appPath = join(__dirname, "../client/src/App.tsx");
      const appSource = readFileSync(appPath, "utf-8");
      expect(appSource).toContain('path="/verify"');
      expect(appSource).toContain("import Verify from");
    });
  });
});
