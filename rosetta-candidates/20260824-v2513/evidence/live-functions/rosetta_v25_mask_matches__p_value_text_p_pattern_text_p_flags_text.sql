CREATE OR REPLACE FUNCTION public.rosetta_v25_mask_matches(p_value text, p_pattern text, p_flags text DEFAULT 'n'::text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_result text := p_value;
  v_search_start integer := 1;
  v_start integer;
  v_end integer;
  v_segment text;
  v_mask text;
begin
  loop
    v_start := regexp_instr(v_result, p_pattern, v_search_start, 1, 0, p_flags);
    exit when v_start = 0;
    v_end := regexp_instr(v_result, p_pattern, v_search_start, 1, 1, p_flags);
    exit when v_end <= v_start;
    v_segment := substr(v_result, v_start, v_end - v_start);
    v_mask := regexp_replace(v_segment, '[^\n\r]', ' ', 'g');
    v_result := overlay(v_result placing v_mask from v_start for v_end - v_start);
    v_search_start := v_end;
  end loop;
  return v_result;
end;
$function$
