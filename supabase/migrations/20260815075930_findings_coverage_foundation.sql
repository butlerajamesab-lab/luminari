-- Reconcile the original evidence-spine findings table with the live
-- provenance fields used by Lighthouse coverage, and reconstruct the missing
-- engine-run ledger.  Existing findings are preserved byte-for-byte.

alter table public.findings
  add column if not exists finding_evidentiary_weight text,
  add column if not exists provenance_status text,
  add column if not exists provenance_attempted integer,
  add column if not exists candidate_claim_count integer,
  add column if not exists fallback_triggered integer,
  add column if not exists match_attempt_timestamp bigint,
  add column if not exists match_metadata text,
  add column if not exists lane_id text,
  add column if not exists snapshot_id integer;

create table if not exists public.engine_runs (
  id serial primary key,
  run_id text,
  case_id integer,
  engine_id text,
  user_id text,
  engine_run_type text,
  engine_run_status text,
  status text,
  current_stage text,
  stage_results text,
  output_refs text,
  snapshot_id integer,
  viability_run_id text,
  strategy_matter_profile_id text,
  assembly_packet_id text,
  pattern_aggregation_run_id text,
  error_message text,
  started_at bigint,
  completed_at bigint,
  created_at bigint
);

create index if not exists idx_engine_runs_case_id
  on public.engine_runs(case_id);

alter table public.engine_runs enable row level security;
revoke all on public.engine_runs from public, anon, authenticated;
grant select, insert, update, delete on public.engine_runs to service_role;
grant usage, select on sequence public.engine_runs_id_seq to service_role;

drop policy if exists service_role_all_engine_runs on public.engine_runs;
create policy service_role_all_engine_runs
  on public.engine_runs for all to service_role
  using (true) with check (true);

comment on table public.engine_runs is
  'Service-only Lighthouse analysis-engine execution ledger reconstructed for executable migration replay.';
