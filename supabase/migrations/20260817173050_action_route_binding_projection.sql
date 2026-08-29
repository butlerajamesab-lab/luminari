-- Keep person-facing actions canonical while preserving every reviewed route
-- as a supporting binding. A representative provider must never become the
-- action body or the action's primary contact by accident.

create or replace function public.luminari_action_supporting_bindings_json_v1(
  p_action_key text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
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
        'source_record_revision_id', b.source_record_revision_id
      ) order by
        (b.verification_status = 'VERIFIED') desc,
        b.supporting_name,
        b.binding_key
    ),
    '[]'::jsonb
  )
  from public.luminari_situation_action_binding_current_v1 b
  where b.action_key = p_action_key;
$function$;

revoke all on function public.luminari_action_supporting_bindings_json_v1(text)
  from public, anon, authenticated;
grant execute on function public.luminari_action_supporting_bindings_json_v1(text)
  to service_role;

create or replace function public.luminari_enrich_situation_action_civic_object_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_action_key text;
  v_bindings jsonb;
  v_binding_count integer;
  v_first_route_summary text;
  v_action_phrase text;
begin
  if new.source_object_type <> 'situation_action' then
    return new;
  end if;

  v_action_key := nullif(
    btrim(new.field_provenance #>> '{situation_action,action_key}'),
    ''
  );
  if v_action_key is null then
    return new;
  end if;

  v_bindings := public.luminari_action_supporting_bindings_json_v1(v_action_key);
  v_binding_count := jsonb_array_length(v_bindings);

  select b.what_the_person_can_do
    into v_first_route_summary
  from public.luminari_situation_action_binding_current_v1 b
  where b.action_key = v_action_key
  order by
    (b.verification_status = 'VERIFIED') desc,
    (b.filing_or_complaint_url is not null) desc,
    (b.phone is not null) desc,
    (b.email is not null) desc,
    (b.website is not null) desc,
    b.supporting_name,
    b.binding_key
  limit 1;

  new.field_provenance := jsonb_set(
    coalesce(new.field_provenance, '{}'::jsonb),
    '{supporting_bindings}',
    v_bindings,
    true
  );
  new.field_provenance := jsonb_set(
    new.field_provenance,
    '{source_review,record_count}',
    to_jsonb(v_binding_count),
    true
  );

  v_action_phrase := case
    when nullif(btrim(new.name), '') is null then 'take this action'
    else lower(left(btrim(new.name), 1)) || substr(btrim(new.name), 2)
  end;

  if v_binding_count > 1 then
    new.description := format(
      'Compare %s reviewed routes to %s. Each route keeps its own instructions, contact points, and source context.',
      v_binding_count,
      v_action_phrase
    );
  elsif v_binding_count = 1 then
    new.description := coalesce(
      nullif(btrim(v_first_route_summary), ''),
      format('Use the reviewed route below to %s.', v_action_phrase)
    );
  else
    new.description := format(
      'This reviewed action currently has no published route binding. Preserve it as a routing gap until a source-backed access point is reviewed.'
    );
  end if;

  new.apply_notes := format(
    '%s reviewed source-backed route option%s attached.',
    v_binding_count,
    case when v_binding_count = 1 then '' else 's' end
  );

  return new;
end;
$function$;

revoke all on function public.luminari_enrich_situation_action_civic_object_v1()
  from public, anon, authenticated;

drop trigger if exists luminari_enrich_situation_action_civic_object_v1
  on public.luminari_civic_object_reconciliation_v1;

create trigger luminari_enrich_situation_action_civic_object_v1
before insert or update on public.luminari_civic_object_reconciliation_v1
for each row
execute function public.luminari_enrich_situation_action_civic_object_v1();

-- Refresh only active reviewed overlays. Historical/inactive runs remain an
-- immutable audit record, and no base/source row is deleted or retired.
update public.luminari_civic_object_reconciliation_v1 r
set reconciled_at = r.reconciled_at
where r.source_object_type = 'situation_action'
  and r.run_id in (
    select o.active_run_id
    from public.luminari_reviewed_source_overlay_v1 o
  );

comment on function public.luminari_action_supporting_bindings_json_v1(text) is
  'Returns every current reviewed provider/program/authority/data binding for one canonical situation action.';

comment on function public.luminari_enrich_situation_action_civic_object_v1() is
  'Prevents a representative supporting node from being promoted into the canonical action presentation.';
