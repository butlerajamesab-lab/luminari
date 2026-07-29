begin;

create table if not exists public.state_directory_organization_resource_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_code text not null,
  normalized_identity text not null,
  display_name text not null,
  logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  source_file text not null,
  row_payload jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (
    disposition in ('inserted', 'duplicate_entity', 'duplicate_registry')
  ),
  target_table text not null,
  target_record_id text not null,
  canonical_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, jurisdiction_code, normalized_identity)
);

create table if not exists public.state_directory_field_resource_promotion (
  candidate_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  jurisdiction_code text not null,
  display_name text not null,
  service_type text,
  website_url text,
  url_key text,
  phone_value text,
  phone_key text,
  source_payload jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (
    disposition in ('inserted', 'enriched', 'held_ambiguous')
  ),
  match_method text not null,
  target_resource_entity_id uuid,
  canonical_id text,
  matched_resource_entity_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, logical_record_id)
);

create index if not exists idx_state_directory_org_resource_run_id
  on public.state_directory_organization_resource_promotion(run_id);
create index if not exists idx_state_directory_org_resource_logical
  on public.state_directory_organization_resource_promotion(logical_record_id);
create index if not exists idx_state_directory_org_resource_disposition
  on public.state_directory_organization_resource_promotion(disposition, jurisdiction_code);
create index if not exists idx_state_directory_field_resource_run_id
  on public.state_directory_field_resource_promotion(run_id);
create index if not exists idx_state_directory_field_resource_logical
  on public.state_directory_field_resource_promotion(logical_record_id);
create index if not exists idx_state_directory_field_resource_disposition
  on public.state_directory_field_resource_promotion(disposition, jurisdiction_code);

alter table public.state_directory_organization_resource_promotion enable row level security;
alter table public.state_directory_field_resource_promotion enable row level security;

drop policy if exists "service_role_full_access"
  on public.state_directory_organization_resource_promotion;
create policy "service_role_full_access"
  on public.state_directory_organization_resource_promotion
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated_read_only"
  on public.state_directory_organization_resource_promotion;
create policy "authenticated_read_only"
  on public.state_directory_organization_resource_promotion
  for select to authenticated using (true);

drop policy if exists "service_role_full_access"
  on public.state_directory_field_resource_promotion;
create policy "service_role_full_access"
  on public.state_directory_field_resource_promotion
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated_read_only"
  on public.state_directory_field_resource_promotion;
create policy "authenticated_read_only"
  on public.state_directory_field_resource_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_remaining_resource_summary
with (security_invoker = true)
as
select
  'organization_list'::text as resource_lane,
  run_id,
  disposition,
  count(*)::bigint as candidates,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_organization_resource_promotion
group by run_id, disposition
union all
select
  'field_information'::text,
  run_id,
  disposition,
  count(*)::bigint,
  count(distinct jurisdiction_code)::integer
from public.state_directory_field_resource_promotion
group by run_id, disposition;

grant select on public.v_state_directory_remaining_resource_summary
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
    j.jurisdiction_code,
    r.value as row_payload,
    nullif(btrim(r.value->>'organization'), '') as display_name,
    regexp_replace(
      lower(coalesce(r.value->>'organization', '')),
      '[^a-z0-9]+', '', 'g'
    ) as normalized_identity,
    'sdorg_' || lower(j.jurisdiction_code) || '_' || substr(md5(
      j.jurisdiction_code || '|' || regexp_replace(
        lower(coalesce(r.value->>'organization', '')),
        '[^a-z0-9]+', '', 'g'
      )
    ), 1, 20) as generated_canonical_id
  from public.state_directory_logical_record l
  join jurisdiction_map j using (jurisdiction_key)
  cross join lateral jsonb_array_elements(l.normalized_payload->'rows') r(value)
  where l.run_id = 'state_directory_reassembly_v1_20260729'
    and l.route_lane = 'resource_entity'
    and l.candidate_status = 'batch_requires_expansion'
),
matched as (
  select
    e.*,
    em.resource_entity_id as entity_match_id,
    em.canonical_id as entity_match_canonical_id,
    rm.registry_id as registry_match_id,
    'sdorgg_' || md5(e.jurisdiction_code || '|' || e.normalized_identity)
      as candidate_group_id,
    public.luminari_stable_uuid_v1(e.generated_canonical_id)
      as generated_resource_entity_id
  from exploded e
  left join lateral (
    select x.resource_entity_id, x.canonical_id
    from public.luminari_resource_entities x
    where regexp_replace(lower(x.resource_name), '[^a-z0-9]+', '', 'g') = e.normalized_identity
      and upper(coalesce(x.state, x.jurisdiction, '')) = e.jurisdiction_code
    order by x.resource_entity_id
    limit 1
  ) em on true
  left join lateral (
    select p.id as registry_id
    from public.registry_programs p
    where regexp_replace(lower(p.name), '[^a-z0-9]+', '', 'g') = e.normalized_identity
      and upper(coalesce(p.jurisdiction_id, '')) = e.jurisdiction_code
    order by p.id
    limit 1
  ) rm on true
  where e.normalized_identity <> ''
)
insert into public.state_directory_organization_resource_promotion (
  candidate_group_id,
  run_id,
  jurisdiction_code,
  normalized_identity,
  display_name,
  logical_record_id,
  source_file,
  row_payload,
  record_fingerprint,
  disposition,
  target_table,
  target_record_id,
  canonical_id
)
select
  m.candidate_group_id,
  'state_directory_reassembly_v1_20260729',
  m.jurisdiction_code,
  m.normalized_identity,
  m.display_name,
  m.logical_record_id,
  m.source_file,
  m.row_payload,
  m.record_fingerprint,
  case
    when m.entity_match_id is not null then 'duplicate_entity'
    when m.registry_match_id is not null then 'duplicate_registry'
    else 'inserted'
  end,
  case
    when m.registry_match_id is not null and m.entity_match_id is null then 'registry_programs'
    else 'luminari_resource_entities'
  end,
  case
    when m.entity_match_id is not null then m.entity_match_id::text
    when m.registry_match_id is not null then m.registry_match_id
    else m.generated_resource_entity_id::text
  end,
  case
    when m.entity_match_id is not null then m.entity_match_canonical_id
    when m.registry_match_id is not null then null
    else m.generated_canonical_id
  end
from matched m
on conflict (candidate_group_id) do update set
  row_payload = excluded.row_payload,
  record_fingerprint = excluded.record_fingerprint,
  disposition = excluded.disposition,
  target_table = excluded.target_table,
  target_record_id = excluded.target_record_id,
  canonical_id = excluded.canonical_id,
  updated_at = now();

insert into public.luminari_resource_entities (
  resource_entity_id,
  canonical_id,
  source_family_key,
  source_table,
  source_pk,
  source_hash,
  resource_name,
  resource_type,
  resource_category,
  layer,
  jurisdiction,
  jurisdiction_scope,
  state,
  description,
  service_categories,
  domains,
  metadata,
  verification_status,
  promotion_status,
  provenance_status,
  created_at,
  updated_at
)
select
  p.target_record_id::uuid,
  p.canonical_id,
  'general_state_registry',
  'state_directory_logical_record',
  p.candidate_group_id,
  p.record_fingerprint,
  p.display_name,
  'civic_resource',
  public.state_directory_resource_category(p.normalized_identity),
  'state',
  p.jurisdiction_code,
  'statewide',
  p.jurisdiction_code,
  null,
  array[public.state_directory_resource_category(p.normalized_identity)]::text[],
  jsonb_build_object(
    'document_family', 'general_state_registry',
    'row_class', 'organization_contact'
  ),
  jsonb_build_object(
    'engine_id', 'state_directory_organization_resource_promotion',
    'engine_version', '1.0.0',
    'candidate_group_id', p.candidate_group_id,
    'reassembly_run_id', p.run_id,
    'logical_record_id', p.logical_record_id,
    'source_file', p.source_file,
    'row_payload', p.row_payload,
    'record_fingerprint', p.record_fingerprint,
    'original_identity', p.normalized_identity
  ),
  'source_attached',
  'review_ready',
  'staging_provenance_attached',
  now(),
  now()
from public.state_directory_organization_resource_promotion p
where p.run_id = 'state_directory_reassembly_v1_20260729'
  and p.disposition = 'inserted'
on conflict (canonical_id) do update set
  metadata = coalesce(public.luminari_resource_entities.metadata, '{}'::jsonb) || excluded.metadata,
  service_categories = coalesce(
    public.luminari_resource_entities.service_categories,
    excluded.service_categories
  ),
  domains = coalesce(public.luminari_resource_entities.domains, '{}'::jsonb) || excluded.domains,
  updated_at = now();

with contact_values as (
  select
    p.*,
    e.resource_entity_id,
    e.canonical_id as entity_canonical_id,
    nullif(btrim(coalesce(
      p.row_payload->>'phone',
      p.row_payload->>'phone___contact'
    )), '') as phone_value,
    public.state_directory_contact_url(coalesce(
      p.row_payload->>'address___website',
      p.row_payload->>'website___address',
      ''
    )) as website_value,
    nullif(btrim(coalesce(
      p.row_payload->>'address___website',
      p.row_payload->>'website___address'
    )), '') as address_value
  from public.state_directory_organization_resource_promotion p
  join public.luminari_resource_entities e
    on e.resource_entity_id = p.target_record_id::uuid
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition in ('inserted', 'duplicate_entity')
),
contacts as (
  select c.*, v.contact_type, v.contact_value
  from contact_values c
  cross join lateral (values
    ('phone'::text, c.phone_value),
    ('website'::text, c.website_value)
  ) v(contact_type, contact_value)
  where v.contact_value is not null
)
insert into public.luminari_resource_contact_points (
  contact_point_id,
  resource_entity_id,
  canonical_id,
  contact_type,
  contact_value,
  label,
  is_primary,
  contact_quality,
  source_table,
  source_pk,
  source_hash,
  metadata,
  created_at
)
select
  public.luminari_stable_uuid_v1(
    entity_canonical_id || '|' || contact_type || '|' || contact_value
  ),
  resource_entity_id,
  entity_canonical_id,
  contact_type,
  contact_value,
  'primary ' || contact_type,
  true,
  'source_attached',
  'state_directory_logical_record',
  candidate_group_id,
  record_fingerprint,
  jsonb_build_object(
    'promotion_engine', 'state_directory_organization_resource_promotion_v1',
    'logical_record_id', logical_record_id,
    'source_file', source_file
  ),
  now()
from contacts
on conflict (contact_point_id) do update set
  metadata = coalesce(
    public.luminari_resource_contact_points.metadata, '{}'::jsonb
  ) || excluded.metadata;

with locations as (
  select
    p.*,
    e.resource_entity_id,
    nullif(btrim(coalesce(
      p.row_payload->>'address___website',
      p.row_payload->>'website___address'
    )), '') as address_value
  from public.state_directory_organization_resource_promotion p
  join public.luminari_resource_entities e
    on e.resource_entity_id = p.target_record_id::uuid
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition in ('inserted', 'duplicate_entity')
)
insert into public.luminari_resource_locations (
  location_id,
  resource_entity_id,
  address_line1,
  state,
  country,
  coordinate_quality,
  source_table,
  source_pk,
  metadata,
  created_at
)
select
  public.luminari_stable_uuid_v1(
    resource_entity_id::text || '|address|' || address_value
  ),
  resource_entity_id,
  address_value,
  jurisdiction_code,
  'US',
  'unverified',
  'state_directory_logical_record',
  candidate_group_id,
  jsonb_build_object(
    'promotion_engine', 'state_directory_organization_resource_promotion_v1',
    'logical_record_id', logical_record_id,
    'source_file', source_file
  ),
  now()
from locations
where address_value is not null
on conflict (location_id) do update set
  metadata = coalesce(public.luminari_resource_locations.metadata, '{}'::jsonb) || excluded.metadata;

with targets as (
  select
    logical_record_id,
    array_agg(target_record_id order by display_name) as target_ids,
    count(*) filter (where disposition = 'inserted')::integer as inserted_count,
    count(*) filter (where disposition = 'duplicate_entity')::integer
      as entity_duplicate_count,
    count(*) filter (where disposition = 'duplicate_registry')::integer
      as registry_duplicate_count
  from public.state_directory_organization_resource_promotion
  where run_id = 'state_directory_reassembly_v1_20260729'
  group by logical_record_id
)
update public.state_directory_logical_record l
set
  promotion_status = 'promoted',
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'organization_resource_target_ids', to_jsonb(t.target_ids),
    'organization_resource_inserted_count', t.inserted_count,
    'organization_resource_entity_duplicate_count', t.entity_duplicate_count,
    'organization_resource_registry_duplicate_count', t.registry_duplicate_count,
    'organization_resource_promotion_engine',
      'state_directory_organization_resource_promotion_v1'
  ),
  updated_at = now()
from targets t
where l.logical_record_id = t.logical_record_id;

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
  'v3_13_state_directory_organization_resources_001',
  'organization_resources',
  a.artifact_id,
  'completed',
  count(*)::bigint,
  count(*) filter (where p.disposition = 'inserted')::bigint,
  count(*) filter (where p.disposition = 'duplicate_entity')::bigint,
  count(*) filter (where p.disposition = 'duplicate_registry')::bigint,
  0,
  now(),
  now(),
  jsonb_build_object(
    'target_table', 'luminari_resource_entities',
    'ledger_table', 'state_directory_organization_resource_promotion',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'non_destructive', true
  ),
  'Organization-contact list rows were expanded into identity records, compared against resource entities and registry programs, and promoted with contact provenance.'
from public.state_directory_organization_resource_promotion p
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

commit;
