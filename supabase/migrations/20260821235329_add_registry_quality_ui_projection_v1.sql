create or replace view public.v_ui_registry_quality_v1
with (security_invoker = true)
as
select
  o.object_class,
  o.source_object_type,
  o.category,
  count(*)::bigint as total_objects,
  count(*) filter(where o.typed_ready)::bigint as typed_ready_objects,
  count(*) filter(where o.jurisdiction_ready)::bigint as jurisdiction_ready_objects,
  count(*) filter(where o.has_access_point)::bigint as access_point_objects,
  count(*) filter(where o.direct_access_ready)::bigint as direct_access_ready_objects,
  count(*) filter(where o.data_state='current_typed')::bigint as current_typed_objects,
  count(*) filter(where o.data_state<>'current_typed')::bigint as unresolved_or_held_objects,
  count(*) filter(where o.data_state='jurisdiction_unresolved')::bigint as jurisdiction_unresolved_objects,
  count(*) filter(where o.data_state='jurisdiction_conflict')::bigint as jurisdiction_conflict_objects,
  count(*) filter(where o.data_state='identity_conflict')::bigint as identity_conflict_objects,
  count(*) filter(where o.data_state='resource_identity_unresolved')::bigint as resource_identity_unresolved_objects,
  count(*) filter(where o.data_state='resource_access_unresolved')::bigint as resource_access_unresolved_objects,
  count(*) filter(where o.data_state='unresolved_type')::bigint as unresolved_type_objects,
  count(*) filter(where o.data_state='unresolved_legal_reference')::bigint as unresolved_legal_reference_objects,
  max(o.source_created_at) as latest_source_created_at,
  max(o.current_run_completed_at) as latest_run_completed_at,
  max(o.reconciled_at) as latest_reconciled_at
from public.v_lighthouse_civic_object_current_v1 o
group by o.object_class,o.source_object_type,o.category;

comment on view public.v_ui_registry_quality_v1 is
  'Governed read-only registry quality projection over current canonical civic objects. Reports readiness/unresolved counts exactly as stored; performs no scoring or promotion.';
