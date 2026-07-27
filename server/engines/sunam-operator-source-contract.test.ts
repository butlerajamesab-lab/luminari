import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const executor = read("./sunam-executor.ts");
const context_builder = read("./system-copilot-sunam.ts");
const session_router = read("../routers/session76-router.ts");
const sovereign_control = read("../../client/src/pages/SovereignControl.tsx");

describe("Sunam operator source contract", () => {
  it("uses the same operational tool registry for display, planning, dispatch, and execution", () => {
    expect(executor).toContain("tools: SUNAM_TOOLS");
    expect(executor).toContain("SUNAM_TOOLS.map");
    expect(executor).toContain("SUNAM_TOOL_NAMES.has(toolName)");
    expect(executor).not.toContain("SUNAM_SERVICE_ONLY_TOOLS");
    expect(executor).not.toContain("sunam-service-only-tools");
  });

  it("routes standard operator actions deterministically", () => {
    expect(executor).toContain("resolve_direct_sunam_instruction(instruction)");
    expect(executor).toContain("direct_instruction.tool_name");
    expect(executor).toContain("direct_instruction.args");
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
