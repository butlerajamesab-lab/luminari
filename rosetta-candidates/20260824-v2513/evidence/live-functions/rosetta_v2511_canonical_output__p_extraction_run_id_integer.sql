CREATE OR REPLACE FUNCTION public.rosetta_v2511_canonical_output(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with base as (
    select public.rosetta_v254_canonical_output(p_extraction_run_id) as value
  ),
  structural as (
    select coalesce(law.structural_representations,'[]'::jsonb) as value
    from public.v_rosetta_operator_law_view_v1 law
    where law.extraction_run_id=p_extraction_run_id
  ),
  counts as (
    select count(*)::integer as structural_count
    from public.rosetta_structural_representation representation
    where representation.extraction_run_id=p_extraction_run_id
  )
  select case when base.value is null then null else
    base.value || jsonb_build_object(
      'contract','rosetta-canonical-law-view-v2511',
      'handoff_contract_version','rosetta-civic-genome-handoff-v2',
      'structural_representations',coalesce(structural.value,'[]'::jsonb),
      'row_counts',coalesce(base.value->'row_counts','{}'::jsonb)
        || jsonb_build_object('structural_representations',counts.structural_count)
    ) end
  from base
  left join structural on true
  cross join counts;
$function$
