import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("canonical three-domain signal architecture", () => {
  const migration = read_repo_file(
    "../supabase/migrations/20260731190500_signal_architecture_ground_truth.sql",
  );
  const router = read_repo_file("./routers/enforcement-intel.ts");
  const page = read_repo_file("../client/src/pages/SignalRegistry.tsx");

  it("keeps all three source domains in separate canonical stores", () => {
    expect(migration).toContain("create table if not exists public.intake_signals");
    expect(migration).toContain("create table if not exists public.legal_patterns");
    expect(migration).toContain("create table if not exists public.live_data_signals");
    expect(migration).toContain("create table if not exists public.signal_convergences");
    expect(migration).not.toMatch(/insert\s+into\s+public\.detected_signals\b/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.live_signals\b/i);
  });

  it("requires explicit Atlas evidence, entity status, severity, and confidence", () => {
    expect(migration).toContain("source_event_refs jsonb not null");
    expect(migration).toContain("entity_resolution_status text not null");
    expect(migration).toContain("severity text not null");
    expect(migration).toContain("confidence_score numeric(7,6) not null");
    expect(migration).toContain("supporting_statistics jsonb not null");
    expect(migration).toContain("live-data signal requires at least one Atlas source event reference");
    expect(migration).toContain("live-data signal requires non-empty supporting statistics");
    expect(migration).not.toContain("confidence_score ?? 0.5");
  });

  it("requires one canonical record from every domain before convergence", () => {
    expect(migration).toContain(
      "intake_signal_id uuid not null references public.intake_signals(signal_id)",
    );
    expect(migration).toContain(
      "legal_pattern_id uuid not null references public.legal_patterns(pattern_id)",
    );
    expect(migration).toContain(
      "live_data_signal_id uuid not null references public.live_data_signals(live_data_signal_id)",
    );
    expect(migration).toContain("convergence_type = 'three_domain_intersection'");
  });

  it("is append-only, replay-safe, RLS-enabled, and service-role written", () => {
    expect(migration).toContain("guard_signal_architecture_immutable_v1");
    expect(migration).toContain("on conflict (signal_hash) do nothing");
    expect(migration).toContain("on conflict (pattern_hash) do nothing");
    expect(migration).toContain("on conflict (convergence_hash) do nothing");
    expect(migration).toContain("alter table public.intake_signals enable row level security");
    expect(migration).toContain("alter table public.legal_patterns enable row level security");
    expect(migration).toContain("alter table public.live_data_signals enable row level security");
    expect(migration).toContain("alter table public.signal_convergences enable row level security");
    expect(migration).toContain("grant execute on function public.register_live_data_signal_v1(jsonb) to service_role");
  });

  it("keeps legacy mixed rows and raw Atlas observations explicitly noncanonical", () => {
    expect(migration).toContain("legacy_detected_signals_are_unclassified_evidence");
    expect(migration).toContain("raw_atlas_observations_are_not_live_data_signals");
    expect(migration).not.toMatch(/delete\s+from\s+public\.detected_signals/i);
    expect(migration).not.toMatch(/truncate\s+.*detected_signals/i);
    expect(migration).not.toMatch(/drop\s+(table|view)\s+.*detected_signals/i);
  });

  it("protects intake detail on the cross-system runtime surface", () => {
    expect(router).toContain("get_signal_architecture: protectedProcedure");
    expect(router).toContain('const is_intake = row.domain_code === "case_intake"');
    expect(router).toContain('title: is_intake ? "Case-intake breakpoint"');
    expect(router).toContain("Individual intake details are restricted");
  });

  it("renders the canonical architecture instead of the mixed legacy registry", () => {
    expect(page).toContain("get_signal_architecture.useQuery");
    expect(page).toContain("Three independent source domains");
    expect(page).toContain("Raw Atlas observations");
    expect(page).toContain("Evidence ledger—not Domain 3 signal cards");
    expect(page).toContain("Legacy mixed rows quarantined");
  });
});