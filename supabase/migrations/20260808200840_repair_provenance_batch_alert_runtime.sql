-- Repair the provenance batch/alert runtime against the live Lighthouse schema.
--
-- Observed production drift before this migration:
--   * batch_rerun_runs existed but its physical columns were from an older
--     snake_case import, its status column was named batch_rerun_runs_status_enum,
--     and completed_at / aborted_at / runtime_ms were absent.
--   * provenance_alert_events was declared by the application schema and
--     registry but did not exist in production.
--
-- The migration is deliberately bounded to those two runtime surfaces.

begin;

-- Normalize the historical status-column name without destroying any rows.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'batch_rerun_runs'
       and column_name = 'batch_rerun_runs_status_enum'
  ) and not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'batch_rerun_runs'
       and column_name = 'status'
  ) then
    alter table public.batch_rerun_runs
      rename column batch_rerun_runs_status_enum to status;
  end if;
end
$$;

alter table public.batch_rerun_runs
  add column if not exists completed_at bigint,
  add column if not exists aborted_at bigint,
  add column if not exists runtime_ms bigint;

-- Existing production columns are snake_case. Keep that contract explicit.
alter table public.batch_rerun_runs
  alter column started_at set default ((extract(epoch from clock_timestamp()) * 1000)::bigint);

update public.batch_rerun_runs
   set started_at = ((extract(epoch from clock_timestamp()) * 1000)::bigint)
 where started_at is null;

alter table public.batch_rerun_runs
  alter column started_at set not null;

-- Preserve the intended four-state lifecycle on the live varchar status field.
alter table public.batch_rerun_runs
  drop constraint if exists batch_rerun_runs_status_check;

alter table public.batch_rerun_runs
  add constraint batch_rerun_runs_status_check
  check (status in ('running', 'completed', 'aborted', 'error'));

create index if not exists idx_batch_rerun_status
  on public.batch_rerun_runs(status);
create index if not exists idx_batch_rerun_user
  on public.batch_rerun_runs(started_by);
create index if not exists idx_batch_rerun_started_at
  on public.batch_rerun_runs(started_at desc);

-- The alert event enum/table are part of the declared provenance runtime but
-- were absent from production. Create them with the existing snake_case API.
do $$
begin
  create type public.provenance_alert_events_alert_type_enum as enum (
    'PROVENANCE_DRIFT',
    'PROVENANCE_COVERAGE_DROP'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.provenance_alert_events (
  id serial primary key,
  alert_type public.provenance_alert_events_alert_type_enum not null,
  metrics jsonb not null,
  cooldown_until bigint not null,
  notification_sent boolean not null default false,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  constraint provenance_alert_events_metrics_object_check
    check (jsonb_typeof(metrics) = 'object')
);

create index if not exists idx_alert_type
  on public.provenance_alert_events(alert_type);
create index if not exists idx_alert_cooldown
  on public.provenance_alert_events(alert_type, cooldown_until);

alter table public.provenance_alert_events enable row level security;

drop policy if exists authenticated_read_provenance_alert_events on public.provenance_alert_events;
create policy authenticated_read_provenance_alert_events
  on public.provenance_alert_events
  for select
  to authenticated
  using (true);

drop policy if exists service_role_all_provenance_alert_events on public.provenance_alert_events;
create policy service_role_all_provenance_alert_events
  on public.provenance_alert_events
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.provenance_alert_events to authenticated;
grant all on public.provenance_alert_events to service_role;
grant usage, select on sequence public.provenance_alert_events_id_seq to service_role;

commit;
