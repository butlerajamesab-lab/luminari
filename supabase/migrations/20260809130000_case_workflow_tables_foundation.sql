-- Reconstruct the two Lighthouse case-workflow relations that existed in the
-- live database but were absent from the migration ledger.  No user rows or
-- operational receipts are synthesized.

create table if not exists public.checklist_items (
  id serial primary key,
  case_id integer,
  label text,
  description text,
  priority text,
  checked integer,
  checked_at bigint,
  sort_order integer,
  created_at bigint
);

create index if not exists idx_checklist_case
  on public.checklist_items(case_id);

create table if not exists public.foia_requests (
  id serial primary key,
  case_id integer not null,
  user_id integer not null,
  missing_record_id integer not null,
  agency_id integer,
  statute_id integer,
  domain varchar not null,
  record_type varchar not null,
  state_code varchar not null default 'WA',
  request_fingerprint varchar not null,
  letter_content text not null,
  requester_name varchar,
  requester_address text,
  requester_email varchar,
  requester_phone varchar,
  agency_name varchar,
  agency_address text,
  agency_email varchar,
  foia_request_status varchar not null default 'draft',
  gating_reason text,
  warm_handoff boolean not null default false,
  warm_handoff_reason text,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  submitted_at bigint,
  response_due_at bigint,
  response_received_at bigint
);

create index if not exists idx_foia_req_case
  on public.foia_requests(case_id);
create index if not exists idx_foia_req_status
  on public.foia_requests(foia_request_status);

alter table public.checklist_items enable row level security;
alter table public.foia_requests enable row level security;

revoke all on public.checklist_items, public.foia_requests
  from public, anon, authenticated;
grant select, insert, update, delete on public.checklist_items, public.foia_requests
  to service_role;
grant usage, select on sequence public.checklist_items_id_seq,
  public.foia_requests_id_seq to service_role;

drop policy if exists service_role_all_checklist_items on public.checklist_items;
create policy service_role_all_checklist_items
  on public.checklist_items for all to service_role
  using (true) with check (true);

drop policy if exists service_role_all_foia_requests on public.foia_requests;
create policy service_role_all_foia_requests
  on public.foia_requests for all to service_role
  using (true) with check (true);

comment on table public.checklist_items is
  'Service-only Lighthouse case-workflow checklist state.';
comment on table public.foia_requests is
  'Service-only Lighthouse public-records request workflow state.';
