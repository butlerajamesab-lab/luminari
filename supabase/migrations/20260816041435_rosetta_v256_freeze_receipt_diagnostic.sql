begin

update public.extraction_rule_manifest
set is_active=false
where engine_version='rosetta-v3-deterministic-sql-2.5.6'
  and rule_set_version='rosetta-five-layer-structural-correctness-2.5.6'

revoke execute on function public.run_rosetta_v3_extraction_v256_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from service_role

comment on function public.run_rosetta_v3_extraction_v256_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Frozen admissible diagnostic generation. Persisted final state and hashes are correct, but the direct function return retained pre-finalization coverage/row_counts. Do not promote; corrected receipt contract moves to 2.5.7.'

commit
