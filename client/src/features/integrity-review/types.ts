import { z } from "zod";

export const candidate_status_schema = z.enum([
  "candidate",
  "evidence_gathering",
  "corroboration_review",
  "review_hold",
  "corroborated",
  "contradicted",
  "inconclusive",
  "dismissed",
  "routing_review",
  "escalation_ready",
  "escalated",
  "closed",
]);

export type CandidateStatus = z.infer<typeof candidate_status_schema>;

export const corroboration_state_schema = z.enum([
  "uncorroborated",
  "single_source",
  "independently_supported",
  "contradicted",
  "disputed",
  "inconclusive",
  "verified_for_routing",
]);

export type CorroborationState = z.infer<typeof corroboration_state_schema>;

export const candidate_type_schema = z.enum([
  "phoenix_successor_pattern",
  "exact_identifier_reuse_pattern",
  "financial_conduit_pattern",
  "dark_money_pattern",
  "legislative_integrity_anomaly",
  "procurement_integrity_anomaly",
  "contradiction_pattern",
  "numeric_range_anomaly",
  "other",
]);

export type CandidateType = z.infer<typeof candidate_type_schema>;

export const evidence_source_class_schema = z.enum([
  "official_primary",
  "official_secondary",
  "court_record",
  "legislative_record",
  "campaign_finance_record",
  "lobbying_disclosure",
  "foreign_agent_registration",
  "regulatory_record",
  "corporate_record",
  "procurement_record",
  "audited_financial_record",
  "journalistic_source",
  "user_supplied",
  "other",
]);

export type EvidenceSourceClass = z.infer<typeof evidence_source_class_schema>;

const nullable_string = z.string().nullable();

export const candidate_list_item_schema = z.object({
  candidate_id: z.string().uuid(),
  case_id: nullable_string,
  signal_id: z.string().uuid(),
  candidate_type: candidate_type_schema,
  jurisdiction_id: nullable_string,
  summary: z.string(),
  status: candidate_status_schema,
  candidate_hash: z.string(),
  observed_at: z.union([z.string(), z.date()]).nullable(),
  created_at: z.union([z.string(), z.date()]),
  evidence_count: z.number(),
  support_count: z.number(),
  contradiction_count: z.number(),
  latest_assessment_state: corroboration_state_schema.nullable(),
  atlas_is_current: z.boolean(),
  atlas_governance_status: z.string(),
  atlas_verification_state: z.string(),
  atlas_candidate_id: nullable_string,
  atlas_candidate_hash: nullable_string,
  atlas_semantic_key: nullable_string,
  atlas_confidence_score: z.number(),
  atlas_severity: z.string(),
});

export const candidate_list_schema = z.array(candidate_list_item_schema);
export type CandidateListItem = z.infer<typeof candidate_list_item_schema>;

export const evidence_link_schema = z.object({
  evidence_link_id: z.string().uuid(),
  source_class: z.string(),
  source_relation: z.string(),
  source_record_key: z.string(),
  source_uri: nullable_string,
  quote_text: nullable_string,
  pinpoint: nullable_string,
  source_content_hash: z.string(),
  supports_or_contradicts: z.enum(["supports", "contradicts", "context_only", "unresolved"]),
  evidence_hash: z.string(),
  provenance_type: z.enum(["atlas_projection", "reviewer"]),
  created_by_id: nullable_string,
  observed_at: nullable_string,
  created_at: z.string(),
});

export type EvidenceLink = z.infer<typeof evidence_link_schema>;

export const assessment_schema = z.object({
  assessment_id: z.string().uuid(),
  assessment_order: z.number(),
  assessment_state: corroboration_state_schema,
  independent_source_count: z.number(),
  contradiction_count: z.number(),
  source_class_count: z.number(),
  rationale: z.string(),
  evidence_link_ids: z.array(z.string().uuid()),
  rule_id: z.string(),
  rule_version: z.string(),
  assessment_hash: z.string(),
  assessed_by_type: z.enum(["reviewer", "administrator"]),
  assessed_by_id: nullable_string,
  assessed_at: z.string(),
});

export type Assessment = z.infer<typeof assessment_schema>;

export const transition_schema = z.object({
  transition_id: z.string().uuid(),
  transition_order: z.number(),
  from_status: nullable_string,
  to_status: candidate_status_schema,
  reason: z.string(),
  actor_type: z.enum(["system_rule", "reviewer", "administrator"]),
  actor_id: nullable_string,
  assessment_id: nullable_string,
  transition_hash: z.string(),
  created_at: z.string(),
});

export type Transition = z.infer<typeof transition_schema>;

export const packet_schema = z.object({
  packet_id: z.string().uuid(),
  assessment_id: z.string().uuid(),
  routing_snapshot_id: z.string().uuid(),
  packet_state: z.string(),
  allegation_disclaimer: z.string(),
  evidence_link_ids: z.array(z.string().uuid()),
  packet_payload: z.record(z.string(), z.unknown()),
  packet_hash: z.string(),
  created_by_type: z.string(),
  created_by_id: nullable_string,
  created_at: z.string(),
  transmitted_at: nullable_string,
  external_receipt: nullable_string,
});

export type Packet = z.infer<typeof packet_schema>;

export const routing_snapshot_schema = z.object({
  routing_snapshot_id: z.string().uuid(),
  assessment_id: z.string().uuid(),
  jurisdiction_id: z.string(),
  agency_name: z.string(),
  department_name: nullable_string,
  channel_type: z.string(),
  destination_uri: nullable_string,
  authority_basis: z.record(z.string(), z.unknown()),
  routing_constraints: z.record(z.string(), z.unknown()),
  source_as_of: z.string(),
  routing_hash: z.string(),
  created_at: z.string(),
});

export const atlas_projection_schema = z.object({
  is_current: z.boolean(),
  governance_status: z.string(),
  verification_state: z.string(),
  atlas_candidate_id: nullable_string,
  atlas_candidate_hash: nullable_string,
  atlas_semantic_key: nullable_string,
  signal_type: z.string(),
  title: z.string(),
  description: z.string(),
  primary_stream_id: z.string(),
  entity_ids: z.array(z.string()),
  entity_resolution_status: z.string(),
  severity: z.string(),
  confidence_score: z.number(),
  supporting_statistics: z.record(z.string(), z.unknown()),
  source_event_refs: z.array(z.unknown()),
  source_freshness_at: z.string(),
  detected_at: z.string(),
});

export const detail_projection_schema = z.object({
  candidate: z.object({
    candidate_id: z.string().uuid(),
    case_id: nullable_string,
    signal_id: z.string().uuid(),
    candidate_type: candidate_type_schema,
    subject_scope: z.record(z.string(), z.unknown()),
    jurisdiction_id: nullable_string,
    summary: z.string(),
    status: candidate_status_schema,
    rule_id: z.string(),
    rule_version: z.string(),
    input_hash: z.string(),
    candidate_hash: z.string(),
    observed_at: nullable_string,
    created_at: z.string(),
  }),
  atlas_projection: atlas_projection_schema,
  evidence: z.array(evidence_link_schema),
  assessments: z.array(assessment_schema),
  transitions: z.array(transition_schema),
  routing_snapshots: z.array(routing_snapshot_schema),
  packets: z.array(packet_schema),
  disclaimer: z.string(),
});

export type DetailProjection = z.infer<typeof detail_projection_schema>;

export const route_catalog_item_schema = z.object({
  route_id: z.string(),
  jurisdiction_ids: z.array(z.string()),
  candidate_types: z.array(candidate_type_schema),
  agency_name: z.string(),
  department_name: z.string(),
  channel_type: z.string(),
  destination_uri: z.string().url(),
  authority_basis: z.object({
    authority_name: z.string(),
    authority_uri: z.string().url(),
    scope: z.string(),
  }),
  routing_constraints: z.object({
    draft_only: z.literal(true),
    transmission_authorized: z.literal(false),
    human_review_required: z.literal(true),
    notes: z.array(z.string()),
  }),
  source_as_of: z.string(),
});

export const route_catalog_schema = z.array(route_catalog_item_schema);
export type RouteCatalogItem = z.infer<typeof route_catalog_item_schema>;

export const projection_readiness_schema = z.object({
  atlas_current_integrity_candidate_count: z.number(),
  projected_review_count: z.number(),
  unprojected_review_count: z.number(),
  projection_healthy: z.boolean(),
  source_system: z.literal("Atlas Domain 3"),
  interpretation_boundary: z.string(),
});

export type ProjectionReadiness = z.infer<typeof projection_readiness_schema>;

export type AttachEvidencePayload = {
  candidate_id: string;
  source_class: EvidenceSourceClass;
  source_relation: string;
  source_record_key: string;
  source_uri?: string;
  quote_text?: string;
  pinpoint?: string;
  source_content_hash: string;
  supports_or_contradicts: "supports" | "contradicts" | "context_only" | "unresolved";
  observed_at?: string;
};

export type CorroborationPayload = {
  candidate_id: string;
  assessment_state: CorroborationState;
  rationale: string;
  evidence_link_ids: string[];
};

export type TransitionPayload = {
  candidate_id: string;
  to_status: CandidateStatus;
  reason: string;
  assessment_id?: string;
};

export type DraftPayload = {
  candidate_id: string;
  assessment_id: string;
  evidence_link_ids: string[];
  route_id?: string;
  reviewer_notes: string;
};
