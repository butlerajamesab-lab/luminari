-- Reviewed-source overlays are additive to the current full-corpus snapshot.
-- A bounded, one-file review must never become the replacement base run.

create table if not exists public.luminari_reviewed_source_overlay_v1 (
  overlay_key text primary key,
  active_run_id uuid not null unique
    references public.luminari_corpus_rebuild_run_v1(run_id),
  source_filename text not null,
  source_content_sha256 text,
  generation_label text,
  page_count integer not null,
  reviewed_page_count integer not null,
  expected_record_count integer not null,
  reviewed_record_count integer not null,
  activated_at timestamptz not null default now(),
  activation_receipt jsonb not null default '{}'::jsonb,
  constraint luminari_reviewed_source_overlay_key_nonempty
    check (nullif(btrim(overlay_key), '') is not null),
  constraint luminari_reviewed_source_overlay_filename_nonempty
    check (nullif(btrim(source_filename), '') is not null),
  constraint luminari_reviewed_source_overlay_sha256
    check (source_content_sha256 is null or source_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint luminari_reviewed_source_overlay_page_counts
    check (page_count > 0 and reviewed_page_count = page_count),
  constraint luminari_reviewed_source_overlay_record_counts
    check (expected_record_count > 0 and reviewed_record_count = expected_record_count)
);

create index if not exists luminari_reviewed_source_overlay_activated_idx
  on public.luminari_reviewed_source_overlay_v1 (activated_at desc, overlay_key);

alter table public.luminari_reviewed_source_overlay_v1 enable row level security;
revoke all on public.luminari_reviewed_source_overlay_v1 from anon, authenticated;
grant select, insert, update, delete on public.luminari_reviewed_source_overlay_v1 to service_role;

create or replace function public.activate_luminari_reviewed_source_overlay_v1(
  p_overlay_key text,
  p_run_id uuid,
  p_source_filename text,
  p_source_content_sha256 text,
  p_generation_label text,
  p_page_count integer,
  p_reviewed_page_count integer,
  p_expected_record_count integer,
  p_reviewed_record_count integer,
  p_activation_receipt jsonb default '{}'::jsonb
)
returns public.luminari_reviewed_source_overlay_v1
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_run public.luminari_corpus_rebuild_run_v1%rowtype;
  v_distinct_reviewed_records integer;
  v_overlay public.luminari_reviewed_source_overlay_v1%rowtype;
begin
  if nullif(btrim(p_overlay_key), '') is null then
    raise exception 'overlay_key is required';
  end if;
  if nullif(btrim(p_source_filename), '') is null then
    raise exception 'source_filename is required';
  end if;
  if p_page_count is null or p_reviewed_page_count is distinct from p_page_count then
    raise exception 'all source pages must be reviewed before activation';
  end if;
  if p_expected_record_count is null
     or p_reviewed_record_count is distinct from p_expected_record_count then
    raise exception 'all expected source records must be reviewed before activation';
  end if;

  select * into v_run
  from public.luminari_corpus_rebuild_run_v1
  where run_id = p_run_id;

  if not found then
    raise exception 'reviewed overlay run % does not exist', p_run_id;
  end if;
  if v_run.status <> 'completed' then
    raise exception 'reviewed overlay run % is not completed', p_run_id;
  end if;
  if v_run.engine_version not like 'manual_source_review_reconciliation_v%' then
    raise exception 'run % is not a manual source-review run', p_run_id;
  end if;

  select count(distinct r.field_provenance #>> '{source_review,resource_id}')::integer
    into v_distinct_reviewed_records
  from public.luminari_civic_object_reconciliation_v1 r
  where r.run_id = p_run_id
    and nullif(btrim(r.field_provenance #>> '{source_review,resource_id}'), '') is not null;

  if v_distinct_reviewed_records <> p_expected_record_count then
    raise exception
      'run % has % distinct reviewed source records; expected %',
      p_run_id, v_distinct_reviewed_records, p_expected_record_count;
  end if;

  insert into public.luminari_reviewed_source_overlay_v1 (
    overlay_key,
    active_run_id,
    source_filename,
    source_content_sha256,
    generation_label,
    page_count,
    reviewed_page_count,
    expected_record_count,
    reviewed_record_count,
    activated_at,
    activation_receipt
  ) values (
    btrim(p_overlay_key),
    p_run_id,
    btrim(p_source_filename),
    p_source_content_sha256,
    nullif(btrim(p_generation_label), ''),
    p_page_count,
    p_reviewed_page_count,
    p_expected_record_count,
    p_reviewed_record_count,
    now(),
    coalesce(p_activation_receipt, '{}'::jsonb)
  )
  on conflict (overlay_key) do update set
    active_run_id = excluded.active_run_id,
    source_filename = excluded.source_filename,
    source_content_sha256 = excluded.source_content_sha256,
    generation_label = excluded.generation_label,
    page_count = excluded.page_count,
    reviewed_page_count = excluded.reviewed_page_count,
    expected_record_count = excluded.expected_record_count,
    reviewed_record_count = excluded.reviewed_record_count,
    activated_at = excluded.activated_at,
    activation_receipt = excluded.activation_receipt
  returning * into v_overlay;

  return v_overlay;
end;
$function$;

revoke all on function public.activate_luminari_reviewed_source_overlay_v1(
  text, uuid, text, text, text, integer, integer, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.activate_luminari_reviewed_source_overlay_v1(
  text, uuid, text, text, text, integer, integer, integer, integer, jsonb
) to service_role;

create or replace view public.v_lighthouse_civic_object_current_v1
with (security_invoker = true) as
with fresh as (
  select run_id, engine_version, completed_at,
         10::int as run_priority, 'fresh_corpus'::text as run_role
  from public.luminari_corpus_rebuild_run_v1
  where engine_version like 'fresh_corpus_reconciliation_v%'
    and status = 'completed'
    and not coalesce(result_json ? 'superseded_by_run_id', false)
  order by completed_at desc, run_id desc
  limit 1
), enrichment as (
  select run_id, engine_version, completed_at,
         20::int as run_priority, 'state_enrichment'::text as run_role
  from public.luminari_corpus_rebuild_run_v1
  where engine_version like 'fresh_state_enrichment_reconciliation_v%'
    and status = 'completed'
  order by completed_at desc, run_id desc
  limit 1
), reviewed_overlays as (
  select r.run_id, r.engine_version, r.completed_at,
         30::int as run_priority, 'reviewed_source_overlay'::text as run_role
  from public.luminari_reviewed_source_overlay_v1 o
  join public.luminari_corpus_rebuild_run_v1 r
    on r.run_id = o.active_run_id
  where r.status = 'completed'
    and r.engine_version like 'manual_source_review_reconciliation_v%'
), current_runs as (
  select * from fresh
  union all
  select * from enrichment
  union all
  select * from reviewed_overlays
), ranked as (
  select
    r.*,
    cr.run_role as current_run_role,
    cr.engine_version as current_run_engine_version,
    cr.completed_at as current_run_completed_at,
    row_number() over (
      partition by r.source_candidate_hash
      order by cr.run_priority desc, r.reconciled_at desc, r.object_ref
    ) as exact_source_rank
  from public.luminari_civic_object_reconciliation_v1 r
  join current_runs cr using (run_id)
)
select
  'corpus:' || object_ref as civic_object_uid,
  object_ref,
  source_object_type,
  object_class,
  target_surface,
  run_id,
  current_run_role,
  current_run_engine_version,
  current_run_completed_at,
  artifact_key,
  artifact_role,
  source_locator,
  source_content_sha256,
  source_candidate_hash,
  parser_version,
  jurisdiction,
  state_code,
  jurisdiction_resolution_state,
  section_name,
  name,
  organization_name,
  category,
  layer,
  phone,
  email,
  website_url,
  address,
  eligibility_summary,
  apply_notes,
  description,
  filing_portal,
  filing_portal_url,
  statutory_authority,
  deadline,
  hours,
  languages,
  organization_type,
  candidate_state,
  source_created_at,
  field_provenance,
  has_access_point,
  projection_state,
  projection_version,
  reconciled_at,
  (object_class not in ('unresolved_source_record','unresolved_legal_reference')
    and candidate_state not in ('unresolved','identity_conflict')) as typed_ready,
  (jurisdiction_resolution_state not in ('unresolved','conflict')) as jurisdiction_ready,
  (object_class = 'resource'
    and nullif(btrim(name),'') is not null
    and has_access_point
    and candidate_state not in ('unresolved','identity_conflict')
    and jurisdiction_resolution_state not in ('unresolved','conflict')) as direct_access_ready,
  case
    when object_class = 'unresolved_source_record' then 'unresolved_type'
    when object_class = 'unresolved_legal_reference' then 'unresolved_legal_reference'
    when candidate_state = 'identity_conflict' then 'identity_conflict'
    when candidate_state = 'unresolved' then 'identity_unresolved'
    when jurisdiction_resolution_state = 'conflict' then 'jurisdiction_conflict'
    when jurisdiction_resolution_state = 'unresolved' then 'jurisdiction_unresolved'
    when object_class = 'resource' and nullif(btrim(name),'') is null then 'resource_identity_unresolved'
    when object_class = 'resource' and not has_access_point then 'resource_access_unresolved'
    else 'current_typed'
  end as data_state
from ranked
where exact_source_rank = 1;

revoke all on public.v_lighthouse_civic_object_current_v1 from anon, authenticated;
grant select on public.v_lighthouse_civic_object_current_v1 to service_role;
