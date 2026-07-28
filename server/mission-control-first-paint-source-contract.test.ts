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

describe("Mission Control first-paint source contract", () => {
  it("keeps the canonical route on the bounded overview while preserving the full surface", () => {
    expect(canonical_shell).toContain('from "./MissionControlContainmentShell"');
    expect(canonical_shell).not.toContain('from "./MissionControl"');
    expect(app).toContain('<Route path="/mission-control/full" component={MissionControl} />');
    expect(app).toContain('<Route path="/mission-control" component={MissionControlShell} />');
  });

  it("does not execute the heavy overview fan-out on first paint", () => {
    expect(containment_shell).toContain("enabled: false");
    expect(containment_shell).toContain("Load Overview Data");
    expect(containment_shell).toContain("await knowledgePopulation.refetch();");
    expect(containment_shell).toContain("await caseActivity.refetch();");
    expect(containment_shell).toContain("await structuralSignals.refetch();");
    expect(containment_shell).toContain("await workQueue.refetch();");

    const knowledge_index = containment_shell.indexOf("await knowledgePopulation.refetch();");
    const case_index = containment_shell.indexOf("await caseActivity.refetch();");
    const signal_index = containment_shell.indexOf("await structuralSignals.refetch();");
    const queue_index = containment_shell.indexOf("await workQueue.refetch();");
    expect(knowledge_index).toBeLessThan(case_index);
    expect(case_index).toBeLessThan(signal_index);
    expect(signal_index).toBeLessThan(queue_index);
  });

  it("does not probe an unmounted schema-ledger route before the real endpoint", () => {
    expect(schema_ledger_hook).toContain('const SCHEMA_LEDGER_ENDPOINT = "/api/system/schema"');
    expect(schema_ledger_hook).not.toContain("/api/roots/schema/ledger");
  });

  it("emits path-level diagnostics for future slow requests without logging query strings", () => {
    expect(server_entry).toContain('console.warn("[HTTP] slow_request"');
    expect(server_entry).toContain("path: req.path");
    expect(server_entry).toContain("if (duration_ms < 2_000) return;");
    expect(server_entry).not.toContain("originalUrl:");
  });
});
