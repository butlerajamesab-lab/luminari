begin

do $migration$
declare
  v_sql text;
  v_backup_sql text;
  v_prefix text;
begin
  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  ) into v_sql;

  if position('rosetta-v3-deterministic-sql-2.1.0' in v_sql) = 0 then
    raise exception 'Rosetta 2.1 producer is not active';
  end if;

  if to_regprocedure(
    'public.run_rosetta_v3_extraction_v21_legacy(integer,text,text,text,text,text,text,text,date,text,jsonb)'
  ) is null then
    v_backup_sql := replace(
      v_sql,
      'FUNCTION public.run_rosetta_v3_extraction(',
      'FUNCTION public.run_rosetta_v3_extraction_v21_legacy('
    );
    if v_backup_sql = v_sql then
      raise exception 'Unable to preserve Rosetta 2.1 producer';
    end if;
    execute v_backup_sql;
  end if;

  v_sql := replace(
    v_sql,
    'FUNCTION public.run_rosetta_v3_extraction(',
    'FUNCTION public.run_rosetta_v3_extraction_v22_base('
  );
  v_sql := replace(
    v_sql,
    'rosetta-v3-deterministic-sql-2.1.0',
    'rosetta-v3-deterministic-sql-2.2.0'
  );
  v_sql := replace(
    v_sql,
    'rosetta-five-layer-structural-correctness-2.1.0',
    'rosetta-five-layer-structural-correctness-2.2.0'
  );

  foreach v_prefix in array array[
    'cfg-v21-',
    'manifest-v21-',
    'vr-v21-',
    'blk-v21-',
    'he-v21-',
    'wp-v21-',
    'ws-v21-',
    'ar-v21-',
    'en-v21-',
    'ov-v21-',
    'td-v21-',
    'lc-v21-'
  ]
  loop
    v_sql := replace(v_sql, v_prefix, replace(v_prefix, '-v21-', '-v22-'));
  end loop;

  if position('FUNCTION public.run_rosetta_v3_extraction_v22_base(' in v_sql) = 0
     or position('rosetta-v3-deterministic-sql-2.2.0' in v_sql) = 0
     or position('blk-v22-' in v_sql) = 0 then
    raise exception 'Rosetta 2.2 base producer transformation failed';
  end if;

  execute v_sql;
end;
$migration$

create or replace function public.run_rosetta_v3_extraction(
  p_source_document_id integer,
  p_source_text text,
  p_expected_source_content_hash text,
  p_source_url text,
  p_source_version text,
  p_media_type text default 'text/plain'::text,
  p_source_byte_hash text default null::text,
  p_source_provider_hash text default null::text,
  p_reference_date date default null::date,
  p_text_extractor_version text default 'plain-text-1'::text,
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set statement_timeout = '120s'
set search_path = pg_catalog, public, extensions
as $$
declare
  v_receipt jsonb;
  v_run_id integer;
begin
  v_receipt := public.run_rosetta_v3_extraction_v22_base(
    p_source_document_id,
    p_source_text,
    p_expected_source_content_hash,
    p_source_url,
    p_source_version,
    p_media_type,
    p_source_byte_hash,
    p_source_provider_hash,
    p_reference_date,
    p_text_extractor_version,
    p_source_metadata
  );

  if coalesce((v_receipt ->> 'replayed')::boolean, false) then
    return v_receipt;
  end if;

  v_run_id := nullif(v_receipt ->> 'extraction_run_id', '')::integer;
  if v_run_id is null then
    return v_receipt;
  end if;

  return public.rosetta_v22_finalize_extraction(
    v_run_id,
    p_source_text,
    coalesce(p_source_metadata, '{}'::jsonb),
    v_receipt
  );
end;
$$

revoke all on function public.run_rosetta_v3_extraction_v21_legacy(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from public, anon, authenticated

revoke all on function public.run_rosetta_v3_extraction_v22_base(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from public, anon, authenticated

revoke all on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from public, anon, authenticated

grant execute on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) to service_role

comment on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) is
  'Rosetta deterministic extraction 2.2.0. Preserves exact definition punctuation, captures source-stated amendment operations without applying legal effect, validates every object against immutable source text, and retains the complete 2.1 producer for rollback.'

commit
