-- PREPARED RELEASE — requires disposable full-schema acceptance and independent
-- review before production install. Do not apply using blanket db push.
-- Source: Lighthouse production observed 2026-11-04.
-- Preserve original LegiScan bill JSON; delete only unbased DERIVED rows.
-- The existing 2,101 structurally bound amendments are NOT certified by this
-- migration: attachment-proof review remains an independent gate.
--
-- A minimal restricted-access identifier receipt is retained ONLY for
-- independent deletion of detached Rosetta source IDs in the other service.
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

  IF md5(pg_get_functiondef('public.wake_civic_genome_amendments_for_base_v1()'::regprocedure))
     IS DISTINCT FROM '95385ac910458cab2defd38e111836b8'
  THEN RAISE EXCEPTION 'amendment wake-up function changed; no writes';
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

  -- Existing production corpus, or completely empty disposable replay.
  -- Never treat an intermediate/partial seeded state as a certified target.
  IF NOT (
       (n_source=7264 AND n_version=7264
        AND n_structural_bound=2101 AND n_selfref=0
        AND n_observations=7438 AND n_queue=4942)
       OR
       (n_source=0 AND n_version=0 AND n_structural_bound=0
        AND n_selfref=0 AND n_observations=0 AND n_queue=0)
  ) THEN
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

  RAISE NOTICE 'Preflight passed: % derived amendments, % queues, % observations; % linked preserved',
    n_source,n_queue,n_observations,n_structural_bound;
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

    -- Only refresh pre-existing source records; never create a new amendment
    -- from unverified provider metadata during canonical bill registration.
    update public.docket_bill_source_document target
       set provider_document_type = v_provider_type,
           normalized_version_type = v_version_type,
           provider_sequence = v_sequence::integer,
           stage_rank = v_stage_rank,
           chamber = v_chamber,
           source_url = v_source_url,
           provider_url = v_provider_url,
           provider_hash = v_provider_hash,
           provider_size = v_provider_size,
           provider_date = coalesce(v_provider_date,target.provider_date),
           adopted = v_adopted,
           description = v_description,
           source_stem = v_source_stem,
           latest_metadata = target.latest_metadata || v_metadata,
           latest_observed_at = v_fetched_at,
           updated_at = now()
     where target.source_document_key = v_source_document_key
       and target.source_bill_id = p_source_bill_id
       and target.document_family = 'amendment'
       and target.base_source_document_key is not null
       and exists (
         select 1 from public.docket_bill_source_document base
         where base.source_document_key = target.base_source_document_key
           and base.source_bill_id = p_source_bill_id
           and base.document_family = 'text'
       );
    if found then
      insert into public.docket_bill_source_document_observation
        (source_document_key, metadata_hash, metadata_json, docket_fetched_at)
      values (v_source_document_key, v_metadata_hash, v_metadata, v_fetched_at)
      on conflict (source_document_key, metadata_hash) do nothing;
      v_registered := v_registered + 1;
    end if;
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
        or (
          version.base_bill_version_id is not null
          and coalesce(
            version.receipt_json #>> '{amendment_attachment_v1,relationship_basis}',
            ''
          ) = 'official_explicit_reference'
          and version.receipt_json #>> '{amendment_attachment_v1,base_bill_version_id}'
            = version.base_bill_version_id::text
          and coalesce(
            version.receipt_json #>> '{amendment_attachment_v1,attachment_evidence_hash}',
            ''
          ) ~ '^[0-9a-f]{64}$'
        )
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
-- queue eligibility now requires an explicit attached-base receipt.
-- Preserve original wake behavior for documented attached amendments,
-- but never reactivate historical base guesses without an explicit receipt.
CREATE OR REPLACE FUNCTION public.wake_civic_genome_amendments_for_base_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if new.document_family <> 'text'
     or coalesce(new.receipt_json->>'source_content_hash','') !~ '^[0-9a-fA-F]{64}$'
     or (
       coalesce(old.receipt_json->>'source_content_hash','')
       = coalesce(new.receipt_json->>'source_content_hash','')
     )
  then
    return new;
  end if;

  update public.civic_genome_legislative_version_queue queue
     set queue_state='eligible',
         next_attempt_at=now(),
         locked_at=null,
         locked_by=null,
         last_failure_class=null,
         last_error_code=null,
         updated_at=now()
    from public.civic_genome_bill_version amendment
   where amendment.base_bill_version_id=new.bill_version_id
     and amendment.document_family='amendment'
     and coalesce(amendment.receipt_json #>> '{amendment_attachment_v1,relationship_basis}', '') = 'official_explicit_reference'
     and amendment.receipt_json #>> '{amendment_attachment_v1,base_bill_version_id}' = amendment.base_bill_version_id::text
     and coalesce(amendment.receipt_json #>> '{amendment_attachment_v1,attachment_evidence_hash}', '') ~ '^[0-9a-f]{64}$'
     and queue.bill_version_id=amendment.bill_version_id
     and queue.queue_state='degraded'
     and queue.last_failure_class='awaiting_amendment_base'
     and queue.next_attempt_at='infinity'::timestamptz
     and queue.locked_at is null
     and queue.locked_by is null;

  return new;
end;
$function$;

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
  IF (SELECT count(*) FROM _docket_unbased_amendment_targets) NOT IN (0,7264) THEN
    RAISE EXCEPTION 'locked target set changed; refuse partial cleanup';
  END IF;
  IF NOT (
       ((SELECT count(*) FROM _docket_unbased_amendment_targets)=7264
        AND (SELECT count(*) FROM _docket_unbased_amendment_targets
             WHERE rosetta_source_document_id IS NOT NULL)=3783)
       OR
       ((SELECT count(*) FROM _docket_unbased_amendment_targets)=0
        AND (SELECT count(*) FROM _docket_unbased_amendment_targets
             WHERE rosetta_source_document_id IS NOT NULL)=0)
     ) THEN
    RAISE EXCEPTION 'Rosetta binding manifest changed; preserve cross-service reconciliation';
  END IF;
END
$target_manifest$;

-- This is a tombstone receipt containing identifiers ONLY (no source payload,
-- no derived amendment row). It preserves the exact 3,783 Rosetta source IDs
-- needed for independent cross-service deletion rather than orphaning them.
CREATE TABLE IF NOT EXISTS public.docket_unbased_amendment_removal_receipt_v1 (
  source_document_key text PRIMARY KEY,
  bill_version_id uuid NOT NULL,
  rosetta_source_document_id bigint,
  deletion_release text NOT NULL
    DEFAULT '20261105051000_remove_unbased_amendment_derived_records_v1',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.docket_unbased_amendment_removal_receipt_v1
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docket_unbased_amendment_removal_receipt_v1
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.docket_unbased_amendment_removal_receipt_v1
  (source_document_key,bill_version_id,rosetta_source_document_id)
SELECT source_document_key,bill_version_id,rosetta_source_document_id
FROM _docket_unbased_amendment_targets;

DO $receipt_guard$
BEGIN
  IF (SELECT count(*) FROM
        public.docket_unbased_amendment_removal_receipt_v1
        WHERE deletion_release=
          '20261105051000_remove_unbased_amendment_derived_records_v1')
       <> (SELECT count(*) FROM _docket_unbased_amendment_targets)
  THEN RAISE EXCEPTION 'Purge identifier receipt incomplete; rollback';
  END IF;
END
$receipt_guard$;

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

-- Newly attached amendments require exact same-bill text and explicit evidence.
-- Existing 2101 historical links are not certified by this legacy shape.
CREATE OR REPLACE FUNCTION public.guard_docket_amendment_source_attachment_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $guard$
BEGIN
  IF NEW.document_family <> 'amendment' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE'
     AND NEW.base_source_document_key IS NOT DISTINCT FROM OLD.base_source_document_key
     AND NEW.source_bill_id IS NOT DISTINCT FROM OLD.source_bill_id
     AND NEW.document_family IS NOT DISTINCT FROM OLD.document_family
  THEN RETURN NEW; END IF;
  IF NEW.base_source_document_key IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.docket_bill_source_document base
       WHERE base.source_document_key=NEW.base_source_document_key
         AND base.document_family='text'
         AND base.source_bill_id=NEW.source_bill_id
     )
  THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='docket_amendment_base_not_verified_same_bill_text';
  END IF;
  IF coalesce(NEW.latest_metadata->>'relationship_basis','')
       <> 'official_explicit_reference'
     OR coalesce(NEW.latest_metadata->>'attachment_evidence_hash','')
       !~ '^[0-9a-f]{64}$'
     OR coalesce(NEW.latest_metadata->>'base_source_content_hash','')
       !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='docket_amendment_missing_explicit_source_attachment_receipt';
  END IF;
  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS docket_amendment_source_attachment_guard_v1
  ON public.docket_bill_source_document;
CREATE TRIGGER docket_amendment_source_attachment_guard_v1
BEFORE INSERT OR UPDATE OF
  base_source_document_key,source_bill_id,document_family
ON public.docket_bill_source_document
FOR EACH ROW WHEN (NEW.document_family='amendment')
EXECUTE FUNCTION public.guard_docket_amendment_source_attachment_v1();

REVOKE ALL ON FUNCTION public.guard_docket_amendment_source_attachment_v1()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_docket_amendment_source_attachment_v1()
  TO service_role;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM public.docket_bill_source_document
      WHERE document_family='amendment' AND base_source_document_key IS NULL)
  OR EXISTS (SELECT 1 FROM public.civic_genome_bill_version
      WHERE document_family='amendment' AND base_bill_version_id IS NULL)
  OR (SELECT count(*) FROM public.docket_bill_source_document
      WHERE document_family='amendment' AND base_source_document_key IS NOT NULL)
      NOT IN (0,2101)
  OR (SELECT count(*) FROM public.civic_genome_bill_version
      WHERE document_family='amendment' AND base_bill_version_id IS NOT NULL)
      NOT IN (0,2101)
  OR (SELECT count(*) FROM public.docket_bill_source_document
      WHERE document_family='amendment' AND base_source_document_key IS NOT NULL)
     <> (SELECT count(*) FROM public.civic_genome_bill_version
      WHERE document_family='amendment' AND base_bill_version_id IS NOT NULL)
  THEN RAISE EXCEPTION 'Post-delete invariant failed; transaction rolled back';
  END IF;
  RAISE NOTICE 'PASS: zero unbased derived amendment documents and versions';
END
$verify$;
COMMIT;
