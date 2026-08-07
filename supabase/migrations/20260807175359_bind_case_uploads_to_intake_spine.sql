create or replace function public.normalize_lighthouse_document_file_type_v1(
  p_mime_type text,
  p_existing_file_type text
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when lower(coalesce(p_mime_type, '')) = 'application/pdf' then 'pdf'
    when lower(coalesce(p_mime_type, '')) = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when lower(coalesce(p_mime_type, '')) = 'application/msword' then 'doc'
    when lower(coalesce(p_mime_type, '')) like 'image/%' then 'image'
    when lower(coalesce(p_mime_type, '')) like 'video/%' then 'video'
    when lower(coalesce(p_mime_type, '')) like 'audio/%' then 'audio'
    when lower(coalesce(p_mime_type, '')) = 'application/zip' then 'zip'
    when lower(coalesce(p_mime_type, '')) = 'application/json' then 'json'
    when lower(coalesce(p_mime_type, '')) = 'text/csv' then 'csv'
    when lower(coalesce(p_mime_type, '')) = 'text/html' then 'html'
    when lower(coalesce(p_mime_type, '')) in ('text/markdown', 'text/x-markdown') then 'markdown'
    when lower(coalesce(p_mime_type, '')) = 'text/plain'
      then case when lower(coalesce(p_existing_file_type, '')) in ('txt', 'text')
                then lower(p_existing_file_type)
                else 'text' end
    when coalesce(nullif(trim(p_existing_file_type), ''), '') <> '' then lower(trim(p_existing_file_type))
    else 'other'
  end
$$;

create or replace function public.normalize_lighthouse_document_file_type_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.file_type := public.normalize_lighthouse_document_file_type_v1(new.mime_type, new.file_type);
  return new;
end
$$;

create or replace function public.bind_document_to_intake_spine_v1(p_document_id integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_document public.documents%rowtype;
  v_case_uuid uuid;
  v_owner_user_id integer;
  v_session_id uuid;
  v_source_fingerprint text;
  v_artifact_key text;
  v_artifact_id uuid;
  v_has_primary boolean;
  v_storage_without_scheme text;
  v_storage_bucket text;
  v_storage_object_path text;
  v_snapshot_document_ids_text text;
  v_snapshot_document_hashes_text text;
  v_snapshot_status text;
  v_document_ids jsonb;
  v_document_hashes jsonb;
begin
  select d.*
    into v_document
    from public.documents d
   where d.id = p_document_id
   for update;

  if not found then
    raise exception 'intake_upload_binding_document_missing:%', p_document_id;
  end if;

  if v_document.case_id is null then
    raise exception 'intake_upload_binding_case_id_missing:%', p_document_id;
  end if;

  if v_document.sha256_hash is null or v_document.sha256_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'intake_upload_binding_invalid_sha256:%', p_document_id;
  end if;

  perform pg_advisory_xact_lock(76004001, v_document.case_id);

  select b.case_uuid, c.user_id
    into v_case_uuid, v_owner_user_id
    from public.case_identity_bridge b
    join public.cases c on c.id = b.legacy_case_id
   where b.legacy_case_id = v_document.case_id
   limit 1;

  if v_case_uuid is null or v_owner_user_id is null then
    raise exception 'intake_upload_binding_case_identity_missing:%', v_document.case_id;
  end if;

  v_source_fingerprint := encode(
    extensions.digest(
      'lighthouse_intake_upload_binding.v1.0.0|' || v_case_uuid::text || '|' || v_owner_user_id::text,
      'sha256'
    ),
    'hex'
  );

  select s.intake_session_id
    into v_session_id
    from public.intake_sessions s
   where s.owner_user_id = v_owner_user_id
     and s.session_type = 'live'
     and s.entry_channel = 'upload'
     and s.source_fingerprint = v_source_fingerprint
   order by s.created_at
   limit 1;

  if v_session_id is null then
    insert into public.intake_sessions (
      intake_session_id,
      owner_user_id,
      session_type,
      entry_channel,
      source_label,
      privacy_mode,
      session_status,
      completion_state,
      source_fingerprint,
      metadata,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_owner_user_id,
      'live',
      'upload',
      'lighthouse_case_upload',
      'private',
      'open',
      'evidence_registered',
      v_source_fingerprint,
      jsonb_build_object(
        'binding_version', 'lighthouse_intake_upload_binding.v1.0.0',
        'legacy_case_id', v_document.case_id,
        'case_uuid', v_case_uuid::text
      ),
      now(),
      now()
    )
    returning intake_session_id into v_session_id;
  end if;

  select exists (
    select 1
      from public.case_intake_links cil
     where cil.case_uuid = v_case_uuid
       and cil.is_primary = true
  ) into v_has_primary;

  insert into public.case_intake_links (
    case_intake_link_id,
    intake_session_id,
    case_uuid,
    link_type,
    is_primary,
    metadata,
    created_at
  ) values (
    gen_random_uuid(),
    v_session_id,
    v_case_uuid,
    case when v_has_primary then 'related' else 'primary_projection' end,
    not v_has_primary,
    jsonb_build_object(
      'binding_version', 'lighthouse_intake_upload_binding.v1.0.0',
      'legacy_case_id', v_document.case_id
    ),
    now()
  )
  on conflict (intake_session_id, case_uuid) do nothing;

  if v_document.snapshot_id is not null then
    select cs.document_ids, cs.document_hashes, cs.snapshot_status
      into v_snapshot_document_ids_text, v_snapshot_document_hashes_text, v_snapshot_status
      from public.corpus_snapshots cs
     where cs.id = v_document.snapshot_id
       and cs.case_id = v_document.case_id
     for update;

    if not found then
      raise exception 'intake_upload_binding_snapshot_missing:%', v_document.snapshot_id;
    end if;

    if v_snapshot_status <> 'open' then
      raise exception 'intake_upload_binding_snapshot_not_open:%', v_document.snapshot_id;
    end if;

    begin
      v_document_ids := coalesce(nullif(trim(v_snapshot_document_ids_text), ''), '[]')::jsonb;
      v_document_hashes := coalesce(nullif(trim(v_snapshot_document_hashes_text), ''), '{}')::jsonb;
    exception when others then
      raise exception 'intake_upload_binding_snapshot_json_invalid:%', v_document.snapshot_id;
    end;

    if jsonb_typeof(v_document_ids) <> 'array' or jsonb_typeof(v_document_hashes) <> 'object' then
      raise exception 'intake_upload_binding_snapshot_shape_invalid:%', v_document.snapshot_id;
    end if;

    select coalesce(jsonb_agg(x.document_id order by x.document_id), '[]'::jsonb)
      into v_document_ids
      from (
        select distinct document_id
          from (
            select (jsonb_array_elements_text(v_document_ids))::integer as document_id
            union all
            select v_document.id
          ) source_ids
      ) x;

    v_document_hashes := v_document_hashes || jsonb_build_object(v_document.id::text, v_document.sha256_hash);

    update public.corpus_snapshots
       set document_ids = v_document_ids::text,
           document_hashes = v_document_hashes::text
     where id = v_document.snapshot_id
       and case_id = v_document.case_id;
  end if;

  v_artifact_key := 'sha256:' || v_document.sha256_hash;

  if coalesce(v_document.s3_key, '') like 'supabase://%' then
    v_storage_without_scheme := regexp_replace(v_document.s3_key, '^supabase://', '');
    v_storage_bucket := split_part(v_storage_without_scheme, '/', 1);
    v_storage_object_path := substring(v_storage_without_scheme from length(v_storage_bucket) + 2);
  else
    v_storage_bucket := null;
    v_storage_object_path := nullif(v_document.s3_key, '');
  end if;

  select ia.artifact_id
    into v_artifact_id
    from public.intake_artifacts ia
   where ia.intake_session_id = v_session_id
     and ia.artifact_key = v_artifact_key
   limit 1;

  if v_artifact_id is null then
    insert into public.intake_artifacts (
      artifact_id,
      intake_session_id,
      artifact_key,
      source_family,
      artifact_type,
      evidence_tier,
      availability,
      filename,
      mime_type,
      byte_size,
      sha256,
      storage_bucket,
      storage_object_path,
      privacy_classification,
      artifact_status,
      metadata,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_session_id,
      v_artifact_key,
      'lighthouse_case_evidence',
      'source_document',
      'primary_source_upload',
      'lighthouse_private_storage',
      v_document.filename,
      v_document.mime_type,
      v_document.file_size,
      v_document.sha256_hash,
      v_storage_bucket,
      v_storage_object_path,
      'private',
      'registered',
      jsonb_build_object(
        'binding_version', 'lighthouse_intake_upload_binding.v1.0.0',
        'legacy_case_id', v_document.case_id,
        'legacy_document_id', v_document.id,
        'snapshot_id', v_document.snapshot_id,
        'declared_file_type', v_document.file_type,
        'storage_key', v_document.s3_key
      ),
      now(),
      now()
    )
    returning artifact_id into v_artifact_id;
  end if;

  update public.intake_sessions
     set completion_state = 'evidence_registered',
         updated_at = now()
   where intake_session_id = v_session_id;

  return jsonb_build_object(
    'case_uuid', v_case_uuid,
    'intake_session_id', v_session_id,
    'artifact_id', v_artifact_id,
    'snapshot_id', v_document.snapshot_id,
    'document_id', v_document.id
  );
end
$$;

create or replace function public.bind_document_to_intake_spine_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform public.bind_document_to_intake_spine_v1(new.id);
  return new;
end
$$;

drop trigger if exists documents_normalize_file_type_v1_trg on public.documents;
create trigger documents_normalize_file_type_v1_trg
before insert or update of mime_type on public.documents
for each row
execute function public.normalize_lighthouse_document_file_type_trigger_v1();

drop trigger if exists documents_bind_intake_spine_v1_trg on public.documents;
create trigger documents_bind_intake_spine_v1_trg
after insert on public.documents
for each row
when (new.case_id is not null and new.sha256_hash ~ '^[0-9a-f]{64}$')
execute function public.bind_document_to_intake_spine_trigger_v1();

update public.documents
   set file_type = public.normalize_lighthouse_document_file_type_v1(mime_type, file_type)
 where lower(coalesce(mime_type, '')) in (
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/msword'
 )
   and file_type is distinct from public.normalize_lighthouse_document_file_type_v1(mime_type, file_type);

do $$
declare
  v_document_id integer;
begin
  for v_document_id in
    select d.id
      from public.documents d
     where d.sha256_hash ~ '^[0-9a-f]{64}$'
       and d.s3_key like 'supabase://case-documents/%'
       and d.case_id is not null
     order by d.id
  loop
    perform public.bind_document_to_intake_spine_v1(v_document_id);
  end loop;
end
$$;

revoke all on function public.normalize_lighthouse_document_file_type_v1(text, text) from public;
revoke all on function public.normalize_lighthouse_document_file_type_trigger_v1() from public;
revoke all on function public.bind_document_to_intake_spine_v1(integer) from public;
revoke all on function public.bind_document_to_intake_spine_trigger_v1() from public;

grant execute on function public.bind_document_to_intake_spine_v1(integer) to service_role;
