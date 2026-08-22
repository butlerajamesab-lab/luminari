-- Cover every governed integrity foreign-key traversal used by review,
-- supersession, routing, and escalation. The substrate is append-only, so
-- these indexes are created separately from any data rewrite.

create index if not exists integrity_candidate_supersedes_v1
  on private.integrity_pattern_candidate(supersedes_id)
  where supersedes_id is not null;

create index if not exists integrity_assessment_supersedes_v1
  on private.integrity_corroboration_assessment(supersedes_id)
  where supersedes_id is not null;

create index if not exists integrity_transition_assessment_v1
  on private.integrity_candidate_transition(assessment_id)
  where assessment_id is not null;

create index if not exists integrity_routing_candidate_v1
  on private.integrity_routing_snapshot(candidate_id, created_at desc);

create index if not exists integrity_routing_assessment_v1
  on private.integrity_routing_snapshot(assessment_id, created_at desc);

create index if not exists integrity_packet_assessment_v1
  on private.integrity_escalation_packet(assessment_id, created_at desc);

create index if not exists integrity_packet_route_v1
  on private.integrity_escalation_packet(routing_snapshot_id, created_at desc);

create index if not exists integrity_packet_supersedes_v1
  on private.integrity_escalation_packet(supersedes_id)
  where supersedes_id is not null;
