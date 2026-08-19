import { createHmac } from "node:crypto";
import { canonicalSerialize, computeCanonicalHash } from "./lib/determinism";
import {
  CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
  CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
  type civic_genome_external_snapshot_v1,
} from "./civic-genome-external-snapshot-contract";

export const CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_ID =
  "kaleidoscope.civic_genome_snapshot_delivery.v1" as const;
export const CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_VERSION = "1.1.0" as const;
export const CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_ID =
  "kaleidoscope.civic_genome_verification_mapping" as const;
export const CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_VERSION = "1.0.0" as const;
export const CIVIC_GENOME_KALEIDOSCOPE_SOURCE_SCHEMA_ID =
  "https://luminari.org/civic-genome/contracts/external-snapshot.v1.schema.json" as const;
export const CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH =
  "/v1/civic-genome/snapshots/validate" as const;
export const CIVIC_GENOME_KALEIDOSCOPE_AUTH_SCHEME = "hmac-sha256" as const;

const HEX64 = /^[0-9a-f]{64}$/;
const ALLOWED_UNBOUND_ERRORS = new Set([
  "source_snapshot_not_bounded_complete",
  "source_snapshot_has_unresolved_conditions",
]);

export type civic_genome_kaleidoscope_delivery_body_v1 = {
  delivery_contract_id: typeof CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_ID;
  delivery_contract_version: typeof CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_VERSION;
  source_schema_id: typeof CIVIC_GENOME_KALEIDOSCOPE_SOURCE_SCHEMA_ID;
  source_contract_id: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID;
  source_contract_version: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION;
  snapshot: civic_genome_external_snapshot_v1;
};

export type civic_genome_kaleidoscope_delivery_receipt_v1 = {
  delivery_contract_id: typeof CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_ID;
  delivery_contract_version: typeof CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_VERSION;
  validation_state: "validated_bound" | "validated_unbound";
  authenticated: true;
  auth_scheme: typeof CIVIC_GENOME_KALEIDOSCOPE_AUTH_SCHEME;
  key_id: string;
  source_schema_id: typeof CIVIC_GENOME_KALEIDOSCOPE_SOURCE_SCHEMA_ID;
  source_contract_id: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID;
  source_contract_version: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION;
  source_snapshot_id: string;
  source_snapshot_hash: string;
  source_export_receipt_id: string;
  source_export_receipt_hash: string;
  source_component_count: number;
  source_completeness_state: string;
  binding_id: string;
  binding_hash: string;
  binding_state: "accepted" | "unresolved";
  binding_errors: string[];
  verification_mapping_state: "mapped_by_declared_rule";
  verification_mapping_rule_id: typeof CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_ID;
  verification_mapping_rule_version: typeof CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_VERSION;
  persisted: false;
  projection_executed: false;
  no_mutation: true;
  delivery_receipt_id: string;
  delivery_receipt_hash: string;
};

type fetch_response = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

type fetch_impl = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<fetch_response>;

function fail(message: string): never {
  throw new Error(`civic_genome_kaleidoscope_handoff: ${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label}_must_be_object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label}_must_be_string`);
  return value;
}

function hex64(value: unknown, label: string): string {
  const candidate = text(value, label);
  if (!HEX64.test(candidate)) fail(`${label}_must_be_sha256`);
  return candidate;
}

function boolean_literal<T extends boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) fail(`${label}_mismatch`);
  return expected;
}

function delivery_signature_basis(
  body: civic_genome_kaleidoscope_delivery_body_v1,
  key_id: string,
) {
  return {
    delivery_contract_id: CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_ID,
    delivery_contract_version: CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_VERSION,
    method: "POST",
    path: CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH,
    key_id,
    source_schema_id: body.source_schema_id,
    source_contract_id: body.source_contract_id,
    source_contract_version: body.source_contract_version,
    snapshot: body.snapshot,
  };
}

export function build_civic_genome_kaleidoscope_delivery_body_v1(
  snapshot: civic_genome_external_snapshot_v1,
): civic_genome_kaleidoscope_delivery_body_v1 {
  return {
    delivery_contract_id: CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_ID,
    delivery_contract_version: CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_VERSION,
    source_schema_id: CIVIC_GENOME_KALEIDOSCOPE_SOURCE_SCHEMA_ID,
    source_contract_id: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
    source_contract_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
    snapshot,
  };
}

export function sign_civic_genome_kaleidoscope_delivery_v1(
  body: civic_genome_kaleidoscope_delivery_body_v1,
  key_id: string,
  secret: string,
): string {
  if (!key_id.trim()) fail("key_id_required");
  if (Buffer.byteLength(secret, "utf8") < 32) fail("secret_too_short");
  return createHmac("sha256", secret)
    .update(canonicalSerialize(delivery_signature_basis(body, key_id)), "utf8")
    .digest("hex");
}

function delivery_receipt_hash_basis(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return {
    delivery_contract_id: row.delivery_contract_id,
    delivery_contract_version: row.delivery_contract_version,
    validation_state: row.validation_state,
    authenticated: row.authenticated,
    auth_scheme: row.auth_scheme,
    key_id: row.key_id,
    source_schema_id: row.source_schema_id,
    source_contract_id: row.source_contract_id,
    source_contract_version: row.source_contract_version,
    source_snapshot_id: row.source_snapshot_id,
    source_snapshot_hash: row.source_snapshot_hash,
    source_export_receipt_id: row.source_export_receipt_id,
    source_export_receipt_hash: row.source_export_receipt_hash,
    source_component_count: row.source_component_count,
    source_completeness_state: row.source_completeness_state,
    binding_id: row.binding_id,
    binding_hash: row.binding_hash,
    binding_state: row.binding_state,
    binding_errors: [...(Array.isArray(row.binding_errors) ? row.binding_errors : [])].sort(),
    verification_mapping_state: row.verification_mapping_state,
    verification_mapping_rule_id: row.verification_mapping_rule_id,
    verification_mapping_rule_version: row.verification_mapping_rule_version,
    persisted: row.persisted,
    projection_executed: row.projection_executed,
    no_mutation: row.no_mutation,
  };
}

function assert_binding_state(row: Record<string, unknown>, binding_errors: string[]): void {
  if (row.verification_mapping_state !== "mapped_by_declared_rule") {
    fail("verification_mapping_state_mismatch");
  }
  if (row.verification_mapping_rule_id !== CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_ID) {
    fail("verification_mapping_rule_id_mismatch");
  }
  if (row.verification_mapping_rule_version
      !== CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_VERSION) {
    fail("verification_mapping_rule_version_mismatch");
  }

  if (row.validation_state === "validated_bound") {
    if (row.binding_state !== "accepted") fail("validated_bound_requires_accepted_binding");
    if (binding_errors.length !== 0) fail("accepted_binding_cannot_have_errors");
    return;
  }
  if (row.validation_state !== "validated_unbound") fail("validation_state_mismatch");
  if (row.binding_state !== "unresolved") fail("validated_unbound_requires_unresolved_binding");
  if (binding_errors.length === 0) fail("unresolved_binding_requires_errors");
  for (const error of binding_errors) {
    if (!ALLOWED_UNBOUND_ERRORS.has(error)) fail(`unexpected_binding_error:${error}`);
  }
}

export function assert_civic_genome_kaleidoscope_delivery_receipt_v1(
  value: unknown,
  source: civic_genome_external_snapshot_v1,
  key_id: string,
): civic_genome_kaleidoscope_delivery_receipt_v1 {
  const row = record(value, "receipt");
  if (row.delivery_contract_id !== CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_ID) {
    fail("delivery_contract_id_mismatch");
  }
  if (row.delivery_contract_version !== CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_VERSION) {
    fail("delivery_contract_version_mismatch");
  }
  boolean_literal(row.authenticated, true, "authenticated");
  if (row.auth_scheme !== CIVIC_GENOME_KALEIDOSCOPE_AUTH_SCHEME) fail("auth_scheme_mismatch");
  if (row.key_id !== key_id) fail("key_id_mismatch");
  if (row.source_schema_id !== CIVIC_GENOME_KALEIDOSCOPE_SOURCE_SCHEMA_ID) {
    fail("source_schema_id_mismatch");
  }
  if (row.source_contract_id !== source.contract_id
      || row.source_contract_version !== source.contract_version) {
    fail("source_contract_mismatch");
  }
  if (row.source_snapshot_id !== source.snapshot_id) fail("source_snapshot_id_mismatch");
  if (row.source_snapshot_hash !== source.snapshot_hash) fail("source_snapshot_hash_mismatch");
  if (row.source_export_receipt_id !== source.export_receipt.export_receipt_id) {
    fail("source_export_receipt_id_mismatch");
  }
  if (row.source_export_receipt_hash !== source.export_receipt.export_receipt_hash) {
    fail("source_export_receipt_hash_mismatch");
  }
  if (row.source_component_count !== source.component_count) fail("source_component_count_mismatch");
  if (row.source_completeness_state !== source.completeness_state) {
    fail("source_completeness_state_mismatch");
  }
  const binding_errors = Array.isArray(row.binding_errors)
    ? row.binding_errors.map((entry, index) => text(entry, `binding_errors_${index}`)).sort()
    : fail("binding_errors_must_be_array");
  assert_binding_state(row, binding_errors);
  boolean_literal(row.persisted, false, "persisted");
  boolean_literal(row.projection_executed, false, "projection_executed");
  boolean_literal(row.no_mutation, true, "no_mutation");
  hex64(row.binding_hash, "binding_hash");

  const observed_receipt_hash = hex64(row.delivery_receipt_hash, "delivery_receipt_hash");
  const expected_receipt_hash = computeCanonicalHash(delivery_receipt_hash_basis(row));
  if (observed_receipt_hash !== expected_receipt_hash) fail("delivery_receipt_hash_mismatch");
  const expected_receipt_id = `kcg-delivery-${expected_receipt_hash.slice(0, 32)}`;
  if (row.delivery_receipt_id !== expected_receipt_id) fail("delivery_receipt_id_mismatch");

  return {
    ...row,
    key_id,
    binding_errors,
  } as civic_genome_kaleidoscope_delivery_receipt_v1;
}

export async function deliver_civic_genome_snapshot_to_kaleidoscope_v1(options: {
  snapshot: civic_genome_external_snapshot_v1;
  url: string;
  key_id: string;
  secret: string;
  timeout_ms?: number;
  fetcher?: fetch_impl;
}): Promise<civic_genome_kaleidoscope_delivery_receipt_v1> {
  const target = new URL(options.url);
  if (target.protocol !== "https:") fail("https_target_required");
  if (target.pathname !== CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH) {
    fail("delivery_path_mismatch");
  }
  const body = build_civic_genome_kaleidoscope_delivery_body_v1(options.snapshot);
  const signature = sign_civic_genome_kaleidoscope_delivery_v1(
    body,
    options.key_id,
    options.secret,
  );
  const fetcher = options.fetcher ?? fetch as unknown as fetch_impl;
  const response = await fetcher(target.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-kaleidoscope-key-id": options.key_id,
      "x-kaleidoscope-signature": signature,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeout_ms ?? 20_000),
  });
  const response_text = await response.text();
  if (!response.ok) {
    fail(`receiver_http_${response.status}:${response_text.slice(0, 500)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response_text);
  } catch {
    fail("receiver_response_not_json");
  }
  return assert_civic_genome_kaleidoscope_delivery_receipt_v1(
    parsed,
    options.snapshot,
    options.key_id,
  );
}