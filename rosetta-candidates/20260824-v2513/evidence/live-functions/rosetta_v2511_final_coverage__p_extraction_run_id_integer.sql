CREATE OR REPLACE FUNCTION public.rosetta_v2511_final_coverage(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(jsonb_object_agg(
    lower(layer.layer_name),
    jsonb_build_object('status',layer.coverage_status,'reason',layer.reason,'validated_at',layer.validated_at)
    order by layer.layer_name
  ),'{}'::jsonb)
  from (
    select coverage.layer_name,
      case when bool_or(coverage.coverage_status='extraction_failed') then 'extraction_failed'
           when bool_or(coverage.coverage_status='pending_extraction') then 'pending_extraction'
           when bool_or(coverage.coverage_status='populated') then 'populated'
           else 'not_applicable' end as coverage_status,
      string_agg(distinct coverage.reason,' | ' order by coverage.reason) filter(where coverage.reason is not null) as reason,
      max(coverage.validated_at) as validated_at
    from public.layer_coverage coverage
    where coverage.extraction_run_id=p_extraction_run_id
    group by coverage.layer_name
  ) layer;
$function$
