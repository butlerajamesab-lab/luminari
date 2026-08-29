-- Reconstruct the batch rerun ledger that existed in production before its
-- source-controlled repair migration.  This is an operational receipt table;
-- fresh replay creates the exact physical columns without fabricating rows.

create table if not exists public.batch_rerun_runs (
  id serial primary key,
  started_by integer not null,
  status varchar not null default 'running',
  total_findings integer not null default 0,
  processed_count integer not null default 0,
  resolved_count integer not null default 0,
  error_count integer not null default 0,
  still_unsupported integer not null default 0,
  last_processed_finding_id integer,
  fallback_usage_count integer not null default 0,
  started_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  completed_at bigint,
  aborted_at bigint,
  runtime_ms bigint,
  constraint batch_rerun_runs_status_check
    check (status in ('running', 'completed', 'aborted', 'error'))
);

alter table public.batch_rerun_runs enable row level security;

revoke all on public.batch_rerun_runs from public, anon, authenticated;
grant select, insert, update, delete on public.batch_rerun_runs to service_role;
grant usage, select on sequence public.batch_rerun_runs_id_seq to service_role;

drop policy if exists service_role_all_batch_rerun_runs on public.batch_rerun_runs;
create policy service_role_all_batch_rerun_runs
  on public.batch_rerun_runs
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.batch_rerun_runs is
  'Service-only operational receipt ledger for bounded provenance batch reruns.';
