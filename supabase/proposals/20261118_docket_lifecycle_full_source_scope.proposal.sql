-- REVIEW ONLY. Proposed Docket activation lifecycle trigger read remediation.
-- Retrieved exact production function on 2026-11-18. Changes only the
-- source-scoped reads: both revision selectors, prior-active events selector,
-- and the lifecycle target cache join. All original writes and event hashes,
-- correction/tombstone rules, NULL range behavior, source receipt logic, ACL,
-- SECURITY DEFINER and SET search_path remain unaltered.
-- The Docket canary remains OFF. Original three and newly failed three jobs
-- must not be retried. No production migration, worker activation, API calls.
-- Requires full disposable test replay, generic planner proof and review.

CREATE OR REPLACE FUNCTION public.sync_civic_genome_lifecycle_history_v3(p_source_bill_id integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
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
    from (
      -- Separate generic-plan indexable and unscoped range branches.
      select scoped.*
      from public.civic_genome_lifecycle_source_revision_v3 scoped
      where p_source_bill_id is not null
        and scoped.source_bill_id = p_source_bill_id
      union all
      select unscoped.*
      from public.civic_genome_lifecycle_source_revision_v3 unscoped
      where p_source_bill_id is null
        and public.civic_genome_source_bill_in_sync_scope_v3(
          unscoped.source_bill_id, p_source_bill_id
        )
    ) revision
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
    from (
      -- Avoid global prior-active events scan for an exact bill.
      select scoped.*
      from public.civic_genome_lifecycle_event_v2 scoped
      where p_source_bill_id is not null
        and scoped.source_bill_id = p_source_bill_id
      union all
      select unscoped.*
      from public.civic_genome_lifecycle_event_v2 unscoped
      where p_source_bill_id is null
        and public.civic_genome_source_bill_in_sync_scope_v3(
          unscoped.source_bill_id, p_source_bill_id
        )
    ) event
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
    -- Exact positive bill ID uses canonical Docket SHA256 UUID;
    -- distinct null/unscoped and nonpositive arms retain historic behavior.
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
    where p_source_bill_id > 0
      and bill.bill_id = (
        select (
          substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'
          ||substr('89ab',((strpos('0123456789abcdef',substr(h,17,1))-1)%4)+1,1)
          ||substr(h,18,3)||'-'||substr(h,21,12)
        )::uuid
        from (
          select encode(extensions.digest(
            convert_to('docket_room:legiscan:'||p_source_bill_id::text,'UTF8'),
            'sha256'
          ),'hex') as h
        ) as source_identity_hash
      )
      and bill.structural_dna_json->>'source_bill_id' = p_source_bill_id::text
      and public.civic_genome_source_bill_in_sync_scope_v3(
      source_cache.bill_id,
      p_source_bill_id
    )
    union all
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
    where p_source_bill_id is null
      and public.civic_genome_source_bill_in_sync_scope_v3(
      source_cache.bill_id,
      p_source_bill_id
    )
    union all
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
    where p_source_bill_id <= 0
      and public.civic_genome_source_bill_in_sync_scope_v3(
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
    from (
      -- Separate generic-plan indexable and unscoped range branches.
      select scoped.*
      from public.civic_genome_lifecycle_source_revision_v3 scoped
      where p_source_bill_id is not null
        and scoped.source_bill_id = p_source_bill_id
      union all
      select unscoped.*
      from public.civic_genome_lifecycle_source_revision_v3 unscoped
      where p_source_bill_id is null
        and public.civic_genome_source_bill_in_sync_scope_v3(
          unscoped.source_bill_id, p_source_bill_id
        )
    ) revision
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
$function$;
