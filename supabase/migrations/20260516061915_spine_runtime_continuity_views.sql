create or replace view public.v_dead_end_risk as
select
  p.canonical_key,
  p.title,
  p.procedural_domain,
  case
    when p.verification_state != 'verified' then 'elevated'
    when p.provenance_complete = false then 'elevated'
    else 'stable'
  end as dead_end_risk_state,
  p.updated_at
from public.canonical_pathway_registry p;

create or replace view public.v_escalation_continuity as
select
  c.canonical_key,
  c.contradiction_type,
  c.escalation_required,
  c.harm_vector,
  c.verification_state,
  c.created_at
from public.canonical_contradiction_registry c
where c.escalation_required = true;

create or replace view public.v_overlay_variance as
select
  canonical_key,
  jurisdiction_scope,
  cardinality(jurisdiction_scope) as overlay_scope_count,
  verification_state,
  updated_at
from public.canonical_pathway_registry;

create or replace view public.v_runtime_signal_flow as
select
  canonical_key,
  signal_type,
  severity,
  source_layer,
  created_at,
  metadata
from public.canonical_signal_registry
order by created_at desc;

create or replace view public.v_spine_runtime_summary as
select
  (select count(*) from public.canonical_room_registry) as total_rooms,
  (select count(*) from public.canonical_pathway_registry) as total_pathways,
  (select count(*) from public.canonical_signal_registry) as total_signals,
  (select count(*) from public.canonical_contradiction_registry) as total_contradictions,
  (select count(*) from public.constitutional_violation_log where remediation_state = 'open') as open_violations,
  now() as runtime_observed_at;
