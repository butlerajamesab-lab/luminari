CREATE OR REPLACE FUNCTION public.rosetta_v2511_reclassify_amendment_structure(p_extraction_run_id integer, p_source_text text, p_source_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_run public.extraction_run%rowtype;
  v_document record;
  v_family text:=lower(coalesce(p_source_metadata->>'docket_document_family',''));
  v_operation record;
  v_operation_count integer:=0;
  v_block_id text;
  v_representation_id text;
  v_disposition text;
  v_prune jsonb;
begin
  select * into v_run from public.extraction_run where id=p_extraction_run_id for update;
  if not found then raise exception 'rosetta_v2511_extraction_run_not_found'; end if;
  select corpus_id,document_identifier into v_document from public.source_document where id=v_run.source_document_id;
  if v_family='' and v_run.source_content_id is not null then
    select lower(coalesce(source_metadata->>'docket_document_family','')) into v_family
    from public.source_document_content where source_content_id=v_run.source_content_id;
  end if;

  delete from public.rosetta_structural_representation where extraction_run_id=p_extraction_run_id;

  if v_family is distinct from 'amendment' then
    return jsonb_build_object('contract','rosetta-amendment-structural-representation-v2511','document_family',nullif(v_family,''),'applied',false,'representation_count',0);
  end if;

  v_disposition:=public.rosetta_v2511_amendment_disposition(p_source_text,p_source_metadata);
  v_prune:=public.rosetta_v24_prune_amendment_projection(p_extraction_run_id);

  for v_operation in select * from public.rosetta_v2511_amendment_operations(p_source_text) order by operation_ordinal loop
    v_operation_count:=v_operation_count+1;
    v_block_id:='blk-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-amend-'||lpad(v_operation.operation_ordinal::text,4,'0');
    v_representation_id:='sr-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-amend-'||lpad(v_operation.operation_ordinal::text,4,'0');

    update public.hr1_raw_blocks
       set block_content_hash=encode(digest(convert_to(v_operation.operation_text,'UTF8'),'sha256'),'hex'),
           char_offset_start=v_operation.char_offset_start,
           char_offset_end=v_operation.char_offset_end
     where id=v_block_id and extraction_run_id=p_extraction_run_id;
    if not found then raise exception using errcode='22000',message='rosetta_v2511_amendment_operation_block_missing',detail=v_block_id; end if;

    insert into public.rosetta_structural_representation(
      id,corpus_id,source_document_id,extraction_run_id,source_block_id,
      representation_type,representation_json,confidence,signal_status
    ) values (
      v_representation_id,v_document.corpus_id,v_run.source_document_id,p_extraction_run_id,v_block_id,
      'source_stated_amendment_operation',
      jsonb_build_object(
        'operation_ordinal',v_operation.operation_ordinal,
        'operation_kind',v_operation.operation_kind,
        'target_locator',v_operation.target_locator,
        'operation_text',v_operation.operation_text,
        'amendment_disposition',v_disposition,
        'operative_effect_applied',false,
        'representation_scope','source_instruction'
      ),1.00,'confirmed'
    );
  end loop;

  if v_operation_count=0
     and public.rosetta_v2511_amendment_format(p_source_text) <> 'marked_full_text_reprint' then
    raise exception 'rosetta_v2511_amendment_structure_not_recognized';
  end if;

  insert into public.layer_coverage(
    id,extraction_run_id,source_block_id,layer_name,coverage_status,reason,validated_at
  )
  select
    'lc-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-nonop-'
      ||substr(encode(digest(convert_to(block.id,'UTF8'),'sha256'),'hex'),1,16)||'-'||lower(layer_name),
    p_extraction_run_id,
    block.id,
    layer_name,
    'not_applicable',
    'Source-stated amendment instruction is preserved as a non-operative structural representation. Rosetta does not apply the instruction to underlying law in this decomposition.',
    clock_timestamp()
  from public.hr1_raw_blocks block
  cross join unnest(array['HELP','WORKFLOW','ACCOUNTABILITY','OVERRIDES','DEFINITIONS']) layer_name
  where block.extraction_run_id=p_extraction_run_id
    and block.block_type in ('document','section','amendment_operation')
  on conflict(extraction_run_id,source_block_id,layer_name) do update
    set coverage_status=excluded.coverage_status,reason=excluded.reason,validated_at=excluded.validated_at;

  return jsonb_build_object(
    'contract','rosetta-amendment-structural-representation-v2511',
    'document_family','amendment','applied',true,'amendment_disposition',v_disposition,
    'representation_count',v_operation_count,'amendment_format',public.rosetta_v2511_amendment_format(p_source_text),'operative_layer_projection','not_applied',
    'coverage_block_scope','document_section_and_amendment_operation','prune_receipt',v_prune
  );
end;
$function$
