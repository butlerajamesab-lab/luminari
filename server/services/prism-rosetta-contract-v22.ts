import { z } from "zod";
import {
  canonical_json,
  deep_rosetta_binding_request_schema as base_deep_rosetta_binding_request_schema,
  rosetta_binding_request_schema as base_rosetta_binding_request_schema,
  sha256_hex,
  sign_prism_request,
} from "./prism-verification-contract";

export const PRISM_ROSETTA_ENGINE_VERSION = "2.2.0";
export const PRISM_ROSETTA_RULE_SET_ID = "prism-rosetta-structural-binding";
export const PRISM_ROSETTA_RULE_SET_VERSION = "2.2.0";
export const PRISM_ROSETTA_RULE_SET_HASH =
  "16cbe6d89170a5e21efab3cdbac25c7ef01cea7a482f2e9b701967adf6cf1b00";

const hash_schema = z.string().regex(/^[a-f0-9]{64}$/i);
const verification_status_schema = z.enum([
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

export const rosetta_binding_request_schema = base_rosetta_binding_request_schema
  .omit({ rule_set_version: true })
  .extend({
    rule_set_version: z.literal(PRISM_ROSETTA_RULE_SET_VERSION),
  })
  .strict();

export const deep_rosetta_binding_request_schema =
  base_deep_rosetta_binding_request_schema
    .omit({ rule_set_version: true })
    .extend({
      rule_set_version: z.literal(PRISM_ROSETTA_RULE_SET_VERSION),
    })
    .strict();

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

export { canonical_json, sha256_hex, sign_prism_request };

export type RosettaBindingRequest = z.infer<typeof rosetta_binding_request_schema>;
export type DeepRosettaBindingRequest = z.infer<typeof deep_rosetta_binding_request_schema>;
export type PrismReceipt = z.infer<typeof prism_receipt_schema>;

export function rosetta_semantic_request_payload(
  request: DeepRosettaBindingRequest,
): Omit<
  DeepRosettaBindingRequest,
  "originating_lighthouse_commit" | "originating_lighthouse_runtime_version"
> {
  const {
    originating_lighthouse_commit: _commit,
    originating_lighthouse_runtime_version: _runtime,
    ...semantic_request
  } = request;
  return semantic_request;
}
