-- Append-only, service-role-only substrate for source-reviewed historical grant
-- awards. Historical awards are not application opportunities, and recipient
-- websites are not grant-detail sources or application routes. This migration
-- creates no Resource Directory, intake-action, legal, enforcement, Knowledge
-- Backbone, or anon/authenticated projection.

create table if not exists public.luminari_grant_award_source_run_v1 (
  run_id uuid primary key,
  source_filename text not null,
  source_content_sha256 text not null,
  source_sheet text not null,
  source_declared_update_label text not null,
  manual_review_ledger_sha256 text not null,
  adapter_version text not null,
  expected_record_count integer not null,
  expected_review_hold_count integer not null,
  expected_source_first_row integer not null,
  expected_source_last_row integer not null,
  expected_records_sha256 text not null,
  run_receipt_sha256 text not null,
  run_metadata jsonb not null,
  created_at timestamptz not null default now(),
  constraint luminari_grant_award_source_run_text_check check (
    nullif(btrim(source_filename), '') is not null
    and nullif(btrim(source_sheet), '') is not null
    and nullif(btrim(source_declared_update_label), '') is not null
    and nullif(btrim(adapter_version), '') is not null
  ),
  constraint luminari_grant_award_source_run_hash_check check (
    source_content_sha256 ~ '^[0-9a-f]{64}$'
    and manual_review_ledger_sha256 ~ '^[0-9a-f]{64}$'
    and expected_records_sha256 ~ '^[0-9a-f]{64}$'
    and run_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint luminari_grant_award_source_run_count_check check (
    expected_record_count > 0
    and expected_review_hold_count >= 0
    and expected_review_hold_count <= expected_record_count
    and expected_source_first_row > 0
    and expected_source_last_row >= expected_source_first_row
    and expected_source_last_row - expected_source_first_row + 1 = expected_record_count
    and jsonb_typeof(run_metadata) = 'object'
  ),
  unique (source_filename, source_content_sha256, manual_review_ledger_sha256, adapter_version)
);

create table if not exists public.luminari_grant_award_revision_v1 (
  award_revision_id bigint generated always as identity primary key,
  run_id uuid not null
    references public.luminari_grant_award_source_run_v1(run_id) on delete restrict,
  grant_id text not null,
  canonical_award_key text not null,
  record_revision_key text not null,
  source_row integer not null,
  source_locator text not null,
  source_ooxml_row_sha256 text not null,
  source_row_payload_sha256 text not null,
  grantee text,
  purpose text not null,
  division_source text,
  division_labels text[] not null,
  date_committed_text text not null,
  committed_month date not null,
  duration_months integer not null,
  amount_committed numeric(20, 0) not null,
  grantee_website_observed text,
  grantee_city text,
  grantee_state text,
  grantee_country text,
  region_source text not null,
  region_labels text[] not null,
  topic_source text,
  topic_labels text[] not null,
  quality_state text not null,
  quality_reason_codes text[] not null,
  award_identity_ready boolean not null,
  award_core_ready boolean not null,
  classification_ready boolean not null,
  geography_ready boolean not null,
  publication_state text not null,
  application_opportunity boolean not null,
  application_route boolean not null,
  resource_directory_record boolean not null,
  requires_separate_publication_review boolean not null,
  source_row_payload jsonb not null,
  field_provenance jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, grant_id),
  unique (run_id, source_row),
  unique (run_id, record_revision_key),
  constraint luminari_grant_award_revision_key_check check (
    nullif(btrim(grant_id), '') is not null
    and nullif(btrim(canonical_award_key), '') is not null
    and canonical_award_key = 'bmgf|exact-grant-id|' || grant_id
    and record_revision_key ~ '^[0-9a-f]{64}$'
    and source_ooxml_row_sha256 ~ '^[0-9a-f]{64}$'
    and source_row_payload_sha256 ~ '^[0-9a-f]{64}$'
    and source_row > 0
    and nullif(btrim(source_locator), '') is not null
  ),
  constraint luminari_grant_award_revision_core_check check (
    nullif(btrim(purpose), '') is not null
    and date_committed_text ~ '^\d{4}-\d{2}$'
    and committed_month = (date_committed_text || '-01')::date
    and duration_months > 0
    and amount_committed > 0
    and nullif(btrim(region_source), '') is not null
    and cardinality(region_labels) > 0
    and array_position(division_labels, null) is null
    and array_position(region_labels, null) is null
    and array_position(topic_labels, null) is null
    and array_position(quality_reason_codes, null) is null
  ),
  constraint luminari_grant_award_revision_website_check check (
    grantee_website_observed is null
    or grantee_website_observed ~* '^https?://'
  ),
  constraint luminari_grant_award_revision_quality_check check (
    quality_state in ('source_current', 'source_warning', 'review_hold')
    and award_identity_ready
    and award_core_ready = (nullif(btrim(grantee), '') is not null)
    and classification_ready = (
      nullif(btrim(division_source), '') is not null
      and nullif(btrim(topic_source), '') is not null
    )
    and geography_ready = (nullif(btrim(grantee_country), '') is not null)
  ),
  constraint luminari_grant_award_revision_nonpublic_check check (
    publication_state = 'service_only'
    and not application_opportunity
    and not application_route
    and not resource_directory_record
    and requires_separate_publication_review
  ),
  constraint luminari_grant_award_revision_payload_check check (
    jsonb_typeof(source_row_payload) = 'object'
    and jsonb_typeof(field_provenance) = 'object'
  )
);

create table if not exists public.luminari_grant_award_batch_receipt_v1 (
  batch_receipt_id bigint generated always as identity primary key,
  run_id uuid not null
    references public.luminari_grant_award_source_run_v1(run_id) on delete restrict,
  batch_number integer not null,
  first_source_row integer not null,
  last_source_row integer not null,
  record_count integer not null,
  records_sha256 text not null,
  batch_sha256 text not null,
  batch_metadata jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, batch_number),
  unique (run_id, batch_sha256),
  constraint luminari_grant_award_batch_count_check check (
    batch_number > 0
    and first_source_row > 0
    and last_source_row >= first_source_row
    and record_count = last_source_row - first_source_row + 1
    and record_count between 1 and 1000
  ),
  constraint luminari_grant_award_batch_hash_check check (
    records_sha256 ~ '^[0-9a-f]{64}$'
    and batch_sha256 ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(batch_metadata) = 'object'
  )
);

create table if not exists public.luminari_grant_award_activation_v1 (
  activation_id uuid primary key,
  run_id uuid not null unique
    references public.luminari_grant_award_source_run_v1(run_id) on delete restrict,
  source_filename text not null,
  record_count integer not null,
  review_hold_count integer not null,
  batch_count integer not null,
  records_sha256 text not null,
  activation_receipt_sha256 text not null,
  activation_receipt jsonb not null,
  activated_at timestamptz not null default now(),
  constraint luminari_grant_award_activation_count_check check (
    record_count > 0
    and review_hold_count >= 0
    and review_hold_count <= record_count
    and batch_count > 0
  ),
  constraint luminari_grant_award_activation_hash_check check (
    records_sha256 ~ '^[0-9a-f]{64}$'
    and activation_receipt_sha256 ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(activation_receipt) = 'object'
  ),
  constraint luminari_grant_award_activation_filename_check check (
    nullif(btrim(source_filename), '') is not null
  )
);

create index if not exists luminari_grant_award_revision_run_row_idx
  on public.luminari_grant_award_revision_v1 (run_id, source_row);
create index if not exists luminari_grant_award_revision_run_quality_idx
  on public.luminari_grant_award_revision_v1 (run_id, quality_state, source_row);
create index if not exists luminari_grant_award_revision_run_month_idx
  on public.luminari_grant_award_revision_v1 (run_id, committed_month, grant_id);
create index if not exists luminari_grant_award_revision_run_grantee_idx
  on public.luminari_grant_award_revision_v1 (run_id, lower(grantee), grant_id);
create index if not exists luminari_grant_award_revision_divisions_gin_idx
  on public.luminari_grant_award_revision_v1 using gin (division_labels);
create index if not exists luminari_grant_award_revision_regions_gin_idx
  on public.luminari_grant_award_revision_v1 using gin (region_labels);
create index if not exists luminari_grant_award_revision_topics_gin_idx
  on public.luminari_grant_award_revision_v1 using gin (topic_labels);
create index if not exists luminari_grant_award_revision_reasons_gin_idx
  on public.luminari_grant_award_revision_v1 using gin (quality_reason_codes);
create index if not exists luminari_grant_award_batch_run_number_idx
  on public.luminari_grant_award_batch_receipt_v1 (run_id, batch_number);
create index if not exists luminari_grant_award_activation_source_idx
  on public.luminari_grant_award_activation_v1
  (lower(source_filename), activated_at desc, activation_id desc);

alter table public.luminari_grant_award_source_run_v1 enable row level security;
alter table public.luminari_grant_award_revision_v1 enable row level security;
alter table public.luminari_grant_award_batch_receipt_v1 enable row level security;
alter table public.luminari_grant_award_activation_v1 enable row level security;

revoke all on public.luminari_grant_award_source_run_v1
  from public, anon, authenticated, service_role;
revoke all on public.luminari_grant_award_revision_v1
  from public, anon, authenticated, service_role;
revoke all on public.luminari_grant_award_batch_receipt_v1
  from public, anon, authenticated, service_role;
revoke all on public.luminari_grant_award_activation_v1
  from public, anon, authenticated, service_role;

do $grant_award_policies$
declare
  v_table text;
begin
  foreach v_table in array array[
    'luminari_grant_award_source_run_v1',
    'luminari_grant_award_revision_v1',
    'luminari_grant_award_batch_receipt_v1',
    'luminari_grant_award_activation_v1'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_table || '_service_select'
    ) then
      execute format(
        'create policy %I on public.%I for select to service_role using (true)',
        v_table || '_service_select', v_table
      );
    end if;
    if not exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_table || '_service_insert'
    ) then
      execute format(
        'create policy %I on public.%I for insert to service_role with check (true)',
        v_table || '_service_insert', v_table
      );
    end if;
  end loop;
end;
$grant_award_policies$;

grant select, insert on public.luminari_grant_award_source_run_v1 to service_role;
grant select, insert on public.luminari_grant_award_revision_v1 to service_role;
grant select, insert on public.luminari_grant_award_batch_receipt_v1 to service_role;
grant select, insert on public.luminari_grant_award_activation_v1 to service_role;
grant usage, select on sequence public.luminari_grant_award_revision_v1_award_revision_id_seq
  to service_role;
grant usage, select on sequence public.luminari_grant_award_batch_receipt_v1_batch_receipt_id_seq
  to service_role;

create or replace function public.register_luminari_grant_award_source_run_v1(
  p_run jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_run_id uuid := nullif(btrim(p_run->>'run_id'), '')::uuid;
  v_existing public.luminari_grant_award_source_run_v1%rowtype;
begin
  if jsonb_typeof(p_run) is distinct from 'object'
     or nullif(btrim(p_run->>'source_filename'), '') is null
     or coalesce(p_run->>'source_content_sha256', '') !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_run->>'source_sheet'), '') is null
     or nullif(btrim(p_run->>'source_declared_update_label'), '') is null
     or coalesce(p_run->>'manual_review_ledger_sha256', '') !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_run->>'adapter_version'), '') is null
     or coalesce((p_run->>'expected_record_count')::integer, 0) <= 0
     or coalesce((p_run->>'expected_review_hold_count')::integer, -1) < 0
     or coalesce((p_run->>'expected_source_first_row')::integer, 0) <= 0
     or coalesce((p_run->>'expected_source_last_row')::integer, 0) <= 0
     or coalesce(p_run->>'expected_records_sha256', '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_run->>'run_receipt_sha256', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_run->'run_metadata') is distinct from 'object' then
    raise exception 'invalid grant-award source-run registration';
  end if;

  insert into public.luminari_grant_award_source_run_v1 (
    run_id, source_filename, source_content_sha256, source_sheet,
    source_declared_update_label, manual_review_ledger_sha256,
    adapter_version, expected_record_count, expected_review_hold_count,
    expected_source_first_row, expected_source_last_row,
    expected_records_sha256, run_receipt_sha256, run_metadata
  ) values (
    v_run_id,
    btrim(p_run->>'source_filename'),
    p_run->>'source_content_sha256',
    btrim(p_run->>'source_sheet'),
    btrim(p_run->>'source_declared_update_label'),
    p_run->>'manual_review_ledger_sha256',
    btrim(p_run->>'adapter_version'),
    (p_run->>'expected_record_count')::integer,
    (p_run->>'expected_review_hold_count')::integer,
    (p_run->>'expected_source_first_row')::integer,
    (p_run->>'expected_source_last_row')::integer,
    p_run->>'expected_records_sha256',
    p_run->>'run_receipt_sha256',
    p_run->'run_metadata'
  ) on conflict (run_id) do nothing;

  select * into strict v_existing
  from public.luminari_grant_award_source_run_v1
  where run_id = v_run_id;

  if v_existing.source_filename is distinct from btrim(p_run->>'source_filename')
     or v_existing.source_content_sha256 is distinct from p_run->>'source_content_sha256'
     or v_existing.source_sheet is distinct from btrim(p_run->>'source_sheet')
     or v_existing.source_declared_update_label is distinct from btrim(p_run->>'source_declared_update_label')
     or v_existing.manual_review_ledger_sha256 is distinct from p_run->>'manual_review_ledger_sha256'
     or v_existing.adapter_version is distinct from btrim(p_run->>'adapter_version')
     or v_existing.expected_record_count is distinct from (p_run->>'expected_record_count')::integer
     or v_existing.expected_review_hold_count is distinct from (p_run->>'expected_review_hold_count')::integer
     or v_existing.expected_source_first_row is distinct from (p_run->>'expected_source_first_row')::integer
     or v_existing.expected_source_last_row is distinct from (p_run->>'expected_source_last_row')::integer
     or v_existing.expected_records_sha256 is distinct from p_run->>'expected_records_sha256'
     or v_existing.run_receipt_sha256 is distinct from p_run->>'run_receipt_sha256'
     or v_existing.run_metadata is distinct from p_run->'run_metadata' then
    raise exception 'grant-award run id reused with different content: %', v_run_id;
  end if;

  return jsonb_build_object(
    'run_id', v_run_id,
    'expected_record_count', v_existing.expected_record_count,
    'run_receipt_sha256', v_existing.run_receipt_sha256
  );
end;
$function$;

create or replace function public.register_luminari_grant_award_batch_v1(
  p_run_id uuid,
  p_batch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_batch_number integer := (p_batch->>'batch_number')::integer;
  v_first_source_row integer := (p_batch->>'first_source_row')::integer;
  v_last_source_row integer := (p_batch->>'last_source_row')::integer;
  v_record_count integer := jsonb_array_length(p_batch->'records');
  v_records_sha256 text := p_batch->>'records_sha256';
  v_batch_sha256 text := p_batch->>'batch_sha256';
  v_record jsonb;
  v_existing public.luminari_grant_award_revision_v1%rowtype;
  v_existing_batch public.luminari_grant_award_batch_receipt_v1%rowtype;
  v_actual_count integer;
  v_actual_records_sha256 text;
  v_divisions text[];
  v_regions text[];
  v_topics text[];
  v_reasons text[];
begin
  if not exists (
    select 1 from public.luminari_grant_award_source_run_v1 where run_id = p_run_id
  ) then
    raise exception 'grant-award run does not exist: %', p_run_id;
  end if;
  if jsonb_typeof(p_batch) is distinct from 'object'
     or jsonb_typeof(p_batch->'records') is distinct from 'array'
     or v_batch_number <= 0
     or v_record_count not between 1 and 1000
     or v_first_source_row <= 0
     or v_last_source_row - v_first_source_row + 1 <> v_record_count
     or coalesce(v_records_sha256, '') !~ '^[0-9a-f]{64}$'
     or coalesce(v_batch_sha256, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_batch->'batch_metadata') is distinct from 'object' then
    raise exception 'invalid grant-award batch envelope';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(p_batch->'records')
    order by (value->>'source_row')::integer
  loop
    select coalesce(
             array_agg(btrim(value) order by ordinality)
               filter (where nullif(btrim(value), '') is not null),
             '{}'::text[]
           )
      into v_divisions
    from unnest(string_to_array(coalesce(v_record->'source_row_payload'->>'DIVISION', ''), '|'))
      with ordinality as source_value(value, ordinality);
    select coalesce(
             array_agg(btrim(value) order by ordinality)
               filter (where nullif(btrim(value), '') is not null),
             '{}'::text[]
           )
      into v_regions
    from unnest(string_to_array(coalesce(v_record->'source_row_payload'->>'REGION SERVED', ''), '|'))
      with ordinality as source_value(value, ordinality);
    select coalesce(
             array_agg(btrim(value) order by ordinality)
               filter (where nullif(btrim(value), '') is not null),
             '{}'::text[]
           )
      into v_topics
    from unnest(string_to_array(coalesce(v_record->'source_row_payload'->>'TOPIC', ''), '|'))
      with ordinality as source_value(value, ordinality);
    select coalesce(array_agg(value order by ordinality), '{}'::text[])
      into v_reasons
    from jsonb_array_elements_text(v_record->'quality_reason_codes') with ordinality;

    if jsonb_typeof(v_record) is distinct from 'object'
       or nullif(btrim(v_record->>'grant_id'), '') is null
       or coalesce(v_record->>'record_revision_key', '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_record->>'source_ooxml_row_sha256', '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_record->>'source_row_payload_sha256', '') !~ '^[0-9a-f]{64}$'
       or (v_record->>'source_row')::integer not between v_first_source_row and v_last_source_row
       or v_record->>'grant_id' is distinct from v_record->'source_row_payload'->>'GRANT ID'
       or nullif(btrim(v_record->'source_row_payload'->>'PURPOSE'), '') is null
       or coalesce(v_record->'source_row_payload'->>'DATE COMMITTED', '') !~ '^\d{4}-\d{2}$'
       or (v_record->'source_row_payload'->>'DURATION (MONTHS)')::integer <= 0
       or (v_record->'source_row_payload'->>'AMOUNT COMMITTED')::numeric <= 0
       or nullif(btrim(v_record->'source_row_payload'->>'REGION SERVED'), '') is null
       or cardinality(v_regions) = 0
       or v_record->>'quality_state' not in ('source_current', 'source_warning', 'review_hold')
       or jsonb_typeof(v_record->'source_row_payload') is distinct from 'object'
       or jsonb_typeof(v_record->'field_provenance') is distinct from 'object' then
      raise exception 'invalid grant-award record in batch %, source row %',
        v_batch_number, v_record->>'source_row';
    end if;

    insert into public.luminari_grant_award_revision_v1 (
      run_id, grant_id, canonical_award_key, record_revision_key,
      source_row, source_locator, source_ooxml_row_sha256,
      source_row_payload_sha256, grantee, purpose, division_source,
      division_labels, date_committed_text, committed_month,
      duration_months, amount_committed, grantee_website_observed,
      grantee_city, grantee_state, grantee_country, region_source,
      region_labels, topic_source, topic_labels, quality_state,
      quality_reason_codes, award_identity_ready, award_core_ready,
      classification_ready, geography_ready, publication_state,
      application_opportunity, application_route, resource_directory_record,
      requires_separate_publication_review, source_row_payload, field_provenance
    ) values (
      p_run_id,
      v_record->>'grant_id',
      'bmgf|exact-grant-id|' || (v_record->>'grant_id'),
      v_record->>'record_revision_key',
      (v_record->>'source_row')::integer,
      v_record->>'source_locator',
      v_record->>'source_ooxml_row_sha256',
      v_record->>'source_row_payload_sha256',
      nullif(v_record->'source_row_payload'->>'GRANTEE', ''),
      v_record->'source_row_payload'->>'PURPOSE',
      nullif(v_record->'source_row_payload'->>'DIVISION', ''),
      v_divisions,
      v_record->'source_row_payload'->>'DATE COMMITTED',
      ((v_record->'source_row_payload'->>'DATE COMMITTED') || '-01')::date,
      (v_record->'source_row_payload'->>'DURATION (MONTHS)')::integer,
      (v_record->'source_row_payload'->>'AMOUNT COMMITTED')::numeric,
      nullif(v_record->'source_row_payload'->>'GRANTEE WEBSITE', ''),
      nullif(v_record->'source_row_payload'->>'GRANTEE CITY', ''),
      nullif(v_record->'source_row_payload'->>'GRANTEE STATE', ''),
      nullif(v_record->'source_row_payload'->>'GRANTEE COUNTRY', ''),
      v_record->'source_row_payload'->>'REGION SERVED',
      v_regions,
      nullif(v_record->'source_row_payload'->>'TOPIC', ''),
      v_topics,
      v_record->>'quality_state',
      v_reasons,
      true,
      nullif(btrim(v_record->'source_row_payload'->>'GRANTEE'), '') is not null,
      nullif(btrim(v_record->'source_row_payload'->>'DIVISION'), '') is not null
        and nullif(btrim(v_record->'source_row_payload'->>'TOPIC'), '') is not null,
      nullif(btrim(v_record->'source_row_payload'->>'GRANTEE COUNTRY'), '') is not null,
      'service_only',
      false,
      false,
      false,
      true,
      v_record->'source_row_payload',
      v_record->'field_provenance'
    ) on conflict (run_id, grant_id) do nothing;

    select * into strict v_existing
    from public.luminari_grant_award_revision_v1
    where run_id = p_run_id and grant_id = v_record->>'grant_id';

    if v_existing.record_revision_key is distinct from v_record->>'record_revision_key'
       or v_existing.source_row is distinct from (v_record->>'source_row')::integer
       or v_existing.source_row_payload_sha256 is distinct from v_record->>'source_row_payload_sha256' then
      raise exception 'grant-award identity reused with different content: %', v_record->>'grant_id';
    end if;
  end loop;

  select count(*)::integer,
         encode(extensions.digest(string_agg(record_revision_key, E'\n' order by source_row), 'sha256'), 'hex')
    into v_actual_count, v_actual_records_sha256
  from public.luminari_grant_award_revision_v1
  where run_id = p_run_id
    and source_row between v_first_source_row and v_last_source_row;

  if v_actual_count is distinct from v_record_count
     or v_actual_records_sha256 is distinct from v_records_sha256 then
    raise exception 'grant-award batch reconciliation failed: batch %, count %, hash %',
      v_batch_number, v_actual_count, v_actual_records_sha256;
  end if;

  insert into public.luminari_grant_award_batch_receipt_v1 (
    run_id, batch_number, first_source_row, last_source_row,
    record_count, records_sha256, batch_sha256, batch_metadata
  ) values (
    p_run_id, v_batch_number, v_first_source_row, v_last_source_row,
    v_record_count, v_records_sha256, v_batch_sha256, p_batch->'batch_metadata'
  ) on conflict (run_id, batch_number) do nothing;

  select * into strict v_existing_batch
  from public.luminari_grant_award_batch_receipt_v1
  where run_id = p_run_id and batch_number = v_batch_number;

  if v_existing_batch.first_source_row is distinct from v_first_source_row
     or v_existing_batch.last_source_row is distinct from v_last_source_row
     or v_existing_batch.record_count is distinct from v_record_count
     or v_existing_batch.records_sha256 is distinct from v_records_sha256
     or v_existing_batch.batch_sha256 is distinct from v_batch_sha256
     or v_existing_batch.batch_metadata is distinct from p_batch->'batch_metadata' then
    raise exception 'grant-award batch number reused with different content: %', v_batch_number;
  end if;

  return jsonb_build_object(
    'run_id', p_run_id,
    'batch_number', v_batch_number,
    'record_count', v_actual_count,
    'records_sha256', v_actual_records_sha256,
    'batch_sha256', v_existing_batch.batch_sha256
  );
end;
$function$;

create or replace function public.activate_luminari_grant_award_source_run_v1(
  p_activation jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_activation_id uuid := nullif(btrim(p_activation->>'activation_id'), '')::uuid;
  v_run_id uuid := nullif(btrim(p_activation->>'run_id'), '')::uuid;
  v_run public.luminari_grant_award_source_run_v1%rowtype;
  v_existing public.luminari_grant_award_activation_v1%rowtype;
  v_record_count integer;
  v_review_hold_count integer;
  v_batch_count integer;
  v_batch_record_count integer;
  v_first_source_row integer;
  v_last_source_row integer;
  v_records_sha256 text;
  v_public_leak_count integer;
begin
  if jsonb_typeof(p_activation) is distinct from 'object'
     or coalesce(p_activation->>'records_sha256', '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_activation->>'activation_receipt_sha256', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_activation->'activation_receipt') is distinct from 'object' then
    raise exception 'invalid grant-award activation envelope';
  end if;

  select * into strict v_run
  from public.luminari_grant_award_source_run_v1
  where run_id = v_run_id;

  select count(*)::integer,
         count(*) filter (where quality_state = 'review_hold')::integer,
         min(source_row), max(source_row),
         encode(extensions.digest(string_agg(record_revision_key, E'\n' order by source_row), 'sha256'), 'hex'),
         count(*) filter (
           where publication_state <> 'service_only'
              or application_opportunity
              or application_route
              or resource_directory_record
              or not requires_separate_publication_review
         )::integer
    into v_record_count, v_review_hold_count,
         v_first_source_row, v_last_source_row,
         v_records_sha256, v_public_leak_count
  from public.luminari_grant_award_revision_v1
  where run_id = v_run_id;

  select count(*)::integer, coalesce(sum(record_count), 0)::integer
    into v_batch_count, v_batch_record_count
  from public.luminari_grant_award_batch_receipt_v1
  where run_id = v_run_id;

  if v_record_count is distinct from v_run.expected_record_count
     or v_review_hold_count is distinct from v_run.expected_review_hold_count
     or v_first_source_row is distinct from v_run.expected_source_first_row
     or v_last_source_row is distinct from v_run.expected_source_last_row
     or v_batch_record_count is distinct from v_run.expected_record_count
     or v_records_sha256 is distinct from v_run.expected_records_sha256
     or v_records_sha256 is distinct from p_activation->>'records_sha256'
     or v_public_leak_count <> 0 then
    raise exception 'grant-award activation reconciliation failed for run %', v_run_id;
  end if;

  insert into public.luminari_grant_award_activation_v1 (
    activation_id, run_id, source_filename, record_count,
    review_hold_count, batch_count, records_sha256,
    activation_receipt_sha256, activation_receipt
  ) values (
    v_activation_id, v_run_id, v_run.source_filename, v_record_count,
    v_review_hold_count, v_batch_count, v_records_sha256,
    p_activation->>'activation_receipt_sha256', p_activation->'activation_receipt'
  ) on conflict (run_id) do nothing;

  select * into strict v_existing
  from public.luminari_grant_award_activation_v1
  where run_id = v_run_id;

  if v_existing.activation_id is distinct from v_activation_id
     or v_existing.source_filename is distinct from v_run.source_filename
     or v_existing.record_count is distinct from v_record_count
     or v_existing.review_hold_count is distinct from v_review_hold_count
     or v_existing.batch_count is distinct from v_batch_count
     or v_existing.records_sha256 is distinct from v_records_sha256
     or v_existing.activation_receipt_sha256 is distinct from p_activation->>'activation_receipt_sha256'
     or v_existing.activation_receipt is distinct from p_activation->'activation_receipt' then
    raise exception 'grant-award run activation reused with different content: %', v_run_id;
  end if;

  return jsonb_build_object(
    'activation_id', v_existing.activation_id,
    'run_id', v_existing.run_id,
    'record_count', v_existing.record_count,
    'review_hold_count', v_existing.review_hold_count,
    'batch_count', v_existing.batch_count,
    'records_sha256', v_existing.records_sha256,
    'activation_receipt_sha256', v_existing.activation_receipt_sha256
  );
end;
$function$;

revoke execute on function public.register_luminari_grant_award_source_run_v1(jsonb)
  from public, anon, authenticated;
revoke execute on function public.register_luminari_grant_award_batch_v1(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.activate_luminari_grant_award_source_run_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.register_luminari_grant_award_source_run_v1(jsonb)
  to service_role;
grant execute on function public.register_luminari_grant_award_batch_v1(uuid, jsonb)
  to service_role;
grant execute on function public.activate_luminari_grant_award_source_run_v1(jsonb)
  to service_role;

create or replace view public.v_luminari_grant_award_active_run_ranked_v1
with (security_invoker = true)
as
select
  activation.*,
  row_number() over (
    partition by lower(btrim(activation.source_filename))
    order by activation.activated_at desc, activation.activation_id desc
  ) as source_rank
from public.luminari_grant_award_activation_v1 activation;

create or replace view public.v_luminari_grant_award_current_v1
with (security_invoker = true)
as
select
  award.*,
  ranked.activation_id,
  ranked.activated_at
from public.luminari_grant_award_revision_v1 award
join public.v_luminari_grant_award_active_run_ranked_v1 ranked
  on ranked.run_id = award.run_id
 and ranked.source_rank = 1;

create or replace view public.v_luminari_grant_award_usable_v1
with (security_invoker = true)
as
select *
from public.v_luminari_grant_award_current_v1
where quality_state <> 'review_hold'
  and award_core_ready;

create or replace view public.v_luminari_grant_award_review_hold_v1
with (security_invoker = true)
as
select *
from public.v_luminari_grant_award_current_v1
where quality_state = 'review_hold';

revoke all on public.v_luminari_grant_award_active_run_ranked_v1
  from public, anon, authenticated;
revoke all on public.v_luminari_grant_award_current_v1
  from public, anon, authenticated;
revoke all on public.v_luminari_grant_award_usable_v1
  from public, anon, authenticated;
revoke all on public.v_luminari_grant_award_review_hold_v1
  from public, anon, authenticated;
grant select on public.v_luminari_grant_award_active_run_ranked_v1 to service_role;
grant select on public.v_luminari_grant_award_current_v1 to service_role;
grant select on public.v_luminari_grant_award_usable_v1 to service_role;
grant select on public.v_luminari_grant_award_review_hold_v1 to service_role;

comment on table public.luminari_grant_award_revision_v1 is
  'Append-only historical award observations. Recipient websites are observations only, never grant sources or application routes.';
comment on view public.v_luminari_grant_award_current_v1 is
  'Service-role-only current exact-ID award projection; never a Resource Directory or application-opportunity surface.';
