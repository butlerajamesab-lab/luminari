import { z } from "zod";
import {
  canonical_json,
  evidence_reference_schema,
  sha256_hex,
  sign_prism_request,
  verification_status_schema,
} from "./prism-verification-contract";

export const PRISM_ROSETTA_ENGINE_VERSION = "1.1.1";
export const PRISM_ROSETTA_RULE_SET_ID = "prism-rosetta-structural-binding";
export const PRISM_ROSETTA_RULE_SET_VERSION = "1.0.1";
export const PRISM_ROSETTA_RULE_SET_HASH =
  "4ca3bd0361bb0056496c88f201e4cc692b2d2cd3f189567949dc937f7ef058b7";

const hash_schema = z.string().regex(/^[a-f0-9]{64}$/i);

const source_span_schema = z.object({
  char_offset_start: z.number().int().nonnegative(),
  char_offset_end: z.number().int().positive(),
  block_content_hash: hash_schema,
}).strict().refine(
  (value) => value.char_offset_end > value.char_offset_start,
  { message: "source_span_end_must_follow_start" },
);

export const rosetta_binding_schema = z.object({
  genome_bill_id: z.string().uuid(),
  assembly_run_id: z.string().uuid(),
  source_document_id: z.number().int().positive(),
  extraction_run_id: z.string().min(1).max(128),
  trait_id: z.string().uuid(),
  trait_class: z.enum([
    "help",
    "workflow",
    "accountability",
    "override",
    "definition",
  ]),
  trait_key: z.string().min(1).max(512),
  source_object_type: z.string().min(1).max(256),
  source_object_id: z.string().min(1).max(512),
  source_block_id: z.string().min(1).max(512),
  source_span: source_span_schema,
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

export const rosetta_binding_request_schema = z.object({
  request_id: z.string().min(1).max(256),
  lighthouse_case_id: z.string().min(1).max(256),
  evidence_document_id: z.string().min(1).max(256),
  evidence_fingerprint: hash_schema,
  source_content_hash: hash_schema,
  claim_assertion_id: z.string().min(1).max(512),
  rule_set_id: z.literal(PRISM_ROSETTA_RULE_SET_ID),
  rule_set_version: z.literal(PRISM_ROSETTA_RULE_SET_VERSION),
  requested_checks: z.tuple([
    z.literal("verify_identity_chain"),
    z.literal("verify_hash_chain"),
    z.literal("verify_source_binding"),
    z.literal("verify_rule_binding"),
    z.literal("classify_support_state"),
  ]),
  originating_lighthouse_commit: z.string().regex(/^[a-f0-9]{7,64}$/i),
  originating_lighthouse_runtime_version: z.string().min(1).max(128),
  evidence_refs: z.array(evidence_reference_schema).max(1),
  subject_type: z.literal("civic_genome_trait"),
  subject_id: z.string().uuid(),
  rosetta_binding: rosetta_binding_schema,
}).strict();

export type RosettaBindingRequest = z.infer<typeof rosetta_binding_request_schema>;

export function rosetta_semantic_request_payload(
  request: RosettaBindingRequest,
): Omit<
  RosettaBindingRequest,
  "originating_lighthouse_commit" | "originating_lighthouse_runtime_version"
> {
  const {
    originating_lighthouse_commit: _commit,
    originating_lighthouse_runtime_version: _runtime,
    ...semantic_request
  } = request;
  return semantic_request;
}

export const prism_receipt_schema = z.object({
  verification_receipt_id: z.string().uuid(),
  request_id: z.string().min(1),
  prism_engine_version: z.literal(PRISM_ROSETTA_ENGINE_VERSION),
  rule_set_id: z.literal(PRISM_ROSETTA_RULE_SET_ID),
  rule_set_version: z.literal(PRISM_ROSETTA_RULE_SET_VERSION),
  rule_set_hash: z.literal(PRISM_ROSETTA_RULE_SET_HASH),
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
}).strict();

export type PrismReceipt = z.infer<typeof prism_receipt_schema>;

export {
  canonical_json,
  sha256_hex,
  sign_prism_request,
};
