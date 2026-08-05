import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

export const PRISM_ENGINE_VERSION = "1.0.0";
export const PRISM_RULE_SET_ID = "prism-core-assertion";
export const PRISM_RULE_SET_VERSION = "1.0.0";
export const PRISM_RULE_SET_HASH =
  "298eaf14df23f17c07dbc253fb6a2abe2f55ac9425942a46ab08f6bdd05401b0";

export const PRISM_ROSETTA_ENGINE_VERSION = "2.0.0";
export const PRISM_ROSETTA_RULE_SET_ID = "prism-rosetta-structural-binding";
export const PRISM_ROSETTA_RULE_SET_VERSION = "2.0.0";
export const PRISM_ROSETTA_RULE_SET_HASH =
  "669f9f0f923df678a4d7f0ff7bfe74d2f4e0c89a175ff3cada450cbefc823ce6";

const hash_schema = z.string().regex(/^[a-f0-9]{64}$/i);

export const verification_status_schema = z.enum([
  "user_reported",
  "document_stated",
  "supported_by_one_source",
  "supported_by_multiple_sources",
  "contradicted",
  "disputed",
  "incomplete",
  "unresolved",
  "verified",
]);

export const evidence_reference_schema = z.object({
  evidence_id: z.string().min(1).max(256),
  document_id: z.string().min(1).max(256),
  evidence_fingerprint: hash_schema,
  source_content_hash: hash_schema,
  relationship: z.enum(["supports", "contradicts", "neutral"]),
  independent_source_id: z.string().min(1).max(256).optional(),
}).strict();

export const core_verification_request_schema = z.object({
  request_id: z.string().min(1).max(256),
  lighthouse_case_id: z.string().min(1).max(256),
  evidence_document_id: z.string().min(1).max(256),
  evidence_fingerprint: hash_schema,
  source_content_hash: hash_schema,
  claim_assertion_id: z.string().min(1).max(256),
  rule_set_id: z.literal(PRISM_RULE_SET_ID),
  rule_set_version: z.literal(PRISM_RULE_SET_VERSION),
  requested_checks: z.array(z.enum([
    "classify_support_state",
    "detect_contradictions",
    "identify_missing_evidence",
    "finalize_verified",
  ])).min(1).max(16),
  originating_lighthouse_commit: z.string().regex(/^[a-f0-9]{7,64}$/i),
  originating_lighthouse_runtime_version: z.string().min(1).max(128),
  evidence_refs: z.array(evidence_reference_schema).max(256),
}).strict();

const rosetta_source_span_schema = z.object({
  char_offset_start: z.number().int().nonnegative(),
  char_offset_end: z.number().int().positive(),
  block_content_hash: hash_schema,
}).strict().refine(
  (value) => value.char_offset_end > value.char_offset_start,
  { message: "source_span_end_must_follow_start" },
);

const rosetta_trait_class_schema = z.enum([
  "help",
  "workflow",
  "accountability",
  "override",
  "definition",
]);

const rosetta_required_check_schema = z.enum([
  "verify_identity_chain",
  "verify_hash_chain",
  "verify_source_binding",
  "verify_rule_binding",
  "recompute_source_hash",
  "locate_source_evidence",
  "verify_section_binding",
  "verify_trait_structure",
  "detect_cross_trait_conflicts",
  "classify_support_state",
]);

export const rosetta_binding_schema = z.object({
  genome_bill_id: z.string().uuid(),
  assembly_run_id: z.string().uuid(),
  source_document_id: z.number().int().positive(),
  extraction_run_id: z.string().min(1).max(128),
  trait_id: z.string().uuid(),
  trait_class: rosetta_trait_class_schema,
  trait_key: z.string().min(1).max(512),
  source_object_type: z.string().min(1).max(256),
  source_object_id: z.string().min(1).max(512),
  source_block_id: z.string().min(1).max(512),
  source_span: rosetta_source_span_schema,
  trait_fingerprint: hash_schema,
  trait_content_hash: hash_schema,
  source_trace_hash: hash_schema,
  assembly_input_hash: hash_schema,
  assembly_output_hash: hash_schema,
  rosetta_source_identity_hash: hash_schema,
  rosetta_source_content_hash: hash_schema,
  rosetta_output_content_hash: hash_schema,
  rosetta_rule_manifest_hash: hash_schema,
  rosetta_configuration_hash: hash_schema,
}).strict();

/**
 * Base envelope assembled from Lighthouse-owned persisted identifiers.
 * The Prism client enriches this envelope with the immutable Rosetta source
 * snapshot and the complete peer-trait manifest before transmission.
 */
export const rosetta_binding_request_schema = z.object({
  request_id: z.string().min(1).max(256),
  lighthouse_case_id: z.string().min(1).max(256),
  evidence_document_id: z.string().min(1).max(256),
  evidence_fingerprint: hash_schema,
  source_content_hash: hash_schema,
  claim_assertion_id: z.string().min(1).max(512),
  rule_set_id: z.literal(PRISM_ROSETTA_RULE_SET_ID),
  rule_set_version: z.literal(PRISM_ROSETTA_RULE_SET_VERSION),
  requested_checks: z.array(rosetta_required_check_schema).min(5).max(10),
  originating_lighthouse_commit: z.string().regex(/^[a-f0-9]{7,64}$/i),
  originating_lighthouse_runtime_version: z.string().min(1).max(128),
  evidence_refs: z.array(evidence_reference_schema).max(1),
  subject_type: z.literal("civic_genome_trait"),
  subject_id: z.string().uuid(),
  rosetta_binding: rosetta_binding_schema,
}).strict();

export const rosetta_source_snapshot_schema = z.object({
  source_text: z.string().min(1).max(2_000_000),
  source_url: z.string().url(),
  source_version: z.string().min(1).max(512),
  media_type: z.string().min(1).max(128),
  source_identity_hash: hash_schema,
  source_content_hash: hash_schema,
}).strict();

export const rosetta_peer_trait_schema = z.object({
  trait_id: z.string().uuid(),
  trait_class: rosetta_trait_class_schema,
  trait_key: z.string().min(1).max(512),
  source_object_type: z.string().min(1).max(256),
  source_object_id: z.string().min(1).max(512),
  source_block_id: z.string().min(1).max(512),
  content_hash: hash_schema,
  normalized_value: z.record(z.unknown()),
}).strict();

export const deep_rosetta_binding_request_schema = rosetta_binding_request_schema.extend({
  requested_checks: z.array(rosetta_required_check_schema).length(10),
  source_snapshot: rosetta_source_snapshot_schema,
  trait_payload: z.record(z.unknown()),
  trait_payload_hash: hash_schema,
  peer_traits: z.array(rosetta_peer_trait_schema).min(1).max(4096),
}).strict();

export const verification_request_schema = z.discriminatedUnion("rule_set_id", [
  core_verification_request_schema,
  deep_rosetta_binding_request_schema,
]);

const receipt_fields = {
  verification_receipt_id: z.string().uuid(),
  request_id: z.string().min(1),
  input_hash: hash_schema,
  output_hash: hash_schema,
  status: verification_status_schema,
  supported_findings: z.array(z.record(z.unknown())),
  contradictions: z.array(z.record(z.unknown())),
  missing_evidence: z.array(z.record(z.unknown())),
  unresolved_conditions: z.array(z.record(z.unknown())),
  cited_evidence_identifiers: z.array(z.string()),
  deterministic_replay_key: hash_schema,
  completion_timestamp: z.string().min(1),
  idempotency_reused: z.boolean(),
};

const core_prism_receipt_schema = z.object({
  ...receipt_fields,
  prism_engine_version: z.literal(PRISM_ENGINE_VERSION),
  rule_set_id: z.literal(PRISM_RULE_SET_ID),
  rule_set_version: z.literal(PRISM_RULE_SET_VERSION),
  rule_set_hash: z.literal(PRISM_RULE_SET_HASH),
}).strict();

const rosetta_prism_receipt_schema = z.object({
  ...receipt_fields,
  prism_engine_version: z.literal(PRISM_ROSETTA_ENGINE_VERSION),
  rule_set_id: z.literal(PRISM_ROSETTA_RULE_SET_ID),
  rule_set_version: z.literal(PRISM_ROSETTA_RULE_SET_VERSION),
  rule_set_hash: z.literal(PRISM_ROSETTA_RULE_SET_HASH),
}).strict();

export const prism_receipt_schema = z.discriminatedUnion("rule_set_id", [
  core_prism_receipt_schema,
  rosetta_prism_receipt_schema,
]);

export type VerificationRequest = z.infer<typeof verification_request_schema>;
export type RosettaBindingRequest = z.infer<typeof rosetta_binding_request_schema>;
export type DeepRosettaBindingRequest = z.infer<typeof deep_rosetta_binding_request_schema>;
export type PrismReceipt = z.infer<typeof prism_receipt_schema>;

export function prism_contract_for_request(request: VerificationRequest): {
  engine_version: string;
  rule_set_hash: string;
} {
  if (request.rule_set_id === PRISM_ROSETTA_RULE_SET_ID) {
    return {
      engine_version: PRISM_ROSETTA_ENGINE_VERSION,
      rule_set_hash: PRISM_ROSETTA_RULE_SET_HASH,
    };
  }
  return {
    engine_version: PRISM_ENGINE_VERSION,
    rule_set_hash: PRISM_RULE_SET_HASH,
  };
}

function sort_value(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort_value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = sort_value(record[key]);
      return result;
    }, {});
  }
  return value;
}

export function canonical_json(value: unknown): string {
  return JSON.stringify(sort_value(value));
}

export function sha256_hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sign_prism_request(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${method.toUpperCase()}.${path}.${body}`, "utf8")
    .digest("hex");
}

export function safe_equal(left: string, right: string): boolean {
  const left_buffer = Buffer.from(left, "utf8");
  const right_buffer = Buffer.from(right, "utf8");
  return left_buffer.length === right_buffer.length && timingSafeEqual(left_buffer, right_buffer);
}
