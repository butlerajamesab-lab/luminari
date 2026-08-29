-- Reconstruct the upload-session contract that existed live before the
-- runtime lifecycle projection entered source control. Production session
-- rows are operational state and are intentionally not copied into a fresh
-- database; only the verified schema and fail-closed access boundary belong
-- in the migration ledger.

create table if not exists public.upload_sessions (
  id serial primary key,
  case_id integer,
  user_id integer,
  total_files integer,
  completed_files integer,
  failed_files integer,
  duplicate_files integer,
  session_status text,
  created_at bigint,
  updated_at bigint
);

alter table public.upload_sessions enable row level security;
revoke all on public.upload_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.upload_sessions to service_role;
grant usage, select on sequence public.upload_sessions_id_seq to service_role;

drop policy if exists service_role_all_upload_sessions
  on public.upload_sessions;
create policy service_role_all_upload_sessions on public.upload_sessions
  for all to service_role using (true) with check (true);

comment on table public.upload_sessions is
  'Service-only upload-session contract reconstructed for executable migration replay; production operational rows are not seed data.';
