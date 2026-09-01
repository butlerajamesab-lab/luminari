begin;

-- A provider history date is evidence about the provider record, not proof
-- that the action was completed before Lighthouse observed it. Preserve every
-- row, but keep future-dated records out of confirmed state and momentum until
-- a source revision is actually observed on or after that date.
create or replace view public.v_civic_genome_lifecycle_event_current_v3
with (security_invoker = true)
as
with latest_revision as (
  select distinct on (revision.genome_bill_id)
    revision.*
  from public.civic_genome_lifecycle_source_revision_v3 revision
  order by
    revision.genome_bill_id,
    revision.observed_at desc,
    revision.created_at desc,
    revision.source_revision_id desc
)
select
  event.*,
  revision.source_revision_id as current_source_revision_id,
  revision.source_revision_hash as current_source_revision_hash,
  revision.observed_at as current_revision_observed_at,
  'current'::text as canonical_status,
  case
    when event.valid_at > revision.observed_at
      then 'future_dated_provider_record'
    else 'confirmed_provider_record'
  end::text as temporal_status
from latest_revision revision
cross join lateral unnest(revision.source_event_keys) source_key
join public.civic_genome_lifecycle_event_v2 event
  on event.genome_bill_id = revision.genome_bill_id
 and event.source_event_key = source_key
where event.event_type <> 'source_tombstone';

revoke all on table public.v_civic_genome_lifecycle_event_current_v3
  from public, anon, authenticated;
grant select on table public.v_civic_genome_lifecycle_event_current_v3
  to authenticated, service_role;

create or replace view public.v_civic_genome_bill_temporal_facts_v3
with (security_invoker = true)
as
with latest_revision as (
  select distinct on (revision.genome_bill_id)
    revision.*
  from public.civic_genome_lifecycle_source_revision_v3 revision
  order by
    revision.genome_bill_id,
    revision.observed_at desc,
    revision.created_at desc,
    revision.source_revision_id desc
)
select
  bill.genome_bill_id,
  bill.bill_id,
  bill.family_id,
  bill.state_code,
  bill.source_bill_number,
  min(event.valid_at) filter (
    where event.event_type = 'prefiled'
      and event.valid_at <= revision.observed_at
  ) as prefiled_at,
  coalesce(
    min(event.valid_at) filter (
      where event.event_type = 'introduced'
        and event.valid_at <= revision.observed_at
    ),
    min(event.valid_at) filter (
      where event.event_type = 'prefiled'
        and event.valid_at <= revision.observed_at
    )
  ) as introduced_at,
  min(event.valid_at) filter (
    where event.event_type = 'enacted'
      and event.valid_at <= revision.observed_at
  ) as enacted_at,
  min(event.effective_at) filter (
    where event.effective_at is not null
      and event.valid_at <= revision.observed_at
  ) as effective_at,
  max(event.valid_at) filter (
    where event.valid_at <= revision.observed_at
  ) as last_action_at,
  revision.observed_at as last_observed_at,
  (
    array_agg(
      event.action_text
      order by event.valid_at desc, event.source_sequence desc,
        event.lifecycle_event_id desc
    ) filter (
      where event.lifecycle_event_id is not null
        and event.valid_at <= revision.observed_at
    )
  )[1] as last_action_text,
  (
    array_agg(
      event.state_position_after
      order by event.valid_at desc, event.source_sequence desc,
        event.lifecycle_event_id desc
    ) filter (
      where event.state_position_after is not null
        and event.valid_at <= revision.observed_at
    )
  )[1] as current_state_position,
  count(event.lifecycle_event_id)::integer as source_event_count,
  encode(
    extensions.digest(
      convert_to(
        coalesce(
          string_agg(event.source_event_key, '' order by event.source_event_key),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as source_event_set_hash,
  'civic_genome_event_time_v4_provider_record_guard'::text
    as temporal_contract,
  max(event.valid_at) as reported_last_action_at,
  min(event.valid_at) filter (
    where event.valid_at > revision.observed_at
  ) as pending_source_action_at,
  (
    array_agg(
      event.action_text
      order by event.valid_at asc, event.source_sequence asc,
        event.lifecycle_event_id asc
    ) filter (
      where event.lifecycle_event_id is not null
        and event.valid_at > revision.observed_at
    )
  )[1] as pending_source_action_text,
  count(event.lifecycle_event_id) filter (
    where event.valid_at <= revision.observed_at
  )::integer as confirmed_source_event_count,
  count(event.lifecycle_event_id) filter (
    where event.valid_at > revision.observed_at
  )::integer as pending_source_event_count
from latest_revision revision
join public.civic_genome_bill bill
  on bill.genome_bill_id = revision.genome_bill_id
left join public.v_civic_genome_lifecycle_event_current_v3 event
  on event.genome_bill_id = bill.genome_bill_id
group by
  bill.genome_bill_id,
  bill.bill_id,
  bill.family_id,
  bill.state_code,
  bill.source_bill_number,
  revision.observed_at;

revoke all on table public.v_civic_genome_bill_temporal_facts_v3
  from public, anon, authenticated;
grant select on table public.v_civic_genome_bill_temporal_facts_v3
  to authenticated, service_role;

create or replace view public.v_civic_genome_bill_temporal_facts_v2
with (security_invoker = true)
as
select *
from public.v_civic_genome_bill_temporal_facts_v3;

revoke all on table public.v_civic_genome_bill_temporal_facts_v2
  from public, anon, authenticated;
grant select on table public.v_civic_genome_bill_temporal_facts_v2
  to authenticated, service_role;

create or replace function public.refresh_civic_genome_bill_temporal_projection_v2(
  p_genome_bill_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  facts record;
  changed_count integer := 0;
begin
  select *
    into facts
    from public.v_civic_genome_bill_temporal_facts_v2
   where genome_bill_id = p_genome_bill_id;

  if not found then
    return false;
  end if;

  update public.civic_genome_bill bill
     set introduced_at = facts.introduced_at,
         last_action_at = facts.last_action_at,
         enacted_at = facts.enacted_at,
         effective_at = facts.effective_at,
         last_observed_at = facts.last_observed_at,
         lifecycle_temporal_contract = facts.temporal_contract,
         current_state_position = facts.current_state_position,
         procedural_lifecycle_json = coalesce(
           bill.procedural_lifecycle_json,
           '{}'::jsonb
         ) || jsonb_build_object(
           'temporal_contract', facts.temporal_contract,
           'prefiled_at', facts.prefiled_at,
           'introduced_at', facts.introduced_at,
           'enacted_at', facts.enacted_at,
           'effective_at', facts.effective_at,
           'last_action_at', facts.last_action_at,
           'last_action', facts.last_action_text,
           'last_observed_at', facts.last_observed_at,
           'reported_last_action_at', facts.reported_last_action_at,
           'pending_source_action_at', facts.pending_source_action_at,
           'pending_source_action_text', facts.pending_source_action_text,
           'current_state_position', facts.current_state_position,
           'source_event_count', facts.source_event_count,
           'confirmed_source_event_count', facts.confirmed_source_event_count,
           'pending_source_event_count', facts.pending_source_event_count,
           'source_event_set_hash', facts.source_event_set_hash
         ),
         updated_at = clock_timestamp()
   where bill.genome_bill_id = p_genome_bill_id
     and row(
       bill.introduced_at,
       bill.last_action_at,
       bill.enacted_at,
       bill.effective_at,
       bill.last_observed_at,
       bill.lifecycle_temporal_contract,
       bill.current_state_position,
       bill.procedural_lifecycle_json->>'source_event_set_hash'
     ) is distinct from row(
       facts.introduced_at,
       facts.last_action_at,
       facts.enacted_at,
       facts.effective_at,
       facts.last_observed_at,
       facts.temporal_contract,
       facts.current_state_position,
       facts.source_event_set_hash
     );

  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;

revoke all on function public.refresh_civic_genome_bill_temporal_projection_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_civic_genome_bill_temporal_projection_v2(uuid)
  to service_role;

create or replace function public.civic_genome_family_momentum_event_time_v2(
  p_family_id uuid,
  p_observed_as_of timestamptz default now()
)
returns table (
  momentum_snapshot_id text,
  family_id uuid,
  snapshot_date date,
  active_state_count integer,
  introduced_state_count integer,
  enacted_state_count integer,
  failed_state_count integer,
  new_state_count integer,
  velocity_score numeric,
  acceleration_score numeric,
  collapse_score numeric,
  observed_at timestamptz,
  created_at timestamptz,
  chronology_basis text,
  methodology_version text,
  source_event_ids uuid[],
  input_hash text
)
language sql
stable
set search_path = pg_catalog, public, extensions, pg_temp
as $$
  with scoped_revisions as materialized (
    select
      bill.family_id,
      bill.genome_bill_id,
      bill.state_code,
      revision.source_revision_id,
      revision.source_event_keys,
      revision.observed_at as revision_observed_at,
      revision.created_at as revision_created_at
    from public.civic_genome_bill bill
    join lateral (
      select candidate.*
      from public.civic_genome_lifecycle_source_revision_v3 candidate
      where candidate.genome_bill_id = bill.genome_bill_id
        and candidate.observed_at <= coalesce(
          p_observed_as_of,
          'infinity'::timestamptz
        )
      order by
        candidate.observed_at desc,
        candidate.created_at desc,
        candidate.source_revision_id desc
      limit 1
    ) revision on true
    where bill.family_id = p_family_id
  ), scoped_state_events as materialized (
    select
      revision.family_id,
      revision.genome_bill_id,
      revision.state_code,
      event.lifecycle_event_id,
      event.source_event_key,
      event.valid_at,
      event.valid_at::date as event_date,
      revision.revision_observed_at as observed_at,
      revision.revision_created_at as created_at,
      event.source_sequence,
      event.state_position_after
    from scoped_revisions revision
    cross join lateral unnest(revision.source_event_keys) source_key
    join public.civic_genome_lifecycle_event_v2 event
      on event.genome_bill_id = revision.genome_bill_id
     and event.source_event_key = source_key
    where event.event_type <> 'source_tombstone'
      and event.state_position_after is not null
      and event.valid_at <= revision.revision_observed_at
  ), event_dates as materialized (
    select distinct family_id, event_date as snapshot_date
    from scoped_state_events
  ), bill_state_at_date as materialized (
    select
      event_date.family_id,
      event_date.snapshot_date,
      bill.genome_bill_id,
      bill.state_code,
      latest.lifecycle_event_id,
      latest.source_event_key,
      latest.state_position_after,
      latest.observed_at,
      latest.created_at
    from event_dates event_date
    join public.civic_genome_bill bill
      on bill.family_id = event_date.family_id
    join lateral (
      select event.*
      from scoped_state_events event
      where event.genome_bill_id = bill.genome_bill_id
        and event.valid_at < (
          (event_date.snapshot_date + 1)::timestamp at time zone 'UTC'
        )
      order by
        event.valid_at desc,
        event.source_sequence desc,
        event.lifecycle_event_id desc
      limit 1
    ) latest on true
  ), daily_basis as materialized (
    select
      state.family_id,
      state.snapshot_date,
      count(distinct state.state_code) filter (
        where state.state_position_after <> 'failed'
      )::integer as active_state_count,
      count(distinct state.state_code) filter (
        where state.state_position_after in (
          'introduced',
          'active_in_committee',
          'advanced_one_chamber',
          'advanced_two_chambers'
        )
      )::integer as introduced_state_count,
      count(distinct state.state_code) filter (
        where state.state_position_after = 'enacted'
      )::integer as enacted_state_count,
      count(distinct state.state_code) filter (
        where state.state_position_after = 'failed'
      )::integer as failed_state_count,
      max(state.observed_at) as observed_at,
      max(state.created_at) as created_at,
      array_agg(
        state.lifecycle_event_id
        order by state.genome_bill_id, state.lifecycle_event_id
      ) as source_event_ids,
      string_agg(
        concat_ws(
          chr(31),
          state.genome_bill_id::text,
          state.state_code,
          state.state_position_after,
          state.source_event_key
        ),
        chr(30)
        order by state.genome_bill_id, state.source_event_key
      ) as input_material
    from bill_state_at_date state
    group by state.family_id, state.snapshot_date
  ), daily as materialized (
    select
      basis.*,
      encode(
        extensions.digest(
          convert_to(
            concat_ws(
              chr(31),
              'civic_genome_momentum_event_time_v4_provider_record_guard',
              basis.family_id::text,
              basis.snapshot_date::text,
              basis.input_material
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as input_hash
    from daily_basis basis
  )
  select
    'cg-momentum-v4-' || substr(current_day.input_hash, 1, 32)
      as momentum_snapshot_id,
    current_day.family_id,
    current_day.snapshot_date,
    current_day.active_state_count,
    current_day.introduced_state_count,
    current_day.enacted_state_count,
    current_day.failed_state_count,
    case
      when prior_day.active_state_count is null then 0
      else greatest(
        current_day.active_state_count - prior_day.active_state_count,
        0
      )
    end::integer as new_state_count,
    least(1::numeric, current_day.active_state_count::numeric / 50::numeric)
      as velocity_score,
    case
      when prior_day.active_state_count is null then 0::numeric
      else least(
        1::numeric,
        greatest(
          0::numeric,
          (
            current_day.active_state_count - prior_day.active_state_count
          )::numeric / 10::numeric
        )
      )
    end as acceleration_score,
    least(
      1::numeric,
      current_day.failed_state_count::numeric
        / greatest(
            current_day.active_state_count + current_day.failed_state_count,
            1
          )::numeric
    ) as collapse_score,
    current_day.observed_at,
    current_day.created_at,
    'source_provider_record_time'::text as chronology_basis,
    'civic_genome_momentum_event_time_v4_provider_record_guard'::text
      as methodology_version,
    current_day.source_event_ids,
    current_day.input_hash
  from daily current_day
  left join lateral (
    select candidate.active_state_count
    from daily candidate
    where candidate.snapshot_date <= current_day.snapshot_date - 7
    order by candidate.snapshot_date desc
    limit 1
  ) prior_day on true
  order by current_day.snapshot_date;
$$;

revoke all on function public.civic_genome_family_momentum_event_time_v2(
  uuid,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.civic_genome_family_momentum_event_time_v2(
  uuid,
  timestamptz
) to authenticated, service_role;

with latest_revision as (
  select distinct on (revision.genome_bill_id)
    revision.*
  from public.civic_genome_lifecycle_source_revision_v3 revision
  order by
    revision.genome_bill_id,
    revision.observed_at desc,
    revision.created_at desc,
    revision.source_revision_id desc
), affected_bill as (
  select distinct revision.genome_bill_id
  from latest_revision revision
  cross join lateral unnest(revision.source_event_keys) source_key
  join public.civic_genome_lifecycle_event_v2 event
    on event.genome_bill_id = revision.genome_bill_id
   and event.source_event_key = source_key
  where event.event_type <> 'source_tombstone'
    and event.valid_at > revision.observed_at
)
select public.refresh_civic_genome_bill_temporal_projection_v2(
  affected.genome_bill_id
)
from affected_bill affected;

comment on column public.v_civic_genome_lifecycle_event_current_v3.temporal_status is
  'Provider-record temporal status. Future-dated rows remain preserved but are not asserted as completed until a source revision is observed on or after valid_at.';
comment on view public.v_civic_genome_bill_temporal_facts_v3 is
  'Correction-aware, provider-date-guarded facts. last_action_at is confirmed at observation time; reported and pending provider dates remain separately exposed.';

commit;
