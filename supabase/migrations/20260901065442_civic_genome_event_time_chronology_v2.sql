begin;

-- Civic Genome event-time chronology v2
--
-- The v1 projection mixed three independent clocks:
--   * the date a legislative action legally occurred,
--   * the date Lighthouse first observed that action, and
--   * the date a Rosetta extraction or Genome projection ran.
--
-- Preserve every v1 row as legacy evidence.  Build an append-only lifecycle
-- ledger from the already-cached LegiScan history, expose deterministic
-- event-time momentum, and correct only the mutable current bill read model.

alter table public.civic_genome_bill
  add column if not exists effective_at timestamptz,
  add column if not exists last_observed_at timestamptz,
  add column if not exists lifecycle_temporal_contract text;

create table if not exists public.civic_genome_lifecycle_event_v2 (
  lifecycle_event_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null
    references public.civic_genome_bill(genome_bill_id) on delete restrict,
  bill_id uuid not null,
  state_code text not null,
  source_bill_id integer not null,
  source_provider text not null default 'legiscan_bill_history',
  source_event_key text not null,
  source_sequence integer not null check (source_sequence > 0),
  source_duplicate_sequence integer not null default 1
    check (source_duplicate_sequence > 0),
  event_type text not null,
  valid_at timestamptz not null,
  effective_at timestamptz,
  observed_at timestamptz not null,
  state_position_after text,
  action_text text not null,
  chamber_code text,
  importance integer,
  source_trace jsonb not null default '[]'::jsonb,
  event_payload_json jsonb not null default '{}'::jsonb,
  source_input_hash text not null,
  supersedes_lifecycle_event_id uuid
    references public.civic_genome_lifecycle_event_v2(lifecycle_event_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint civic_genome_lifecycle_event_v2_source_event_key_unique
    unique (source_event_key),
  constraint civic_genome_lifecycle_event_v2_source_event_key_format
    check (source_event_key ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_lifecycle_event_v2_source_input_hash_format
    check (source_input_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_lifecycle_event_v2_state_position_check
    check (
      state_position_after is null
      or state_position_after in (
        'introduced',
        'active_in_committee',
        'advanced_one_chamber',
        'advanced_two_chambers',
        'enacted',
        'failed'
      )
    ),
  constraint civic_genome_lifecycle_event_v2_supersession_check
    check (
      supersedes_lifecycle_event_id is null
      or supersedes_lifecycle_event_id <> lifecycle_event_id
    )
);

create index if not exists civic_genome_lifecycle_event_v2_bill_time_idx
  on public.civic_genome_lifecycle_event_v2 (
    genome_bill_id,
    valid_at desc,
    source_sequence desc,
    lifecycle_event_id desc
  );

create index if not exists civic_genome_lifecycle_event_v2_source_bill_idx
  on public.civic_genome_lifecycle_event_v2 (
    source_bill_id,
    valid_at desc,
    source_sequence desc
  );

create index if not exists civic_genome_lifecycle_event_v2_observed_idx
  on public.civic_genome_lifecycle_event_v2 (observed_at desc);

create index if not exists civic_genome_lifecycle_event_v2_supersedes_idx
  on public.civic_genome_lifecycle_event_v2 (supersedes_lifecycle_event_id)
  where supersedes_lifecycle_event_id is not null;

alter table public.civic_genome_lifecycle_event_v2 enable row level security;
revoke all on table public.civic_genome_lifecycle_event_v2
  from public, anon, authenticated;
grant select on table public.civic_genome_lifecycle_event_v2
  to authenticated;
grant select, insert on table public.civic_genome_lifecycle_event_v2
  to service_role;

drop policy if exists civic_genome_lifecycle_event_v2_authenticated_read
  on public.civic_genome_lifecycle_event_v2;
create policy civic_genome_lifecycle_event_v2_authenticated_read
  on public.civic_genome_lifecycle_event_v2
  for select
  to authenticated
  using (true);

drop policy if exists civic_genome_lifecycle_event_v2_service_insert
  on public.civic_genome_lifecycle_event_v2;
create policy civic_genome_lifecycle_event_v2_service_insert
  on public.civic_genome_lifecycle_event_v2
  for insert
  to service_role
  with check (true);

drop policy if exists civic_genome_lifecycle_event_v2_service_read
  on public.civic_genome_lifecycle_event_v2;
create policy civic_genome_lifecycle_event_v2_service_read
  on public.civic_genome_lifecycle_event_v2
  for select
  to service_role
  using (true);

create or replace function public.reject_civic_genome_temporal_history_mutation_v2()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%s_is_append_only', tg_table_name);
end;
$$;

revoke all on function public.reject_civic_genome_temporal_history_mutation_v2()
  from public, anon, authenticated;

drop trigger if exists civic_genome_lifecycle_event_v2_append_only
  on public.civic_genome_lifecycle_event_v2;
create trigger civic_genome_lifecycle_event_v2_append_only
before update or delete on public.civic_genome_lifecycle_event_v2
for each row execute function public.reject_civic_genome_temporal_history_mutation_v2();

drop trigger if exists civic_genome_lifecycle_event_v2_reject_truncate
  on public.civic_genome_lifecycle_event_v2;
create trigger civic_genome_lifecycle_event_v2_reject_truncate
before truncate on public.civic_genome_lifecycle_event_v2
for each statement execute function public.reject_civic_genome_temporal_history_mutation_v2();

create or replace view public.v_civic_genome_bill_temporal_facts_v2
with (security_invoker = true)
as
select
  bill.genome_bill_id,
  bill.bill_id,
  bill.family_id,
  bill.state_code,
  bill.source_bill_number,
  min(event.valid_at) filter (where event.event_type = 'prefiled') as prefiled_at,
  coalesce(
    min(event.valid_at) filter (where event.event_type = 'introduced'),
    min(event.valid_at) filter (where event.event_type = 'prefiled')
  ) as introduced_at,
  min(event.valid_at) filter (where event.event_type = 'enacted') as enacted_at,
  min(event.effective_at) filter (where event.effective_at is not null) as effective_at,
  max(event.valid_at) as last_action_at,
  max(event.observed_at) as last_observed_at,
  (
    array_agg(
      event.action_text
      order by event.valid_at desc, event.source_sequence desc, event.lifecycle_event_id desc
    )
  )[1] as last_action_text,
  (
    array_agg(
      event.state_position_after
      order by event.valid_at desc, event.source_sequence desc, event.lifecycle_event_id desc
    ) filter (where event.state_position_after is not null)
  )[1] as current_state_position,
  count(*)::integer as source_event_count,
  encode(
    extensions.digest(
      convert_to(
        string_agg(event.source_event_key, '' order by event.source_event_key),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as source_event_set_hash,
  'civic_genome_event_time_v2'::text as temporal_contract
from public.civic_genome_bill bill
join public.civic_genome_lifecycle_event_v2 event
  on event.genome_bill_id = bill.genome_bill_id
group by
  bill.genome_bill_id,
  bill.bill_id,
  bill.family_id,
  bill.state_code,
  bill.source_bill_number;

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
         current_state_position = coalesce(
           facts.current_state_position,
           bill.current_state_position
         ),
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
           'source_event_count', facts.source_event_count,
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
       coalesce(facts.current_state_position, bill.current_state_position),
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

create or replace function public.sync_civic_genome_lifecycle_history_v2(
  p_source_bill_id integer default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  inserted_count integer := 0;
begin
  with source_rows as materialized (
    select
      bill.genome_bill_id,
      bill.bill_id,
      bill.state_code,
      source_cache.bill_id as source_bill_id,
      source_cache.bill,
      source_cache.fetched_at as observed_at
    from public.civic_genome_bill bill
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = case
        when coalesce(bill.structural_dna_json->>'source_bill_id', '') ~ '^[0-9]+$'
          then (bill.structural_dna_json->>'source_bill_id')::integer
        else null
      end
    where p_source_bill_id is null
       or source_cache.bill_id = p_source_bill_id
  ), raw_history as materialized (
    select
      source.genome_bill_id,
      source.bill_id,
      source.state_code,
      source.source_bill_id,
      source.observed_at,
      history.ordinality::integer as source_sequence,
      history.value as source_event,
      case
        when coalesce(history.value->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         and history.value->>'date' <> '0000-00-00'
          then (history.value->>'date')::date
        else null
      end as valid_date,
      coalesce(history.value->>'action', '') as action_text,
      nullif(history.value->>'chamber', '') as chamber_code,
      case
        when coalesce(history.value->>'importance', '') ~ '^-?[0-9]+$'
          then (history.value->>'importance')::integer
        else null
      end as importance
    from source_rows source
    cross join lateral jsonb_array_elements(
      coalesce(source.bill->'history', '[]'::jsonb)
    ) with ordinality history(value, ordinality)
  ), numbered_history as materialized (
    select
      raw.*,
      row_number() over (
        partition by
          raw.source_bill_id,
          raw.valid_date,
          raw.action_text,
          raw.chamber_code
        order by raw.source_sequence
      )::integer as source_duplicate_sequence
    from raw_history raw
    where raw.valid_date is not null
      and raw.action_text <> ''
  ), classified_history as materialized (
    select
      history.*,
      case
        when lower(history.action_text) ~ '^effective date([[:space:]]|$)'
          then 'effective_date_set'
        when lower(history.action_text) ~ '(veto (was )?(override|overridden)|governor signed|signed by governor|approved by governor|chapter(ed)?[[:space:]]+[0-9]|became law|signed into law)'
          then 'enacted'
        when lower(history.action_text) ~ '(vetoed|governor veto)'
         and lower(history.action_text) !~ '(override|overridden)'
          then 'vetoed'
        when lower(history.action_text) ~ '(failed|withdrawn|dead|postponed indefinitely)'
          then 'failed'
        when lower(history.action_text) ~ 'prefiled'
          then 'prefiled'
        when lower(history.action_text) ~ '(first reading|introduced)'
          then 'introduced'
        when lower(history.action_text) ~ '(third reading,?[[:space:]]+passed|passed house|passed senate|passed both)'
          then 'passed_chamber'
        when lower(history.action_text) ~ '(amend|substitute|engrossed|revised)'
          then 'amended'
        when lower(history.action_text) ~ '(committee|referred|public hearing|executive action|do pass|without recommendation)'
          then 'committee_action'
        else 'legislative_action'
      end as event_type,
      case
        when lower(history.action_text) ~ '^effective date([[:space:]]|$)'
          then 'enacted'
        when lower(history.action_text) ~ '(veto (was )?(override|overridden)|governor signed|signed by governor|approved by governor|chapter(ed)?[[:space:]]+[0-9]|became law|signed into law)'
          then 'enacted'
        when lower(history.action_text) ~ '(vetoed|governor veto|failed|withdrawn|dead|postponed indefinitely)'
         and lower(history.action_text) !~ '(override|overridden)'
          then 'failed'
        when lower(history.action_text) ~ '(third reading,?[[:space:]]+passed|passed house|passed senate|passed both)'
          then case
            when (
              select count(distinct prior.chamber_code)
              from numbered_history prior
              where prior.genome_bill_id = history.genome_bill_id
                and prior.source_sequence <= history.source_sequence
                and prior.chamber_code is not null
                and lower(prior.action_text) ~ '(third reading,?[[:space:]]+passed|passed house|passed senate|passed both)'
            ) >= 2 then 'advanced_two_chambers'
            else 'advanced_one_chamber'
          end
        when lower(history.action_text) ~ '(committee|referred|public hearing|executive action|do pass|without recommendation)'
          then 'active_in_committee'
        when lower(history.action_text) ~ '(prefiled|first reading|introduced)'
          then 'introduced'
        else null
      end as state_position_after,
      case
        when lower(history.action_text) ~ '^effective date[[:space:]]+[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}'
          then to_date(
            substring(
              lower(history.action_text)
              from '([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})'
            ),
            'MM/DD/YYYY'
          )::timestamp at time zone 'UTC'
        else null
      end as effective_at
    from numbered_history history
  ), identified_history as materialized (
    select
      classified.*,
      encode(
        extensions.digest(
          convert_to(
            concat_ws(
              chr(31),
              'legiscan_bill_history_v2',
              classified.source_bill_id::text,
              classified.valid_date::text,
              coalesce(classified.chamber_code, ''),
              classified.action_text,
              classified.source_duplicate_sequence::text
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as source_event_key,
      encode(
        extensions.digest(
          convert_to(classified.source_event::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) as source_input_hash
    from classified_history classified
  )
  insert into public.civic_genome_lifecycle_event_v2 (
    genome_bill_id,
    bill_id,
    state_code,
    source_bill_id,
    source_provider,
    source_event_key,
    source_sequence,
    source_duplicate_sequence,
    event_type,
    valid_at,
    effective_at,
    observed_at,
    state_position_after,
    action_text,
    chamber_code,
    importance,
    source_trace,
    event_payload_json,
    source_input_hash
  )
  select
    history.genome_bill_id,
    history.bill_id,
    history.state_code,
    history.source_bill_id,
    'legiscan_bill_history',
    history.source_event_key,
    history.source_sequence,
    history.source_duplicate_sequence,
    history.event_type,
    history.valid_date::timestamp at time zone 'UTC',
    history.effective_at,
    history.observed_at,
    history.state_position_after,
    history.action_text,
    history.chamber_code,
    history.importance,
    jsonb_build_array(jsonb_build_object(
      'source_layer', 'docket_bill_detail_cache',
      'source_provider', 'legiscan_get_bill',
      'source_bill_id', history.source_bill_id,
      'source_event_key', history.source_event_key
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'source_event', history.source_event,
      'state_position_after', history.state_position_after,
      'effective_at', history.effective_at,
      'chronology_basis', 'source_event_time',
      'observed_at', history.observed_at
    )),
    history.source_input_hash
  from identified_history history
  on conflict (source_event_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.sync_civic_genome_lifecycle_history_v2(integer)
  from public, anon, authenticated;
grant execute on function public.sync_civic_genome_lifecycle_history_v2(integer)
  to service_role;

-- The producer is event-time based and bitemporal: p_observed_as_of controls
-- which immutable source events were known, while snapshot_date remains the
-- date those legislative events legally occurred.
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
  with scoped_state_events as materialized (
    select
      bill.family_id,
      bill.genome_bill_id,
      bill.state_code,
      event.lifecycle_event_id,
      event.source_event_key,
      event.valid_at,
      event.valid_at::date as event_date,
      event.observed_at,
      event.created_at,
      event.source_sequence,
      event.state_position_after
    from public.civic_genome_bill bill
    join public.civic_genome_lifecycle_event_v2 event
      on event.genome_bill_id = bill.genome_bill_id
    where bill.family_id = p_family_id
      and event.state_position_after is not null
      and event.observed_at <= coalesce(p_observed_as_of, 'infinity'::timestamptz)
      and event.created_at <= coalesce(p_observed_as_of, 'infinity'::timestamptz)
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
              'civic_genome_momentum_event_time_v2',
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
    'cg-momentum-v2-' || substr(current_day.input_hash, 1, 32)
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
    'source_event_time'::text as chronology_basis,
    'civic_genome_momentum_event_time_v2'::text as methodology_version,
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

revoke all on function public.civic_genome_family_momentum_event_time_v2(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.civic_genome_family_momentum_event_time_v2(uuid, timestamptz)
  to authenticated, service_role;

-- First convergence pass.  Exact replays are no-ops because source_event_key
-- is content-derived and unique.
select public.sync_civic_genome_lifecycle_history_v2(null);

update public.civic_genome_bill bill
   set introduced_at = facts.introduced_at,
       last_action_at = facts.last_action_at,
       enacted_at = facts.enacted_at,
       effective_at = facts.effective_at,
       last_observed_at = facts.last_observed_at,
       lifecycle_temporal_contract = facts.temporal_contract,
       current_state_position = coalesce(
         facts.current_state_position,
         bill.current_state_position
       ),
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
         'source_event_count', facts.source_event_count,
         'source_event_set_hash', facts.source_event_set_hash
       ),
       updated_at = clock_timestamp()
  from public.v_civic_genome_bill_temporal_facts_v2 facts
 where facts.genome_bill_id = bill.genome_bill_id
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
     coalesce(facts.current_state_position, bill.current_state_position),
     facts.source_event_set_hash
   );

with family_rollup as (
  select
    family_id,
    min(enacted_at) as first_enacted_at,
    max(coalesce(last_action_at, introduced_at)) as last_event_at,
    count(distinct state_code) filter (
      where current_state_position <> 'failed'
    )::integer as active_state_count,
    count(distinct state_code) filter (
      where current_state_position in (
        'introduced',
        'active_in_committee',
        'advanced_one_chamber',
        'advanced_two_chambers'
      )
    )::integer as introduced_state_count,
    count(distinct state_code) filter (
      where current_state_position = 'enacted'
    )::integer as enacted_state_count,
    count(distinct state_code) filter (
      where current_state_position = 'failed'
    )::integer as failed_state_count
  from public.civic_genome_bill
  group by family_id
)
update public.civic_genome_family family
   set first_enacted_at = rollup.first_enacted_at,
       last_event_at = rollup.last_event_at,
       active_state_count = rollup.active_state_count,
       introduced_state_count = rollup.introduced_state_count,
       enacted_state_count = rollup.enacted_state_count,
       failed_state_count = rollup.failed_state_count,
       momentum_score = least(1, rollup.active_state_count::numeric / 50),
       collapse_score = least(
         1,
         rollup.failed_state_count::numeric
           / greatest(
               rollup.active_state_count + rollup.failed_state_count,
               1
             )
       ),
       updated_at = clock_timestamp()
  from family_rollup rollup
 where family.family_id = rollup.family_id
   and row(
     family.first_enacted_at,
     family.last_event_at,
     family.active_state_count,
     family.introduced_state_count,
     family.enacted_state_count,
     family.failed_state_count
   ) is distinct from row(
     rollup.first_enacted_at,
     rollup.last_event_at,
     rollup.active_state_count,
     rollup.introduced_state_count,
     rollup.enacted_state_count,
     rollup.failed_state_count
   );

create table if not exists public.civic_genome_temporal_reconciliation_receipt_v2 (
  reconciliation_receipt_id uuid primary key default gen_random_uuid(),
  contract text not null,
  methodology_version text not null,
  lifecycle_event_count integer not null check (lifecycle_event_count >= 0),
  corrected_bill_count integer not null check (corrected_bill_count >= 0),
  legacy_snapshot_count integer not null check (legacy_snapshot_count >= 0),
  lifecycle_event_set_hash text not null,
  receipt_hash text not null,
  receipt_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint civic_genome_temporal_reconciliation_event_hash_format
    check (lifecycle_event_set_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_temporal_reconciliation_receipt_hash_format
    check (receipt_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_temporal_reconciliation_receipt_hash_unique
    unique (receipt_hash)
);

alter table public.civic_genome_temporal_reconciliation_receipt_v2
  enable row level security;
revoke all on table public.civic_genome_temporal_reconciliation_receipt_v2
  from public, anon, authenticated;
grant select on table public.civic_genome_temporal_reconciliation_receipt_v2
  to authenticated, service_role;
grant insert on table public.civic_genome_temporal_reconciliation_receipt_v2
  to service_role;

drop policy if exists civic_genome_temporal_reconciliation_authenticated_read
  on public.civic_genome_temporal_reconciliation_receipt_v2;
create policy civic_genome_temporal_reconciliation_authenticated_read
  on public.civic_genome_temporal_reconciliation_receipt_v2
  for select
  to authenticated
  using (true);

drop policy if exists civic_genome_temporal_reconciliation_service_read
  on public.civic_genome_temporal_reconciliation_receipt_v2;
create policy civic_genome_temporal_reconciliation_service_read
  on public.civic_genome_temporal_reconciliation_receipt_v2
  for select
  to service_role
  using (true);

drop policy if exists civic_genome_temporal_reconciliation_service_insert
  on public.civic_genome_temporal_reconciliation_receipt_v2;
create policy civic_genome_temporal_reconciliation_service_insert
  on public.civic_genome_temporal_reconciliation_receipt_v2
  for insert
  to service_role
  with check (true);

drop trigger if exists civic_genome_temporal_reconciliation_append_only
  on public.civic_genome_temporal_reconciliation_receipt_v2;
create trigger civic_genome_temporal_reconciliation_append_only
before update or delete on public.civic_genome_temporal_reconciliation_receipt_v2
for each row execute function public.reject_civic_genome_temporal_history_mutation_v2();

drop trigger if exists civic_genome_temporal_reconciliation_reject_truncate
  on public.civic_genome_temporal_reconciliation_receipt_v2;
create trigger civic_genome_temporal_reconciliation_reject_truncate
before truncate on public.civic_genome_temporal_reconciliation_receipt_v2
for each statement execute function public.reject_civic_genome_temporal_history_mutation_v2();

with receipt_basis as (
  select
    count(*)::integer as lifecycle_event_count,
    count(distinct genome_bill_id)::integer as corrected_bill_count,
    encode(
      extensions.digest(
        convert_to(
          coalesce(string_agg(source_event_key, '' order by source_event_key), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as lifecycle_event_set_hash
  from public.civic_genome_lifecycle_event_v2
), complete_basis as (
  select
    receipt_basis.*,
    (select count(*)::integer from public.family_momentum_snapshot)
      as legacy_snapshot_count
  from receipt_basis
), identified_receipt as (
  select
    complete_basis.*,
    encode(
      extensions.digest(
        convert_to(
          concat_ws(
            chr(31),
            'civic_genome_temporal_reconciliation_v2',
            complete_basis.lifecycle_event_count::text,
            complete_basis.corrected_bill_count::text,
            complete_basis.legacy_snapshot_count::text,
            complete_basis.lifecycle_event_set_hash
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as receipt_hash
  from complete_basis
)
insert into public.civic_genome_temporal_reconciliation_receipt_v2 (
  contract,
  methodology_version,
  lifecycle_event_count,
  corrected_bill_count,
  legacy_snapshot_count,
  lifecycle_event_set_hash,
  receipt_hash,
  receipt_json
)
select
  'civic_genome_temporal_reconciliation_v2',
  'civic_genome_event_time_v2',
  receipt.lifecycle_event_count,
  receipt.corrected_bill_count,
  receipt.legacy_snapshot_count,
  receipt.lifecycle_event_set_hash,
  receipt.receipt_hash,
  jsonb_build_object(
    'contract', 'civic_genome_temporal_reconciliation_v2',
    'chronology_basis', 'source_event_time',
    'lifecycle_event_count', receipt.lifecycle_event_count,
    'corrected_bill_count', receipt.corrected_bill_count,
    'legacy_snapshot_count', receipt.legacy_snapshot_count,
    'lifecycle_event_set_hash', receipt.lifecycle_event_set_hash,
    'legacy_rows_preserved', true
  )
from identified_receipt receipt
on conflict (receipt_hash) do nothing;

create or replace function public.sync_civic_genome_lifecycle_from_detail_cache_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  target_bill record;
begin
  perform public.sync_civic_genome_lifecycle_history_v2(new.bill_id);

  for target_bill in
    select bill.genome_bill_id
    from public.civic_genome_bill bill
    where case
      when coalesce(bill.structural_dna_json->>'source_bill_id', '') ~ '^[0-9]+$'
        then (bill.structural_dna_json->>'source_bill_id')::integer
      else null
    end = new.bill_id
  loop
    perform public.refresh_civic_genome_bill_temporal_projection_v2(
      target_bill.genome_bill_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_civic_genome_lifecycle_from_detail_cache_v2()
  from public, anon, authenticated;

drop trigger if exists docket_bill_detail_cache_lifecycle_event_time_v2
  on public.docket_bill_detail_cache;
create trigger docket_bill_detail_cache_lifecycle_event_time_v2
after insert or update of bill, fetched_at on public.docket_bill_detail_cache
for each row execute function public.sync_civic_genome_lifecycle_from_detail_cache_v2();

create or replace function public.sync_civic_genome_lifecycle_from_bill_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  source_bill_id integer;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if coalesce(new.structural_dna_json->>'source_bill_id', '') !~ '^[0-9]+$' then
    return new;
  end if;

  source_bill_id := (new.structural_dna_json->>'source_bill_id')::integer;
  perform public.sync_civic_genome_lifecycle_history_v2(source_bill_id);
  perform public.refresh_civic_genome_bill_temporal_projection_v2(
    new.genome_bill_id
  );
  return new;
end;
$$;

revoke all on function public.sync_civic_genome_lifecycle_from_bill_v2()
  from public, anon, authenticated;

drop trigger if exists civic_genome_bill_lifecycle_event_time_v2
  on public.civic_genome_bill;
create trigger civic_genome_bill_lifecycle_event_time_v2
after insert or update of structural_dna_json on public.civic_genome_bill
for each row execute function public.sync_civic_genome_lifecycle_from_bill_v2();

comment on table public.civic_genome_lifecycle_event_v2 is
  'Append-only bitemporal legislative lifecycle ledger. valid_at is source event time; observed_at is Lighthouse receipt time. Rosetta and projection run times remain separate.';
comment on column public.civic_genome_lifecycle_event_v2.valid_at is
  'The date/time the legislative action occurred according to the source history.';
comment on column public.civic_genome_lifecycle_event_v2.observed_at is
  'The surviving Docket detail-cache receipt time when Lighthouse observed the source history.';
comment on column public.civic_genome_lifecycle_event_v2.effective_at is
  'The law effective date stated by the source action, distinct from the action valid_at and receipt observed_at.';
comment on view public.v_civic_genome_bill_temporal_facts_v2 is
  'Current bill lifecycle facts derived only from immutable source-event chronology; observation and extraction time are not substituted for legal event time.';
comment on function public.civic_genome_family_momentum_event_time_v2(uuid, timestamptz) is
  'Deterministic family momentum replay over legal event time, bounded independently by the observation-time cursor.';
comment on table public.family_momentum_snapshot is
  'Legacy v1 receipt-time status snapshots. Preserved as evidence; not canonical legal-event chronology. Use civic_genome_family_momentum_event_time_v2 for event-time momentum.';
comment on table public.civic_genome_temporal_reconciliation_receipt_v2 is
  'Append-only hash receipt for the event-time chronology reconciliation. Legacy snapshots are counted and preserved, never rewritten or deleted.';

commit;
