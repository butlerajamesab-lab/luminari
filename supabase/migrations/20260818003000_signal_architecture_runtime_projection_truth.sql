-- Repair Lighthouse signal-architecture observability so the operator-facing
-- Signal Registry reflects the current Atlas runtime projection rather than the
-- stale Lighthouse-local signal_events mirror.
--
-- This migration changes no canonical signal records and no Atlas observations.
-- It replaces a read-only integrity projection only.

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
  'Operator-facing signal architecture metrics. Atlas corpus totals and freshness are sourced from the current atlas_stream_runtime_projection_v1; legacy mixed signal counts remain quarantine-only context.';
