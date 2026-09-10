-- Repair Lighthouse signal-architecture observability so the operator-facing
-- Signal Registry reflects the current Atlas runtime projection rather than the
-- stale Lighthouse-local signal_events mirror.
--
-- This migration changes no canonical signal records and no Atlas observations.
-- It replaces a read-only integrity projection only.

-- Production already applied the successor 20260822080454 out of order.
-- Its integrity view adds governance-state counts that this older definition
-- cannot remove. Preserve the verified successor; fresh replay still executes
-- the original definition in chronological order. This does not write history.
do $migration$
declare
  successor_applied boolean := false;
  successor_columns integer;
  current_definition text;
  expected_definition text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    select exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20260822080454'
    ) into successor_applied;
  end if;

  if successor_applied then
    select count(*) into successor_columns
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'v_signal_architecture_integrity'
       and column_name in ('live_data_candidate_count', 'live_data_promoted_count')
       and udt_name = 'int8';
    select pg_get_viewdef(c.oid, true) into current_definition
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'v_signal_architecture_integrity'
       and c.relkind = 'v';
    -- Ask PostgreSQL to normalize the complete recorded successor, including
    -- every current-row filter. Substring checks can accept a drifted view.
    execute $expected$
      create temporary view luminari_expected_signal_integrity as
      with atlas_counts as (
        select
          coalesce(sum(p.observation_count), 0)::bigint as raw_observation_count,
          coalesce(sum(p.identity_bound_observation_count), 0)::bigint as unique_observation_count,
          max(p.latest_observed_at) as latest_observation_at
        from public.atlas_stream_runtime_projection_v1 p
        where p.is_current
      )
      select
        a.raw_observation_count as atlas_raw_observation_count,
        (select count(*) from public.detected_signals)::bigint as legacy_detected_signals_count,
        (select count(*) from public.live_signals)::bigint as legacy_live_signals_count,
        (select count(*) from public.detected_signals_v2)::bigint as prior_v2_signal_count,
        (select count(*) from public.intake_signals where is_current)::bigint as intake_signal_count,
        (select count(*) from public.legal_patterns where is_current)::bigint as legal_pattern_count,
        (select count(*) from public.live_data_signals where is_current)::bigint as live_data_signal_count,
        (select count(*) from public.signal_convergences where is_current)::bigint as convergence_count,
        a.latest_observation_at as latest_atlas_observation_at,
        'legacy_detected_signals_are_unclassified_evidence'::text as legacy_status,
        'current_atlas_runtime_projection_is_operator_observation_truth'::text as atlas_status,
        a.unique_observation_count as atlas_unique_observation_count,
        greatest(a.raw_observation_count - a.unique_observation_count, 0::bigint) as atlas_replay_observation_count,
        (select count(*) from public.live_data_signals where is_current and governance_status = 'observation_candidate')::bigint
          as live_data_candidate_count,
        (select count(*) from public.live_data_signals where is_current and governance_status = 'promoted')::bigint
          as live_data_promoted_count
      from atlas_counts a
    $expected$;
    select pg_get_viewdef('pg_temp.luminari_expected_signal_integrity'::regclass, true)
      into expected_definition;
    drop view pg_temp.luminari_expected_signal_integrity;
    if successor_columns <> 2 or current_definition is distinct from expected_definition then
      raise exception 'Recorded signal-integrity successor does not satisfy its live view contract';
    end if;
    alter view public.v_signal_architecture_integrity set (security_invoker = true);
    return;
  end if;

  execute $projection$
create or replace view public.v_signal_architecture_integrity
with (security_invoker = true)
as
with atlas_counts as (
  select
    coalesce(sum(p.observation_count), 0)::bigint as raw_observation_count,
    coalesce(sum(p.identity_bound_observation_count), 0)::bigint as unique_observation_count,
    max(p.latest_observed_at) as latest_observation_at
  from public.atlas_stream_runtime_projection_v1 p
  where p.is_current
)
select
  a.raw_observation_count as atlas_raw_observation_count,
  (select count(*) from public.detected_signals)::bigint as legacy_detected_signals_count,
  (select count(*) from public.live_signals)::bigint as legacy_live_signals_count,
  (select count(*) from public.detected_signals_v2)::bigint as prior_v2_signal_count,
  (select count(*) from public.intake_signals where is_current)::bigint as intake_signal_count,
  (select count(*) from public.legal_patterns where is_current)::bigint as legal_pattern_count,
  (select count(*) from public.live_data_signals where is_current)::bigint as live_data_signal_count,
  (select count(*) from public.signal_convergences where is_current)::bigint as convergence_count,
  a.latest_observation_at as latest_atlas_observation_at,
  'legacy_detected_signals_are_unclassified_evidence'::text as legacy_status,
  'current_atlas_runtime_projection_is_operator_observation_truth'::text as atlas_status,
  a.unique_observation_count as atlas_unique_observation_count,
  greatest(a.raw_observation_count - a.unique_observation_count, 0::bigint) as atlas_replay_observation_count
from atlas_counts a;

comment on view public.v_signal_architecture_integrity is
  'Operator-facing signal architecture metrics. Atlas corpus totals and freshness are sourced from current atlas_stream_runtime_projection_v1; legacy mixed signal counts remain quarantine-only context.';

$projection$;
end;
$migration$;
