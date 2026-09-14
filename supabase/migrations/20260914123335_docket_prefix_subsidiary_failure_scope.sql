begin;

alter function public.civic_genome_normalized_source_history_v3(integer)
  rename to civic_genome_normalized_source_history_v3_scope_v1;

create function public.civic_genome_normalized_source_history_v3(
  p_source_bill_id integer default null
)
returns table (
  genome_bill_id uuid, bill_id uuid, state_code text, source_bill_id integer,
  observed_at timestamptz, source_sequence integer,
  source_duplicate_sequence integer, event_type text, valid_at timestamptz,
  effective_at timestamptz, state_position_after text, action_text text,
  chamber_code text, importance integer, source_event jsonb,
  source_event_key text, source_input_hash text
)
language sql stable security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
  with original as materialized (
    select *
    from public.civic_genome_normalized_source_history_v3_scope_v1(p_source_bill_id)
  ), scoped as materialized (
    select original.*,
      lower(original.action_text)
        ~ '^[[:space:]]*failed\y.{0,80}\y(amendments?|motions?)\y'
      and lower(original.action_text) !~
        '\y(bill|measure|resolution)\y[[:space:]]+(has[[:space:]]+)?(failed|withdrawn|vetoed|died|((been[[:space:]]+)?postponed[[:space:]]+indefinitely)|indefinitely[[:space:]]+postponed)\y'
      and (
        original.event_type in ('failed', 'vetoed')
        or original.state_position_after = 'failed'
      ) as is_prefix_subsidiary_failure
    from original
  )
  select
    scoped.genome_bill_id, scoped.bill_id, scoped.state_code,
    scoped.source_bill_id, scoped.observed_at, scoped.source_sequence,
    scoped.source_duplicate_sequence,
    case when scoped.is_prefix_subsidiary_failure then 'legislative_action'
         else scoped.event_type end,
    scoped.valid_at, scoped.effective_at,
    case when scoped.is_prefix_subsidiary_failure then null
         else scoped.state_position_after end,
    scoped.action_text, scoped.chamber_code, scoped.importance,
    scoped.source_event,
    case when scoped.is_prefix_subsidiary_failure then encode(
      extensions.digest(convert_to(concat_ws(
        chr(31), 'docket_prefix_subsidiary_failure_scope_v1',
        scoped.source_event_key
      ), 'UTF8'), 'sha256'), 'hex'
    ) else scoped.source_event_key end,
    scoped.source_input_hash
  from scoped;
$$;

revoke all on function public.civic_genome_normalized_source_history_v3(integer)
  from public, anon, authenticated;
grant execute on function public.civic_genome_normalized_source_history_v3(integer)
  to service_role;

-- Append correction partners for legacy projection events with the same
-- prefix-form subsidiary failure. Originals remain immutable.
with invalid_event as (
  select event.*
  from public.civic_genome_event event
  where event.event_type = 'failed'
    and event.source_trace @> '[{"source_layer":"docket_room_cache"}]'::jsonb
    and coalesce(event.next_status, '') <> 'legiscan_status_6'
    and coalesce(event.event_payload_json ->> 'event_summary', '') ~*
      'Latest action:[[:space:]]*failed\y.{0,80}\y(amendments?|motions?)\y'
    and coalesce(event.event_payload_json ->> 'event_summary', '') !~*
      'Latest action:.*\y(bill|measure|resolution)\y[[:space:]]+(has[[:space:]]+)?(failed|withdrawn|vetoed|died)\y'
    and not exists (
      select 1 from public.civic_genome_event correction
      where correction.event_type = 'docket_classification_corrected'
        and correction.event_payload_json ->> 'superseded_event_id' =
            event.event_id::text
    )
)
insert into public.civic_genome_event (
  family_id, genome_bill_id, bill_id, state_code, event_type, event_timestamp,
  prior_status, next_status, amendment_version, source_trace, event_payload_json
)
select
  event.family_id, event.genome_bill_id, event.bill_id, event.state_code,
  'docket_classification_corrected', now(), event.prior_status,
  event.next_status, event.amendment_version, event.source_trace,
  jsonb_build_object(
    'event_summary', 'Prefix-form subsidiary failure classification superseded.',
    'superseded_event_id', event.event_id,
    'original_event_type', event.event_type,
    'correction_reason', 'legacy_prefix_subsidiary_failure_was_not_whole_measure_disposition'
  )
from invalid_event event;

commit;
