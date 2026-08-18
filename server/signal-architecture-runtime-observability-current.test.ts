import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("signal architecture current runtime observability", () => {
  const migration = read_repo_file(
    "../supabase/migrations/20260818095500_signal_architecture_runtime_projection_truth.sql",
  );
  const read_model = read_repo_file("./signal-architecture-read-model.ts");
  const page = read_repo_file("../client/src/pages/SignalRegistry.tsx");

  it("sources Atlas operator metrics from the current reflected runtime projection", () => {
    expect(migration).toContain("public.atlas_stream_runtime_projection_v1");
    expect(migration).toContain("where p.is_current");
    expect(migration).toContain("sum(p.observation_count)");
    expect(migration).toContain("sum(p.identity_bound_observation_count)");
    expect(migration).toContain("max(p.latest_observed_at)");
    expect(migration).not.toMatch(/from\s+public\.signal_events\b/i);
  });

  it("preserves canonical Domain 2/3 and convergence counters without mutating them", () => {
    expect(migration).toContain("public.legal_patterns where is_current");
    expect(migration).toContain("public.live_data_signals where is_current");
    expect(migration).toContain("public.signal_convergences where is_current");
    expect(migration).not.toMatch(/\b(insert|update|delete)\s+(into\s+|from\s+)?public\.(legal_patterns|live_data_signals|signal_convergences)\b/i);
  });

  it("keeps the existing Signal Registry read contract intact", () => {
    expect(read_model).toContain("public.v_signal_architecture_integrity");
    expect(read_model).toContain("atlas_raw_observation_count");
    expect(read_model).toContain("atlas_unique_observation_count");
    expect(read_model).toContain("atlas_replay_observation_count");
    expect(read_model).toContain("latest_atlas_observation_at");
    expect(page).toContain("get_signal_architecture.useQuery");
    expect(page).toContain("Unique Atlas observations");
  });
});
