begin

with restored as (
  select
    manifest_json - 'candidate_revision' - 'coverage_block_scope' as manifest_json
  from public.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.5'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.5'
), receipt as (
  select manifest_json,encode(digest(convert_to(manifest_json::text,'UTF8'),'sha256'),'hex') as manifest_hash
  from restored
)
update public.extraction_rule_manifest manifest
set manifest_json=receipt.manifest_json,
    manifest_hash=receipt.manifest_hash,
    is_active=false,
    created_at=clock_timestamp()
from receipt
where manifest.engine_version='rosetta-v3-deterministic-sql-2.5.5'
  and manifest.rule_set_version='rosetta-five-layer-structural-correctness-2.5.5'

revoke execute on function public.run_rosetta_v3_extraction_v255_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from service_role

comment on function public.run_rosetta_v3_extraction_v255_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Frozen rejected diagnostic candidate. Run 10607 is preserved under manifest 0df004af303b94dd9331d8a70fff410db7250e0523593ef4db4aaee5342a0363. Do not execute or promote; corrected coverage-block scope moves to Rosetta 2.5.6.'

commit
