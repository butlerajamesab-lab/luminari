create table if not exists public.spine_flow_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null unique,
  metric_type text not null,
  metric_value numeric not null default 0,
  source_layer text,
  jurisdiction_scope text[] default array['national'],
  verification_state text not null default 'verified',
  constitutional_alignment boolean not null default true,
  deterministic boolean not null default true,
  provenance_complete boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.v_spine_flow_metrics as
select
  metric_key,
  metric_type,
  metric_value,
  source_layer,
  jurisdiction_scope,
  verification_state,
  updated_at
from public.spine_flow_metrics
order by updated_at desc;

insert into public.spine_flow_metrics
(metric_key, metric_type, metric_value, source_layer, metadata)
values
('metric_dead_end_risk','continuity',3,'spine','{"description":"Current elevated dead-end continuity risk count"}'::jsonb),
('metric_contradiction_density','contradiction',12,'viewfinder','{"description":"Current contradiction density telemetry"}'::jsonb),
('metric_overlay_variance','overlay',7,'viewfinder','{"description":"Current jurisdiction overlay variance"}'::jsonb),
('metric_signal_flow','signal_flow',18,'atlas','{"description":"Current active signal circulation volume"}'::jsonb),
('metric_escalation_pressure','escalation',5,'lumensend','{"description":"Current escalation continuity pressure"}'::jsonb)
on conflict (metric_key) do update
set metric_value = excluded.metric_value,
    updated_at = now();
