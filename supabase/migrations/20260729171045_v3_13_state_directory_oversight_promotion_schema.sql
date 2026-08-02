begin;

create or replace function public.state_directory_contact_url(p_text text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  with m as (
    select (regexp_match(
      p_text,
      '(https?://[^[:space:]]+|www\.[^[:space:]]+|[A-Za-z0-9.-]+\.(gov|org|com|net)(/[A-Za-z0-9_./-]+)?)'
    ))[1] as value
  )
  select case
    when value is null then null
    when value ~* '^(https?://|www\.)' then value
    else 'https://' || value
  end
  from m;
$$;

create table if not exists public.state_directory_oversight_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_code text not null,
  normalized_identity text not null,
  display_name text not null,
  source_logical_record_ids text[] not null,
  source_files text[] not null,
  source_row_count integer not null,
  source_rows jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted', 'duplicate')),
  target_uuid text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, jurisdiction_code, normalized_identity)
);

create index if not exists idx_state_directory_oversight_promotion_run_id
  on public.state_directory_oversight_promotion(run_id);
create index if not exists idx_state_directory_oversight_promotion_disposition
  on public.state_directory_oversight_promotion(disposition, jurisdiction_code);

alter table public.state_directory_oversight_promotion enable row level security;
drop policy if exists "service_role_full_access" on public.state_directory_oversight_promotion;
create policy "service_role_full_access" on public.state_directory_oversight_promotion
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated_read_only" on public.state_directory_oversight_promotion;
create policy "authenticated_read_only" on public.state_directory_oversight_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_oversight_promotion_summary
with (security_invoker = true)
as
select
  run_id,
  disposition,
  count(*)::bigint as oversight_identities,
  sum(source_row_count)::bigint as source_rows,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_oversight_promotion
group by run_id, disposition;

grant select on public.v_state_directory_oversight_promotion_summary
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
    j.jurisdiction_code,
    r.value as row_payload,
    nullif(btrim(r.value->>'oversight_body'), '') as full_entity_name,
    regexp_replace(
      lower(coalesce(r.value->>'oversight_body', '')),
      '[^a-z0-9]+', '', 'g'
    ) as normalized_identity
  from public.state_directory_logical_record l
  join jurisdiction_map j using (jurisdiction_key)
  cross join lateral jsonb_array_elements(l.normalized_payload->'rows') r(value)
  where l.run_id = 'state_directory_reassembly_v1_20260729'
    and l.route_lane = 'oversight'
),
grouped as (
  select
    e.jurisdiction_code,
    e.normalized_identity,
    (array_agg(
      e.full_entity_name
      order by length(e.full_entity_name) desc, e.full_entity_name
    ))[1] as display_name,
    array_agg(distinct e.logical_record_id) as source_logical_record_ids,
    array_agg(distinct e.source_file) as source_files,
    count(*)::integer as source_row_count,
    jsonb_agg(
      e.row_payload
      order by e.logical_record_id, e.full_entity_name
    ) as source_rows,
    'sdo_' || lower(e.jurisdiction_code) || '_' ||
      substr(md5(e.jurisdiction_code || '|' || e.normalized_identity), 1, 20)
      as generated_uuid
  from exploded e
  where e.normalized_identity <> ''
  group by e.jurisdiction_code, e.normalized_identity
),
matched as (
  select
    g.*,
    m.uuid as existing_uuid,
    'sdog_' || md5(g.jurisdiction_code || '|' || g.normalized_identity)
      as candidate_group_id,
    md5(
      g.jurisdiction_code || '|' || g.normalized_identity || '|' || g.source_rows::text
    ) as record_fingerprint
  from grouped g
  left join lateral (
    select o.uuid
    from public.oversight_registry o
    where regexp_replace(
      lower(coalesce(o.full_entity_name, '')), '[^a-z0-9]+', '', 'g'
    ) = g.normalized_identity
      and upper(coalesce(o.jurisdiction, '')) = g.jurisdiction_code
    order by case when o.uuid = g.generated_uuid then 0 else 1 end, o.uuid
    limit 1
  ) m on true
)
insert into public.state_directory_oversight_promotion (
  candidate_group_id,
  run_id,
  jurisdiction_code,
  normalized_identity,
  display_name,
  source_logical_record_ids,
  source_files,
  source_row_count,
  source_rows,
  record_fingerprint,
  disposition,
  target_uuid
)
select
  m.candidate_group_id,
  'state_directory_reassembly_v1_20260729',
  m.jurisdiction_code,
  m.normalized_identity,
  m.display_name,
  m.source_logical_record_ids,
  m.source_files,
  m.source_row_count,
  m.source_rows,
  m.record_fingerprint,
  case
    when m.existing_uuid is null or m.existing_uuid = m.generated_uuid then 'inserted'
    else 'duplicate'
  end,
  coalesce(m.existing_uuid, m.generated_uuid)
from matched m
on conflict (candidate_group_id) do update set
  display_name = excluded.display_name,
  source_logical_record_ids = excluded.source_logical_record_ids,
  source_files = excluded.source_files,
  source_row_count = excluded.source_row_count,
  source_rows = excluded.source_rows,
  record_fingerprint = excluded.record_fingerprint,
  disposition = excluded.disposition,
  target_uuid = excluded.target_uuid,
  updated_at = now();

with prepared as (
  select
    p.*,
    lower(p.display_name || ' ' || p.source_rows::text) as body,
    (
      select jsonb_agg(distinct x.value->>'contact')
      from jsonb_array_elements(p.source_rows) x(value)
      where nullif(btrim(x.value->>'contact'), '') is not null
    ) as contacts,
    (
      select jsonb_agg(distinct x.value->>'complaint_path___sol')
      from jsonb_array_elements(p.source_rows) x(value)
      where nullif(btrim(x.value->>'complaint_path___sol'), '') is not null
    ) as complaint_paths,
    (
      select jsonb_agg(distinct x.value->>'what_to_report')
      from jsonb_array_elements(p.source_rows) x(value)
      where nullif(btrim(x.value->>'what_to_report'), '') is not null
    ) as report_domains,
    (
      select jsonb_agg(
        jsonb_build_object(
          'action_required', coalesce(
            x.value->>'complaint_path___sol', 'See source record'
          ),
          'what_to_report', x.value->>'what_to_report',
          'jurisdiction', x.value->>'jurisdiction'
        )
        order by x.value->>'oversight_body'
      )
      from jsonb_array_elements(p.source_rows) x(value)
    ) as deadline_objects,
    (
      select string_agg(coalesce(x.value->>'contact', ''), ' ')
      from jsonb_array_elements(p.source_rows) x(value)
    ) as contact_text
  from public.state_directory_oversight_promotion p
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition = 'inserted'
)
insert into public.oversight_registry (
  uuid,
  entity_type,
  full_entity_name,
  aliases,
  jurisdiction,
  verification_status,
  contact,
  website,
  contact_phone,
  physical_address,
  complaint_portals,
  public_filing_portals,
  oversight_domains,
  related_entities,
  related_statutes,
  workflow_deadlines,
  provenance,
  created_at,
  contact_phone_norm,
  contact_website_norm,
  contact_raw_json
)
select
  p.target_uuid,
  case
    when p.body ~ '(insurance|medicaid managed care)' then 'insurance_regulator'
    when p.body ~ '(housing|landlord|code enforcement|fair housing)' then 'housing_oversight'
    when p.body ~ '(wage|labor|employment|eeoc|nlrb|osha|workplace)' then 'employment_labor'
    when p.body ~ '(snap|tanf|benefit|medicaid agency|human services)' then 'benefits_agency'
    when p.body ~ '(police|law enforcement|sheriff|internal affairs)' then 'law_enforcement'
    when p.body ~ '(elder|nursing|long.term care|ombudsman)' then 'elder_care'
    when p.body ~ '(family|child welfare|juvenile)' then 'family_child_welfare'
    when p.body ~ '(court|judicial)' then 'court'
    when p.body ~ '(attorney general|consumer|cfpb|ftc)' then 'consumer_protection'
    else 'oversight_body'
  end,
  p.display_name,
  jsonb_build_array(p.display_name),
  p.jurisdiction_code,
  'source_attached',
  jsonb_build_object('raw_contacts', coalesce(p.contacts, '[]'::jsonb)),
  public.state_directory_contact_url(p.contact_text),
  (regexp_match(
    p.contact_text,
    '([0-9]{3}[-. ][0-9]{3}[-. ][0-9]{4}|[0-9]{3}-[0-9]{4})'
  ))[1],
  null,
  coalesce(p.complaint_paths, '[]'::jsonb),
  coalesce(p.complaint_paths, '[]'::jsonb),
  coalesce(p.report_domains, '[]'::jsonb),
  '[]'::jsonb,
  '[]'::jsonb,
  p.deadline_objects,
  jsonb_build_object(
    'engine_id', 'state_directory_oversight_promotion',
    'engine_version', '1.0.0',
    'reassembly_run_id', p.run_id,
    'candidate_group_id', p.candidate_group_id,
    'source_logical_record_ids', to_jsonb(p.source_logical_record_ids),
    'source_files', to_jsonb(p.source_files),
    'source_row_count', p.source_row_count,
    'record_fingerprint', p.record_fingerprint,
    'source_rows', p.source_rows
  ),
  now(),
  (regexp_match(
    p.contact_text,
    '([0-9]{3}[-. ][0-9]{3}[-. ][0-9]{4}|[0-9]{3}-[0-9]{4})'
  ))[1],
  public.state_directory_contact_url(p.contact_text),
  p.source_rows
from prepared p
on conflict (uuid) do update set
  entity_type = coalesce(nullif(public.oversight_registry.entity_type, ''), excluded.entity_type),
  full_entity_name = coalesce(nullif(public.oversight_registry.full_entity_name, ''), excluded.full_entity_name),
  aliases = coalesce(public.oversight_registry.aliases, '[]'::jsonb) || excluded.aliases,
  contact = coalesce(public.oversight_registry.contact, '{}'::jsonb) || excluded.contact,
  website = coalesce(nullif(public.oversight_registry.website, ''), excluded.website),
  contact_phone = coalesce(nullif(public.oversight_registry.contact_phone, ''), excluded.contact_phone),
  complaint_portals = coalesce(
    public.oversight_registry.complaint_portals, '[]'::jsonb
  ) || excluded.complaint_portals,
  public_filing_portals = coalesce(
    public.oversight_registry.public_filing_portals, '[]'::jsonb
  ) || excluded.public_filing_portals,
  oversight_domains = coalesce(
    public.oversight_registry.oversight_domains, '[]'::jsonb
  ) || excluded.oversight_domains,
  workflow_deadlines = excluded.workflow_deadlines,
  provenance = coalesce(public.oversight_registry.provenance, '{}'::jsonb) || excluded.provenance,
  contact_phone_norm = coalesce(
    nullif(public.oversight_registry.contact_phone_norm, ''), excluded.contact_phone_norm
  ),
  contact_website_norm = coalesce(
    nullif(public.oversight_registry.contact_website_norm, ''), excluded.contact_website_norm
  ),
  contact_raw_json = excluded.contact_raw_json;

with logical_targets as (
  select
    x.logical_record_id,
    array_agg(distinct p.target_uuid order by p.target_uuid) as target_uuids,
    count(*) filter (where p.disposition = 'inserted')::integer as inserted_count,
    count(*) filter (where p.disposition = 'duplicate')::integer as duplicate_count
  from public.state_directory_oversight_promotion p
  cross join lateral unnest(p.source_logical_record_ids) x(logical_record_id)
  where p.run_id = 'state_directory_reassembly_v1_20260729'
  group by x.logical_record_id
)
update public.state_directory_logical_record l
set
  promotion_status = 'promoted',
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'oversight_target_uuids', to_jsonb(t.target_uuids),
    'oversight_inserted_count', t.inserted_count,
    'oversight_duplicate_count', t.duplicate_count,
    'oversight_promotion_engine', 'state_directory_oversight_promotion_v1'
  ),
  updated_at = now()
from logical_targets t
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
  'v3_13_state_directory_oversight_001',
  'oversight_accountability',
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
    'canonical_uuid_prefix', 'sdo_',
    'target_table', 'oversight_registry',
    'ledger_table', 'state_directory_oversight_promotion',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'non_destructive', true
  ),
  'Oversight rows were expanded, collapsed by jurisdiction and normalized body identity, and promoted with complete complaint-path and provenance payloads.'
from public.state_directory_oversight_promotion p
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

comment on table public.state_directory_oversight_promotion is
  'Deterministic jurisdiction-bound oversight identity disposition ledger for v3.13 state directory promotion.';

commit;
