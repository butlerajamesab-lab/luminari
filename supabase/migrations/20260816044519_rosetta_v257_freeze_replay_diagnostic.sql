begin

update public.extraction_rule_manifest
set is_active=false
where engine_version='rosetta-v3-deterministic-sql-2.5.7'
  and rule_set_version='rosetta-five-layer-structural-correctness-2.5.7'

revoke execute on function public.run_rosetta_v3_extraction_v257_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from service_role

comment on function public.run_rosetta_v3_extraction_v257_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Frozen admissible diagnostic generation. Final semantics and returned receipt are correct, but exact replay would re-enter finalization/reclassification and could mutate final coverage timestamps/output hash. Do not execute or promote; replay-safe behavior moves to Rosetta 2.5.8.'

commit
