import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL(
    "../supabase/migrations/20260818085239_domain2_current_prism_generation.sql",
    import.meta.url,
  )),
  "utf8",
);

describe("Signal Domain 2 Prism current-generation fence", () => {
  it("publishes only the newest completed verification generation for an assembly", () => {
    expect(migration).toContain("v_latest_verification_run_id");
    expect(migration).toContain("where verification.assembly_run_id = v_assembly_run_id");
    expect(migration).toContain("order by verification.completed_at desc, verification.verification_run_id desc");
    expect(migration).toContain("if p_verification_run_id <> v_latest_verification_run_id then");
    expect(migration).toContain("return 0");
  });

  it("explicitly supersedes the prior current pattern for the same assembly and check", () => {
    expect(migration).toContain("from public.legal_patterns pattern");
    expect(migration).toContain("pattern.is_current");
    expect(migration).toContain("pattern.rule_id = v_record->>'rule_id'");
    expect(migration).toContain("'assembly_run_id', v_assembly_run_id");
    expect(migration).toContain("jsonb_build_object('supersedes_id', v_supersedes_id)");
    expect(migration).toContain("public.register_legal_pattern_v1(v_record)");
  });

  it("keeps the Domain 2 projector outside Atlas and convergence ownership", () => {
    expect(migration).not.toContain("public.live_data_signals");
    expect(migration).not.toContain("register_live_data_signal_v1");
    expect(migration).not.toContain("public.signal_convergences");
    expect(migration).not.toContain("register_signal_convergence_v1");
  });
});
