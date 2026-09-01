begin;

-- Activate correction-aware current views only after the source-revision
-- ledger is fully reconciled and v3 write triggers are live.
create or replace view public.v_civic_genome_lifecycle_event_current_v3
with (security_invoker = true)
as
with latest_revision as materialized (
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
  'current'::text as canonical_status
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

create or replace view public.v_civic_genome_lifecycle_event_history_v3
with (security_invoker = true)
as
with latest_revision as materialized (
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
  case
    when event.event_type = 'source_tombstone' then 'tombstone'
    when event.source_event_key = any(revision.source_event_keys) then 'current'
    else 'superseded'
  end::text as canonical_status
from public.civic_genome_lifecycle_event_v2 event
left join latest_revision revision
  on revision.genome_bill_id = event.genome_bill_id;

revoke all on table public.v_civic_genome_lifecycle_event_history_v3
  from public, anon, authenticated;
grant select on table public.v_civic_genome_lifecycle_event_history_v3
  to authenticated, service_role;

create or replace view public.v_civic_genome_bill_temporal_facts_v3
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
  max(event.current_revision_observed_at) as last_observed_at,
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
  'civic_genome_event_time_v3'::text as temporal_contract
from public.civic_genome_bill bill
join public.v_civic_genome_lifecycle_event_current_v3 event
  on event.genome_bill_id = bill.genome_bill_id
group by
  bill.genome_bill_id,
  bill.bill_id,
  bill.family_id,
  bill.state_code,
  bill.source_bill_number;

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
              'civic_genome_momentum_event_time_v3',
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
    'cg-momentum-v3-' || substr(current_day.input_hash, 1, 32)
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
    'civic_genome_momentum_event_time_v3'::text as methodology_version,
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

-- The bootstrap revision asserts the same event set that event-time v2 already
-- projected, so a full mutable-projection rewrite would only extend the DDL
-- lock window. Subsequent cache triggers refresh each bill after a real source
-- revision changes its canonical event set.

create table if not exists public.civic_genome_temporal_supersession_receipt_v3 (
  supersession_receipt_id uuid primary key default gen_random_uuid(),
  contract text not null,
  source_revision_count integer not null check (source_revision_count >= 0),
  current_event_count integer not null check (current_event_count >= 0),
  supersession_count integer not null check (supersession_count >= 0),
  tombstone_count integer not null check (tombstone_count >= 0),
  legacy_snapshot_count integer not null check (legacy_snapshot_count >= 0),
  current_event_set_hash text not null,
  receipt_hash text not null,
  receipt_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint civic_genome_temporal_supersession_current_hash_format
    check (current_event_set_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_temporal_supersession_receipt_hash_format
    check (receipt_hash ~ '^[0-9a-f]{64}$'),
  constraint civic_genome_temporal_supersession_receipt_hash_unique
    unique (receipt_hash)
);

alter table public.civic_genome_temporal_supersession_receipt_v3
  enable row level security;
revoke all on table public.civic_genome_temporal_supersession_receipt_v3
  from public, anon, authenticated;
grant select on table public.civic_genome_temporal_supersession_receipt_v3
  to authenticated, service_role;
grant insert on table public.civic_genome_temporal_supersession_receipt_v3
  to service_role;

drop policy if exists civic_genome_temporal_supersession_receipt_v3_authenticated_read
  on public.civic_genome_temporal_supersession_receipt_v3;
create policy civic_genome_temporal_supersession_receipt_v3_authenticated_read
  on public.civic_genome_temporal_supersession_receipt_v3
  for select
  to authenticated
  using (true);

drop policy if exists civic_genome_temporal_supersession_receipt_v3_service_read
  on public.civic_genome_temporal_supersession_receipt_v3;
create policy civic_genome_temporal_supersession_receipt_v3_service_read
  on public.civic_genome_temporal_supersession_receipt_v3
  for select
  to service_role
  using (true);

drop policy if exists civic_genome_temporal_supersession_receipt_v3_service_insert
  on public.civic_genome_temporal_supersession_receipt_v3;
create policy civic_genome_temporal_supersession_receipt_v3_service_insert
  on public.civic_genome_temporal_supersession_receipt_v3
  for insert
  to service_role
  with check (true);

drop trigger if exists civic_genome_temporal_supersession_receipt_v3_append_only
  on public.civic_genome_temporal_supersession_receipt_v3;
create trigger civic_genome_temporal_supersession_receipt_v3_append_only
before update or delete on public.civic_genome_temporal_supersession_receipt_v3
for each row execute function public.reject_civic_genome_temporal_history_mutation_v2();

drop trigger if exists civic_genome_temporal_supersession_receipt_v3_reject_truncate
  on public.civic_genome_temporal_supersession_receipt_v3;
create trigger civic_genome_temporal_supersession_receipt_v3_reject_truncate
before truncate on public.civic_genome_temporal_supersession_receipt_v3
for each statement execute function public.reject_civic_genome_temporal_history_mutation_v2();

with receipt_basis as (
  select
    (select count(*)::integer
       from public.civic_genome_lifecycle_source_revision_v3)
      as source_revision_count,
    (select count(*)::integer
       from public.v_civic_genome_lifecycle_event_current_v3)
      as current_event_count,
    (select count(*)::integer
       from public.civic_genome_lifecycle_event_v2
      where supersedes_lifecycle_event_id is not null)
      as supersession_count,
    (select count(*)::integer
       from public.civic_genome_lifecycle_event_v2
      where event_type = 'source_tombstone')
      as tombstone_count,
    (select count(*)::integer from public.family_momentum_snapshot)
      as legacy_snapshot_count,
    encode(
      extensions.digest(
        convert_to(
          coalesce((
            select string_agg(
              event.source_event_key,
              ''
              order by event.source_event_key
            )
            from public.v_civic_genome_lifecycle_event_current_v3 event
          ), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as current_event_set_hash
), identified_receipt as (
  select
    basis.*,
    encode(
      extensions.digest(
        convert_to(
          concat_ws(
            chr(31),
            'civic_genome_temporal_supersession_v3',
            basis.source_revision_count::text,
            basis.current_event_count::text,
            basis.supersession_count::text,
            basis.tombstone_count::text,
            basis.legacy_snapshot_count::text,
            basis.current_event_set_hash
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as receipt_hash
  from receipt_basis basis
)
insert into public.civic_genome_temporal_supersession_receipt_v3 (
  contract,
  source_revision_count,
  current_event_count,
  supersession_count,
  tombstone_count,
  legacy_snapshot_count,
  current_event_set_hash,
  receipt_hash,
  receipt_json
)
select
  'civic_genome_temporal_supersession_v3',
  receipt.source_revision_count,
  receipt.current_event_count,
  receipt.supersession_count,
  receipt.tombstone_count,
  receipt.legacy_snapshot_count,
  receipt.current_event_set_hash,
  receipt.receipt_hash,
  jsonb_build_object(
    'contract', 'civic_genome_temporal_supersession_v3',
    'source_revision_count', receipt.source_revision_count,
    'current_event_count', receipt.current_event_count,
    'supersession_count', receipt.supersession_count,
    'tombstone_count', receipt.tombstone_count,
    'legacy_snapshot_count', receipt.legacy_snapshot_count,
    'current_event_set_hash', receipt.current_event_set_hash,
    'legacy_rows_preserved', true,
    'canonical_rule', 'latest_source_revision_only'
  )
from identified_receipt receipt
on conflict (receipt_hash) do nothing;

comment on table public.civic_genome_lifecycle_source_revision_v3 is
  'Append-only source-revision ledger. Each row records the exact event keys asserted by one Docket detail-cache observation.';
comment on column public.civic_genome_lifecycle_event_v2.supersedes_lifecycle_event_id is
  'Links a correction or tombstone to the immutable lifecycle assertion it supersedes. Current truth is resolved through the latest source revision.';
comment on view public.v_civic_genome_lifecycle_event_current_v3 is
  'Correction-aware current lifecycle evidence: only event keys asserted by the latest source revision; tombstones and superseded rows are excluded.';
comment on view public.v_civic_genome_lifecycle_event_history_v3 is
  'Complete immutable lifecycle history labeled current, superseded, or tombstone.';
comment on view public.v_civic_genome_bill_temporal_facts_v3 is
  'Current bill lifecycle facts derived only from the latest source revision over immutable legal-event history.';
comment on function public.civic_genome_family_momentum_event_time_v2(uuid, timestamptz) is
  'Correction-aware deterministic family momentum replay over legal event time, bounded by the latest source revision observed at the supplied cursor.';
comment on table public.civic_genome_temporal_supersession_receipt_v3 is
  'Append-only hash receipt for source revision, supersession, tombstone, and current-event reconciliation.';

commit;
