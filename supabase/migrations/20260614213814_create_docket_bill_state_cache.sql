create table if not exists public.docket_bill_state_cache (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  session_id integer not null,
  session_title text,
  bills jsonb not null default '[]'::jsonb,
  bill_count integer not null default 0,
  fetched_at timestamptz not null default now(),
  source text not null default 'legiscan.getMasterList',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint docket_bill_state_cache_state_unique unique (state),
  constraint docket_bill_state_cache_state_format check (state ~ '^[A-Z]{2}$' or state = 'DC'),
  constraint docket_bill_state_cache_bill_count_nonnegative check (bill_count >= 0),
  constraint docket_bill_state_cache_bills_array check (jsonb_typeof(bills) = 'array')
);
create index if not exists docket_bill_state_cache_fetched_at_idx on public.docket_bill_state_cache (fetched_at desc);
create index if not exists docket_bill_state_cache_session_id_idx on public.docket_bill_state_cache (session_id);