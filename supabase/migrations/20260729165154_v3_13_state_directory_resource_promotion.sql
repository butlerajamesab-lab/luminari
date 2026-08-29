begin;

create or replace function public.luminari_stable_uuid_v1(p_value text)
returns uuid
language sql
immutable
strict
as $$
  select (
    substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4) || '-' ||
    substr(h, 17, 4) || '-' || substr(h, 21, 12)
  )::uuid
  from (select md5(p_value) as h) x;
$$;

create table if not exists public.state_directory_resource_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_code text not null,
  normalized_identity text not null,
  display_name text not null,
  row_class text not null,
  preferred_logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  source_logical_record_ids text[] not null,
  source_files text[] not null,
  source_record_count integer not null,
  preferred_payload jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted', 'duplicate_entity', 'duplicate_registry')),
  target_table text not null,
  target_record_id text not null,
  canonical_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, jurisdiction_code, normalized_identity)
);

create index if not exists idx_state_directory_resource_promotion_disposition
  on public.state_directory_resource_promotion(disposition, jurisdiction_code);
create index if not exists idx_state_directory_resource_promotion_target
  on public.state_directory_resource_promotion(target_table, target_record_id);

with jurisdiction_map as (
  select distinct on (regexp_replace(lower(split_part(name, '(', 1)), '[^a-z0-9]+', '', 'g'))
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
    l.*,
    j.jurisdiction_code,
    regexp_replace(lower(l.normalized_name), '[^a-z0-9]+', '', 'g') as normalized_identity,
    row_number() over (
      partition by j.jurisdiction_code, regexp_replace(lower(l.normalized_name), '[^a-z0-9]+', '', 'g')
      order by
        case l.document_family when 'enriched_pass3' then 0 when 'enriched_pass2' then 1 else 2 end,
        l.deduped_source_row_count desc,
        l.logical_record_id
    ) as preference_rank
  from public.state_directory_logical_record l
  join jurisdiction_map j using (jurisdiction_key)
  where l.run_id = 'state_directory_reassembly_v1_20260729'
    and l.route_lane = 'resource_entity'
    and l.candidate_status = 'candidate_ready'
),
grouped as (
  select
    c.jurisdiction_code,
    c.normalized_identity,
    count(*)::integer as source_record_count,
    array_agg(c.logical_record_id order by c.preference_rank, c.logical_record_id) as source_logical_record_ids,
    array_agg(c.source_file order by c.preference_rank, c.logical_record_id) as source_files
  from candidates c
  group by c.jurisdiction_code, c.normalized_identity
),
preferred as (
  select c.*
  from candidates c
  where c.preference_rank = 1
),
matched as (
  select
    g.*,
    p.logical_record_id as preferred_logical_record_id,
    p.normalized_name,
    p.row_class,
    p.normalized_payload as preferred_payload,
    'sdrg_' || md5(g.jurisdiction_code || '|' || g.normalized_identity) as candidate_group_id,
    md5(g.jurisdiction_code || '|' || g.normalized_identity || '|' || p.record_fingerprint) as record_fingerprint,
    'sdr_' || lower(g.jurisdiction_code) || '_' || substr(md5(g.jurisdiction_code || '|' || g.normalized_identity), 1, 20) as generated_canonical_id,
    em.resource_entity_id as entity_match_id,
    em.canonical_id as entity_match_canonical_id,
    rm.registry_id as registry_match_id
  from grouped g
  join preferred p using (jurisdiction_code, normalized_identity)
  left join lateral (
    select e.resource_entity_id, e.canonical_id
    from public.luminari_resource_entities e
    where regexp_replace(lower(e.resource_name), '[^a-z0-9]+', '', 'g') = g.normalized_identity
      and upper(coalesce(e.state, e.jurisdiction, '')) = g.jurisdiction_code
    order by
      case e.promotion_status when 'promoted' then 0 when 'review_ready' then 1 else 2 end,
      e.canonical_id nulls last,
      e.resource_entity_id
    limit 1
  ) em on true
  left join lateral (
    select r.id as registry_id
    from public.registry_programs r
    where regexp_replace(lower(r.name), '[^a-z0-9]+', '', 'g') = g.normalized_identity
      and upper(coalesce(r.jurisdiction_id, '')) = g.jurisdiction_code
    order by r.id
    limit 1
  ) rm on true
)
insert into public.state_directory_resource_promotion (
  candidate_group_id,
  run_id,
  jurisdiction_code,
  normalized_identity,
  display_name,
  row_class,
  preferred_logical_record_id,
  source_logical_record_ids,
  source_files,
  source_record_count,
  preferred_payload,
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
  initcap(regexp_replace(m.normalized_name, '_+', ' ', 'g')),
  m.row_class,
  m.preferred_logical_record_id,
  m.source_logical_record_ids,
  m.source_files,
  m.source_record_count,
  m.preferred_payload,
  m.record_fingerprint,
  case
    when m.entity_match_id is not null then 'duplicate_entity'
    when m.registry_match_id is not null then 'duplicate_registry'
    else 'inserted'
  end,
  case
    when m.entity_match_id is not null then 'luminari_resource_entities'
    when m.registry_match_id is not null then 'registry_programs'
    else 'luminari_resource_entities'
  end,
  case
    when m.entity_match_id is not null then m.entity_match_id::text
    when m.registry_match_id is not null then m.registry_match_id
    else public.luminari_stable_uuid_v1(m.generated_canonical_id)::text
  end,
  case
    when m.entity_match_id is not null then m.entity_match_canonical_id
    when m.registry_match_id is not null then null
    else m.generated_canonical_id
  end
from matched m
on conflict (candidate_group_id) do update set
  preferred_logical_record_id = excluded.preferred_logical_record_id,
  source_logical_record_ids = excluded.source_logical_record_ids,
  source_files = excluded.source_files,
  source_record_count = excluded.source_record_count,
  preferred_payload = excluded.preferred_payload,
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
  eligibility_summary,
  apply_notes,
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
  p.preferred_logical_record_id,
  p.record_fingerprint,
  p.display_name,
  'civic_resource',
  case
    when p.normalized_identity ~ '(snap|wic|food|nutrition|meal)' then 'food_nutrition'
    when p.normalized_identity ~ '(medicaid|health|hospital|clinic|fqhc|mental|behavioral|substance)' then 'healthcare'
    when p.normalized_identity ~ '(housing|hud|shelter|tenant|rent|homeless)' then 'housing'
    when p.normalized_identity ~ '(legal|lawyer|attorney|bar|civilrights|eeoc|humanrights)' then 'legal_civil_rights'
    when p.normalized_identity ~ '(unemployment|labor|wage|employment|workforce|dol)' then 'employment_labor'
    when p.normalized_identity ~ '(domesticviolence|violence|dv|crisis|sexualassault)' then 'safety_crisis'
    when p.normalized_identity ~ '(disability|ssdi|ssi|rehabilitation)' then 'disability'
    when p.normalized_identity ~ '(tribe|tribal|native|ihs|indian)' then 'tribal'
    when p.normalized_identity ~ '(veteran|va)' then 'veterans'
    when p.normalized_identity ~ '(liheap|utility|energy|heating)' then 'utilities'
    else 'general_resource'
  end,
  'state',
  p.jurisdiction_code,
  'statewide',
  p.jurisdiction_code,
  coalesce(
    nullif(p.preferred_payload->'field_map'->>'what_it_does_for_people', ''),
    nullif(p.preferred_payload->'field_map'->>'what_it_covers', ''),
    nullif(p.preferred_payload->'field_map'->>'description', ''),
    nullif(p.preferred_payload->'field_map'->>'function', '')
  ),
  coalesce(
    nullif(p.preferred_payload->'field_map'->>'eligibility', ''),
    nullif(p.preferred_payload->'field_map'->>'who_qualifies', '')
  ),
  coalesce(
    nullif(p.preferred_payload->'field_map'->>'apply_notes', ''),
    nullif(p.preferred_payload->'field_map'->>'filing_complaint_portal', '')
  ),
  array[
    case
      when p.normalized_identity ~ '(snap|wic|food|nutrition|meal)' then 'food_nutrition'
      when p.normalized_identity ~ '(medicaid|health|hospital|clinic|fqhc|mental|behavioral|substance)' then 'healthcare'
      when p.normalized_identity ~ '(housing|hud|shelter|tenant|rent|homeless)' then 'housing'
      when p.normalized_identity ~ '(legal|lawyer|attorney|bar|civilrights|eeoc|humanrights)' then 'legal_civil_rights'
      when p.normalized_identity ~ '(unemployment|labor|wage|employment|workforce|dol)' then 'employment_labor'
      when p.normalized_identity ~ '(domesticviolence|violence|dv|crisis|sexualassault)' then 'safety_crisis'
      when p.normalized_identity ~ '(disability|ssdi|ssi|rehabilitation)' then 'disability'
      when p.normalized_identity ~ '(tribe|tribal|native|ihs|indian)' then 'tribal'
      when p.normalized_identity ~ '(veteran|va)' then 'veterans'
      when p.normalized_identity ~ '(liheap|utility|energy|heating)' then 'utilities'
      else 'general_resource'
    end
  ]::text[],
  jsonb_build_object(
    'document_family', 'general_state_registry',
    'row_class', p.row_class,
    'jurisdiction_code', p.jurisdiction_code
  ),
  jsonb_build_object(
    'engine_id', 'state_directory_resource_promotion',
    'engine_version', '1.0.0',
    'reassembly_run_id', p.run_id,
    'promotion_group_id', p.candidate_group_id,
    'preferred_logical_record_id', p.preferred_logical_record_id,
    'source_logical_record_ids', to_jsonb(p.source_logical_record_ids),
    'source_files', to_jsonb(p.source_files),
    'source_record_count', p.source_record_count,
    'original_identity', p.normalized_identity,
    'field_map', p.preferred_payload->'field_map',
    'canonical_write_policy', 'insert_new_identity_only_enrich_blanks_on_replay'
  ),
  'source_attached',
  'review_ready',
  'staging_provenance_attached',
  now(),
  now()
from public.state_directory_resource_promotion p
where p.run_id = 'state_directory_reassembly_v1_20260729'
  and p.disposition = 'inserted'
on conflict (canonical_id) do update set
  description = coalesce(nullif(public.luminari_resource_entities.description, ''), excluded.description),
  eligibility_summary = coalesce(nullif(public.luminari_resource_entities.eligibility_summary, ''), excluded.eligibility_summary),
  apply_notes = coalesce(nullif(public.luminari_resource_entities.apply_notes, ''), excluded.apply_notes),
  service_categories = coalesce(public.luminari_resource_entities.service_categories, excluded.service_categories),
  domains = coalesce(public.luminari_resource_entities.domains, '{}'::jsonb) || excluded.domains,
  metadata = coalesce(public.luminari_resource_entities.metadata, '{}'::jsonb) || excluded.metadata,
  verification_status = case
    when public.luminari_resource_entities.verification_status = 'verified' then 'verified'
    else excluded.verification_status
  end,
  promotion_status = case
    when public.luminari_resource_entities.promotion_status = 'promoted' then 'promoted'
    else excluded.promotion_status
  end,
  provenance_status = case
    when public.luminari_resource_entities.provenance_status in ('verified', 'source_preserved')
      then public.luminari_resource_entities.provenance_status
    else excluded.provenance_status
  end,
  updated_at = now();

with contact_values as (
  select
    p.*,
    e.resource_entity_id,
    e.canonical_id as entity_canonical_id,
    c.contact_type,
    nullif(btrim(c.contact_value), '') as contact_value
  from public.state_directory_resource_promotion p
  join public.luminari_resource_entities e
    on e.resource_entity_id = p.target_record_id::uuid
  cross join lateral (
    values
      ('phone'::text, coalesce(p.preferred_payload->'field_map'->>'phone', p.preferred_payload->'field_map'->>'phone_contact')),
      ('email'::text, p.preferred_payload->'field_map'->>'email'),
      ('website'::text, p.preferred_payload->'field_map'->>'website'),
      ('portal'::text, coalesce(
        p.preferred_payload->'field_map'->>'filing_complaint_portal',
        p.preferred_payload->'field_map'->>'filing_portal',
        p.preferred_payload->'field_map'->>'complaint_portal'
      ))
  ) c(contact_type, contact_value)
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition in ('inserted', 'duplicate_entity')
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
  public.luminari_stable_uuid_v1(entity_canonical_id || '|' || contact_type || '|' || contact_value),
  resource_entity_id,
  entity_canonical_id,
  contact_type,
  contact_value,
  'primary ' || contact_type,
  true,
  'source_attached',
  'state_directory_logical_record',
  preferred_logical_record_id,
  record_fingerprint,
  jsonb_build_object(
    'promotion_group_id', candidate_group_id,
    'reassembly_run_id', run_id,
    'source_files', to_jsonb(source_files)
  ),
  now()
from contact_values
where contact_value is not null
  and lower(contact_value) not like 'not published%'
on conflict (contact_point_id) do update set
  metadata = coalesce(public.luminari_resource_contact_points.metadata, '{}'::jsonb) || excluded.metadata;

with locations as (
  select
    p.*,
    e.resource_entity_id,
    nullif(btrim(p.preferred_payload->'field_map'->>'address'), '') as address_value
  from public.state_directory_resource_promotion p
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
  public.luminari_stable_uuid_v1(resource_entity_id::text || '|address|' || address_value),
  resource_entity_id,
  address_value,
  jurisdiction_code,
  'US',
  'unverified',
  'state_directory_logical_record',
  preferred_logical_record_id,
  jsonb_build_object(
    'promotion_group_id', candidate_group_id,
    'reassembly_run_id', run_id,
    'source_files', to_jsonb(source_files)
  ),
  now()
from locations
where address_value is not null
on conflict (location_id) do update set
  address_line1 = coalesce(nullif(public.luminari_resource_locations.address_line1, ''), excluded.address_line1),
  metadata = coalesce(public.luminari_resource_locations.metadata, '{}'::jsonb) || excluded.metadata;

with exploded as (
  select
    p.*,
    unnest(p.source_logical_record_ids) as logical_record_id
  from public.state_directory_resource_promotion p
  where p.run_id = 'state_directory_reassembly_v1_20260729'
)
update public.state_directory_logical_record l
set
  promotion_status = case when e.disposition = 'inserted' then 'promoted' else 'duplicate' end,
  canonical_record_id = e.target_record_id,
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'resource_promotion_group_id', e.candidate_group_id,
    'resource_promotion_disposition', e.disposition,
    'resource_target_table', e.target_table,
    'resource_target_record_id', e.target_record_id,
    'resource_canonical_id', e.canonical_id,
    'source_versions_merged', e.source_record_count
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
  'v3_13_state_directory_resource_entities_001',
  'general_state_registry_resources',
  a.artifact_id,
  'completed',
  count(*)::bigint,
  count(*) filter (where p.disposition = 'inserted')::bigint,
  0,
  count(*) filter (where p.disposition in ('duplicate_entity', 'duplicate_registry'))::bigint,
  0,
  now(),
  now(),
  jsonb_build_object(
    'canonical_id_prefix', 'sdr_',
    'source_table', 'state_directory_logical_record',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'inserted_target_table', 'luminari_resource_entities',
    'non_destructive', true
  ),
  'Candidate identities were deduplicated within jurisdiction, compared against luminari_resource_entities and registry_programs, then inserted only when no exact identity existed. All source logical records remain preserved.'
from public.state_directory_resource_promotion p
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

alter table public.state_directory_resource_promotion enable row level security;
create policy "service_role_full_access" on public.state_directory_resource_promotion
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_resource_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_resource_promotion_summary as
select
  run_id,
  disposition,
  count(*)::bigint as identity_groups,
  sum(source_record_count)::bigint as source_logical_records,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_resource_promotion
group by run_id, disposition;

grant select on public.v_state_directory_resource_promotion_summary to authenticated, service_role;

comment on table public.state_directory_resource_promotion is
  'Deterministic identity-group disposition ledger for explicit state-directory resource candidates, including source-version collapse and exact backbone duplicate comparison.';

commit;
