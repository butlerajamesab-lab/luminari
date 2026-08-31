begin

update public.extraction_rule_manifest
set is_active=false
where engine_version='rosetta-v3-deterministic-sql-2.5.4'
  and rule_set_version='rosetta-five-layer-structural-correctness-2.5.4'

revoke execute on function public.run_rosetta_v3_extraction_v254_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from service_role

comment on function public.run_rosetta_v3_extraction_v254_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Frozen diagnostic candidate. Existing 2.5.4 receipts remain immutable operator history. Execution is revoked because 2.5.4 is non-promotable and exact replay must never re-finalize an existing recorded generation.'

commit
