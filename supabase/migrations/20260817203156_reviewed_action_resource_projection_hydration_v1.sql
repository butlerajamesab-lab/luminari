-- Keep reviewed action projections synchronized with their exact binding
-- revisions and publish only the winner for each normalized source filename.
-- Historical actions and source/revision rows are preserved; this migration
-- deletes and retires nothing.

create or replace function public.hydrate_luminari_situation_action_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_action_key text := nullif(
    btrim(new.field_provenance #>> '{situation_action,action_key}'),
    ''
  );
  v_binding_count integer := 0;
  v_binding_summary jsonb := '[]'::jsonb;
  v_has_access boolean := false;
  v_best public.luminari_situation_action_binding_revision_v1%rowtype;
begin
  if new.source_object_type is distinct from 'situation_action' then
    return new;
  end if;

  if v_action_key is null or new.run_id is null then
    new.has_access_point := false;
    new.field_provenance :=
      coalesce(new.field_provenance, '{}'::jsonb)
      || jsonb_build_object(
        'source_review',
        coalesce(new.field_provenance->'source_review', '{}'::jsonb)
          || jsonb_build_object('record_count', 0),
        'supporting_bindings', '[]'::jsonb
      );
    return new;
  end if;

  select b.* into v_best
  from public.luminari_situation_action_binding_revision_v1 b
  where b.run_id = new.run_id and b.action_key = v_action_key
  order by
    (upper(coalesce(b.verification_status, '')) like 'VERIFIED%') desc,
    (b.filing_or_complaint_url is not null) desc,
    (b.phone is not null) desc,
    (b.email is not null) desc,
    (b.website is not null) desc,
    b.supporting_name,
    b.binding_key
  limit 1;

  select
    count(*)::integer,
    coalesce(bool_or(
      b.filing_or_complaint_url is not null or b.phone is not null
      or b.email is not null or b.website is not null
    ), false),
    coalesce(jsonb_agg(jsonb_build_object(
      'binding_key', b.binding_key,
      'source_subcategory', b.source_subcategory,
      'source_jurisdiction_level', b.source_jurisdiction_level,
      'source_jurisdiction', b.source_jurisdiction,
      'supporting_name', b.supporting_name,
      'supporting_source_id', b.supporting_source_id,
      'source_service_type', b.source_service_type,
      'what_the_person_can_do', b.what_the_person_can_do,
      'route_instructions', b.route_instructions,
      'filing_or_complaint_url', b.filing_or_complaint_url,
      'phone', b.phone,
      'email', b.email,
      'website', b.website,
      'address', b.address,
      'statutory_authority', b.statutory_authority,
      'verification_status', b.verification_status,
      'supporting_object_class', b.supporting_object_class,
      'supporting_target_surface', b.supporting_target_surface,
      'direct_source_reference', b.binding_payload->>'direct_source_reference',
      'direct_source_references', coalesce(
        b.binding_payload->'direct_source_references', '[]'::jsonb
      ),
      'statutory_authority_url', b.binding_payload->>'statutory_authority_url',
      'filing_deadline', b.binding_payload->>'filing_deadline',
      'filing_deadline_source', b.binding_payload->>'filing_deadline_source',
      'source_record_revision_id', b.source_record_revision_id,
      'source_filename', r.source_filename,
      'source_content_sha256', r.source_content_sha256,
      'source_record_id', r.source_record_id,
      'raw_source_record_id', r.raw_source_record_id,
      'source_page', r.source_page,
      'source_table_index', r.source_table_index,
      'source_title', r.source_title
    ) order by
      (upper(coalesce(b.verification_status, '')) like 'VERIFIED%') desc,
      b.supporting_name,
      b.binding_key
    ), '[]'::jsonb)
  into v_binding_count, v_has_access, v_binding_summary
  from public.luminari_situation_action_binding_revision_v1 b
  left join public.luminari_reviewed_source_record_revision_v1 r
    on r.source_record_revision_id = b.source_record_revision_id
  where b.run_id = new.run_id and b.action_key = v_action_key;

  new.field_provenance :=
    coalesce(new.field_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'source_review',
      coalesce(new.field_provenance->'source_review', '{}'::jsonb)
        || jsonb_build_object(
          'record_count', v_binding_count,
          'binding_hydration_run_id', new.run_id,
          'binding_hydration_contract',
            'reviewed_action_resource_projection_hydration_v1'
        ),
      'supporting_bindings', v_binding_summary
    );
  new.has_access_point := v_has_access;
  new.phone := v_best.phone;
  new.email := v_best.email;
  new.website_url := v_best.website;
  new.address := v_best.address;
  new.apply_notes := format(
    'Choose from %s reviewed source-backed route option%s.',
    v_binding_count,
    case when v_binding_count = 1 then '' else 's' end
  );
  new.description := coalesce(v_best.what_the_person_can_do, new.description);
  new.filing_portal := v_best.route_instructions;
  new.filing_portal_url := v_best.filing_or_complaint_url;
  new.statutory_authority := v_best.statutory_authority;
  new.projection_version := 'situation_action_projection_v1.2.0_dynamic_bindings';
  new.reconciled_at := now();
  return new;
end;
$function$;

revoke all on function public.hydrate_luminari_situation_action_projection_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists luminari_hydrate_situation_action_projection_v1
  on public.luminari_civic_object_reconciliation_v1;

create trigger luminari_hydrate_situation_action_projection_v1
before insert or update of field_provenance, run_id, source_object_type
on public.luminari_civic_object_reconciliation_v1
for each row
execute function public.hydrate_luminari_situation_action_projection_v1();

-- Re-run only the derived projection trigger. Immutable source records,
-- action revisions, binding revisions, and overlay history are untouched.
update public.luminari_civic_object_reconciliation_v1
set field_provenance = field_provenance
where source_object_type = 'situation_action';

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
  and not public.luminari_resource_name_invalid_v1(name)
  and (
    source_object_type not in ('situation_action', 'situation_action_alert')
    or exists (
      select 1
      from public.v_luminari_reviewed_source_overlay_current_v1 winner
      where winner.active_run_id = c.run_id
    )
  )
  and (
    source_object_type <> 'situation_action'
    or jsonb_array_length(coalesce(
      field_provenance->'supporting_bindings', '[]'::jsonb
    )) > 0
  );

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
    end,
    case
      when source_object_type in ('situation_action', 'situation_action_alert')
       and not exists (
         select 1
         from public.v_luminari_reviewed_source_overlay_current_v1 winner
         where winner.active_run_id = classified.run_id
       ) then 'superseded_source_overlay'
    end,
    case
      when source_object_type = 'situation_action'
       and jsonb_array_length(coalesce(
         field_provenance->'supporting_bindings', '[]'::jsonb
       )) = 0 then 'no_attached_supporting_binding'
    end
  ]::text[], null) as quarantine_reasons,
  'hidden_from_person_facing_resource_directory'::text as visibility_state
from classified
where not (
  base_person_facing_ready
  and has_access_point
  and not public.luminari_resource_name_invalid_v1(name)
  and (
    source_object_type not in ('situation_action', 'situation_action_alert')
    or exists (
      select 1
      from public.v_luminari_reviewed_source_overlay_current_v1 winner
      where winner.active_run_id = classified.run_id
    )
  )
  and (
    source_object_type <> 'situation_action'
    or jsonb_array_length(coalesce(
      field_provenance->'supporting_bindings', '[]'::jsonb
    )) > 0
  )
);

revoke all on public.v_lighthouse_resource_program_quarantine_v1
  from public, anon, authenticated;
grant select on public.v_lighthouse_resource_program_quarantine_v1
  to service_role;

comment on function public.hydrate_luminari_situation_action_projection_v1() is
  'Hydrates a derived Resource Directory action projection from exact same-run binding revisions; source and revision rows remain immutable.';

comment on view public.v_lighthouse_resource_program_catalog_v2 is
  'Strict person-facing Resource Directory. Reviewed actions require a current source overlay, at least one exact supporting binding, and a real access point.';

comment on view public.v_lighthouse_resource_program_quarantine_v1 is
  'Service-only quarantine for incomplete, resource-less, or superseded Resource Directory projections. Historical rows are preserved.';
