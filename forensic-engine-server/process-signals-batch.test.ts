import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * process_signals_batch — structural and contract tests.
 * 
 * These validate:
 * 1. The module exists and exports the correct function
 * 2. The function signature matches the contract
 * 3. The direct executor bypass in sunam-executor.ts is wired correctly
 * 4. No data_stream_registry writes, no NL replanning for this action
 * 5. sunam_gate_log is used for dedup tracking
 */

const batchModulePath = path.resolve(__dirname, "process-signals-batch.ts");
const executorPath = path.resolve(__dirname, "engines/sunam-executor.ts");

describe("process_signals_batch — Module Contract", () => {
  it("module file exists", () => {
    expect(fs.existsSync(batchModulePath)).toBe(true);
  });

  it("exports processSignalsBatch function", async () => {
    const mod = await import("./process-signals-batch");
    expect(typeof mod.processSignalsBatch).toBe("function");
  });

  it("module does NOT import from data_stream_registry or register any streams", () => {
    const src = fs.readFileSync(batchModulePath, "utf-8");
    expect(src).not.toContain("dataStreamRegistry");
    expect(src).not.toContain("data_stream_registry");
    expect(src).not.toContain("register_stream");
    expect(src).not.toContain("registerStream");
  });

  it("module reads from live_signals and writes to detected_signals via gate", () => {
    const src = fs.readFileSync(batchModulePath, "utf-8");
    expect(src).toContain("live_signals");
    expect(src).toContain("sunam_gate_log");
    expect(src).toContain("processSignalThroughGate");
  });

  it("module returns the required output fields", () => {
    const src = fs.readFileSync(batchModulePath, "utf-8");
    expect(src).toContain("processed");
    expect(src).toContain("inserted");
    expect(src).toContain("skipped");
    expect(src).toContain("failed");
    expect(src).toContain("final_detected_signals_count");
  });
});

describe("process_signals_batch — Executor Wiring", () => {
  const executorSrc = fs.readFileSync(executorPath, "utf-8");

  it("is registered in SUNAM_TOOLS", () => {
    expect(executorSrc).toContain('"process_signals_batch"');
  });

  it("has a direct case in dispatchTool switch", () => {
    expect(executorSrc).toContain('case "process_signals_batch"');
  });

  it("has a direct executor bypass BEFORE NL parsing", () => {
    const bypassIdx = executorSrc.indexOf("Direct Executor Bypass");
    const nlParserIdx = executorSrc.indexOf("Phase 1: Natural Language Parsing");
    expect(bypassIdx).toBeGreaterThan(-1);
    expect(nlParserIdx).toBeGreaterThan(-1);
    expect(bypassIdx).toBeLessThan(nlParserIdx);
  });

  it("bypass does NOT call buildSystemContext or parseNaturalLanguage", () => {
    // Extract just the bypass block
    const bypassStart = executorSrc.indexOf("Direct Executor Bypass");
    const bypassEnd = executorSrc.indexOf("// Build system context", bypassStart);
    const bypassBlock = executorSrc.substring(bypassStart, bypassEnd);
    expect(bypassBlock).not.toContain("buildSystemContext");
    expect(bypassBlock).not.toContain("parseNaturalLanguage");
  });

  it("bypass does NOT write to data_stream_registry", () => {
    const bypassStart = executorSrc.indexOf("Direct Executor Bypass");
    const bypassEnd = executorSrc.indexOf("// Build system context", bypassStart);
    const bypassBlock = executorSrc.substring(bypassStart, bypassEnd);
    expect(bypassBlock).not.toContain("data_stream_registry");
    expect(bypassBlock).not.toContain("dataStreamRegistry");
  });

  it("bypass returns correct result shape", () => {
    const bypassStart = executorSrc.indexOf("Direct Executor Bypass");
    const bypassEnd = executorSrc.indexOf("// Build system context", bypassStart);
    const bypassBlock = executorSrc.substring(bypassStart, bypassEnd);
    expect(bypassBlock).toContain("final_response");
    expect(bypassBlock).toContain("actions_taken: 1");
    expect(bypassBlock).toContain("success: true");
    expect(bypassBlock).toContain("executed_by");
  });
});
