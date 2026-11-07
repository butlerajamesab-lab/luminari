import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proposal = readFileSync(
  new URL(
    "../supabase/proposals/20261106_signal_architecture_family_counts.proposal.sql",
    import.meta.url,
  ),
  "utf8",
);
const read_model = readFileSync(
  new URL("./signal-architecture-read-model.ts", import.meta.url),
  "utf8",
);

describe("Signal architecture per-family classification contract", () => {
  it("adds the five audit family counts to the integrity view, additively", () => {
    expect(proposal).toContain(
      "CREATE OR REPLACE VIEW public.v_signal_architecture_integrity",
    );
    expect(proposal).toContain("AS cited_legal_analysis_count");
    expect(proposal).toContain("AS retired_detector_stub_count");
    expect(proposal).toContain("AS early_source_record_count");
    expect(proposal).toContain("AS gate_staging_history_count");
    expect(proposal).toContain("AS governed_staging_promotion_count");
    // The family predicates are the audit's: weak-joint registry rows are
    // the cited analysis; every other registry row is a retired stub;
    // staging splits on the gate's own decision.
    expect(proposal).toContain("signal_registry.signal_type = 'weak_joint'");
    expect(proposal).toContain("signal_registry.signal_type <> 'weak_joint'");
    expect(proposal).toContain("extraction_staging.gate_decision = 'staged'");
    expect(proposal).toContain("extraction_staging.gate_decision = 'promoted'");
  });

  it("surfaces the families through the read model", () => {
    expect(read_model).toContain("legacy_families");
    expect(read_model).toContain("cited_legal_analysis_count");
    expect(read_model).toContain("bridged_live_signal_count");
  });
});
