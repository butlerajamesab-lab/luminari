begin;

create temporary table tmp_sdr_jurisdiction_map on commit drop as
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
  created_at_rj desc;

create temporary table tmp_sdr_field_candidates on commit drop as
select
  l.logical_record_id,
  l.source_file,
  l.record_fingerprint,
  j.jurisdiction_code,
  l.normalized_payload as source_payload,
  l.normalized_payload->'field_map' as field_map,
  nullif(btrim(l.normalized_payload->'field_map'->>'service_type'), '') as service_type,
  public.state_directory_contact_url(
    l.normalized_payload->'field_map'->>'website'
  ) as website_url,
  lower(regexp_replace(regexp_replace(regexp_replace(
    coalesce(public.state_directory_contact_url(
      l.normalized_payload->'field_map'->>'website'
    ), ''),
    '^https?://', '', 'i'
  ), '^www\.', '', 'i'), '/$', '', 'g')) as url_key,
  nullif(btrim(l.normalized_payload->'field_map'->>'phone'), '') as phone_value,
  right(regexp_replace(coalesce((regexp_match(
    coalesce(l.normalized_payload->'field_map'->>'phone', ''),
    '([0-9]{3}[-. ][0-9]{3}[-. ][0-9]{4}|[0-9]{3}-[0-9]{4})'
  ))[1], ''), '[^0-9]', '', 'g'), 10) as phone_key,
  'sdf_' || lower(j.jurisdiction_code) || '_' ||
    substr(md5(l.logical_record_id), 1, 20) as generated_canonical_id,
  public.luminari_stable_uuid_v1('sdf|' || l.logical_record_id)
    as generated_resource_entity_id
from public.state_directory_logical_record l
join tmp_sdr_jurisdiction_map j using (jurisdiction_key)
where l.run_id = 'state_directory_reassembly_v1_20260729'
  and l.route_lane = 'resource_entity'
  and l.candidate_status = 'needs_identity';

create index on tmp_sdr_field_candidates(jurisdiction_code, url_key);
create index on tmp_sdr_field_candidates(jurisdiction_code, phone_key);

create temporary table tmp_sdr_contact_urls on commit drop as
select
  upper(coalesce(e.state, e.jurisdiction, '')) as jurisdiction_code,
  lower(regexp_replace(regexp_replace(regexp_replace(
    coalesce(public.state_directory_contact_url(c.contact_value), ''),
    '^https?://', '', 'i'
  ), '^www\.', '', 'i'), '/$', '', 'g')) as url_key,
  e.resource_entity_id
from public.luminari_resource_contact_points c
join public.luminari_resource_entities e
  on e.resource_entity_id = c.resource_entity_id
where c.contact_type in ('website', 'portal')
  and nullif(btrim(c.contact_value), '') is not null;

create index on tmp_sdr_contact_urls(jurisdiction_code, url_key);

create temporary table tmp_sdr_contact_phones on commit drop as
select
  upper(coalesce(e.state, e.jurisdiction, '')) as jurisdiction_code,
  right(regexp_replace(c.contact_value, '[^0-9]', '', 'g'), 10) as phone_key,
  e.resource_entity_id
from public.luminari_resource_contact_points c
join public.luminari_resource_entities e
  on e.resource_entity_id = c.resource_entity_id
where c.contact_type = 'phone'
  and nullif(btrim(c.contact_value), '') is not null;

create index on tmp_sdr_contact_phones(jurisdiction_code, phone_key);

create temporary table tmp_sdr_field_resolution on commit drop as
with matched as (
  select
    c.*,
    (
      select array_agg(distinct u.resource_entity_id)
      from tmp_sdr_contact_urls u
      where u.jurisdiction_code = c.jurisdiction_code
        and c.url_key <> ''
        and u.url_key = c.url_key
    ) as url_ids,
    (
      select array_agg(distinct p.resource_entity_id)
      from tmp_sdr_contact_phones p
      where p.jurisdiction_code = c.jurisdiction_code
        and c.phone_key <> ''
        and p.phone_key = c.phone_key
    ) as phone_ids
  from tmp_sdr_field_candidates c
)
select
  m.*,
  case
    when cardinality(m.url_ids) = 1 then m.url_ids[1]
    when coalesce(cardinality(m.url_ids), 0) = 0
      and cardinality(m.phone_ids) = 1 then m.phone_ids[1]
    when cardinality(m.url_ids) > 1
      or (coalesce(cardinality(m.url_ids), 0) = 0
        and cardinality(m.phone_ids) > 1) then null
    else m.generated_resource_entity_id
  end as target_resource_entity_id,
  case
    when cardinality(m.url_ids) = 1 then 'enriched'
    when coalesce(cardinality(m.url_ids), 0) = 0
      and cardinality(m.phone_ids) = 1 then 'enriched'
    when cardinality(m.url_ids) > 1
      or (coalesce(cardinality(m.url_ids), 0) = 0
        and cardinality(m.phone_ids) > 1) then 'held_ambiguous'
    else 'inserted'
  end as disposition,
  case
    when cardinality(m.url_ids) = 1 then 'exact_website'
    when coalesce(cardinality(m.url_ids), 0) = 0
      and cardinality(m.phone_ids) = 1 then 'exact_phone'
    when cardinality(m.url_ids) > 1 then 'ambiguous_website'
    when coalesce(cardinality(m.url_ids), 0) = 0
      and cardinality(m.phone_ids) > 1 then 'ambiguous_phone'
    else 'new_contact_identity'
  end as match_method,
  array(
    select distinct x
    from unnest(
      coalesce(m.url_ids, '{}'::uuid[]) ||
      coalesce(m.phone_ids, '{}'::uuid[])
    ) x
    order by x
  ) as matched_ids
from matched m;

insert into public.state_directory_field_resource_promotion (
  candidate_id,
  run_id,
  logical_record_id,
  jurisdiction_code,
  display_name,
  service_type,
  website_url,
  url_key,
  phone_value,
  phone_key,
  source_payload,
  record_fingerprint,
  disposition,
  match_method,
  target_resource_entity_id,
  canonical_id,
  matched_resource_entity_ids
)
select
  'sdfg_' || md5(r.logical_record_id),
  'state_directory_reassembly_v1_20260729',
  r.logical_record_id,
  r.jurisdiction_code,
  left(
    coalesce(r.service_type, 'Civic service') || ' — ' || r.jurisdiction_code ||
    case
      when r.url_key <> '' then ' — ' || regexp_replace(r.url_key, '/', ' · ', 'g')
      when r.phone_key <> '' then ' — ' || r.phone_key
      else ''
    end,
    240
  ),
  r.service_type,
  r.website_url,
  r.url_key,
  r.phone_value,
  r.phone_key,
  r.source_payload,
  r.record_fingerprint,
  r.disposition,
  r.match_method,
  r.target_resource_entity_id,
  case
    when r.disposition = 'inserted' then r.generated_canonical_id
    when r.disposition = 'enriched' then e.canonical_id
    else null
  end,
  r.matched_ids
from tmp_sdr_field_resolution r
left join public.luminari_resource_entities e
  on e.resource_entity_id = r.target_resource_entity_id
on conflict (candidate_id) do update set
  display_name = excluded.display_name,
  service_type = excluded.service_type,
  website_url = excluded.website_url,
  url_key = excluded.url_key,
  phone_value = excluded.phone_value,
  phone_key = excluded.phone_key,
  source_payload = excluded.source_payload,
  record_fingerprint = excluded.record_fingerprint,
  disposition = excluded.disposition,
  match_method = excluded.match_method,
  target_resource_entity_id = excluded.target_resource_entity_id,
  canonical_id = excluded.canonical_id,
  matched_resource_entity_ids = excluded.matched_resource_entity_ids,
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
  p.target_resource_entity_id,
  p.canonical_id,
  'general_state_registry',
  'state_directory_logical_record',
  p.logical_record_id,
  p.record_fingerprint,
  p.display_name,
  'civic_resource',
  public.state_directory_resource_category(regexp_replace(lower(
    coalesce(p.service_type, '') || ' ' ||
    coalesce(p.source_payload->'field_map'->>'what_it_does_for_people', '')
  ), '[^a-z0-9]+', '', 'g')),
  'state',
  p.jurisdiction_code,
  'statewide',
  p.jurisdiction_code,
  nullif(btrim(
    p.source_payload->'field_map'->>'what_it_does_for_people'
  ), ''),
  coalesce(
    nullif(btrim(p.source_payload->'field_map'->>'eligibility'), ''),
    nullif(btrim(p.source_payload->'field_map'->>'who_qualifies'), '')
  ),
  coalesce(
    nullif(btrim(p.source_payload->'field_map'->>'filing_complaint_portal'), ''),
    nullif(btrim(p.source_payload->'field_map'->>'apply_notes'), '')
  ),
  array[public.state_directory_resource_category(regexp_replace(lower(
    coalesce(p.service_type, '') || ' ' ||
    coalesce(p.source_payload->'field_map'->>'what_it_does_for_people', '')
  ), '[^a-z0-9]+', '', 'g'))]::text[],
  jsonb_build_object(
    'document_family', 'general_state_registry',
    'row_class', 'field_information_pair'
  ),
  jsonb_build_object(
    'engine_id', 'state_directory_field_resource_promotion',
    'engine_version', '1.0.0',
    'candidate_id', p.candidate_id,
    'reassembly_run_id', p.run_id,
    'logical_record_id', p.logical_record_id,
    'record_fingerprint', p.record_fingerprint,
    'match_method', p.match_method,
    'field_map', p.source_payload->'field_map',
    'source_rows', p.source_payload->'rows'
  ),
  'source_attached',
  'review_ready',
  'staging_provenance_attached',
  now(),
  now()
from public.state_directory_field_resource_promotion p
where p.run_id = 'state_directory_reassembly_v1_20260729'
  and p.disposition = 'inserted'
on conflict (canonical_id) do update set
  description = coalesce(
    nullif(public.luminari_resource_entities.description, ''), excluded.description
  ),
  eligibility_summary = coalesce(
    nullif(public.luminari_resource_entities.eligibility_summary, ''),
    excluded.eligibility_summary
  ),
  apply_notes = coalesce(
    nullif(public.luminari_resource_entities.apply_notes, ''), excluded.apply_notes
  ),
  metadata = coalesce(
    public.luminari_resource_entities.metadata, '{}'::jsonb
  ) || excluded.metadata,
  updated_at = now();

with enrichment as (
  select
    p.target_resource_entity_id,
    (array_agg(
      nullif(btrim(p.source_payload->'field_map'->>'what_it_does_for_people'), '')
      order by length(nullif(btrim(
        p.source_payload->'field_map'->>'what_it_does_for_people'
      ), '')) desc nulls last
    ) filter (where nullif(btrim(
      p.source_payload->'field_map'->>'what_it_does_for_people'
    ), '') is not null))[1] as description,
    (array_agg(
      coalesce(
        nullif(btrim(p.source_payload->'field_map'->>'eligibility'), ''),
        nullif(btrim(p.source_payload->'field_map'->>'who_qualifies'), '')
      )
      order by length(coalesce(
        nullif(btrim(p.source_payload->'field_map'->>'eligibility'), ''),
        nullif(btrim(p.source_payload->'field_map'->>'who_qualifies'), '')
      )) desc nulls last
    ) filter (where coalesce(
      nullif(btrim(p.source_payload->'field_map'->>'eligibility'), ''),
      nullif(btrim(p.source_payload->'field_map'->>'who_qualifies'), '')
    ) is not null))[1] as eligibility_summary,
    (array_agg(
      coalesce(
        nullif(btrim(p.source_payload->'field_map'->>'filing_complaint_portal'), ''),
        nullif(btrim(p.source_payload->'field_map'->>'apply_notes'), '')
      )
      order by length(coalesce(
        nullif(btrim(p.source_payload->'field_map'->>'filing_complaint_portal'), ''),
        nullif(btrim(p.source_payload->'field_map'->>'apply_notes'), '')
      )) desc nulls last
    ) filter (where coalesce(
      nullif(btrim(p.source_payload->'field_map'->>'filing_complaint_portal'), ''),
      nullif(btrim(p.source_payload->'field_map'->>'apply_notes'), '')
    ) is not null))[1] as apply_notes,
    jsonb_agg(jsonb_build_object(
      'candidate_id', p.candidate_id,
      'logical_record_id', p.logical_record_id,
      'record_fingerprint', p.record_fingerprint,
      'match_method', p.match_method,
      'field_map', p.source_payload->'field_map',
      'source_rows', p.source_payload->'rows'
    )) as enrichments
  from public.state_directory_field_resource_promotion p
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition = 'enriched'
  group by p.target_resource_entity_id
)
update public.luminari_resource_entities e
set
  description = coalesce(nullif(e.description, ''), x.description),
  eligibility_summary = coalesce(
    nullif(e.eligibility_summary, ''), x.eligibility_summary
  ),
  apply_notes = coalesce(nullif(e.apply_notes, ''), x.apply_notes),
  metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
    'field_resource_enrichments', x.enrichments
  ),
  updated_at = now()
from enrichment x
where e.resource_entity_id = x.target_resource_entity_id;

with contact_values as (
  select
    p.target_resource_entity_id,
    e.canonical_id as entity_canonical_id,
    p.logical_record_id,
    p.candidate_id,
    p.record_fingerprint,
    p.match_method,
    v.contact_type,
    v.contact_value
  from public.state_directory_field_resource_promotion p
  join public.luminari_resource_entities e
    on e.resource_entity_id = p.target_resource_entity_id
  cross join lateral (values
    ('website'::text, p.website_url),
    ('portal'::text, public.state_directory_contact_url(
      p.source_payload->'field_map'->>'filing_complaint_portal'
    )),
    ('phone'::text, p.phone_value),
    ('email'::text, case
      when p.source_payload->'field_map'->>'email' ~*
        '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
        then p.source_payload->'field_map'->>'email'
      else null
    end)
  ) v(contact_type, contact_value)
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition in ('inserted', 'enriched')
    and v.contact_value is not null
),
grouped_contacts as (
  select
    public.luminari_stable_uuid_v1(
      entity_canonical_id || '|' || contact_type || '|' || contact_value
    ) as contact_point_id,
    target_resource_entity_id,
    entity_canonical_id,
    contact_type,
    contact_value,
    jsonb_agg(jsonb_build_object(
      'candidate_id', candidate_id,
      'logical_record_id', logical_record_id,
      'record_fingerprint', record_fingerprint,
      'match_method', match_method
    )) as sources
  from contact_values
  group by
    target_resource_entity_id,
    entity_canonical_id,
    contact_type,
    contact_value
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
  contact_point_id,
  target_resource_entity_id,
  entity_canonical_id,
  contact_type,
  contact_value,
  'primary ' || contact_type,
  true,
  'source_attached',
  'state_directory_logical_record',
  contact_point_id::text,
  md5(sources::text),
  jsonb_build_object(
    'promotion_engine', 'state_directory_field_resource_promotion_v1',
    'sources', sources
  ),
  now()
from grouped_contacts
on conflict (contact_point_id) do update set
  metadata = coalesce(
    public.luminari_resource_contact_points.metadata, '{}'::jsonb
  ) || excluded.metadata;

with location_values as (
  select
    p.target_resource_entity_id,
    p.jurisdiction_code,
    p.logical_record_id,
    p.candidate_id,
    p.match_method,
    nullif(btrim(p.source_payload->'field_map'->>'address'), '') as address_value
  from public.state_directory_field_resource_promotion p
  where p.run_id = 'state_directory_reassembly_v1_20260729'
    and p.disposition in ('inserted', 'enriched')
),
grouped_locations as (
  select
    public.luminari_stable_uuid_v1(
      target_resource_entity_id::text || '|address|' || address_value
    ) as location_id,
    target_resource_entity_id,
    jurisdiction_code,
    address_value,
    jsonb_agg(jsonb_build_object(
      'candidate_id', candidate_id,
      'logical_record_id', logical_record_id,
      'match_method', match_method
    )) as sources
  from location_values
  where address_value is not null
  group by target_resource_entity_id, jurisdiction_code, address_value
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
  location_id,
  target_resource_entity_id,
  address_value,
  jurisdiction_code,
  'US',
  'unverified',
  'state_directory_logical_record',
  location_id::text,
  jsonb_build_object(
    'promotion_engine', 'state_directory_field_resource_promotion_v1',
    'sources', sources
  ),
  now()
from grouped_locations
on conflict (location_id) do update set
  metadata = coalesce(public.luminari_resource_locations.metadata, '{}'::jsonb) || excluded.metadata;

update public.state_directory_logical_record l
set
  promotion_status = case
    when p.disposition = 'held_ambiguous' then 'held'
    else 'promoted'
  end,
  canonical_record_id = p.target_resource_entity_id::text,
  metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
    'field_resource_candidate_id', p.candidate_id,
    'field_resource_disposition', p.disposition,
    'field_resource_match_method', p.match_method,
    'field_resource_target_id', p.target_resource_entity_id,
    'field_resource_matched_ids', to_jsonb(p.matched_resource_entity_ids),
    'field_resource_promotion_engine', 'state_directory_field_resource_promotion_v1'
  ),
  updated_at = now()
from public.state_directory_field_resource_promotion p
where p.run_id = 'state_directory_reassembly_v1_20260729'
  and l.logical_record_id = p.logical_record_id;

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
  'v3_13_state_directory_field_resources_001',
  'field_information_resources',
  a.artifact_id,
  case
    when count(*) filter (where p.disposition = 'held_ambiguous') = 0
      then 'completed'
    else 'held'
  end,
  count(*)::bigint,
  count(*) filter (where p.disposition = 'inserted')::bigint,
  count(*) filter (where p.disposition = 'enriched')::bigint,
  0,
  0,
  now(),
  now(),
  jsonb_build_object(
    'target_table', 'luminari_resource_entities',
    'ledger_table', 'state_directory_field_resource_promotion',
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'ambiguous_hold_count', count(*) filter (
      where p.disposition = 'held_ambiguous'
    ),
    'matching_priority', 'exact_website_then_exact_phone',
    'non_destructive', true
  ),
  'Detailed field/value resource tables were resolved by exact jurisdiction-bound website, then phone. Ambiguous shared contacts were held with all candidate entity IDs preserved.'
from public.state_directory_field_resource_promotion p
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
