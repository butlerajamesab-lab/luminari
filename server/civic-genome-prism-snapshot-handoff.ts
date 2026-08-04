import { canonicalSerialize, computeCanonicalHash } from "./lib/determinism";
import {
  CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
  CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
  type civic_genome_external_snapshot_v1,
} from "./civic-genome-external-snapshot-contract";
import { sign_prism_request } from "./services/prism-verification-contract";

export const PRISM_CIVIC_GENOME_INTAKE_CONTRACT_ID =
  "prism.civic_genome_snapshot_intake.v1" as const;
export const PRISM_CIVIC_GENOME_INTAKE_CONTRACT_VERSION = "1.0.0" as const;
export const PRISM_CIVIC_GENOME_SOURCE_SCHEMA_ID =
  "https://luminari.org/civic-genome/contracts/external-snapshot.v1.schema.json" as const;
export const PRISM_CIVIC_GENOME_INTAKE_PATH =
  "/api/v1/civic-genome/snapshots/validate" as const;

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const EXPECTED_MAPPING_ERRORS = [
  "prism_instance_mapping_rule_not_declared",
  "source_snapshot_validated_not_persisted",
] as const;
const HEX64 = /^[0-9a-f]{64}$/;

export type prism_civic_genome_snapshot_intake_body_v1 = {
  intake_contract_id: typeof PRISM_CIVIC_GENOME_INTAKE_CONTRACT_ID;
  intake_contract_version: typeof PRISM_CIVIC_GENOME_INTAKE_CONTRACT_VERSION;
  source_schema_id: typeof PRISM_CIVIC_GENOME_SOURCE_SCHEMA_ID;
  source_contract_id: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID;
  source_contract_version: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION;
  snapshot: civic_genome_external_snapshot_v1;
};

export type prism_civic_genome_snapshot_intake_receipt_v1 = {
  intake_contract_id: typeof PRISM_CIVIC_GENOME_INTAKE_CONTRACT_ID;
  intake_contract_version: typeof PRISM_CIVIC_GENOME_INTAKE_CONTRACT_VERSION;
  validation_state: "validated_unbound";
  authenticated: true;
  auth_scheme: "hmac-sha256";
  source_schema_id: typeof PRISM_CIVIC_GENOME_SOURCE_SCHEMA_ID;
  source_contract_id: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID;
  source_contract_version: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION;
  source_snapshot_id: string;
  source_snapshot_hash: string;
  source_export_receipt_id: string;
  source_export_receipt_hash: string;
  source_component_count: number;
  source_completeness_state: string;
  source_native_verification_preserved: true;
  mapping_state: "unresolved";
  mapping_errors: string[];
  correlation_executed: false;
  verification_executed: false;
  persisted: false;
  no_mutation: true;
  intake_receipt_id: string;
  intake_receipt_hash: string;
};

export class PrismCivicGenomeHandoffError extends Error {
  constructor(public readonly error_code: string) {
    super(error_code);
    this.name = "PrismCivicGenomeHandoffError";
  }
}

type record_value = Record<string, unknown>;
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

function fail(code: string): never {
  throw new PrismCivicGenomeHandoffError(code);
}

function record(value: unknown, label: string): record_value {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label}_must_be_object`);
  }
  return value as record_value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label}_must_be_nonempty_string`);
  }
  return value;
}

function hash(value: unknown, label: string): string {
  const candidate = text(value, label);
  if (!HEX64.test(candidate)) fail(`${label}_must_be_sha256`);
  return candidate;
}

function literal<T>(value: unknown, expected: T, label: string): T {
  if (value !== expected) fail(`${label}_mismatch`);
  return expected;
}

function receipt_hash_basis(
  row: Omit<
    prism_civic_genome_snapshot_intake_receipt_v1,
    "intake_receipt_id" | "intake_receipt_hash"
  >,
) {
  return {
    ...row,
    mapping_errors: [...row.mapping_errors].sort(),
  };
}

export function build_prism_civic_genome_snapshot_intake_body_v1(
  snapshot: civic_genome_external_snapshot_v1,
): prism_civic_genome_snapshot_intake_body_v1 {
  return {
    intake_contract_id: PRISM_CIVIC_GENOME_INTAKE_CONTRACT_ID,
    intake_contract_version: PRISM_CIVIC_GENOME_INTAKE_CONTRACT_VERSION,
    source_schema_id: PRISM_CIVIC_GENOME_SOURCE_SCHEMA_ID,
    source_contract_id: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
    source_contract_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
    snapshot,
  };
}

export function assert_prism_civic_genome_snapshot_intake_receipt_v1(
  value: unknown,
  source: civic_genome_external_snapshot_v1,
): prism_civic_genome_snapshot_intake_receipt_v1 {
  const row = record(value, "receipt");
  literal(
    row.intake_contract_id,
    PRISM_CIVIC_GENOME_INTAKE_CONTRACT_ID,
    "intake_contract_id",
  );
  literal(
    row.intake_contract_version,
    PRISM_CIVIC_GENOME_INTAKE_CONTRACT_VERSION,
    "intake_contract_version",
  );
  literal(row.validation_state, "validated_unbound", "validation_state");
  literal(row.authenticated, true, "authenticated");
  literal(row.auth_scheme, "hmac-sha256", "auth_scheme");
  literal(row.source_schema_id, PRISM_CIVIC_GENOME_SOURCE_SCHEMA_ID, "source_schema_id");
  literal(row.source_contract_id, source.contract_id, "source_contract_id");
  literal(row.source_contract_version, source.contract_version, "source_contract_version");
  literal(row.source_snapshot_id, source.snapshot_id, "source_snapshot_id");
  literal(row.source_snapshot_hash, source.snapshot_hash, "source_snapshot_hash");
  literal(
    row.source_export_receipt_id,
    source.export_receipt.export_receipt_id,
    "source_export_receipt_id",
  );
  literal(
    row.source_export_receipt_hash,
    source.export_receipt.export_receipt_hash,
    "source_export_receipt_hash",
  );
  literal(row.source_component_count, source.component_count, "source_component_count");
  literal(row.source_completeness_state, source.completeness_state, "source_completeness_state");
  literal(
    row.source_native_verification_preserved,
    true,
    "source_native_verification_preserved",
  );
  literal(row.mapping_state, "unresolved", "mapping_state");
  if (!Array.isArray(row.mapping_errors)) fail("mapping_errors_must_be_array");
  const mapping_errors = row.mapping_errors.map((entry, index) =>
    text(entry, `mapping_error_${index}`)
  ).sort();
  if (canonicalSerialize(mapping_errors) !== canonicalSerialize([...EXPECTED_MAPPING_ERRORS].sort())) {
    fail("mapping_errors_mismatch");
  }
  literal(row.correlation_executed, false, "correlation_executed");
  literal(row.verification_executed, false, "verification_executed");
  literal(row.persisted, false, "persisted");
  literal(row.no_mutation, true, "no_mutation");

  const basis: Omit<
    prism_civic_genome_snapshot_intake_receipt_v1,
    "intake_receipt_id" | "intake_receipt_hash"
  > = {
    intake_contract_id: PRISM_CIVIC_GENOME_INTAKE_CONTRACT_ID,
    intake_contract_version: PRISM_CIVIC_GENOME_INTAKE_CONTRACT_VERSION,
    validation_state: "validated_unbound",
    authenticated: true,
    auth_scheme: "hmac-sha256",
    source_schema_id: PRISM_CIVIC_GENOME_SOURCE_SCHEMA_ID,
    source_contract_id: source.contract_id,
    source_contract_version: source.contract_version,
    source_snapshot_id: source.snapshot_id,
    source_snapshot_hash: source.snapshot_hash,
    source_export_receipt_id: source.export_receipt.export_receipt_id,
    source_export_receipt_hash: source.export_receipt.export_receipt_hash,
    source_component_count: source.component_count,
    source_completeness_state: source.completeness_state,
    source_native_verification_preserved: true,
    mapping_state: "unresolved",
    mapping_errors,
    correlation_executed: false,
    verification_executed: false,
    persisted: false,
    no_mutation: true,
  };
  const expected_hash = computeCanonicalHash(receipt_hash_basis(basis));
  if (hash(row.intake_receipt_hash, "intake_receipt_hash") !== expected_hash) {
    fail("intake_receipt_hash_mismatch");
  }
  const expected_id = `pcg-intake-${expected_hash.slice(0, 32)}`;
  if (row.intake_receipt_id !== expected_id) fail("intake_receipt_id_mismatch");

  return {
    ...basis,
    intake_receipt_id: expected_id,
    intake_receipt_hash: expected_hash,
  };
}

export async function deliver_civic_genome_snapshot_to_prism_v1(options: {
  snapshot: civic_genome_external_snapshot_v1;
  base_url?: string;
  secret?: string;
  timeout_ms?: number;
  fetcher?: fetch_impl;
}): Promise<prism_civic_genome_snapshot_intake_receipt_v1> {
  const secret = options.secret ?? process.env.PRISM_BRIDGE_SECRET;
  if (!secret) fail("bridge_secret_unconfigured");
  const base_url = options.base_url
    ?? process.env.PRISM_BASE_URL
    ?? "https://prism-14wm.onrender.com";
  const target = new URL(PRISM_CIVIC_GENOME_INTAKE_PATH, base_url);
  if (target.protocol !== "https:") fail("https_target_required");
  if (target.pathname !== PRISM_CIVIC_GENOME_INTAKE_PATH) fail("target_path_mismatch");

  const intake = build_prism_civic_genome_snapshot_intake_body_v1(options.snapshot);
  const body = canonicalSerialize(intake);
  if (Buffer.byteLength(body, "utf8") > MAX_SNAPSHOT_BYTES) {
    fail("snapshot_payload_too_large");
  }
  const timestamp = Date.now().toString();
  const fetcher = options.fetcher ?? fetch as unknown as fetch_impl;
  const response = await fetcher(target.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-prism-client": "lighthouse",
      "x-prism-timestamp": timestamp,
      "x-prism-signature": sign_prism_request(
        secret,
        timestamp,
        "POST",
        PRISM_CIVIC_GENOME_INTAKE_PATH,
        body,
      ),
    },
    body,
    signal: AbortSignal.timeout(options.timeout_ms ?? 20_000),
  });
  const response_text = await response.text();
  if (!response.ok) {
    fail(`receiver_http_${response.status}:${response_text.slice(0, 256)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response_text);
  } catch {
    fail("receiver_response_not_json");
  }
  return assert_prism_civic_genome_snapshot_intake_receipt_v1(
    parsed,
    options.snapshot,
  );
}
