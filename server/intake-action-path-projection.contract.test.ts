import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const analyze = readFileSync(resolve(here, "routers/analyze.ts"), "utf8");
const engine = readFileSync(resolve(here, "engines/intake-spine/layer-14-action_paths.ts"), "utf8");
const component = readFileSync(resolve(here, "../client/src/components/CaseActionPaths.tsx"), "utf8");
const page = readFileSync(resolve(here, "../client/src/pages/EnforcementPathway.tsx"), "utf8");

describe("case-bound Layer 14 procedural path projection", () => {
  it("exposes the sealed action_paths layer through the case-owned Analyze boundary", () => {
    expect(analyze).toContain("getIntakeActionPathProjection");
    expect(analyze).toContain("'action_paths'");
    expect(analyze).toContain("verifyCaseOwnership(input.caseId, ctx.user.id)");
  });

  it("preserves the engine's no-ranking and candidate-only contract", () => {
    expect(engine).toContain("ranking_policy: 'none_present_all_deterministically'");
    expect(engine).toContain("status: 'candidate_unverified'");
    expect(engine).toContain("expectedBurden: string | null = null");
    expect(component).toContain("does not rank, recommend");
    expect(component).toContain("Unresolved — not inferred");
  });

  it("keeps incomplete footholds and candidate deadlines visibly unresolved", () => {
    expect(component).toContain("Foothold incomplete");
    expect(component).toContain("Deadline candidates — not binding until resolved");
    expect(component).toContain("Unresolved dependencies");
  });

  it("separates the global reference library from case applicability", () => {
    expect(page).toContain("Global Enforcement Pathway Reference Library");
    expect(page).toContain("A reference model does not establish case applicability");
    expect(page).toContain("Add Reference");
    expect(page).not.toContain("Set as My Strategy");
  });

  it("uses the canonical Architecture Map route", () => {
    expect(page).toContain('navigate("/architecture-map")');
    expect(page).not.toContain('navigate("/architecture")');
  });
});
