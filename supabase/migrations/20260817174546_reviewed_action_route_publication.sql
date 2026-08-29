-- Publish the full reviewed route contract without detaching an action from
-- the exact source record that supports it.  This is additive: no reviewed
-- source, action, binding, or historical revision is deleted or retired.

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
        'direct_source_reference', b.current_payload->>'direct_source_reference',
        'statutory_authority_url', b.current_payload->>'statutory_authority_url',
        'filing_deadline', b.current_payload->>'filing_deadline',
        'filing_deadline_source', b.current_payload->>'filing_deadline_source',
        'source_record_revision_id', b.source_record_revision_id,
        'source_filename', r.source_filename,
        'source_content_sha256', r.source_content_sha256,
        'source_record_id', r.source_record_id,
        'raw_source_record_id', r.raw_source_record_id,
        'source_page', r.source_page,
        'source_table_index', r.source_table_index,
        'source_title', r.source_title
      ) order by
        (b.verification_status = 'VERIFIED') desc,
        b.supporting_name,
        b.binding_key
    ),
    '[]'::jsonb
  )
  from public.luminari_situation_action_binding_current_v1 b
  left join public.luminari_reviewed_source_record_revision_v1 r
    on r.source_record_revision_id = b.source_record_revision_id
  where b.action_key = p_action_key;
$function$;

revoke all on function public.luminari_action_supporting_bindings_json_v1(text)
  from public, anon, authenticated;
grant execute on function public.luminari_action_supporting_bindings_json_v1(text)
  to service_role;

create or replace view public.v_lighthouse_situation_action_current_v1
with (security_invoker = true) as
with active_action_revisions as (
  select
    a.*,
    o.activated_at,
    row_number() over (
      partition by a.action_key
      order by o.activated_at desc, a.created_at desc, a.action_revision_id desc
    ) as action_rank
  from public.luminari_situation_action_revision_v1 a
  join public.luminari_reviewed_source_overlay_v1 o
    on o.active_run_id = a.run_id
), actions as (
  select *
  from active_action_revisions
  where action_rank = 1
), active_binding_revisions as (
  select
    b.*,
    o.activated_at,
    row_number() over (
      partition by b.binding_key
      order by o.activated_at desc, b.created_at desc, b.binding_revision_id desc
    ) as binding_rank
  from public.luminari_situation_action_binding_revision_v1 b
  join public.luminari_reviewed_source_overlay_v1 o
    on o.active_run_id = b.run_id
), bindings_current as (
  select *
  from active_binding_revisions
  where binding_rank = 1
), active_context_revisions as (
  select
    c.*,
    o.activated_at,
    row_number() over (
      partition by c.context_binding_key
      order by o.activated_at desc, c.created_at desc, c.context_revision_id desc
    ) as context_rank
  from public.luminari_reviewed_context_revision_v1 c
  join public.luminari_reviewed_source_overlay_v1 o
    on o.active_run_id = c.run_id
), contexts_current as (
  select *
  from active_context_revisions
  where context_rank = 1
)
select
  a.action_key,
  a.action_class,
  a.issue_lens,
  a.situation_key,
  a.jurisdiction_level,
  a.jurisdiction,
  a.state_code,
  a.action_kind,
  a.action_label,
  a.when_to_use,
  a.target_surface,
  a.alert_type,
  a.severity,
  a.deadline_summary,
  a.run_id as active_run_id,
  a.action_revision_key as active_action_revision_key,
  a.created_at as updated_at,
  coalesce(bindings.binding_count, 0) as binding_count,
  coalesce(bindings.bindings, '[]'::jsonb) as bindings,
  coalesce(contexts.context_count, 0) as context_count,
  coalesce(contexts.contexts, '[]'::jsonb) as contexts,
  coalesce(bindings.has_access_point, false) as has_access_point
from actions a
left join lateral (
  select
    count(*)::integer as binding_count,
    bool_or(
      b.filing_or_complaint_url is not null or b.phone is not null
      or b.email is not null or b.website is not null
    ) as has_access_point,
    jsonb_agg(jsonb_build_object(
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
      (b.verification_status = 'VERIFIED') desc,
      b.supporting_name,
      b.binding_key
    ) as bindings
  from bindings_current b
  left join public.luminari_reviewed_source_record_revision_v1 r
    on r.source_record_revision_id = b.source_record_revision_id
  where b.action_key = a.action_key
) bindings on true
left join lateral (
  select
    count(*)::integer as context_count,
    jsonb_agg(jsonb_build_object(
      'context_binding_key', c.context_binding_key,
      'context_id', c.context_id,
      'title', c.title,
      'body', c.body,
      'raw_text', c.raw_text,
      'context_revision_id', c.context_revision_id
    ) order by c.context_id) as contexts
  from contexts_current c
  where c.action_key = a.action_key
) contexts on true;

revoke all on public.v_lighthouse_situation_action_current_v1
  from anon, authenticated;
grant select on public.v_lighthouse_situation_action_current_v1 to service_role;

create or replace view public.v_lighthouse_reviewed_action_route_current_v1
with (security_invoker = true) as
select
  a.action_key,
  a.action_class,
  a.issue_lens,
  a.situation_key,
  a.jurisdiction_level,
  a.jurisdiction,
  a.state_code,
  a.action_kind,
  a.action_label,
  a.when_to_use,
  a.target_surface,
  a.alert_type,
  a.severity,
  a.deadline_summary,
  a.active_run_id,
  b.binding_key,
  b.source_subcategory,
  b.source_jurisdiction_level,
  b.source_jurisdiction,
  b.supporting_name,
  b.supporting_source_id,
  b.source_service_type,
  b.what_the_person_can_do,
  b.route_instructions,
  b.filing_or_complaint_url,
  b.phone,
  b.email,
  b.website,
  b.address,
  b.statutory_authority,
  b.verification_status,
  b.supporting_object_class,
  b.supporting_target_surface,
  b.direct_source_reference,
  b.statutory_authority_url,
  b.filing_deadline,
  b.filing_deadline_source,
  b.source_record_revision_id,
  b.source_filename,
  b.source_content_sha256,
  b.source_record_id,
  b.raw_source_record_id,
  b.source_page,
  b.source_table_index,
  b.source_title
from public.v_lighthouse_situation_action_current_v1 a
cross join lateral jsonb_to_recordset(a.bindings) as b(
  binding_key text,
  source_subcategory text,
  source_jurisdiction_level text,
  source_jurisdiction text,
  supporting_name text,
  supporting_source_id text,
  source_service_type text,
  what_the_person_can_do text,
  route_instructions text,
  filing_or_complaint_url text,
  phone text,
  email text,
  website text,
  address text,
  statutory_authority text,
  verification_status text,
  supporting_object_class text,
  supporting_target_surface text,
  direct_source_reference text,
  statutory_authority_url text,
  filing_deadline text,
  filing_deadline_source text,
  source_record_revision_id uuid,
  source_filename text,
  source_content_sha256 text,
  source_record_id text,
  raw_source_record_id text,
  source_page integer,
  source_table_index integer,
  source_title text
);

revoke all on public.v_lighthouse_reviewed_action_route_current_v1
  from anon, authenticated;
grant select on public.v_lighthouse_reviewed_action_route_current_v1
  to service_role;

-- Re-run the projection trigger for active overlays only. Historical and
-- inactive review runs remain untouched and no source row is removed.
update public.luminari_civic_object_reconciliation_v1 r
set reconciled_at = r.reconciled_at
where r.source_object_type = 'situation_action'
  and r.run_id in (
    select o.active_run_id
    from public.luminari_reviewed_source_overlay_v1 o
  );

comment on view public.v_lighthouse_reviewed_action_route_current_v1 is
  'One active reviewed supporting route per row, with canonical action, direct-source reference, and exact reviewed-source locator.';
