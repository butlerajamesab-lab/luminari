create or replace function public.corpus_import_target_hint_for_storage_object(p_name text)
returns text
language sql
immutable
as $$
  select case
    when lower(p_name) like '%benefits-cascade%' then 'benefits_cascade_docx_review'
    when lower(p_name) like '%sol-collision%' then 'sol_collision_docx_review'
    when lower(p_name) like '%gap-playbook%' then 'gap_playbook_docx_review'
    when lower(p_name) like '%claim-catalog%' then 'claim_catalog_docx_review'
    when lower(p_name) like '%federal-master%' then 'federal_master_docx_review'
    when lower(p_name) like '%.docx' then 'state_enriched_registry_docx_review'
    when lower(p_name) like '%.zip' then 'registry_zip_bundle_review'
    when lower(p_name) like '%.sql' then 'sql_handoff_review'
    else 'bucket_artifact_review'
  end;
$$;

create or replace function public.corpus_import_domain_tags_for_storage_object(p_name text)
returns text[]
language sql
immutable
as $$
  select case
    when lower(p_name) like '%benefits-cascade%' then array['benefits','cascade','public_help']::text[]
    when lower(p_name) like '%sol-collision%' then array['legal','deadlines','public_help']::text[]
    when lower(p_name) like '%gap-playbook%' then array['legal','gap_routing','public_help']::text[]
    when lower(p_name) like '%claim-catalog%' then array['claims','legal','public_help']::text[]
    when lower(p_name) like '%federal-master%' then array['federal','agency_authority','public_help']::text[]
    when lower(p_name) like '%.docx' then array['state_registry','territory_registry','public_help']::text[]
    else array['corpus','bucket_artifact']::text[]
  end;
$$;

create or replace function public.queue_storage_object_for_corpus_import_object(
  p_bucket_id text,
  p_name text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default now(),
  p_updated_at timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ext text := lower(coalesce(substring(p_name from '(\.[^./]+)$'), ''));
  v_target_hint text := public.corpus_import_target_hint_for_storage_object(p_name);
  v_inserted_id bigint;
begin
  if p_bucket_id is null or p_name is null or trim(p_name) = '' then
    return null;
  end if;

  if exists (
    select 1
    from public.corpus_import_queue q
    where q.storage_bucket = p_bucket_id
      and q.storage_path = p_name
  ) then
    return null;
  end if;

  insert into public.corpus_import_queue (
    source_name,
    source_type,
    source_ext,
    storage_bucket,
    storage_path,
    byte_size,
    sha256,
    content_type,
    storage_mode,
    target_hint,
    record_count_estimate,
    payload,
    pipeline_context,
    domain_tags,
    target_surfaces,
    import_status,
    priority,
    dry_run,
    operation_result_json,
    normalized_text_chars
  ) values (
    p_bucket_id || '/' || p_name,
    'supabase_storage',
    nullif(v_ext, ''),
    p_bucket_id,
    p_name,
    nullif(p_metadata->>'size','')::bigint,
    null,
    coalesce(p_metadata->>'mimetype', 'application/octet-stream'),
    case when v_ext = '.docx' then 'binary_metadata' else 'binary_pending_download' end,
    v_target_hint,
    null,
    jsonb_build_object(
      'bucket_public', false,
      'inventory_stage', 'metadata_only',
      'storage_metadata', coalesce(p_metadata, '{}'::jsonb),
      'object_created_at', p_created_at,
      'object_updated_at', p_updated_at,
      'content_not_downloaded', true,
      'queued_from', 'storage_object_trigger',
      'queued_at', now()
    ),
    array['ingestion_control','bucket_auto_queue']::text[],
    public.corpus_import_domain_tags_for_storage_object(p_name),
    array['ingestion_control', v_target_hint]::text[],
    'pending_bucket_content_scan',
    case when v_ext = '.docx' then 10 else 100 end,
    true,
    '{}'::jsonb,
    0
  )
  returning id into v_inserted_id;

  return v_inserted_id;
end;
$$;

create or replace function public.queue_storage_object_for_corpus_import_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bucket_id = 'State Enriched Registry bucket' then
    perform public.queue_storage_object_for_corpus_import_object(new.bucket_id, new.name, coalesce(new.metadata, '{}'::jsonb), new.created_at, new.updated_at);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_queue_state_enriched_storage_object on storage.objects;
create trigger trg_queue_state_enriched_storage_object
after insert on storage.objects
for each row
when (new.bucket_id = 'State Enriched Registry bucket')
execute function public.queue_storage_object_for_corpus_import_trigger();

create or replace function public.sync_state_enriched_bucket_to_corpus_import_queue()
returns table(inserted_id bigint, storage_path text)
language sql
security definer
set search_path = public, storage
as $$
  with queued as (
    select public.queue_storage_object_for_corpus_import_object(o.bucket_id, o.name, coalesce(o.metadata, '{}'::jsonb), o.created_at, o.updated_at) as inserted_id,
           o.name as storage_path
    from storage.objects o
    where o.bucket_id = 'State Enriched Registry bucket'
      and not exists (
        select 1
        from public.corpus_import_queue q
        where q.storage_bucket = o.bucket_id
          and q.storage_path = o.name
      )
  )
  select inserted_id, storage_path
  from queued
  where inserted_id is not null;
$$;

select * from public.sync_state_enriched_bucket_to_corpus_import_queue();
