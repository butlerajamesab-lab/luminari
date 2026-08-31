do $$
declare
  v_sql text;
begin
  select pg_get_functiondef(p.oid)
    into v_sql
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'run_rosetta_v3_extraction'
    and pg_get_function_identity_arguments(p.oid) = 'p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text, p_source_byte_hash text, p_source_provider_hash text, p_reference_date date, p_text_extractor_version text, p_source_metadata jsonb';

  if v_sql is null then
    raise exception 'run_rosetta_v3_extraction definition not found';
  end if;

  v_sql := replace(v_sql, '[^.;]{0,520}', '[^.;]{0,255}');
  v_sql := replace(v_sql, '[^.;]{1,760}', '[^.;]+');
  v_sql := replace(v_sql, '[^.;]{1,900}', '[^.;]+');

  execute v_sql;
end;
$$

alter function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) set search_path = pg_catalog, public, extensions
