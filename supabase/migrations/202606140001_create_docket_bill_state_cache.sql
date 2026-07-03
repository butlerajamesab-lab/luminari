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

create index if not exists docket_bill_state_cache_fetched_at_idx
  on public.docket_bill_state_cache (fetched_at desc);

create index if not exists docket_bill_state_cache_session_id_idx
  on public.docket_bill_state_cache (session_id);

create or replace function public.set_docket_bill_state_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_docket_bill_state_cache_updated_at
  on public.docket_bill_state_cache;

create trigger set_docket_bill_state_cache_updated_at
before update on public.docket_bill_state_cache
for each row
execute function public.set_docket_bill_state_cache_updated_at();

alter table public.docket_bill_state_cache enable row level security;

create policy "service role can manage docket bill state cache"
  on public.docket_bill_state_cache
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
