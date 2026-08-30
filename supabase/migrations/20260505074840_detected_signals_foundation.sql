begin;

-- Legacy detected_signals exists in production and is referenced by historical
-- functions and later read projections, but its creating DDL was never checked
-- in. Preserve its wide imported contract without inventing any rows.
create table if not exists public.detected_signals (
  id integer,
  live_signal_id text,
  case_id text,
  signal_type text,
  dataset_id text,
  jurisdiction text,
  domain text,
  severity text,
  title text,
  explanation text,
  pattern_summary text,
  supporting_statistics text,
  confidence_score_raw text,
  sunam_score text,
  sunam_threshold_id text,
  approval_status text,
  approved_at text,
  actionable_at text,
  detected_at bigint,
  created_at bigint,
  detection_timestamp bigint,
  confidence_score integer,
  source_record_ids text,
  extraction_timestamp bigint,
  data_version text,
  jurisdiction_scope text,
  severity_level text,
  affected_entities text,
  entity_id text,
  geographic_focus text,
  observed_value text,
  expected_value text,
  threshold_value text,
  percentage_change text,
  time_window_start text,
  time_window_end text,
  escalation_status text,
  reviewed_by text,
  review_notes text,
  external_reference_id text,
  updated_at bigint,
  entity_role text,
  complaint_category text,
  complaint_subcategory text,
  narrative_actions_taken text,
  narrative_reasoning text,
  historical_trend_context text,
  cross_signal_links text,
  deviation text,
  pattern_type_id text,
  gate_decision_id integer,
  plain_language_explanation text,
  signal_id text,
  parent_record_id text,
  sunam_status text,
  forensic_logic text,
  finding_id uuid,
  snapshot_id uuid,
  pipeline_run_id uuid,
  signal_description text
);

-- Production currently exposes detected_signals as a security-invoker view, while
-- a clean replay creates the legacy relation as a table. CREATE TABLE IF NOT
-- EXISTS accepts either relation name, so harden the relation according to its
-- actual kind instead of issuing table-only RLS commands against a view.
do $
declare
  relation_kind "char";
begin
  select c.relkind
    into relation_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'detected_signals';

  if relation_kind in ('r', 'p') then
    execute 'alter table public.detected_signals enable row level security';
    execute 'revoke all on table public.detected_signals from public, anon, authenticated';
    execute 'grant all on table public.detected_signals to service_role';
    execute 'drop policy if exists detected_signals_service_role_all on public.detected_signals';
    execute 'create policy detected_signals_service_role_all on public.detected_signals for all to service_role using (true) with check (true)';
  elsif relation_kind = 'v' then
    execute 'alter view public.detected_signals set (security_invoker = true)';
    execute 'revoke all on table public.detected_signals from public, anon, authenticated';
    execute 'grant select on table public.detected_signals to service_role';
  else
    raise exception 'public.detected_signals has unsupported relation kind %', relation_kind;
  end if;
end
$;

commit;
