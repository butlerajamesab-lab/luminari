begin isolation level repeatable read

set local statement_timeout = '30s'

-- Capture the complete control membership in the same MVCC snapshot used by
-- the replacement and the post-change gate. The temporary table disappears
-- whether the transaction commits or rolls back.
create temporary table rosetta_current_proof_membership_before
on commit drop
as
select coalesce(
  array_agg(proof.extraction_run_id order by proof.extraction_run_id),
  array[]::integer[]
) as extraction_run_ids
from rosetta_private.rosetta_current_proof_run_ids_v1() proof

-- Preserve the current proof-membership contract while replacing one
-- SECURITY DEFINER function call per validated run with the equivalent
-- set-based anti-join. The scalar call crosses PostgREST's statement timeout
-- at the current corpus size.
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
    where not exists (
      select 1
      from public.rosetta_structural_repair_queue repair
      where repair.extraction_run_id = validated.id
        and repair.repair_state in ('open', 'in_review')
        and (
          repair.defect_type <> 'actor_unresolved'
          or nullif(btrim(repair.defect_detail ->> 'actor_source_text'), '') is null
          or (repair.defect_detail ->> 'actor_source_text') ~ '^\s*[0-9]+(?:\s|\.|\))'
          or (repair.defect_detail ->> 'actor_source_text') ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--'
        )
    )
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

revoke all on function rosetta_private.rosetta_current_proof_run_ids_v1() from public

comment on function rosetta_private.rosetta_current_proof_run_ids_v1() is
  'Current-proof identity contract. Filters to the registry-selected generation, excludes blocking repairs with a set-based anti-join, selects the latest repair-clean run per source, then requires complete hashes and terminal five-layer coverage.'

do $membership_gate$
declare
  v_before integer[];
  v_after integer[];
begin
  select extraction_run_ids
  into strict v_before
  from rosetta_current_proof_membership_before;

  select coalesce(
    array_agg(proof.extraction_run_id order by proof.extraction_run_id),
    array[]::integer[]
  )
  into v_after
  from rosetta_private.rosetta_current_proof_run_ids_v1() proof;

  if v_before is distinct from v_after then
    raise exception using
      errcode = 'P0001',
      message = 'rosetta_current_proof_antijoin_membership_mismatch',
      detail = format(
        'before_count=%s after_count=%s',
        cardinality(v_before),
        cardinality(v_after)
      );
  end if;
end;
$membership_gate$

commit
