update public.extraction_rule_manifest set is_active=true where engine_version='rosetta-v3-deterministic-sql-2.5.4' and rule_set_version='rosetta-five-layer-structural-correctness-2.5.4'

comment on function public.run_rosetta_v3_extraction_v254_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is 'Staged Rosetta 2.5.4 candidate. Its own manifest is enabled so inherited base validation can resolve it, but current-generation authority remains the separate registry row until explicit promotion.'
