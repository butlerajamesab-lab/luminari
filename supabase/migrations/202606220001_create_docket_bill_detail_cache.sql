create table if not exists public.docket_bill_detail_cache (
  bill_id integer primary key,
  bill jsonb not null,
  fetched_at timestamptz not null default now(),
  source text not null default 'legiscan.getBill',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint docket_bill_detail_cache_bill_object check (jsonb_typeof(bill) = 'object')
);

create index if not exists docket_bill_detail_cache_fetched_at_idx
  on public.docket_bill_detail_cache (fetched_at desc);

create or replace function public.set_docket_bill_detail_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_docket_bill_detail_cache_updated_at
  on public.docket_bill_detail_cache;

create trigger set_docket_bill_detail_cache_updated_at
before update on public.docket_bill_detail_cache
for each row
execute function public.set_docket_bill_detail_cache_updated_at();

alter table public.docket_bill_detail_cache enable row level security;

create policy "service role can manage docket bill detail cache"
  on public.docket_bill_detail_cache
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
