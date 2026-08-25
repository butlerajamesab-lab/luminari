CREATE OR REPLACE FUNCTION public.rosetta_normalize_clause_text(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select trim(regexp_replace(
    regexp_replace(
      lower(p_text),
      '^\s*[0-9]+(?:\s+and\s+[0-9]+)?\s+c\s+[0-9]+\s+s\s+[0-9]+\s+(?:is|are)\s+(?:each\s+)?amended\s+to\s+read\s+as\s+follows:\s*',
      '',
      'i'
    ),
    '\s+',
    ' ',
    'g'
  ));
$function$
