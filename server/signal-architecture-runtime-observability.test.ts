import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("signal architecture runtime observability", () => {
  const migration = readRepoFile(
    "../supabase/migrations/20260818003000_signal_architecture_runtime_projection_truth.sql",
  );
  const readModel = readRepoFile("./signal-architecture-read-model.ts");
  const page = readRepoFile("../client/src/pages/SignalRegistry.tsx");

  it("sources Atlas corpus metrics from the current reflected runtime projection", () => {
    expect(migration).toContain("public.atlas_stream_runtime_projection_v1");
    expect(migration).toContain("where p.is_current");
    expect(migration).toContain("sum(p.observation_count)");
    expect(migration).toContain("sum(p.identity_bound_observation_count)");
    expect(migration).toContain("max(p.latest_observed_at)");
    expect(migration).not.toMatch(/from\s+public\.signal_events\b/i);
  });

  it("preserves legacy mixed stores as quarantine counters only", () => {
    expect(migration).toContain("legacy_detected_signals_are_unclassified_evidence");
    expect(migration).toContain("current_atlas_runtime_projection_is_operator_observation_truth");
    expect(migration).not.toMatch(/insert\s+into\s+public\.(detected_signals|live_signals)\b/i);
    expect(migration).not.toMatch(/update\s+public\.(detected_signals|live_signals)\b/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.(detected_signals|live_signals)\b/i);
  });

  it("keeps the existing canonical read-model contract intact", () => {
    expect(readModel).toContain("public.v_signal_architecture_integrity");
    expect(readModel).toContain("atlas_raw_observation_count");
    expect(readModel).toContain("atlas_unique_observation_count");
    expect(readModel).toContain("atlas_replay_observation_count");
    expect(readModel).toContain("latest_atlas_observation_at");
    expect(page).toContain("get_signal_architecture.useQuery");
    expect(page).toContain("Unique Atlas observations");
  });
});
