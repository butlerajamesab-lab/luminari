begin

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
        '(?i)([^.;]{0,220}\m(shall not|must not|may not|shall|must|may)\M[^.;]*[.;])',
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

update public.extraction_rule_manifest
set manifest_json = jsonb_set(
      manifest_json,
      '{workflow,reverse_coverage_window,after_modal_characters}',
      '"through clause terminator"'::jsonb,
      true
    ),
    manifest_hash = encode(
      digest(
        convert_to(
          jsonb_set(
            manifest_json,
            '{workflow,reverse_coverage_window,after_modal_characters}',
            '"through clause terminator"'::jsonb,
            true
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
where engine_version = 'rosetta-v3-deterministic-sql-2.0.0'
  and rule_set_version = 'rosetta-five-layer-structural-correctness-2.0.0'

commit
