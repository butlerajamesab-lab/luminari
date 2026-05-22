-- Fix P1 issues identified by Codex review on PR #18
-- 1. Restrict SECURITY DEFINER function execution to prevent write-escalation
-- 2. Guard against empty-string recursion in enrichment predicate

-- ============================================================
-- FIX 1: Revoke direct execution of the enrichment function
-- Only the trigger function (which runs as SECURITY DEFINER) should call it.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.apply_registry_program_crosswalk_enrichment(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.apply_registry_program_crosswalk_enrichment(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_registry_program_crosswalk_enrichment(text) FROM authenticated;

-- ============================================================
-- FIX 2: Replace the enrichment function with empty-string guard
-- Prevents infinite trigger recursion when crosswalk contains ''
-- ============================================================
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
      -- Guard: reject empty strings as valid enrichment values
      and (nullif(trim(x.enrich_phone), '') is not null or nullif(trim(x.enrich_website), '') is not null)
  ), updated as (
    update public.registry_programs rp
    set
      contact_rp = coalesce(nullif(trim(rp.contact_rp), ''), nullif(trim(e.enrich_phone), '')),
      website_rp = coalesce(nullif(trim(rp.website_rp), ''), nullif(trim(e.enrich_website), ''))
    from eligible e
    where rp.id = e.registry_program_id
      and (
        (coalesce(nullif(trim(rp.contact_rp), ''), null) is null and nullif(trim(e.enrich_phone), '') is not null)
        or
        (coalesce(nullif(trim(rp.website_rp), ''), null) is null and nullif(trim(e.enrich_website), '') is not null)
      )
    returning 1
  )
  select count(*) into v_updated_count from updated;

  return v_updated_count;
end;
$function$;

-- Re-apply REVOKE after CREATE OR REPLACE (which resets privileges)
REVOKE EXECUTE ON FUNCTION public.apply_registry_program_crosswalk_enrichment(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.apply_registry_program_crosswalk_enrichment(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_registry_program_crosswalk_enrichment(text) FROM authenticated;
