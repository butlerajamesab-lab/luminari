-- Service-only, append-only storage for manually reviewed source material that
-- is useful to the platform but is not a person-facing route binding.
-- Nothing in this migration grants public access or creates a public surface.

create table if not exists public.luminari_reviewed_source_supplement_revision_v1 (
  supplement_revision_id uuid primary key default gen_random_uuid(),
  run_id uuid not null
    references public.luminari_corpus_rebuild_run_v1(run_id) on delete restrict,
  supplement_revision_key text not null,
  supplement_key text not null,
  supplement_type text not null,
  source_filename text not null,
  source_content_sha256 text not null,
  manual_review_ledger_sha256 text not null,
  source_record_id text not null,
  source_order integer not null,
  source_pages integer[] not null,
  source_section text not null,
  source_status text not null,
  title text not null,
  jurisdiction_code text,
  access_state text not null default 'service_only',
  visibility_state text not null,
  requires_separate_publication_gate boolean not null default true,
  publication_candidate_surface text,
  record_payload_sha256 text not null,
  record_payload jsonb not null,
  field_provenance jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, supplement_key),
  unique (run_id, supplement_revision_key),
  constraint luminari_reviewed_source_supplement_revision_key_check
    check (supplement_revision_key ~ '^[0-9a-f]{64}$'),
  constraint luminari_reviewed_source_supplement_source_hash_check
    check (
      source_content_sha256 ~ '^[0-9a-f]{64}$'
      and manual_review_ledger_sha256 ~ '^[0-9a-f]{64}$'
      and record_payload_sha256 ~ '^[0-9a-f]{64}$'
    ),
  constraint luminari_reviewed_source_supplement_type_check
    check (supplement_type in (
      'authority', 'jurisdiction_entry_point', 'handoff', 'integrity_flag'
    )),
  constraint luminari_reviewed_source_supplement_locator_check
    check (
      source_order > 0
      and cardinality(source_pages) > 0
      and array_position(source_pages, null) is null
      and 0 < all (source_pages)
    ),
  constraint luminari_reviewed_source_supplement_access_check
    check (access_state = 'service_only'),
  constraint luminari_reviewed_source_supplement_visibility_check
    check (visibility_state in (
      'eligible_for_separate_gate',
      'service_only',
      'withheld_missing_access_point',
      'withheld_integrity',
      'historical_only'
    )),
  constraint luminari_reviewed_source_supplement_gate_check
    check (requires_separate_publication_gate),
  constraint luminari_reviewed_source_supplement_payload_check
    check (
      jsonb_typeof(record_payload) = 'object'
      and jsonb_typeof(field_provenance) = 'object'
    )
);

comment on table public.luminari_reviewed_source_supplement_revision_v1 is
  'Append-only, service-only revisions for reviewed authorities, jurisdiction entry points, handoffs, and integrity flags. A separate publication/access decision is required before any downstream public projection.';

create index if not exists luminari_reviewed_source_supplement_key_idx
  on public.luminari_reviewed_source_supplement_revision_v1
  (supplement_key, created_at desc, supplement_revision_id desc);
create index if not exists luminari_reviewed_source_supplement_source_idx
  on public.luminari_reviewed_source_supplement_revision_v1
  (source_filename, source_record_id, created_at desc);
create index if not exists luminari_reviewed_source_supplement_type_idx
  on public.luminari_reviewed_source_supplement_revision_v1
  (supplement_type, visibility_state, jurisdiction_code);
create index if not exists luminari_reviewed_source_supplement_run_idx
  on public.luminari_reviewed_source_supplement_revision_v1
  (run_id, source_order);
create index if not exists luminari_reviewed_source_supplement_pages_idx
  on public.luminari_reviewed_source_supplement_revision_v1
  using gin (source_pages);

alter table public.luminari_reviewed_source_supplement_revision_v1
  enable row level security;
revoke all on table public.luminari_reviewed_source_supplement_revision_v1
  from public, anon, authenticated, service_role;

create policy luminari_reviewed_source_supplement_service_select_v1
  on public.luminari_reviewed_source_supplement_revision_v1
  for select
  to service_role
  using (true);
create policy luminari_reviewed_source_supplement_service_insert_v1
  on public.luminari_reviewed_source_supplement_revision_v1
  for insert
  to service_role
  with check (
    access_state = 'service_only'
    and requires_separate_publication_gate
  );

grant select, insert
  on table public.luminari_reviewed_source_supplement_revision_v1
  to service_role;

create or replace function public.register_luminari_reviewed_source_supplement_v1(
  p_run_id uuid,
  p_source jsonb,
  p_record jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_source_filename text := nullif(btrim(p_source->>'filename'), '');
  v_source_sha text := nullif(btrim(p_source->>'content_sha256'), '');
  v_ledger_sha text := nullif(btrim(p_source->>'manual_review_ledger_sha256'), '');
  v_supplement_key text := nullif(btrim(p_record->>'supplement_key'), '');
  v_revision_key text := nullif(btrim(p_record->>'supplement_revision_key'), '');
  v_type text := nullif(btrim(p_record->>'supplement_type'), '');
  v_source_record_id text := nullif(btrim(p_record->>'source_record_id'), '');
  v_source_pages integer[];
  v_record_id uuid;
  v_existing_revision_key text;
  v_existing_payload_sha text;
begin
  perform public.assert_luminari_manual_review_run_v1(p_run_id);

  if v_source_filename is null
     or v_source_sha !~ '^[0-9a-f]{64}$'
     or v_ledger_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'reviewed supplement source filename and hashes are required';
  end if;
  if v_supplement_key is null
     or v_revision_key !~ '^[0-9a-f]{64}$'
     or v_source_record_id is null then
    raise exception 'reviewed supplement identity and revision key are required';
  end if;
  if v_type not in (
    'authority', 'jurisdiction_entry_point', 'handoff', 'integrity_flag'
  ) then
    raise exception 'unsupported reviewed supplement type %', v_type;
  end if;
  if p_record->>'access_state' is distinct from 'service_only'
     or coalesce((p_record->>'requires_separate_publication_gate')::boolean, false) is not true then
    raise exception 'reviewed supplements must remain service-only and separately gated';
  end if;
  if p_record->>'visibility_state' not in (
    'eligible_for_separate_gate', 'service_only',
    'withheld_missing_access_point', 'withheld_integrity', 'historical_only'
  ) then
    raise exception 'invalid reviewed supplement visibility state';
  end if;
  if coalesce(p_record->>'record_payload_sha256', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_record->'record_payload') is distinct from 'object'
     or jsonb_typeof(p_record->'field_provenance') is distinct from 'object' then
    raise exception 'reviewed supplement payload and provenance are required';
  end if;

  select array_agg(value::integer order by ordinality)
    into v_source_pages
  from jsonb_array_elements_text(p_record->'source_pages')
    with ordinality as pages(value, ordinality);

  if coalesce(cardinality(v_source_pages), 0) = 0
     or exists (
       select 1
       from unnest(v_source_pages) as pages(page)
       where page <= 0
     ) then
    raise exception 'reviewed supplement page provenance is required';
  end if;

  insert into public.luminari_reviewed_source_supplement_revision_v1 (
    run_id, supplement_revision_key, supplement_key, supplement_type,
    source_filename, source_content_sha256, manual_review_ledger_sha256,
    source_record_id, source_order, source_pages, source_section,
    source_status, title, jurisdiction_code, access_state, visibility_state,
    requires_separate_publication_gate, publication_candidate_surface,
    record_payload_sha256, record_payload, field_provenance
  ) values (
    p_run_id, v_revision_key, v_supplement_key, v_type,
    v_source_filename, v_source_sha, v_ledger_sha, v_source_record_id,
    (p_record->>'source_order')::integer, v_source_pages,
    p_record->>'source_section', p_record->>'source_status',
    p_record->>'title', nullif(btrim(p_record->>'jurisdiction_code'), ''),
    'service_only', p_record->>'visibility_state', true,
    nullif(btrim(p_record->>'publication_candidate_surface'), ''),
    p_record->>'record_payload_sha256', p_record->'record_payload',
    p_record->'field_provenance'
  )
  on conflict (run_id, supplement_key) do nothing
  returning supplement_revision_id into v_record_id;

  if v_record_id is null then
    select supplement_revision_id, supplement_revision_key,
           record_payload_sha256
      into v_record_id, v_existing_revision_key, v_existing_payload_sha
    from public.luminari_reviewed_source_supplement_revision_v1
    where run_id = p_run_id and supplement_key = v_supplement_key;

    if v_existing_revision_key is distinct from v_revision_key
       or v_existing_payload_sha is distinct from p_record->>'record_payload_sha256' then
      raise exception
        'same reviewed supplement key was presented with different content: %',
        v_supplement_key;
    end if;
  end if;

  return jsonb_build_object(
    'supplement_revision_id', v_record_id,
    'supplement_key', v_supplement_key,
    'supplement_revision_key', v_revision_key,
    'supplement_type', v_type,
    'access_state', 'service_only',
    'requires_separate_publication_gate', true
  );
end;
$function$;

revoke all on function public.register_luminari_reviewed_source_supplement_v1(
  uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.register_luminari_reviewed_source_supplement_v1(
  uuid, jsonb, jsonb
) to service_role;

create or replace view public.v_luminari_reviewed_source_supplement_current_v1
with (security_invoker = true) as
with ranked as (
  select
    s.*,
    row_number() over (
      partition by s.supplement_key
      order by r.completed_at desc, s.created_at desc,
               s.supplement_revision_id desc
    ) as supplement_rank
  from public.luminari_reviewed_source_supplement_revision_v1 s
  join public.luminari_corpus_rebuild_run_v1 r on r.run_id = s.run_id
  where r.status = 'completed'
    and r.engine_version like 'manual_source_review_reconciliation_v%'
)
select
  supplement_revision_id, run_id, supplement_revision_key, supplement_key,
  supplement_type, source_filename, source_content_sha256,
  manual_review_ledger_sha256, source_record_id, source_order, source_pages,
  source_section, source_status, title, jurisdiction_code, access_state,
  visibility_state, requires_separate_publication_gate,
  publication_candidate_surface, record_payload_sha256, record_payload,
  field_provenance, created_at,
  false as publication_gate_met,
  'separate_access_or_publication_gate_required'::text as publication_state
from ranked
where supplement_rank = 1;

comment on view public.v_luminari_reviewed_source_supplement_current_v1 is
  'Service-only latest reviewed supplements. This view never makes a record public; a separate approved access/publication gate and downstream projection are required.';

revoke all on public.v_luminari_reviewed_source_supplement_current_v1
  from public, anon, authenticated, service_role;
grant select on public.v_luminari_reviewed_source_supplement_current_v1
  to service_role;
