begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres;

create table if not exists private.signal_bridge_token (
  token_id text primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  token_scope text not null check (token_scope in ('live_data_signal_write')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

revoke all on table private.signal_bridge_token
  from public, anon, authenticated, service_role;

insert into private.signal_bridge_token (
  token_id,
  token_hash,
  token_scope,
  is_active
) values (
  'atlas-domain3-production-v1',
  'ec463094b1b3e5d75b82968a54d14f93fe5573531cc5e434e992adbe2f70d966',
  'live_data_signal_write',
  true
)
on conflict (token_id) do update
set token_hash = excluded.token_hash,
    token_scope = excluded.token_scope,
    is_active = true;

create or replace function private.require_signal_bridge_token_v1(
  p_bridge_token text,
  p_required_scope text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  if p_bridge_token is null or length(p_bridge_token) < 32 then
    raise exception using
      message = 'signal_bridge_authentication_failed',
      errcode = '28000';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(p_bridge_token, 'UTF8'), 'sha256'),
    'hex'
  );

  if not exists (
    select 1
    from private.signal_bridge_token token
    where token.token_hash = v_hash
      and token.is_active = true
      and token.token_scope = p_required_scope
  ) then
    raise exception using
      message = 'signal_bridge_authentication_failed',
      errcode = '28000';
  end if;
end;
$$;

revoke all on function private.require_signal_bridge_token_v1(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.register_live_data_signal_transport_receipt_v2(
  p_record jsonb,
  p_bridge_token text
)
returns table (
  live_data_signal_id uuid,
  signal_hash text,
  governance_status text,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
begin
  perform private.require_signal_bridge_token_v1(
    p_bridge_token,
    'live_data_signal_write'
  );

  return query
  select *
  from public.register_live_data_signal_transport_receipt_v1(p_record);
end;
$$;

revoke all on function public.register_live_data_signal_transport_receipt_v2(jsonb, text)
  from public, authenticated;
grant execute on function public.register_live_data_signal_transport_receipt_v2(jsonb, text)
  to anon, service_role;

comment on table private.signal_bridge_token is
  'Hash-only registry for narrow cross-platform signal transport credentials. Raw bridge tokens are never stored in Lighthouse.';
comment on function public.register_live_data_signal_transport_receipt_v2(jsonb, text) is
  'Scoped Atlas Domain 3 transport boundary. The caller may reach it as anon through the Supabase gateway, but canonical registration occurs only after exact SHA-256 token validation.';

notify pgrst, 'reload schema';

commit;
