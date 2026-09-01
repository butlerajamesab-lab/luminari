begin;

-- Add transaction-local range scoping so the one-time revision bootstrap can
-- run in bounded bulk transactions. Exact-ID trigger sync behavior is unchanged.
create or replace function public.civic_genome_source_bill_in_sync_scope_v3(
  p_candidate_source_bill_id integer,
  p_exact_source_bill_id integer default null
)
returns boolean
language sql
stable
parallel safe
set search_path = pg_catalog, public, pg_temp
as $$
  select case
    when p_exact_source_bill_id is not null
      then p_candidate_source_bill_id = p_exact_source_bill_id
    else p_candidate_source_bill_id between
      coalesce(
        nullif(
          current_setting(
            'civic_genome.sync_source_bill_id_min',
            true
          ),
          ''
        )::integer,
        '-2147483648'::integer
      )
      and coalesce(
        nullif(
          current_setting(
            'civic_genome.sync_source_bill_id_max',
            true
          ),
          ''
        )::integer,
        '2147483647'::integer
      )
  end;
$$;

revoke all on function public.civic_genome_source_bill_in_sync_scope_v3(integer, integer)
  from public, anon, authenticated;
grant execute on function public.civic_genome_source_bill_in_sync_scope_v3(integer, integer)
  to service_role;

create or replace function public.civic_genome_normalized_source_history_v3(
  p_source_bill_id integer default null
)
returns table (
  genome_bill_id uuid,
  bill_id uuid,
  state_code text,
  source_bill_id integer,
  observed_at timestamptz,
  source_sequence integer,
  source_duplicate_sequence integer,
  event_type text,
  valid_at timestamptz,
  effective_at timestamptz,
  state_position_after text,
  action_text text,
  chamber_code text,
  importance integer,
  source_event jsonb,
  source_event_key text,
  source_input_hash text
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
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
    where public.civic_genome_source_bill_in_sync_scope_v3(
      source_cache.bill_id,
      p_source_bill_id
    )
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
  ), hashed_history as materialized (
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
      ) as base_source_event_key,
      encode(
        extensions.digest(
          convert_to(classified.source_event::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) as source_input_hash
    from classified_history classified
  )
  select
    history.genome_bill_id,
    history.bill_id,
    history.state_code,
    history.source_bill_id,
    history.observed_at,
    history.source_sequence,
    history.source_duplicate_sequence,
    history.event_type,
    history.valid_date::timestamp at time zone 'UTC' as valid_at,
    history.effective_at,
    history.state_position_after,
    history.action_text,
    history.chamber_code,
    history.importance,
    history.source_event,
    case
      when existing.lifecycle_event_id is null
        or existing.source_input_hash = history.source_input_hash
        then history.base_source_event_key
      else encode(
        extensions.digest(
          convert_to(
            concat_ws(
              chr(31),
              'legiscan_bill_history_v3_correction',
              history.base_source_event_key,
              history.source_sequence::text,
              history.source_input_hash
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    end as source_event_key,
    history.source_input_hash
  from hashed_history history
  left join public.civic_genome_lifecycle_event_v2 existing
    on existing.genome_bill_id = history.genome_bill_id
   and existing.source_event_key = history.base_source_event_key;
$$;

revoke all on function public.civic_genome_normalized_source_history_v3(integer)
  from public, anon, authenticated;
grant execute on function public.civic_genome_normalized_source_history_v3(integer)
  to service_role;

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
  create temporary table if not exists civic_genome_current_history_work_v3
  on commit drop
  as
  select *
  from public.civic_genome_normalized_source_history_v3(null)
  with no data;

  truncate table pg_temp.civic_genome_current_history_work_v3;

  insert into pg_temp.civic_genome_current_history_work_v3
  select *
  from public.civic_genome_normalized_source_history_v3(p_source_bill_id);

  with current_history as materialized (
    select *
    from pg_temp.civic_genome_current_history_work_v3
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
  ), linked_history as materialized (
    select
      current.*,
      predecessor.lifecycle_event_id as supersedes_lifecycle_event_id
    from current_history current
    left join lateral (
      select prior.lifecycle_event_id
      from prior_active prior
      where prior.genome_bill_id = current.genome_bill_id
        and prior.source_sequence = current.source_sequence
        and prior.source_event_key <> current.source_event_key
        and not exists (
          select 1
          from current_history still_current
          where still_current.genome_bill_id = prior.genome_bill_id
            and still_current.source_event_key = prior.source_event_key
        )
      order by
        prior.observed_at desc,
        prior.created_at desc,
        prior.lifecycle_event_id desc
      limit 1
    ) predecessor on true
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
    from pg_temp.civic_genome_current_history_work_v3
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

comment on function public.civic_genome_source_bill_in_sync_scope_v3(integer, integer) is
  'Resolves exact trigger syncs or a transaction-local inclusive source-bill range for bounded bootstrap reconciliation.';

commit;
