begin;

create table if not exists public.state_directory_workflow_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_code text not null,
  workflow_type text not null,
  preferred_logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  source_logical_record_ids text[] not null,
  source_files text[] not null,
  source_record_count integer not null,
  preferred_steps jsonb not null,
  source_payloads jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted', 'duplicate')),
  target_uuid text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, jurisdiction_code, workflow_type)
);

create index if not exists idx_state_directory_workflow_promotion_run_id
  on public.state_directory_workflow_promotion(run_id);
create index if not exists idx_state_directory_workflow_promotion_preferred
  on public.state_directory_workflow_promotion(preferred_logical_record_id);
create index if not exists idx_state_directory_workflow_promotion_disposition
  on public.state_directory_workflow_promotion(disposition, jurisdiction_code);

alter table public.state_directory_workflow_promotion enable row level security;
drop policy if exists "service_role_full_access" on public.state_directory_workflow_promotion;
create policy "service_role_full_access" on public.state_directory_workflow_promotion
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated_read_only" on public.state_directory_workflow_promotion;
create policy "authenticated_read_only" on public.state_directory_workflow_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_workflow_promotion_summary
with (security_invoker = true)
as
select
  run_id,
  disposition,
  workflow_type,
  count(*)::bigint as workflows,
  sum(source_record_count)::bigint as source_logical_records,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_workflow_promotion
group by run_id, disposition, workflow_type;

grant select on public.v_state_directory_workflow_promotion_summary
  to authenticated, service_role;

with jurisdiction_map as (
  select distinct on (
    regexp_replace(lower(split_part(name, '(', 1)), '[^a-z0-9]+', '', 'g')
  )
    regexp_replace(lower(split_part(name, '(', 1)), '[^a-z0-9]+', '', 'g') as jurisdiction_key,
    upper(abbreviation) as jurisdiction_code
  from public.registry_jurisdictions
  where abbreviation is not null
  order by
    regexp_replace(lower(split_part(name, '(', 1)), '[^a-z0-9]+', '', 'g'),
    (population_rj is not null) desc,
    created_at_rj desc
),
ranked_source as (
  select
    l.*,
    j.jurisdiction_code,
    row_number() over (partition by l.source_file order by l.table_idx) as workflow_rank,
    count(*) over (partition by l.source_file) as workflow_count,
    lower(l.normalized_payload::text) as body
  from public.state_directory_logical_record l
  join jurisdiction_map j using (jurisdiction_key)
  where l.run_id = 'state_directory_reassembly_v1_20260729'
    and l.route_lane = 'workflow'
),
typed as (
  select
    r.*,
    case
      when r.workflow_count > 1 and r.workflow_rank = 1 then 'housing_violation'
      when r.workflow_count > 1 and r.workflow_rank = 2 then 'wage_theft'
      when r.workflow_count > 1 and r.workflow_rank = 3 then 'benefits_denial'
      when r.workflow_count > 1 and r.workflow_rank = 4 then 'employment_discrimination'
      when r.workflow_count > 1 and r.workflow_rank = 5 then 'insurance_denial'
      when r.workflow_count > 1 and r.workflow_rank = 6 then 'elder_abuse'
      when r.body ~ '(wage|flsa|labor)' then 'wage_theft'
      when r.body ~ '(job loss|benefit|unemployment|ui)' then 'benefits_denial'
      when r.body ~ '(housing|eviction|tenant|island-specific resources)' then 'housing_navigation'
      else 'general_navigation'
    end as workflow_type
  from ranked_source r
),
preference as (
  select
    t.*,
    row_number() over (
      partition by t.jurisdiction_code, t.workflow_type
      order by
        t.deduped_source_row_count desc,
        case when t.source_file like '%(1)%' then 1 else 0 end,
        t.source_file,
        t.logical_record_id
    ) as preference_rank
  from typed t
),
grouped as (
  select
    p.jurisdiction_code,
    p.workflow_type,
    array_agg(p.logical_record_id order by p.preference_rank, p.logical_record_id)
      as source_logical_record_ids,
    array_agg(p.source_file order by p.preference_rank, p.logical_record_id)
      as source_files,
    count(*)::integer as source_record_count,
    jsonb_agg(p.normalized_payload order by p.preference_rank, p.logical_record_id)
      as source_payloads,
    'sdw_' || lower(p.jurisdiction_code) || '_' || p.workflow_type as generated_uuid
  from preference p
  group by p.jurisdiction_code, p.workflow_type
),
preferred as (
  select
    p.jurisdiction_code,
    p.workflow_type,
    p.logical_record_id as preferred_logical_record_id,
    p.normalized_payload->'rows' as preferred_steps
  from preference p
  where p.preference_rank = 1
),
matched as (
  select
    g.*,
    p.preferred_logical_record_id,
    p.preferred_steps,
    m.uuid as existing_uuid,
    'sdwg_' || md5(g.jurisdiction_code || '|' || g.workflow_type)
      as candidate_group_id,
    md5(
      g.jurisdiction_code || '|' || g.workflow_type || '|' || g.source_payloads::text
    ) as record_fingerprint
  from grouped g
  join preferred p using (jurisdiction_code, workflow_type)
  left join lateral (
    select w.uuid
    from public.workflow_registry w
    where lower(coalesce(w.workflow_type, '')) = g.workflow_type
      and upper(coalesce(w.jurisdiction, '')) = g.jurisdiction_code
    order by case when w.uuid = g.generated_uuid then 0 else 1 end, w.uuid
    limit 1
  ) m on true
)
insert into public.state_directory_workflow_promotion (
  candidate_group_id,
  run_id,
  jurisdiction_code,
  workflow_type,
  preferred_logical_record_id,
  source_logical_record_ids,
  source_files,
  source_record_count,
  preferred_steps,
  source_payloads,
  record_fingerprint,
  disposition,
  target_uuid
)
select
  m.candidate_group_id,
  'state_directory_reassembly_v1_20260729',
  m.jurisdiction_code,
  m.workflow_type,
  m.preferred_logical_record_id,
  m.source_logical_record_ids,
  m.source_files,
  m.source_record_count,
  m.preferred_steps,
  m.source_payloads,
  m.record_fingerprint,
  case
    when m.existing_uuid is null or m.existing_uuid = m.generated_uuid then 'inserted'
    else 'duplicate'
  end,
  coalesce(m.existing_uuid, m.generated_uuid)
from matched m
on conflict (candidate_group_id) do update set
  preferred_logical_record_id = excluded.preferred_logical_record_id,
  source_logical_record_ids = excluded.source_logical_record_ids,
  source_files = excluded.source_files,
  source_record_count = excluded.source_record_count,
  preferred_steps = excluded.preferred_steps,
  source_payloads = excluded.source_payloads,
  record_fingerprint = excluded.record_fingerprint,
  disposition = excluded.disposition,
  target_uuid = excluded.target_uuid,
  updated_at = now();

with prepared as (
  select
    p.*,
    (
      select x.value->>'agency___contact'
      from jsonb_array_elements(p.preferred_steps) x(value)
      order by case
        when coalesce(x.value->>'step', '') ~ '^\d+$' then (x.value->>'step')::integer
        else 999
      end
      limit 1
    ) as entry_agency,
    (
      select x.value->>'deadline'
      from jsonb_array_elements(p.preferred_steps) x(value)
      where nullif(btrim(x.value->>'deadline'), '') is not null
      order by
        case when x.value->>'deadline' ~* '(fatal|same day|immediately)' then 0 else 1 end,
        case
          when coalesce(x.value->>'step', '') ~ '^\d+$' then (x.value->>'step')::integer
          else 999
        end
      limit 1
    ) as filing_deadline,
    (
      select jsonb_agg(distinct x.value->>'agency___contact')
      from jsonb_array_elements(p.preferred_steps) x(value)
      where nullif(btrim(x.value->>'agency___contact'), '') is not null
    ) as filing_methods,
    (
      select jsonb_agg(distinct x.value->>'documents_needed')
      from jsonb_array_elements(p.preferred_steps) x(value)
      where nullif(btrim(x.value->>'documents_needed'), '') is not null
    ) as required_documents,
    (
      select string_agg(coalesce(x.value->>'agency___contact', ''), ' ')
      from jsonb_array_elements(p.preferred_steps) x(value)
    ) as agency_text
  from public.state_directory_workflow_promotion p
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition = 'inserted'
)
insert into public.workflow_registry (
  uuid,
  workflow_type,
  jurisdiction,
  entry_agency,
  filing_deadline,
  extended_deadline,
  filing_methods,
  required_documents,
  escalation_pathways,
  official_portal,
  related_statutes,
  verification_status,
  created_at
)
select
  p.target_uuid,
  p.workflow_type,
  p.jurisdiction_code,
  p.entry_agency,
  p.filing_deadline,
  null,
  coalesce(p.filing_methods, '[]'::jsonb),
  coalesce(p.required_documents, '[]'::jsonb),
  jsonb_build_object(
    'steps', p.preferred_steps,
    'source_payloads', p.source_payloads,
    'engine_id', 'state_directory_workflow_promotion',
    'engine_version', '1.0.0',
    'reassembly_run_id', p.run_id,
    'candidate_group_id', p.candidate_group_id,
    'preferred_logical_record_id', p.preferred_logical_record_id,
    'source_logical_record_ids', to_jsonb(p.source_logical_record_ids),
    'source_files', to_jsonb(p.source_files),
    'record_fingerprint', p.record_fingerprint
  ),
  public.state_directory_contact_url(p.agency_text),
  '[]'::jsonb,
  'source_attached',
  now()
from prepared p
on conflict (uuid) do update set
  workflow_type = coalesce(nullif(public.workflow_registry.workflow_type, ''), excluded.workflow_type),
  jurisdiction = coalesce(nullif(public.workflow_registry.jurisdiction, ''), excluded.jurisdiction),
  entry_agency = coalesce(nullif(public.workflow_registry.entry_agency, ''), excluded.entry_agency),
  filing_deadline = coalesce(nullif(public.workflow_registry.filing_deadline, ''), excluded.filing_deadline),
  filing_methods = coalesce(public.workflow_registry.filing_methods, '[]'::jsonb) || excluded.filing_methods,
  required_documents = coalesce(public.workflow_registry.required_documents, '[]'::jsonb) || excluded.required_documents,
  escalation_pathways = excluded.escalation_pathways,
  official_portal = coalesce(nullif(public.workflow_registry.official_portal, ''), excluded.official_portal),
  verification_status = case
    when public.workflow_registry.verification_status = 'verified' then 'verified'
    else excluded.verification_status
  end;

with exploded as (
  select p.*, unnest(p.source_logical_record_ids) as logical_record_id
  from public.state_directory_workflow_promotion p
  where p.run_id = 'state_directory_reassembly_v1_20260729'
)
update public.state_directory_logical_record l
set
  promotion_status = case
    when e.disposition = 'inserted' then 'promoted'
    else 'duplicate'
  end,
  canonical_record_id = e.target_uuid,
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'workflow_target_uuid', e.target_uuid,
    'workflow_type', e.workflow_type,
    'workflow_promotion_disposition', e.disposition,
    'workflow_source_versions_merged', e.source_record_count,
    'workflow_promotion_engine', 'state_directory_workflow_promotion_v1'
  ),
  updated_at = now()
from exploded e
where l.logical_record_id = e.logical_record_id;

insert into public.substrate_promotion_batch (
  batch_name,
  domain_key,
  source_artifact_id,
  status,
  candidate_count,
  inserted_count,
  enriched_count,
  duplicate_count,
  rejected_count,
  started_at,
  completed_at,
  rollback_metadata,
  notes
)
select
  'v3_13_state_directory_workflows_001',
  'workflow',
  a.artifact_id,
  'completed',
  count(*)::bigint,
  count(*) filter (where p.disposition = 'inserted')::bigint,
  0,
  count(*) filter (where p.disposition = 'duplicate')::bigint,
  0,
  now(),
  now(),
  jsonb_build_object(
    'target_table', 'workflow_registry',
    'ledger_table', 'state_directory_workflow_promotion',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'canonical_identity', 'jurisdiction_code + workflow_type',
    'non_destructive', true
  ),
  'Workflow logical records were classified by stable source order, collapsed across repeated source versions, and promoted with ordered steps and full provenance.'
from public.state_directory_workflow_promotion p
cross join public.substrate_source_artifact a
where p.run_id = 'state_directory_reassembly_v1_20260729'
  and a.source_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
group by a.artifact_id
on conflict (batch_name) do update set
  status = excluded.status,
  candidate_count = excluded.candidate_count,
  inserted_count = excluded.inserted_count,
  enriched_count = excluded.enriched_count,
  duplicate_count = excluded.duplicate_count,
  rejected_count = excluded.rejected_count,
  completed_at = excluded.completed_at,
  rollback_metadata = excluded.rollback_metadata,
  notes = excluded.notes;

comment on table public.state_directory_workflow_promotion is
  'Deterministic jurisdiction and workflow-type disposition ledger for v3.13 state directory workflow promotion.';

commit;
