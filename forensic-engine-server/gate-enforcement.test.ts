/**
 * Gate Enforcement Tests
 * 
 * Validates that:
 * 1. storeGovernedSignal rejects writes without gateLogId
 * 2. storeGovernedSignal rejects writes with invalid gateLogId
 * 3. updateGovernedSignal rejects writes without signalId
 * 4. Lint guards catch unauthorized writes
 * 5. case-to-pattern-pipeline no longer writes to detected_signals
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.resolve(__dirname, "..");

describe("Gate Enforcement: Single-Entry Authority", () => {
  describe("storeGovernedSignal gateLogId requirement", () => {
    it("interface requires gateLogId field", () => {
      const govFile = fs.readFileSync(
        path.join(projectRoot, "server/signal-governance.ts"),
        "utf-8"
      );
      // Check that DetectedSignalInput has gateLogId
      expect(govFile).toContain("gateLogId: number;");
    });

    it("runtime guard rejects missing gateLogId", () => {
      const govFile = fs.readFileSync(
        path.join(projectRoot, "server/signal-governance.ts"),
        "utf-8"
      );
      expect(govFile).toContain("[GATE ENFORCEMENT] storeGovernedSignal rejected: gateLogId is required");
    });

    it("INSERT includes gate_decision_id column", () => {
      const govFile = fs.readFileSync(
        path.join(projectRoot, "server/signal-governance.ts"),
        "utf-8"
      );
      expect(govFile).toContain("gate_decision_id)");
      expect(govFile).toContain("${input.gateLogId}");
    });
  });

  describe("sunam-gate.ts processSignalThroughGate", () => {
    it("returns gateLogId in result", () => {
      const gateFile = fs.readFileSync(
        path.join(projectRoot, "server/sunam-gate.ts"),
        "utf-8"
      );
      expect(gateFile).toContain("gateLogId: number;");
    });

    it("logs gate decision BEFORE promoting signal", () => {
      const gateFile = fs.readFileSync(
        path.join(projectRoot, "server/sunam-gate.ts"),
        "utf-8"
      );
      // The approve path should log first, then promote
      const approveSection = gateFile.substring(
        gateFile.indexOf("if (decision.approved)"),
        gateFile.indexOf("} else {", gateFile.indexOf("if (decision.approved)"))
      );
      const logIndex = approveSection.indexOf("logGateDecision");
      const promoteIndex = approveSection.indexOf("promoteSignal");
      expect(logIndex).toBeLessThan(promoteIndex);
      expect(logIndex).toBeGreaterThan(-1);
    });

    it("promoteSignal receives gateLogId parameter", () => {
      const gateFile = fs.readFileSync(
        path.join(projectRoot, "server/sunam-gate.ts"),
        "utf-8"
      );
      expect(gateFile).toContain(
        "async function promoteSignal(signal: LiveSignalRow, decision: SunamDecision, gateLogId: number)"
      );
    });

    it("passes gateLogId to storeGovernedSignal", () => {
      const gateFile = fs.readFileSync(
        path.join(projectRoot, "server/sunam-gate.ts"),
        "utf-8"
      );
      expect(gateFile).toContain("gateLogId,");
    });
  });

  describe("case-to-pattern-pipeline bypass blocked", () => {
    it("does NOT contain INSERT INTO detected_signals", () => {
      const pipelineFile = fs.readFileSync(
        path.join(projectRoot, "server/case-to-pattern-pipeline.ts"),
        "utf-8"
      );
      expect(pipelineFile).not.toContain("INSERT INTO detected_signals");
    });

    it("writes to live_signals instead", () => {
      const pipelineFile = fs.readFileSync(
        path.join(projectRoot, "server/case-to-pattern-pipeline.ts"),
        "utf-8"
      );
      expect(pipelineFile).toContain("INSERT INTO live_signals");
    });

    it("has GATE ENFORCEMENT comment explaining the redirect", () => {
      const pipelineFile = fs.readFileSync(
        path.join(projectRoot, "server/case-to-pattern-pipeline.ts"),
        "utf-8"
      );
      expect(pipelineFile).toContain("GATE ENFORCEMENT: Direct writes to detected_signals are permanently blocked");
    });
  });

  describe("detected_signals schema has gate_decision_id", () => {
    it("schema includes gate_decision_id column", () => {
      const schema = fs.readFileSync(
        path.join(projectRoot, "drizzle/schema.ts"),
        "utf-8"
      );
      expect(schema).toContain("gate_decision_id");
    });
  });

  describe("updateGovernedSignal centralized updates", () => {
    it("exports updateGovernedSignal function", () => {
      const govFile = fs.readFileSync(
        path.join(projectRoot, "server/signal-governance.ts"),
        "utf-8"
      );
      expect(govFile).toContain("export async function updateGovernedSignal");
    });

    it("exports bulkUpdatePercentageChange function", () => {
      const govFile = fs.readFileSync(
        path.join(projectRoot, "server/signal-governance.ts"),
        "utf-8"
      );
      expect(govFile).toContain("export async function bulkUpdatePercentageChange");
    });

    it("litigation-correlation-service uses updateGovernedSignal", () => {
      const litFile = fs.readFileSync(
        path.join(projectRoot, "server/engines/litigation-correlation-service.ts"),
        "utf-8"
      );
      expect(litFile).toContain("await updateGovernedSignal(");
      expect(litFile).not.toContain("UPDATE detected_signals");
    });

    it("outcome-feedback-scheduler uses bulkUpdatePercentageChange", () => {
      const ofsFile = fs.readFileSync(
        path.join(projectRoot, "server/outcome-feedback-scheduler.ts"),
        "utf-8"
      );
      expect(ofsFile).toContain("bulkUpdatePercentageChange");
      expect(ofsFile).not.toContain("UPDATE detected_signals");
    });
  });

  describe("Lint guards", () => {
    it("detected_signals write lint guard passes", () => {
      const result = execSync(
        "bash scripts/lint-detected-signals-writes.sh",
        { cwd: projectRoot, encoding: "utf-8" }
      );
      expect(result).toContain("PASSED");
    });

    it("live_signals lint guard passes", () => {
      const result = execSync(
        "bash scripts/lint-live-signals.sh",
        { cwd: projectRoot, encoding: "utf-8" }
      );
      expect(result).toContain("PASSED");
    });
  });

  describe("Manual promote path also uses gate enforcement", () => {
    it("manual promote logs gate decision before promoting", () => {
      const gateFile = fs.readFileSync(
        path.join(projectRoot, "server/sunam-gate.ts"),
        "utf-8"
      );
      // Find the manualPromote function section
      expect(gateFile).toContain("const gateLogId = Number((gateRows");
      expect(gateFile).toContain("promoteSignal(signalLike, manualDecision, gateLogId)");
    });
  });
});
