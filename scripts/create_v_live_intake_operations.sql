create or replace view public.v_live_intake_operations as
with stream_base as (
  select
    s.stream_id,
    s.status as stream_status,
    s.source_id,
    s.jurisdiction_id,
    s.module_hint
  from public.streams s
),
signal_activity as (
  select
    se.stream_id,
    max(se."timestamp") as last_signal_at,
    count(*) filter (where coalesce(se.ingested_at, se."timestamp") >= now() - interval '24 hours')::bigint as signal_events_24h
  from public.signal_events se
  group by se.stream_id
),
detector_activity as (
  select
    dl.stream_id,
    max(dl.run_at) as last_detector_run_at,
    coalesce(sum(dl.events_scanned) filter (where dl.run_at >= now() - interval '24 hours'), 0)::bigint as events_scanned_24h,
    coalesce(sum(dl.promoted) filter (where dl.run_at >= now() - interval '24 hours'), 0)::bigint as detector_promoted_24h,
    coalesce(sum(dl.staged) filter (where dl.run_at >= now() - interval '24 hours'), 0)::bigint as detector_staged_24h,
    coalesce(sum(dl.rejected) filter (where dl.run_at >= now() - interval '24 hours'), 0)::bigint as detector_rejected_24h,
    coalesce(sum(dl.errors) filter (where dl.run_at >= now() - interval '24 hours'), 0)::bigint as detector_errors_24h
  from public.signal_detector_run_log dl
  group by dl.stream_id
),
cursor_activity as (
  select
    c.stream_id,
    max(c.last_run_at) as cursor_last_run_at,
    coalesce(sum(c.total_errors), 0)::bigint as cursor_total_errors
  from public.signal_detector_cursor c
  group by c.stream_id
),
staging_activity as (
  select
    sb.stream_id,
    count(es.*) filter (where es.staged_at >= now() - interval '24 hours')::bigint as staging_rows_24h,
    count(es.*) filter (where coalesce(es.resolved, false) = false)::bigint as staging_backlog_count,
    count(es.*) filter (where es.decision::text in ('REJECT', 'REJECTED', 'DENY', 'DENIED') and es.staged_at >= now() - interval '24 hours')::bigint as staging_rejected_24h
  from stream_base sb
  left join public.sunam_gate_log gl
    on gl.source_connector_id = sb.source_id
  left join public.extraction_staging es
    on es.gate_log_id = gl.gate_log_id
  group by sb.stream_id
),
promotion_activity as (
  select
    sb.stream_id,
    count(pl.*) filter (
      where coalesce(pl.promoted_at, pl.created_at) >= now() - interval '24 hours'
        and lower(coalesce(pl.promotion_status, '')) in ('promoted', 'success', 'succeeded')
    )::bigint as promotion_rows_24h,
    count(pl.*) filter (
      where coalesce(pl.updated_at, pl.created_at, pl.promoted_at) >= now() - interval '24 hours'
        and (
          lower(coalesce(pl.promotion_status, '')) in ('failed', 'error', 'errored')
          or pl.failure_reason is not null
        )
    )::bigint as failed_promotions_24h,
    coalesce(sum(pl.retry_count) filter (where coalesce(pl.updated_at, pl.created_at, pl.promoted_at) >= now() - interval '24 hours'), 0)::bigint as retry_count
  from stream_base sb
  left join public.sunam_gate_log gl
    on gl.source_connector_id = sb.source_id
  left join public.signal_promotion_log pl
    on pl.gate_log_id = gl.gate_log_id
  group by sb.stream_id
),
gate_activity as (
  select
    sb.stream_id,
    count(gl.*) filter (
      where gl.evaluated_at >= now() - interval '24 hours'
        and gl.decision::text in ('REJECT', 'REJECTED', 'DENY', 'DENIED')
    )::bigint as gate_rejected_24h,
    count(gl.*) filter (
      where gl.evaluated_at >= now() - interval '24 hours'
        and gl.decision::text in ('QUARANTINE', 'QUARANTINED')
    )::bigint as quarantined_24h
  from stream_base sb
  left join public.sunam_gate_log gl
    on gl.source_connector_id = sb.source_id
  group by sb.stream_id
),
bridge_activity as (
  select
    sb.stream_id,
    extract(epoch from (max(b.bridged_at) - max(b.detected_at)))::bigint as bridge_lag_seconds
  from stream_base sb
  left join public.atlas_lighthouse_signal_bridge_v1 b
    on b.source_system = sb.source_id
    or b.source_system = sb.stream_id
  group by sb.stream_id
),
engine_activity as (
  select
    (select max(run_at) from public.pattern_engine_run_log) as last_pattern_run_at,
    (select max(run_at) from public.trend_engine_run_log) as last_trend_run_at,
    (select max(run_at) from public.strategy_engine_run_log) as last_strategy_run_at
)
select
  sb.stream_id,
  sb.stream_status,
  sa.last_signal_at,
  case
    when sa.last_signal_at is null then null::bigint
    else greatest(0, extract(epoch from (now() - sa.last_signal_at))::bigint)
  end as signal_age_seconds,
  coalesce(da.events_scanned_24h, 0)::bigint as events_scanned_24h,
  greatest(coalesce(da.detector_promoted_24h, 0), coalesce(pa.promotion_rows_24h, 0))::bigint as signals_promoted_24h,
  greatest(coalesce(da.detector_staged_24h, 0), coalesce(st.staging_rows_24h, 0))::bigint as signals_staged_24h,
  (coalesce(da.detector_rejected_24h, 0) + coalesce(st.staging_rejected_24h, 0) + coalesce(ga.gate_rejected_24h, 0))::bigint as signals_rejected_24h,
  ba.bridge_lag_seconds,
  coalesce(pa.failed_promotions_24h, 0)::bigint as failed_promotions_24h,
  coalesce(da.last_detector_run_at, ca.cursor_last_run_at) as last_detector_run_at,
  ea.last_pattern_run_at,
  ea.last_trend_run_at,
  ea.last_strategy_run_at,
  coalesce(st.staging_backlog_count, 0)::bigint as staging_backlog_count,
  (coalesce(pa.retry_count, 0) + coalesce(da.detector_errors_24h, 0))::bigint as retry_count,
  case
    when lower(coalesce(sb.stream_status, '')) in ('quarantined', 'quarantine') or coalesce(ga.quarantined_24h, 0) > 0 then 'quarantined'
    when sa.last_signal_at is not null and extract(epoch from (now() - sa.last_signal_at)) > 7200 then 'stalled'
    when coalesce(st.staging_backlog_count, 0) > 0 then 'backlogged'
    when coalesce(pa.retry_count, 0) + coalesce(da.detector_errors_24h, 0) > 0 or coalesce(pa.failed_promotions_24h, 0) > 0 then 'retrying'
    when sa.last_signal_at is not null and extract(epoch from (now() - sa.last_signal_at)) > 1800 then 'degraded'
    else 'healthy'
  end as health_classification
from stream_base sb
left join signal_activity sa on sa.stream_id = sb.stream_id
left join detector_activity da on da.stream_id = sb.stream_id
left join cursor_activity ca on ca.stream_id = sb.stream_id
left join staging_activity st on st.stream_id = sb.stream_id
left join promotion_activity pa on pa.stream_id = sb.stream_id
left join gate_activity ga on ga.stream_id = sb.stream_id
left join bridge_activity ba on ba.stream_id = sb.stream_id
cross join engine_activity ea;
