import { should_forward_session } from "../client/src/lib/session-forwarding";
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
  it("forwards the Supabase session only to same-origin /api paths", () => {
    const main = source("client/src/main.tsx");
    const origin = "https://lighthouse.example";
    // Administrator REST paths are covered; every other origin is refused.
    expect(should_forward_session("/api/db-diagnostic", origin)).toBe(true);
    expect(should_forward_session("/api/system/health", origin)).toBe(true);
    expect(should_forward_session("https://elsewhere.example/api/system/health", origin)).toBe(false);
    expect(main).toContain("should_forward_session(input, window.location.origin)");
    expect(main).toContain('headers.set("x-lighthouse-supabase-session", sessionToken)');
    expect(main).toContain('credentials: "include"');
    expect(main).toContain("nativeFetch(input");
  });
});
