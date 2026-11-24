-- Docket Room actor layer, step 3: official supplements (analyses, fiscal
-- notes, veto letters, vote images, misc) attached to their bill, with the
-- legislature's own link and the provider's document fingerprint.
-- Additive only; no provider calls; nothing deleted.
create table if not exists public.docket_bill_supplement_v1 (
  supplement_id bigint primary key check (supplement_id > 0),
  source_bill_id integer not null,
  state_code text,
  supplement_type text,
  supplement_type_id integer,
  title text,
  description text,
  supplement_date date,
  mime text,
  legiscan_url text,
  state_link text,
  supplement_hash text,
  supplement_size bigint,
  docket_fetched_at timestamptz not null,
  docket_source text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_docket_bill_supplement_v1_bill
  on public.docket_bill_supplement_v1 (source_bill_id);

alter table public.docket_bill_supplement_v1 enable row level security;
revoke all on public.docket_bill_supplement_v1 from anon, authenticated;
grant select, insert, update on public.docket_bill_supplement_v1 to service_role;
