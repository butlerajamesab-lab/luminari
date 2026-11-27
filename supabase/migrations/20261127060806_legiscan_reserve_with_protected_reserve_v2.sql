-- LegiScan fallback-ceiling reservation (review finding on luminari PR #911, discussion_r4716171536).
--
-- Problem: the paid-fallback gate read the ledger count in one statement and the provider call
-- reserved a request later through reserve_legiscan_api_request_v1, which only enforces the full
-- monthly budget. A concurrent live-session refresh could take the last request below the ceiling
-- between the two, letting the fallback spend the protected reserve.
--
-- Fix: a sibling function that enforces the fallback-specific ceiling (budget - protected reserve)
-- inside the same atomic reservation, under the same advisory lock as v1. Callers that pass no
-- reserve (or 0) behave exactly like v1. reserve_legiscan_api_request_v1 is NOT modified.
begin;

create or replace function public.reserve_legiscan_api_request_v2(
  p_operation text,
  p_monthly_budget integer,
  p_service_identity text,
  p_protected_reserve integer default 0
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

  if p_protected_reserve is null
     or p_protected_reserve < 0
     or p_protected_reserve >= p_monthly_budget then
    raise exception using errcode='22023',
      message='invalid_legiscan_protected_reserve';
  end if;

  if nullif(btrim(coalesce(p_service_identity,'')), '') is null then
    raise exception using errcode='22023',
      message='invalid_legiscan_service_identity';
  end if;

  -- Same lock key as reserve_legiscan_api_request_v1: every reservation, with or
  -- without a protected reserve, serializes on one lock per UTC month.
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

  -- Fallback ceiling: callers that ask for a protected reserve may only take a request
  -- while the month's count is below budget - reserve. Checked under the lock, in the
  -- same transaction as the insert, so no concurrent reservation can slip between them.
  if p_protected_reserve > 0
     and v_count >= p_monthly_budget - p_protected_reserve then
    raise exception using errcode='P0001',
      message='legiscan_paid_fallback_reserve_reached';
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

revoke all on function public.reserve_legiscan_api_request_v2(text,integer,text,integer)
  from public, anon, authenticated;
grant execute on function public.reserve_legiscan_api_request_v2(text,integer,text,integer)
  to service_role, postgres;

comment on function public.reserve_legiscan_api_request_v2(text,integer,text,integer) is
  'Like reserve_legiscan_api_request_v1, plus an optional protected reserve: when p_protected_reserve > 0 the request is refused (legiscan_paid_fallback_reserve_reached) once the UTC month count reaches budget minus reserve. Enforced atomically under the same advisory lock as v1.';

commit;
