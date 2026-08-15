import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("canonical three-domain signal architecture", () => {
  const migration = read_repo_file(
    "../supabase/migrations/20260731185401_signal_architecture_ground_truth.sql",
  );
  const identity_projection = read_repo_file(
    "../supabase/migrations/20260731192928_atlas_observation_identity_projection.sql",
  );
  const semantic_identity_v2 = read_repo_file(
    "../supabase/migrations/20260815091332_live_data_signal_entity_aware_semantic_identity_v2.sql",
  );
  const retirement = read_repo_file(
    "../supabase/migrations/20260815092436_live_data_signal_retirement_receipts.sql",
  );
  const atlas_receipt_router = read_repo_file("./routes/atlas-domain3-receipt-router.ts");
  const root_router = read_repo_file("./routers.ts");
  const production_router = read_repo_file("./routers/enforcement-intelligence.ts");
  const compatibility_router = read_repo_file("./routers/enforcement-intel.ts");
  const read_model = read_repo_file("./signal-architecture-read-model.ts");
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

  it("separates unique Atlas identities from historical replay volume", () => {
    expect(identity_projection).toContain("atlas_unique_observation_count");
    expect(identity_projection).toContain("atlas_replay_observation_count");
    expect(identity_projection).toContain(
      "count(distinct public.lighthouse_atlas_event_identity_hash_v1",
    );
    expect(read_model).toContain("atlas_unique_observation_count");
    expect(read_model).toContain("atlas_replay_observation_count");
  });

  it("uses the same entity-aware semantic identity as Atlas without rewriting history", () => {
    expect(semantic_identity_v2).toContain("live_data_signal_semantic_key_v2");
    expect(semantic_identity_v2).toContain("p_entity_ids text[]");
    expect(semantic_identity_v2).toContain("atlas.propublica_unresolved_filing_metadata_rate");
    expect(semantic_identity_v2).toContain("string_agg(value, chr(30) order by value)");
    expect(semantic_identity_v2).toContain("v_supplied_semantic_key <> v_semantic_key");
    expect(semantic_identity_v2).toContain("public.live_data_signal_semantic_key_v2(");
    expect(semantic_identity_v2).not.toMatch(/update\s+public\.live_data_signals\s+set\s+atlas_semantic_key/i);
    expect(semantic_identity_v2).toContain("preserving immutable v1 historical records");
  });

  it("retires only the exact current Atlas projection and preserves an append-only receipt", () => {
    expect(retirement).toContain("live_data_signal_retirement_receipt_v1");
    expect(retirement).toContain("retire_live_data_signal_transport_receipt_v1");
    expect(retirement).toContain("and s.atlas_candidate_id = v_candidate_id");
    expect(retirement).toContain("and s.atlas_candidate_hash = v_candidate_hash");
    expect(retirement).toContain("set is_current = false");
    expect(retirement).not.toMatch(/delete\s+from\s+public\.live_data_signals/i);
    expect(retirement).toContain("guard_signal_architecture_immutable_v1");
    expect(atlas_receipt_router).toContain('post("/retirement"');
    expect(atlas_receipt_router).toContain("retire_live_data_signal_transport_receipt_v1");
    expect(atlas_receipt_router).toContain("live_data_signal_write");
  });

  it("mounts the protected procedure from the active production router", () => {
    expect(root_router).toContain('import { enforcementIntelligenceRouter } from "./routers/enforcement-intelligence"');
    expect(root_router).toContain("enforcementIntel: enforcementIntelligenceRouter");
    expect(production_router).toContain("get_signal_architecture: protectedProcedure");
    expect(production_router).toContain("read_signal_architecture");
    expect(compatibility_router).toContain("read_signal_architecture");
    expect(production_router).not.toContain("v_signal_architecture_summary");
    expect(compatibility_router).not.toContain("v_signal_architecture_summary");
  });

  it("excludes intake rows from the global recent-record read model", () => {
    expect(read_model).toContain("where domain_code <> 'case_intake'");
    expect(read_model).toContain('row.domain_code !== "case_intake"');
    expect(read_model).not.toContain('"Case-intake breakpoint"');
    expect(read_model.match(/pool\.query/g)).toHaveLength(1);
    expect(read_model).not.toContain("Promise.all");
  });

  it("renders the canonical architecture instead of the mixed legacy registry", () => {
    expect(page).toContain("get_signal_architecture.useQuery");
    expect(page).toContain("Three independent source domains");
    expect(page).toContain("Unique Atlas observations");
    expect(page).toContain("historical rows");
    expect(page).toContain("replay rows preserved");
    expect(page).toContain("Legacy mixed rows quarantined");
  });
});
