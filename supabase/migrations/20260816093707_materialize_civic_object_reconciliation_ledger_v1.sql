create table if not exists public.luminari_civic_object_reconciliation_v1 (
  object_ref text primary key,
  source_object_type text not null,
  object_class text not null,
  target_surface text not null,
  run_id uuid not null,
  artifact_key text not null,
  artifact_role text,
  source_locator text not null,
  source_content_sha256 text,
  source_candidate_hash text not null,
  parser_version text not null,
  jurisdiction text,
  state_code text,
  jurisdiction_resolution_state text not null,
  section_name text,
  name text,
  organization_name text,
  category text,
  layer text,
  phone text,
  email text,
  website_url text,
  address text,
  eligibility_summary text,
  apply_notes text,
  description text,
  filing_portal text,
  filing_portal_url text,
  statutory_authority text,
  deadline text,
  hours text,
  languages text,
  organization_type text,
  candidate_state text not null,
  source_created_at timestamptz not null,
  field_provenance jsonb not null default '{}'::jsonb,
  has_access_point boolean not null default false,
  projection_state text not null,
  projection_version text not null default 'civic_object_reconciliation_v1',
  reconciled_at timestamptz not null default now()
);

create index if not exists luminari_civic_object_reconciliation_v1_class_idx
  on public.luminari_civic_object_reconciliation_v1 (object_class, projection_state);
create index if not exists luminari_civic_object_reconciliation_v1_surface_idx
  on public.luminari_civic_object_reconciliation_v1 (target_surface, object_class);
create index if not exists luminari_civic_object_reconciliation_v1_jurisdiction_idx
  on public.luminari_civic_object_reconciliation_v1 (state_code, jurisdiction);
create index if not exists luminari_civic_object_reconciliation_v1_artifact_idx
  on public.luminari_civic_object_reconciliation_v1 (artifact_key);
create index if not exists luminari_civic_object_reconciliation_v1_state_idx
  on public.luminari_civic_object_reconciliation_v1 (candidate_state, jurisdiction_resolution_state);

alter table public.luminari_civic_object_reconciliation_v1 enable row level security;
revoke all on table public.luminari_civic_object_reconciliation_v1 from public, anon, authenticated;
grant select, insert, update, delete on table public.luminari_civic_object_reconciliation_v1 to service_role;

create or replace function public.reconcile_luminari_civic_object_v1(p_candidate_key text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_written boolean := false;
begin
  insert into public.luminari_civic_object_reconciliation_v1 (
    object_ref, source_object_type, object_class, target_surface,
    run_id, artifact_key, artifact_role, source_locator,
    source_content_sha256, source_candidate_hash, parser_version,
    jurisdiction, state_code, jurisdiction_resolution_state, section_name,
    name, organization_name, category, layer,
    phone, email, website_url, address,
    eligibility_summary, apply_notes, description,
    filing_portal, filing_portal_url, statutory_authority, deadline,
    hours, languages, organization_type,
    candidate_state, source_created_at, field_provenance,
    has_access_point, projection_state, projection_version, reconciled_at
  )
  select
    r.object_ref, r.source_object_type, r.object_class, r.target_surface,
    r.run_id, r.artifact_key, r.artifact_role, r.source_locator,
    r.source_content_sha256, r.candidate_hash, r.parser_version,
    r.jurisdiction, r.state_code, r.jurisdiction_resolution_state, r.section_name,
    r.name, r.organization_name, r.category, r.layer,
    r.phone, r.email, r.website_url, r.address,
    r.eligibility_summary, r.apply_notes, r.description,
    r.filing_portal, r.filing_portal_url, r.statutory_authority, r.deadline,
    r.hours, r.languages, r.organization_type,
    r.candidate_state, r.created_at, r.field_provenance,
    r.has_access_point, r.projection_state,
    'civic_object_reconciliation_v1', now()
  from public.v_civic_object_reconciled_v2 r
  where r.object_ref = p_candidate_key
  on conflict (object_ref) do update set
    source_object_type = excluded.source_object_type,
    object_class = excluded.object_class,
    target_surface = excluded.target_surface,
    run_id = excluded.run_id,
    artifact_key = excluded.artifact_key,
    artifact_role = excluded.artifact_role,
    source_locator = excluded.source_locator,
    source_content_sha256 = excluded.source_content_sha256,
    source_candidate_hash = excluded.source_candidate_hash,
    parser_version = excluded.parser_version,
    jurisdiction = excluded.jurisdiction,
    state_code = excluded.state_code,
    jurisdiction_resolution_state = excluded.jurisdiction_resolution_state,
    section_name = excluded.section_name,
    name = excluded.name,
    organization_name = excluded.organization_name,
    category = excluded.category,
    layer = excluded.layer,
    phone = excluded.phone,
    email = excluded.email,
    website_url = excluded.website_url,
    address = excluded.address,
    eligibility_summary = excluded.eligibility_summary,
    apply_notes = excluded.apply_notes,
    description = excluded.description,
    filing_portal = excluded.filing_portal,
    filing_portal_url = excluded.filing_portal_url,
    statutory_authority = excluded.statutory_authority,
    deadline = excluded.deadline,
    hours = excluded.hours,
    languages = excluded.languages,
    organization_type = excluded.organization_type,
    candidate_state = excluded.candidate_state,
    source_created_at = excluded.source_created_at,
    field_provenance = excluded.field_provenance,
    has_access_point = excluded.has_access_point,
    projection_state = excluded.projection_state,
    projection_version = excluded.projection_version,
    reconciled_at = excluded.reconciled_at;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function public.reconcile_luminari_civic_object_v1(text) from public, anon, authenticated;
grant execute on function public.reconcile_luminari_civic_object_v1(text) to service_role;

create or replace function public.reconcile_luminari_civic_objects_batch_v1(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_count integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'p_limit must be between 1 and 10000';
  end if;

  for v_key in
    select c.candidate_key
    from public.luminari_corpus_candidate_v1 c
    left join public.luminari_civic_object_reconciliation_v1 r
      on r.object_ref = c.candidate_key
    where r.object_ref is null
       or r.source_candidate_hash is distinct from c.candidate_hash
       or r.projection_version <> 'civic_object_reconciliation_v1'
    order by c.created_at, c.candidate_key
    limit p_limit
  loop
    perform public.reconcile_luminari_civic_object_v1(v_key);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.reconcile_luminari_civic_objects_batch_v1(integer) from public, anon, authenticated;
grant execute on function public.reconcile_luminari_civic_objects_batch_v1(integer) to service_role;

create or replace function public.sync_luminari_civic_object_reconciliation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.reconcile_luminari_civic_object_v1(new.candidate_key);
  return new;
end;
$$;

revoke all on function public.sync_luminari_civic_object_reconciliation_v1() from public, anon, authenticated;

drop trigger if exists trg_sync_luminari_civic_object_reconciliation_v1 on public.luminari_corpus_candidate_v1;
create trigger trg_sync_luminari_civic_object_reconciliation_v1
after insert or update on public.luminari_corpus_candidate_v1
for each row execute function public.sync_luminari_civic_object_reconciliation_v1();

create or replace view public.v_luminari_civic_object_reconciliation_status_v1
with (security_invoker = true)
as
select
  count(*) as reconciled_rows,
  count(*) filter (where projection_version='civic_object_reconciliation_v1') as current_projection_rows,
  count(*) filter (where object_class='resource') as resource_rows,
  count(*) filter (where projection_state='usable_resource_candidate') as usable_resource_candidates,
  count(*) filter (where projection_state='resource_needs_identity_recovery') as resource_needs_identity_recovery,
  count(*) filter (where projection_state='resource_missing_access_point') as resource_missing_access_point,
  count(*) filter (where object_class='unresolved_source_record') as unresolved_source_records,
  max(reconciled_at) as latest_reconciled_at
from public.luminari_civic_object_reconciliation_v1;

revoke all on table public.v_luminari_civic_object_reconciliation_status_v1 from public, anon, authenticated;
grant select on table public.v_luminari_civic_object_reconciliation_status_v1 to service_role;
