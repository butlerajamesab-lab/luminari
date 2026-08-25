CREATE OR REPLACE FUNCTION public.rosetta_v25_protect_internal_periods(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result text := p_value;
  v_index integer;
  v_marker text := chr(57344);
begin
  if char_length(p_value) < 3 then return p_value; end if;
  for v_index in 2..char_length(p_value) - 1 loop
    if substr(p_value, v_index, 1) = '.' and public.rosetta_v25_is_internal_period(p_value, v_index) then
      v_result := overlay(v_result placing v_marker from v_index for 1);
    end if;
  end loop;
  return v_result;
end;
$function$
