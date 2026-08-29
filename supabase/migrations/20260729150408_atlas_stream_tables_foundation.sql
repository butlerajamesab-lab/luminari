-- Restore the Atlas mirror tables that existed before their first checked-in
-- recovery migration. Production already has this contract; fresh and preview
-- databases need it so identity verification is executable from zero.

create table if not exists public.streams (
  stream_id text primary key,
  source_id text not null,
  jurisdiction_id text not null,
  module_hint text not null,
  throughput_profile text not null
    check (throughput_profile in ('low', 'medium', 'high', 'ultra')),
  safety_profile text not null
    check (safety_profile in ('default', 'restricted', 'critical')),
  governance_contract_id text not null,
  status text not null
    check (status in ('active', 'degraded', 'quarantined', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.signal_events (
  stream_id text not null references public.streams(stream_id) on delete cascade,
  "offset" bigint not null,
  "timestamp" timestamptz not null,
  signal_type text not null,
  spacetime jsonb not null check (spacetime ? 'region'),
  provenance jsonb not null
    check (provenance ? 'channel')
    check (provenance ? 'confidence'),
  payload jsonb not null default '{}'::jsonb,
  source_id text not null,
  jurisdiction_id text not null,
  module_hint text not null,
  ingested_at timestamptz not null default now(),
  primary key (stream_id, "offset")
);

create index if not exists idx_signal_events_stream_offset
  on public.signal_events (stream_id, "offset");
create index if not exists idx_signal_events_stream_timestamp
  on public.signal_events (stream_id, "timestamp");
create index if not exists idx_signal_events_source
  on public.signal_events (source_id, jurisdiction_id, module_hint);

create table if not exists public.cursors (
  cursor_id text primary key,
  stream_id text not null references public.streams(stream_id) on delete cascade,
  name text not null,
  current_offset bigint not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stream_id, name)
);

create index if not exists idx_cursors_stream
  on public.cursors (stream_id);

alter table public.streams enable row level security;
alter table public.signal_events enable row level security;
alter table public.cursors enable row level security;

create policy authenticated_read_streams
  on public.streams for select to authenticated using (true);
create policy authenticated_read_signal_events
  on public.signal_events for select to authenticated using (true);
create policy authenticated_all_access_cursors
  on public.cursors for select to authenticated using (true);
create policy service_role_all_cursors_bd9a3dbb
  on public.cursors for all to service_role using (true) with check (true);

revoke all on table public.streams, public.signal_events, public.cursors
  from public, anon, authenticated;
grant select on table public.streams, public.signal_events, public.cursors
  to authenticated;
grant all on table public.streams, public.signal_events, public.cursors
  to service_role;
