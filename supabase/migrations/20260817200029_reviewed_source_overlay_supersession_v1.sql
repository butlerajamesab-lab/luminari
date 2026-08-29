-- A reviewed source may have many immutable generations, but only the newest
-- activated overlay for that normalized source filename may feed public
-- situation/action routing. Historical overlays and every source, action,
-- binding, and context revision remain preserved.

begin;

create or replace view public.v_luminari_reviewed_source_overlay_ranked_v1
with (security_invoker = true) as
with normalized_overlays as (
  select
    o.overlay_key,
    o.active_run_id,
    o.source_filename,
    lower(
      regexp_replace(btrim(o.source_filename), '[[:space:]]+', ' ', 'g')
    ) as normalized_source_filename,
    o.source_content_sha256,
    o.generation_label,
    o.page_count,
    o.reviewed_page_count,
    o.expected_record_count,
    o.reviewed_record_count,
    o.activated_at,
    o.activation_receipt,
    r.engine_version as run_engine_version,
    r.status as run_status,
    r.completed_at as run_completed_at
  from public.luminari_reviewed_source_overlay_v1 o
  join public.luminari_corpus_rebuild_run_v1 r
    on r.run_id = o.active_run_id
  where r.status = 'completed'
    and r.engine_version like 'manual_source_review_reconciliation_v%'
)
select
  n.*,
  row_number() over (
    partition by n.normalized_source_filename
    order by
      n.activated_at desc,
      n.run_completed_at desc nulls last,
      n.active_run_id desc,
      n.overlay_key desc
  ) as overlay_rank
from normalized_overlays n;

revoke all on public.v_luminari_reviewed_source_overlay_ranked_v1
  from public, anon, authenticated;
grant select on public.v_luminari_reviewed_source_overlay_ranked_v1
  to service_role;

create or replace view public.v_luminari_reviewed_source_overlay_current_v1
with (security_invoker = true) as
select
  overlay_key,
  active_run_id,
  source_filename,
  normalized_source_filename,
  source_content_sha256,
  generation_label,
  page_count,
  reviewed_page_count,
  expected_record_count,
  reviewed_record_count,
  activated_at,
  activation_receipt,
  run_engine_version,
  run_status,
  run_completed_at,
  overlay_rank
from public.v_luminari_reviewed_source_overlay_ranked_v1
where overlay_rank = 1;

revoke all on public.v_luminari_reviewed_source_overlay_current_v1
  from public, anon, authenticated;
grant select on public.v_luminari_reviewed_source_overlay_current_v1
  to service_role;

create or replace view public.v_luminari_reviewed_source_overlay_superseded_v1
with (security_invoker = true) as
select
  older.overlay_key,
  older.active_run_id,
  older.source_filename,
  older.normalized_source_filename,
  older.source_content_sha256,
  older.generation_label,
  older.page_count,
  older.reviewed_page_count,
  older.expected_record_count,
  older.reviewed_record_count,
  older.activated_at,
  older.activation_receipt,
  older.run_engine_version,
  older.run_status,
  older.run_completed_at,
  older.overlay_rank,
  winner.overlay_key as superseded_by_overlay_key,
  winner.active_run_id as superseded_by_run_id,
  winner.activated_at as superseded_by_activated_at,
  'newer_overlay_for_same_normalized_source_filename'::text
    as supersession_reason
from public.v_luminari_reviewed_source_overlay_ranked_v1 older
join public.v_luminari_reviewed_source_overlay_current_v1 winner
  on winner.normalized_source_filename = older.normalized_source_filename
where older.overlay_rank > 1;

revoke all on public.v_luminari_reviewed_source_overlay_superseded_v1
  from public, anon, authenticated;
grant select on public.v_luminari_reviewed_source_overlay_superseded_v1
  to service_role;

-- Keep the function signature and JSON contract unchanged, but source its
-- bindings from immutable revisions belonging only to overlay winners. The
-- mutable *_current table may still retain a key omitted by a newer source
-- generation and therefore must not be used for publication.
create or replace function public.luminari_action_supporting_bindings_json_v1(
  p_action_key text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
  with winner_binding_revisions as (
    select
      b.*,
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
  ), current_bindings as (
    select *
    from winner_binding_revisions
    where binding_rank = 1
  )
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
    ),
    '[]'::jsonb
  )
  from current_bindings b
  left join public.luminari_reviewed_source_record_revision_v1 r
    on r.source_record_revision_id = b.source_record_revision_id
  where b.action_key = p_action_key;
$function$;

revoke all on function public.luminari_action_supporting_bindings_json_v1(text)
  from public, anon, authenticated;
grant execute on function public.luminari_action_supporting_bindings_json_v1(text)
  to service_role;

-- Preserve the existing public view column contract. Only the candidate run
-- set changes: actions, bindings, and contexts must belong to one of the
-- deterministic current overlay winners.
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
  from public, anon, authenticated;
grant select on public.v_lighthouse_situation_action_current_v1
  to service_role;

comment on view public.v_luminari_reviewed_source_overlay_current_v1 is
  'Service-only deterministic winner per normalized reviewed source filename. Historical overlays remain immutable.';
comment on view public.v_luminari_reviewed_source_overlay_superseded_v1 is
  'Service-only historical overlays mapped to the deterministic newer winner for the same normalized source filename.';
comment on function public.luminari_action_supporting_bindings_json_v1(text) is
  'Returns reviewed supporting bindings only from current per-source overlay winners; superseded source generations remain preserved but cannot publish.';

commit;
