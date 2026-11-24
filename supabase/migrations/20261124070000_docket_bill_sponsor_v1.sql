-- Docket Room actor layer, step 1: bill -> sponsor links.
-- Additive only. One row per (bill, LegiScan person), projected from the
-- stored provider detail (docket_bill_detail_cache) with the snapshot time it
-- came from. Re-projection from an older snapshot never overwrites a newer one.
-- No provider calls; nothing deleted.
create table if not exists public.docket_bill_sponsor_v1 (
  source_bill_id integer not null,
  people_id integer not null check (people_id > 0),
  state_code text,
  sponsor_order integer,
  sponsor_type_id integer,
  sponsor_type text,
  committee_sponsor boolean not null default false,
  committee_id integer,
  name text not null,
  first_name text,
  last_name text,
  role text,
  party text,
  district text,
  official_page_url text,
  ballotpedia text,
  votesmart_id integer,
  knowwho_pid integer,
  ftm_eid integer,
  bioguide_id text,
  person_hash text,
  docket_fetched_at timestamptz not null,
  docket_source text not null,
  recorded_at timestamptz not null default now(),
  primary key (source_bill_id, people_id)
);

create index if not exists idx_docket_bill_sponsor_v1_people
  on public.docket_bill_sponsor_v1 (people_id);

alter table public.docket_bill_sponsor_v1 enable row level security;
revoke all on public.docket_bill_sponsor_v1 from anon, authenticated;
grant select, insert, update on public.docket_bill_sponsor_v1 to service_role;
