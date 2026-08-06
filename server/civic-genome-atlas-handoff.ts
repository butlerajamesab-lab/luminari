import { createHmac } from "node:crypto";
import { canonicalSerialize, computeCanonicalHash } from "./lib/determinism";
import type { civic_genome_external_snapshot_v1 } from "./civic-genome-external-snapshot-contract";

export const CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_ID = "atlas.civic_genome_snapshot_delivery.v1";
export const CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_VERSION = "1.0.0";
export const CIVIC_GENOME_ATLAS_DELIVERY_PATH = "/v1/civic-genome/snapshots";
export const CIVIC_GENOME_ATLAS_SOURCE_SCHEMA_ID = "https://luminari.org/civic-genome/contracts/external-snapshot.v1.schema.json";
export const CIVIC_GENOME_ATLAS_AUTH_SCHEME = "hmac-sha256";

export type civic_genome_atlas_delivery_body_v1 = {
  delivery_contract_id: typeof CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_ID;
  delivery_contract_version: typeof CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_VERSION;
  source_schema_id: typeof CIVIC_GENOME_ATLAS_SOURCE_SCHEMA_ID;
  source_contract_id: string;
  source_contract_version: string;
  snapshot: civic_genome_external_snapshot_v1;
};

export type civic_genome_atlas_delivery_receipt_v1 = {
  delivery_contract_id: string;
  delivery_contract_version: string;
  validation_state: string;
  authenticated: boolean;
  auth_scheme: string;
  key_id: string;
  source_schema_id: string;
  source_contract_id: string;
  source_contract_version: string;
  source_snapshot_id: string;
  source_snapshot_hash: string;
  source_export_receipt_id: string;
  source_export_receipt_hash: string;
  source_component_count: number;
  source_completeness_state: string;
  atlas_binding_hash: string;
  verification_mapping_state: string;
  persistence_requested: boolean;
  projection_executed: boolean;
  no_mutation: boolean;
  delivery_receipt_id: string;
  delivery_receipt_hash: string;
  persistence_status: string | null;
  persisted: boolean;
};

export function build_civic_genome_atlas_delivery_body_v1(
  snapshot: civic_genome_external_snapshot_v1,
): civic_genome_atlas_delivery_body_v1 {
  return {
    delivery_contract_id: CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_ID,
    delivery_contract_version: CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_VERSION,
    source_schema_id: CIVIC_GENOME_ATLAS_SOURCE_SCHEMA_ID,
    source_contract_id: snapshot.contract_id,
    source_contract_version: snapshot.contract_version,
    snapshot,
  };
}

function signature_basis(body: civic_genome_atlas_delivery_body_v1, key_id: string) {
  return {
    delivery_contract_id: CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_ID,
    delivery_contract_version: CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_VERSION,
    method: "POST",
    path: CIVIC_GENOME_ATLAS_DELIVERY_PATH,
    key_id,
    source_schema_id: body.source_schema_id,
    source_contract_id: body.source_contract_id,
    source_contract_version: body.source_contract_version,
    snapshot: body.snapshot,
  };
}

export function sign_civic_genome_atlas_delivery_v1(
  body: civic_genome_atlas_delivery_body_v1,
  key_id: string,
  secret: string,
): string {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("civic_genome_atlas_handoff_secret_too_short");
  }
  return createHmac("sha256", secret)
    .update(canonicalSerialize(signature_basis(body, key_id)), "utf8")
    .digest("hex");
}

function validate_receipt(
  receipt: civic_genome_atlas_delivery_receipt_v1,
  snapshot: civic_genome_external_snapshot_v1,
  key_id: string,
): void {
  if (receipt.delivery_contract_id !== CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_ID
    || receipt.delivery_contract_version !== CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_VERSION) {
    throw new Error("civic_genome_atlas_handoff_receipt_contract_mismatch");
  }
  if (receipt.validation_state !== "validated_source_native"
    || receipt.authenticated !== true
    || receipt.auth_scheme !== CIVIC_GENOME_ATLAS_AUTH_SCHEME
    || receipt.key_id !== key_id) {
    throw new Error("civic_genome_atlas_handoff_receiver_validation_mismatch");
  }
  if (receipt.source_snapshot_id !== snapshot.snapshot_id
    || receipt.source_snapshot_hash !== snapshot.snapshot_hash
    || receipt.source_export_receipt_id !== snapshot.export_receipt.export_receipt_id
    || receipt.source_export_receipt_hash !== snapshot.export_receipt.export_receipt_hash
    || receipt.source_component_count !== snapshot.component_count
    || receipt.source_completeness_state !== snapshot.completeness_state) {
    throw new Error("civic_genome_atlas_handoff_source_identity_mismatch");
  }
  if (!/^[0-9a-f]{64}$/.test(receipt.atlas_binding_hash)
    || !/^[0-9a-f]{64}$/.test(receipt.delivery_receipt_hash)) {
    throw new Error("civic_genome_atlas_handoff_receipt_hash_invalid");
  }
  if (receipt.verification_mapping_state !== "source_native_preserved_unmapped"
    || receipt.persistence_requested !== true
    || receipt.persisted !== true
    || !["inserted", "idempotent"].includes(receipt.persistence_status ?? "")
    || receipt.projection_executed !== false
    || receipt.no_mutation !== true) {
    throw new Error("civic_genome_atlas_handoff_boundary_mismatch");
  }
  const basis = {
    delivery_contract_id: receipt.delivery_contract_id,
    delivery_contract_version: receipt.delivery_contract_version,
    validation_state: receipt.validation_state,
    authenticated: receipt.authenticated,
    auth_scheme: receipt.auth_scheme,
    key_id: receipt.key_id,
    source_schema_id: receipt.source_schema_id,
    source_contract_id: receipt.source_contract_id,
    source_contract_version: receipt.source_contract_version,
    source_snapshot_id: receipt.source_snapshot_id,
    source_snapshot_hash: receipt.source_snapshot_hash,
    source_export_receipt_id: receipt.source_export_receipt_id,
    source_export_receipt_hash: receipt.source_export_receipt_hash,
    source_component_count: receipt.source_component_count,
    source_completeness_state: receipt.source_completeness_state,
    atlas_binding_hash: receipt.atlas_binding_hash,
    verification_mapping_state: receipt.verification_mapping_state,
    persistence_requested: receipt.persistence_requested,
    projection_executed: receipt.projection_executed,
    no_mutation: receipt.no_mutation,
  };
  const expected_hash = computeCanonicalHash(basis);
  if (receipt.delivery_receipt_hash !== expected_hash
    || receipt.delivery_receipt_id !== `acg-delivery-${expected_hash.slice(0, 32)}`) {
    throw new Error("civic_genome_atlas_handoff_receipt_identity_mismatch");
  }
}

export async function deliver_civic_genome_snapshot_to_atlas_v1(input: {
  snapshot: civic_genome_external_snapshot_v1;
  url: string;
  key_id: string;
  secret: string;
  fetcher?: typeof fetch;
}): Promise<civic_genome_atlas_delivery_receipt_v1> {
  const body = build_civic_genome_atlas_delivery_body_v1(input.snapshot);
  const signature = sign_civic_genome_atlas_delivery_v1(body, input.key_id, input.secret);
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(input.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-atlas-civic-genome-key-id": input.key_id,
      "x-atlas-civic-genome-signature": signature,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`civic_genome_atlas_handoff_http_${response.status}:${text.slice(0, 1000)}`);
  }
  let receipt: civic_genome_atlas_delivery_receipt_v1;
  try { receipt = JSON.parse(text) as civic_genome_atlas_delivery_receipt_v1; }
  catch { throw new Error("civic_genome_atlas_handoff_invalid_json_receipt"); }
  validate_receipt(receipt, input.snapshot, input.key_id);
  return receipt;
}
