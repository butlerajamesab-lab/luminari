create or replace view public.v_constitutional_health as
select
  (select count(*) from public.constitutional_registry) as constitutional_rules,
  (select count(*) from public.constitutional_violation_log where remediation_state = 'open') as open_violations,
  (select count(*) from public.provenance_registry where provenance_complete = false) as provenance_gaps,
  (select count(*) from public.canonical_signal_registry) as active_signals,
  now() as observed_at;

create or replace view public.v_structural_signal_density as
select
  signal_type,
  severity,
  count(*) as signal_count,
  max(created_at) as latest_signal
from public.canonical_signal_registry
group by signal_type, severity;

create or replace view public.v_runtime_contradictions as
select
  canonical_key,
  contradiction_type,
  governing_expectation,
  observed_reality,
  harm_vector,
  escalation_required,
  verification_state,
  created_at
from public.canonical_contradiction_registry
order by created_at desc;

create or replace view public.v_pathway_topology as
select
  p.canonical_key,
  p.title,
  p.procedural_domain,
  p.urgency_profile,
  r.room_name,
  p.verification_state,
  p.created_at
from public.canonical_pathway_registry p
left join public.canonical_room_registry r
on p.room_id = r.id;

create or replace view public.v_procedural_state_flow as
select
  canonical_key,
  state_name,
  stage_order,
  verification_state,
  created_at
from public.canonical_procedural_state_registry
order by stage_order asc;

create or replace view public.v_jurisdiction_overlay_state as
select
  canonical_key,
  jurisdiction_scope,
  verification_state,
  constitutional_alignment,
  updated_at
from public.canonical_pathway_registry;

create or replace view public.v_live_intake_operations as
select
  p.canonical_key as pathway_key,
  p.title as pathway_title,
  p.procedural_domain,
  s.state_name as current_state,
  s.stage_order,
  p.verification_state,
  p.constitutional_alignment,
  p.provenance_complete,
  p.deterministic,
  p.created_at
from public.canonical_pathway_registry p
left join public.canonical_procedural_state_registry s
on s.stage_order = 1;
