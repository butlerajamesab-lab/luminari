-- Civic Genome authoritative stage-rank correction v2
--
-- Stage rank is a mutable ordering projection, not version identity. Version
-- fingerprints do not include stage_rank. Preserve all source/version rows and
-- immutable observations; correct only the current ordering metadata so an
-- unclassified text or amendment can never outrank Enrolled/Chaptered law.

create or replace function public.docket_legislative_stage_rank(p_version_type text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $function$
  select case lower(coalesce(p_version_type, ''))
    when 'introduced' then 100
    when 'committee_substitute' then 200
    when 'house_amendment' then 250
    when 'engrossed' then 300
    when 'senate_amendment' then 350
    when 'other_text' then 375
    when 'other_amendment' then 375
    when 'enrolled' then 400
    when 'chaptered' then 500
    else 0
  end;
$function$;

update public.docket_bill_source_document document
   set stage_rank = public.docket_legislative_stage_rank(document.normalized_version_type),
       latest_metadata = case
         when jsonb_typeof(document.latest_metadata) = 'object'
           then jsonb_set(
             document.latest_metadata,
             '{stage_rank}',
             to_jsonb(public.docket_legislative_stage_rank(document.normalized_version_type)),
             true
           )
         else document.latest_metadata
       end,
       updated_at = now()
 where document.stage_rank is distinct from public.docket_legislative_stage_rank(document.normalized_version_type);

update public.civic_genome_bill_version version
   set stage_rank = public.docket_legislative_stage_rank(version.version_type),
       updated_at = now()
 where version.stage_rank is distinct from public.docket_legislative_stage_rank(version.version_type);

comment on function public.docket_legislative_stage_rank(text) is
  'Civic Genome authority/stage ordering. Unknown text/amendment remains below known Enrolled/Chaptered final states; unknown fallback never outranks known legislative stages.';
