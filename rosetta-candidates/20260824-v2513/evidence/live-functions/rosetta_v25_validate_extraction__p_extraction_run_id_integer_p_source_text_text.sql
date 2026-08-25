CREATE OR REPLACE FUNCTION public.rosetta_v25_validate_extraction(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
with expected_workflow as (
  select
    section_number,
    public.rosetta_v2_normalize_text(clause_text) as clause_text,
    public.rosetta_v2_normalize_text(actor) as actor,
    lower(modal) as modal
  from public.rosetta_v25_normative_clauses(p_source_text)
),
actual_workflow as (
  select
    ws.id,
    public.rosetta_v2_normalize_text(ws.step_name) as clause_text,
    public.rosetta_v2_normalize_text(ws.actor) as actor,
    lower(ws.verb) as modal,
    ws.governing_section,
    rb.section_number as block_section
  from public.workflow_step ws
  join public.workflow_pipeline wp
    on wp.id = ws.workflow_pipeline_id
  join public.hr1_raw_blocks rb
    on rb.id = wp.source_block_id
  where wp.extraction_run_id = p_extraction_run_id
),
metrics as (
  select
    (select count(*) from expected_workflow)::integer as expected_workflow_count,
    (select count(*) from actual_workflow)::integer as actual_workflow_count,
    (
      select count(*)::integer
      from expected_workflow expected
      where not exists (
        select 1
        from actual_workflow actual
        where lower(actual.clause_text) = lower(expected.clause_text)
          and lower(actual.block_section) = lower(expected.section_number)
      )
    ) as missing_workflow_count,
    (
      select count(*)::integer
      from actual_workflow actual
      where not exists (
        select 1
        from expected_workflow expected
        where lower(expected.clause_text) = lower(actual.clause_text)
          and lower(expected.section_number) = lower(actual.block_section)
      )
    ) as extra_workflow_count,
    (
      select count(*)::integer
      from actual_workflow actual
      where exists (
        select 1
        from expected_workflow expected
        where lower(expected.clause_text) = lower(actual.clause_text)
          and lower(expected.section_number) = lower(actual.block_section)
          and expected.modal is distinct from actual.modal
      )
    ) as modal_mismatch_count,
    (
      select count(*)::integer
      from actual_workflow actual
      where exists (
        select 1
        from expected_workflow expected
        where lower(expected.clause_text) = lower(actual.clause_text)
          and lower(expected.section_number) = lower(actual.block_section)
          and lower(coalesce(expected.actor, '')) is distinct from
              lower(coalesce(actual.actor, ''))
      )
    ) as actor_mismatch_count,
    (
      select count(*)::integer
      from actual_workflow
      where lower(coalesce(governing_section, '')) is distinct from
            lower(coalesce(block_section, ''))
    ) as workflow_section_mismatch_count,
    (
      select count(*)::integer
      from public.term_definition td
      join public.hr1_raw_blocks rb on rb.id = td.source_block_id
      where td.extraction_run_id = p_extraction_run_id
        and lower(td.defining_section) is distinct from lower(rb.section_number)
    ) as definition_section_mismatch_count,
    (
      select count(*)::integer
      from public.entity_override eo
      join public.hr1_raw_blocks rb on rb.id = eo.source_block_id
      where eo.extraction_run_id = p_extraction_run_id
        and lower(
          coalesce(
            nullif(
              regexp_replace(eo.overridden_authority, '^Base rule within\s+', '', 'i'),
              ''
            ),
            rb.section_number
          )
        ) is distinct from lower(rb.section_number)
    ) as override_section_mismatch_count,
    (
      select count(*)::integer
      from public.hr1_raw_blocks rb
      where rb.extraction_run_id = p_extraction_run_id
        and rb.block_type = 'section'
        and (
          select count(distinct lc.layer_name)
          from public.layer_coverage lc
          where lc.extraction_run_id = p_extraction_run_id
            and lc.source_block_id = rb.id
        ) <> 5
    ) as coverage_mismatch_count
),
rendered as (
  select jsonb_build_object(
    'status',
    case
      when expected_workflow_count = actual_workflow_count
       and missing_workflow_count = 0
       and extra_workflow_count = 0
       and modal_mismatch_count = 0
       and actor_mismatch_count = 0
       and workflow_section_mismatch_count = 0
       and definition_section_mismatch_count = 0
       and override_section_mismatch_count = 0
       and coverage_mismatch_count = 0
      then 'pass'
      else 'fail'
    end,
    'engine_contract', 'rosetta-structural-self-check-v25',
    'expected_workflow_count', expected_workflow_count,
    'actual_workflow_count', actual_workflow_count,
    'missing_workflow_count', missing_workflow_count,
    'extra_workflow_count', extra_workflow_count,
    'modal_mismatch_count', modal_mismatch_count,
    'actor_mismatch_count', actor_mismatch_count,
    'workflow_section_mismatch_count', workflow_section_mismatch_count,
    'definition_section_mismatch_count', definition_section_mismatch_count,
    'override_section_mismatch_count', override_section_mismatch_count,
    'coverage_mismatch_count', coverage_mismatch_count
  ) as receipt
  from metrics
)
select receipt from rendered;
$function$
