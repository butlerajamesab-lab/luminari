import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./intake-source-semantic-coverage.ts", import.meta.url), "utf8");
const analyze = readFileSync(new URL("./routers/analyze.ts", import.meta.url), "utf8");
const integrity = readFileSync(new URL("../client/src/pages/IntegrityDashboard.tsx", import.meta.url), "utf8");

describe("source semantic coverage continuity contract", () => {
  it("does not collapse preservation into interpretation", () => {
    expect(service).toContain("some_semantic_use_does_not_prove_complete_interpretation: true");
    expect(service).toContain('"image_interpretation_unproven"');
    expect(service).toContain('"source_interpretation_unproven"');
    expect(service).toContain("zero_semantic_use_requires_explicit_review: true");
  });

  it("exposes and renders source-to-semantic accounting on the integrity surface", () => {
    expect(analyze).toContain("getIntakeSourceSemanticCoverage");
    expect(analyze).toContain("read_case_source_semantic_coverage");
    expect(integrity).toContain("trpc.analyze.getIntakeSourceSemanticCoverage.useQuery");
    expect(integrity).toContain("Image interpretation is not proven");
    expect(integrity).toContain("This is an interpretation gap, not a preservation failure.");
    expect(integrity).toContain("does not prove that every meaningful fact in that source was interpreted");
  });
});
