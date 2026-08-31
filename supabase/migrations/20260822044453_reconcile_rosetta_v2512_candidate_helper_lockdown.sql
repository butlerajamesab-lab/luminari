do $lockdown$
declare
  v_signature text;
  v_candidate_signature constant text :=
    'public.run_rosetta_v3_extraction_v2512_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)';
begin
  foreach v_signature in array array[
    'public.rosetta_v2512_amendment_disposition(text,jsonb)',
    'public.rosetta_v2512_amendment_format(text)',
    'public.rosetta_v2512_amendment_operations(text)',
    'public.rosetta_v2512_canonical_output(integer)',
    'public.rosetta_v2512_clean_amendment_operation_text(text)',
    'public.rosetta_v2512_exact_definition_text(text,text)',
    'public.rosetta_v2512_final_coverage(integer)',
    'public.rosetta_v2512_finalize_extraction(integer,text,jsonb,jsonb)',
    'public.rosetta_v2512_layout_projection(text)',
    'public.rosetta_v2512_locate_normalized_text_occurrence(text,text,integer)',
    'public.rosetta_v2512_normalized_occurrence_count(text,text)',
    'public.rosetta_v2512_normative_clauses(text)',
    'public.rosetta_v2512_projected_contains(text,text)',
    'public.rosetta_v2512_reclassify_amendment_structure(integer,text,jsonb)',
    'public.rosetta_v2512_reconcile_structural_correctness(integer)',
    'public.rosetta_v2512_refresh_final_coverage_receipts(integer)',
    'public.rosetta_v2512_refresh_object_source_spans(integer,text)',
    'public.rosetta_v2512_section_spans(text)',
    'public.rosetta_v2512_validate_extraction_core(integer,text)',
    'public.rosetta_v2512_validate_extraction(integer,text)',
    'public.rosetta_v2512_validate_independent_structure(integer,text)',
    'public.run_rosetta_v3_extraction_v2512_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v2512_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    v_candidate_signature
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      execute 'revoke all on function ' || v_signature || ' from public,anon,authenticated';
    end if;
  end loop;

  foreach v_signature in array array[
    'public.run_rosetta_v3_extraction_v2512_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v2512_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      execute 'revoke all on function ' || v_signature || ' from service_role';
    end if;
  end loop;

  if to_regprocedure(v_candidate_signature) is not null then
    execute 'grant execute on function ' || v_candidate_signature || ' to service_role';
  end if;
end
$lockdown$
