begin;

create table if not exists public.docket_current_session_snapshot (
  state text primary key,
  session_id integer not null,
  session_title text,
  provider_current boolean not null,
  bills jsonb not null check (jsonb_typeof(bills)='array'),
  bill_count integer not null check (bill_count >= 0),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  fetched_at timestamptz not null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists docket_current_session_snapshot_current_idx
  on public.docket_current_session_snapshot(provider_current,state,session_id);

comment on table public.docket_current_session_snapshot is
  'Full LegiScan master-list snapshot for the provider-selected session. Replay/corpus admission MUST require provider_current=true; the 100-bill Docket UI cache is a separate presentation slice.';

create or replace view public.docket_replay_current_session_bills_v1 as
select
  snapshot.state,
  snapshot.session_id,
  snapshot.session_title,
  snapshot.snapshot_hash,
  snapshot.fetched_at,
  bill
from public.docket_current_session_snapshot snapshot
cross join lateral jsonb_array_elements(snapshot.bills) bill
where snapshot.provider_current = true
  and nullif(bill->>'bill_id','') is not null;

comment on view public.docket_replay_current_session_bills_v1 is
  'Replay corpus source boundary: only bills from LegiScan sessions explicitly marked current by the provider. Completed bills remain eligible; fallback/prior sessions are excluded.';

commit;
