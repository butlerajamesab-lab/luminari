begin

do $migration$
declare
  v_function_sql text;
  v_backup_sql text;
  v_view_sql text;
  v_function_anchor text := E'''temporal_status'', eo.temporal_status,\n        ''confidence'', eo.confidence';
  v_function_replacement text := E'''temporal_status'', eo.temporal_status,\n        ''governing_section'', (select rb.section_number from public.hr1_raw_blocks rb where rb.id = eo.source_block_id),\n        ''confidence'', eo.confidence';
  v_view_anchor text := '''temporal_status'', eo.temporal_status)';
  v_view_replacement text := '''temporal_status'', eo.temporal_status, ''governing_section'', rb_1.section_number)';
begin
  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  ) into v_function_sql;

  if position('rosetta-v3-deterministic-sql-2.0.0' in v_function_sql) = 0 then
    raise exception 'Rosetta v2 producer is not active';
  end if;
  if position(v_function_anchor in v_function_sql) = 0 then
    raise exception 'Rosetta override output anchor is missing';
  end if;

  if to_regprocedure(
    'public.run_rosetta_v3_extraction_v2_legacy(integer,text,text,text,text,text,text,text,date,text,jsonb)'
  ) is null then
    v_backup_sql := replace(
      v_function_sql,
      'FUNCTION public.run_rosetta_v3_extraction(',
      'FUNCTION public.run_rosetta_v3_extraction_v2_legacy('
    );
    if v_backup_sql = v_function_sql then
      raise exception 'Unable to preserve Rosetta v2 producer';
    end if;
    execute v_backup_sql;
  end if;

  v_function_sql := replace(
    v_function_sql,
    'rosetta-v3-deterministic-sql-2.0.0',
    'rosetta-v3-deterministic-sql-2.1.0'
  );
  v_function_sql := replace(
    v_function_sql,
    'rosetta-five-layer-structural-correctness-2.0.0',
    'rosetta-five-layer-structural-correctness-2.1.0'
  );
  v_function_sql := replace(v_function_sql, 'cfg-v2-', 'cfg-v21-');
  v_function_sql := replace(v_function_sql, 'manifest-v2-', 'manifest-v21-');
  v_function_sql := replace(v_function_sql, 'vr-v2-', 'vr-v21-');
  v_function_sql := replace(
    v_function_sql,
    v_function_anchor,
    v_function_replacement
  );

  if position('''governing_section'', (select rb.section_number' in v_function_sql) = 0 then
    raise exception 'Rosetta v2.1 override section was not inserted into output';
  end if;

  execute v_function_sql;

  select pg_get_viewdef(
    'public.v_civic_genome_law_view_v1'::regclass,
    true
  ) into v_view_sql;

  if position(v_view_anchor in v_view_sql) = 0 then
    raise exception 'Civic Genome override view anchor is missing';
  end if;

  v_view_sql := replace(v_view_sql, v_view_anchor, v_view_replacement);
  execute 'create or replace view public.v_civic_genome_law_view_v1 '
       || 'with (security_invoker = true) as '
       || v_view_sql;
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

revoke all on function public.run_rosetta_v3_extraction_v2_legacy(
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
) from public, anon, authenticated

revoke all on function public.run_rosetta_v3_extraction(
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
) from public, anon, authenticated

grant execute on function public.run_rosetta_v3_extraction(
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
) to service_role

with canonical_manifest as (
  select jsonb_build_object(
    'contract', 'S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS}',
    'engine_version', 'rosetta-v3-deterministic-sql-2.1.0',
    'rule_set_version', 'rosetta-five-layer-structural-correctness-2.1.0',
    'inherits', jsonb_build_object(
      'engine_version', 'rosetta-v3-deterministic-sql-2.0.0',
      'rule_set_version', 'rosetta-five-layer-structural-correctness-2.0.0'
    ),
    'change', jsonb_build_object(
      'override_governing_section', 'explicit section value derived from the immutable Rosetta source block',
      'law_view_export', 'normalized override payload includes governing_section',
      'source_identity', 'unchanged',
      'workflow_rules', 'unchanged',
      'definition_rules', 'unchanged'
    ),
    'validation', jsonb_build_array(
      'override governing section is present',
      'override governing section equals source block section',
      'exact replay remains idempotent'
    ),
    'provenance', 'The explicit override section is copied from the same immutable section block already bound to the override object.'
  ) as manifest_json
),
canonical_receipt as (
  select
    manifest_json,
    encode(
      digest(convert_to(manifest_json::text, 'UTF8'), 'sha256'),
      'hex'
    ) as manifest_hash
  from canonical_manifest
)
insert into public.extraction_rule_manifest (
  engine_version,
  rule_set_version,
  manifest_hash,
  manifest_json,
  is_active
)
select
  'rosetta-v3-deterministic-sql-2.1.0',
  'rosetta-five-layer-structural-correctness-2.1.0',
  manifest_hash,
  manifest_json,
  true
from canonical_receipt
on conflict (engine_version, rule_set_version) do update
set manifest_hash = excluded.manifest_hash,
    manifest_json = excluded.manifest_json,
    is_active = true

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
  'Rosetta deterministic extraction 2.1.0. Inherits the verified section-aware 2.0 rules and explicitly exports each override governing section from its immutable section block.'

commit
