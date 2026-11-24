-- Native Nations: one registry for every nation, recognized by the federal
-- government or not, and a raw capture of each nation's own public website
-- so every word later shown on a card can be cited to the exact page and
-- moment it was read. Capture rows are insert-only. Nothing here is shown
-- publicly; cards are built from these captures in a later step.
-- Additive only; tribal_leaders and the Recognition Atlas seeds are untouched.
create table if not exists public.native_nation_registry_v1 (
  nation_key text primary key,
  nation_name text not null,
  federal_status text not null check (
    federal_status in ('federally_recognized', 'not_federally_recognized')
  ),
  website_url text,
  registry_source text not null,
  registry_source_ref text,
  recorded_at timestamptz not null default now()
);

create table if not exists public.native_nation_site_capture_v1 (
  capture_id bigint generated always as identity primary key,
  nation_key text not null references public.native_nation_registry_v1 (nation_key),
  requested_url text not null,
  final_url text,
  page_role text not null check (page_role in ('home', 'linked')),
  link_text text,
  http_status integer,
  content_type text,
  body_gzip bytea,
  body_bytes integer,
  body_sha256 text,
  robots_allowed boolean not null,
  error_code text,
  captured_at timestamptz not null default now()
);
create index if not exists idx_native_nation_site_capture_v1_nation
  on public.native_nation_site_capture_v1 (nation_key, captured_at desc);

alter table public.native_nation_registry_v1 enable row level security;
alter table public.native_nation_site_capture_v1 enable row level security;
revoke all on public.native_nation_registry_v1 from public, anon, authenticated, service_role;
revoke all on public.native_nation_site_capture_v1 from public, anon, authenticated, service_role;
grant select, insert on public.native_nation_registry_v1 to service_role;
grant select, insert on public.native_nation_site_capture_v1 to service_role;

-- Federally recognized nations, as listed in the BIA Tribal Leaders
-- Directory pull of 2026-10-28 (website as BIA lists it).
insert into public.native_nation_registry_v1 (
  nation_key, nation_name, federal_status, website_url, registry_source, registry_source_ref
)
select
  'bia:' || t.member_key,
  t.tribe_full_name,
  'federally_recognized',
  nullif(btrim(t.website_url), ''),
  'BIA Tribal Leaders Directory',
  'tribal_leaders ' || t.fetched_date
from public.tribal_leaders t
on conflict (nation_key) do nothing;

-- Nations not federally recognized, each with the website its own
-- Recognition Atlas source packet already cites.
insert into public.native_nation_registry_v1 (
  nation_key, nation_name, federal_status, website_url, registry_source, registry_source_ref
) values
  ('self:duwamish', 'Duwamish Tribe', 'not_federally_recognized',
   'https://www.duwamishtribe.org', 'Recognition Atlas source packet',
   'client/src/data/duwamish_truth_seed.ts'),
  ('self:muwekma', 'Muwekma Ohlone Tribe', 'not_federally_recognized',
   'https://www.muwekma.org', 'Recognition Atlas source packet',
   'client/src/data/muwekma_truth_seed.ts'),
  ('self:chinook', 'Chinook Indian Nation', 'not_federally_recognized',
   'https://chinooknation.org', 'Recognition Atlas source packet',
   'client/src/data/chinook_truth_seed.ts')
on conflict (nation_key) do nothing;
