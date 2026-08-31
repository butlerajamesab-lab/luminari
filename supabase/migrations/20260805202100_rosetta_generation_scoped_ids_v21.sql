begin

do $migration$
declare
  v_sql text;
  v_prefix text;
begin
  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  ) into v_sql;

  if position('rosetta-v3-deterministic-sql-2.1.0' in v_sql) = 0 then
    raise exception 'Rosetta v2.1 producer is not active';
  end if;

  foreach v_prefix in array array[
    'blk-v2-',
    'he-v2-',
    'wp-v2-',
    'ws-v2-',
    'ar-v2-',
    'en-v2-',
    'ov-v2-',
    'td-v2-',
    'lc-v2-'
  ]
  loop
    v_sql := replace(
      v_sql,
      v_prefix,
      replace(v_prefix, '-v2-', '-v21-')
    );
  end loop;

  if position('blk-v21-' in v_sql) = 0
     or position('wp-v21-' in v_sql) = 0
     or position('td-v21-' in v_sql) = 0
     or position('ov-v21-' in v_sql) = 0 then
    raise exception 'Rosetta v2.1 generation-scoped IDs were not installed';
  end if;

  execute v_sql;
end;
$migration$

alter function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) set statement_timeout = '120s'

alter function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) set search_path = pg_catalog, public, extensions

update public.extraction_rule_manifest
set manifest_json = jsonb_set(
      manifest_json,
      '{change,generation_scoped_object_ids}',
      '"All canonical IDs include the Rosetta 2.1 generation prefix so the same immutable source may retain multiple engine generations without collision."'::jsonb,
      true
    ),
    manifest_hash = encode(
      digest(
        convert_to(
          jsonb_set(
            manifest_json,
            '{change,generation_scoped_object_ids}',
            '"All canonical IDs include the Rosetta 2.1 generation prefix so the same immutable source may retain multiple engine generations without collision."'::jsonb,
            true
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
where engine_version = 'rosetta-v3-deterministic-sql-2.1.0'
  and rule_set_version = 'rosetta-five-layer-structural-correctness-2.1.0'

comment on function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) is
  'Rosetta deterministic extraction 2.1.0. Section-aware structural rules, explicit override sections, and generation-scoped canonical IDs preserve multiple immutable engine generations for the same source.'

commit
