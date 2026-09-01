begin;

-- Handle empty current revisions and align corrections within stable-event
-- anchor segments so insertions/deletions cannot shift supersession lineage.
create or replace function public.sync_civic_genome_lifecycle_history_v3(
  p_source_bill_id integer default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  affected_count integer := 0;
  step_count integer := 0;
begin
  with current_history as materialized (
    select *
    from public.civic_genome_normalized_source_history_v3(p_source_bill_id)
  ), latest_prior_revision as materialized (
    select distinct on (revision.genome_bill_id)
      revision.*
    from public.civic_genome_lifecycle_source_revision_v3 revision
    where public.civic_genome_source_bill_in_sync_scope_v3(
      revision.source_bill_id,
      p_source_bill_id
    )
    order by
      revision.genome_bill_id,
      revision.observed_at desc,
      revision.created_at desc,
      revision.source_revision_id desc
  ), prior_active as materialized (
    select event.*
    from latest_prior_revision revision
    cross join lateral unnest(revision.source_event_keys) source_key
    join public.civic_genome_lifecycle_event_v2 event
      on event.genome_bill_id = revision.genome_bill_id
     and event.source_event_key = source_key
    where event.event_type <> 'source_tombstone'

    union all

    select event.*
    from public.civic_genome_lifecycle_event_v2 event
    where event.event_type <> 'source_tombstone'
      and public.civic_genome_source_bill_in_sync_scope_v3(
        event.source_bill_id,
        p_source_bill_id
      )
      and not exists (
        select 1
        from latest_prior_revision revision
        where revision.genome_bill_id = event.genome_bill_id
      )
  ), stable_event as materialized (
    select
      current.genome_bill_id,
      current.source_event_key,
      current.source_sequence as current_source_sequence,
      prior.source_sequence as prior_source_sequence
    from current_history current
    join prior_active prior
      on prior.genome_bill_id = current.genome_bill_id
     and prior.source_event_key = current.source_event_key
  ), current_alignment as materialized (
    select
      current.*,
      stable.source_event_key as stable_source_event_key,
      count(stable.source_event_key) over (
        partition by current.genome_bill_id
        order by current.source_sequence, current.source_event_key
        rows between unbounded preceding and current row
      ) as anchor_segment
    from current_history current
    left join stable_event stable
      on stable.genome_bill_id = current.genome_bill_id
     and stable.source_event_key = current.source_event_key
  ), prior_alignment as materialized (
    select
      prior.*,
      stable.source_event_key as stable_source_event_key,
      count(stable.source_event_key) over (
        partition by prior.genome_bill_id
        order by prior.source_sequence, prior.source_event_key
        rows between unbounded preceding and current row
      ) as anchor_segment
    from prior_active prior
    left join stable_event stable
      on stable.genome_bill_id = prior.genome_bill_id
     and stable.source_event_key = prior.source_event_key
  ), unmatched_current as materialized (
    select
      aligned.*,
      row_number() over (
        partition by aligned.genome_bill_id, aligned.anchor_segment
        order by aligned.source_sequence, aligned.source_event_key
      ) as unmatched_ordinal
    from current_alignment aligned
    where aligned.stable_source_event_key is null
  ), unmatched_prior as materialized (
    select
      aligned.*,
      row_number() over (
        partition by aligned.genome_bill_id, aligned.anchor_segment
        order by aligned.source_sequence, aligned.source_event_key
      ) as unmatched_ordinal
    from prior_alignment aligned
    where aligned.stable_source_event_key is null
  ), replacement_predecessor as materialized (
    select
      current.genome_bill_id,
      current.source_event_key,
      prior.lifecycle_event_id
    from unmatched_current current
    join unmatched_prior prior
      on prior.genome_bill_id = current.genome_bill_id
     and prior.anchor_segment = current.anchor_segment
     and prior.unmatched_ordinal = current.unmatched_ordinal
  ), linked_history as materialized (
    select
      current.*,
      predecessor.lifecycle_event_id as supersedes_lifecycle_event_id
    from current_history current
    left join replacement_predecessor predecessor
      on predecessor.genome_bill_id = current.genome_bill_id
     and predecessor.source_event_key = current.source_event_key
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
    source_input_hash,
    supersedes_lifecycle_event_id
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
    history.valid_at,
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
      'source_event_key', history.source_event_key,
      'temporal_contract', 'civic_genome_event_time_v3'
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'source_event', history.source_event,
      'state_position_after', history.state_position_after,
      'effective_at', history.effective_at,
      'chronology_basis', 'source_event_time',
      'observed_at', history.observed_at,
      'supersession_kind', case
        when history.supersedes_lifecycle_event_id is null then null
        else 'source_correction'
      end
    )),
    history.source_input_hash,
    history.supersedes_lifecycle_event_id
  from linked_history history
  on conflict (source_event_key) do nothing;

  get diagnostics step_count = row_count;
  affected_count := affected_count + step_count;

  with targets as materialized (
    select
      bill.genome_bill_id,
      source_cache.bill_id as source_bill_id,
      source_cache.bill as source_payload,
      source_cache.fetched_at as observed_at
    from public.civic_genome_bill bill
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = case
        when coalesce(bill.structural_dna_json->>'source_bill_id', '') ~ '^[0-9]+$'
          then (bill.structural_dna_json->>'source_bill_id')::integer
        else null
      end
    where public.civic_genome_source_bill_in_sync_scope_v3(
      source_cache.bill_id,
      p_source_bill_id
    )
  ), current_history as materialized (
    select *
    from public.civic_genome_normalized_source_history_v3(p_source_bill_id)
  ), revision_basis as materialized (
    select
      target.genome_bill_id,
      target.source_bill_id,
      target.observed_at,
      encode(
        extensions.digest(
          convert_to(target.source_payload::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) as source_payload_hash,
      coalesce(
        array_agg(
          current.source_event_key
          order by current.source_sequence, current.source_event_key
        ) filter (where current.source_event_key is not null),
        '{}'::text[]
      ) as source_event_keys,
      count(current.source_event_key)::integer as event_count,
      coalesce(
        string_agg(
          concat_ws(
            chr(31),
            current.source_sequence::text,
            current.source_event_key
          ),
          chr(30)
          order by current.source_sequence, current.source_event_key
        ),
        ''
      ) as event_material
    from targets target
    left join current_history current
      on current.genome_bill_id = target.genome_bill_id
    group by
      target.genome_bill_id,
      target.source_bill_id,
      target.observed_at,
      target.source_payload
  ), identified_revision as materialized (
    select
      basis.*,
      encode(
        extensions.digest(
          convert_to(
            concat_ws(
              chr(31),
              'civic_genome_source_revision_v3',
              basis.source_bill_id::text,
              basis.source_payload_hash,
              basis.event_material
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as source_revision_hash
    from revision_basis basis
  )
  insert into public.civic_genome_lifecycle_source_revision_v3 (
    genome_bill_id,
    source_bill_id,
    source_provider,
    observed_at,
    source_revision_hash,
    source_payload_hash,
    source_event_keys,
    event_count,
    prior_source_revision_id,
    revision_payload_json
  )
  select
    revision.genome_bill_id,
    revision.source_bill_id,
    'legiscan_bill_history',
    revision.observed_at,
    revision.source_revision_hash,
    revision.source_payload_hash,
    revision.source_event_keys,
    revision.event_count,
    prior.source_revision_id,
    jsonb_build_object(
      'temporal_contract', 'civic_genome_event_time_v3',
      'source_bill_id', revision.source_bill_id,
      'observed_at', revision.observed_at,
      'event_count', revision.event_count,
      'source_event_keys', to_jsonb(revision.source_event_keys),
      'source_payload_hash', revision.source_payload_hash
    )
  from identified_revision revision
  left join lateral (
    select prior_revision.source_revision_id
    from public.civic_genome_lifecycle_source_revision_v3 prior_revision
    where prior_revision.genome_bill_id = revision.genome_bill_id
    order by
      prior_revision.observed_at desc,
      prior_revision.created_at desc,
      prior_revision.source_revision_id desc
    limit 1
  ) prior on true
  on conflict (genome_bill_id, observed_at, source_revision_hash) do nothing;

  get diagnostics step_count = row_count;
  affected_count := affected_count + step_count;

  with current_revision as materialized (
    select distinct on (revision.genome_bill_id)
      revision.*
    from public.civic_genome_lifecycle_source_revision_v3 revision
    where public.civic_genome_source_bill_in_sync_scope_v3(
      revision.source_bill_id,
      p_source_bill_id
    )
    order by
      revision.genome_bill_id,
      revision.observed_at desc,
      revision.created_at desc,
      revision.source_revision_id desc
  ), prior_active as materialized (
    select event.*
    from current_revision current
    join public.civic_genome_lifecycle_source_revision_v3 prior
      on prior.source_revision_id = current.prior_source_revision_id
    cross join lateral unnest(prior.source_event_keys) source_key
    join public.civic_genome_lifecycle_event_v2 event
      on event.genome_bill_id = prior.genome_bill_id
     and event.source_event_key = source_key
    where event.event_type <> 'source_tombstone'

    union all

    select event.*
    from current_revision current
    join public.civic_genome_lifecycle_event_v2 event
      on event.genome_bill_id = current.genome_bill_id
    where current.prior_source_revision_id is null
      and event.event_type <> 'source_tombstone'
  ), missing_prior as materialized (
    select
      current.source_revision_id,
      current.source_revision_hash,
      current.source_payload_hash,
      current.source_event_keys,
      current.observed_at as revision_observed_at,
      prior.*
    from current_revision current
    join prior_active prior
      on prior.genome_bill_id = current.genome_bill_id
    where not (prior.source_event_key = any(current.source_event_keys))
      and not exists (
        select 1
        from public.civic_genome_lifecycle_event_v2 replacement
        where replacement.supersedes_lifecycle_event_id = prior.lifecycle_event_id
          and replacement.source_event_key = any(current.source_event_keys)
      )
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
    source_input_hash,
    supersedes_lifecycle_event_id
  )
  select
    missing.genome_bill_id,
    missing.bill_id,
    missing.state_code,
    missing.source_bill_id,
    'legiscan_bill_history_tombstone',
    encode(
      extensions.digest(
        convert_to(
          concat_ws(
            chr(31),
            'civic_genome_source_tombstone_v3',
            missing.source_revision_id::text,
            missing.lifecycle_event_id::text
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    missing.source_sequence,
    missing.source_duplicate_sequence,
    'source_tombstone',
    missing.valid_at,
    null,
    missing.revision_observed_at,
    null,
    'Source history action removed or corrected in a later revision.',
    missing.chamber_code,
    null,
    jsonb_build_array(jsonb_build_object(
      'source_layer', 'docket_bill_detail_cache',
      'source_bill_id', missing.source_bill_id,
      'source_revision_id', missing.source_revision_id,
      'superseded_source_event_key', missing.source_event_key
    )),
    jsonb_build_object(
      'temporal_contract', 'civic_genome_event_time_v3',
      'supersession_kind', 'source_tombstone',
      'reason', 'source_action_absent_from_current_revision',
      'source_revision_id', missing.source_revision_id,
      'source_revision_hash', missing.source_revision_hash,
      'superseded_source_event_key', missing.source_event_key,
      'observed_at', missing.revision_observed_at
    ),
    missing.source_payload_hash,
    missing.lifecycle_event_id
  from missing_prior missing
  on conflict (source_event_key) do nothing;

  get diagnostics step_count = row_count;
  affected_count := affected_count + step_count;
  return affected_count;
end;
$$;

revoke all on function public.sync_civic_genome_lifecycle_history_v3(integer)
  from public, anon, authenticated;
grant execute on function public.sync_civic_genome_lifecycle_history_v3(integer)
  to service_role;

create or replace view public.v_civic_genome_bill_temporal_facts_v3
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
  revision.observed_at as last_observed_at,
  (
    array_agg(
      event.action_text
      order by event.valid_at desc, event.source_sequence desc, event.lifecycle_event_id desc
    ) filter (where event.lifecycle_event_id is not null)
  )[1] as last_action_text,
  (
    array_agg(
      event.state_position_after
      order by event.valid_at desc, event.source_sequence desc, event.lifecycle_event_id desc
    ) filter (where event.state_position_after is not null)
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
  'civic_genome_event_time_v3'::text as temporal_contract
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

alter table public.civic_genome_bill
  alter column current_state_position drop not null;

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
           'current_state_position', facts.current_state_position,
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

with latest_revision as materialized (
  select distinct on (revision.genome_bill_id)
    revision.genome_bill_id,
    revision.event_count
  from public.civic_genome_lifecycle_source_revision_v3 revision
  order by
    revision.genome_bill_id,
    revision.observed_at desc,
    revision.created_at desc,
    revision.source_revision_id desc
)
select public.refresh_civic_genome_bill_temporal_projection_v2(
  revision.genome_bill_id
)
from latest_revision revision
where revision.event_count = 0;

comment on view public.v_civic_genome_bill_temporal_facts_v3 is
  'One correction-aware facts row per latest source revision, including an explicit zero-event row when current source history is empty.';
comment on column public.civic_genome_bill.current_state_position is
  'Nullable when the latest source revision asserts no current lifecycle action; never retain a stale terminal state.';
comment on function public.sync_civic_genome_lifecycle_history_v3(integer) is
  'Correction-aware reconciliation using stable-event anchor segments so ordinal shifts do not corrupt supersession lineage.';

commit;

