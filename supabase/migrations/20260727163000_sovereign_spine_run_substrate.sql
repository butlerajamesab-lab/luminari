create table if not exists public.export_spine_runs (
  id serial primary key,
  export_type_esr text,
  bundle_name_esr text,
  status_esr text,
  created_at_esr bigint,
  completed_at_esr bigint,
  created_by_esr text,
  file_path_esr text,
  file_url_esr text,
  bundle_size_esr text,
  bundle_manifest_json_esr text,
  error_message_esr text
);

alter table public.export_spine_runs
  add column if not exists export_type_esr text,
  add column if not exists bundle_name_esr text,
  add column if not exists status_esr text,
  add column if not exists created_at_esr bigint,
  add column if not exists completed_at_esr bigint,
  add column if not exists created_by_esr text,
  add column if not exists file_path_esr text,
  add column if not exists file_url_esr text,
  add column if not exists bundle_size_esr text,
  add column if not exists bundle_manifest_json_esr text,
  add column if not exists error_message_esr text;

do $$
declare
  sequence_name text;
  maximum_id bigint;
begin
  sequence_name := pg_get_serial_sequence('public.export_spine_runs', 'id');
  if sequence_name is null then
    create sequence if not exists public.export_spine_runs_id_seq;
    alter sequence public.export_spine_runs_id_seq owned by public.export_spine_runs.id;
    alter table public.export_spine_runs
      alter column id set default nextval('public.export_spine_runs_id_seq'::regclass);
    sequence_name := 'public.export_spine_runs_id_seq';
  end if;

  select coalesce(max(id), 0)
    into maximum_id
    from public.export_spine_runs;

  if maximum_id > 0 then
    perform setval(sequence_name::regclass, maximum_id, true);
  else
    perform setval(sequence_name::regclass, 1, false);
  end if;
end
$$;

create table if not exists public.restore_spine_runs (
  id serial primary key,
  bundle_name_rsr text not null,
  restore_type_rsr text not null,
  status_rsr text not null default 'pending',
  executed_by_rsr text,
  risk_level_rsr text default 'medium',
  manifest_checksum_rsr text,
  validation_result_rsr text,
  started_at_rsr bigint not null,
  completed_at_rsr bigint,
  restored_tables_rsr text,
  restored_engines_rsr text,
  restored_streams_rsr text,
  restored_rows_rsr integer not null default 0,
  skipped_tables_rsr text,
  errors_rsr text,
  summary_rsr text
);

alter table public.restore_spine_runs
  add column if not exists bundle_name_rsr text,
  add column if not exists restore_type_rsr text,
  add column if not exists status_rsr text,
  add column if not exists executed_by_rsr text,
  add column if not exists risk_level_rsr text,
  add column if not exists manifest_checksum_rsr text,
  add column if not exists validation_result_rsr text,
  add column if not exists started_at_rsr bigint,
  add column if not exists completed_at_rsr bigint,
  add column if not exists restored_tables_rsr text,
  add column if not exists restored_engines_rsr text,
  add column if not exists restored_streams_rsr text,
  add column if not exists restored_rows_rsr integer,
  add column if not exists skipped_tables_rsr text,
  add column if not exists errors_rsr text,
  add column if not exists summary_rsr text;

-- Legacy deployments used enum columns and jsonb arrays. Convert them without
-- discarding any receipt content so the PostgreSQL-native run store has one
-- stable contract everywhere.
alter table public.restore_spine_runs
  alter column restore_type_rsr drop default,
  alter column status_rsr drop default,
  alter column risk_level_rsr drop default;

alter table public.restore_spine_runs
  alter column restore_type_rsr type text using restore_type_rsr::text,
  alter column status_rsr type text using status_rsr::text,
  alter column risk_level_rsr type text using risk_level_rsr::text,
  alter column validation_result_rsr type text using validation_result_rsr::text,
  alter column restored_tables_rsr type text using restored_tables_rsr::text,
  alter column restored_engines_rsr type text using restored_engines_rsr::text,
  alter column restored_streams_rsr type text using restored_streams_rsr::text,
  alter column errors_rsr type text using errors_rsr::text;

alter table public.restore_spine_runs
  alter column status_rsr set default 'pending',
  alter column risk_level_rsr set default 'medium';

update public.restore_spine_runs
   set restored_rows_rsr = 0
 where restored_rows_rsr is null;

alter table public.restore_spine_runs
  alter column restored_rows_rsr set default 0,
  alter column restored_rows_rsr set not null;

do $$
declare
  sequence_name text;
  maximum_id bigint;
begin
  sequence_name := pg_get_serial_sequence('public.restore_spine_runs', 'id');
  if sequence_name is null then
    create sequence if not exists public.restore_spine_runs_id_seq;
    alter sequence public.restore_spine_runs_id_seq owned by public.restore_spine_runs.id;
    alter table public.restore_spine_runs
      alter column id set default nextval('public.restore_spine_runs_id_seq'::regclass);
    sequence_name := 'public.restore_spine_runs_id_seq';
  end if;

  select coalesce(max(id), 0)
    into maximum_id
    from public.restore_spine_runs;

  if maximum_id > 0 then
    perform setval(sequence_name::regclass, maximum_id, true);
  else
    perform setval(sequence_name::regclass, 1, false);
  end if;
end
$$;

create index if not exists idx_restore_spine_runs_started_at
  on public.restore_spine_runs (started_at_rsr desc);

create index if not exists idx_restore_spine_runs_status
  on public.restore_spine_runs (status_rsr);

comment on table public.restore_spine_runs is
  'Auditable PostgreSQL restore attempts for Sovereign Control Spine bundles.';

comment on sequence public.export_spine_runs_id_seq is
  'Sequence aligned to the existing Sovereign Control export run ledger.';

comment on sequence public.restore_spine_runs_id_seq is
  'Sequence aligned to preserved Sovereign Control restore run receipts.';
