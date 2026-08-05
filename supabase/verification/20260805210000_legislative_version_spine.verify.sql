do $$
declare
  v_document_count integer;
  v_text_count integer;
  v_amendment_count integer;
  v_text_predecessor_count integer;
  v_amendment_base_count integer;
  v_version_count integer;
  v_queue_count integer;
  v_genome_bill_count integer;
  v_duplicate_provider_count integer;
  v_duplicate_fingerprint_count integer;
begin
  if to_regclass('public.docket_bill_source_document') is null
     or to_regclass('public.docket_bill_source_document_observation') is null
     or to_regclass('public.civic_genome_bill_version') is null
     or to_regclass('public.civic_genome_legislative_version_queue') is null then
    raise exception 'Legislative-version substrate table is missing';
  end if;

  if to_regprocedure(
    'public.register_docket_legislative_version_spine(integer,boolean)'
  ) is null then
    raise exception 'Legislative-version registration function is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.docket_bill_detail_cache'::regclass
      and tgname = 'docket_legislative_version_spine_registration'
      and not tgisinternal
  ) then
    raise exception 'Docket legislative-version registration trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.civic_genome_bill'::regclass
      and tgname = 'civic_genome_legislative_version_spine_registration'
      and not tgisinternal
  ) then
    raise exception 'Civic Genome legislative-version registration trigger is missing';
  end if;

  if not exists (
    select 1
    from public.docket_bill_detail_cache
    where bill_id = 2064783
  ) then
    return;
  end if;

  select count(*)::integer,
         count(*) filter (where document_family = 'text')::integer,
         count(*) filter (where document_family = 'amendment')::integer,
         count(*) filter (
           where document_family = 'text'
             and predecessor_source_document_key is not null
         )::integer,
         count(*) filter (
           where document_family = 'amendment'
             and base_source_document_key is not null
         )::integer
    into v_document_count,
         v_text_count,
         v_amendment_count,
         v_text_predecessor_count,
         v_amendment_base_count
  from public.docket_bill_source_document
  where source_bill_id = 2064783;

  select count(*)::integer,
         count(distinct genome_bill_id)::integer
    into v_version_count, v_genome_bill_count
  from public.civic_genome_bill_version
  where source_bill_id = 2064783;

  select count(*)::integer
    into v_queue_count
  from public.civic_genome_legislative_version_queue queue
  join public.civic_genome_bill_version version
    on version.bill_version_id = queue.bill_version_id
  where version.source_bill_id = 2064783;

  select count(*)::integer
    into v_duplicate_provider_count
  from (
    select source_bill_id, document_family, provider_document_id
    from public.docket_bill_source_document
    where source_bill_id = 2064783
    group by source_bill_id, document_family, provider_document_id
    having count(*) > 1
  ) duplicate;

  select count(*)::integer
    into v_duplicate_fingerprint_count
  from (
    select version_fingerprint
    from public.civic_genome_bill_version
    where source_bill_id = 2064783
    group by version_fingerprint
    having count(*) > 1
  ) duplicate;

  if v_document_count <> 14
     or v_text_count <> 5
     or v_amendment_count <> 9 then
    raise exception
      'HB2225 source inventory mismatch: documents %, texts %, amendments %',
      v_document_count,
      v_text_count,
      v_amendment_count;
  end if;

  if v_text_predecessor_count <> 4 then
    raise exception 'HB2225 text predecessor count mismatch: %', v_text_predecessor_count;
  end if;

  if v_amendment_base_count <> 9 then
    raise exception 'HB2225 amendment base count mismatch: %', v_amendment_base_count;
  end if;

  if v_version_count <> 14
     or v_queue_count <> 14
     or v_genome_bill_count <> 1 then
    raise exception
      'HB2225 version binding mismatch: versions %, queue %, Genome bills %',
      v_version_count,
      v_queue_count,
      v_genome_bill_count;
  end if;

  if v_duplicate_provider_count <> 0
     or v_duplicate_fingerprint_count <> 0 then
    raise exception
      'HB2225 duplicate identity detected: provider %, fingerprint %',
      v_duplicate_provider_count,
      v_duplicate_fingerprint_count;
  end if;
end;
$$;

select
  document.source_document_key,
  document.document_family,
  document.provider_document_type,
  document.normalized_version_type,
  document.predecessor_source_document_key,
  document.base_source_document_key,
  version.processing_state,
  queue.queue_state,
  queue.priority
from public.docket_bill_source_document document
join public.civic_genome_bill_version version
  on version.source_document_key = document.source_document_key
left join public.civic_genome_legislative_version_queue queue
  on queue.bill_version_id = version.bill_version_id
where document.source_bill_id = 2064783
order by queue.priority, document.source_document_key;
