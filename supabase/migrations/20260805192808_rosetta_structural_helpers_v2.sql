begin

create extension if not exists pgcrypto

create or replace function public.rosetta_v2_normalize_text(p_value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select btrim(regexp_replace(p_value, '[[:space:]]+', ' ', 'g'));
$$

create or replace function public.rosetta_v2_section_spans(p_source_text text)
returns table (
  section_ordinal integer,
  section_number text,
  char_offset_start integer,
  char_offset_end integer,
  section_text text
)
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_length integer := char_length(p_source_text);
  v_first integer;
  v_start integer;
  v_next integer;
  v_end integer;
  v_ordinal integer := 0;
  v_marker text;
begin
  v_first := regexp_instr(
    p_source_text,
    'Sec[.]\s*[0-9]+[A-Za-z]?[.]',
    1,
    1,
    0,
    'i'
  );

  if v_first = 0 then
    return query
    select 1, 'Document'::text, 0, v_length, p_source_text;
    return;
  end if;

  if v_first > 1
     and nullif(btrim(substr(p_source_text, 1, v_first - 1)), '') is not null then
    v_ordinal := v_ordinal + 1;
    return query
    select
      v_ordinal,
      'Preamble'::text,
      0,
      v_first - 1,
      substr(p_source_text, 1, v_first - 1);
  end if;

  v_start := v_first;
  loop
    exit when v_start = 0 or v_start > v_length;

    v_next := regexp_instr(
      p_source_text,
      'Sec[.]\s*[0-9]+[A-Za-z]?[.]',
      v_start + 1,
      1,
      0,
      'i'
    );
    v_end := case when v_next = 0 then v_length + 1 else v_next end;

    v_marker := (
      regexp_match(
        substr(p_source_text, v_start, least(64, v_end - v_start)),
        '(?i)(Sec[.]\s*[0-9]+[A-Za-z]?[.])'
      )
    )[1];

    v_ordinal := v_ordinal + 1;
    return query
    select
      v_ordinal,
      regexp_replace(
        v_marker,
        '(?i)^Sec[.]\s*([0-9]+[A-Za-z]?)[.]$',
        'Sec. \1'
      ),
      v_start - 1,
      v_end - 1,
      substr(p_source_text, v_start, v_end - v_start);

    exit when v_next = 0;
    v_start := v_next;
  end loop;
end;
$$

create or replace function public.rosetta_v2_modal_and_actor(p_clause text)
returns table (
  modal text,
  actor text
)
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_normalized text;
  v_match text[];
begin
  v_normalized := public.rosetta_v2_normalize_text(p_clause);
  v_normalized := regexp_replace(
    v_normalized,
    '^(?:\([a-z0-9]+\)\s*)+',
    '',
    'i'
  );
  v_normalized := regexp_replace(v_normalized, '^\d+[.)]\s*', '');

  v_match := regexp_match(
    v_normalized,
    '(?i)^(.{1,180}?)\s+(shall not|must not|may not|shall|must|may)\M'
  );

  if v_match is null then
    return query select null::text, null::text;
    return;
  end if;

  return query
  select
    lower(v_match[2]),
    nullif(
      btrim(v_match[1], E' \t\r\n,;:'),
      ''
    );
end;
$$

create or replace function public.rosetta_v2_is_legislative_finding(
  p_clause text,
  p_modal text
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case
    when lower(public.rosetta_v2_normalize_text(p_clause))
      like '%the legislature finds%'
      or lower(public.rosetta_v2_normalize_text(p_clause))
      like '%the legislature recognizes%'
      then true
    when lower(p_modal) <> 'may' then false
    else lower(public.rosetta_v2_normalize_text(p_clause))
      ~ '\m(may offer|may influence|may blur|may create|may lead|may present)\M'
  end;
$$

create or replace function public.rosetta_v2_normative_clauses(p_source_text text)
returns table (
  section_ordinal integer,
  section_number text,
  clause_ordinal integer,
  clause_text text,
  actor text,
  modal text
)
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_section record;
  v_match text[];
  v_clause text;
  v_actor text;
  v_modal text;
  v_ordinal integer := 0;
begin
  for v_section in
    select *
    from public.rosetta_v2_section_spans(p_source_text)
    order by section_ordinal
  loop
    for v_match in
      select regexp_matches(
        public.rosetta_v2_normalize_text(v_section.section_text),
        '(?i)([^.;]{0,220}\m(shall not|must not|may not|shall|must|may)\M[^.;]{0,360}[.;])',
        'g'
      )
    loop
      v_clause := public.rosetta_v2_normalize_text(v_match[1]);
      select inferred.modal, inferred.actor
        into v_modal, v_actor
      from public.rosetta_v2_modal_and_actor(v_clause) inferred;

      if v_modal is null then
        continue;
      end if;

      if public.rosetta_v2_is_legislative_finding(v_clause, v_modal) then
        continue;
      end if;

      v_ordinal := v_ordinal + 1;
      return query
      select
        v_section.section_ordinal,
        v_section.section_number,
        v_ordinal,
        v_clause,
        v_actor,
        v_modal;
    end loop;
  end loop;
end;
$$

create or replace function public.rosetta_v2_validate_extraction(
  p_extraction_run_id integer,
  p_source_text text
)
returns jsonb
language sql
stable
strict
set search_path = pg_catalog, public
as $$
with expected_workflow as (
  select
    section_number,
    public.rosetta_v2_normalize_text(clause_text) as clause_text,
    public.rosetta_v2_normalize_text(actor) as actor,
    lower(modal) as modal
  from public.rosetta_v2_normative_clauses(p_source_text)
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
    'engine_contract', 'rosetta-structural-correctness-v2',
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
$$

revoke all on function public.rosetta_v2_normalize_text(text)
  from public, anon, authenticated

revoke all on function public.rosetta_v2_section_spans(text)
  from public, anon, authenticated

revoke all on function public.rosetta_v2_modal_and_actor(text)
  from public, anon, authenticated

revoke all on function public.rosetta_v2_is_legislative_finding(text, text)
  from public, anon, authenticated

revoke all on function public.rosetta_v2_normative_clauses(text)
  from public, anon, authenticated

revoke all on function public.rosetta_v2_validate_extraction(integer, text)
  from public, anon, authenticated

grant execute on function public.rosetta_v2_normalize_text(text) to service_role

grant execute on function public.rosetta_v2_section_spans(text) to service_role

grant execute on function public.rosetta_v2_modal_and_actor(text) to service_role

grant execute on function public.rosetta_v2_is_legislative_finding(text, text) to service_role

grant execute on function public.rosetta_v2_normative_clauses(text) to service_role

grant execute on function public.rosetta_v2_validate_extraction(integer, text) to service_role

with canonical_manifest as (
  select jsonb_build_object(
    'contract', 'S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS}',
    'engine_version', 'rosetta-v3-deterministic-sql-2.0.0',
    'rule_set_version', 'rosetta-five-layer-structural-correctness-2.0.0',
    'normalization', jsonb_build_object(
      'matching_whitespace', 'collapse_to_single_space',
      'source_receipt', 'exact_extracted_text_sha256',
      'source_bytes', 'external_sha256_receipt',
      'normalization_version', 'rosetta-normalize-whitespace-v2'
    ),
    'section_binding', jsonb_build_object(
      'rule', 'nearest preceding Sec. N. marker',
      'raw_blocks', 'root document plus immutable section spans',
      'offsets', 'zero_based_start_end'
    ),
    'workflow', jsonb_build_object(
      'modal_order', jsonb_build_array(
        'shall not', 'must not', 'may not', 'shall', 'must', 'may'
      ),
      'actor_rule', 'exact normalized prefix before modal, maximum 180 characters',
      'legislative_findings_excluded', jsonb_build_array(
        'the legislature finds',
        'the legislature recognizes',
        'may offer',
        'may influence',
        'may blur',
        'may create',
        'may lead',
        'may present'
      ),
      'reverse_coverage_window', jsonb_build_object(
        'before_modal_characters', 220,
        'after_modal_characters', 360
      )
    ),
    'overrides', jsonb_build_object(
      'conditional_prohibition', 'persist in overrides and workflow',
      'section_bound', true
    ),
    'definitions', jsonb_build_object(
      'section_bound', true,
      'exact_text', true
    ),
    'validation', jsonb_build_array(
      'workflow completeness',
      'modal polarity',
      'actor preservation',
      'section consistency',
      'five-layer coverage per section'
    ),
    'absence', 'Every section block receives all five coverage records.',
    'provenance', 'Every object references an immutable section block and extraction receipt.'
  ) as manifest_json
),
canonical_receipt as (
  select
    manifest_json,
    encode(digest(convert_to(manifest_json::text, 'UTF8'), 'sha256'), 'hex')
      as manifest_hash
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
  'rosetta-v3-deterministic-sql-2.0.0',
  'rosetta-five-layer-structural-correctness-2.0.0',
  manifest_hash,
  manifest_json,
  true
from canonical_receipt
on conflict (engine_version, rule_set_version) do update
set manifest_hash = excluded.manifest_hash,
    manifest_json = excluded.manifest_json,
    is_active = true

commit
