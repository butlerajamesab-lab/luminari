CREATE OR REPLACE FUNCTION public.rosetta_v25_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_normalized text; v_match text[];
begin
  v_normalized:=public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(p_clause));
  v_normalized:=regexp_replace(v_normalized,'^(?:\([a-z0-9]+\)\s*)+','','i');
  v_normalized:=regexp_replace(v_normalized,'^\d+[.)]\s*','');
  v_match:=regexp_match(v_normalized,'(?i)^(.+?)\s+(shall|must|may)\s+not\M');
  if v_match is not null then return query select lower(v_match[2]||' not'),nullif(btrim(v_match[1],E' \t\r\n,;:'),''); return; end if;
  v_match:=regexp_match(v_normalized,'(?i)^(.+?)\s+(shall|must|may)\M');
  if v_match is null then return query select null::text,null::text; return; end if;
  return query select lower(v_match[2]),nullif(btrim(v_match[1],E' \t\r\n,;:'),'');
end;
$function$
