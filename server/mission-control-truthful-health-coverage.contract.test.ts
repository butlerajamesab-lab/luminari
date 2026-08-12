import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Mission Control truthful knowledge coverage", () => {
  it("does not count runtime reform history as missing seed knowledge", () => {
    const hook = source("client/src/hooks/mission/useMissionControlData.ts");
    expect(hook).toContain('"reform_package_versions"');
    expect(hook).toContain('"reform_strategy_memory"');
    expect(hook).toContain("RUNTIME_DERIVED_KNOWLEDGE_TABLES");
    expect(hook).toContain('"no_runtime_history_yet"');
  });

  it("bounds seed coverage instead of calling raw saturation coverage", () => {
    const hook = source("client/src/hooks/mission/useMissionControlData.ts");
    expect(hook).toContain("Math.min(count, target)");
    expect(hook).toContain("rawSeedSaturation");
    expect(hook).toContain('coverageBasis: "bounded_seed_threshold"');
    expect(hook).toContain("Math.min(100, Math.round((boundedSeedRows / totalTarget) * 100))");
  });
});

describe("protected REST authentication propagation", () => {
  it("forwards the Supabase session only to same-origin administrator REST paths", () => {
    const main = source("client/src/main.tsx");
    expect(main).toContain('"/api/db-diagnostic"');
    expect(main).toContain('"/api/system/"');
    expect(main).toContain('url.origin !== window.location.origin');
    expect(main).toContain('headers.set("x-lighthouse-supabase-session", sessionToken)');
    expect(main).toContain('credentials: "include"');
    expect(main).toContain("nativeFetch(input");
  });
});
