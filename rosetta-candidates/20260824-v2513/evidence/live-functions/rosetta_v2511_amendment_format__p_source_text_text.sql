CREATE OR REPLACE FUNCTION public.rosetta_v2511_amendment_format(p_source_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when exists (
      select 1
      from public.rosetta_v2510_amendment_operations(p_source_text)
    ) then 'operation_sheet'
    when p_source_text ~* 'the[[:space:]]+bill[[:space:]]+as[[:space:]]+proposed[[:space:]]+to[[:space:]]+be[[:space:]]+amended[[:space:]]+is[[:space:]]+reprinted[[:space:]]+as[[:space:]]+follows'
     and p_source_text ~* 'amendment[[:space:]]+instruction[[:space:]]+key'
      then 'marked_full_text_reprint'
    else 'unsupported'
  end;
$function$
