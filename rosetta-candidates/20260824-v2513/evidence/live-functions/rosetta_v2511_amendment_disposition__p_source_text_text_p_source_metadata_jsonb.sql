CREATE OR REPLACE FUNCTION public.rosetta_v2511_amendment_disposition(p_source_text text, p_source_metadata jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_metadata_disposition text;
  v_source_disposition text;
begin
  if jsonb_typeof(coalesce(p_source_metadata,'{}'::jsonb)->'docket_adopted')='boolean' then
    v_metadata_disposition:=case when (p_source_metadata->>'docket_adopted')::boolean then 'adopted' else 'not_adopted' end;
  elsif jsonb_typeof(coalesce(p_source_metadata,'{}'::jsonb)#>'{registered_metadata,adopted}')='boolean' then
    v_metadata_disposition:=case when (p_source_metadata#>>'{registered_metadata,adopted}')::boolean then 'adopted' else 'not_adopted' end;
  end if;

  if p_source_text ~* E'(^|\\r?\\n)[ \\t]*NOT[ \\t]+ADOPTED[ \\t]*(\\r?\\n|$)' then
    v_source_disposition:='not_adopted';
  elsif p_source_text ~* E'(^|\\r?\\n)[ \\t]*ADOPTED[ \\t]*(\\r?\\n|$)' then
    v_source_disposition:='adopted';
  end if;

  if v_metadata_disposition is not null
     and v_source_disposition is not null
     and v_metadata_disposition<>v_source_disposition then
    raise exception using
      errcode='22000',
      message='rosetta_v2511_amendment_disposition_conflict',
      detail=jsonb_build_object(
        'metadata_disposition',v_metadata_disposition,
        'source_status_line_disposition',v_source_disposition
      )::text;
  end if;

  return coalesce(v_metadata_disposition,v_source_disposition,'unknown');
end;
$function$
