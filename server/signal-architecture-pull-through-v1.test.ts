import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const ground_truth = read_repo_file(
  "../supabase/migrations/20260731185401_signal_architecture_ground_truth.sql",
);
const pull_through = read_repo_file(
  "../supabase/migrations/20260806043149_signal_architecture_pull_through_v1.sql",
);

describe("signal architecture pull-through v1", () => {
  it("preserves the three source domains and end-stage convergence", () => {
    expect(ground_truth).toContain("public.intake_signals");
    expect(ground_truth).toContain("public.legal_patterns");
    expect(ground_truth).toContain("public.live_data_signals");
    expect(ground_truth).toContain("public.signal_convergences");
    expect(pull_through).toContain("three_domain_convergence_ready");
  });

  it("classifies verified Atlas transport before canonical registration", () => {
    expect(pull_through).toContain("v_atlas_domain3_signal_candidates_v1");
    expect(pull_through).toContain("eligible_for_canonical_registration");
    expect(pull_through).toContain("systemic_candidate");
    expect(pull_through).toContain("unsupported_rule");
    expect(pull_through).toContain("No active Domain 3 source-classification rule exists");
  });

  it("keeps raw legislative observations out of Domain 3", () => {
    for (const signal_type of [
      "classification_activity",
      "jurisdiction_legislative_activity",
      "new_statute_or_bill",
    ]) {
      expect(pull_through).toContain(`'${signal_type}'`);
    }
    expect(pull_through).toContain("'observation_only'");
    expect(pull_through).toContain(
      "The existence of a new bill or statute is an Atlas observation and Docket input, not a Domain 3 systemic signal.",
    );
  });

  it("keeps stream health in operational telemetry", () => {
    expect(pull_through).toContain("'stream_health_alert'");
    expect(pull_through).toContain("'operational_only'");
    expect(pull_through).toContain(
      "Stream health describes pipeline operation. It must not be represented as civic harm, actor misconduct, or systemic failure.",
    );
  });

  it("does not populate canonical or legacy signal tables", () => {
    expect(pull_through).not.toMatch(/insert\s+into\s+public\.live_data_signals\b/i);
    expect(pull_through).not.toMatch(/insert\s+into\s+public\.intake_signals\b/i);
    expect(pull_through).not.toMatch(/insert\s+into\s+public\.legal_patterns\b/i);
    expect(pull_through).not.toMatch(/insert\s+into\s+public\.signal_convergences\b/i);
    expect(pull_through).not.toMatch(/insert\s+into\s+public\.detected_signals\b/i);
    expect(pull_through).not.toMatch(/insert\s+into\s+public\.live_signals\b/i);
  });

  it("ships a deterministic Prism handoff snapshot", () => {
    expect(pull_through).toContain("get_signal_pull_through_snapshot_v1");
    expect(pull_through).toContain("snapshot_hash");
    expect(pull_through).toContain("generated_at is excluded from snapshot_hash");
    expect(pull_through).toContain("luminari.signal_pull_through.v1");
  });

  it("is service-role only and preserves source evidence", () => {
    expect(pull_through).toContain(
      "revoke all on function public.get_signal_pull_through_snapshot_v1()",
    );
    expect(pull_through).toContain(
      "grant execute on function public.get_signal_pull_through_snapshot_v1()",
    );
    expect(pull_through).not.toMatch(/delete\s+from\s+public\./i);
    expect(pull_through).not.toMatch(/truncate\s+public\./i);
    expect(pull_through).not.toMatch(/drop\s+table\s+public\./i);
  });
});
