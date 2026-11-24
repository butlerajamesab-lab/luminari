-- Docket Room actor layer, step 2: roll calls and individual votes.
-- Additive only; no provider calls; nothing deleted.
--   docket_roll_call_v1      one row per roll call, from the stored bill detail
--                            (tally, chamber, date, outcome, official links).
--   docket_roll_call_vote_v1 one row per legislator per roll call, from the
--                            preserved LegiScan archive record, with its hashes.
create table if not exists public.docket_roll_call_v1 (
  roll_call_id bigint primary key check (roll_call_id > 0),
  source_bill_id integer not null,
  state_code text,
  chamber text,
  chamber_id integer,
  vote_date date,
  description text,
  yea integer,
  nay integer,
  nv integer,
  absent integer,
  total integer,
  passed boolean,
  legiscan_url text,
  state_link text,
  docket_fetched_at timestamptz not null,
  docket_source text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_docket_roll_call_v1_bill
  on public.docket_roll_call_v1 (source_bill_id);

create table if not exists public.docket_roll_call_vote_v1 (
  roll_call_id bigint not null,
  people_id integer not null check (people_id > 0),
  vote_id integer,
  vote_text text not null,
  archive_sha256 text not null,
  member_path text not null,
  member_sha256 text not null,
  recorded_at timestamptz not null default now(),
  primary key (roll_call_id, people_id)
);
create index if not exists idx_docket_roll_call_vote_v1_people
  on public.docket_roll_call_vote_v1 (people_id);

-- The archive has one record per roll call but no way to find it by id.
create index if not exists idx_docket_legiscan_bulk_member_receipt_roll_call
  on public.docket_legiscan_bulk_member_receipt (provider_record_id)
  where member_kind = 'roll_call';

alter table public.docket_roll_call_v1 enable row level security;
alter table public.docket_roll_call_vote_v1 enable row level security;
revoke all on public.docket_roll_call_v1 from anon, authenticated;
revoke all on public.docket_roll_call_vote_v1 from anon, authenticated;
grant select, insert, update on public.docket_roll_call_v1 to service_role;
grant select, insert on public.docket_roll_call_vote_v1 to service_role;
