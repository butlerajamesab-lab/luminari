-- Crosswalk auto-enrichment trigger + ambiguity review queue
-- Applied directly to remote DB, captured here for version control

-- 1. Enrichment function: populates contact_rp and website_rp from crosswalk best matches
CREATE OR REPLACE FUNCTION public.apply_registry_program_crosswalk_enrichment(p_registry_program_id text DEFAULT NULL::text)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
declare
  v_updated_count integer := 0;
begin
  with eligible as (
    select
      x.registry_program_id,
      x.enrich_phone,
      x.enrich_website
    from public.registry_programs_crosswalk x
    where x.is_best_match = true
      and x.is_ambiguous = false
      and (p_registry_program_id is null or x.registry_program_id = p_registry_program_id)
  ), updated as (
    update public.registry_programs rp
    set
      contact_rp = coalesce(nullif(trim(rp.contact_rp), ''), e.enrich_phone),
      website_rp = coalesce(nullif(trim(rp.website_rp), ''), e.enrich_website)
    from eligible e
    where rp.id = e.registry_program_id
      and (
        (coalesce(nullif(trim(rp.contact_rp), ''), null) is null and e.enrich_phone is not null)
        or
        (coalesce(nullif(trim(rp.website_rp), ''), null) is null and e.enrich_website is not null)
      )
    returning 1
  )
  select count(*) into v_updated_count from updated;

  return v_updated_count;
end;
$function$;

-- 2. Trigger function: calls enrichment after writes to registry_programs
CREATE OR REPLACE FUNCTION public.trg_registry_programs_apply_crosswalk()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
begin
  perform public.apply_registry_program_crosswalk_enrichment(new.id);
  return new;
end;
$function$;

-- 3. Trigger: fires after INSERT or UPDATE of relevant columns
CREATE TRIGGER registry_programs_apply_crosswalk_after_ins_upd
  AFTER INSERT OR UPDATE OF name_rp, jurisdiction_id_rp, contact_rp, website_rp
  ON public.registry_programs
  FOR EACH ROW
  EXECUTE FUNCTION trg_registry_programs_apply_crosswalk();

-- 4. Review queue view: surfaces ambiguous best matches for manual resolution
CREATE OR REPLACE VIEW public.registry_programs_crosswalk_review_queue AS
  SELECT x.registry_program_id,
     rp.name_rp,
     rp.jurisdiction_id_rp,
     x.source_table,
     x.source_id,
     x.confidence_score,
     x.candidate_count,
     x.enrich_phone,
     x.enrich_website,
     x.mapping_method,
     x.updated_at AS crosswalk_updated_at
    FROM registry_programs_crosswalk x
      JOIN registry_programs rp ON rp.id = x.registry_program_id
   WHERE x.is_best_match = true AND x.is_ambiguous = true;
