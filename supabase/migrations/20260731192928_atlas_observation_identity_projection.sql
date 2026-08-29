-- Lighthouse projection of Atlas canonical observation identity.
-- Existing view columns retain their original order; new identity counts append.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.lighthouse_atlas_event_identity_hash_v1(
  p_stream_id text,
  p_timestamp timestamptz,
  p_signal_type text,
  p_spacetime jsonb,
  p_provenance jsonb,
  p_payload jsonb,
  p_source_id text,
  p_jurisdiction_id text,
  p_module_hint text
)
returns text
language sql
immutable
strict
set search_path to 'pg_catalog', 'extensions'
as $function$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'stream_id', p_stream_id,
          'timestamp', to_char(p_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'signal_type', p_signal_type,
          'spacetime', coalesce(p_spacetime, '{}'::jsonb),
          'provenance', coalesce(p_provenance, '{}'::jsonb) - 'received_at' - 'ingested_at',
          'payload', coalesce(p_payload, '{}'::jsonb) - 'provenance_tracking',
          'source_id', p_source_id,
          'jurisdiction_id', p_jurisdiction_id,
          'module_hint', p_module_hint
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

revoke all on function public.lighthouse_atlas_event_identity_hash_v1(
  text, timestamptz, text, jsonb, jsonb, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.lighthouse_atlas_event_identity_hash_v1(
  text, timestamptz, text, jsonb, jsonb, jsonb, text, text, text
) to service_role;

do $integrity_view$
declare
  legacy_detected_count_sql text;
  legacy_live_count_sql text;
begin
  legacy_detected_count_sql := case
    when to_regclass('public.detected_signals') is null then '0::bigint'
    else '(select count(*) from public.detected_signals)::bigint'
  end;
  legacy_live_count_sql := case
    when to_regclass('public.live_signals') is null then '0::bigint'
    else '(select count(*) from public.live_signals)::bigint'
  end;

  execute format($view$
    create or replace view public.v_signal_architecture_integrity
    with (security_invoker = true) as
    with atlas_counts as (
      select
        count(*)::bigint as raw_observation_count,
        count(distinct public.lighthouse_atlas_event_identity_hash_v1(
          event.stream_id,
          event."timestamp",
          event.signal_type,
          event.spacetime,
          event.provenance,
          event.payload,
          event.source_id,
          event.jurisdiction_id,
          event.module_hint
        ))::bigint as unique_observation_count,
        max(event.ingested_at) as latest_observation_at
      from public.signal_events event
    )
    select
      atlas_counts.raw_observation_count as atlas_raw_observation_count,
      %s as legacy_detected_signals_count,
      %s as legacy_live_signals_count,
      (select count(*) from public.detected_signals_v2)::bigint as prior_v2_signal_count,
      (select count(*) from public.intake_signals where is_current)::bigint as intake_signal_count,
      (select count(*) from public.legal_patterns where is_current)::bigint as legal_pattern_count,
      (select count(*) from public.live_data_signals where is_current)::bigint as live_data_signal_count,
      (select count(*) from public.signal_convergences where is_current)::bigint as convergence_count,
      atlas_counts.latest_observation_at as latest_atlas_observation_at,
      'legacy_detected_signals_are_unclassified_evidence'::text as legacy_status,
      'raw_atlas_observations_are_not_live_data_signals'::text as atlas_status,
      atlas_counts.unique_observation_count as atlas_unique_observation_count,
      greatest(
        atlas_counts.raw_observation_count - atlas_counts.unique_observation_count,
        0
      )::bigint as atlas_replay_observation_count
    from atlas_counts
  $view$, legacy_detected_count_sql, legacy_live_count_sql);
end
$integrity_view$;

revoke all on table public.v_signal_architecture_integrity
  from public, anon, authenticated;
grant select on table public.v_signal_architecture_integrity
  to service_role;

comment on view public.v_signal_architecture_integrity is
  'Separates canonical unique Atlas observations, preserved replay history, canonical signal domains, and legacy mixed rows.';
