CREATE OR REPLACE FUNCTION public.rosetta_v2511_clean_amendment_operation_text(p_operation_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_text text := p_operation_text;
  v_next text;
begin
  loop
    v_next := regexp_replace(
      v_text,
      '[[:space:]]*(--[[:space:]]*[0-9]+[[:space:]]+of[[:space:]]+[0-9]+[[:space:]]*--|Page[[:space:]]+[0-9]+[[:space:]]+of[[:space:]]+[0-9]+)[[:space:]]*$',
      '',
      'i'
    );
    exit when v_next = v_text;
    v_text := v_next;
  end loop;
  return rtrim(v_text);
end;
$function$
