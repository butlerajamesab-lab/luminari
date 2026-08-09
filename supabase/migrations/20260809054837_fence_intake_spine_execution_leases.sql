begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- A durable, renewable lease replaces the session-level advisory lock that
-- was previously held on a checked-out application-pool client. The canonical
-- pool deliberately destroys leases after 60 seconds, so a session lock on
-- that client could disappear while a long Intake Spine execution continued.
create table if not exists public.intake_spine_execution_leases (
  intake_session_id uuid primary key
    references public.intake_sessions(intake_session_id) on delete cascade,
  lease_token uuid not null unique,
  acquired_at timestamptz not null,
  renewed_at timestamptz not null,
  expires_at timestamptz not null,
  application_name text,
  check (expires_at > renewed_at),
  check (renewed_at >= acquired_at)
);

create index if not exists idx_intake_spine_execution_leases_expires_at
  on public.intake_spine_execution_leases (expires_at);

alter table public.intake_spine_execution_leases enable row level security;

revoke all on table public.intake_spine_execution_leases from public;

do $acl$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke all on table public.intake_spine_execution_leases from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke all on table public.intake_spine_execution_leases from authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    revoke all on table public.intake_spine_execution_leases from service_role;
  end if;
end
$acl$;

create or replace function public.acquire_intake_spine_execution_lease_v1(
  p_intake_session_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_acquired boolean := false;
begin
  if p_intake_session_id is null or p_lease_token is null then
    raise exception using errcode = '22004', message = 'intake session id and lease token are required';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'intake execution lease seconds must be between 30 and 900';
  end if;

  insert into public.intake_spine_execution_leases (
    intake_session_id,
    lease_token,
    acquired_at,
    renewed_at,
    expires_at,
    application_name
  ) values (
    p_intake_session_id,
    p_lease_token,
    v_now,
    v_now,
    v_now + pg_catalog.make_interval(secs => p_lease_seconds),
    nullif(pg_catalog.current_setting('application_name', true), '')
  )
  on conflict (intake_session_id) do update
     set lease_token = excluded.lease_token,
         acquired_at = case
           when public.intake_spine_execution_leases.lease_token = excluded.lease_token
             then public.intake_spine_execution_leases.acquired_at
           else excluded.acquired_at
         end,
         renewed_at = excluded.renewed_at,
         expires_at = excluded.expires_at,
         application_name = excluded.application_name
   where public.intake_spine_execution_leases.lease_token = excluded.lease_token
      or public.intake_spine_execution_leases.expires_at <= v_now
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end
$function$;

create or replace function public.renew_intake_spine_execution_lease_v1(
  p_intake_session_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_renewed boolean := false;
begin
  if p_intake_session_id is null or p_lease_token is null then
    raise exception using errcode = '22004', message = 'intake session id and lease token are required';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'intake execution lease seconds must be between 30 and 900';
  end if;

  update public.intake_spine_execution_leases
     set renewed_at = v_now,
         expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
         application_name = nullif(pg_catalog.current_setting('application_name', true), '')
   where intake_session_id = p_intake_session_id
     and lease_token = p_lease_token
     and expires_at > v_now
  returning true into v_renewed;

  return coalesce(v_renewed, false);
end
$function$;

create or replace function public.release_intake_spine_execution_lease_v1(
  p_intake_session_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_released boolean := false;
begin
  delete from public.intake_spine_execution_leases
   where intake_session_id = p_intake_session_id
     and lease_token = p_lease_token
  returning true into v_released;

  return coalesce(v_released, false);
end
$function$;

-- Fence every sealed layer write inside the same transaction that verifies
-- cross-runtime hashes and extends the receipt chain. A process that wakes up
-- after its lease expired or was taken over cannot persist one more layer.
create or replace function public.register_intake_layer_execution_v4(
  p_intake_session_id uuid,
  p_layer_name text,
  p_layer_version text,
  p_rule_version text,
  p_parser_version text,
  p_rule_manifest_hash text,
  p_execution_envelope jsonb,
  p_input_hash text,
  p_output_data jsonb,
  p_output_hash text,
  p_input_refs jsonb,
  p_unresolved_dependencies jsonb,
  p_execution_lease_token uuid
)
returns table (
  registered_layer_run_id uuid,
  registered_receipt_hash text,
  registered_output_artifact_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform 1
    from public.intake_spine_execution_leases lease
   where lease.intake_session_id = p_intake_session_id
     and lease.lease_token = p_execution_lease_token
     and lease.expires_at > pg_catalog.clock_timestamp()
   for update;
  if not found then
    raise exception using
      errcode = '55000',
      message = 'intake spine execution lease is missing, expired, or owned by another execution';
  end if;

  return query
  select *
    from public.register_intake_layer_execution_v3(
      p_intake_session_id,
      p_layer_name,
      p_layer_version,
      p_rule_version,
      p_parser_version,
      p_rule_manifest_hash,
      p_execution_envelope,
      p_input_hash,
      p_output_data,
      p_output_hash,
      p_input_refs,
      p_unresolved_dependencies
    );
end
$function$;

-- Final completion is fenced by both the execution lease and the intake
-- session xmin captured after lease acquisition. Evidence mutation changes
-- xmin; lease heartbeats do not, because they live in the separate table.
create or replace function public.complete_intake_spine_execution_v1(
  p_intake_session_id uuid,
  p_expected_session_xmin text,
  p_execution_lease_token uuid,
  p_jurisdiction text,
  p_rule_as_of text,
  p_required_layer_count integer,
  p_sealed_receipt_count integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_completed boolean := false;
begin
  perform 1
    from public.intake_spine_execution_leases lease
   where lease.intake_session_id = p_intake_session_id
     and lease.lease_token = p_execution_lease_token
     and lease.expires_at > pg_catalog.clock_timestamp()
   for update;
  if not found then
    return false;
  end if;

  update public.intake_sessions
     set completion_state = 'governed_execution_complete',
         metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
           'last_governed_execution', pg_catalog.jsonb_build_object(
             'jurisdiction', p_jurisdiction,
             'rule_as_of', p_rule_as_of,
             'required_layer_count', p_required_layer_count,
             'sealed_receipt_count', p_sealed_receipt_count
           )
         ),
         updated_at = pg_catalog.clock_timestamp()
   where intake_session_id = p_intake_session_id
     and xmin::text = p_expected_session_xmin
  returning true into v_completed;

  return coalesce(v_completed, false);
end
$function$;

revoke all on function public.acquire_intake_spine_execution_lease_v1(uuid, uuid, integer) from public;
revoke all on function public.renew_intake_spine_execution_lease_v1(uuid, uuid, integer) from public;
revoke all on function public.release_intake_spine_execution_lease_v1(uuid, uuid) from public;
revoke all on function public.register_intake_layer_execution_v4(
  uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb, uuid
) from public;
revoke all on function public.complete_intake_spine_execution_v1(
  uuid, text, uuid, text, text, integer, integer
) from public;

do $acl$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke all on function public.acquire_intake_spine_execution_lease_v1(uuid, uuid, integer) from anon;
    revoke all on function public.renew_intake_spine_execution_lease_v1(uuid, uuid, integer) from anon;
    revoke all on function public.release_intake_spine_execution_lease_v1(uuid, uuid) from anon;
    revoke all on function public.register_intake_layer_execution_v4(
      uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb, uuid
    ) from anon;
    revoke all on function public.complete_intake_spine_execution_v1(
      uuid, text, uuid, text, text, integer, integer
    ) from anon;
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke all on function public.acquire_intake_spine_execution_lease_v1(uuid, uuid, integer) from authenticated;
    revoke all on function public.renew_intake_spine_execution_lease_v1(uuid, uuid, integer) from authenticated;
    revoke all on function public.release_intake_spine_execution_lease_v1(uuid, uuid) from authenticated;
    revoke all on function public.register_intake_layer_execution_v4(
      uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb, uuid
    ) from authenticated;
    revoke all on function public.complete_intake_spine_execution_v1(
      uuid, text, uuid, text, text, integer, integer
    ) from authenticated;
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    -- Runtime persistence must go through the fenced v4 contract.
    revoke all on function public.register_intake_layer_execution_v2(
      uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
    ) from service_role;
    revoke all on function public.register_intake_layer_execution_v3(
      uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb
    ) from service_role;
    grant execute on function public.acquire_intake_spine_execution_lease_v1(uuid, uuid, integer) to service_role;
    grant execute on function public.renew_intake_spine_execution_lease_v1(uuid, uuid, integer) to service_role;
    grant execute on function public.release_intake_spine_execution_lease_v1(uuid, uuid) to service_role;
    grant execute on function public.register_intake_layer_execution_v4(
      uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb, uuid
    ) to service_role;
    grant execute on function public.complete_intake_spine_execution_v1(
      uuid, text, uuid, text, text, integer, integer
    ) to service_role;
  end if;
end
$acl$;

comment on table public.intake_spine_execution_leases is
  'Durable renewable leases and fencing tokens for one active Universal Intake Spine execution per session.';
comment on function public.register_intake_layer_execution_v4(
  uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb, uuid
) is
  'Fenced layer-registration contract: verifies a live execution lease in the same transaction before delegating to cross-runtime v3 proof persistence.';

commit;
