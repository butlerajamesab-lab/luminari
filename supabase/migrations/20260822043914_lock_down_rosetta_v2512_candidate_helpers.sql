begin

revoke all on function public.rosetta_v2512_amendment_disposition(text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2512_amendment_format(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_amendment_operations(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_canonical_output(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2512_clean_amendment_operation_text(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_exact_definition_text(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_final_coverage(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2512_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2512_layout_projection(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_locate_normalized_text_occurrence(text,text,integer) from public,anon,authenticated

revoke all on function public.rosetta_v2512_normalized_occurrence_count(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_normative_clauses(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_projected_contains(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_reclassify_amendment_structure(integer,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2512_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2512_refresh_final_coverage_receipts(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2512_refresh_object_source_spans(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_section_spans(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_validate_extraction_core(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_validate_extraction(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v2512_base(integer,text,text,text,text,text,text,text,date,text,jsonb)
  from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v2512_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)
  from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v2512_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)
  from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v2512_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)
  to service_role

commit
