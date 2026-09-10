-- Lighthouse runtime/PostgreSQL contract repair v1
--
-- Purpose:
--   * converge the drifted production substrate and a clean replay;
--   * preserve all existing rows while repairing missing runtime columns;
--   * expose governed, source-backed Lighthouse views;
--   * make currently deployed PostgreSQL runtime paths queryable without
--     fabricating lineage, industry attribution, outcomes, or case data.
--
-- This migration intentionally contains no ledger writes, destructive row
-- deletes, truncation, or synthetic user-facing evidence.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- Used only while normalizing legacy text JSON columns in this transaction.
create or replace function pg_temp.luminari_try_jsonb(value text)
returns jsonb
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return value::jsonb;
exception when others then
  return jsonb_build_object('legacy_text', value);
end;
$$;

create or replace function pg_temp.luminari_epoch_millis(value text)
returns bigint
language plpgsql
immutable
as $$
declare
  numeric_value numeric;
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  if btrim(value) ~ '^-?[0-9]+$' then
    numeric_value := btrim(value)::numeric;
    if abs(numeric_value) < 100000000000 then
      numeric_value := numeric_value * 1000;
    end if;
    return numeric_value::bigint;
  end if;
  return (extract(epoch from value::timestamptz) * 1000)::bigint;
exception when others then
  return null;
end;
$$;

create or replace function pg_temp.luminari_normalized_timestamp(value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  if btrim(value) ~ '^\d{14}$' then
    return to_timestamp(btrim(value), 'YYYYMMDDHH24MISS');
  end if;
  return value::timestamptz;
exception when others then
  return null;
end;
$$;

-- --------------------------------------------------------------------------
-- Ingestion and canonical registry contracts
-- --------------------------------------------------------------------------

-- The deployed stream registry contains the right data but several timestamp,
-- JSON, and integer fields were created with incompatible recovery types. Keep
-- the exact legacy text beside every conversion so no source value disappears.
alter table public.data_stream_registry
  add column if not exists last_ingested_at_dsr_legacy_text text,
  add column if not exists last_success_at_dsr_legacy_text text,
  add column if not exists last_http_status_dsr_legacy_text text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'data_stream_registry'
       and column_name = 'field_mapping_dsr' and data_type = 'text'
  ) then
    execute 'alter table public.data_stream_registry alter column field_mapping_dsr type jsonb using pg_temp.luminari_try_jsonb(field_mapping_dsr)';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'data_stream_registry'
       and column_name = 'last_ingested_at_dsr' and data_type = 'text'
  ) then
    update public.data_stream_registry
       set last_ingested_at_dsr_legacy_text = coalesce(last_ingested_at_dsr_legacy_text, last_ingested_at_dsr)
     where last_ingested_at_dsr is not null;
    execute 'alter table public.data_stream_registry alter column last_ingested_at_dsr type bigint using pg_temp.luminari_epoch_millis(last_ingested_at_dsr)';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'data_stream_registry'
       and column_name = 'last_success_at_dsr' and data_type = 'text'
  ) then
    update public.data_stream_registry
       set last_success_at_dsr_legacy_text = coalesce(last_success_at_dsr_legacy_text, last_success_at_dsr)
     where last_success_at_dsr is not null;
    execute 'alter table public.data_stream_registry alter column last_success_at_dsr type bigint using pg_temp.luminari_epoch_millis(last_success_at_dsr)';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'data_stream_registry'
       and column_name = 'last_http_status_dsr' and data_type = 'text'
  ) then
    update public.data_stream_registry
       set last_http_status_dsr_legacy_text = coalesce(last_http_status_dsr_legacy_text, last_http_status_dsr)
     where last_http_status_dsr is not null;
    execute $sql$
      alter table public.data_stream_registry
      alter column last_http_status_dsr type integer
      using (case when coalesce(last_http_status_dsr, '') ~ '^\d+$' then last_http_status_dsr::integer end)
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'data_stream_registry'
       and column_name = 'created_at_dsr' and data_type = 'integer'
  ) then
    execute 'alter table public.data_stream_registry alter column created_at_dsr type bigint using created_at_dsr::bigint';
  end if;
end;
$$;

update public.data_stream_registry
   set created_at_dsr = case
         when created_at_dsr between 1 and 99999999999 then created_at_dsr * 1000
         else created_at_dsr
       end,
       updated_at_dsr = case
         when updated_at_dsr between 1 and 99999999999 then updated_at_dsr * 1000
         else updated_at_dsr
       end;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ingest_runs'
       and column_name = 'errors_run' and data_type = 'text'
  ) then
    execute 'alter table public.ingest_runs alter column errors_run type jsonb using pg_temp.luminari_try_jsonb(errors_run)';
  end if;
end;
$$;

-- Preserve the original normalized-date representation, then make the fields
-- used by the detector and historical replay match their PostgreSQL runtime
-- types. Invalid JSON is retained losslessly under {"legacy_text": ...}.
-- Production already has this relation, but no earlier checked-in migration
-- creates it. Supply the same nullable runtime columns for an empty replay.
create table if not exists public.ingested_records (
  id serial primary key,
  source_id text,
  status text,
  record_count integer,
  error_message text,
  created_at bigint,
  dataset_id_ir text,
  source_record_id text,
  ingested_at bigint,
  updated_at_ir bigint,
  normalized_date timestamptz,
  normalized_category text,
  normalized_entity text,
  normalized_jurisdiction text,
  normalized_city text,
  normalized_state text,
  normalized_zip text,
  normalized_status text,
  normalized_amount numeric,
  normalized_description text,
  processed_for_signals boolean,
  raw_json jsonb,
  source_hash text,
  stream_id_ir text,
  metadata_l1_l2 jsonb,
  normalized_date_legacy_text text
);

alter table public.ingested_records
  add column if not exists normalized_date_legacy_text text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ingested_records'
       and column_name = 'raw_json' and data_type = 'text'
  ) then
    execute 'alter table public.ingested_records alter column raw_json type jsonb using pg_temp.luminari_try_jsonb(raw_json)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ingested_records'
       and column_name = 'metadata_l1_l2' and data_type = 'text'
  ) then
    execute 'alter table public.ingested_records alter column metadata_l1_l2 type jsonb using pg_temp.luminari_try_jsonb(metadata_l1_l2)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ingested_records'
       and column_name = 'normalized_date' and data_type = 'text'
  ) then
    update public.ingested_records
       set normalized_date_legacy_text = coalesce(normalized_date_legacy_text, normalized_date)
     where normalized_date is not null;
    execute 'alter table public.ingested_records alter column normalized_date type timestamptz using pg_temp.luminari_normalized_timestamp(normalized_date)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ingested_records'
       and column_name = 'normalized_amount' and data_type = 'text'
  ) then
    execute $sql$
      alter table public.ingested_records
      alter column normalized_amount type numeric
      using (case when coalesce(btrim(normalized_amount), '') ~ '^-?[0-9]+([.][0-9]+)?$' then normalized_amount::numeric end)
    $sql$;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ingested_records'
       and column_name = 'processed_for_signals' and data_type = 'integer'
  ) then
    execute 'alter table public.ingested_records alter column processed_for_signals type boolean using (processed_for_signals <> 0)';
  end if;
end;
$$;

-- The legacy graph lane begins as text in its reconstruction migration. Make
-- it match the typed runtime contract without dropping or fabricating a row.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'world_nodes'
       and column_name = 'metadata_l10' and data_type = 'text'
  ) then
    execute 'alter table public.world_nodes alter column metadata_l10 type jsonb using pg_temp.luminari_try_jsonb(metadata_l10)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'world_nodes'
       and column_name = 'latitude' and data_type = 'text'
  ) then
    execute 'alter table public.world_nodes alter column latitude type numeric using nullif(btrim(latitude), '''')::numeric';
    execute 'alter table public.world_nodes alter column longitude type numeric using nullif(btrim(longitude), '''')::numeric';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'world_nodes'
       and column_name = 'active_remedy' and data_type = 'integer'
  ) then
    execute 'alter table public.world_nodes alter column active_remedy type boolean using (active_remedy <> 0)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'signal_flow_logs'
       and column_name = 'flow_density' and data_type = 'text'
  ) then
    execute 'alter table public.signal_flow_logs alter column flow_density type numeric using nullif(btrim(flow_density), '''')::numeric';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'signal_flow_logs'
       and column_name = 'visibility_metadata' and data_type = 'text'
  ) then
    execute 'alter table public.signal_flow_logs alter column visibility_metadata type jsonb using pg_temp.luminari_try_jsonb(visibility_metadata)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'remedy_paths'
       and column_name = 'prerequisites' and data_type = 'text'
  ) then
    execute 'alter table public.remedy_paths alter column prerequisites type jsonb using pg_temp.luminari_try_jsonb(prerequisites)';
    execute 'alter table public.remedy_paths alter column related_claim_types type jsonb using pg_temp.luminari_try_jsonb(related_claim_types)';
  end if;
end;
$$;

-- Canonical ingestion is idempotent by deterministic source hash. Production
-- has no duplicate non-null hashes; PostgreSQL unique indexes still permit the
-- historical rows whose source hash is unknown (NULL).
create unique index if not exists uq_ingested_records_source_hash
  on public.ingested_records(source_hash);

alter table public.live_signals
  add column if not exists effect_type_ls text,
  add column if not exists target_table_ls text,
  add column if not exists target_id_ls integer,
  add column if not exists confidence_score_legacy_text text,
  add column if not exists entity_confidence_score_ls_legacy_text text,
  add column if not exists role_confidence_legacy_text text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'live_signals'
       and column_name = 'supporting_statistics' and data_type = 'text'
  ) then
    execute 'alter table public.live_signals alter column supporting_statistics type jsonb using pg_temp.luminari_try_jsonb(supporting_statistics)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'live_signals'
       and column_name = 'entity_aliases_json' and data_type = 'text'
  ) then
    execute 'alter table public.live_signals alter column entity_aliases_json type jsonb using pg_temp.luminari_try_jsonb(entity_aliases_json)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'live_signals'
       and column_name = 'confidence_score' and data_type = 'text'
  ) then
    update public.live_signals
       set confidence_score_legacy_text = coalesce(confidence_score_legacy_text, confidence_score)
     where confidence_score is not null;
    execute $sql$
      alter table public.live_signals
      alter column confidence_score type numeric(10,4)
      using (case when coalesce(confidence_score, '') ~ '^-?[0-9]+([.][0-9]+)?$' then confidence_score::numeric end)
    $sql$;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'live_signals'
       and column_name = 'entity_confidence_score_ls' and data_type = 'text'
  ) then
    update public.live_signals
       set entity_confidence_score_ls_legacy_text = coalesce(entity_confidence_score_ls_legacy_text, entity_confidence_score_ls)
     where entity_confidence_score_ls is not null;
    execute $sql$
      alter table public.live_signals
      alter column entity_confidence_score_ls type numeric(10,4)
      using (case when coalesce(entity_confidence_score_ls, '') ~ '^-?[0-9]+([.][0-9]+)?$' then entity_confidence_score_ls::numeric end)
    $sql$;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'live_signals'
       and column_name = 'role_confidence' and data_type = 'text'
  ) then
    update public.live_signals
       set role_confidence_legacy_text = coalesce(role_confidence_legacy_text, role_confidence)
     where role_confidence is not null;
    execute $sql$
      alter table public.live_signals
      alter column role_confidence type numeric(10,4)
      using (case when coalesce(role_confidence, '') ~ '^-?[0-9]+([.][0-9]+)?$' then role_confidence::numeric end)
    $sql$;
  end if;
end;
$$;

create index if not exists idx_live_signals_dataset on public.live_signals(dataset_id);
create index if not exists idx_live_signals_jurisdiction on public.live_signals(jurisdiction);
create index if not exists idx_live_signals_domain on public.live_signals(domain);
create index if not exists idx_live_signals_detected on public.live_signals(detected_at desc);
create index if not exists idx_live_signals_effect on public.live_signals(effect_type_ls);
create index if not exists idx_live_signals_target on public.live_signals(target_table_ls, target_id_ls);

create unique index if not exists uq_data_stream_registry_stream_id
  on public.data_stream_registry(stream_id_dsr);

create table if not exists public.registry_policy_alerts (
  id text primary key,
  jurisdiction_id_rpa text,
  severity_rpa text,
  title_rpa text,
  description_rpa text,
  created_at_rpa bigint
);

create table if not exists public.registry_workflows (
  id text primary key,
  jurisdiction_id_rw text,
  workflow_type_rw text,
  primary_statutes_rw text,
  steps_rw jsonb,
  deadlines_rw text,
  escalation_paths_rw text,
  created_at_rw bigint
);

create table if not exists public.registry_oversight_bodies (
  id text primary key,
  jurisdiction_id_rob text,
  agency_name_rob text,
  function_rob text,
  statute_of_limitations_rob text,
  contact_rob text,
  pathway_rob text,
  escalation_rob text,
  created_at_rob bigint
);

create table if not exists public.registry_source_traceability (
  id text primary key,
  jurisdiction_id_rst text,
  source_documents_rst jsonb,
  source_variants_rst jsonb,
  notes_on_merge_rst text,
  conflicts_rst jsonb,
  created_at_rst bigint
);

create table if not exists public.registry_signals (
  id text primary key,
  jurisdiction_id_rs text,
  category_rs text,
  signal_type_rs text,
  severity_rs text,
  source_reference_rs text,
  fingerprint_rs text,
  created_at_rs bigint
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'registry_workflows'
       and column_name = 'steps_rw' and data_type = 'text'
  ) then
    execute 'alter table public.registry_workflows alter column steps_rw type jsonb using pg_temp.luminari_try_jsonb(steps_rw)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'registry_source_traceability'
       and column_name = 'source_documents_rst' and data_type = 'text'
  ) then
    execute 'alter table public.registry_source_traceability alter column source_documents_rst type jsonb using pg_temp.luminari_try_jsonb(source_documents_rst)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'registry_source_traceability'
       and column_name = 'source_variants_rst' and data_type = 'text'
  ) then
    execute 'alter table public.registry_source_traceability alter column source_variants_rst type jsonb using pg_temp.luminari_try_jsonb(source_variants_rst)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'registry_source_traceability'
       and column_name = 'conflicts_rst' and data_type = 'text'
  ) then
    execute 'alter table public.registry_source_traceability alter column conflicts_rst type jsonb using pg_temp.luminari_try_jsonb(conflicts_rst)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'registry_oversight_bodies'
       and column_name = 'statute_of_limitations_rob' and data_type like 'timestamp%'
  ) then
    execute 'alter table public.registry_oversight_bodies alter column statute_of_limitations_rob type text using statute_of_limitations_rob::text';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'registry_oversight_bodies'
       and column_name = 'escalation_rob' and data_type like 'timestamp%'
  ) then
    execute 'alter table public.registry_oversight_bodies alter column escalation_rob type text using escalation_rob::text';
  end if;
end;
$$;

create index if not exists idx_registry_policy_alerts_jurisdiction
  on public.registry_policy_alerts(jurisdiction_id_rpa);
create index if not exists idx_registry_workflows_jurisdiction
  on public.registry_workflows(jurisdiction_id_rw);
create index if not exists idx_registry_oversight_jurisdiction
  on public.registry_oversight_bodies(jurisdiction_id_rob);
create index if not exists idx_registry_traceability_jurisdiction
  on public.registry_source_traceability(jurisdiction_id_rst);
create index if not exists idx_registry_signals_jurisdiction
  on public.registry_signals(jurisdiction_id_rs);
create index if not exists idx_registry_signals_type
  on public.registry_signals(signal_type_rs);

-- --------------------------------------------------------------------------
-- Canonical pattern backbone
-- --------------------------------------------------------------------------

-- Production historically exposed `patterns` as an unwriteable compatibility
-- view. It has no dependent views. Preserve every projected row before
-- replacing it with the canonical hybrid table used by both generations of
-- the runtime.
do $$
declare
  relation_kind "char";
  preserved_row_count bigint;
  restored_row_count bigint;
begin
  select c.relkind
    into relation_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'patterns';

  if relation_kind = 'v' then
    create temporary table luminari_patterns_view_backup on commit drop
      as select * from public.patterns;

    select count(*) into preserved_row_count
      from luminari_patterns_view_backup;

    drop view public.patterns;

    create table public.patterns (
      id bigint generated by default as identity primary key,
      pattern_key varchar(128) not null,
      pattern_type varchar(128) not null,
      name varchar(256) not null,
      description text not null,
      entity_name varchar(512),
      claim_type varchar(128),
      jurisdiction varchar(128),
      domain varchar(128),
      case_count integer not null default 0,
      signal_count integer not null default 0,
      confidence_score numeric(5,4) not null default 0.5,
      status varchar(32) not null default 'candidate',
      case_id integer,
      pattern_type_id integer,
      signature text,
      source_signature text,
      source_created_at text,
      occurrence_count integer not null default 0,
      first_seen_at bigint,
      last_seen_at bigint,
      created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
      updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
    );

    insert into public.patterns (
      id, pattern_key, pattern_type, name, description, case_id,
      pattern_type_id, signature, source_signature, source_created_at, occurrence_count, signal_count,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    select
      (to_jsonb(b)->>'id')::bigint,
      'legacy-pattern:' || coalesce(nullif(to_jsonb(b)->>'signature', ''), 'unsigned') || ':' || (to_jsonb(b)->>'id'),
      coalesce(nullif(to_jsonb(b)->>'pattern_type', ''), 'unclassified'),
      initcap(replace(coalesce(nullif(to_jsonb(b)->>'pattern_type', ''), 'unclassified'), '_', ' ')),
      coalesce(nullif(to_jsonb(b)->>'description', ''), 'Preserved compatibility pattern'),
      case when coalesce(to_jsonb(b)->>'case_id', '') ~ '^\d+$' then (to_jsonb(b)->>'case_id')::integer end,
      case when coalesce(to_jsonb(b)->>'pattern_type_id', '') ~ '^\d+$' then (to_jsonb(b)->>'pattern_type_id')::integer end,
      'legacy-pattern:' || coalesce(nullif(to_jsonb(b)->>'signature', ''), 'unsigned') || ':' || (to_jsonb(b)->>'id'),
      nullif(to_jsonb(b)->>'signature', ''),
      to_jsonb(b)->>'created_at',
      case when coalesce(to_jsonb(b)->>'occurrence_count', '') ~ '^\d+$' then (to_jsonb(b)->>'occurrence_count')::integer else 1 end,
      case when coalesce(to_jsonb(b)->>'occurrence_count', '') ~ '^\d+$' then (to_jsonb(b)->>'occurrence_count')::integer else 1 end,
      case when coalesce(to_jsonb(b)->>'first_seen_at', '') ~ '^\d+$' then (to_jsonb(b)->>'first_seen_at')::bigint end,
      case when coalesce(to_jsonb(b)->>'last_seen_at', '') ~ '^\d+$' then (to_jsonb(b)->>'last_seen_at')::bigint end,
      coalesce(
        pg_temp.luminari_epoch_millis(to_jsonb(b)->>'created_at'),
        pg_temp.luminari_epoch_millis(to_jsonb(b)->>'first_seen_at')
      ),
      coalesce(
        pg_temp.luminari_epoch_millis(to_jsonb(b)->>'last_seen_at'),
        pg_temp.luminari_epoch_millis(to_jsonb(b)->>'created_at'),
        pg_temp.luminari_epoch_millis(to_jsonb(b)->>'first_seen_at')
      )
    from luminari_patterns_view_backup b;

    select count(*) into restored_row_count from public.patterns;
    if restored_row_count <> preserved_row_count then
      raise exception 'Pattern conversion preserved % of % source rows', restored_row_count, preserved_row_count;
    end if;

    perform setval(
      pg_get_serial_sequence('public.patterns', 'id'),
      greatest(coalesce((select max(id) from public.patterns), 1), 1),
      true
    );
  end if;
end;
$$;

create table if not exists public.patterns (
  id bigint generated by default as identity primary key,
  pattern_key varchar(128) not null,
  pattern_type varchar(128) not null,
  name varchar(256) not null,
  description text not null,
  entity_name varchar(512),
  claim_type varchar(128),
  jurisdiction varchar(128),
  domain varchar(128),
  case_count integer not null default 0,
  signal_count integer not null default 0,
  confidence_score numeric(5,4) not null default 0.5,
  status varchar(32) not null default 'candidate',
  case_id integer,
  pattern_type_id integer,
  signature text,
  source_signature text,
  source_created_at text,
  occurrence_count integer not null default 0,
  first_seen_at bigint,
  last_seen_at bigint,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.patterns
  add column if not exists pattern_key varchar(128),
  add column if not exists name varchar(256),
  add column if not exists entity_name varchar(512),
  add column if not exists claim_type varchar(128),
  add column if not exists jurisdiction varchar(128),
  add column if not exists domain varchar(128),
  add column if not exists case_count integer default 0,
  add column if not exists signal_count integer default 0,
  add column if not exists confidence_score numeric(5,4) default 0.5,
  add column if not exists status varchar(32) default 'candidate',
  add column if not exists case_id integer,
  add column if not exists pattern_type_id integer,
  add column if not exists signature text,
  add column if not exists source_signature text,
  add column if not exists source_created_at text,
  add column if not exists occurrence_count integer default 0,
  add column if not exists updated_at bigint;

update public.patterns
   set pattern_key = coalesce(nullif(pattern_key, ''), nullif(signature, ''), 'pattern:' || id::text),
       name = coalesce(nullif(name, ''), initcap(replace(pattern_type, '_', ' '))),
       description = coalesce(description, ''),
       case_count = coalesce(case_count, 0),
       signal_count = greatest(coalesce(signal_count, 0), coalesce(occurrence_count, 0)),
       confidence_score = coalesce(confidence_score, 0.5),
       status = coalesce(nullif(status, ''), 'candidate'),
       occurrence_count = coalesce(occurrence_count, 0),
       updated_at = coalesce(updated_at, created_at, (extract(epoch from clock_timestamp()) * 1000)::bigint)
 where pattern_key is null
    or name is null
    or description is null
    or case_count is null
    or signal_count is null
    or confidence_score is null
    or status is null
    or occurrence_count is null
    or updated_at is null;

-- Historical compatibility views used category labels such as `weak_joint`
-- as signatures, so multiple preserved rows can legitimately share one. Keep
-- the exact source value and derive a stable row identity rather than deleting
-- or collapsing any occurrence.
with duplicate_signatures as (
  select signature
    from public.patterns
   where signature is not null
   group by signature
  having count(*) > 1
)
update public.patterns p
   set source_signature = coalesce(p.source_signature, p.signature),
       signature = 'legacy-pattern:' || p.signature || ':' || p.id::text
  from duplicate_signatures d
 where p.signature = d.signature;

with duplicate_keys as (
  select pattern_key
    from public.patterns
   group by pattern_key
  having count(*) > 1
)
update public.patterns p
   set pattern_key = 'legacy-pattern:' || p.pattern_key || ':' || p.id::text
  from duplicate_keys d
 where p.pattern_key = d.pattern_key;

alter table public.patterns
  alter column pattern_key set default ('pattern:' || gen_random_uuid()::text),
  alter column pattern_key set not null,
  alter column name set default 'Detected Pattern',
  alter column name set not null,
  alter column description set default '',
  alter column description set not null,
  alter column case_count set default 0,
  alter column case_count set not null,
  alter column signal_count set default 0,
  alter column signal_count set not null,
  alter column confidence_score set default 0.5,
  alter column confidence_score set not null,
  alter column status set default 'candidate',
  alter column status set not null,
  alter column occurrence_count set default 0,
  alter column occurrence_count set not null,
  alter column updated_at set default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  alter column updated_at set not null;

create unique index if not exists uq_patterns_pattern_key on public.patterns(pattern_key);
create unique index if not exists uq_patterns_signature on public.patterns(signature) where signature is not null;
create index if not exists idx_patterns_type on public.patterns(pattern_type);
create index if not exists idx_patterns_status on public.patterns(status);

create table if not exists public.pattern_types (
  id integer generated by default as identity primary key,
  pattern_type varchar(128) not null unique,
  description text not null default '',
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.pattern_types
  add column if not exists description text default '',
  add column if not exists created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

update public.pattern_types
   set description = coalesce(description, ''),
       created_at = coalesce(created_at, (extract(epoch from clock_timestamp()) * 1000)::bigint)
 where description is null or created_at is null;

alter table public.pattern_types
  alter column description set not null,
  alter column created_at set not null;

insert into public.pattern_types(pattern_type, description)
values
  ('entity_recurrence', 'The same normalized entity appears in more than one case.'),
  ('agency_behavior', 'A recurring agency behavior appears across cases.'),
  ('denial_language_pattern', 'Materially similar denial language recurs across records.'),
  ('regulatory_violation_pattern', 'The same regulatory violation recurs across cases.'),
  ('foia_denial_pattern', 'Public-records denials recur for the same agency or basis.'),
  ('record_gap_pattern', 'The same required-record gap recurs across cases.')
on conflict (pattern_type) do update
set description = excluded.description;

create table if not exists public.pattern_occurrences (
  id integer generated by default as identity primary key,
  pattern_id integer not null,
  case_id integer not null,
  entity_id integer,
  agency_id integer,
  evidence_reference_id integer not null,
  evidence_reference_type varchar(64) not null,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.pattern_occurrences
  add column if not exists created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

update public.pattern_occurrences
   set created_at = (extract(epoch from clock_timestamp()) * 1000)::bigint
 where created_at is null;

alter table public.pattern_occurrences alter column created_at set not null;

create index if not exists idx_pattern_occurrences_pattern on public.pattern_occurrences(pattern_id);
create index if not exists idx_pattern_occurrences_case on public.pattern_occurrences(case_id);
create index if not exists idx_pattern_occurrences_entity on public.pattern_occurrences(entity_id);
create index if not exists idx_pattern_occurrences_agency on public.pattern_occurrences(agency_id);
create unique index if not exists uq_pattern_occurrence_evidence
  on public.pattern_occurrences(pattern_id, case_id, evidence_reference_id, evidence_reference_type);

-- --------------------------------------------------------------------------
-- Governed pattern/trend/strategy read projections
-- --------------------------------------------------------------------------

create table if not exists public.pattern_registry (
  id integer generated by default as identity primary key,
  pattern_id text,
  pattern_name text not null default 'Unclassified Pattern',
  pattern_description text,
  pattern_type text,
  signal_type text,
  trigger_threshold integer,
  confidence_threshold integer,
  confidence_score integer default 0,
  jurisdiction_scope text,
  first_detected text,
  last_confirmed text,
  last_updated text,
  signal_count integer default 0,
  unique_entities_count integer default 0,
  geographic_spread integer default 0,
  time_span_days integer default 0,
  decay_status text default 'active',
  decay_reason text,
  related_laws text,
  related_agencies text,
  harm_domains text,
  metadata text,
  created_at bigint,
  updated_at bigint,
  jurisdiction text,
  pressure_index integer default 0,
  trend text
);

alter table public.pattern_registry
  add column if not exists pattern_id text,
  add column if not exists jurisdiction text,
  add column if not exists pressure_index integer default 0,
  add column if not exists trend text;

update public.pattern_registry
   set pattern_id = coalesce(nullif(pattern_id, ''), 'registry:' || id::text)
 where pattern_id is null or pattern_id = '';

create unique index if not exists uq_pattern_registry_pattern_id on public.pattern_registry(pattern_id);

create table if not exists public.trend_registry (
  id uuid primary key default gen_random_uuid(),
  pattern_id text,
  trend_classification text default 'emerging',
  domain text,
  jurisdiction text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  trend_id text unique default gen_random_uuid()::text,
  momentum_direction varchar(20) default 'plateau',
  pressure_index integer default 0,
  current_signal_count integer default 0,
  current_confidence_score numeric(5,2) default 0,
  current_geographic_spread integer default 0,
  current_time_span_days integer default 0,
  growth_rate_7d numeric(8,2) default 0,
  growth_rate_30d numeric(8,2) default 0,
  growth_rate_90d numeric(8,2) default 0,
  acceleration_rate numeric(8,2) default 0,
  momentum_score integer default 0,
  geographic_expansion_rate numeric(8,2) default 0,
  new_regions_count integer default 0,
  region_concentration_index numeric(5,2) default 0,
  signal_density numeric(8,2) default 0,
  density_trend varchar(20) default 'stable',
  forecast_30d_signal_count integer default 0,
  forecast_confidence numeric(5,2) default 0,
  projected_peak_date date,
  pressure_factors jsonb,
  last_calculated timestamp default now(),
  valid_until timestamp,
  is_current boolean default true
);

create index if not exists idx_trend_registry_pattern on public.trend_registry(pattern_id);
create index if not exists idx_trend_registry_current on public.trend_registry(is_current) where is_current;
create index if not exists idx_trend_registry_pressure on public.trend_registry(pressure_index desc) where is_current;

-- Rebuild this small dependency family in leaf-to-root order. Avoid CASCADE so
-- an unexpected external consumer stops the migration instead of disappearing.
drop view if exists public.v_pipeline_health;
drop view if exists public.v_active_patterns;
drop view if exists public.v_active_trends;
create view public.v_active_trends
with (security_invoker = true)
as
select
  coalesce(nullif(t.trend_id, ''), t.id::text) as trend_id,
  t.pattern_id,
  coalesce(nullif(t.trend_classification, ''), 'emerging') as trend_classification,
  t.domain,
  coalesce(nullif(t.jurisdiction, ''), 'unknown') as jurisdiction,
  coalesce(nullif(t.momentum_direction, ''), 'plateau') as momentum_direction,
  coalesce(t.pressure_index, 0) as pressure_index,
  coalesce(t.current_signal_count, 0) as current_signal_count,
  coalesce(t.current_confidence_score, 0) as current_confidence_score,
  t.growth_rate_7d,
  t.growth_rate_30d,
  t.growth_rate_90d,
  t.forecast_30d_signal_count,
  t.forecast_confidence,
  t.projected_peak_date,
  coalesce(t.is_current, true) as is_current,
  coalesce(t.last_calculated, t.updated_at::timestamp, t.created_at::timestamp) as last_calculated,
  t.created_at,
  t.updated_at
from public.trend_registry t
where coalesce(t.is_current, true);

create or replace view public.v_active_patterns
with (security_invoker = true)
as
select
  t.pattern_id,
  initcap(replace(coalesce(t.domain, 'unclassified'), '_', ' ')) || ' — ' ||
    initcap(replace(t.trend_classification, '_', ' ')) as pattern_name,
  t.trend_classification as pattern_type,
  t.domain,
  t.jurisdiction,
  t.current_signal_count as signal_count,
  t.current_confidence_score as confidence_score,
  null::integer as geographic_spread,
  null::integer as time_span_days,
  'active'::text as decay_status,
  t.created_at as first_detected,
  t.last_calculated as last_confirmed,
  null::text[] as harm_domains,
  null::text[] as related_laws,
  null::text[] as related_agencies,
  jsonb_build_object(
    'source', 'v_active_trends',
    'trend_id', t.trend_id,
    'attribution_status', 'trend_only'
  ) as metadata,
  t.created_at,
  t.updated_at
from public.v_active_trends t
where t.pattern_id is not null and t.current_signal_count > 0;

create table if not exists public.strategy_registry (
  strategy_id text primary key,
  strategy_name text not null,
  strategy_type text,
  description text,
  domain text,
  historical_success_rate numeric,
  last_updated_from_outcomes date,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace view public.v_active_strategies
with (security_invoker = true)
as
select
  s.strategy_id as id,
  s.strategy_id as strategy_hash,
  s.strategy_name as title,
  s.description,
  'systemic'::text as strategy_scope,
  'routine'::text as urgency_level,
  s.strategy_type as intervention_class,
  null::text as jurisdiction_scope,
  null::text as escalation_template,
  null::text as rule_path,
  jsonb_build_object('domain', s.domain, 'historical_success_rate', s.historical_success_rate) as action_eligibility,
  case when coalesce(s.is_active, true) then 'active' else 'inactive' end as path_status,
  null::text as trend_id,
  null::text as pattern_id,
  null::text as case_id,
  s.created_at,
  null::text as trend_classification,
  null::integer as pressure_index,
  s.domain as trend_domain,
  null::text as pattern_name,
  null::integer as pattern_signal_count
from public.strategy_registry s
where coalesce(s.is_active, true);

-- --------------------------------------------------------------------------
-- Governed signal/gate lineage. Existing records do not contain a reliable
-- foreign-key bridge between detected_signals and sunam_gate_log, so the
-- lineage view preserves those fields as NULL instead of manufacturing links.
-- --------------------------------------------------------------------------

create table if not exists public.sunam_gate_log (
  id integer generated by default as identity primary key,
  decision text,
  threshold text,
  threshold_id text,
  reason text,
  "timestamp" bigint,
  live_signal_id integer,
  signal_fingerprint text,
  signal_type text,
  dataset_id text,
  sunam_score text,
  threshold_used text,
  decision_reason text,
  promoted_signal_id text,
  staging_id integer,
  actor text,
  decided_at bigint,
  created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  score_breakdown text
);

alter table public.sunam_gate_log
  add column if not exists decision text,
  add column if not exists reason text,
  add column if not exists "timestamp" bigint,
  add column if not exists live_signal_id integer,
  add column if not exists signal_fingerprint text,
  add column if not exists signal_type text,
  add column if not exists dataset_id text,
  add column if not exists sunam_score text,
  add column if not exists threshold_used text,
  add column if not exists decision_reason text,
  add column if not exists promoted_signal_id text,
  add column if not exists staging_id integer,
  add column if not exists actor text,
  add column if not exists decided_at bigint,
  add column if not exists created_at bigint,
  add column if not exists score_breakdown text;

create index if not exists idx_sunam_gate_log_decision on public.sunam_gate_log(decision);
create index if not exists idx_sunam_gate_log_decided_at on public.sunam_gate_log(decided_at desc);
create index if not exists idx_sunam_gate_log_promoted_signal on public.sunam_gate_log(promoted_signal_id)
  where promoted_signal_id is not null;

create or replace view public.v_gate_decisions
with (security_invoker = true)
as
select
  g.id::text as gate_log_id,
  coalesce(nullif(g.signal_type, ''), 'unclassified') as signal_type,
  coalesce(nullif(g.dataset_id, ''), 'sunam_gate_log') as source_system,
  null::text as source_connector_id,
  'unknown'::text as jurisdiction_raw_value,
  nullif(g.dataset_id, '') as dataset_id,
  case
    when lower(coalesce(g.decision, '')) in ('approve', 'approved', 'promote', 'promoted') then 'PROMOTE'
    when lower(coalesce(g.decision, '')) in ('stage', 'staged') then 'STAGE'
    when lower(coalesce(g.decision, '')) in ('hold', 'held') then 'HOLD'
    when lower(coalesce(g.decision, '')) in ('reject', 'rejected') then 'REJECT'
    when lower(coalesce(g.decision, '')) in ('escalate', 'escalate_review', 'review') then 'ESCALATE_REVIEW'
    else upper(coalesce(nullif(g.decision, ''), 'UNKNOWN'))
  end as decision,
  case when coalesce(g.sunam_score, '') ~ '^-?[0-9]+([.][0-9]+)?$' then g.sunam_score::numeric end as composite_score,
  null::text as profile_name,
  null::numeric as score_provenance_confidence,
  null::numeric as score_source_trust_tier,
  null::numeric as score_jurisdiction_validity,
  null::numeric as score_temporal_relevance,
  null::numeric as score_schema_validity,
  null::numeric as score_duplicate_probability,
  null::numeric as score_extraction_completeness,
  null::numeric as score_contradiction_flags,
  coalesce(nullif(g.decision_reason, ''), nullif(g.reason, '')) as decision_reason,
  to_timestamp(coalesce(g.decided_at, g."timestamp", g.created_at, 0)::double precision / 1000.0) as evaluated_at,
  null::text as gate_hash,
  nullif(g.signal_fingerprint, '') as signal_hash,
  null::text as payload_hash,
  null::text as decision_hash,
  (
    lower(coalesce(g.decision, '')) in ('approve', 'approved', 'promote', 'promoted')
    or g.promoted_signal_id is not null
  ) as was_promoted,
  case when g.promoted_signal_id is not null
       then to_timestamp(coalesce(g.decided_at, g."timestamp", g.created_at, 0)::double precision / 1000.0)
  end as promoted_at,
  nullif(g.promoted_signal_id, '') as detected_signal_id,
  g.staging_id::text as staging_id,
  null::boolean as staging_resolved,
  null::text as staging_notes
from public.sunam_gate_log g;

create or replace view public.v_signal_lineage
with (security_invoker = true)
as
select
  coalesce(nullif(d.signal_id, ''), nullif(d.live_signal_id, ''), d.id::text) as detected_signal_id,
  coalesce(nullif(d.signal_type, ''), 'unclassified') as signal_type,
  coalesce(nullif(d.jurisdiction_scope, ''), nullif(d.jurisdiction, ''), 'unknown') as jurisdiction_raw_value,
  coalesce(d.confidence_score,
    case when coalesce(d.confidence_score_raw, '') ~ '^-?[0-9]+([.][0-9]+)?$'
         then round(d.confidence_score_raw::numeric)::integer end,
    0
  ) as confidence_score,
  coalesce(nullif(d.severity_level, ''), nullif(d.severity, '')) as severity,
  case when coalesce(d.detected_at, d.detection_timestamp, d.created_at, 0) > 0
       then to_timestamp(coalesce(d.detected_at, d.detection_timestamp, d.created_at)::double precision / 1000.0)
  end as detected_at,
  coalesce(nullif(d.dataset_id, ''), 'detected_signals') as source_system,
  nullif(d.external_reference_id, '') as source_connector_id,
  null::text as gate_log_id,
  null::text as gate_decision,
  null::numeric as gate_composite_score,
  null::numeric as score_provenance_confidence,
  null::numeric as score_source_trust_tier,
  null::numeric as score_jurisdiction_validity,
  null::numeric as score_temporal_relevance,
  null::numeric as score_duplicate_probability,
  null::numeric as score_extraction_completeness,
  null::numeric as score_schema_validity,
  null::numeric as score_contradiction_flags,
  null::timestamptz as gate_decided_at,
  null::text as linked_pattern_id,
  null::text as pattern_name,
  null::integer as pattern_signal_count,
  null::numeric as pattern_confidence,
  null::text as linked_trend_id,
  null::text as trend_classification,
  null::integer as pressure_index
from public.detected_signals d;

create or replace view public.v_staged_signals
with (security_invoker = true)
as
select
  coalesce(nullif(d.signal_id, ''), nullif(d.live_signal_id, ''), d.id::text) as staging_id,
  null::text as gate_log_id,
  coalesce(nullif(d.signal_type, ''), 'unclassified') as signal_type,
  coalesce(nullif(d.dataset_id, ''), 'detected_signals') as source_system,
  coalesce(nullif(d.jurisdiction_scope, ''), nullif(d.jurisdiction, ''), 'unknown') as jurisdiction_raw_value,
  'STAGE'::text as gate_decision,
  coalesce(d.confidence_score,
    case when coalesce(d.confidence_score_raw, '') ~ '^-?[0-9]+([.][0-9]+)?$'
         then round(d.confidence_score_raw::numeric)::integer end,
    0
  ) as confidence_score,
  coalesce(nullif(d.severity_level, ''), nullif(d.severity, '')) as severity,
  coalesce(nullif(d.review_notes, ''), nullif(d.explanation, '')) as decision_reason,
  nullif(d.review_notes, '') as reviewer_notes,
  false as resolved,
  to_timestamp(coalesce(d.detected_at, d.detection_timestamp, d.created_at, 0)::double precision / 1000.0) as staged_at,
  greatest(
    extract(epoch from (clock_timestamp() - to_timestamp(coalesce(d.detected_at, d.detection_timestamp, d.created_at, 0)::double precision / 1000.0))) / 3600.0,
    0
  )::numeric(14,2) as age_hours
from public.detected_signals d
where lower(coalesce(d.approval_status, '')) in ('staged', 'stage', 'pending_review', 'held');

create or replace view public.v_pipeline_health
with (security_invoker = true)
as
with signal_stats as (
  select
    count(*)::integer as total_signals,
    count(*) filter (where lower(coalesce(approval_status, '')) in ('approved', 'promoted'))::integer as gate_promoted,
    max(coalesce(detected_at, detection_timestamp, created_at)) as last_signal_ms
  from public.detected_signals
), gate_stats as (
  select
    count(*)::integer as total_decisions,
    count(*) filter (where decision = 'PROMOTE')::integer as promoted,
    count(*) filter (where decision in ('STAGE', 'HOLD', 'ESCALATE_REVIEW'))::integer as staged_or_held,
    count(*) filter (where decision = 'REJECT')::integer as rejected,
    max(evaluated_at) as last_gate_at,
    avg(composite_score) as avg_gate_score
  from public.v_gate_decisions
), staged_stats as (
  select count(*)::integer as pending_review from public.v_staged_signals
), pattern_stats as (
  select count(*)::integer as active_patterns from public.v_active_patterns
), trend_stats as (
  select count(*)::integer as current_trends from public.v_active_trends
), strategy_stats as (
  select count(*)::integer as active_strategies from public.v_active_strategies
)
select
  clock_timestamp() as health_checked_at,
  s.total_signals,
  s.gate_promoted,
  greatest(s.total_signals - s.gate_promoted, 0)::integer as legacy_ungated,
  case when s.last_signal_ms is not null and s.last_signal_ms > 0
       then to_timestamp(s.last_signal_ms::double precision / 1000.0) end as last_signal_at,
  g.total_decisions,
  g.promoted,
  g.staged_or_held,
  g.rejected,
  g.last_gate_at,
  g.avg_gate_score,
  st.pending_review,
  0::integer as pending_escalation,
  p.active_patterns,
  t.current_trends,
  y.active_strategies,
  null::timestamptz as last_pattern_run,
  null::timestamptz as last_trend_run,
  null::timestamptz as last_strategy_run,
  0::integer as pattern_runs_sealed,
  0::integer as trend_runs_sealed,
  0::integer as strategy_runs_sealed,
  s.total_signals as live_signals_total,
  case
    when s.last_signal_ms is null then 'no_signals'
    when s.last_signal_ms >= (extract(epoch from clock_timestamp()) * 1000)::bigint - 86400000 then 'fresh'
    else 'stale'
  end as signal_freshness,
  case when st.pending_review > 500 then 'backlogged' else 'operational' end as staging_health,
  case when p.active_patterns > 0 or t.current_trends > 0 then 'operational' else 'no_active_patterns' end as pattern_engine_health
from signal_stats s
cross join gate_stats g
cross join staged_stats st
cross join pattern_stats p
cross join trend_stats t
cross join strategy_stats y;

-- --------------------------------------------------------------------------
-- User workflow compatibility: presentations, merge review, and feedback
-- --------------------------------------------------------------------------

create table if not exists public.presentations (
  id integer generated by default as identity primary key,
  case_id integer not null,
  user_id integer not null,
  title varchar(512) not null,
  description text,
  snapshot_id integer,
  slide_count integer not null default 0,
  theme varchar(64) not null default 'courtroom',
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.presentations
  add column if not exists description text,
  add column if not exists snapshot_id integer,
  add column if not exists slide_count integer default 0,
  add column if not exists theme varchar(64) default 'courtroom',
  add column if not exists created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  add column if not exists updated_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

update public.presentations
   set slide_count = coalesce(slide_count, 0),
       theme = coalesce(nullif(theme, ''), 'courtroom'),
       created_at = coalesce(created_at, (extract(epoch from clock_timestamp()) * 1000)::bigint),
       updated_at = coalesce(updated_at, created_at, (extract(epoch from clock_timestamp()) * 1000)::bigint)
 where slide_count is null or theme is null or created_at is null or updated_at is null;

alter table public.presentations
  alter column slide_count set not null,
  alter column theme set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

create index if not exists idx_presentations_case on public.presentations(case_id);
create index if not exists idx_presentations_user on public.presentations(user_id);

create table if not exists public.presentation_slides (
  id integer generated by default as identity primary key,
  presentation_id integer not null,
  order_index integer not null,
  slide_type varchar(64) not null,
  title varchar(512),
  content text,
  source_citations jsonb,
  notes text,
  layout varchar(64) not null default 'default',
  metadata jsonb
);

alter table public.presentation_slides
  add column if not exists title varchar(512),
  add column if not exists content text,
  add column if not exists source_citations jsonb,
  add column if not exists notes text,
  add column if not exists layout varchar(64) default 'default',
  add column if not exists metadata jsonb;

update public.presentation_slides
   set slide_type = coalesce(nullif(slide_type, ''), 'custom'),
       layout = coalesce(nullif(layout, ''), 'default')
 where slide_type is null or layout is null;

alter table public.presentation_slides
  alter column slide_type set not null,
  alter column layout set not null;

create index if not exists idx_presentation_slides_presentation
  on public.presentation_slides(presentation_id, order_index);

create table if not exists public.entity_merge_suggestions (
  id integer generated by default as identity primary key,
  case_id integer not null,
  source_entity_id integer not null,
  target_entity_id integer not null,
  confidence double precision not null,
  reason text not null,
  status varchar(16) not null default 'pending',
  reviewed_at bigint,
  reviewed_by integer,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.entity_merge_suggestions
  add column if not exists status varchar(16) default 'pending',
  add column if not exists reviewed_by integer,
  add column if not exists created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'entity_merge_suggestions'
       and column_name = 'entity_merge_suggestions_merge_status_enum'
  ) then
    execute $sql$
      update public.entity_merge_suggestions
         set status = coalesce(nullif(entity_merge_suggestions_merge_status_enum, ''), status, 'pending')
       where status is null or status = 'pending'
    $sql$;
  end if;
end;
$$;

update public.entity_merge_suggestions
   set status = coalesce(nullif(status, ''), 'pending'),
       created_at = coalesce(created_at, (extract(epoch from clock_timestamp()) * 1000)::bigint)
 where status is null or created_at is null;

alter table public.entity_merge_suggestions
  alter column status set not null,
  alter column created_at set not null;

create index if not exists idx_entity_merge_case on public.entity_merge_suggestions(case_id);
create index if not exists idx_entity_merge_status on public.entity_merge_suggestions(status);
create unique index if not exists uq_entity_merge_pair
  on public.entity_merge_suggestions(case_id, least(source_entity_id, target_entity_id), greatest(source_entity_id, target_entity_id));

create table if not exists public.user_feedback (
  id integer generated by default as identity primary key,
  user_id integer not null,
  case_id integer,
  feedback_type varchar(32) not null default 'suggestion',
  message text not null,
  current_page varchar(256),
  pipeline_type varchar(64),
  status varchar(16) not null default 'new',
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.user_feedback
  add column if not exists feedback_type varchar(32) default 'suggestion',
  add column if not exists pipeline_type varchar(64),
  add column if not exists status varchar(16) default 'new',
  add column if not exists created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'user_feedback'
       and column_name = 'user_feedback_feedback_type_enum'
  ) then
    execute $sql$
      update public.user_feedback
         set feedback_type = coalesce(nullif(user_feedback_feedback_type_enum, ''), feedback_type, 'suggestion')
       where feedback_type is null or feedback_type = 'suggestion'
    $sql$;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'user_feedback'
       and column_name = 'user_feedback_feedback_status_enum'
  ) then
    execute $sql$
      update public.user_feedback
         set status = coalesce(nullif(user_feedback_feedback_status_enum, ''), status, 'new')
       where status is null or status = 'new'
    $sql$;
  end if;
end;
$$;

update public.user_feedback
   set feedback_type = coalesce(nullif(feedback_type, ''), 'suggestion'),
       status = coalesce(nullif(status, ''), 'new'),
       created_at = coalesce(created_at, (extract(epoch from clock_timestamp()) * 1000)::bigint)
 where feedback_type is null or status is null or created_at is null;

alter table public.user_feedback
  alter column feedback_type set not null,
  alter column status set not null,
  alter column created_at set not null;

create index if not exists idx_user_feedback_user on public.user_feedback(user_id);
create index if not exists idx_user_feedback_status on public.user_feedback(status);

-- --------------------------------------------------------------------------
-- Case state and LumenSend
-- --------------------------------------------------------------------------

create table if not exists public.case_state (
  id integer generated by default as identity primary key,
  case_id integer not null unique,
  user_id integer not null,
  procedural_path_id integer,
  procedural_path_label varchar(256),
  remedy_strategy_id integer,
  remedy_strategy_label varchar(256),
  claim_type varchar(64),
  jurisdiction varchar(64),
  committed_finding_ids jsonb not null default '[]'::jsonb,
  committed_barrier_ids jsonb not null default '[]'::jsonb,
  committed_benefit_ids jsonb not null default '[]'::jsonb,
  committed_signal_ids jsonb not null default '[]'::jsonb,
  committed_statute_ids jsonb not null default '[]'::jsonb,
  committed_foia_ids jsonb not null default '[]'::jsonb,
  committed_filing_ids jsonb not null default '[]'::jsonb,
  completeness_score integer not null default 0,
  completeness_breakdown jsonb,
  computed_deadlines jsonb,
  next_actions jsonb,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create index if not exists idx_case_state_user on public.case_state(user_id);

create table if not exists public.case_flags (
  id integer generated by default as identity primary key,
  case_id integer not null,
  user_id integer not null,
  flag_type varchar(16) not null default 'user',
  location varchar(128) not null,
  target_id integer,
  target_type varchar(64),
  message text not null,
  flag_status varchar(16) not null default 'open',
  area_name varchar(256),
  state_code varchar(10),
  lat double precision,
  lng double precision,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  resolved_at bigint
);

create index if not exists idx_case_flags_case on public.case_flags(case_id);
create index if not exists idx_case_flags_user on public.case_flags(user_id);
create index if not exists idx_case_flags_status on public.case_flags(flag_status);

create table if not exists public.lumensend_templates (
  id integer generated by default as identity primary key,
  document_type varchar(32) not null,
  name varchar(256) not null,
  description text,
  subject_template text not null,
  body_template text not null,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.lumensend_templates
  add column if not exists document_type varchar(32),
  add column if not exists subject_template text,
  add column if not exists body_template text,
  add column if not exists created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

create index if not exists idx_lumensend_templates_type on public.lumensend_templates(document_type);

create table if not exists public.lumensend_drafts (
  id integer generated by default as identity primary key,
  user_id integer not null,
  case_id integer,
  document_type varchar(32) not null,
  template_id integer,
  recipient_agency varchar(512),
  recipient_name varchar(256),
  recipient_address text,
  recipient_email varchar(320),
  recipient_phone varchar(64),
  subject text not null,
  body text not null,
  sender_name varchar(256),
  sender_address text,
  sender_email varchar(320),
  sender_phone varchar(64),
  context_type varchar(32) not null default 'manual',
  context_id varchar(256),
  context_label text,
  jurisdiction varchar(64),
  status varchar(16) not null default 'draft',
  sent_at bigint,
  sent_method varchar(16),
  related_actions text,
  follow_up_date bigint,
  follow_up_sent boolean default false,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create index if not exists idx_lumensend_drafts_user on public.lumensend_drafts(user_id);
create index if not exists idx_lumensend_drafts_case on public.lumensend_drafts(case_id);
create index if not exists idx_lumensend_drafts_status on public.lumensend_drafts(status);

-- --------------------------------------------------------------------------
-- Remedy generation and outcome memory
-- --------------------------------------------------------------------------

-- `remedy_templates.id` and timestamp storage differ between historical
-- environments. Runtime identity is template_id, so preserve the physical id
-- and timestamp types while converging every column actually consumed.
alter table public.remedy_templates
  add column if not exists template_body text,
  add column if not exists placeholder_fields text,
  add column if not exists governing_law text,
  add column if not exists difficulty_level text default 'standard',
  add column if not exists usage_count integer default 0,
  add column if not exists success_rate text,
  add column if not exists is_active integer default 1;

update public.remedy_templates
   set difficulty_level = coalesce(nullif(difficulty_level, ''), 'standard'),
       usage_count = coalesce(usage_count, 0),
       is_active = coalesce(is_active, 1)
 where difficulty_level is null or usage_count is null or is_active is null;

create index if not exists idx_remedy_templates_active on public.remedy_templates(is_active)
  where is_active = 1;
create index if not exists idx_remedy_templates_claim_jurisdiction
  on public.remedy_templates(claim_type, jurisdiction);

create table if not exists public.remedy_doc_generated (
  doc_id text primary key,
  template_id text not null,
  case_id integer,
  pattern_id text,
  strategy_path_id text,
  document_content text not null,
  document_title text,
  document_type text,
  doc_status text not null default 'draft',
  generated_by integer,
  jurisdiction text,
  metadata jsonb,
  file_url text,
  evidence_item_id integer,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create index if not exists idx_remedy_doc_case on public.remedy_doc_generated(case_id);
create index if not exists idx_remedy_doc_pattern on public.remedy_doc_generated(pattern_id);
create index if not exists idx_remedy_doc_template on public.remedy_doc_generated(template_id);
create index if not exists idx_remedy_doc_status on public.remedy_doc_generated(doc_status);

create table if not exists public.doc_generation_queue (
  queue_id text primary key,
  template_id text,
  case_id integer,
  pattern_id text,
  strategy_path_id text,
  priority integer not null default 5,
  queue_status text not null default 'pending',
  requested_by integer,
  requested_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  processed_at bigint,
  error_message text
);

create index if not exists idx_doc_generation_pending
  on public.doc_generation_queue(priority, requested_at)
  where queue_status = 'pending';
create index if not exists idx_doc_generation_case on public.doc_generation_queue(case_id);

create table if not exists public.template_effectiveness (
  effectiveness_id text primary key,
  template_id text not null unique,
  total_uses integer not null default 0,
  successful_outcomes integer not null default 0,
  avg_settlement_amount numeric(14,2) default 0,
  avg_response_time_days numeric(10,2) default 0,
  avg_effectiveness_score numeric(5,2) default 0,
  last_calculated_at bigint,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create index if not exists idx_template_effectiveness_score
  on public.template_effectiveness(avg_effectiveness_score desc)
  where total_uses > 0;

create table if not exists public.strategy_memory (
  id integer generated by default as identity primary key,
  memory_id text unique,
  pattern_type text,
  claim_type text,
  jurisdiction text,
  strategy_id text,
  remedy_template_id text,
  intervention_type text,
  signals_before integer default 0,
  signals_after integer default 0,
  pressure_before numeric default 0,
  pressure_after numeric default 0,
  time_to_impact_days integer default 0,
  cost numeric default 0,
  success_score integer default 0,
  confidence_score integer default 0,
  outcome_id text,
  case_id text,
  notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.strategy_memory
  add column if not exists claim_type text,
  add column if not exists strategy_id text,
  add column if not exists remedy_template_id text,
  add column if not exists signals_before integer default 0,
  add column if not exists signals_after integer default 0,
  add column if not exists pressure_before numeric default 0,
  add column if not exists pressure_after numeric default 0,
  add column if not exists time_to_impact_days integer default 0,
  add column if not exists cost numeric default 0,
  add column if not exists outcome_id text,
  add column if not exists case_id text;

create index if not exists idx_strategy_memory_pattern on public.strategy_memory(pattern_type);
create index if not exists idx_strategy_memory_strategy on public.strategy_memory(strategy_id);
create index if not exists idx_strategy_memory_jurisdiction on public.strategy_memory(jurisdiction);

create table if not exists public.strategy_memory_summary (
  id integer generated by default as identity primary key,
  pattern_type text not null,
  strategy_id text not null,
  jurisdiction text not null default '',
  claim_type text not null default '',
  avg_success_score numeric default 0,
  avg_cost numeric default 0,
  avg_time_to_impact integer default 0,
  success_rate numeric default 0,
  sample_size integer default 0,
  last_updated bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  unique(pattern_type, strategy_id, jurisdiction, claim_type)
);

create index if not exists idx_strategy_memory_summary_lookup
  on public.strategy_memory_summary(pattern_type, jurisdiction, claim_type, avg_success_score desc);

-- --------------------------------------------------------------------------
-- Restore receipts and intervention timelines
-- --------------------------------------------------------------------------

create table if not exists public.restore_spine_runs (
  id integer generated by default as identity primary key,
  bundle_name varchar(256) not null,
  restore_type varchar(16) not null,
  status varchar(16) not null default 'pending',
  started_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  completed_at bigint,
  restored_tables jsonb,
  restored_engines jsonb,
  restored_streams jsonb,
  errors jsonb,
  executed_by varchar(256),
  risk_level varchar(16) default 'medium',
  manifest_checksum varchar(128),
  validation_result jsonb
);

create index if not exists idx_restore_spine_status on public.restore_spine_runs(status);
create index if not exists idx_restore_spine_started on public.restore_spine_runs(started_at desc);

create table if not exists public.pattern_timeline_events (
  id integer generated by default as identity primary key,
  pattern_id varchar(128) not null,
  event_type varchar(32) not null,
  event_source varchar(256),
  title varchar(512) not null,
  description text,
  impact_score integer default 0,
  metadata jsonb,
  "timestamp" bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create index if not exists idx_pattern_timeline_pattern
  on public.pattern_timeline_events(pattern_id, "timestamp");
create index if not exists idx_pattern_timeline_type
  on public.pattern_timeline_events(event_type);

-- --------------------------------------------------------------------------
-- Cross-case pattern analytics (canonical snake_case physical contract)
-- --------------------------------------------------------------------------

create table if not exists public.pattern_entity_clusters (
  id integer generated by default as identity primary key,
  entity_name varchar(512) not null,
  entity_type varchar(64),
  aliases jsonb,
  case_ids jsonb,
  case_count integer default 0,
  first_seen bigint,
  last_seen bigint,
  jurisdictions jsonb,
  claim_types jsonb,
  risk_score numeric(5,2),
  notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_pattern_entity_name on public.pattern_entity_clusters(entity_name);

create table if not exists public.pattern_conduct_clusters (
  id integer generated by default as identity primary key,
  conduct_type varchar(256) not null,
  conduct_category varchar(128),
  description text,
  case_ids jsonb,
  case_count integer default 0,
  entity_cluster_ids jsonb,
  common_elements jsonb,
  frequency_score numeric(5,2),
  severity_score numeric(5,2),
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_pattern_conduct_type on public.pattern_conduct_clusters(conduct_type);

create table if not exists public.pattern_outcome_analytics (
  id integer generated by default as identity primary key,
  claim_type varchar(128) not null,
  jurisdiction varchar(128),
  forum varchar(256),
  total_cases integer default 0,
  win_rate numeric(5,2),
  settlement_rate numeric(5,2),
  avg_settlement_amount numeric(12,2),
  avg_time_to_resolution varchar(64),
  median_damages_awarded numeric(12,2),
  key_factors jsonb,
  time_range varchar(64),
  notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_pattern_outcome_claim on public.pattern_outcome_analytics(claim_type);

create table if not exists public.pattern_outcome_divergence (
  id integer generated by default as identity primary key,
  claim_type varchar(128) not null,
  jurisdiction_a varchar(128) not null,
  jurisdiction_b varchar(128) not null,
  metric_name varchar(128) not null,
  value_a numeric(10,2),
  value_b numeric(10,2),
  divergence_score numeric(5,2),
  explanation text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.pattern_systemic_inferences (
  id integer generated by default as identity primary key,
  inference_type varchar(128) not null,
  description text not null,
  entity_cluster_ids jsonb,
  conduct_cluster_ids jsonb,
  supporting_case_ids jsonb,
  evidence_strength varchar(32) default 'preliminary',
  confidence_score numeric(5,2),
  legal_implications text,
  recommended_actions jsonb,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_pattern_inference_strength on public.pattern_systemic_inferences(evidence_strength);

create table if not exists public.pattern_temporal_trends (
  id integer generated by default as identity primary key,
  trend_type varchar(128) not null,
  claim_type varchar(128),
  jurisdiction varchar(128),
  period_start varchar(32),
  period_end varchar(32),
  metric_name varchar(128) not null,
  metric_value numeric(10,2),
  previous_value numeric(10,2),
  change_percent numeric(7,2),
  trend_direction varchar(16) default 'stable',
  notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.pattern_geographic_hotspots (
  id integer generated by default as identity primary key,
  jurisdiction varchar(128) not null,
  region varchar(128),
  claim_type varchar(128),
  case_count integer default 0,
  density_score numeric(5,2),
  top_entities jsonb,
  top_conduct_types jsonb,
  period_covered varchar(64),
  notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.pattern_industry_profiles (
  id integer generated by default as identity primary key,
  industry_name varchar(256) not null,
  naics_code varchar(16),
  common_claim_types jsonb,
  common_violations jsonb,
  avg_case_count integer default 0,
  risk_level varchar(16) default 'medium',
  regulatory_focus jsonb,
  notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.pattern_evidence_correlations (
  id integer generated by default as identity primary key,
  evidence_type varchar(128) not null,
  claim_type varchar(128),
  correlation_strength numeric(5,2),
  outcome_impact varchar(32) default 'neutral',
  sample_size integer default 0,
  description text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.pattern_defense_strategies (
  id integer generated by default as identity primary key,
  defense_name varchar(256) not null,
  claim_type varchar(128),
  frequency_observed integer default 0,
  success_rate numeric(5,2),
  counter_strategies jsonb,
  vulnerabilities jsonb,
  notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.pattern_case_links (
  id integer generated by default as identity primary key,
  case_id_a integer not null,
  case_id_b integer not null,
  link_type varchar(128) not null,
  shared_entity_cluster_ids jsonb,
  shared_conduct_cluster_ids jsonb,
  similarity_score numeric(5,2),
  notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_pattern_case_link_a on public.pattern_case_links(case_id_a);
create index if not exists idx_pattern_case_link_b on public.pattern_case_links(case_id_b);

create table if not exists public.pattern_aggregation_runs (
  id integer generated by default as identity primary key,
  run_type varchar(64) not null,
  case_ids_analyzed jsonb,
  total_cases_processed integer default 0,
  entity_clusters_found integer default 0,
  conduct_clusters_found integer default 0,
  systemic_inferences_generated integer default 0,
  run_status varchar(16) default 'running',
  error_message text,
  started_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  completed_at bigint,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pattern_aggregation_runs'
       and column_name = 'case_ids_analyzed' and data_type = 'text'
  ) then
    execute 'alter table public.pattern_aggregation_runs alter column case_ids_analyzed type jsonb using pg_temp.luminari_try_jsonb(case_ids_analyzed)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pattern_aggregation_runs'
       and column_name = 'completed_at' and data_type = 'text'
  ) then
    execute $sql$
      alter table public.pattern_aggregation_runs
      alter column completed_at type bigint
      using (case when coalesce(completed_at, '') ~ '^\d+$' then completed_at::bigint end)
    $sql$;
  end if;
end;
$$;

create index if not exists idx_pattern_aggregation_status on public.pattern_aggregation_runs(run_status);

create table if not exists public.pattern_feedback_loop (
  id integer generated by default as identity primary key,
  strategy_path_id integer not null,
  entity_cluster_id integer,
  conduct_cluster_id integer,
  outcome_analytics_id integer,
  systemic_inference_id integer,
  feedback_type varchar(64) not null,
  adjustment_applied text,
  confidence_delta numeric(5,2),
  applied_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_pattern_feedback_strategy on public.pattern_feedback_loop(strategy_path_id);

-- --------------------------------------------------------------------------
-- Harm, risk, crisis, and source-stream foundations
-- --------------------------------------------------------------------------

create table if not exists public.harm_index_entities (
  id integer generated by default as identity primary key,
  entity_name varchar(500) not null unique,
  entity_type varchar(100) default 'unknown',
  industry_sector varchar(200),
  jurisdiction varchar(200),
  first_detected bigint,
  last_updated bigint,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.harm_index_scores (
  id integer generated by default as identity primary key,
  entity_id integer not null,
  complaint_count integer default 0,
  litigation_count integer default 0,
  enforcement_count integer default 0,
  geographic_spread numeric(5,2) default 0,
  severity_score numeric(5,2) default 0,
  pattern_acceleration numeric(5,2) default 0,
  systemic_harm_score numeric(5,2) default 0,
  risk_classification varchar(50) default 'Low Risk',
  calculated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_harm_index_scores_entity
  on public.harm_index_scores(entity_id, calculated_at desc);
create index if not exists idx_harm_index_scores_risk
  on public.harm_index_scores(systemic_harm_score desc);

create table if not exists public.harm_index_history (
  id integer generated by default as identity primary key,
  entity_id integer not null,
  systemic_harm_score numeric(5,2) not null,
  risk_classification varchar(50) not null,
  "timestamp" bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_harm_index_history_entity
  on public.harm_index_history(entity_id, "timestamp");

create table if not exists public.risk_forecasts (
  id integer generated by default as identity primary key,
  pattern_id integer,
  forecast_date bigint not null,
  forecast_horizon_days integer default 30,
  predicted_signal_growth numeric(8,2) default 0,
  predicted_pressure_index numeric(5,2) default 0,
  predicted_geographic_spread numeric(5,2) default 0,
  predicted_entity_count integer default 0,
  risk_forecast_score numeric(5,2) default 0,
  confidence_level numeric(5,4) default 0,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.entity_risk_projection (
  id integer generated by default as identity primary key,
  entity_id integer not null,
  entity_name text not null,
  industry_sector text,
  current_harm_score numeric(5,2) default 0,
  predicted_harm_score numeric(5,2) default 0,
  risk_category text,
  projection_horizon_days integer default 30,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_entity_risk_projection_entity
  on public.entity_risk_projection(entity_id, created_at desc);

create table if not exists public.crisis_predictions (
  id integer generated by default as identity primary key,
  pattern_id integer,
  industry varchar(256),
  jurisdiction varchar(256),
  entity_name varchar(512),
  prediction_type varchar(32) not null,
  crisis_probability integer not null default 0,
  estimated_escalation_date bigint,
  prediction_confidence integer not null default 0,
  risk_level varchar(16) not null default 'low',
  trigger_factors jsonb,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_crisis_predictions_risk on public.crisis_predictions(risk_level);
create index if not exists idx_crisis_predictions_created on public.crisis_predictions(created_at desc);

create table if not exists public.federal_litigation_cases (
  id integer generated by default as identity primary key,
  case_id varchar(255),
  court_name varchar(500),
  jurisdiction varchar(100),
  filing_date date,
  case_type varchar(255),
  nature_of_suit varchar(500),
  plaintiff_name varchar(500),
  defendant_name varchar(500),
  law_firm varchar(500),
  judge varchar(500),
  industry varchar(255),
  case_status varchar(100),
  source_url text,
  stream_source varchar(100) default 'courtlistener',
  created_at timestamp default now()
);
create index if not exists idx_federal_litigation_filing on public.federal_litigation_cases(filing_date desc);
create index if not exists idx_federal_litigation_defendant on public.federal_litigation_cases(defendant_name);

create table if not exists public.lobbying_activity (
  id integer generated by default as identity primary key,
  lobbyist_name varchar(500),
  lobbying_firm varchar(500),
  client_name varchar(500) not null,
  industry varchar(255),
  policy_area varchar(500),
  lobbying_amount numeric(15,2),
  reporting_period varchar(50),
  jurisdiction varchar(100),
  legislators_contacted text,
  source_url text,
  stream_source varchar(100) default 'lobbying_disclosure',
  created_at timestamp default now()
);
create index if not exists idx_lobbying_activity_client on public.lobbying_activity(client_name);
create index if not exists idx_lobbying_activity_industry on public.lobbying_activity(industry);

create table if not exists public.advocacy_reports (
  id integer generated by default as identity primary key,
  report_id varchar(255) unique,
  organization_name varchar(500) not null,
  organization_type varchar(100),
  report_title varchar(500) not null,
  report_type_ar varchar(64) default 'other',
  jurisdiction varchar(100),
  policy_area varchar(255),
  industry varchar(255),
  entity_named varchar(500),
  claim_type varchar(255),
  harm_type varchar(255),
  affected_population varchar(500),
  estimated_affected_count integer,
  key_findings text,
  recommended_actions text,
  source_url text,
  publish_date date,
  confidence_score numeric(5,2) default 0,
  verification_status varchar(50) default 'unverified',
  linked_signal_ids jsonb,
  linked_pattern_ids jsonb,
  tags jsonb,
  submitted_by integer,
  stream_source varchar(100) default 'advocacy_report',
  created_at timestamp default now(),
  updated_at timestamp default now()
);
create index if not exists idx_advocacy_reports_publish on public.advocacy_reports(publish_date desc);
create index if not exists idx_advocacy_reports_org on public.advocacy_reports(organization_name);

create table if not exists public.verified_reports (
  id integer generated by default as identity primary key,
  report_id varchar(255) unique,
  reporter_type varchar(100) not null,
  jurisdiction varchar(100),
  industry varchar(255),
  entity_named varchar(500),
  claim_type varchar(255),
  evidence_count integer default 0,
  verification_status varchar(50) default 'unverified',
  confidence_score numeric(5,2) default 0,
  narrative text,
  submitted_by integer,
  created_at timestamp default now(),
  updated_at timestamp default now()
);
create index if not exists idx_verified_reports_status on public.verified_reports(verification_status);

create table if not exists public.administrative_decisions (
  id integer generated by default as identity primary key,
  decision_id varchar(255),
  agency varchar(500) not null,
  program varchar(255),
  jurisdiction varchar(100),
  claim_type varchar(255),
  decision_date date,
  initial_outcome varchar(100),
  appeal_outcome varchar(100),
  processing_time_days integer,
  hearing_requested boolean default false,
  reversal boolean default false,
  entity_or_agency varchar(500),
  source_url text,
  stream_source varchar(100) default 'administrative_decision',
  created_at timestamp default now()
);
create index if not exists idx_administrative_decisions_agency on public.administrative_decisions(agency);
create index if not exists idx_administrative_decisions_date on public.administrative_decisions(decision_date desc);

-- --------------------------------------------------------------------------
-- Coalition intelligence and campaign execution
-- --------------------------------------------------------------------------

create table if not exists public.coalition_legislators (
  id text primary key,
  name text,
  title text,
  chamber text,
  state text,
  district text,
  party text,
  jurisdiction_level text,
  committees text,
  issue_alignment text,
  contact_office text,
  contact_phone text,
  contact_email text,
  website text,
  social_media text,
  voting_record_url text,
  influence_score integer default 0,
  accessibility_score integer default 0,
  notes text,
  is_active integer default 1,
  created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.coalition_agencies (
  id text primary key,
  name text,
  acronym text,
  agency_type text,
  jurisdiction_level text,
  state text,
  parent_agency text,
  domains text,
  enforcement_powers text,
  complaint_url text,
  contact_phone text,
  contact_email text,
  website text,
  address text,
  filing_methods text,
  response_time_days integer,
  effectiveness_score integer default 0,
  notes text,
  is_active integer default 1,
  created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

-- Migration 020 created a narrower coalition_agencies table on clean replay.
-- Add, then source-backfill, the deployed runtime contract without dropping its
-- original registry columns.
alter table public.coalition_agencies
  add column if not exists acronym text,
  add column if not exists agency_type text,
  add column if not exists jurisdiction_level text,
  add column if not exists parent_agency text,
  add column if not exists domains text,
  add column if not exists enforcement_powers text,
  add column if not exists complaint_url text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists address text,
  add column if not exists filing_methods text,
  add column if not exists response_time_days integer,
  add column if not exists effectiveness_score integer default 0,
  add column if not exists notes text,
  add column if not exists is_active integer default 1,
  add column if not exists updated_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'coalition_agencies' and column_name = 'jurisdiction'
  ) then
    execute $sql$
      update public.coalition_agencies
         set jurisdiction_level = coalesce(
               nullif(jurisdiction_level, ''),
               case
                 when lower(coalesce(jurisdiction, '')) like '%federal%' then 'federal'
                 when lower(coalesce(jurisdiction, '')) like '%municipal%'
                   or lower(coalesce(jurisdiction, '')) like '%city%' then 'local'
                 else 'state'
               end
             )
       where jurisdiction_level is null or jurisdiction_level = ''
    $sql$;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'coalition_agencies' and column_name = 'phone'
  ) then
    execute 'update public.coalition_agencies set contact_phone = coalesce(contact_phone, phone) where contact_phone is null';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'coalition_agencies' and column_name = 'oversight_focus'
  ) then
    execute 'update public.coalition_agencies set agency_type = coalesce(agency_type, oversight_focus) where agency_type is null';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'coalition_agencies' and column_name = 'domain_ids'
  ) then
    execute 'update public.coalition_agencies set domains = coalesce(domains, to_jsonb(domain_ids)::text) where domains is null';
  end if;
end;
$$;

update public.coalition_agencies
   set jurisdiction_level = coalesce(nullif(jurisdiction_level, ''), 'unknown'),
       effectiveness_score = coalesce(effectiveness_score, 0),
       is_active = coalesce(is_active, 1),
       updated_at = coalesce(updated_at, created_at, (extract(epoch from clock_timestamp()) * 1000)::bigint)
 where jurisdiction_level is null
    or effectiveness_score is null
    or is_active is null
    or updated_at is null;

create table if not exists public.coalition_advocacy_orgs (
  id text primary key,
  name text,
  org_type text,
  jurisdiction text,
  state text,
  domains text,
  services_offered text,
  contact_email text,
  contact_phone text,
  website text,
  address text,
  description text,
  eligibility_criteria text,
  languages text,
  intake_url text,
  coalition_willingness text,
  influence_score integer default 0,
  is_verified integer default 0,
  notes text,
  created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

create table if not exists public.coalition_media (
  id text primary key,
  name text,
  outlet text,
  media_type text,
  beat text,
  jurisdiction text,
  state text,
  contact_email text,
  contact_phone text,
  social_media text,
  website text,
  reach_score integer default 0,
  responsiveness_score integer default 0,
  previous_coverage text,
  notes text,
  is_active integer default 1,
  created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

-- Pull the original April registries into the unified coalition surface only
-- where their documented source columns exist. Existing unified rows win.
do $$
begin
  if to_regclass('public.legislator_contacts') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'legislator_contacts' and column_name = 'legislator_id'
     ) then
    execute $sql$
      insert into public.coalition_legislators (
        id, name, title, chamber, state, district, party,
        jurisdiction_level, issue_alignment, contact_phone, contact_email,
        website, is_active, created_at, updated_at
      )
      select
        legislator_id::text, name, title, chamber, state, district, party, level,
        to_jsonb(domain_ids)::text, phone, email, null::text, 1,
        coalesce(created_at, 0), coalesce(updated_at, created_at, 0)
      from public.legislator_contacts
      on conflict (id) do nothing
    $sql$;
  end if;

  if to_regclass('public.advocacy_organizations') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'advocacy_organizations' and column_name = 'org_id'
     ) then
    execute $sql$
      insert into public.coalition_advocacy_orgs (
        id, name, org_type, jurisdiction, state, domains, website,
        description, coalition_willingness, influence_score, is_verified,
        created_at, updated_at
      )
      select
        org_id::text, name, 'advocacy_org', 'National', null::text,
        to_jsonb(domain_ids)::text, website, focus, 'unknown', 0,
        case when verified then 1 else 0 end,
        coalesce(created_at, 0), coalesce(updated_at, created_at, 0)
      from public.advocacy_organizations
      on conflict (id) do nothing
    $sql$;
  end if;
end;
$$;

create index if not exists idx_coalition_legislators_active_state
  on public.coalition_legislators(state, influence_score desc) where is_active = 1;
create index if not exists idx_coalition_agencies_active_state
  on public.coalition_agencies(state, effectiveness_score desc) where is_active = 1;
create index if not exists idx_coalition_advocacy_state
  on public.coalition_advocacy_orgs(state, influence_score desc);
create index if not exists idx_coalition_media_active_state
  on public.coalition_media(state, reach_score desc) where is_active = 1;

create table if not exists public.campaigns (
  id text primary key,
  name text,
  pattern_id text,
  reform_package_id text,
  jurisdiction text,
  description text,
  impact_index integer default 0,
  status text default 'analysis',
  current_stage integer default 1,
  stage_history text default '[]',
  started_at bigint,
  created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.campaigns
  add column if not exists created_at bigint default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

update public.campaigns
   set created_at = coalesce(created_at, started_at, updated_at, (extract(epoch from clock_timestamp()) * 1000)::bigint),
       updated_at = coalesce(updated_at, started_at, created_at, (extract(epoch from clock_timestamp()) * 1000)::bigint)
 where created_at is null or updated_at is null;

create index if not exists idx_campaigns_status on public.campaigns(status);
create index if not exists idx_campaigns_pattern on public.campaigns(pattern_id);

create table if not exists public.coalition_memberships (
  id text primary key,
  campaign_id text not null,
  member_type text not null,
  member_id text not null,
  member_name text not null,
  role_in_coalition text default 'member',
  joined_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  status text default 'active',
  commitment_level text default 'medium',
  contributions text,
  notes text
);
create index if not exists idx_coalition_memberships_campaign on public.coalition_memberships(campaign_id);

create table if not exists public.coalition_campaign_targets (
  id text primary key,
  campaign_id text not null,
  target_type text not null,
  target_id text not null,
  target_name text not null,
  priority text default 'medium',
  outreach_status text default 'not_contacted',
  last_contacted bigint,
  response text,
  assigned_to text,
  strategy_notes text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_campaign_targets_campaign on public.coalition_campaign_targets(campaign_id);

create table if not exists public.campaign_actions (
  id text primary key,
  campaign_id text not null,
  stage_number integer not null,
  date bigint not null,
  action text not null,
  responsible_party text not null,
  responsible_party_type text not null,
  impact_score integer default 0,
  result text,
  source text,
  source_id text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_campaign_actions_campaign on public.campaign_actions(campaign_id, date desc);

create table if not exists public.campaign_outcomes (
  id text primary key,
  campaign_id text not null,
  date bigint not null,
  result text not null,
  impact_score integer default 0,
  notes text,
  policy_change_id text,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
create index if not exists idx_campaign_outcomes_campaign on public.campaign_outcomes(campaign_id, date desc);

-- --------------------------------------------------------------------------
-- Access boundary, contract assertions, and durable migration receipt
-- --------------------------------------------------------------------------

-- The application authenticates users above the database boundary and reaches
-- these runtime tables through the Render service. Keep them private to the
-- service role so the compatibility work does not accidentally create a new
-- anonymous PostgREST surface.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'data_stream_registry',
    'ingest_runs',
    'ingested_records',
    'live_signals',
    'registry_policy_alerts',
    'registry_workflows',
    'registry_oversight_bodies',
    'registry_source_traceability',
    'registry_signals',
    'patterns',
    'pattern_types',
    'pattern_occurrences',
    'pattern_registry',
    'trend_registry',
    'strategy_registry',
    'sunam_gate_log',
    'presentations',
    'presentation_slides',
    'entity_merge_suggestions',
    'user_feedback',
    'case_state',
    'case_flags',
    'lumensend_templates',
    'lumensend_drafts',
    'remedy_templates',
    'remedy_doc_generated',
    'doc_generation_queue',
    'template_effectiveness',
    'strategy_memory',
    'strategy_memory_summary',
    'restore_spine_runs',
    'pattern_timeline_events',
    'pattern_entity_clusters',
    'pattern_conduct_clusters',
    'pattern_outcome_analytics',
    'pattern_outcome_divergence',
    'pattern_systemic_inferences',
    'pattern_temporal_trends',
    'pattern_geographic_hotspots',
    'pattern_industry_profiles',
    'pattern_evidence_correlations',
    'pattern_defense_strategies',
    'pattern_case_links',
    'pattern_aggregation_runs',
    'pattern_feedback_loop',
    'harm_index_entities',
    'harm_index_scores',
    'harm_index_history',
    'risk_forecasts',
    'entity_risk_projection',
    'crisis_predictions',
    'federal_litigation_cases',
    'lobbying_activity',
    'advocacy_reports',
    'verified_reports',
    'administrative_decisions',
    'coalition_legislators',
    'coalition_agencies',
    'coalition_advocacy_orgs',
    'coalition_media',
    'campaigns',
    'coalition_memberships',
    'coalition_campaign_targets',
    'campaign_actions',
    'campaign_outcomes'
  ]
  loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', relation_name);
    execute format('grant all on table public.%I to service_role', relation_name);
  end loop;
end;
$$;

do $$
declare
  view_name text;
begin
  foreach view_name in array array[
    'v_active_trends',
    'v_active_patterns',
    'v_active_strategies',
    'v_gate_decisions',
    'v_signal_lineage',
    'v_staged_signals',
    'v_pipeline_health'
  ]
  loop
    execute format('alter view public.%I set (security_invoker = true)', view_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', view_name);
    execute format('grant select on table public.%I to service_role', view_name);
  end loop;
end;
$$;

grant usage, select on all sequences in schema public to service_role;

create table if not exists public.runtime_contract_receipts (
  migration_version text primary key,
  contract_name text not null,
  applied_at timestamptz not null default clock_timestamp(),
  metrics jsonb not null,
  notes jsonb not null default '{}'::jsonb
);

alter table public.runtime_contract_receipts enable row level security;
revoke all on table public.runtime_contract_receipts from public, anon, authenticated;
grant all on table public.runtime_contract_receipts to service_role;

-- Stop the transaction if a future edit or an environment-specific legacy
-- shape leaves any required relation or column unavailable. A migration is not
-- considered complete merely because PostgreSQL accepted part of it.
do $$
declare
  relation_name text;
  missing_columns text;
  type_mismatches text;
begin
  foreach relation_name in array array[
    'data_stream_registry',
    'ingest_runs',
    'ingested_records',
    'live_signals',
    'registry_jurisdictions',
    'registry_programs',
    'registry_policy_alerts',
    'registry_workflows',
    'registry_oversight_bodies',
    'registry_source_traceability',
    'registry_signals',
    'patterns',
    'pattern_occurrences',
    'trend_registry',
    'strategy_registry',
    'sunam_gate_log',
    'presentations',
    'presentation_slides',
    'entity_merge_suggestions',
    'user_feedback',
    'case_state',
    'case_flags',
    'lumensend_templates',
    'lumensend_drafts',
    'remedy_templates',
    'remedy_doc_generated',
    'doc_generation_queue',
    'template_effectiveness',
    'strategy_memory',
    'restore_spine_runs',
    'pattern_timeline_events',
    'campaigns',
    'coalition_memberships',
    'coalition_campaign_targets',
    'campaign_actions',
    'campaign_outcomes',
    'v_active_trends',
    'v_active_patterns',
    'v_active_strategies',
    'v_gate_decisions',
    'v_signal_lineage',
    'v_staged_signals',
    'v_pipeline_health'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is null then
      raise exception 'Lighthouse runtime contract is missing public.%', relation_name;
    end if;
  end loop;

  with required(table_name, column_name) as (
    values
      ('data_stream_registry', 'stream_id_dsr'),
      ('data_stream_registry', 'field_mapping_dsr'),
      ('data_stream_registry', 'created_at_dsr'),
      ('ingest_runs', 'errors_run'),
      ('live_signals', 'supporting_statistics'),
      ('live_signals', 'confidence_score'),
      ('live_signals', 'effect_type_ls'),
      ('live_signals', 'target_table_ls'),
      ('live_signals', 'target_id_ls'),
      ('registry_programs', 'jurisdiction_id'),
      ('registry_policy_alerts', 'jurisdiction_id_rpa'),
      ('registry_workflows', 'jurisdiction_id_rw'),
      ('registry_oversight_bodies', 'jurisdiction_id_rob'),
      ('registry_source_traceability', 'jurisdiction_id_rst'),
      ('registry_signals', 'jurisdiction_id_rs'),
      ('patterns', 'pattern_key'),
      ('patterns', 'name'),
      ('patterns', 'source_signature'),
      ('patterns', 'signal_count'),
      ('patterns', 'occurrence_count'),
      ('patterns', 'updated_at'),
      ('trend_registry', 'trend_id'),
      ('trend_registry', 'current_signal_count'),
      ('strategy_registry', 'strategy_id'),
      ('sunam_gate_log', 'promoted_signal_id'),
      ('presentations', 'case_id'),
      ('presentation_slides', 'presentation_id'),
      ('entity_merge_suggestions', 'source_entity_id'),
      ('entity_merge_suggestions', 'target_entity_id'),
      ('user_feedback', 'user_id'),
      ('lumensend_drafts', 'recipient_email'),
      ('remedy_templates', 'template_id'),
      ('strategy_memory', 'strategy_id'),
      ('campaigns', 'pattern_id'),
      ('coalition_memberships', 'campaign_id')
  )
  select string_agg(format('%I.%I', r.table_name, r.column_name), ', ' order by r.table_name, r.column_name)
    into missing_columns
    from required r
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = r.table_name
     and c.column_name = r.column_name
   where c.column_name is null;

  if missing_columns is not null then
    raise exception 'Lighthouse runtime contract is missing required columns: %', missing_columns;
  end if;

  with expected(table_name, column_name, udt_name) as (
    values
      ('data_stream_registry', 'field_mapping_dsr', 'jsonb'),
      ('data_stream_registry', 'created_at_dsr', 'int8'),
      ('data_stream_registry', 'last_ingested_at_dsr', 'int8'),
      ('data_stream_registry', 'last_success_at_dsr', 'int8'),
      ('data_stream_registry', 'last_http_status_dsr', 'int4'),
      ('ingest_runs', 'errors_run', 'jsonb'),
      ('ingested_records', 'raw_json', 'jsonb'),
      ('ingested_records', 'metadata_l1_l2', 'jsonb'),
      ('ingested_records', 'normalized_date', 'timestamptz'),
      ('ingested_records', 'normalized_amount', 'numeric'),
      ('ingested_records', 'ingested_at', 'int8'),
      ('ingested_records', 'processed_for_signals', 'bool'),
      ('live_signals', 'supporting_statistics', 'jsonb'),
      ('live_signals', 'confidence_score', 'numeric'),
      ('live_signals', 'entity_aliases_json', 'jsonb'),
      ('live_signals', 'entity_confidence_score_ls', 'numeric'),
      ('live_signals', 'role_confidence', 'numeric'),
      ('registry_workflows', 'steps_rw', 'jsonb'),
      ('registry_source_traceability', 'source_documents_rst', 'jsonb'),
      ('registry_source_traceability', 'source_variants_rst', 'jsonb'),
      ('registry_source_traceability', 'conflicts_rst', 'jsonb')
  )
  select string_agg(
           format('%I.%I expected %s, found %s', e.table_name, e.column_name, e.udt_name, coalesce(c.udt_name, 'missing')),
           ', ' order by e.table_name, e.column_name
         )
    into type_mismatches
    from expected e
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = e.table_name
     and c.column_name = e.column_name
   where c.udt_name is distinct from e.udt_name;

  if type_mismatches is not null then
    raise exception 'Lighthouse runtime contract type mismatch: %', type_mismatches;
  end if;

  if exists (
    select 1
      from public.data_stream_registry
     where stream_id_dsr is not null
     group by stream_id_dsr
    having count(*) > 1
  ) then
    raise exception 'Data stream registry contains duplicate canonical stream IDs';
  end if;

  if exists (
    select 1
      from public.live_signals
     where signal_fingerprint is not null
     group by signal_fingerprint
    having count(*) > 1
  ) then
    raise exception 'Live signal spine contains duplicate fingerprints';
  end if;

  if exists (
    select 1 from public.patterns group by pattern_key having count(*) > 1
  ) then
    raise exception 'Lighthouse runtime contract contains duplicate pattern keys';
  end if;

  if exists (
    select 1
      from public.v_active_patterns
     where pattern_id is null
        or metadata ->> 'attribution_status' <> 'trend_only'
  ) then
    raise exception 'Active pattern projection contains ungoverned attribution';
  end if;

  if exists (
    select 1
      from public.v_signal_lineage
     where linked_pattern_id is not null
        or linked_trend_id is not null
        or gate_log_id is not null
  ) then
    raise exception 'Signal lineage contains an unsupported inferred link';
  end if;
end;
$$;

insert into public.runtime_contract_receipts (
  migration_version,
  contract_name,
  metrics,
  notes
)
select
  '20260909143000',
  'lighthouse_runtime_postgres_contract_v1',
  jsonb_build_object(
    'patterns', (select count(*) from public.patterns),
    'patterns_with_preserved_source_signature', (
      select count(*) from public.patterns where source_signature is not null
    ),
    'detected_signals', (select count(*) from public.detected_signals),
    'gate_decisions', (select count(*) from public.v_gate_decisions),
    'staged_signals', (select count(*) from public.v_staged_signals),
    'active_patterns', (select count(*) from public.v_active_patterns),
    'active_trends', (select count(*) from public.v_active_trends),
    'active_strategies', (select count(*) from public.v_active_strategies),
    'coalition_legislators', (select count(*) from public.coalition_legislators),
    'coalition_agencies', (select count(*) from public.coalition_agencies),
    'coalition_advocacy_orgs', (select count(*) from public.coalition_advocacy_orgs),
    'coalition_media', (select count(*) from public.coalition_media),
    'data_stream_registry', (select count(*) from public.data_stream_registry),
    'ingest_runs', (select count(*) from public.ingest_runs),
    'live_signals', (select count(*) from public.live_signals),
    'registry_jurisdictions', (select count(*) from public.registry_jurisdictions),
    'registry_programs', (select count(*) from public.registry_programs),
    'registry_policy_alerts', (select count(*) from public.registry_policy_alerts),
    'registry_workflows', (select count(*) from public.registry_workflows),
    'registry_oversight_bodies', (select count(*) from public.registry_oversight_bodies),
    'registry_source_traceability', (select count(*) from public.registry_source_traceability),
    'registry_signals', (select count(*) from public.registry_signals)
  ),
  jsonb_build_object(
    'destructive_row_operations', false,
    'synthetic_user_evidence', false,
    'unsupported_lineage_inference', false,
    'database_boundary', 'service_role_only',
    'canonical_registry_ingest', 'postgres_on_conflict'
  )
on conflict (migration_version) do update
set contract_name = excluded.contract_name,
    applied_at = clock_timestamp(),
    metrics = excluded.metrics,
    notes = excluded.notes;

notify pgrst, 'reload schema';
