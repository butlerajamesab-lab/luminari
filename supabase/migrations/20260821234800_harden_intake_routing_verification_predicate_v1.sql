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
    lower(coalesce(r.verification_status,'')) like '%verified%'
    and lower(coalesce(r.verification_status,'')) not like '%unverified%'
    and lower(coalesce(r.verification_status,'')) not like '%partial%'
    and coalesce(r.filing_or_complaint_url,r.phone,r.email,r.website) is not null
  ) as is_user_routable,
  case
    when lower(coalesce(r.verification_status,'')) like '%unverified%' then 'unverified_reference_only'
    when lower(coalesce(r.verification_status,'')) like '%partial%' then 'partial_review'
    when lower(coalesce(r.verification_status,'')) like '%verified%'
      and coalesce(r.filing_or_complaint_url,r.phone,r.email,r.website) is not null then 'verified_routable'
    when lower(coalesce(r.verification_status,'')) like '%verified%' then 'verified_reference_only'
    else 'reviewed_reference_only'
  end as route_state
from public.v_lighthouse_reviewed_action_route_current_v1 r;

comment on view public.v_ui_intake_routing_v1 is
  'Governed read-only intake routing projection over current reviewed action routes. Explicitly rejects UNVERIFIED/PARTIAL states from user-routable promotion while preserving verification/provenance state.';
