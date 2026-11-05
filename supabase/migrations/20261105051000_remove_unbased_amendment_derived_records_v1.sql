-- PREPARED RELEASE — requires disposable full-schema acceptance and independent
-- review before production install. Do not apply using blanket db push.
-- Source: Lighthouse production observed 2026-11-04.
-- Preserve original LegiScan bill JSON; delete only unbased DERIVED rows.
-- The existing 2,101 structurally bound amendments are NOT certified by this
-- migration: attachment-proof review remains an independent gate.
--
-- The canonical version registration function is source-bound to its exact
-- observed production SHA; if it changed, this migration aborts rather than
-- installing a function from the wrong lineage.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

LOCK TABLE public.docket_bill_source_document,
           public.civic_genome_bill_version
  IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  n_source integer;
  n_version integer;
  n_structural_bound integer;
  n_selfref integer;
  n_observations integer;
  n_queue integer;
  actual_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef(
    'public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure
  )) INTO actual_md5;
  IF actual_md5 IS DISTINCT FROM '232c19170727b8f24fd5b9bff3da8e40'
    THEN RAISE EXCEPTION 'registration function changed: %, no writes', actual_md5;
  END IF;

  SELECT count(*) INTO n_source
    FROM public.docket_bill_source_document
    WHERE document_family='amendment' AND base_source_document_key IS NULL;
  SELECT count(*) INTO n_version
    FROM public.civic_genome_bill_version
    WHERE document_family='amendment' AND base_bill_version_id IS NULL;
  SELECT count(*) INTO n_structural_bound
    FROM public.docket_bill_source_document
    WHERE document_family='amendment' AND base_source_document_key IS NOT NULL;
  SELECT count(*) INTO n_selfref
    FROM public.docket_bill_source_document dependent
    JOIN public.docket_bill_source_document target
      ON target.source_document_key IN (
           dependent.base_source_document_key,
           dependent.predecessor_source_document_key)
    WHERE target.document_family='amendment'
      AND target.base_source_document_key IS NULL;
  SELECT count(*) INTO n_observations
    FROM public.docket_bill_source_document_observation o
    JOIN public.docket_bill_source_document d USING(source_document_key)
    WHERE d.document_family='amendment'
      AND d.base_source_document_key IS NULL;
  SELECT count(*) INTO n_queue
    FROM public.civic_genome_legislative_version_queue q
    JOIN public.civic_genome_bill_version v USING(bill_version_id)
    WHERE v.document_family='amendment'
      AND v.base_bill_version_id IS NULL;

  IF n_source<>7264 OR n_version<>7264
     OR n_structural_bound<>2101 OR n_selfref<>0
     OR n_observations<>7438 OR n_queue<>4942
  THEN
    RAISE EXCEPTION 'unbased deletion manifest drift: source %, versions %, bound %, selfref %, observations %, queue %',
       n_source,n_version,n_structural_bound,n_selfref,n_observations,n_queue;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.civic_genome_bill_version v
    JOIN public.docket_bill_source_document d USING(source_document_key)
    WHERE v.document_family='amendment'
      AND (v.base_bill_version_id IS NULL) IS DISTINCT FROM
          (d.base_source_document_key IS NULL)
  ) THEN RAISE EXCEPTION 'version/document base correspondence changed';
  END IF;

  RAISE NOTICE 'Preflight passed: 7264 derived amendments, 4942 queues, 7438 observations; preserve 2101 linked amendments';
END
$preflight$;

-- Positive-base-only input guard is installed FIRST, in this same transaction.
-- Unbased source events remain in docket_bill_detail_cache.bill JSON. To
-- admit new amendments, a separate evidence-gated admission must create their
-- source-document record with explicit bill-text base in a single operation.
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

  select bill.genome_bill_id
    into v_genome_bill_id
  from public.civic_genome_bill bill
  where bill.structural_dna_json ->> 'source_bill_id' = p_source_bill_id::text
  order by bill.updated_at desc, bill.genome_bill_id
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
    where exists (
      select 1
      from public.docket_bill_source_document candidate
      join public.docket_bill_source_document base
        on base.source_document_key = candidate.base_source_document_key
       and base.document_family = 'text'
       and base.source_bill_id = p_source_bill_id
      where candidate.source_bill_id = p_source_bill_id
        and candidate.document_family = 'amendment'
        and candidate.provider_document_id =
          nullif(item.value ->> 'amendment_id', '')::bigint
    )
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

  -- Amendment base identity is intentionally unresolved at registration time.
  -- URL/source_stem similarity is not legislative attachment evidence.

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
    and (
      document.document_family <> 'amendment'
      or (
        document.base_source_document_key is not null
        and exists (
          select 1
          from public.docket_bill_source_document base
          where base.source_document_key = document.base_source_document_key
            and base.source_bill_id = document.source_bill_id
            and base.document_family = 'text'
        )
      )
    )
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
      and (
        version.document_family <> 'amendment'
        or version.base_bill_version_id is not null
      )
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

-- The derived version insert above is also filtered to attached amendments;
-- queue eligibility now requires a base version id.
CREATE TEMP TABLE _docket_unbased_amendment_targets
  ON COMMIT DROP AS
SELECT d.source_document_key, v.bill_version_id, v.rosetta_source_document_id
FROM public.docket_bill_source_document d
JOIN public.civic_genome_bill_version v USING(source_document_key)
WHERE d.document_family='amendment'
  AND d.base_source_document_key IS NULL
  AND v.document_family='amendment'
  AND v.base_bill_version_id IS NULL;

DO $target_manifest$
BEGIN
  IF (SELECT count(*) FROM _docket_unbased_amendment_targets)<>7264 THEN
    RAISE EXCEPTION 'locked target set changed; refuse partial cleanup';
  END IF;
  IF (SELECT count(*) FROM _docket_unbased_amendment_targets
      WHERE rosetta_source_document_id IS NOT NULL)<>3783 THEN
    RAISE EXCEPTION 'Rosetta binding manifest changed; preserve cross-service reconciliation';
  END IF;
END
$target_manifest$;

-- Deleting version rows cascades their dedicated queue entries.
DELETE FROM public.civic_genome_bill_version v
USING _docket_unbased_amendment_targets target
WHERE v.bill_version_id=target.bill_version_id;

-- Deleting derived Docket source-document rows cascades immutable metadata
-- observations, but does NOT touch original downloaded provider bill JSON,
-- original ZIP in Storage, or official legal-text sources.
DELETE FROM public.docket_bill_source_document d
USING _docket_unbased_amendment_targets target
WHERE d.source_document_key=target.source_document_key;

-- Future direct writes (not just register_docket...) cannot insert a
-- source-document amendment without an explicit nonnull base reference.
ALTER TABLE public.docket_bill_source_document
  ADD CONSTRAINT docket_amendment_requires_attached_text_base_v1
  CHECK (document_family <> 'amendment' OR base_source_document_key IS NOT NULL)
  NOT VALID;

ALTER TABLE public.docket_bill_source_document
  VALIDATE CONSTRAINT docket_amendment_requires_attached_text_base_v1;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM public.docket_bill_source_document
      WHERE document_family='amendment' AND base_source_document_key IS NULL)
  OR EXISTS (SELECT 1 FROM public.civic_genome_bill_version
      WHERE document_family='amendment' AND base_bill_version_id IS NULL)
  OR (SELECT count(*) FROM public.docket_bill_source_document
      WHERE document_family='amendment' AND base_source_document_key IS NOT NULL)<>2101
  OR (SELECT count(*) FROM public.civic_genome_bill_version
      WHERE document_family='amendment' AND base_bill_version_id IS NOT NULL)<>2101
  THEN RAISE EXCEPTION 'Post-delete invariant failed; transaction rolled back';
  END IF;
  RAISE NOTICE 'PASS: zero unbased derived amendment documents and versions';
END
$verify$;
COMMIT;
