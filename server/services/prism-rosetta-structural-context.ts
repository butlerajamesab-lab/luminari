import { query_with_diagnostics } from "../db";
import { create_rosetta_supabase_headers } from "../rosetta-supabase-auth";
import {
  canonical_json,
  deep_rosetta_binding_request_schema,
  sha256_hex,
  type DeepRosettaBindingRequest,
  type RosettaBindingRequest,
} from "./prism-verification-contract";

const ROSETTA_SOURCE_TIMEOUT_MS = 8_000;
const DEEP_VERIFICATION_CHECKS = [
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
] as const;

type RosettaSourceSnapshotRow = {
  source_text: string;
  source_url: string;
  source_version: string;
  media_type: string;
  source_identity_hash: string;
  source_content_hash: string;
};

type PeerTraitRow = {
  trait_id: string;
  trait_class: "help" | "workflow" | "accountability" | "override" | "definition";
  trait_key: string;
  source_object_type: string;
  source_object_id: string;
  source_block_id: string;
  content_hash: string;
  normalized_value_json: unknown;
};

type RosettaDocumentContextRow = {
  document_family: string;
  adopted: boolean | null;
};

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value.replace(/\/$/, "");
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function load_rosetta_source_snapshot(
  request: RosettaBindingRequest,
): Promise<RosettaSourceSnapshotRow> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const query = new URLSearchParams({
    select: "source_text,source_url,source_version,media_type,source_identity_hash,source_content_hash",
    source_document_id: `eq.${request.rosetta_binding.source_document_id}`,
    source_content_hash: `eq.${request.rosetta_binding.rosetta_source_content_hash.toLowerCase()}`,
    order: "created_at.desc",
    limit: "1",
  });
  const url = `${base_url}/rest/v1/source_document_content?${query.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_SOURCE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: create_rosetta_supabase_headers(service_role_key, {
        accept: "application/json",
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`prism_rosetta_source_snapshot_timeout:${ROSETTA_SOURCE_TIMEOUT_MS}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const preview = (await response.text()).slice(0, 500);
    throw new Error(`prism_rosetta_source_snapshot_failed:${response.status}:${preview}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error("prism_rosetta_source_snapshot_not_found");
  }
  const row = payload[0];
  if (!is_record(row)) throw new Error("prism_rosetta_source_snapshot_invalid");
  const required = [
    "source_text",
    "source_url",
    "source_version",
    "media_type",
    "source_identity_hash",
    "source_content_hash",
  ] as const;
  for (const key of required) {
    if (typeof row[key] !== "string" || row[key].length === 0) {
      throw new Error(`prism_rosetta_source_snapshot_missing:${key}`);
    }
  }
  const snapshot = row as RosettaSourceSnapshotRow;
  const computed_hash = sha256_hex(snapshot.source_text);
  if (computed_hash !== snapshot.source_content_hash.toLowerCase()) {
    throw new Error("prism_rosetta_source_snapshot_hash_mismatch");
  }
  if (
    snapshot.source_content_hash.toLowerCase()
      !== request.rosetta_binding.rosetta_source_content_hash.toLowerCase()
  ) {
    throw new Error("prism_rosetta_source_snapshot_binding_hash_mismatch");
  }
  if (
    snapshot.source_identity_hash.toLowerCase()
      !== request.rosetta_binding.rosetta_source_identity_hash.toLowerCase()
  ) {
    throw new Error("prism_rosetta_source_snapshot_identity_mismatch");
  }
  return snapshot;
}

async function load_peer_traits(
  request: RosettaBindingRequest,
): Promise<PeerTraitRow[]> {
  const result = await query_with_diagnostics<PeerTraitRow>(
    `select trait_id::text, trait_class, trait_key,
            source_object_type, source_object_id, source_block_id,
            content_hash, normalized_value_json
       from public.civic_genome_trait
      where genome_bill_id = $1::uuid
        and source_document_id = $2
        and extraction_run_id = $3
      order by trait_class, trait_key, trait_id`,
    [
      request.rosetta_binding.genome_bill_id,
      request.rosetta_binding.source_document_id,
      request.rosetta_binding.extraction_run_id,
    ],
    {
      label: "prism_rosetta_load_structural_peer_traits",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
  if (result.rows.length === 0) {
    throw new Error("prism_rosetta_structural_peer_traits_missing");
  }
  for (const row of result.rows) {
    if (!row.source_block_id || !is_record(row.normalized_value_json)) {
      throw new Error(`prism_rosetta_structural_peer_trait_invalid:${row.trait_id}`);
    }
  }
  return result.rows;
}

async function load_document_context(
  request: RosettaBindingRequest,
): Promise<RosettaDocumentContextRow> {
  const result = await query_with_diagnostics<RosettaDocumentContextRow>(
    `select version.document_family, document.adopted
       from public.civic_genome_bill_version version
       join public.docket_bill_source_document document
         on document.source_document_key = version.source_document_key
      where version.genome_bill_id = $1::uuid
        and version.assembly_run_id = $2::uuid
        and version.rosetta_source_document_id = $3
        and version.rosetta_extraction_run_id = $4
      limit 2`,
    [
      request.rosetta_binding.genome_bill_id,
      request.rosetta_binding.assembly_run_id,
      request.rosetta_binding.source_document_id,
      request.rosetta_binding.extraction_run_id,
    ],
    {
      label: "prism_rosetta_load_document_context",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
  if (result.rows.length !== 1) {
    throw new Error("prism_rosetta_document_context_not_unique");
  }
  const row = result.rows[0];
  if (!row.document_family ||
      (row.adopted !== null && typeof row.adopted !== "boolean")) {
    throw new Error("prism_rosetta_document_context_invalid");
  }
  return row;
}

export async function enrich_rosetta_binding_request(
  request: RosettaBindingRequest,
): Promise<DeepRosettaBindingRequest> {
  const [source_snapshot, peer_rows, document_context] = await Promise.all([
    load_rosetta_source_snapshot(request),
    load_peer_traits(request),
    load_document_context(request),
  ]);
  const current = peer_rows.find((row) => row.trait_id === request.subject_id);
  if (!current || !is_record(current.normalized_value_json)) {
    throw new Error("prism_rosetta_current_trait_payload_missing");
  }
  if (current.source_object_id !== request.rosetta_binding.source_object_id) {
    throw new Error("prism_rosetta_current_trait_object_mismatch");
  }
  const trait_payload = current.normalized_value_json;
  return deep_rosetta_binding_request_schema.parse({
    ...request,
    requested_checks: DEEP_VERIFICATION_CHECKS,
    source_snapshot,
    document_context,
    trait_payload,
    trait_payload_hash: sha256_hex(canonical_json(trait_payload)),
    peer_traits: peer_rows.map((row) => ({
      trait_id: row.trait_id,
      trait_class: row.trait_class,
      trait_key: row.trait_key,
      source_object_type: row.source_object_type,
      source_object_id: row.source_object_id,
      source_block_id: row.source_block_id,
      content_hash: row.content_hash,
      normalized_value: row.normalized_value_json,
    })),
  });
}
