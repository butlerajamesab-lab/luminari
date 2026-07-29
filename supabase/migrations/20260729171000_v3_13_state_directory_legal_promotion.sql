begin;

create table if not exists public.state_directory_legal_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  citation_key text not null,
  preferred_citation text not null,
  display_title text not null,
  canonical_jurisdiction text not null,
  source_jurisdictions text[] not null,
  source_logical_record_ids text[] not null,
  source_files text[] not null,
  source_row_count integer not null,
  source_rows jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted', 'duplicate')),
  target_id uuid not null,
  target_citation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, citation_key)
);

create index if not exists idx_state_directory_legal_promotion_run_id
  on public.state_directory_legal_promotion(run_id);
create index if not exists idx_state_directory_legal_promotion_disposition
  on public.state_directory_legal_promotion(disposition, canonical_jurisdiction);

alter table public.state_directory_legal_promotion enable row level security;
drop policy if exists "service_role_full_access" on public.state_directory_legal_promotion;
create policy "service_role_full_access" on public.state_directory_legal_promotion
  for all to service_role using (true) with check (true);
drop policy if exists "authenticated_read_only" on public.state_directory_legal_promotion;
create policy "authenticated_read_only" on public.state_directory_legal_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_legal_promotion_summary
with (security_invoker = true)
as
select
  run_id,
  disposition,
  count(*)::bigint as citation_groups,
  sum(source_row_count)::bigint as source_rows,
  count(distinct canonical_jurisdiction)::integer as jurisdictions
from public.state_directory_legal_promotion
group by run_id, disposition;

grant select on public.v_state_directory_legal_promotion_summary
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
    nullif(btrim(coalesce(
      r.value->>'citation__click_for_source',
      r.value->>'citation',
      r.value->>'code_section'
    )), '') as citation,
    regexp_replace(lower(coalesce(
      r.value->>'citation__click_for_source',
      r.value->>'citation',
      r.value->>'code_section',
      ''
    )), '[^a-z0-9]+', '', 'g') as citation_key,
    nullif(btrim(coalesce(
      r.value->>'statute___law',
      r.value->>'statute'
    )), '') as title,
    nullif(btrim(coalesce(
      r.value->>'key_language___note',
      r.value->>'key_provision__verbatim_cite'
    )), '') as key_text
  from public.state_directory_logical_record l
  join jurisdiction_map j using (jurisdiction_key)
  cross join lateral jsonb_array_elements(l.normalized_payload->'rows') r(value)
  where l.run_id = 'state_directory_reassembly_v1_20260729'
    and l.route_lane = 'legal_authority'
),
grouped as (
  select
    e.citation_key,
    (array_agg(e.citation order by length(e.citation), e.citation))[1]
      as preferred_citation,
    (array_agg(e.title order by length(e.title) desc, e.title))[1]
      as display_title,
    array_agg(distinct e.jurisdiction_code) as source_jurisdictions,
    array_agg(distinct e.logical_record_id) as source_logical_record_ids,
    array_agg(distinct e.source_file) as source_files,
    count(*)::integer as source_row_count,
    jsonb_agg(
      e.row_payload
      order by e.jurisdiction_code, e.logical_record_id, e.citation
    ) as source_rows,
    string_agg(lower(
      coalesce(e.citation, '') || ' ' ||
      coalesce(e.title, '') || ' ' ||
      coalesce(e.key_text, '')
    ), ' ') as body,
    public.luminari_stable_uuid_v1('sdlaw|' || e.citation_key) as generated_id
  from exploded e
  where e.citation_key <> ''
  group by e.citation_key
),
typed as (
  select
    g.*,
    case
      when cardinality(g.source_jurisdictions) > 1
        or g.body ~ '(u\.?s\.?c|c\.?f\.?r|pub\.? l|federal|united states constitution)'
        then 'Federal'
      else g.source_jurisdictions[1]
    end as canonical_jurisdiction
  from grouped g
),
matched as (
  select
    t.*,
    m.id as existing_id,
    m.citation as existing_citation,
    'sdlg_' || md5(t.citation_key) as candidate_group_id,
    md5(t.citation_key || '|' || t.source_rows::text) as record_fingerprint
  from typed t
  left join lateral (
    select s.id, s.citation
    from public.legal_statutes s
    where regexp_replace(lower(s.citation), '[^a-z0-9]+', '', 'g') = t.citation_key
    order by case when s.id = t.generated_id then 0 else 1 end, s.id
    limit 1
  ) m on true
)
insert into public.state_directory_legal_promotion (
  candidate_group_id,
  run_id,
  citation_key,
  preferred_citation,
  display_title,
  canonical_jurisdiction,
  source_jurisdictions,
  source_logical_record_ids,
  source_files,
  source_row_count,
  source_rows,
  record_fingerprint,
  disposition,
  target_id,
  target_citation
)
select
  m.candidate_group_id,
  'state_directory_reassembly_v1_20260729',
  m.citation_key,
  m.preferred_citation,
  m.display_title,
  m.canonical_jurisdiction,
  m.source_jurisdictions,
  m.source_logical_record_ids,
  m.source_files,
  m.source_row_count,
  m.source_rows,
  m.record_fingerprint,
  case
    when m.existing_id is null or m.existing_id = m.generated_id then 'inserted'
    else 'duplicate'
  end,
  coalesce(m.existing_id, m.generated_id),
  coalesce(m.existing_citation, m.preferred_citation)
from matched m
on conflict (candidate_group_id) do update set
  preferred_citation = excluded.preferred_citation,
  display_title = excluded.display_title,
  canonical_jurisdiction = excluded.canonical_jurisdiction,
  source_jurisdictions = excluded.source_jurisdictions,
  source_logical_record_ids = excluded.source_logical_record_ids,
  source_files = excluded.source_files,
  source_row_count = excluded.source_row_count,
  source_rows = excluded.source_rows,
  record_fingerprint = excluded.record_fingerprint,
  disposition = excluded.disposition,
  target_id = excluded.target_id,
  target_citation = excluded.target_citation,
  updated_at = now();

with prepared as (
  select
    p.*,
    lower(p.display_title || ' ' || p.source_rows::text) as body,
    (
      select x.value->>'key_language___note'
      from jsonb_array_elements(p.source_rows) x(value)
      where nullif(btrim(x.value->>'key_language___note'), '') is not null
      order by length(x.value->>'key_language___note') desc
      limit 1
    ) as key_text_a,
    (
      select x.value->>'key_provision__verbatim_cite'
      from jsonb_array_elements(p.source_rows) x(value)
      where nullif(btrim(x.value->>'key_provision__verbatim_cite'), '') is not null
      order by length(x.value->>'key_provision__verbatim_cite') desc
      limit 1
    ) as key_text_b,
    (
      select coalesce(x.value->>'official_source', x.value->>'link')
      from jsonb_array_elements(p.source_rows) x(value)
      where coalesce(
        x.value->>'official_source', x.value->>'link', ''
      ) ~* '^https?://'
      limit 1
    ) as source_url
  from public.state_directory_legal_promotion p
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition = 'inserted'
)
insert into public.legal_statutes (
  id,
  citation,
  short_title,
  jurisdiction,
  domains,
  summary,
  verbatim_key_text,
  source_url,
  verification_status,
  source_checked,
  date_checked,
  title,
  statute_text,
  metadata
)
select
  p.target_id,
  p.preferred_citation,
  p.display_title,
  p.canonical_jurisdiction,
  to_jsonb(array[
    case
      when p.body ~ '(wage|labor|employment|worker|title vii|ada)' then 'employment_labor'
      when p.body ~ '(housing|landlord|tenant|fair housing)' then 'housing'
      when p.body ~ '(snap|tanf|medicaid|benefit|unemployment)' then 'benefits'
      when p.body ~ '(civil rights|discriminat|human rights)' then 'civil_rights'
      when p.body ~ '(domestic violence|protective order|child welfare|family)' then 'family_safety'
      when p.body ~ '(tribal|indian|icwa|ancsa|treaty)' then 'tribal_sovereignty'
      when p.body ~ '(health|medical|insurance)' then 'healthcare_insurance'
      when p.body ~ '(consumer|deceptive|trade practice)' then 'consumer_protection'
      else 'general_legal_authority'
    end
  ]::text[]),
  p.display_title,
  coalesce(p.key_text_a, p.key_text_b),
  p.source_url,
  'source_attached',
  'state_directory_source_document',
  '2026-07-29',
  p.display_title,
  coalesce(p.key_text_a, p.key_text_b),
  jsonb_build_object(
    'engine_id', 'state_directory_legal_promotion',
    'engine_version', '1.0.0',
    'reassembly_run_id', p.run_id,
    'candidate_group_id', p.candidate_group_id,
    'citation_key', p.citation_key,
    'source_jurisdictions', to_jsonb(p.source_jurisdictions),
    'source_logical_record_ids', to_jsonb(p.source_logical_record_ids),
    'source_files', to_jsonb(p.source_files),
    'source_row_count', p.source_row_count,
    'record_fingerprint', p.record_fingerprint,
    'source_rows', p.source_rows
  )
from prepared p
on conflict (citation) do update set
  short_title = coalesce(nullif(public.legal_statutes.short_title, ''), excluded.short_title),
  jurisdiction = coalesce(nullif(public.legal_statutes.jurisdiction, ''), excluded.jurisdiction),
  domains = coalesce(public.legal_statutes.domains, '[]'::jsonb) ||
    coalesce(excluded.domains, '[]'::jsonb),
  summary = coalesce(nullif(public.legal_statutes.summary, ''), excluded.summary),
  verbatim_key_text = coalesce(
    nullif(public.legal_statutes.verbatim_key_text, ''), excluded.verbatim_key_text
  ),
  source_url = coalesce(nullif(public.legal_statutes.source_url, ''), excluded.source_url),
  source_checked = coalesce(
    nullif(public.legal_statutes.source_checked, ''), excluded.source_checked
  ),
  date_checked = coalesce(nullif(public.legal_statutes.date_checked, ''), excluded.date_checked),
  title = coalesce(nullif(public.legal_statutes.title, ''), excluded.title),
  statute_text = coalesce(nullif(public.legal_statutes.statute_text, ''), excluded.statute_text),
  metadata = coalesce(public.legal_statutes.metadata, '{}'::jsonb) || excluded.metadata;

with logical_targets as (
  select
    x.logical_record_id,
    array_agg(distinct p.target_id::text order by p.target_id::text) as target_ids,
    array_agg(distinct p.target_citation order by p.target_citation) as target_citations,
    count(*) filter (where p.disposition = 'inserted')::integer as inserted_count,
    count(*) filter (where p.disposition = 'duplicate')::integer as duplicate_count
  from public.state_directory_legal_promotion p
  cross join lateral unnest(p.source_logical_record_ids) x(logical_record_id)
  where p.run_id = 'state_directory_reassembly_v1_20260729'
  group by x.logical_record_id
)
update public.state_directory_logical_record l
set
  promotion_status = 'promoted',
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'legal_target_ids', to_jsonb(t.target_ids),
    'legal_target_citations', to_jsonb(t.target_citations),
    'legal_inserted_count', t.inserted_count,
    'legal_duplicate_count', t.duplicate_count,
    'legal_promotion_engine', 'state_directory_legal_promotion_v1'
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
  'v3_13_state_directory_legal_authority_001',
  'legal_authority',
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
    'target_table', 'legal_statutes',
    'ledger_table', 'state_directory_legal_promotion',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'canonical_identity', 'normalized_citation',
    'non_destructive', true
  ),
  'Legal rows were expanded and collapsed by normalized citation. Existing statutes were retained; new citations were inserted with source-attached text and full provenance.'
from public.state_directory_legal_promotion p
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

comment on table public.state_directory_legal_promotion is
  'Normalized citation disposition ledger for v3.13 state directory legal-authority promotion.';

commit;
