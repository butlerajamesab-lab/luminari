CREATE OR REPLACE FUNCTION public.rosetta_v2_is_legislative_finding(p_clause text, p_modal text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when lower(public.rosetta_v2_normalize_text(p_clause))
      like '%the legislature finds%'
      or lower(public.rosetta_v2_normalize_text(p_clause))
      like '%the legislature recognizes%'
      then true
    when lower(p_modal) <> 'may' then false
    else lower(public.rosetta_v2_normalize_text(p_clause))
      ~ '\m(may offer|may influence|may blur|may create|may lead|may present)\M'
  end;
$function$
