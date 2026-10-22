begin;

create table if not exists public.legiscan_api_request_ledger (
  request_id bigserial primary key,
  month_start date not null,
  operation text not null
    check (operation in (
      'get_session_list',
      'get_master_list',
      'get_bill',
      'get_bill_text',
      'get_amendment'
    )),
  service_identity text not null,
  reserved_at timestamptz not null default now()
);

create index if not exists idx_legiscan_api_request_ledger_month
  on public.legiscan_api_request_ledger(month_start, request_id);

alter table public.legiscan_api_request_ledger enable row level security;
alter table public.legiscan_api_request_ledger force row level security;

revoke all on table public.legiscan_api_request_ledger
  from public, anon, authenticated;
grant select on table public.legiscan_api_request_ledger to service_role;

create or replace function public.reserve_legiscan_api_request_v1(
  p_operation text,
  p_monthly_budget integer,
  p_service_identity text
)
returns table(
  month_start date,
  request_ordinal integer,
  remaining integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_month_start date :=
    date_trunc('month', current_timestamp at time zone 'UTC')::date;
  v_count integer;
begin
  if p_operation not in (
    'get_session_list',
    'get_master_list',
    'get_bill',
    'get_bill_text',
    'get_amendment'
  ) then
    raise exception using errcode='22023',
      message='invalid_legiscan_budget_operation';
  end if;

  if p_monthly_budget is null
     or p_monthly_budget < 1
     or p_monthly_budget > 10000 then
    raise exception using errcode='22023',
      message='invalid_legiscan_monthly_budget';
  end if;

  if nullif(btrim(coalesce(p_service_identity,'')), '') is null then
    raise exception using errcode='22023',
      message='invalid_legiscan_service_identity';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('legiscan-api-budget:' || v_month_start::text, 0)
  );

  select count(*)::integer
    into v_count
  from public.legiscan_api_request_ledger ledger
  where ledger.month_start=v_month_start;

  if v_count >= p_monthly_budget then
    raise exception using errcode='P0001',
      message='legiscan_local_monthly_budget_exhausted';
  end if;

  insert into public.legiscan_api_request_ledger (
    month_start,
    operation,
    service_identity
  ) values (
    v_month_start,
    p_operation,
    btrim(p_service_identity)
  );

  month_start := v_month_start;
  request_ordinal := v_count + 1;
  remaining := p_monthly_budget - request_ordinal;
  return next;
end
$function$;

revoke all on function public.reserve_legiscan_api_request_v1(text,integer,text)
  from public, anon, authenticated;
grant execute on function public.reserve_legiscan_api_request_v1(text,integer,text)
  to service_role, postgres;

comment on table public.legiscan_api_request_ledger is
  'Append-only local accounting for every LegiScan API request reserved by Luminari. The default application budget is intentionally below the provider limit.';
comment on function public.reserve_legiscan_api_request_v1(text,integer,text) is
  'Atomically reserves one LegiScan request against the current UTC month and fails closed when the configured local budget is exhausted.';

commit;
