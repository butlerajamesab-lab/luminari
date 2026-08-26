begin;
set local lock_timeout = '5s';

-- Source acquisition and parser execution must not share a transaction. A
-- parser rejection is allowed to roll back parser-owned rows, but it must not
-- erase the exact source bytes/text that Lighthouse already acquired.
create or replace function public.rosetta_register_source_content_v1(
  p_source_document_id integer,
  p_source_text text,
  p_expected_source_content_hash text,
  p_source_url text,
  p_source_version text,
  p_media_type text default 'text/plain',
  p_source_byte_hash text default null,
  p_source_provider_hash text default null,
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_document_identifier text;
  v_expected_content_hash text;
  v_source_content_hash text;
  v_source_identity_hash text;
  v_content_id uuid;
  v_inserted boolean := false;
  v_existing public.source_document_content%rowtype;
begin
  select document.document_identifier
    into v_document_identifier
    from public.source_document document
   where document.id = p_source_document_id;

  if v_document_identifier is null then
    raise exception using
      errcode = '23503',
      message = 'source_document_not_found';
  end if;

  if nullif(btrim(p_source_text), '') is null then
    raise exception using errcode = '22023', message = 'source_text_required';
  end if;
  if nullif(btrim(p_source_url), '') is null then
    raise exception using errcode = '22023', message = 'source_url_required';
  end if;
  if nullif(btrim(p_source_version), '') is null then
    raise exception using errcode = '22023', message = 'source_version_required';
  end if;
  if nullif(btrim(p_media_type), '') is null then
    raise exception using errcode = '22023', message = 'media_type_required';
  end if;

  v_source_content_hash := encode(
    extensions.digest(convert_to(p_source_text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_expected_content_hash := lower(
    regexp_replace(coalesce(p_expected_source_content_hash, ''), '^sha256:', '')
  );

  if v_expected_content_hash <> v_source_content_hash then
    raise exception using
      errcode = '22000',
      message = 'source_content_hash_mismatch';
  end if;
  if p_source_byte_hash is not null
     and p_source_byte_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'source_byte_hash_must_be_sha256_hex';
  end if;
  if lower(p_media_type) = 'application/pdf'
     and p_source_byte_hash is null then
    raise exception using
      errcode = '22023',
      message = 'pdf_source_byte_hash_required';
  end if;

  -- This is byte-for-byte the source identity projection used by the active
  -- 2.5.11 parser. The later parser RPC therefore finds this same row rather
  -- than inventing a second acquisition identity.
  v_source_identity_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'document_identifier', v_document_identifier,
      'source_version', p_source_version,
      'source_url', p_source_url,
      'source_content_hash', v_source_content_hash,
      'source_byte_hash', p_source_byte_hash,
      'media_type', p_media_type
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.source_document_content (
    source_document_id,
    source_version,
    source_url,
    media_type,
    source_text,
    source_content_hash,
    source_byte_hash,
    source_provider_hash,
    source_identity_hash,
    source_metadata
  ) values (
    p_source_document_id,
    p_source_version,
    p_source_url,
    p_media_type,
    p_source_text,
    v_source_content_hash,
    p_source_byte_hash,
    p_source_provider_hash,
    v_source_identity_hash,
    coalesce(p_source_metadata, '{}'::jsonb)
  )
  on conflict (source_document_id, source_version) do nothing
  returning source_content_id into v_content_id;

  v_inserted := v_content_id is not null;

  select content.*
    into v_existing
    from public.source_document_content content
   where content.source_document_id = p_source_document_id
     and content.source_version = p_source_version;

  if v_existing.source_content_id is null then
    raise exception using
      errcode = '55000',
      message = 'source_content_registration_missing';
  end if;
  if v_existing.source_content_hash is distinct from v_source_content_hash
     or v_existing.source_url is distinct from p_source_url
     or v_existing.media_type is distinct from p_media_type
     or v_existing.source_byte_hash is distinct from p_source_byte_hash
     or v_existing.source_provider_hash is distinct from p_source_provider_hash
     or v_existing.source_identity_hash is distinct from v_source_identity_hash then
    raise exception using
      errcode = '23505',
      message = 'source_version_content_conflict';
  end if;

  return jsonb_build_object(
    'contract', 'rosetta-durable-source-content-v1',
    'source_document_id', p_source_document_id,
    'source_content_id', v_existing.source_content_id,
    'source_identity_hash', v_existing.source_identity_hash,
    'source_content_hash', v_existing.source_content_hash,
    'source_byte_hash', v_existing.source_byte_hash,
    'source_version', v_existing.source_version,
    'source_url', v_existing.source_url,
    'media_type', v_existing.media_type,
    'registered', v_inserted,
    'replayed', not v_inserted,
    'registered_at', v_existing.created_at
  );
end;
$function$;

revoke all on function public.rosetta_register_source_content_v1(
  integer, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rosetta_register_source_content_v1(
  integer, text, text, text, text, text, text, text, jsonb
) to service_role;

commit;
