do $$
declare
  sequence_name text;
  maximum_id bigint;
begin
  sequence_name := pg_get_serial_sequence('public.export_spine_runs', 'id');
  if sequence_name is null then
    raise exception 'export_spine_runs.id does not have an owned sequence';
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
  status_rsr text not null,
  executed_by_rsr text not null,
  risk_level_rsr text,
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

create index if not exists idx_restore_spine_runs_started_at
  on public.restore_spine_runs (started_at_rsr desc);

create index if not exists idx_restore_spine_runs_status
  on public.restore_spine_runs (status_rsr);

comment on table public.restore_spine_runs is
  'Auditable PostgreSQL restore attempts for Sovereign Control Spine bundles.';

comment on sequence public.export_spine_runs_id_seq is
  'Sequence aligned to the existing Sovereign Control export run ledger.';
