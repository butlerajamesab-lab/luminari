import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const app = read("../client/src/App.tsx");
const canonical_shell = read("../client/src/pages/MissionControlShell.tsx");
const containment_shell = read("../client/src/pages/MissionControlContainmentShell.tsx");
const schema_ledger_hook = read("../client/src/hooks/mission/useMissionControlSchemaLedger.ts");
const server_entry = read("./_core/index.ts");

describe("Mission Control canonical-surface source contract", () => {
  it("keeps the complete Mission Control surface at the canonical route", () => {
    expect(canonical_shell).toContain('from "./MissionControl"');
    expect(canonical_shell).not.toContain('from "./MissionControlContainmentShell"');
    expect(app).toContain('<Route path="/mission-control/full" component={MissionControl} />');
    expect(app).toContain('<Route path="/mission-control" component={MissionControlShell} />');
  });

  it("preserves the containment implementation without substituting it for Mission Control", () => {
    expect(containment_shell).toContain("MissionControlContainmentShell");
    expect(containment_shell).toContain("Load Overview Data");
  });

  it("uses the mounted schema-ledger endpoint directly", () => {
    expect(schema_ledger_hook).toContain('const SCHEMA_LEDGER_ENDPOINT = "/api/system/schema"');
    expect(schema_ledger_hook).not.toContain("/api/roots/schema/ledger");
  });

  it("preserves path-level diagnostics for completed and prematurely closed slow requests", () => {
    expect(server_entry).toContain('console.warn("[HTTP] slow_request"');
    expect(server_entry).toContain("path: req.path");
    expect(server_entry).toContain("if (duration_ms < 2_000) return;");
    expect(server_entry).toContain('res.once("finish"');
    expect(server_entry).toContain('res.once("close"');
    expect(server_entry).toContain("let receipt_emitted = false;");
    expect(server_entry).not.toContain("originalUrl:");

    const diagnostics_index = server_entry.indexOf("registerSlowRequestDiagnostics(app);");
    const json_parser_index = server_entry.indexOf('app.use(express.json({ limit: "50mb" }))');
    expect(diagnostics_index).toBeGreaterThanOrEqual(0);
    expect(diagnostics_index).toBeLessThan(json_parser_index);
  });
});
