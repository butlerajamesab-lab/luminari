begin;

create or replace function public.state_directory_document_family(p_source_file text)
returns text language sql immutable strict as $$
  select case
    when lower(p_source_file) like '%enriched-pass3%' then 'enriched_pass3'
    when lower(p_source_file) like '%enriched-pass2%' then 'enriched_pass2'
    when lower(p_source_file) like '%resource-directory%' then 'resource_directory'
    else 'other'
  end;
$$;

create or replace function public.state_directory_jurisdiction_key(p_source_file text)
returns text language plpgsql immutable strict as $$
declare
  v_key text;
begin
  v_key := lower(p_source_file);
  v_key := regexp_replace(v_key, '^luminari-', '');
  v_key := regexp_replace(v_key, '-(resource-directory|enriched-pass[23]).*$', '');
  v_key := regexp_replace(v_key, '\.(docx|pdf)$', '');
  v_key := regexp_replace(v_key, '[^a-z0-9]+', '', 'g');

  return case v_key
    when 'cnmi' then 'northernmarianaislands'
    when 'northernmarianaislands' then 'northernmarianaislands'
    when 'washingtondc' then 'washingtondc'
    when 'districtofcolumbia' then 'washingtondc'
    when 'usvirginislands' then 'usvirginislands'
    else v_key
  end;
end;
$$;

create or replace function public.state_directory_row_class(p_payload jsonb)
returns text language plpgsql immutable strict as $$
declare
  v_key_count integer;
begin
  select count(*)::integer into v_key_count from jsonb_object_keys(p_payload);

  return case
    when p_payload ? 'field' and p_payload ? 'information' then 'field_information_pair'
    when p_payload ? 'step' and p_payload ? 'action_required'
      and p_payload ? 'agency___contact' and p_payload ? 'deadline'
      and p_payload ? 'documents_needed' then 'workflow_step'
    when p_payload ? 'oversight_body' and p_payload ? 'jurisdiction'
      and p_payload ? 'what_to_report' and p_payload ? 'complaint_path___sol'
      and p_payload ? 'contact' then 'oversight_accountability'
    when p_payload ? 'organization'
      and (p_payload ? 'phone' or p_payload ? 'phone___contact')
      and (p_payload ? 'address___website' or p_payload ? 'website___address')
      then 'organization_contact'
    when p_payload ? 'statute' or p_payload ? 'statute___law'
      or p_payload ? 'citation__click_for_source'
      or (p_payload ? 'citation' and p_payload ? 'official_source')
      then 'statute_legal_authority'
    when p_payload ? 'registry_metric' then 'registry_metric'
    when (p_payload ? 'state' or p_payload ? 'territory' or p_payload ? 'jurisdiction')
      and p_payload ? 'medicaid' and p_payload ? 'min__wage' and p_payload ? 'population'
      then 'jurisdiction_snapshot'
    when p_payload ? 'service_type' then 'service_type_exploded'
    when p_payload ? 'element' and p_payload ? 'portability_assessment' then 'two_column_other'
    when v_key_count = 1 then 'single_key_exploded'
    else 'other_structured'
  end;
end;
$$;

create or replace function public.state_directory_route_lane(p_row_class text)
returns text language sql immutable strict as $$
  select case p_row_class
    when 'field_information_pair' then 'resource_entity'
    when 'single_key_exploded' then 'resource_entity'
    when 'service_type_exploded' then 'resource_entity'
    when 'organization_contact' then 'resource_entity'
    when 'workflow_step' then 'workflow'
    when 'oversight_accountability' then 'oversight'
    when 'statute_legal_authority' then 'legal_authority'
    when 'registry_metric' then 'jurisdiction_profile'
    when 'jurisdiction_snapshot' then 'jurisdiction_profile'
    when 'two_column_other' then 'portability'
    else 'review'
  end;
$$;

create table if not exists public.state_directory_reassembly_run (
  run_id text primary key,
  engine_id text not null,
  engine_version text not null,
  source_table text not null,
  source_row_count bigint not null default 0,
  classified_row_count bigint not null default 0,
  exact_duplicate_row_count bigint not null default 0,
  deduped_row_count bigint not null default 0,
  logical_record_count bigint not null default 0,
  status text not null check (status in ('running', 'completed', 'failed')),
  classification_rules jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.state_directory_row_classification (
  stage_row_id bigint primary key references public.state_enriched_directory_v3_13(id),
  run_id text not null references public.state_directory_reassembly_run(run_id),
  source_file text not null,
  source_md5 text,
  document_family text not null,
  jurisdiction_key text not null,
  table_idx integer,
  row_idx integer,
  row_class text not null,
  route_lane text not null,
  payload_hash text not null,
  duplicate_group_key text not null,
  duplicate_rank integer not null,
  is_exact_duplicate boolean not null,
  canonical_stage_row_id bigint not null,
  semantic_identity text,
  field_name text,
  field_value text,
  classification_reason text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.state_directory_logical_record (
  logical_record_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  source_file text not null,
  document_family text not null,
  jurisdiction_key text not null,
  table_idx integer,
  row_class text not null,
  route_lane text not null,
  raw_source_row_count bigint not null,
  deduped_source_row_count bigint not null,
  source_stage_row_ids bigint[] not null,
  normalized_name text,
  identity_count integer not null default 0,
  normalized_payload jsonb not null,
  record_fingerprint text not null,
  candidate_status text not null check (candidate_status in (
    'candidate_ready', 'batch_requires_expansion', 'needs_identity',
    'workflow_requires_parent_identity', 'profile_staged', 'staged', 'review_required'
  )),
  canonical_target text,
  canonical_record_id text,
  promotion_status text not null default 'staged'
    check (promotion_status in ('staged', 'held', 'promoted', 'duplicate', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_state_directory_row_classification_lane
  on public.state_directory_row_classification(route_lane, row_class);
create index if not exists idx_state_directory_row_classification_jurisdiction
  on public.state_directory_row_classification(jurisdiction_key, document_family);
create index if not exists idx_state_directory_row_classification_duplicate
  on public.state_directory_row_classification(is_exact_duplicate, duplicate_group_key);
create index if not exists idx_state_directory_logical_record_lane
  on public.state_directory_logical_record(route_lane, candidate_status);
create index if not exists idx_state_directory_logical_record_jurisdiction
  on public.state_directory_logical_record(jurisdiction_key, document_family);
create unique index if not exists idx_state_directory_logical_record_fingerprint
  on public.state_directory_logical_record(record_fingerprint);

insert into public.state_directory_reassembly_run (
  run_id, engine_id, engine_version, source_table, status, classification_rules
) values (
  'state_directory_reassembly_v1_20260729',
  'state_directory_reassembly',
  '1.0.0',
  'state_enriched_directory_v3_13',
  'running',
  jsonb_build_object(
    'deterministic', true,
    'exact_dedup_scope', 'jurisdiction_key + document_family + table_idx + row_idx + payload',
    'canonical_write_policy', 'none_reassembly_and_routing_only',
    'source_row_contract', 30250
  )
)
on conflict (run_id) do update set
  status = 'running',
  classification_rules = excluded.classification_rules,
  updated_at = now();

with typed as (
  select s.*,
    public.state_directory_document_family(s.source_file) as document_family,
    public.state_directory_jurisdiction_key(s.source_file) as jurisdiction_key,
    public.state_directory_row_class(s.payload) as row_class
  from public.state_enriched_directory_v3_13 s
),
keyed as (
  select t.*,
    public.state_directory_route_lane(t.row_class) as route_lane,
    (select k from jsonb_object_keys(t.payload) as k order by k limit 1) as first_key,
    (select k from jsonb_object_keys(t.payload) as k where k <> 'service_type' order by k limit 1) as service_entity_key
  from typed t
),
semantic as (
  select k.*,
    case k.row_class
      when 'single_key_exploded' then k.first_key
      when 'service_type_exploded' then k.service_entity_key
      when 'organization_contact' then nullif(btrim(k.payload->>'organization'), '')
      when 'oversight_accountability' then nullif(btrim(k.payload->>'oversight_body'), '')
      when 'statute_legal_authority' then nullif(btrim(coalesce(k.payload->>'statute___law', k.payload->>'statute')), '')
      when 'field_information_pair' then case
        when lower(btrim(k.payload->>'field')) in ('organization', 'agency', 'resource name', 'program name', 'name')
          then nullif(btrim(k.payload->>'information'), '')
        else null end
      else null
    end as semantic_identity,
    case k.row_class
      when 'field_information_pair' then nullif(btrim(k.payload->>'field'), '')
      when 'service_type_exploded' then nullif(btrim(k.payload->>'service_type'), '')
      when 'single_key_exploded' then case
        when coalesce(k.payload->>k.first_key, '') ~ '^[^:]{1,80}:'
          then nullif(btrim(split_part(k.payload->>k.first_key, ':', 1)), '')
        else 'entry_' || coalesce(k.row_idx, 0)::text end
      else null
    end as field_name,
    case k.row_class
      when 'field_information_pair' then k.payload->>'information'
      when 'service_type_exploded' then k.payload->>k.service_entity_key
      when 'single_key_exploded' then case
        when coalesce(k.payload->>k.first_key, '') ~ '^[^:]{1,80}:'
          then regexp_replace(k.payload->>k.first_key, '^[^:]{1,80}:\s*', '')
        else k.payload->>k.first_key end
      else null
    end as field_value
  from keyed k
),
ranked as (
  select x.*,
    'sdd_' || md5(x.jurisdiction_key || '|' || x.document_family || '|' ||
      coalesce(x.table_idx, -1)::text || '|' || coalesce(x.row_idx, -1)::text || '|' || x.payload::text) as duplicate_group_key,
    row_number() over (
      partition by x.jurisdiction_key, x.document_family, x.table_idx, x.row_idx, x.payload
      order by x.source_file, coalesce(x.source_md5, ''), x.id
    ) as duplicate_rank,
    min(x.id) over (
      partition by x.jurisdiction_key, x.document_family, x.table_idx, x.row_idx, x.payload
    ) as canonical_stage_row_id
  from semantic x
)
insert into public.state_directory_row_classification (
  stage_row_id, run_id, source_file, source_md5, document_family, jurisdiction_key,
  table_idx, row_idx, row_class, route_lane, payload_hash, duplicate_group_key,
  duplicate_rank, is_exact_duplicate, canonical_stage_row_id, semantic_identity,
  field_name, field_value, classification_reason, payload
)
select r.id, 'state_directory_reassembly_v1_20260729', r.source_file, r.source_md5,
  r.document_family, r.jurisdiction_key, r.table_idx, r.row_idx, r.row_class,
  r.route_lane, md5(r.payload::text), r.duplicate_group_key, r.duplicate_rank,
  r.duplicate_rank > 1, r.canonical_stage_row_id, r.semantic_identity,
  r.field_name, r.field_value, 'classified_by_explicit_payload_key_signature', r.payload
from ranked r
on conflict (stage_row_id) do update set
  run_id = excluded.run_id,
  source_file = excluded.source_file,
  source_md5 = excluded.source_md5,
  document_family = excluded.document_family,
  jurisdiction_key = excluded.jurisdiction_key,
  table_idx = excluded.table_idx,
  row_idx = excluded.row_idx,
  row_class = excluded.row_class,
  route_lane = excluded.route_lane,
  payload_hash = excluded.payload_hash,
  duplicate_group_key = excluded.duplicate_group_key,
  duplicate_rank = excluded.duplicate_rank,
  is_exact_duplicate = excluded.is_exact_duplicate,
  canonical_stage_row_id = excluded.canonical_stage_row_id,
  semantic_identity = excluded.semantic_identity,
  field_name = excluded.field_name,
  field_value = excluded.field_value,
  classification_reason = excluded.classification_reason,
  payload = excluded.payload,
  updated_at = now();

with primary_rows as (
  select * from public.state_directory_row_classification
  where run_id = 'state_directory_reassembly_v1_20260729' and not is_exact_duplicate
),
raw_counts as (
  select source_file, table_idx, row_class, count(*)::bigint as raw_source_row_count
  from public.state_directory_row_classification
  where run_id = 'state_directory_reassembly_v1_20260729'
  group by source_file, table_idx, row_class
),
aggregated as (
  select
    'sdl_' || md5(p.source_file || '|' || coalesce(p.table_idx, -1)::text || '|' || p.row_class) as logical_record_id,
    p.source_file, p.document_family, p.jurisdiction_key, p.table_idx, p.row_class, p.route_lane,
    r.raw_source_row_count,
    count(*)::bigint as deduped_source_row_count,
    array_agg(p.stage_row_id order by p.row_idx, p.stage_row_id) as source_stage_row_ids,
    array_agg(distinct p.semantic_identity order by p.semantic_identity)
      filter (where p.semantic_identity is not null) as identities,
    count(distinct p.semantic_identity) filter (where p.semantic_identity is not null)::integer as identity_count,
    jsonb_agg(p.payload order by p.row_idx, p.stage_row_id) as payload_rows,
    jsonb_object_agg(
      regexp_replace(lower(p.field_name), '[^a-z0-9]+', '_', 'g'),
      to_jsonb(p.field_value) order by p.row_idx, p.stage_row_id
    ) filter (where p.field_name is not null and p.field_value is not null) as field_map
  from primary_rows p
  join raw_counts r using (source_file, table_idx, row_class)
  group by p.source_file, p.document_family, p.jurisdiction_key, p.table_idx,
    p.row_class, p.route_lane, r.raw_source_row_count
),
normalized as (
  select a.*,
    case when a.identity_count = 1 then a.identities[1] else null end as normalized_name,
    jsonb_build_object(
      'rows', a.payload_rows,
      'field_map', coalesce(a.field_map, '{}'::jsonb),
      'identities', coalesce(to_jsonb(a.identities), '[]'::jsonb),
      'source_file', a.source_file,
      'table_idx', a.table_idx,
      'row_class', a.row_class,
      'route_lane', a.route_lane,
      'jurisdiction_key', a.jurisdiction_key,
      'document_family', a.document_family
    ) as normalized_payload
  from aggregated a
)
insert into public.state_directory_logical_record (
  logical_record_id, run_id, source_file, document_family, jurisdiction_key,
  table_idx, row_class, route_lane, raw_source_row_count, deduped_source_row_count,
  source_stage_row_ids, normalized_name, identity_count, normalized_payload,
  record_fingerprint, candidate_status, canonical_target, metadata
)
select n.logical_record_id, 'state_directory_reassembly_v1_20260729', n.source_file,
  n.document_family, n.jurisdiction_key, n.table_idx, n.row_class, n.route_lane,
  n.raw_source_row_count, n.deduped_source_row_count, n.source_stage_row_ids,
  n.normalized_name, n.identity_count, n.normalized_payload,
  md5(n.jurisdiction_key || '|' || n.route_lane || '|' || n.row_class || '|' || n.normalized_payload::text),
  case
    when n.route_lane = 'resource_entity' and n.identity_count = 1 then 'candidate_ready'
    when n.route_lane = 'resource_entity' and n.identity_count > 1 then 'batch_requires_expansion'
    when n.route_lane = 'resource_entity' then 'needs_identity'
    when n.route_lane = 'workflow' then 'workflow_requires_parent_identity'
    when n.route_lane in ('oversight', 'legal_authority') then 'batch_requires_expansion'
    when n.route_lane = 'jurisdiction_profile' then 'profile_staged'
    when n.route_lane = 'portability' then 'staged'
    else 'review_required'
  end,
  case n.route_lane
    when 'resource_entity' then 'luminari_resource_entities'
    when 'workflow' then 'workflow_registry'
    when 'oversight' then 'oversight_registry'
    when 'legal_authority' then 'legal_statutes'
    when 'jurisdiction_profile' then 'jurisdiction_assertions'
    when 'portability' then 'jurisdiction_claim_matrix'
    else null
  end,
  jsonb_build_object(
    'source_table', 'state_enriched_directory_v3_13',
    'exact_duplicates_removed', n.raw_source_row_count - n.deduped_source_row_count,
    'canonical_write_performed', false,
    'engine_version', '1.0.0'
  )
from normalized n
on conflict (logical_record_id) do update set
  run_id = excluded.run_id,
  document_family = excluded.document_family,
  jurisdiction_key = excluded.jurisdiction_key,
  row_class = excluded.row_class,
  route_lane = excluded.route_lane,
  raw_source_row_count = excluded.raw_source_row_count,
  deduped_source_row_count = excluded.deduped_source_row_count,
  source_stage_row_ids = excluded.source_stage_row_ids,
  normalized_name = excluded.normalized_name,
  identity_count = excluded.identity_count,
  normalized_payload = excluded.normalized_payload,
  record_fingerprint = excluded.record_fingerprint,
  candidate_status = excluded.candidate_status,
  canonical_target = excluded.canonical_target,
  metadata = excluded.metadata,
  updated_at = now();

update public.state_directory_reassembly_run r
set source_row_count = s.source_rows,
  classified_row_count = c.classified_rows,
  exact_duplicate_row_count = c.exact_duplicate_rows,
  deduped_row_count = c.classified_rows - c.exact_duplicate_rows,
  logical_record_count = l.logical_records,
  status = case
    when s.source_rows = 30250 and c.classified_rows = s.source_rows
      and c.classified_rows - c.exact_duplicate_rows > 0 and l.logical_records > 0
      then 'completed' else 'failed' end,
  validation = jsonb_build_object(
    'expected_source_rows', 30250,
    'source_rows_match', s.source_rows = 30250,
    'all_rows_classified', c.classified_rows = s.source_rows,
    'row_balance_valid', c.classified_rows = c.exact_duplicate_rows + (c.classified_rows - c.exact_duplicate_rows),
    'logical_records_created', l.logical_records,
    'route_lane_count', l.route_lanes
  ),
  completed_at = now(), updated_at = now()
from (select count(*)::bigint as source_rows from public.state_enriched_directory_v3_13) s,
  (select count(*)::bigint as classified_rows,
    count(*) filter (where is_exact_duplicate)::bigint as exact_duplicate_rows
   from public.state_directory_row_classification
   where run_id = 'state_directory_reassembly_v1_20260729') c,
  (select count(*)::bigint as logical_records,
    count(distinct route_lane)::integer as route_lanes
   from public.state_directory_logical_record
   where run_id = 'state_directory_reassembly_v1_20260729') l
where r.run_id = 'state_directory_reassembly_v1_20260729';

create or replace view public.v_state_directory_reassembly_summary as
select l.run_id, l.route_lane, l.row_class, l.candidate_status,
  count(*)::bigint as logical_records,
  sum(l.raw_source_row_count)::bigint as raw_source_rows,
  sum(l.deduped_source_row_count)::bigint as deduped_source_rows,
  sum(l.raw_source_row_count - l.deduped_source_row_count)::bigint as exact_duplicate_rows_removed,
  count(*) filter (where l.normalized_name is not null)::bigint as records_with_identity,
  count(distinct l.jurisdiction_key)::integer as jurisdictions
from public.state_directory_logical_record l
group by l.run_id, l.route_lane, l.row_class, l.candidate_status;

create or replace view public.v_state_directory_reassembly_status as
select r.*,
  coalesce((select jsonb_object_agg(route_lane, logical_records)
    from (select route_lane, sum(logical_records)::bigint as logical_records
      from public.v_state_directory_reassembly_summary s
      where s.run_id = r.run_id group by route_lane order by route_lane) lane_totals), '{}'::jsonb)
    as logical_records_by_lane
from public.state_directory_reassembly_run r;

alter table public.state_directory_reassembly_run enable row level security;
alter table public.state_directory_row_classification enable row level security;
alter table public.state_directory_logical_record enable row level security;

create policy "service_role_full_access" on public.state_directory_reassembly_run
  for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.state_directory_row_classification
  for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.state_directory_logical_record
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_reassembly_run
  for select to authenticated using (true);
create policy "authenticated_read_only" on public.state_directory_row_classification
  for select to authenticated using (true);
create policy "authenticated_read_only" on public.state_directory_logical_record
  for select to authenticated using (true);

grant select on public.v_state_directory_reassembly_summary to authenticated, service_role;
grant select on public.v_state_directory_reassembly_status to authenticated, service_role;

comment on table public.state_directory_row_classification is
  'Deterministic row-by-row classification and exact-duplicate accounting for state_enriched_directory_v3_13.';
comment on table public.state_directory_logical_record is
  'Lossless logical reassembly of state directory source tables, routed by canonical backbone lane without performing canonical writes.';
comment on view public.v_state_directory_reassembly_status is
  'Inspectable balance and lane summary for the v3.13 state directory reassembly engine.';

commit;
