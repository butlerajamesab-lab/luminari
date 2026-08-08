import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const reader = readFileSync(resolve(here, "intake-case-layer-reader.ts"), "utf8");
const analyze = readFileSync(resolve(here, "routers/analyze.ts"), "utf8");
const claimPage = readFileSync(resolve(here, "../client/src/pages/ClaimElements.tsx"), "utf8");

describe("case-bound claim candidate projection", () => {
  it("reads every explicitly linked case session and only sealed completed layer executions", () => {
    expect(reader).toContain("public.case_identity_bridge");
    expect(reader).toContain("public.case_intake_links");
    expect(reader).toContain("lr.run_status = 'completed'");
    expect(reader).toContain("lr.is_sealed = true");
  });

  it("recomputes the canonical output hash before exposing layer data", () => {
    expect(reader).toContain("recomputed_output_hash = computeHash(metadata.data)");
    expect(reader).toContain("recomputed_output_hash !== row.output_hash");
    expect(reader).toContain('row.artifact_type !== "intake_layer_output"');
    expect(reader).toContain('row.artifact_status !== "preserved"');
  });

  it("keeps Layer 12 candidates explicitly separate from the legacy claims table", () => {
    expect(analyze).toContain("getIntakeClaimCandidateProjection");
    expect(analyze).toContain("'rights_and_duties_matrix'");
    expect(claimPage).toContain("Case applicability is separated from the global legal library");
    expect(claimPage).toContain("Candidate — unverified");
    expect(claimPage).toContain("Global Claim Element Library");
  });

  it("does not collapse candidate applicability into a legal conclusion", () => {
    expect(claimPage).toContain("not a legal conclusion");
    expect(claimPage).toContain("evaluation_state");
    expect(claimPage).toContain("Deadline candidates — not claim-specific");
  });
});
