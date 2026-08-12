import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseline = readFileSync(new URL("../supabase/verification/atomic_corpus_scale_baseline.md", import.meta.url), "utf8");

describe("atomic corpus scale baseline", () => {
  it("records historical substrate counts as a coverage oracle, not an additive canonical total", () => {
    expect(baseline).toContain("56,398 broad/overlapping rows");
    expect(baseline).toContain("53,603 source-bound resource candidates");
    expect(baseline).toContain("coverage baseline, not a canonical identity count and not an additive total");
  });

  it("records the large artifacts that were previously skipped or shallowly parsed", () => {
    expect(baseline).toContain("19,915,663 bytes; 0 fresh typed candidates");
    expect(baseline).toContain("13,908,350 bytes; 0 fresh typed candidates");
    expect(baseline).toContain("6,185,520 bytes; 0 fresh typed candidates");
    expect(baseline).toContain("12,436,369 bytes; only 15 fresh typed candidates");
  });
});
