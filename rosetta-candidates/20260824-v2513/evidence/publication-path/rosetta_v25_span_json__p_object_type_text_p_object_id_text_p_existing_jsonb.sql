CREATE OR REPLACE FUNCTION public.rosetta_v25_span_json(p_object_type text, p_object_id text, p_existing jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select case when span.object_id is null or span.span_status<>'resolved' then coalesce(p_existing,'{}'::jsonb)
 else coalesce(p_existing,'{}'::jsonb)||jsonb_build_object('char_offset_start',span.source_offset_start,'char_offset_end',span.source_offset_end,'raw_text_hash',span.raw_text_hash,'projection_version',span.projection_version,'span_status',span.span_status) end
 from (select 1) anchor left join public.rosetta_object_source_span span on span.object_type=p_object_type and span.object_id=p_object_id;
$function$
