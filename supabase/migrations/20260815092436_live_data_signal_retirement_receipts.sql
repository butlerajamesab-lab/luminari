create table if not exists public.live_data_signal_retirement_receipt_v1 (
  retirement_receipt_id uuid primary key default gen_random_uuid(),
  semantic_key text not null check (semantic_key ~ '^[0-9a-f]{64}$'),
  live_data_signal_id uuid not null references public.live_data_signals(live_data_signal_id),
  atlas_candidate_id uuid not null,
  atlas_candidate_hash text not null check (atlas_candidate_hash ~ '^[0-9a-f]{64}$'),
  atlas_run_id uuid not null,
  retirement_reason text not null,
  retirement_hash text not null unique check (retirement_hash ~ '^[0-9a-f]{64}$'),
  retired_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.live_data_signal_retirement_receipt_v1 enable row level security;
revoke all on public.live_data_signal_retirement_receipt_v1 from public, anon, authenticated;
grant select, insert on public.live_data_signal_retirement_receipt_v1 to service_role;

create trigger live_data_signal_retirement_receipt_immutable_v1
before update or delete on public.live_data_signal_retirement_receipt_v1
for each row execute function public.guard_signal_architecture_immutable_v1();

create or replace function public.retire_live_data_signal_transport_receipt_v1(p_record jsonb)
returns table(
  retirement_receipt_id uuid,
  live_data_signal_id uuid,
  semantic_key text,
  retirement_hash text,
  status text,
  retired_at timestamptz,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_semantic_key text := lower(coalesce(p_record->>'semantic_key',''));
  v_candidate_id uuid;
  v_candidate_hash text := lower(coalesce(p_record->>'atlas_candidate_hash',''));
  v_run_id uuid;
  v_expected_signal_id uuid;
  v_reason text := coalesce(nullif(p_record->>'retirement_reason',''),'not_observed_in_complete_replay');
  v_retired_at timestamptz;
  v_signal public.live_data_signals%rowtype;
  v_receipt public.live_data_signal_retirement_receipt_v1%rowtype;
  v_retirement_hash text;
  v_transitioned boolean := false;
begin
  if v_semantic_key !~ '^[0-9a-f]{64}$' or v_candidate_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'live_data_signal_retirement_identity_invalid';
  end if;
  begin
    v_candidate_id := (p_record->>'atlas_candidate_id')::uuid;
    v_run_id := (p_record->>'atlas_run_id')::uuid;
    v_expected_signal_id := nullif(p_record->>'lighthouse_record_id','')::uuid;
    v_retired_at := (p_record->>'retired_at')::timestamptz;
  exception when others then
    raise exception 'live_data_signal_retirement_receipt_invalid';
  end;
  if v_candidate_id is null or v_run_id is null or v_retired_at is null then
    raise exception 'live_data_signal_retirement_receipt_incomplete';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_semantic_key, 0));

  select * into v_signal
  from public.live_data_signals s
  where public.live_data_signal_semantic_key_v2(
          s.detection_rule_id,
          s.signal_type,
          s.primary_stream_id,
          s.jurisdiction_id,
          s.title,
          s.entity_ids
        ) = v_semantic_key
    and s.atlas_candidate_id = v_candidate_id
    and s.atlas_candidate_hash = v_candidate_hash
  order by s.created_at desc, s.live_data_signal_id desc
  limit 1
  for update;

  if not found then
    raise exception 'live_data_signal_retirement_candidate_not_found';
  end if;
  if v_expected_signal_id is not null and v_signal.live_data_signal_id <> v_expected_signal_id then
    raise exception 'live_data_signal_retirement_lighthouse_id_mismatch';
  end if;

  if v_signal.is_current then
    -- Only retire if this exact Atlas candidate is still the current projection.
    -- A stale retirement receipt can never retire a newer superseding candidate.
    update public.live_data_signals
       set is_current = false
     where live_data_signal_id = v_signal.live_data_signal_id
       and is_current = true;
    v_transitioned := found;
  end if;

  v_retirement_hash := public.signal_architecture_hash_v1(jsonb_build_object(
    'contract','atlas_domain3_signal_retirement_v1',
    'semantic_key',v_semantic_key,
    'live_data_signal_id',v_signal.live_data_signal_id,
    'atlas_candidate_id',v_candidate_id,
    'atlas_candidate_hash',v_candidate_hash,
    'atlas_run_id',v_run_id,
    'retirement_reason',v_reason,
    'retired_at',to_char(v_retired_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ));

  insert into public.live_data_signal_retirement_receipt_v1(
    semantic_key,live_data_signal_id,atlas_candidate_id,atlas_candidate_hash,
    atlas_run_id,retirement_reason,retirement_hash,retired_at
  ) values (
    v_semantic_key,v_signal.live_data_signal_id,v_candidate_id,v_candidate_hash,
    v_run_id,v_reason,v_retirement_hash,v_retired_at
  )
  on conflict (retirement_hash) do nothing
  returning * into v_receipt;

  if v_receipt.retirement_receipt_id is null then
    select * into v_receipt
    from public.live_data_signal_retirement_receipt_v1
    where retirement_hash = v_retirement_hash;
  end if;

  return query select
    v_receipt.retirement_receipt_id,
    v_signal.live_data_signal_id,
    v_semantic_key,
    v_retirement_hash,
    case when v_transitioned then 'retired' else 'idempotent' end,
    v_retired_at,
    v_receipt.created_at;
end
$function$;

revoke execute on function public.retire_live_data_signal_transport_receipt_v1(jsonb) from public, anon, authenticated;
grant execute on function public.retire_live_data_signal_transport_receipt_v1(jsonb) to service_role;

comment on table public.live_data_signal_retirement_receipt_v1 is
  'Append-only receipt proving that a previously current Atlas live-data signal disappeared from a complete governed replay and was retired without deleting history.';
comment on function public.retire_live_data_signal_transport_receipt_v1(jsonb) is
  'Retires only the exact current Atlas candidate projection named by a governed retirement receipt; stale receipts cannot retire newer superseding signals.';
