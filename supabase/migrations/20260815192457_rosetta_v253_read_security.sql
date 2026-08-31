begin

revoke execute on function public.rosetta_open_structural_repair_count(integer) from anon,authenticated

revoke execute on function public.rosetta_blocking_structural_repair_count(integer) from anon,authenticated

revoke execute on function public.rosetta_v25_span_json(text,text,jsonb) from anon,authenticated

revoke execute on function public.rosetta_v25_enrich_objects_with_spans(integer,jsonb) from anon,authenticated

grant execute on function public.rosetta_open_structural_repair_count(integer) to service_role

grant execute on function public.rosetta_blocking_structural_repair_count(integer) to service_role

grant execute on function public.rosetta_v25_span_json(text,text,jsonb) to service_role

grant execute on function public.rosetta_v25_enrich_objects_with_spans(integer,jsonb) to service_role

revoke select on public.v_civic_genome_law_view_v1 from anon,authenticated

grant select on public.v_civic_genome_law_view_v1 to service_role

comment on view public.v_civic_genome_law_view_v1 is 'Service-role Rosetta/Civic Genome handoff view. Canonical decomposition and exact-span enrichment are internal Rosetta concerns; downstream services consume the resulting bounded contract through service-role credentials.'

commit
