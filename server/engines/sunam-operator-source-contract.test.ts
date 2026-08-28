import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const executor = read("./sunam-executor.ts");
const context_builder = read("./system-copilot-sunam.ts");
const executor_routes = read("../executor-routes.ts");
const session_router = read("../routers/session76-router.ts");
const sovereign_control = read("../../client/src/pages/SovereignControl.tsx");

describe("Sunam operator source contract", () => {
  it("uses the same operational tool registry for display, planning, dispatch, and execution", () => {
    expect(executor).toContain("const visibleToolNames = getSunamVisibleToolNames()");
    expect(executor).toContain("if (isSunamToolAllowed(candidate))");
    expect(executor).toContain("SUNAM_TOOLS.map");
    expect(executor).toContain("SUNAM_TOOL_NAMES.has(toolName)");
    expect(executor).toContain("SUNAM_OPERATOR_TOOLS");
    expect(executor).toContain("SUNAM_SERVICE_ONLY_TOOLS.filter");
    expect(executor).toContain("!SUNAM_OPERATOR_TOOL_NAMES.has(tool.function.name)");
  });

  it("preserves operational and case-service capabilities in one deduplicated registry", () => {
    expect(executor).toContain("...SUNAM_OPERATOR_TOOLS");
    expect(executor).toContain("...SUNAM_SERVICE_ONLY_TOOLS.filter");
    expect(executor).toContain("Duplicate names (the");
  });

  it("routes standard operator actions deterministically", () => {
    expect(executor).toContain("resolve_direct_sunam_instruction(instruction)");
    expect(executor).toContain("direct_instruction.tool_name");
    expect(executor).toContain("direct_instruction.args");
  });

  it("launches only registry-eligible bulk stream work without holding the operator request open", () => {
    expect(executor).toContain("launch_sunam_background_ingestion");
    expect(executor).toContain("get_sunam_run_all_selection");
    expect(executor).toContain("get_sunam_retry_selection");
    expect(executor).toContain('registry_truth_source: "data_stream_registry"');
    expect(executor).toContain('completion_source: "ingest_runs"');
    expect(executor).toContain("summarize_sunam_exclusions");
    expect(executor).not.toContain("ingestRuns.datasetId");
    expect(executor).not.toContain("where(eq(dataStreamRegistry.enabled, true))");
  });

  it("uses the canonical PostgreSQL-safe stream selector for the Data Stream Manager button", () => {
    expect(executor_routes).toContain("get_sunam_run_all_selection");
    expect(executor_routes).toContain("summarize_sunam_exclusions");
    expect(executor_routes).toContain('registry_truth_source: "data_stream_registry"');
    expect(executor_routes).toContain('completion_source: "ingest_runs"');
    expect(executor_routes).not.toContain("enabled_dsr = 1");
    expect(executor_routes).not.toContain("auto_disabled_dsr = 0");
    expect(executor_routes).not.toContain("success: true,\n            message: \"OK\"");
  });

  it("preserves executor result truth instead of forcing failed stream runs to success", () => {
    expect(executor_routes).toContain("const success = normalized.success !== false");
    expect(executor_routes).toContain("const run_success = result.success === true");
    expect(executor_routes).toContain("if (run_success) succeeded += 1");
    expect(executor_routes).toContain("else failed += 1");
  });

  it("uses PostgreSQL result.rows for system context", () => {
    expect(context_builder).toContain("query_with_diagnostics<{ tablename: string }>");
    expect(context_builder).toContain("table_result.rows");
    expect(context_builder).not.toContain("tableResult[0]");
  });

  it("keeps direct operator mutations behind the admin procedure", () => {
    expect(session_router).toContain("execute: adminProcedure");
    expect(session_router).toContain("getTools: adminProcedure");
    expect(session_router).toContain("dispatchTool: adminProcedure");
  });

  it("describes Sunam's actual governed authority instead of claiming direct SQL access", () => {
    expect(sovereign_control).toContain(
      "Sunam has governed authority over streams, engines, scheduler, diagnostics, configuration, and UI.",
    );
    expect(sovereign_control).not.toContain(
      "Sunam has full authority over streams, engines, SQL, migrations, config, and UI.",
    );
  });
});
