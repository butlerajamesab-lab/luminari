begin

do $$
declare
  v_generation jsonb;
begin
  v_generation := public.rosetta_current_generation_v1();
  if v_generation->>'engine_version' <> 'rosetta-v3-deterministic-sql-2.5.11'
     or v_generation->>'rule_set_version' <> 'rosetta-five-layer-structural-correctness-2.5.11'
     or v_generation->>'rule_manifest_hash' <> '3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639' then
    raise exception 'rosetta_v2511_rpc_timeout_window_current_generation_mismatch';
  end if;
end;
$$

alter function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) set statement_timeout = '180s'

alter function public.run_rosetta_v3_extraction_v2511_candidate(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) set statement_timeout = '180s'

alter function public.rosetta_replay_source_identity_current_v1(
  integer, text
) set statement_timeout = '180s'

comment on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) is 'Current deterministic Rosetta extraction entry point. Function-local statement timeout is bounded at 180 seconds for current 2.5.11 official-law workloads; project and role defaults remain unchanged.'

comment on function public.run_rosetta_v3_extraction_v2511_candidate(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) is 'Rosetta 2.5.11 candidate producer. Function-local statement timeout is bounded at 180 seconds; deterministic engine, rule, manifest, admissibility, and provenance contracts are unchanged.'

comment on function public.rosetta_replay_source_identity_current_v1(
  integer, text
) is 'Exact-source current-generation replay. Function-local statement timeout is bounded at 180 seconds; source identity and current-generation replay acceptance remain unchanged.'

commit
