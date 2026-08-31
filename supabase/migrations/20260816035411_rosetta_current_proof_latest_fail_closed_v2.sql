begin

create or replace function rosetta_private.rosetta_current_proof_run_ids_v1()
returns table(extraction_run_id integer)
language sql
stable
security definer
set search_path = pg_catalog, public, rosetta_private
as $$
  with target as (
    select engine_version, rule_set_version, rule_manifest_hash, validation_test_name
    from public.rosetta_current_generation_registry_v1
    where singleton = true
  ),
  validated as materialized (
    select run.id, run.source_document_id
    from public.extraction_run run
    cross join target
    join public.validation_result validation
      on validation.extraction_run_id = run.id
     and validation.test_name = target.validation_test_name
     and validation.test_result = 'pass'
     and validation.failure_count = 0
    where run.run_status in ('completed','validated')
      and run.admissibility_state = 'admissible'
      and run.engine_version = target.engine_version
      and run.rule_set_version = target.rule_set_version
      and run.rule_manifest_hash = target.rule_manifest_hash
  ),
  repair_clean as materialized (
    select validated.*
    from validated
    where public.rosetta_blocking_structural_repair_count(validated.id) = 0
  ),
  latest as (
    select distinct on (source_document_id)
      id as extraction_run_id,
      source_document_id
    from repair_clean
    order by source_document_id, id desc
  ),
  hash_complete as (
    select latest.extraction_run_id
    from latest
    join public.extraction_run run on run.id = latest.extraction_run_id
    where run.rule_manifest_hash is not null
      and run.source_content_hash is not null
      and run.output_content_hash is not null
  ),
  terminal as (
    select hash_complete.extraction_run_id
    from hash_complete
    join public.layer_coverage coverage
      on coverage.extraction_run_id = hash_complete.extraction_run_id
    group by hash_complete.extraction_run_id
    having count(distinct coverage.layer_name) = 5
       and bool_and(coverage.coverage_status in ('populated','not_applicable'))
  )
  select terminal.extraction_run_id
  from terminal;
$$

comment on function rosetta_private.rosetta_current_proof_run_ids_v1() is
  'Set-based fail-closed current-proof identity. Selects the newest independently validated, repair-clean run per source in the registry-selected generation before requiring final proof hashes and terminal five-layer coverage, preventing an older generation run from reappearing when a newer accepted run is hash-incomplete.'

commit
