begin;

create table if not exists public.state_directory_profile_promotion (
  candidate_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  source_row_index integer not null,
  jurisdiction_code text not null,
  row_class text not null,
  row_payload jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted', 'duplicate')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, logical_record_id, source_row_index)
);

create table if not exists public.state_directory_portability_promotion (
  candidate_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  jurisdiction_code text not null,
  source_row_count integer not null,
  assessments jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('enriched', 'held')),
  target_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, logical_record_id)
);

create table if not exists public.state_directory_review_hold (
  logical_record_id text primary key references public.state_directory_logical_record(logical_record_id),
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_key text not null,
  source_file text not null,
  row_class text not null,
  hold_reason text not null,
  source_payload jsonb not null,
  status text not null default 'held' check (status = 'held'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_state_directory_profile_promotion_run_id
  on public.state_directory_profile_promotion(run_id);
create index if not exists idx_state_directory_profile_promotion_logical
  on public.state_directory_profile_promotion(logical_record_id);
create index if not exists idx_state_directory_portability_promotion_run_id
  on public.state_directory_portability_promotion(run_id);
create index if not exists idx_state_directory_portability_promotion_logical
  on public.state_directory_portability_promotion(logical_record_id);
create index if not exists idx_state_directory_review_hold_run_id
  on public.state_directory_review_hold(run_id);

alter table public.state_directory_profile_promotion enable row level security;
alter table public.state_directory_portability_promotion enable row level security;
alter table public.state_directory_review_hold enable row level security;

drop policy if exists "service_role_full_access" on public.state_directory_profile_promotion;
create policy "service_role_full_access" on public.state_directory_profile_promotion
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated_read_only" on public.state_directory_profile_promotion;
create policy "authenticated_read_only" on public.state_directory_profile_promotion
  for select to authenticated using (true);

drop policy if exists "service_role_full_access" on public.state_directory_portability_promotion;
create policy "service_role_full_access" on public.state_directory_portability_promotion
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated_read_only" on public.state_directory_portability_promotion;
create policy "authenticated_read_only" on public.state_directory_portability_promotion
  for select to authenticated using (true);

drop policy if exists "service_role_full_access" on public.state_directory_review_hold;
create policy "service_role_full_access" on public.state_directory_review_hold
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated_read_only" on public.state_directory_review_hold;
create policy "authenticated_read_only" on public.state_directory_review_hold
  for select to authenticated using (true);

create or replace view public.v_state_directory_profile_promotion_summary
with (security_invoker = true)
as
select
  run_id,
  disposition,
  row_class,
  count(*)::bigint as assertions,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_profile_promotion
group by run_id, disposition, row_class;

create or replace view public.v_state_directory_portability_promotion_summary
with (security_invoker = true)
as
select
  run_id,
  disposition,
  count(*)::bigint as jurisdiction_records,
  sum(source_row_count)::bigint as assessments,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_portability_promotion
group by run_id, disposition;

grant select on public.v_state_directory_profile_promotion_summary
  to authenticated, service_role;
grant select on public.v_state_directory_portability_promotion_summary
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
exploded as (
  select
    l.logical_record_id,
    l.source_file,
    l.record_fingerprint,
    l.row_class,
    j.jurisdiction_code,
    r.ordinality::integer as source_row_index,
    r.value as row_payload,
    'sdpa_' || md5(
      l.logical_record_id || '|' || r.ordinality::text || '|' || r.value::text
    ) as candidate_id,
    public.luminari_stable_uuid_v1(
      'sdpa|' || l.logical_record_id || '|' || r.ordinality::text || '|' || r.value::text
    ) as target_id
  from public.state_directory_logical_record l
  join jurisdiction_map j using (jurisdiction_key)
  cross join lateral jsonb_array_elements(l.normalized_payload->'rows')
    with ordinality r(value, ordinality)
  where l.run_id = 'state_directory_reassembly_v1_20260729'
    and l.route_lane = 'jurisdiction_profile'
)
insert into public.state_directory_profile_promotion (
  candidate_id,
  run_id,
  logical_record_id,
  source_row_index,
  jurisdiction_code,
  row_class,
  row_payload,
  record_fingerprint,
  disposition,
  target_id
)
select
  e.candidate_id,
  'state_directory_reassembly_v1_20260729',
  e.logical_record_id,
  e.source_row_index,
  e.jurisdiction_code,
  e.row_class,
  e.row_payload,
  e.record_fingerprint,
  case when a.id is null or a.id = e.target_id then 'inserted' else 'duplicate' end,
  coalesce(a.id, e.target_id)
from exploded e
left join public.jurisdiction_assertions a on a.id = e.target_id
on conflict (candidate_id) do update set
  row_payload = excluded.row_payload,
  record_fingerprint = excluded.record_fingerprint,
  disposition = excluded.disposition,
  target_id = excluded.target_id,
  updated_at = now();

insert into public.jurisdiction_assertions (
  id,
  source_table,
  source_record_id,
  source_name,
  source_hash,
  candidate_record_id,
  canonical_record_id,
  jurisdiction_type,
  jurisdiction_label,
  jurisdiction_code,
  relationship_type,
  confidence,
  evidence_basis,
  created_from_rule,
  review_status,
  promotion_status,
  promotion_batch_id,
  source_authority,
  metadata,
  created_at,
  updated_at
)
select
  p.target_id,
  'state_directory_logical_record',
  p.logical_record_id || ':' || p.source_row_index::text,
  l.source_file,
  p.record_fingerprint,
  p.candidate_id,
  p.target_id::text,
  case
    when p.jurisdiction_code = 'DC' then 'district'
    when p.jurisdiction_code in ('AS', 'GU', 'MP', 'PR', 'VI') then 'territory'
    else 'state'
  end,
  p.jurisdiction_code,
  p.jurisdiction_code,
  case
    when p.row_class = 'registry_metric' then 'registry_metric_evidence'
    else 'jurisdiction_profile_evidence'
  end,
  1.0,
  'source_document_table_row',
  'state_directory_profile_promotion_v1',
  'source_attached',
  'promoted',
  'v3_13_state_directory_profiles_001',
  'state_directory_source_document',
  jsonb_build_object(
    'engine_id', 'state_directory_profile_promotion',
    'engine_version', '1.0.0',
    'reassembly_run_id', p.run_id,
    'candidate_id', p.candidate_id,
    'logical_record_id', p.logical_record_id,
    'source_row_index', p.source_row_index,
    'row_class', p.row_class,
    'row_payload', p.row_payload,
    'record_fingerprint', p.record_fingerprint
  ),
  now(),
  now()
from public.state_directory_profile_promotion p
join public.state_directory_logical_record l
  on l.logical_record_id = p.logical_record_id
where p.run_id = 'state_directory_reassembly_v1_20260729'
  and p.disposition = 'inserted'
on conflict (id) do update set
  source_hash = excluded.source_hash,
  evidence_basis = excluded.evidence_basis,
  review_status = excluded.review_status,
  promotion_status = excluded.promotion_status,
  promotion_batch_id = excluded.promotion_batch_id,
  metadata = coalesce(public.jurisdiction_assertions.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with logical_targets as (
  select
    logical_record_id,
    array_agg(target_id::text order by source_row_index) as target_ids,
    count(*) filter (where disposition = 'inserted')::integer as inserted_count,
    count(*) filter (where disposition = 'duplicate')::integer as duplicate_count
  from public.state_directory_profile_promotion
  where run_id = 'state_directory_reassembly_v1_20260729'
  group by logical_record_id
)
update public.state_directory_logical_record l
set
  promotion_status = 'promoted',
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'profile_assertion_ids', to_jsonb(t.target_ids),
    'profile_inserted_count', t.inserted_count,
    'profile_duplicate_count', t.duplicate_count,
    'profile_promotion_engine', 'state_directory_profile_promotion_v1'
  ),
  updated_at = now()
from logical_targets t
where l.logical_record_id = t.logical_record_id;

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
candidates as (
  select
    l.logical_record_id,
    j.jurisdiction_code,
    jsonb_array_length(l.normalized_payload->'rows')::integer as source_row_count,
    l.normalized_payload->'rows' as assessments,
    l.record_fingerprint,
    'sdport_' || md5(l.logical_record_id) as candidate_id
  from public.state_directory_logical_record l
  join jurisdiction_map j using (jurisdiction_key)
  where l.run_id = 'state_directory_reassembly_v1_20260729'
    and l.route_lane = 'portability'
)
insert into public.state_directory_portability_promotion (
  candidate_id,
  run_id,
  logical_record_id,
  jurisdiction_code,
  source_row_count,
  assessments,
  record_fingerprint,
  disposition,
  target_id
)
select
  c.candidate_id,
  'state_directory_reassembly_v1_20260729',
  c.logical_record_id,
  c.jurisdiction_code,
  c.source_row_count,
  c.assessments,
  c.record_fingerprint,
  case when m.id is null then 'held' else 'enriched' end,
  m.id
from candidates c
left join lateral (
  select id
  from public.jurisdiction_claim_matrix
  where jurisdiction_id = c.jurisdiction_code
  order by id
  limit 1
) m on true
on conflict (candidate_id) do update set
  source_row_count = excluded.source_row_count,
  assessments = excluded.assessments,
  record_fingerprint = excluded.record_fingerprint,
  disposition = excluded.disposition,
  target_id = excluded.target_id,
  updated_at = now();

update public.jurisdiction_claim_matrix m
set
  overrides = (
    coalesce(nullif(m.overrides, ''), '{}')::jsonb || jsonb_build_object(
      'state_directory_portability_assessments', p.assessments,
      'state_directory_portability_source', jsonb_build_object(
        'engine_id', 'state_directory_portability_promotion',
        'engine_version', '1.0.0',
        'reassembly_run_id', p.run_id,
        'candidate_id', p.candidate_id,
        'logical_record_id', p.logical_record_id,
        'record_fingerprint', p.record_fingerprint
      )
    )
  )::text,
  updated_at = (extract(epoch from now()) * 1000)::bigint
from public.state_directory_portability_promotion p
where p.run_id = 'state_directory_reassembly_v1_20260729'
  and p.disposition = 'enriched'
  and m.id = p.target_id;

update public.state_directory_logical_record l
set
  promotion_status = case when p.disposition = 'enriched' then 'promoted' else 'held' end,
  canonical_record_id = p.target_id::text,
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'portability_target_id', p.target_id,
    'portability_disposition', p.disposition,
    'portability_assessment_count', p.source_row_count,
    'portability_promotion_engine', 'state_directory_portability_promotion_v1'
  ),
  updated_at = now()
from public.state_directory_portability_promotion p
where l.logical_record_id = p.logical_record_id
  and p.run_id = 'state_directory_reassembly_v1_20260729';

insert into public.state_directory_review_hold (
  logical_record_id,
  run_id,
  jurisdiction_key,
  source_file,
  row_class,
  hold_reason,
  source_payload,
  status
)
select
  l.logical_record_id,
  l.run_id,
  l.jurisdiction_key,
  l.source_file,
  l.row_class,
  'Payload shape is not mapped to a canonical backbone lane; preserved for explicit contract review.',
  l.normalized_payload,
  'held'
from public.state_directory_logical_record l
where l.run_id = 'state_directory_reassembly_v1_20260729'
  and l.route_lane = 'review'
on conflict (logical_record_id) do update set
  hold_reason = excluded.hold_reason,
  source_payload = excluded.source_payload,
  updated_at = now();

update public.state_directory_logical_record l
set
  promotion_status = 'held',
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'review_hold_reason', 'unmapped_payload_shape',
    'review_hold_table', 'state_directory_review_hold'
  ),
  updated_at = now()
where l.run_id = 'state_directory_reassembly_v1_20260729'
  and l.route_lane = 'review';

insert into public.substrate_promotion_batch (
  batch_name, domain_key, source_artifact_id, status, candidate_count,
  inserted_count, enriched_count, duplicate_count, rejected_count,
  started_at, completed_at, rollback_metadata, notes
)
select
  'v3_13_state_directory_profiles_001',
  'jurisdiction_profile',
  a.artifact_id,
  'completed',
  count(*)::bigint,
  count(*) filter (where p.disposition = 'inserted')::bigint,
  0,
  count(*) filter (where p.disposition = 'duplicate')::bigint,
  0,
  now(), now(),
  jsonb_build_object(
    'target_table', 'jurisdiction_assertions',
    'ledger_table', 'state_directory_profile_promotion',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'non_destructive', true
  ),
  'Jurisdiction snapshot and registry metric rows were promoted as source-attached assertions with deterministic IDs.'
from public.state_directory_profile_promotion p
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

insert into public.substrate_promotion_batch (
  batch_name, domain_key, source_artifact_id, status, candidate_count,
  inserted_count, enriched_count, duplicate_count, rejected_count,
  started_at, completed_at, rollback_metadata, notes
)
select
  'v3_13_state_directory_portability_001',
  'jurisdiction_portability',
  a.artifact_id,
  case when count(*) filter (where p.disposition = 'held') = 0 then 'completed' else 'held' end,
  count(*)::bigint,
  0,
  count(*) filter (where p.disposition = 'enriched')::bigint,
  0,
  0,
  now(), now(),
  jsonb_build_object(
    'target_table', 'jurisdiction_claim_matrix',
    'ledger_table', 'state_directory_portability_promotion',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'write_policy', 'enrich_existing_overrides',
    'non_destructive', true
  ),
  'Portability assessments enriched existing jurisdiction claim-matrix rows; no competing jurisdiction records were created.'
from public.state_directory_portability_promotion p
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

insert into public.substrate_promotion_batch (
  batch_name, domain_key, source_artifact_id, status, candidate_count,
  inserted_count, enriched_count, duplicate_count, rejected_count,
  started_at, completed_at, rollback_metadata, notes
)
select
  'v3_13_state_directory_review_hold_001',
  'unmapped_review',
  a.artifact_id,
  'held',
  count(*)::bigint,
  0, 0, 0, 0,
  now(), now(),
  jsonb_build_object(
    'hold_table', 'state_directory_review_hold',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'source_preserved', true
  ),
  'Two unmapped logical records remain explicitly held with full payloads; nothing was discarded.'
from public.state_directory_review_hold h
cross join public.substrate_source_artifact a
where h.run_id = 'state_directory_reassembly_v1_20260729'
  and a.source_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
group by a.artifact_id
on conflict (batch_name) do update set
  status = excluded.status,
  candidate_count = excluded.candidate_count,
  completed_at = excluded.completed_at,
  rollback_metadata = excluded.rollback_metadata,
  notes = excluded.notes;

commit;
