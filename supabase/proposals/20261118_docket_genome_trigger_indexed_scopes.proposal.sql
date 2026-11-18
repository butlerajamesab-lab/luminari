-- REVIEW ONLY, NOT A MIGRATION. Two function bodies retrieved from production on 2026-11-18.
-- Exact source-ID reads now use installed revision/event source indexes and canonical
-- SHA256 Docket bill UUID (never MD5). Null/unscoped source GUC bounds are retained.
-- Existing Docket ZIP/API writer, AFTER triggers, immutable receipts, enrollment,
-- correction/tombstone semantics, and search_path / SECURITY DEFINER unchanged.
-- Requires independent review and real-trigger disposable CI before any install.

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
      select src.* from public.civic_genome_lifecycle_source_revision_v3 src
      where p_source_bill_id is not null and src.source_bill_id = p_source_bill_id
      union all
      select src.* from public.civic_genome_lifecycle_source_revision_v3 src
      where p_source_bill_id is null
        and public.civic_genome_source_bill_in_sync_scope_v3(src.source_bill_id,p_source_bill_id)
    ) revision
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
      select src.* from public.civic_genome_lifecycle_event_v2 src
      where p_source_bill_id is not null and src.source_bill_id = p_source_bill_id
      union all
      select src.* from public.civic_genome_lifecycle_event_v2 src
      where p_source_bill_id is null
        and public.civic_genome_source_bill_in_sync_scope_v3(src.source_bill_id,p_source_bill_id)
    ) event
    where event.event_type <> 'source_tombstone'
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
    -- Scoped and unscoped branches include their own cache join. The generic
    -- plan can use the Genome UUID unique index AND Docket cache PK for a
    -- positive exact source, without building a full cache hash join.
    select bill.genome_bill_id,source_cache.bill_id as source_bill_id,
      source_cache.bill as source_payload,source_cache.fetched_at as observed_at
    from public.civic_genome_bill bill
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = case
        when coalesce(bill.structural_dna_json->>'source_bill_id','') ~ '^[0-9]+$'
          then (bill.structural_dna_json->>'source_bill_id')::integer
        else null
      end
    where p_source_bill_id > 0
      and bill.bill_id = (select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',((strpos('0123456789abcdef',substr(h,17,1))-1)%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select encode(extensions.digest(convert_to('docket_room:legiscan:'||p_source_bill_id::text,'UTF8'),'sha256'),'hex') h) source_identity_hash)
      and bill.structural_dna_json->>'source_bill_id' = p_source_bill_id::text
      and public.civic_genome_source_bill_in_sync_scope_v3(source_cache.bill_id,p_source_bill_id)

    union all

    select bill.genome_bill_id,source_cache.bill_id as source_bill_id,
      source_cache.bill as source_payload,source_cache.fetched_at as observed_at
    from public.civic_genome_bill bill
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = case
        when coalesce(bill.structural_dna_json->>'source_bill_id','') ~ '^[0-9]+$'
          then (bill.structural_dna_json->>'source_bill_id')::integer
        else null
      end
    where p_source_bill_id is null
      and public.civic_genome_source_bill_in_sync_scope_v3(source_cache.bill_id,p_source_bill_id)

    union all

    select bill.genome_bill_id,source_cache.bill_id as source_bill_id,
      source_cache.bill as source_payload,source_cache.fetched_at as observed_at
    from public.civic_genome_bill bill
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = case
        when coalesce(bill.structural_dna_json->>'source_bill_id','') ~ '^[0-9]+$'
          then (bill.structural_dna_json->>'source_bill_id')::integer
        else null
      end
    where p_source_bill_id <= 0
      and public.civic_genome_source_bill_in_sync_scope_v3(source_cache.bill_id,p_source_bill_id)
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
      select src.* from public.civic_genome_lifecycle_source_revision_v3 src
      where p_source_bill_id is not null and src.source_bill_id = p_source_bill_id
      union all
      select src.* from public.civic_genome_lifecycle_source_revision_v3 src
      where p_source_bill_id is null
        and public.civic_genome_source_bill_in_sync_scope_v3(src.source_bill_id,p_source_bill_id)
    ) revision
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

CREATE OR REPLACE FUNCTION public.register_docket_legislative_version_spine(p_source_bill_id integer, p_enqueue boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_bill jsonb;
  v_fetched_at timestamptz;
  v_genome_bill_id uuid;
  v_document jsonb;
  v_sequence bigint;
  v_provider_document_id bigint;
  v_document_family text;
  v_provider_type text;
  v_chamber text;
  v_version_type text;
  v_stage_rank integer;
  v_source_url text;
  v_provider_url text;
  v_provider_hash text;
  v_provider_size bigint;
  v_provider_date date;
  v_adopted boolean;
  v_description text;
  v_source_stem text;
  v_source_document_key text;
  v_metadata jsonb;
  v_metadata_hash text;
  v_registered integer := 0;
  v_enqueued integer := 0;
begin
  select cache.bill, cache.fetched_at
    into v_bill, v_fetched_at
  from public.docket_bill_detail_cache cache
  where cache.bill_id = p_source_bill_id
  order by cache.fetched_at desc
  limit 1;

  if v_bill is null then
    raise exception using
      errcode = 'P0002',
      message = 'docket_bill_detail_cache_not_found';
  end if;

  select candidate.genome_bill_id
    into v_genome_bill_id
  from (
    select bill.genome_bill_id,bill.updated_at
    from public.civic_genome_bill bill
    where p_source_bill_id > 0
      and bill.bill_id = (select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',((strpos('0123456789abcdef',substr(h,17,1))-1)%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select encode(extensions.digest(convert_to('docket_room:legiscan:'||p_source_bill_id::text,'UTF8'),'sha256'),'hex') h) source_identity_hash)
      and bill.structural_dna_json->>'source_bill_id' = p_source_bill_id::text
    union all
    select bill.genome_bill_id,bill.updated_at
    from public.civic_genome_bill bill
    where p_source_bill_id <= 0
      and bill.structural_dna_json->>'source_bill_id' = p_source_bill_id::text
  ) candidate
  order by candidate.updated_at desc,candidate.genome_bill_id
  limit 1;

  if v_genome_bill_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'civic_genome_bill_not_found_for_docket_version_spine';
  end if;

  for v_document, v_sequence in
    select item.value, item.ordinality
    from jsonb_array_elements(coalesce(v_bill -> 'texts', '[]'::jsonb))
      with ordinality as item(value, ordinality)
  loop
    v_document_family := 'text';
    v_provider_document_id := nullif(v_document ->> 'doc_id', '')::bigint;
    v_provider_type := coalesce(nullif(v_document ->> 'type', ''), 'Official text');
    v_chamber := null;
    v_version_type := public.docket_legislative_version_type(v_document_family, v_provider_type, v_chamber);
    v_stage_rank := public.docket_legislative_stage_rank(v_version_type);
    v_source_url := coalesce(nullif(v_document ->> 'state_link', ''), nullif(v_document ->> 'url', ''));
    v_provider_url := nullif(v_document ->> 'url', '');
    v_provider_hash := nullif(v_document ->> 'text_hash', '');
    v_provider_size := nullif(v_document ->> 'text_size', '')::bigint;
    v_provider_date := case
      when coalesce(v_document ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       and v_document ->> 'date' <> '0000-00-00' then (v_document ->> 'date')::date
      else null end;
    v_adopted := null;
    v_description := null;
    v_source_stem := public.docket_legislative_source_stem(v_source_url);
    if v_provider_document_id is null or v_source_url is null then continue; end if;
    v_source_document_key := format('text:%s:%s', p_source_bill_id, v_provider_document_id);
    v_metadata := jsonb_build_object(
      'source_bill_id', p_source_bill_id,
      'source_document_key', v_source_document_key,
      'document_family', v_document_family,
      'provider_document_id', v_provider_document_id,
      'provider_sequence', v_sequence,
      'provider_document_type', v_provider_type,
      'normalized_version_type', v_version_type,
      'stage_rank', v_stage_rank,
      'source_url', v_source_url,
      'provider_url', v_provider_url,
      'provider_hash', v_provider_hash,
      'provider_size', v_provider_size,
      'provider_date', v_provider_date,
      'source_stem', v_source_stem,
      'provider_payload', v_document
    );
    v_metadata_hash := encode(public.digest(convert_to(v_metadata::text, 'UTF8'), 'sha256'), 'hex');
    insert into public.docket_bill_source_document (
      source_document_key, source_bill_id, provider_document_id, document_family,
      provider_document_type, normalized_version_type, provider_sequence, stage_rank,
      chamber, source_url, provider_url, provider_hash, provider_size, provider_date,
      adopted, description, source_stem, latest_metadata, latest_observed_at
    ) values (
      v_source_document_key, p_source_bill_id, v_provider_document_id, v_document_family,
      v_provider_type, v_version_type, v_sequence::integer, v_stage_rank,
      v_chamber, v_source_url, v_provider_url, v_provider_hash, v_provider_size,
      v_provider_date, v_adopted, v_description, v_source_stem, v_metadata, v_fetched_at
    ) on conflict (source_document_key) do update set
      provider_document_type = excluded.provider_document_type,
      normalized_version_type = excluded.normalized_version_type,
      provider_sequence = excluded.provider_sequence,
      stage_rank = excluded.stage_rank,
      chamber = excluded.chamber,
      source_url = excluded.source_url,
      provider_url = excluded.provider_url,
      provider_hash = excluded.provider_hash,
      provider_size = excluded.provider_size,
      provider_date = coalesce(excluded.provider_date, docket_bill_source_document.provider_date),
      adopted = excluded.adopted,
      description = excluded.description,
      source_stem = excluded.source_stem,
      latest_metadata = excluded.latest_metadata,
      latest_observed_at = excluded.latest_observed_at,
      updated_at = now();
    insert into public.docket_bill_source_document_observation (
      source_document_key, metadata_hash, metadata_json, docket_fetched_at
    ) values (v_source_document_key, v_metadata_hash, v_metadata, v_fetched_at)
    on conflict (source_document_key, metadata_hash) do nothing;
    v_registered := v_registered + 1;
  end loop;

  for v_document, v_sequence in
    select item.value, item.ordinality
    from jsonb_array_elements(coalesce(v_bill -> 'amendments', '[]'::jsonb))
      with ordinality as item(value, ordinality)
  loop
    v_document_family := 'amendment';
    v_provider_document_id := nullif(v_document ->> 'amendment_id', '')::bigint;
    v_provider_type := coalesce(nullif(v_document ->> 'title', ''), 'Amendment');
    v_chamber := nullif(upper(v_document ->> 'chamber'), '');
    v_version_type := public.docket_legislative_version_type(v_document_family, v_provider_type, v_chamber);
    v_stage_rank := public.docket_legislative_stage_rank(v_version_type);
    v_source_url := coalesce(nullif(v_document ->> 'state_link', ''), nullif(v_document ->> 'url', ''));
    v_provider_url := nullif(v_document ->> 'url', '');
    v_provider_hash := nullif(v_document ->> 'amendment_hash', '');
    v_provider_size := nullif(v_document ->> 'amendment_size', '')::bigint;
    v_provider_date := case
      when coalesce(v_document ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       and v_document ->> 'date' <> '0000-00-00' then (v_document ->> 'date')::date
      else null end;
    v_adopted := case when v_document ? 'adopted' then (v_document ->> 'adopted')::integer = 1 else null end;
    v_description := nullif(v_document ->> 'description', '');
    v_source_stem := public.docket_legislative_source_stem(v_source_url);
    if v_provider_document_id is null or v_source_url is null then continue; end if;
    v_source_document_key := format('amendment:%s:%s', p_source_bill_id, v_provider_document_id);
    v_metadata := jsonb_build_object(
      'source_bill_id', p_source_bill_id,
      'source_document_key', v_source_document_key,
      'document_family', v_document_family,
      'provider_document_id', v_provider_document_id,
      'provider_sequence', v_sequence,
      'provider_document_type', v_provider_type,
      'normalized_version_type', v_version_type,
      'stage_rank', v_stage_rank,
      'chamber', v_chamber,
      'source_url', v_source_url,
      'provider_url', v_provider_url,
      'provider_hash', v_provider_hash,
      'provider_size', v_provider_size,
      'provider_date', v_provider_date,
      'adopted', v_adopted,
      'description', v_description,
      'source_stem', v_source_stem,
      'provider_payload', v_document
    );
    v_metadata_hash := encode(public.digest(convert_to(v_metadata::text, 'UTF8'), 'sha256'), 'hex');
    insert into public.docket_bill_source_document (
      source_document_key, source_bill_id, provider_document_id, document_family,
      provider_document_type, normalized_version_type, provider_sequence, stage_rank,
      chamber, source_url, provider_url, provider_hash, provider_size, provider_date,
      adopted, description, source_stem, latest_metadata, latest_observed_at
    ) values (
      v_source_document_key, p_source_bill_id, v_provider_document_id, v_document_family,
      v_provider_type, v_version_type, v_sequence::integer, v_stage_rank,
      v_chamber, v_source_url, v_provider_url, v_provider_hash, v_provider_size,
      v_provider_date, v_adopted, v_description, v_source_stem, v_metadata, v_fetched_at
    ) on conflict (source_document_key) do update set
      provider_document_type = excluded.provider_document_type,
      normalized_version_type = excluded.normalized_version_type,
      provider_sequence = excluded.provider_sequence,
      stage_rank = excluded.stage_rank,
      chamber = excluded.chamber,
      source_url = excluded.source_url,
      provider_url = excluded.provider_url,
      provider_hash = excluded.provider_hash,
      provider_size = excluded.provider_size,
      provider_date = coalesce(excluded.provider_date, docket_bill_source_document.provider_date),
      adopted = excluded.adopted,
      description = excluded.description,
      source_stem = excluded.source_stem,
      latest_metadata = excluded.latest_metadata,
      latest_observed_at = excluded.latest_observed_at,
      updated_at = now();
    insert into public.docket_bill_source_document_observation (
      source_document_key, metadata_hash, metadata_json, docket_fetched_at
    ) values (v_source_document_key, v_metadata_hash, v_metadata, v_fetched_at)
    on conflict (source_document_key, metadata_hash) do nothing;
    v_registered := v_registered + 1;
  end loop;

  update public.docket_bill_source_document document
     set predecessor_source_document_key = (
       select predecessor.source_document_key
       from public.docket_bill_source_document predecessor
       where predecessor.source_bill_id = document.source_bill_id
         and predecessor.document_family = 'text'
         and predecessor.provider_sequence < document.provider_sequence
       order by predecessor.provider_sequence desc, predecessor.provider_document_id desc
       limit 1
     ), updated_at = now()
   where document.source_bill_id = p_source_bill_id
     and document.document_family = 'text';

  update public.docket_bill_source_document document
     set base_source_document_key = (
       select base.source_document_key
       from public.docket_bill_source_document base
       where base.source_bill_id = document.source_bill_id
         and base.document_family = 'text'
         and base.source_stem = document.source_stem
       order by base.provider_sequence desc, base.provider_document_id desc
       limit 1
     ), updated_at = now()
   where document.source_bill_id = p_source_bill_id
     and document.document_family = 'amendment'
     and document.base_source_document_key is null;

  insert into public.civic_genome_bill_version (
    genome_bill_id, source_document_key, source_bill_id, document_family,
    version_type, provider_sequence, stage_rank, chamber,
    version_fingerprint, receipt_json
  )
  select v_genome_bill_id, document.source_document_key, document.source_bill_id,
         document.document_family, document.normalized_version_type,
         document.provider_sequence, document.stage_rank, document.chamber,
         encode(public.digest(convert_to(jsonb_build_object(
           'genome_bill_id', v_genome_bill_id,
           'source_document_key', document.source_document_key,
           'source_bill_id', document.source_bill_id,
           'provider_document_id', document.provider_document_id,
           'document_family', document.document_family,
           'normalized_version_type', document.normalized_version_type,
           'provider_sequence', document.provider_sequence,
           'source_url', document.source_url,
           'provider_hash', document.provider_hash
         )::text, 'UTF8'), 'sha256'), 'hex'),
         jsonb_build_object(
           'docket_source_document_key', document.source_document_key,
           'provider_document_id', document.provider_document_id,
           'provider_document_type', document.provider_document_type,
           'source_url', document.source_url,
           'provider_hash', document.provider_hash,
           'registered_at', now()
         )
  from public.docket_bill_source_document document
  where document.source_bill_id = p_source_bill_id
  on conflict (genome_bill_id, source_document_key) do update set
    document_family = excluded.document_family,
    version_type = excluded.version_type,
    provider_sequence = excluded.provider_sequence,
    stage_rank = excluded.stage_rank,
    chamber = excluded.chamber,
    version_fingerprint = excluded.version_fingerprint,
    receipt_json = public.civic_genome_bill_version.receipt_json || excluded.receipt_json,
    updated_at = now();

  update public.civic_genome_bill_version version
     set predecessor_bill_version_id = predecessor.bill_version_id,
         base_bill_version_id = base.bill_version_id,
         updated_at = now()
  from public.docket_bill_source_document document
  left join public.civic_genome_bill_version predecessor
    on predecessor.genome_bill_id = v_genome_bill_id
   and predecessor.source_document_key = document.predecessor_source_document_key
  left join public.civic_genome_bill_version base
    on base.genome_bill_id = v_genome_bill_id
   and base.source_document_key = document.base_source_document_key
  where version.genome_bill_id = v_genome_bill_id
    and version.source_document_key = document.source_document_key
    and document.source_bill_id = p_source_bill_id;

  if p_enqueue then
    insert into public.civic_genome_legislative_version_queue (
      bill_version_id, queue_state, priority, next_attempt_at
    )
    select version.bill_version_id, 'eligible',
           ((case when version.document_family = 'amendment'
              then coalesce(base.stage_rank + 50, version.stage_rank)
              else version.stage_rank end) * 1000) + version.provider_sequence,
           now()
    from public.civic_genome_bill_version version
    left join public.civic_genome_bill_version base
      on base.bill_version_id = version.base_bill_version_id
    where version.genome_bill_id = v_genome_bill_id
      and version.processing_state not in ('verified', 'verified_with_findings')
    on conflict (bill_version_id) do update set
      queue_state = case
        when public.civic_genome_legislative_version_queue.queue_state in ('completed', 'permanent_failure') then public.civic_genome_legislative_version_queue.queue_state
        else 'eligible' end,
      priority = excluded.priority,
      next_attempt_at = now(),
      updated_at = now();
    get diagnostics v_enqueued = row_count;
  end if;

  return jsonb_build_object(
    'source_bill_id', p_source_bill_id,
    'genome_bill_id', v_genome_bill_id,
    'registered_document_count', v_registered,
    'text_version_count', (select count(*) from public.docket_bill_source_document where source_bill_id = p_source_bill_id and document_family = 'text'),
    'amendment_count', (select count(*) from public.docket_bill_source_document where source_bill_id = p_source_bill_id and document_family = 'amendment'),
    'matched_amendment_base_count', (select count(*) from public.docket_bill_source_document where source_bill_id = p_source_bill_id and document_family = 'amendment' and base_source_document_key is not null),
    'queued_or_refreshed_count', v_enqueued,
    'docket_fetched_at', v_fetched_at
  );
end;
$function$;
