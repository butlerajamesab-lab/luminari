CREATE OR REPLACE FUNCTION public.rosetta_v2511_amendment_operations(p_source_text text)
 RETURNS TABLE(operation_ordinal integer, operation_text text, target_locator text, operation_kind text, char_offset_start integer, char_offset_end integer)
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    operation.operation_ordinal,
    public.rosetta_v2511_clean_amendment_operation_text(operation.operation_text) as operation_text,
    operation.target_locator,
    operation.operation_kind,
    operation.char_offset_start,
    operation.char_offset_start
      + char_length(public.rosetta_v2511_clean_amendment_operation_text(operation.operation_text)) as char_offset_end
  from public.rosetta_v24_amendment_operations(p_source_text) operation
  where nullif(btrim(public.rosetta_v2511_clean_amendment_operation_text(operation.operation_text)), '') is not null
  order by operation.operation_ordinal;
$function$
