create or replace function public.reviewed_route_verification_is_positive_v1(status text)
returns boolean
language sql
immutable
parallel safe
as $$
  select upper(btrim(coalesce(status, ''))) = any (array[
    'CURRENT_OFFICIAL_CONTACT_VERIFIED',
    'CURRENT_OFFICIAL_ROUTE_INDEX_VERIFIED',
    'CURRENT_OFFICIAL_ROUTE_SEARCH_VERIFIED',
    'CURRENT_OFFICIAL_ROUTE_VERIFIED',
    'CURRENT_OFFICIAL_ROUTE_VERIFIED_2026-08-17',
    'CURRENT_OFFICIAL_ROUTE_VERIFIED_WITH_SCOPE_CAVEAT',
    'CURRENT_OFFICIAL_SUCCESSOR_ROUTE_VERIFIED',
    'CURRENT_OFFICIAL_SUCCESSOR_ROUTE_VERIFIED_2026-08-17',
    'CURRENT_OFFICIAL_TOOL_VERIFIED',
    'CURRENT_ORGANIZATION_ROUTE_VERIFIED',
    'CURRENT_PROGRAM_ROUTE_VERIFIED',
    'CURRENT_ROUTE_VERIFIED_2026-08-17',
    'CURRENT_TRACKER_ROUTE_VERIFIED',
    'OFFICIAL_ROUTE_SEARCH_VERIFIED_FETCH_BLOCKED',
    'SOURCE_DECLARED_VERIFIED_2026-07-22_OFFICIAL_DOMAIN_FETCH_BLOCKED',
    'SOURCE_DECLARED_VERIFIED_2026-07-24',
    'VERIFIED',
    'VERIFIED -- 2026-07-22',
    'VERIFIED -- 2026-08-17'
  ]::text[]);
$$;

comment on function public.reviewed_route_verification_is_positive_v1(text) is
  'Fail-closed allowlist for reviewed route verification statuses eligible for person-facing routing. Unknown/future/free-form statuses remain reference-only until explicitly governed.';

create or replace view public.v_ui_intake_routing_v1
with (security_invoker = true)
as
select
  r.action_key as route_key,
  r.issue_lens as category_key,
  r.situation_key as pipeline_key,
  r.jurisdiction_level,
  r.jurisdiction,
  r.state_code,
  r.action_kind,
  r.action_label,
  r.when_to_use,
  r.target_surface,
  r.alert_type,
  r.severity,
  r.deadline_summary,
  r.what_the_person_can_do,
  r.route_instructions,
  r.filing_or_complaint_url,
  r.phone,
  r.email,
  r.website,
  r.address,
  r.statutory_authority,
  r.verification_status,
  r.supporting_object_class,
  r.supporting_target_surface,
  r.direct_source_reference,
  r.statutory_authority_url,
  r.filing_deadline,
  r.filing_deadline_source,
  r.source_filename,
  r.source_content_sha256,
  r.source_record_id,
  r.source_page,
  (coalesce(r.filing_or_complaint_url,r.phone,r.email,r.website) is not null) as has_access_point,
  (
    public.reviewed_route_verification_is_positive_v1(r.verification_status)
    and coalesce(r.filing_or_complaint_url,r.phone,r.email,r.website) is not null
  ) as is_user_routable,
  case
    when public.reviewed_route_verification_is_positive_v1(r.verification_status)
      and coalesce(r.filing_or_complaint_url,r.phone,r.email,r.website) is not null then 'verified_routable'
    when public.reviewed_route_verification_is_positive_v1(r.verification_status) then 'verified_reference_only'
    when upper(btrim(coalesce(r.verification_status,'')))='PARTIAL' then 'partial_review'
    when upper(btrim(coalesce(r.verification_status,'')))='MANUALLY_REVIEWED_SOURCE_PRESENT' then 'reviewed_reference_only'
    else 'unrecognized_verification_reference_only'
  end as route_state,
  r.source_jurisdiction,
  r.supporting_name,
  r.raw_source_record_id,
  r.source_table_index,
  r.source_title
from public.v_lighthouse_reviewed_action_route_current_v1 r;

comment on view public.v_ui_intake_routing_v1 is
  'Governed read-only intake routing projection over current reviewed action routes. Person-facing eligibility uses an explicit verification-status allowlist and an access-point requirement; unknown statuses fail closed.';
