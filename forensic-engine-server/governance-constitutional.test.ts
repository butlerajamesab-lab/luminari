/**
 * Constitutional Test Suite — Governance Logging System
 * 
 * These tests enforce the non-negotiable rules of the Luminari Constitution:
 * 
 * 1. No UPDATE or DELETE on governance_log (append-only)
 * 2. No governed write without a log entry in the same transaction
 * 3. If log write fails → entire operation fails
 * 4. All events require meaningful rationale
 * 5. Hash chain must be deterministic and verifiable
 * 6. No silent behavior — every change is visible
 * 7. Actor identity is hashed for privacy
 * 8. Governance router exposes public verification
 * 9. Governance hooks enforce transaction coupling
 * 10. No bypass paths exist
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.resolve(__dirname, "..");

// ─── Helper: Read file ───
function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf-8");
}

describe("Constitutional Enforcement: Governance Logging System", () => {

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE I: Append-Only Enforcement
  // ═══════════════════════════════════════════════════════════════════

  describe("Article I: Append-Only — No UPDATE or DELETE on governance_log", () => {
    it("governance-log.ts does NOT contain UPDATE on governance_log", () => {
      const file = readFile("server/governance-log.ts");
      // Should not contain any ORM update operations on governanceLog table
      expect(file).not.toMatch(/\.update\(governanceLog\)/);
      // Should not contain raw SQL UPDATE statements targeting governance_log
      expect(file).not.toMatch(/UPDATE\s+governance_log\s+SET/i);
    });

    it("governance-log.ts does NOT contain DELETE on governance_log", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).not.toMatch(/\.delete\(governanceLog\)/);
      // Should not contain raw SQL DELETE statements targeting governance_log
      expect(file).not.toMatch(/DELETE\s+FROM\s+governance_log/i);
    });

    it("governance-hooks.ts does NOT contain UPDATE or DELETE on governance_log", () => {
      const file = readFile("server/governance-hooks.ts");
      expect(file).not.toMatch(/\.update\(governanceLog\)/);
      expect(file).not.toMatch(/\.delete\(governanceLog\)/);
    });

    it("governance-router.ts does NOT contain UPDATE or DELETE on governance_log", () => {
      const file = readFile("server/routers/governance-router.ts");
      expect(file).not.toMatch(/\.update\(governanceLog\)/);
      expect(file).not.toMatch(/\.delete\(governanceLog\)/);
    });

    it("no router file contains direct writes to governance_log", () => {
      const routerDir = path.join(projectRoot, "server/routers");
      const routerFiles = fs.readdirSync(routerDir).filter(f => f.endsWith(".ts") && !f.includes("test"));
      for (const file of routerFiles) {
        if (file === "governance-router.ts") continue; // governance router uses the service layer
        const content = fs.readFileSync(path.join(routerDir, file), "utf-8");
        expect(content).not.toMatch(/\.insert\(governanceLog\)/);
        expect(content).not.toMatch(/INSERT.*governance_log/i);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE II: Transaction Coupling
  // ═══════════════════════════════════════════════════════════════════

  describe("Article II: Transaction Coupling — Every governed write includes a log entry", () => {
    it("writeGovernanceLog accepts a transaction object (tx parameter)", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("export async function writeGovernanceLog(");
      expect(file).toMatch(/writeGovernanceLog\(\s*tx/);
    });

    it("all governance hooks use db.transaction()", () => {
      const file = readFile("server/governance-hooks.ts");
      // Every governed operation must use db.transaction
      const hookFunctions = [
        "governedThresholdUpdate",
        "governedDataStreamToggle",
        "governedSignalSuppression",
        "governedEngineToggle",
        "governedEngineConfigChange",
        "governedCategoryReclassification",
        "governedVersionChange",
      ];
      for (const fn of hookFunctions) {
        const fnStart = file.indexOf(`export async function ${fn}`);
        expect(fnStart).toBeGreaterThan(-1);
        const fnBody = file.substring(fnStart, file.indexOf("}\n\n", fnStart) + 1);
        expect(fnBody).toContain("db.transaction(async (tx)");
      }
    });

    it("all governance hooks call writeGovernanceLog inside the transaction", () => {
      const file = readFile("server/governance-hooks.ts");
      const hookFunctions = [
        "governedThresholdUpdate",
        "governedDataStreamToggle",
        "governedSignalSuppression",
        "governedEngineToggle",
        "governedEngineConfigChange",
        "governedCategoryReclassification",
        "governedVersionChange",
      ];
      for (const fn of hookFunctions) {
        const fnStart = file.indexOf(`export async function ${fn}`);
        const fnBody = file.substring(fnStart, file.indexOf("}\n\n", fnStart) + 1);
        expect(fnBody).toContain("writeGovernanceLog(tx,");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE III: No Silent Behavior — Rationale Enforcement
  // ═══════════════════════════════════════════════════════════════════

  describe("Article III: No Silent Behavior — All events require meaningful rationale", () => {
    it("validateRationale enforces minimum length", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("MINIMUM_RATIONALE_LENGTH");
      expect(file).toContain("validateRationale(");
    });

    it("validateRationale rejects banned patterns", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("BANNED_RATIONALE_PATTERNS");
      // Check specific banned patterns
      expect(file).toContain("/^update$/i");
      expect(file).toContain("/^change$/i");
      expect(file).toContain("/^fix$/i");
      expect(file).toContain("/^test$/i");
      expect(file).toContain("/^n\\/a$/i");
    });

    it("writeGovernanceLog calls validateRationale before writing", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("export async function writeGovernanceLog");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      const validateIndex = fnBody.indexOf("validateRationale(");
      const insertIndex = fnBody.indexOf(".insert(governanceLog)");
      expect(validateIndex).toBeGreaterThan(-1);
      expect(insertIndex).toBeGreaterThan(-1);
      expect(validateIndex).toBeLessThan(insertIndex);
    });

    it("governance router enforces minimum rationale length in input schemas", () => {
      const file = readFile("server/routers/governance-router.ts");
      // All mutation inputs should have rationale with min length
      expect(file).toContain("rationale: z.string().min(10)");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE IV: Hash Chain Integrity
  // ═══════════════════════════════════════════════════════════════════

  describe("Article IV: Hash Chain — Deterministic and verifiable", () => {
    it("computeEntryHash uses canonicalStringify for determinism", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("import { canonicalStringify }");
      expect(file).toContain("canonicalStringify({");
    });

    it("computeEntryHash includes previousHash in computation", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("function computeEntryHash");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      expect(fnBody).toContain("previousHash: entry.previousHash");
    });

    it("genesis entry uses 64 zeros as previous_hash", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain('"0".repeat(64)');
    });

    it("verifyGovernanceChain recomputes and compares every hash", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("export async function verifyGovernanceChain");
      expect(file).toContain("recomputed !== entry.entryHash");
      expect(file).toContain("entry.previousHash !== expectedPreviousHash");
    });

    it("verifyGovernanceChain returns break point on failure", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("breakPoint:");
      expect(file).toContain("data may have been tampered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE V: Privacy — Actor Identity Hashing
  // ═══════════════════════════════════════════════════════════════════

  describe("Article V: Privacy — Actor identity is hashed", () => {
    it("hashActorId uses SHA-256", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("function hashActorId(actorId: string): string");
      expect(file).toContain('createHash("sha256").update(actorId)');
    });

    it("writeGovernanceLog hashes actor before storing", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("export async function writeGovernanceLog");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      expect(fnBody).toContain("hashActorId(input.actorId)");
    });

    it("governance_log schema stores actorHash not actorId", () => {
      const schema = readFile("drizzle/schema.ts");
      // Should have actor_hash column, not actor_id
      const govLogSection = schema.substring(
        schema.indexOf("governance_log"),
        schema.indexOf("governanceSnapshots")
      );
      expect(govLogSection).toContain("actor_hash");
      expect(govLogSection).not.toContain("actor_id");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE VI: Public Verifiability
  // ═══════════════════════════════════════════════════════════════════

  describe("Article VI: Public Verifiability — Anyone can verify system integrity", () => {
    it("governance router exposes publicFeed as publicProcedure", () => {
      const file = readFile("server/routers/governance-router.ts");
      expect(file).toContain("publicFeed: publicProcedure");
    });

    it("governance router exposes verifyChain as publicProcedure", () => {
      const file = readFile("server/routers/governance-router.ts");
      expect(file).toContain("verifyChain: publicProcedure");
    });

    it("governance router exposes latestSnapshot as publicProcedure", () => {
      const file = readFile("server/routers/governance-router.ts");
      expect(file).toContain("latestSnapshot: publicProcedure");
    });

    it("public feed does NOT expose raw state data", () => {
      const file = readFile("server/governance-log.ts");
      const feedFn = file.substring(
        file.indexOf("getGovernanceLogPublicFeed"),
        file.indexOf("\n}\n", file.indexOf("getGovernanceLogPublicFeed"))
      );
      // Should select specific fields, not select all
      expect(feedFn).toContain(".select({");
      // Should NOT include previousState or newState in public feed
      expect(feedFn).not.toContain("previousState:");
      expect(feedFn).not.toContain("newState:");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE VII: Cryptographic Snapshots
  // ═══════════════════════════════════════════════════════════════════

  describe("Article VII: Cryptographic Snapshots — Signed and verifiable", () => {
    it("createGovernanceSnapshot uses signSnapshot", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("import { signSnapshot");
      expect(file).toContain("signSnapshot(signaturePayload)");
    });

    it("snapshot includes hash chain root", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("export async function createGovernanceSnapshot");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      expect(fnBody).toContain("hashChainRoot");
    });

    it("snapshot stores key fingerprint for verification", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("getPublicKeyFingerprint()");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE VIII: Event Type Validation
  // ═══════════════════════════════════════════════════════════════════

  describe("Article VIII: Event Type Validation — Only known governance events", () => {
    it("validateEventType checks against known types", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("function validateEventType(eventType: string)");
      expect(file).toContain("Unknown governance event type");
    });

    it("writeGovernanceLog calls validateEventType before writing", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("export async function writeGovernanceLog");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      const validateIndex = fnBody.indexOf("validateEventType(");
      const insertIndex = fnBody.indexOf(".insert(governanceLog)");
      expect(validateIndex).toBeGreaterThan(-1);
      expect(insertIndex).toBeGreaterThan(-1);
      expect(validateIndex).toBeLessThan(insertIndex);
    });

    it("all governance event types are defined in schema", () => {
      const schema = readFile("drizzle/schema.ts");
      expect(schema).toContain("GOVERNANCE_EVENT_TYPES");
      // Check critical event types exist
      expect(schema).toContain("threshold_update");
      expect(schema).toContain("signal_suppression");
      expect(schema).toContain("signal_restoration");
      expect(schema).toContain("engine_activation");
      expect(schema).toContain("engine_deactivation");
      expect(schema).toContain("data_stream_activation");
      expect(schema).toContain("data_stream_deactivation");
      expect(schema).toContain("gap_standard_version");
      expect(schema).toContain("constitution_version");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE IX: Governed Operations Use Hooks (No Bypass)
  // ═══════════════════════════════════════════════════════════════════

  describe("Article IX: No Bypass — Governed operations must use hooks", () => {
    it("governance-hooks.ts exports all 7 governed operation types", () => {
      const file = readFile("server/governance-hooks.ts");
      expect(file).toContain("export async function governedThresholdUpdate");
      expect(file).toContain("export async function governedDataStreamToggle");
      expect(file).toContain("export async function governedSignalSuppression");
      expect(file).toContain("export async function governedEngineToggle");
      expect(file).toContain("export async function governedEngineConfigChange");
      expect(file).toContain("export async function governedCategoryReclassification");
      expect(file).toContain("export async function governedVersionChange");
    });

    it("governance router uses hooks for all mutations (not direct DB writes)", () => {
      const file = readFile("server/routers/governance-router.ts");
      // Router should import from governance-hooks
      expect(file).toContain('from "../governance-hooks"');
      // Router mutations should call hook functions
      expect(file).toContain("governedThresholdUpdate(");
      expect(file).toContain("governedDataStreamToggle(");
      expect(file).toContain("governedSignalSuppression(");
      expect(file).toContain("governedEngineToggle(");
      expect(file).toContain("governedEngineConfigChange(");
      expect(file).toContain("governedCategoryReclassification(");
      expect(file).toContain("governedVersionChange(");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE X: Sequence Number Integrity
  // ═══════════════════════════════════════════════════════════════════

  describe("Article X: Sequence Number Integrity — Monotonically increasing", () => {
    it("writeGovernanceLog computes next seq_no from latest entry", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("export async function writeGovernanceLog");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      expect(fnBody).toContain("nextSeqNo");
      expect(fnBody).toContain("latestEntry?.seqNo ?? 0");
    });

    it("governance_log schema has unique constraint on seq_no", () => {
      const schema = readFile("drizzle/schema.ts");
      const govLogSection = schema.substring(
        schema.indexOf("governance_log"),
        schema.indexOf("governanceSnapshots")
      );
      expect(govLogSection).toContain("seq_no");
      expect(govLogSection).toContain(".unique()");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE XI: Export Capability
  // ═══════════════════════════════════════════════════════════════════

  describe("Article XI: Export — Full log exportable for external verification", () => {
    it("exportGovernanceLog function exists", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("export async function exportGovernanceLog");
    });

    it("governance router exposes export endpoint (admin only)", () => {
      const file = readFile("server/routers/governance-router.ts");
      expect(file).toContain("exportLog: adminProcedure");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE XII-A: Transaction Enforcement Guard (Hardening)
  // ═══════════════════════════════════════════════════════════════════

  describe("Article XII-A: Transaction Enforcement — writeGovernanceLog rejects non-transaction context", () => {
    it("writeGovernanceLog throws if called without transaction context", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("export async function writeGovernanceLog");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      // Must check for transaction context before any other operation
      expect(fnBody).toContain("Governance log requires transaction context");
      expect(fnBody).toContain("constitutional violation");
    });

    it("transaction guard executes BEFORE rationale validation", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("export async function writeGovernanceLog");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      const guardIndex = fnBody.indexOf("Governance log requires transaction context");
      const rationaleIndex = fnBody.indexOf("validateRationale(");
      expect(guardIndex).toBeGreaterThan(-1);
      expect(rationaleIndex).toBeGreaterThan(-1);
      expect(guardIndex).toBeLessThan(rationaleIndex);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE XII-B: Hash Chain Concurrency Lock (Hardening)
  // ═══════════════════════════════════════════════════════════════════

  describe("Article XII-B: Concurrency Lock — Hash chain cannot fork under concurrent writes", () => {
    it("writeGovernanceLog uses FOR UPDATE lock on latest entry", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("export async function writeGovernanceLog");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      // Must use FOR UPDATE to serialize concurrent writes at DB level
      expect(fnBody).toContain('.for("update")');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE XII-C: Rationale Quality Hardening
  // ═══════════════════════════════════════════════════════════════════

  describe("Article XII-C: Rationale Quality — Rejects filler, requires meaningful words", () => {
    it("validateRationale enforces minimum word count", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("MINIMUM_RATIONALE_WORDS");
      expect(file).toContain("words.length < MINIMUM_RATIONALE_WORDS");
    });

    it("validateRationale rejects filler substrings", () => {
      const file = readFile("server/governance-log.ts");
      expect(file).toContain("BANNED_FILLER_SUBSTRINGS");
      // Check specific filler patterns are blocked
      expect(file).toContain('"aaaa"');
      expect(file).toContain('"asdf"');
      expect(file).toContain('"qwerty"');
      expect(file).toContain('"placeholder"');
    });

    it("filler check runs after word count check", () => {
      const file = readFile("server/governance-log.ts");
      const fnStart = file.indexOf("function validateRationale");
      const fnBody = file.substring(fnStart, file.indexOf("\n}\n", fnStart));
      const wordCheckIndex = fnBody.indexOf("MINIMUM_RATIONALE_WORDS");
      const fillerCheckIndex = fnBody.indexOf("BANNED_FILLER_SUBSTRINGS");
      expect(wordCheckIndex).toBeGreaterThan(-1);
      expect(fillerCheckIndex).toBeGreaterThan(-1);
      expect(wordCheckIndex).toBeLessThan(fillerCheckIndex);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE XII-D: Full Mutation Path Audit (No Bypass Writes)
  // ═══════════════════════════════════════════════════════════════════

  describe("Article XII-D: Mutation Path Audit — No ungoverned writes to governed tables", () => {
    it("no router directly updates governed tables outside governance hooks", () => {
      const routerDir = path.join(projectRoot, "server/routers");
      const routerFiles = fs.readdirSync(routerDir).filter(f => f.endsWith(".ts") && !f.includes("test"));
      const governedTablePatterns = [
        /\.update\(sunamThresholds\)/,
        /\.update\(sunamEscalationThresholds\)/,
      ];
      for (const file of routerFiles) {
        if (file === "governance-router.ts") continue;
        const content = fs.readFileSync(path.join(routerDir, file), "utf-8");
        for (const pattern of governedTablePatterns) {
          // Direct writes to governed tables should go through governance hooks
          expect(content).not.toMatch(pattern);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE XII: Governance Router Registration
  // ═══════════════════════════════════════════════════════════════════

  describe("Article XII: Router Registration — Governance is wired into the app", () => {
    it("governance router is imported in routers.ts", () => {
      const file = readFile("server/routers.ts");
      expect(file).toContain('import { governanceRouter } from "./routers/governance-router"');
    });

    it("governance router is registered in appRouter", () => {
      const file = readFile("server/routers.ts");
      expect(file).toContain("governance: governanceRouter");
    });
  });
});
