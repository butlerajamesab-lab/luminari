create table if not exists public.spine_runtime_event_stream (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  source_layer text not null,
  related_registry text,
  related_canonical_key text,
  severity text default 'info',
  payload jsonb default '{}'::jsonb,
  constitutional_alignment boolean not null default true,
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  replayable boolean not null default true,
  verification_state text not null default 'verified',
  created_at timestamptz not null default now()
);

create index if not exists idx_spine_runtime_event_type
on public.spine_runtime_event_stream(event_type);

create index if not exists idx_spine_runtime_source_layer
on public.spine_runtime_event_stream(source_layer);

create or replace view public.v_spine_runtime_events as
select
  event_key,
  event_type,
  source_layer,
  related_registry,
  related_canonical_key,
  severity,
  verification_state,
  created_at,
  payload
from public.spine_runtime_event_stream
order by created_at desc;

insert into public.spine_runtime_event_stream
(event_key, event_type, source_layer, related_registry, related_canonical_key, severity, payload)
values
('runtime_signal_bootstrap','signal_bootstrap','spine','canonical_signal_registry','signal_contradiction_density','info','{"message":"Initial contradiction density circulation activated"}'::jsonb),
('runtime_overlay_bootstrap','overlay_bootstrap','viewfinder','canonical_pathway_registry','overlay_variance','info','{"message":"Jurisdiction overlay circulation initialized"}'::jsonb),
('runtime_dead_end_guard','continuity_guard','spine','canonical_signal_registry','signal_dead_end_guard','high','{"message":"No Dead Ends Guard circulation online"}'::jsonb)
on conflict (event_key) do nothing;
