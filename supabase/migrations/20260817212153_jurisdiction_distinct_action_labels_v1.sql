-- Make jurisdiction-specific reviewed actions visibly distinct without
-- changing action identity, source lineage, bindings, or historical runs.
-- The action key remains canonical; this migration changes only the
-- person-facing display label and the derived civic projection name.

begin;

create or replace function public.luminari_action_display_label_v1(
  p_action_label text,
  p_state_code text
)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
  select case
    when nullif(btrim(p_action_label), '') is null then p_action_label
    when nullif(btrim(p_state_code), '') is null then btrim(p_action_label)
    when upper(btrim(p_state_code)) = 'US' then btrim(p_action_label)
    when lower(right(
      btrim(p_action_label),
      length(btrim(p_state_code)) + 3
    )) = lower(' — ' || btrim(p_state_code)) then btrim(p_action_label)
    else btrim(p_action_label) || ' — ' || upper(btrim(p_state_code))
  end;
$function$;

revoke all on function public.luminari_action_display_label_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.luminari_action_display_label_v1(text, text)
  to service_role;

create or replace function public.apply_luminari_action_display_label_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
begin
  if new.source_object_type = 'situation_action' then
    new.name := public.luminari_action_display_label_v1(
      new.name,
      new.state_code
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.apply_luminari_action_display_label_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists luminari_apply_action_display_label_v1
  on public.luminari_civic_object_reconciliation_v1;

create trigger luminari_apply_action_display_label_v1
before insert or update of name, state_code, source_object_type
on public.luminari_civic_object_reconciliation_v1
for each row
execute function public.apply_luminari_action_display_label_v1();

-- Backfill only the derived reconciliation projection. Immutable reviewed
-- source records, action revisions, binding revisions, overlays, and their
-- hashes remain untouched.
update public.luminari_civic_object_reconciliation_v1
set name = public.luminari_action_display_label_v1(name, state_code)
where source_object_type = 'situation_action'
  and name is distinct from
    public.luminari_action_display_label_v1(name, state_code);

-- Preserve the existing view contract while applying the same idempotent
-- display rule to consumers that read the action view directly.
create or replace view public.v_lighthouse_situation_action_current_v1
with (security_invoker = true) as
with active_action_revisions as (
  select
    a.*,
    o.activated_at,
    o.run_completed_at,
    row_number() over (
      partition by a.action_key
      order by
        o.activated_at desc,
        o.run_completed_at desc nulls last,
        a.created_at desc,
        a.action_revision_id desc
    ) as action_rank
  from public.luminari_situation_action_revision_v1 a
  join public.v_luminari_reviewed_source_overlay_current_v1 o
    on o.active_run_id = a.run_id
), actions as (
  select *
  from active_action_revisions
  where action_rank = 1
), active_binding_revisions as (
  select
    b.*,
    o.activated_at,
    o.run_completed_at,
    row_number() over (
      partition by b.binding_key
      order by
        o.activated_at desc,
        o.run_completed_at desc nulls last,
        b.created_at desc,
        b.binding_revision_id desc
    ) as binding_rank
  from public.luminari_situation_action_binding_revision_v1 b
  join public.v_luminari_reviewed_source_overlay_current_v1 o
    on o.active_run_id = b.run_id
), bindings_current as (
  select *
  from active_binding_revisions
  where binding_rank = 1
), active_context_revisions as (
  select
    c.*,
    o.activated_at,
    o.run_completed_at,
    row_number() over (
      partition by c.context_binding_key
      order by
        o.activated_at desc,
        o.run_completed_at desc nulls last,
        c.created_at desc,
        c.context_revision_id desc
    ) as context_rank
  from public.luminari_reviewed_context_revision_v1 c
  join public.v_luminari_reviewed_source_overlay_current_v1 o
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
  public.luminari_action_display_label_v1(
    a.action_label,
    a.state_code
  ) as action_label,
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
  from public, anon, authenticated;
grant select on public.v_lighthouse_situation_action_current_v1
  to service_role;

comment on function public.luminari_action_display_label_v1(text, text) is
  'Idempotent person-facing action label: preserves US labels and appends a non-US jurisdiction code without changing action identity.';
comment on view public.v_lighthouse_situation_action_current_v1 is
  'Current source-overlay action winners with exact current bindings and jurisdiction-distinct person-facing labels.';

commit;
