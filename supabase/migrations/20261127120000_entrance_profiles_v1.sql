-- Entrance profiles and agent entrances: the two doors built 2026-11-27.
-- entrance_profiles holds the self-declared worker entrance for a signed-in
-- user (advocate / legal / education / government). It is a lens label only:
-- it never touches public.users and never changes users.role, which stays
-- invite/admin-controlled. Help-seekers write nothing anywhere, so no row
-- exists for them. Government entrants on the agency branch either pick an
-- agency from the canonical directory (agency_canonical_id +
-- agency_display_name, copied from the governed view at save time) or type
-- one that is held in agency_text_unverified and never minted as canonical.
-- agent_entrances is the disembodied door's ledger: one row per AI agent
-- entrance declaration (system, principal, purpose), keyed by the receipt
-- returned to the agent. Additive only; nothing existing is altered.
create table if not exists public.entrance_profiles (
  id serial primary key,
  user_id integer not null unique references public.users(id),
  entrant_kind text check (entrant_kind in ('advocate','legal','education','government')),
  gov_branch text check (gov_branch in ('agency','legislative')),
  agency_canonical_id text,
  agency_display_name text,
  agency_text_unverified text,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists public.agent_entrances (
  id serial primary key,
  receipt_id text not null unique,
  agent_system text not null,
  principal text not null,
  purpose text not null,
  created_at bigint not null
);

alter table public.entrance_profiles enable row level security;
revoke all on public.entrance_profiles from public, anon, authenticated, service_role;
grant select, insert, update on public.entrance_profiles to service_role;

alter table public.agent_entrances enable row level security;
revoke all on public.agent_entrances from public, anon, authenticated, service_role;
grant select, insert on public.agent_entrances to service_role;
