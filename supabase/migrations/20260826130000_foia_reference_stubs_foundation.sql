-- Restore the two FOIA reference stubs that existed before their additive
-- enrichment migrations entered source control. The verified historical
-- contract was id + state_code. Current production catalog rows are not
-- schema seed data and are intentionally not copied or fabricated here.

create table if not exists public.foia_statutes (
  id serial primary key,
  state_code varchar
);

create table if not exists public.foia_agencies (
  id serial primary key,
  state_code varchar
);

alter table public.foia_statutes enable row level security;
alter table public.foia_agencies enable row level security;

revoke all on public.foia_statutes, public.foia_agencies
  from public, anon, authenticated;
grant select, insert, update, delete on public.foia_statutes,
  public.foia_agencies to service_role;
grant usage, select on sequence public.foia_statutes_id_seq,
  public.foia_agencies_id_seq to service_role;

drop policy if exists service_role_all_foia_statutes on public.foia_statutes;
create policy service_role_all_foia_statutes on public.foia_statutes
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_foia_agencies on public.foia_agencies;
create policy service_role_all_foia_agencies on public.foia_agencies
  for all to service_role using (true) with check (true);

comment on table public.foia_statutes is
  'Service-only FOIA statute reference stub reconstructed for executable migration replay; catalog rows require a separate receipted import.';
comment on table public.foia_agencies is
  'Service-only FOIA agency reference stub reconstructed for executable migration replay; catalog rows require a separate receipted import.';
