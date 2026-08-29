begin;

create or replace function pg_temp.publish_compatibility_view(
  source_name text,
  target_name text,
  view_definition text
)
returns void
language plpgsql
as $function$
declare
  source_kind "char";
  target_kind "char";
begin
  select c.relkind
    into source_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = source_name;

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = target_name;

  if source_kind in ('v', 'm')
     and (target_kind is null or target_kind = 'v') then
    execute view_definition;
  end if;
end
$function$;

select pg_temp.publish_compatibility_view(
  'v_luminari_resource_source_candidates',
  'v_luminari_resource_dry_run_promotion_summary',
  $view$
create or replace view public.v_luminari_resource_dry_run_promotion_summary as
with base as (
  select
    source_table,
    source_pk,
    resource_name,
    resource_type,
    jurisdiction,
    state,
    city,
    eligibility_summary,
    apply_notes,
    phone,
    email,
    website_url,
    address_line1,
    source_hash,
    lower(regexp_replace(coalesce(resource_name,''), '[^a-z0-9]+', '', 'g')) as normalized_name_key,
    lower(regexp_replace(coalesce(jurisdiction,''), '[^a-z0-9]+', '', 'g')) as normalized_jurisdiction_key
  from public.v_luminari_resource_source_candidates
), scored as (
  select
    *,
    case when nullif(resource_name,'') is not null then 1 else 0 end as has_name,
    case when nullif(phone,'') is not null then 1 else 0 end as has_phone,
    case when nullif(email,'') is not null then 1 else 0 end as has_email,
    case when nullif(website_url,'') is not null then 1 else 0 end as has_website,
    case when nullif(address_line1,'') is not null then 1 else 0 end as has_address,
    case when nullif(eligibility_summary,'') is not null then 1 else 0 end as has_eligibility,
    case when nullif(apply_notes,'') is not null then 1 else 0 end as has_apply_notes,
    count(*) over (partition by normalized_name_key, normalized_jurisdiction_key) as duplicate_name_jurisdiction_count
  from base
)
select
  source_table,
  count(*) as source_rows,
  count(*) filter (where has_name = 1) as promotable_entity_candidates,
  count(*) filter (where has_phone = 1 or has_email = 1 or has_website = 1) as rows_with_contact_surface,
  sum(has_phone + has_email + has_website)::bigint as contact_points_would_create,
  count(*) filter (where has_address = 1) as rows_with_address,
  count(*) filter (where has_eligibility = 1) as rows_with_eligibility,
  count(*) filter (where has_apply_notes = 1) as rows_with_apply_notes,
  count(*) filter (where duplicate_name_jurisdiction_count > 1 and normalized_name_key <> '') as possible_duplicate_rows,
  count(*) filter (where has_name = 0) as blocked_missing_name,
  count(*) filter (where has_phone = 0 and has_email = 0 and has_website = 0) as blocked_missing_contact_surface,
  count(*) filter (where has_address = 0) as location_enrichment_needed
from scored
group by source_table
order by source_table
$view$);

select pg_temp.publish_compatibility_view(
  'v_luminari_resource_source_candidates',
  'v_luminari_resource_dry_run_blockers',
  $view$
create or replace view public.v_luminari_resource_dry_run_blockers as
select
  source_table,
  source_pk,
  resource_name,
  jurisdiction,
  array_remove(array[
    case when nullif(resource_name,'') is null then 'missing_name' end,
    case when nullif(phone,'') is null and nullif(email,'') is null and nullif(website_url,'') is null then 'missing_contact_surface' end,
    case when nullif(address_line1,'') is null then 'missing_address_or_location' end,
    case when nullif(eligibility_summary,'') is null then 'missing_eligibility' end,
    case when nullif(apply_notes,'') is null then 'missing_apply_notes' end
  ], null) as blockers
from public.v_luminari_resource_source_candidates
where nullif(resource_name,'') is null
   or (nullif(phone,'') is null and nullif(email,'') is null and nullif(website_url,'') is null)
   or nullif(address_line1,'') is null
   or nullif(eligibility_summary,'') is null
   or nullif(apply_notes,'') is null
$view$);

select pg_temp.publish_compatibility_view(
  'v_luminari_resource_source_candidates',
  'v_luminari_resource_possible_duplicates',
  $view$
create or replace view public.v_luminari_resource_possible_duplicates as
with keyed as (
  select
    source_table,
    source_pk,
    resource_name,
    jurisdiction,
    phone,
    website_url,
    lower(regexp_replace(coalesce(resource_name,''), '[^a-z0-9]+', '', 'g')) as normalized_name_key,
    lower(regexp_replace(coalesce(jurisdiction,''), '[^a-z0-9]+', '', 'g')) as normalized_jurisdiction_key
  from public.v_luminari_resource_source_candidates
)
select
  normalized_name_key,
  normalized_jurisdiction_key,
  count(*) as duplicate_count,
  array_agg(source_table || ':' || source_pk order by source_table, source_pk) as source_refs,
  array_agg(distinct resource_name) as observed_names,
  array_agg(distinct jurisdiction) as observed_jurisdictions
from keyed
where normalized_name_key <> ''
group by normalized_name_key, normalized_jurisdiction_key
having count(*) > 1
order by duplicate_count desc, normalized_name_key
$view$);

select pg_temp.publish_compatibility_view(
  'v_luminari_legal_source_candidates',
  'v_luminari_legal_dry_run_promotion_summary',
  $view$
create or replace view public.v_luminari_legal_dry_run_promotion_summary as
with base as (
  select
    source_table,
    authority_type,
    source_pk,
    citation,
    title,
    jurisdiction,
    source_url,
    statute_of_limitations,
    verification_status,
    lower(regexp_replace(coalesce(citation,''), '[^a-z0-9]+', '', 'g')) as normalized_citation_key,
    lower(regexp_replace(coalesce(title,''), '[^a-z0-9]+', '', 'g')) as normalized_title_key,
    lower(regexp_replace(coalesce(jurisdiction,''), '[^a-z0-9]+', '', 'g')) as normalized_jurisdiction_key
  from public.v_luminari_legal_source_candidates
), scored as (
  select
    *,
    case when nullif(citation,'') is not null then 1 else 0 end as has_citation,
    case when nullif(title,'') is not null then 1 else 0 end as has_title,
    case when nullif(jurisdiction,'') is not null then 1 else 0 end as has_jurisdiction,
    case when nullif(source_url,'') is not null then 1 else 0 end as has_source_url,
    case when nullif(statute_of_limitations,'') is not null then 1 else 0 end as has_sol,
    count(*) over (partition by authority_type, normalized_citation_key, normalized_jurisdiction_key) as duplicate_citation_jurisdiction_count
  from base
)
select
  source_table,
  authority_type,
  count(*) as source_rows,
  count(*) filter (where has_citation = 1 or has_title = 1) as promotable_legal_candidates,
  count(*) filter (where has_citation = 1) as rows_with_citation,
  count(*) filter (where has_jurisdiction = 1) as rows_with_jurisdiction,
  count(*) filter (where has_source_url = 1) as rows_with_source_url,
  count(*) filter (where has_sol = 1) as rows_with_sol_or_deadline,
  count(*) filter (where duplicate_citation_jurisdiction_count > 1 and normalized_citation_key <> '') as possible_duplicate_rows,
  count(*) filter (where has_citation = 0 and has_title = 0) as blocked_missing_identifier,
  count(*) filter (where has_jurisdiction = 0) as blocked_missing_jurisdiction
from scored
group by source_table, authority_type
order by source_table, authority_type
$view$);

select pg_temp.publish_compatibility_view(
  'v_luminari_legal_source_candidates',
  'v_luminari_legal_dry_run_blockers',
  $view$
create or replace view public.v_luminari_legal_dry_run_blockers as
select
  source_table,
  authority_type,
  source_pk,
  citation,
  title,
  jurisdiction,
  array_remove(array[
    case when nullif(citation,'') is null and nullif(title,'') is null then 'missing_citation_or_title' end,
    case when nullif(jurisdiction,'') is null then 'missing_jurisdiction' end,
    case when nullif(source_url,'') is null then 'missing_source_url' end,
    case when authority_type in ('statute','deadline_rule','enforcement_channel','enforcement_record') and nullif(statute_of_limitations,'') is null then 'missing_sol_or_deadline' end
  ], null) as blockers
from public.v_luminari_legal_source_candidates
where (nullif(citation,'') is null and nullif(title,'') is null)
   or nullif(jurisdiction,'') is null
   or nullif(source_url,'') is null
   or (authority_type in ('statute','deadline_rule','enforcement_channel','enforcement_record') and nullif(statute_of_limitations,'') is null)
$view$);

select pg_temp.publish_compatibility_view(
  'v_luminari_legal_source_candidates',
  'v_luminari_legal_possible_duplicates',
  $view$
create or replace view public.v_luminari_legal_possible_duplicates as
with keyed as (
  select
    source_table,
    authority_type,
    source_pk,
    citation,
    title,
    jurisdiction,
    lower(regexp_replace(coalesce(citation,''), '[^a-z0-9]+', '', 'g')) as normalized_citation_key,
    lower(regexp_replace(coalesce(jurisdiction,''), '[^a-z0-9]+', '', 'g')) as normalized_jurisdiction_key
  from public.v_luminari_legal_source_candidates
)
select
  authority_type,
  normalized_citation_key,
  normalized_jurisdiction_key,
  count(*) as duplicate_count,
  array_agg(source_table || ':' || source_pk order by source_table, source_pk) as source_refs,
  array_agg(distinct citation) as observed_citations,
  array_agg(distinct title) as observed_titles,
  array_agg(distinct jurisdiction) as observed_jurisdictions
from keyed
where normalized_citation_key <> ''
group by authority_type, normalized_citation_key, normalized_jurisdiction_key
having count(*) > 1
order by duplicate_count desc, authority_type, normalized_citation_key
$view$);

create table if not exists public.luminari_registry_fixture_plan (
  fixture_key text primary key,
  state_code text,
  document_name text not null,
  family_key text references public.luminari_document_family_contracts(family_key),
  fixture_role text not null,
  expected_object_classes text[] not null,
  status text not null default 'planned',
  notes text,
  created_at timestamptz not null default now()
);

insert into public.luminari_registry_fixture_plan (
  fixture_key,
  state_code,
  document_name,
  family_key,
  fixture_role,
  expected_object_classes,
  notes
)
values
('mi_state_registry_fixture','MI','luminari-michigan-registry-1.docx','general_state_registry','three_point_registry_fixture',array['state_metadata','layer0_policy_flags','resource_cards','contact_points','eligibility_rules','apply_notes','jurisdiction_overlays','tribal_context','workflow_bindings','deadline_rules','legal_authorities','oversight_bodies','provenance_spans'],'Michigan tests Great Lakes/tribal/Detroit/UP complexity and state benefit/labor routing.'),
('il_state_registry_fixture','IL','luminari-illinois-registry-1.docx','general_state_registry','three_point_registry_fixture',array['state_metadata','layer0_policy_flags','resource_cards','contact_points','eligibility_rules','apply_notes','jurisdiction_overlays','workflow_bindings','deadline_rules','legal_authorities','oversight_bodies','provenance_spans'],'Illinois tests strong labor/civil-rights state, Chicago/Cook overlays, and urban AI/AN context.'),
('wi_state_registry_fixture','WI','luminari-wisconsin-registry.docx','general_state_registry','three_point_registry_fixture',array['state_metadata','layer0_policy_flags','resource_cards','contact_points','eligibility_rules','apply_notes','jurisdiction_overlays','tribal_context','workflow_bindings','deadline_rules','legal_authorities','oversight_bodies','provenance_spans'],'Wisconsin tests nontraditional BadgerCare routing, Milwaukee/Fox Valley overlays, and tribal treaty-rights context.'),
('sol_collision_logic_fixture',null,'luminari-sol-collision (1).docx','sol_collision_reference','logic_pole_fixture',array['collision_scenarios','forum_deadlines','trigger_dates','tolling_rules','preclusion_rules','preservation_strategies','common_pitfalls','provenance_spans'],'Tests multi-forum deadline collision, preclusion, tolling, and protective filing logic.'),
('gap_playbook_logic_fixture',null,'luminari-gap-playbook-2.docx','gap_playbook','logic_pole_fixture',array['gap_state_profiles','gap_populations','fallback_routes','no_size_minimum_routes','emergency_protocol_steps','private_bar_referral_rules','friction_flags','provenance_spans'],'Tests no-remedy fallback routing, small-employer gaps, civil-rights gap states, and emergency protocols.'),
('benefits_cascade_logic_fixture',null,'Benefits Cascade Map','benefits_cascade_map','logic_pole_fixture',array['cascade_scenarios','cascade_stages','stage_rights','stage_agencies','intervention_points','pipeline_routes','deadline_rules','overlay_rules','provenance_spans'],'Tests cross-pipeline cascade routing where one presenting problem implies concurrent employment, benefits, housing, health, DV, immigration, and legal paths.')
on conflict (fixture_key) do update set
  state_code = excluded.state_code,
  document_name = excluded.document_name,
  family_key = excluded.family_key,
  fixture_role = excluded.fixture_role,
  expected_object_classes = excluded.expected_object_classes,
  status = 'planned',
  notes = excluded.notes;

create or replace view public.v_luminari_registry_fixture_plan as
select * from public.luminari_registry_fixture_plan
order by fixture_role, state_code, document_name;

create or replace view public.v_luminari_fixture_sets as
select
  fixture_role,
  count(*) as fixture_count,
  array_agg(document_name order by coalesce(state_code,''), document_name) as documents,
  array_agg(family_key order by coalesce(state_code,''), document_name) as families
from public.luminari_registry_fixture_plan
group by fixture_role
order by fixture_role;

commit;
