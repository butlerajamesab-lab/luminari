import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

export const PRISM_ENGINE_VERSION = "1.0.0";
export const PRISM_RULE_SET_ID = "prism-core-assertion";
export const PRISM_RULE_SET_VERSION = "1.0.0";
export const PRISM_RULE_SET_HASH = "298eaf14df23f17c07dbc253fb6a2abe2f55ac9425942a46ab08f6bdd05401b0";

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
  evidence_fingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  source_content_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  relationship: z.enum(["supports", "contradicts", "neutral"]),
  independent_source_id: z.string().min(1).max(256).optional(),
}).strict();

export const verification_request_schema = z.object({
  request_id: z.string().min(1).max(256),
  lighthouse_case_id: z.string().min(1).max(256),
  evidence_document_id: z.string().min(1).max(256),
  evidence_fingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  source_content_hash: z.string().regex(/^[a-f0-9]{64}$/i),
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

export const prism_receipt_schema = z.object({
  verification_receipt_id: z.string().uuid(),
  request_id: z.string().min(1),
  prism_engine_version: z.literal(PRISM_ENGINE_VERSION),
  rule_set_id: z.literal(PRISM_RULE_SET_ID),
  rule_set_version: z.literal(PRISM_RULE_SET_VERSION),
  rule_set_hash: z.literal(PRISM_RULE_SET_HASH),
  input_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  output_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  status: verification_status_schema,
  supported_findings: z.array(z.record(z.unknown())),
  contradictions: z.array(z.record(z.unknown())),
  missing_evidence: z.array(z.record(z.unknown())),
  unresolved_conditions: z.array(z.record(z.unknown())),
  cited_evidence_identifiers: z.array(z.string()),
  deterministic_replay_key: z.string().regex(/^[a-f0-9]{64}$/i),
  completion_timestamp: z.string().min(1),
  idempotency_reused: z.boolean(),
}).strict();

export type VerificationRequest = z.infer<typeof verification_request_schema>;
export type PrismReceipt = z.infer<typeof prism_receipt_schema>;

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
