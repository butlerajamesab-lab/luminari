CREATE OR REPLACE FUNCTION public.rosetta_v25_register_span_repairs(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_open integer;
begin
  insert into public.rosetta_structural_repair_queue(
    extraction_run_id,source_document_id,object_type,object_id,defect_type,defect_detail,repair_state
  )
  select span.extraction_run_id,span.source_document_id,span.object_type,span.object_id,
         case when span.span_status='ambiguous' then 'source_span_ambiguous' else 'source_span_unresolved' end,
         jsonb_build_object('source_block_id',span.source_block_id,'normalized_text',span.normalized_text,'span_status',span.span_status),'open'
  from public.rosetta_object_source_span span
  where span.extraction_run_id=p_extraction_run_id and span.span_status<>'resolved'
  on conflict(object_type,object_id,defect_type) do update
    set defect_detail=excluded.defect_detail,repair_state='open',resolved_at=null;

  update public.rosetta_structural_repair_queue repair
     set repair_state='resolved',resolved_at=now()
    from public.rosetta_object_source_span span
   where repair.extraction_run_id=p_extraction_run_id
     and repair.object_type=span.object_type
     and repair.object_id=span.object_id
     and repair.defect_type in ('source_span_ambiguous','source_span_unresolved')
     and span.span_status='resolved'
     and repair.repair_state<>'resolved';
  select public.rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_open;
  return jsonb_build_object('contract','rosetta-span-repair-registration-v25','extraction_run_id',p_extraction_run_id,'blocking_repair_count',v_open);
end;
$function$
