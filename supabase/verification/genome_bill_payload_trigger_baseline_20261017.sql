CREATE OR REPLACE FUNCTION public.try_register_docket_legislative_version_spine_from_genome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_source_bill_id integer;
begin
  v_source_bill_id := nullif(new.structural_dna_json ->> 'source_bill_id', '')::integer;
  if v_source_bill_id is null then return new; end if;
  if not exists (
    select 1
    from public.docket_bill_detail_cache cache
    where cache.bill_id = v_source_bill_id
  ) then
    return new;
  end if;

  perform public.register_docket_legislative_version_spine(v_source_bill_id, false);
  return new;
exception
  when invalid_text_representation then return new;
  when sqlstate 'P0002' then return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_civic_genome_lifecycle_from_bill_v3()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  source_bill_id integer;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if coalesce(new.structural_dna_json->>'source_bill_id', '') !~ '^[0-9]+$' then
    return new;
  end if;

  source_bill_id := (new.structural_dna_json->>'source_bill_id')::integer;
  perform public.sync_civic_genome_lifecycle_history_v3(source_bill_id);
  perform public.refresh_civic_genome_bill_temporal_projection_v2(
    new.genome_bill_id
  );
  return new;
end;
$function$;
