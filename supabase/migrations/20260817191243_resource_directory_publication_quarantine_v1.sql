-- Keep the preserved civic-object corpus intact while removing broken or
-- resource-less rows from the person-facing Resource Directory.  Hidden rows
-- remain inspectable through a service-only quarantine view with explicit
-- reasons; this migration deletes nothing.

create or replace view public.v_lighthouse_resource_program_catalog_v2
with (security_invoker = true) as
select
  c.*,
  case
    when object_class = 'resource' then 'direct_or_referral_resource'
    else 'program_or_benefit'
  end as catalog_kind,
  true as person_facing_ready
from public.v_lighthouse_civic_object_current_v1 c
where object_class in ('resource', 'program')
  and case
    when object_class = 'resource' then direct_access_ready
    when object_class = 'program' then
      typed_ready
      and jurisdiction_ready
      and nullif(btrim(name), '') is not null
    else false
  end
  and has_access_point
  and not public.luminari_resource_name_invalid_v1(name);

revoke all on public.v_lighthouse_resource_program_catalog_v2
  from public, anon, authenticated;
grant select on public.v_lighthouse_resource_program_catalog_v2
  to service_role;

create or replace view public.v_lighthouse_resource_program_quarantine_v1
with (security_invoker = true) as
with classified as (
  select
    c.*,
    case
      when object_class = 'resource' then 'direct_or_referral_resource'
      else 'program_or_benefit'
    end as catalog_kind,
    case
      when object_class = 'resource' then direct_access_ready
      when object_class = 'program' then
        typed_ready
        and jurisdiction_ready
        and nullif(btrim(name), '') is not null
      else false
    end as base_person_facing_ready
  from public.v_lighthouse_civic_object_current_v1 c
  where object_class in ('resource', 'program')
)
select
  classified.*,
  array_remove(array[
    case
      when not base_person_facing_ready then 'base_publication_gate_failed'
    end,
    case
      when not has_access_point then 'no_source_attached_access_point'
    end,
    case
      when public.luminari_resource_name_invalid_v1(name) then
        'invalid_or_fragmented_resource_name'
    end
  ]::text[], null) as quarantine_reasons,
  'hidden_from_person_facing_resource_directory'::text as visibility_state
from classified
where not (
  base_person_facing_ready
  and has_access_point
  and not public.luminari_resource_name_invalid_v1(name)
);

revoke all on public.v_lighthouse_resource_program_quarantine_v1
  from public, anon, authenticated;
grant select on public.v_lighthouse_resource_program_quarantine_v1
  to service_role;

comment on view public.v_lighthouse_resource_program_catalog_v2 is
  'Strict person-facing Resource Directory: complete typed records with a human-readable name and source-attached access point. Source and revision rows remain preserved.';

comment on view public.v_lighthouse_resource_program_quarantine_v1 is
  'Service-only visibility quarantine for incomplete, resource-less, or fragmented Resource Directory candidates. Nothing in this view is deleted.';
