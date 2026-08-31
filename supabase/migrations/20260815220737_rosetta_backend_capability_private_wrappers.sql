begin

create schema if not exists rosetta_private

revoke all on schema rosetta_private from public

grant usage on schema rosetta_private to anon, authenticated, service_role

alter function public.rosetta_backend_capability_probe_v1(text)
  set schema rosetta_private

alter function public.rosetta_run_detail_v1(text, integer)
  set schema rosetta_private

alter function public.rosetta_operator_intake_v1(
  text, text, text, text, text, text, text, text, text, text, text, date, text, jsonb
) set schema rosetta_private

grant execute on function rosetta_private.rosetta_backend_capability_probe_v1(text)
  to anon, authenticated, service_role

grant execute on function rosetta_private.rosetta_run_detail_v1(text, integer)
  to anon, authenticated, service_role

grant execute on function rosetta_private.rosetta_operator_intake_v1(
  text, text, text, text, text, text, text, text, text, text, text, date, text, jsonb
) to anon, authenticated, service_role

create or replace function public.rosetta_backend_capability_probe_v1(
  p_capability_token text
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, rosetta_private
as $$
  select rosetta_private.rosetta_backend_capability_probe_v1(p_capability_token);
$$

create or replace function public.rosetta_run_detail_v1(
  p_capability_token text,
  p_run_id integer
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, rosetta_private
as $$
  select rosetta_private.rosetta_run_detail_v1(p_capability_token, p_run_id);
$$

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
language sql
volatile
security invoker
set search_path = pg_catalog, rosetta_private
as $$
  select rosetta_private.rosetta_operator_intake_v1(
    p_capability_token,
    p_corpus_name,
    p_document_name,
    p_document_identifier,
    p_document_type,
    p_source_text,
    p_expected_source_content_hash,
    p_source_url,
    p_source_version,
    p_media_type,
    p_source_byte_hash,
    p_reference_date,
    p_text_extractor_version,
    p_source_metadata
  );
$$

revoke all on function public.rosetta_backend_capability_probe_v1(text) from public

grant execute on function public.rosetta_backend_capability_probe_v1(text)
  to anon, authenticated, service_role

revoke all on function public.rosetta_run_detail_v1(text, integer) from public

grant execute on function public.rosetta_run_detail_v1(text, integer)
  to anon, authenticated, service_role

revoke all on function public.rosetta_operator_intake_v1(
  text, text, text, text, text, text, text, text, text, text, text, date, text, jsonb
) from public

grant execute on function public.rosetta_operator_intake_v1(
  text, text, text, text, text, text, text, text, text, text, text, date, text, jsonb
) to anon, authenticated, service_role

comment on schema rosetta_private is
  'Non-exposed Rosetta implementation schema. Public PostgREST wrappers remain SECURITY INVOKER; privileged implementations live here.'

commit
