begin

create table if not exists public.rosetta_backend_capability_v1 (
  capability_name text primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
)

alter table public.rosetta_backend_capability_v1 enable row level security

revoke all on public.rosetta_backend_capability_v1 from public, anon, authenticated

grant select, insert, update, delete on public.rosetta_backend_capability_v1 to service_role

insert into public.rosetta_backend_capability_v1 (
  capability_name,
  token_hash,
  enabled,
  rotated_at
) values (
  'standalone_backend',
  '281829196aec9af987ab299a15e6e180fb9376b4ab48d4a380b04dd1fd8385ac',
  true,
  now()
)
on conflict (capability_name) do update
set token_hash = excluded.token_hash,
    enabled = true,
    rotated_at = now()

create or replace function public.rosetta_assert_backend_capability_v1(
  p_capability_token text,
  p_capability_name text default 'standalone_backend'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_expected_hash text;
  v_observed_hash text;
begin
  select capability.token_hash
    into v_expected_hash
  from public.rosetta_backend_capability_v1 capability
  where capability.capability_name = p_capability_name
    and capability.enabled = true;

  if v_expected_hash is null then
    raise exception using
      errcode = '42501',
      message = 'rosetta_backend_capability_unavailable';
  end if;

  v_observed_hash := encode(
    extensions.digest(convert_to(coalesce(p_capability_token, ''), 'UTF8'), 'sha256'),
    'hex'
  );

  if v_observed_hash is distinct from v_expected_hash then
    raise exception using
      errcode = '42501',
      message = 'rosetta_backend_capability_invalid';
  end if;
end;
$$

revoke all on function public.rosetta_assert_backend_capability_v1(text, text)
  from public, anon, authenticated

grant execute on function public.rosetta_assert_backend_capability_v1(text, text)
  to service_role

create or replace function public.rosetta_backend_capability_probe_v1(
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform public.rosetta_assert_backend_capability_v1(p_capability_token, 'standalone_backend');
  return jsonb_build_object(
    'ok', true,
    'contract', 'rosetta-backend-capability-v1'
  );
end;
$$

revoke all on function public.rosetta_backend_capability_probe_v1(text) from public

grant execute on function public.rosetta_backend_capability_probe_v1(text)
  to anon, authenticated, service_role

create or replace function public.rosetta_run_detail_v1(
  p_capability_token text,
  p_run_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_run jsonb;
  v_law_view jsonb;
  v_validations jsonb := '[]'::jsonb;
  v_manifest jsonb;
  v_document jsonb;
  v_source_receipt jsonb;
  v_source_document_id integer;
  v_source_content_id uuid;
begin
  perform public.rosetta_assert_backend_capability_v1(p_capability_token, 'standalone_backend');

  if p_run_id is null or p_run_id <= 0 then
    raise exception using errcode = '22023', message = 'invalid_run_id';
  end if;

  select to_jsonb(run), run.source_document_id, run.source_content_id
    into v_run, v_source_document_id, v_source_content_id
  from public.extraction_run run
  where run.id = p_run_id;

  if v_run is null then
    return jsonb_build_object(
      'law_view', null,
      'run', null,
      'validation_results', '[]'::jsonb,
      'extraction_manifest', null,
      'source_document', null,
      'source_receipt', null
    );
  end if;

  select to_jsonb(law)
    into v_law_view
  from public.v_rosetta_operator_law_view_v1 law
  where law.extraction_run_id = p_run_id;

  select coalesce(jsonb_agg(to_jsonb(validation) order by validation.test_name), '[]'::jsonb)
    into v_validations
  from public.validation_result validation
  where validation.extraction_run_id = p_run_id;

  select to_jsonb(manifest)
    into v_manifest
  from public.extraction_manifest manifest
  where manifest.extraction_run_id = p_run_id;

  select to_jsonb(document)
    into v_document
  from public.source_document document
  where document.id = v_source_document_id;

  if v_source_content_id is not null then
    select to_jsonb(receipt)
      into v_source_receipt
    from public.source_document_content receipt
    where receipt.source_content_id = v_source_content_id;
  end if;

  return jsonb_build_object(
    'law_view', v_law_view,
    'run', v_run,
    'validation_results', v_validations,
    'extraction_manifest', v_manifest,
    'source_document', v_document,
    'source_receipt', v_source_receipt
  );
end;
$$

revoke all on function public.rosetta_run_detail_v1(text, integer) from public

grant execute on function public.rosetta_run_detail_v1(text, integer)
  to anon, authenticated, service_role

create or replace function public.rosetta_operator_intake_v1(
  p_capability_token text,
  p_corpus_name text,
  p_document_name text,
  p_document_identifier text,
  p_document_type text,
  p_source_text text,
  p_expected_source_content_hash text,
  p_source_url text,
  p_source_version text,
  p_media_type text default 'application/octet-stream',
  p_source_byte_hash text default null,
  p_reference_date date default null,
  p_text_extractor_version text default null,
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_corpus public.corpus%rowtype;
  v_document public.source_document%rowtype;
  v_extraction jsonb;
begin
  perform public.rosetta_assert_backend_capability_v1(p_capability_token, 'standalone_backend');

  if nullif(btrim(p_corpus_name), '') is null
     or nullif(btrim(p_document_name), '') is null
     or nullif(btrim(p_document_identifier), '') is null
     or nullif(p_source_text, '') is null
     or nullif(p_expected_source_content_hash, '') is null
     or nullif(btrim(p_source_url), '') is null
     or nullif(btrim(p_source_version), '') is null then
    raise exception using errcode = '22023', message = 'rosetta_operator_intake_invalid';
  end if;

  select corpus.*
    into v_corpus
  from public.corpus corpus
  where corpus.corpus_name = p_corpus_name
  order by corpus.id
  limit 1;

  if not found then
    insert into public.corpus (corpus_name, corpus_type)
    values (p_corpus_name, 'legislative')
    returning * into v_corpus;
  end if;

  select document.*
    into v_document
  from public.source_document document
  where document.corpus_id = v_corpus.id
    and document.document_identifier = p_document_identifier
  order by document.id
  limit 1;

  if not found then
    insert into public.source_document (
      corpus_id,
      document_name,
      document_type,
      document_identifier
    ) values (
      v_corpus.id,
      p_document_name,
      nullif(p_document_type, ''),
      p_document_identifier
    )
    returning * into v_document;
  end if;

  select public.run_rosetta_v3_extraction(
    v_document.id,
    p_source_text,
    p_expected_source_content_hash,
    p_source_url,
    p_source_version,
    coalesce(nullif(p_media_type, ''), 'application/octet-stream'),
    p_source_byte_hash,
    null,
    p_reference_date,
    p_text_extractor_version,
    coalesce(p_source_metadata, '{}'::jsonb)
  ) into v_extraction;

  return jsonb_build_object(
    'corpus', to_jsonb(v_corpus),
    'source_document', to_jsonb(v_document),
    'extraction', v_extraction
  );
end;
$$

revoke all on function public.rosetta_operator_intake_v1(
  text, text, text, text, text, text, text, text, text, text, text, date, text, jsonb
) from public

grant execute on function public.rosetta_operator_intake_v1(
  text, text, text, text, text, text, text, text, text, text, text, date, text, jsonb
) to anon, authenticated, service_role

comment on table public.rosetta_backend_capability_v1 is
  'Stores only SHA-256 hashes of narrowly scoped server capabilities. Plaintext capability tokens are never persisted in Rosetta.'

comment on function public.rosetta_run_detail_v1(text, integer) is
  'Capability-gated one-run operator read. It does not grant direct access to the operator/history view.'

comment on function public.rosetta_operator_intake_v1(text, text, text, text, text, text, text, text, text, text, text, date, text, jsonb) is
  'Capability-gated canonical intake wrapper for the standalone Rosetta server. Browser callers cannot use it without the server-held capability token.'

commit
