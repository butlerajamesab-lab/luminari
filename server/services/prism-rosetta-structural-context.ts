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
const ASSEMBLY_CONTEXT_CACHE_TTL_MS = 5 * 60_000;
const ASSEMBLY_CONTEXT_CACHE_MAX_ENTRIES = 16;
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

type RosettaAssemblyVerificationContext = {
  source_snapshot: RosettaSourceSnapshotRow;
  peer_rows: PeerTraitRow[];
  document_context: RosettaDocumentContextRow;
};

type AssemblyContextCacheEntry = {
  expires_at_ms: number;
  value: Promise<RosettaAssemblyVerificationContext>;
};

const assembly_context_cache = new Map<string, AssemblyContextCacheEntry>();

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value.replace(/\/$/, "");
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rosetta_assembly_context_cache_key(
  request: RosettaBindingRequest,
): string {
  return sha256_hex(canonical_json({
    genome_bill_id: request.rosetta_binding.genome_bill_id,
    assembly_run_id: request.rosetta_binding.assembly_run_id,
    source_document_id: request.rosetta_binding.source_document_id,
    extraction_run_id: request.rosetta_binding.extraction_run_id,
    assembly_input_hash: request.rosetta_binding.assembly_input_hash,
    assembly_output_hash: request.rosetta_binding.assembly_output_hash,
    rosetta_source_identity_hash:
      request.rosetta_binding.rosetta_source_identity_hash,
    rosetta_source_content_hash:
      request.rosetta_binding.rosetta_source_content_hash,
    rosetta_output_content_hash:
      request.rosetta_binding.rosetta_output_content_hash,
    rosetta_rule_manifest_hash:
      request.rosetta_binding.rosetta_rule_manifest_hash,
    rosetta_configuration_hash:
      request.rosetta_binding.rosetta_configuration_hash,
  }));
}

function prune_assembly_context_cache(now_ms: number): void {
  for (const [key, entry] of assembly_context_cache.entries()) {
    if (entry.expires_at_ms <= now_ms) assembly_context_cache.delete(key);
  }
  while (assembly_context_cache.size >= ASSEMBLY_CONTEXT_CACHE_MAX_ENTRIES) {
    const oldest_key = assembly_context_cache.keys().next().value as string | undefined;
    if (!oldest_key) break;
    assembly_context_cache.delete(oldest_key);
  }
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

async function load_assembly_verification_context(
  request: RosettaBindingRequest,
): Promise<RosettaAssemblyVerificationContext> {
  const key = rosetta_assembly_context_cache_key(request);
  const now_ms = Date.now();
  const cached = assembly_context_cache.get(key);
  if (cached && cached.expires_at_ms > now_ms) {
    assembly_context_cache.delete(key);
    assembly_context_cache.set(key, cached);
    return cached.value;
  }
  if (cached) assembly_context_cache.delete(key);
  prune_assembly_context_cache(now_ms);

  const value = Promise.all([
    load_rosetta_source_snapshot(request),
    load_peer_traits(request),
    load_document_context(request),
  ]).then(([source_snapshot, peer_rows, document_context]) => ({
    source_snapshot,
    peer_rows,
    document_context,
  }));
  assembly_context_cache.set(key, {
    expires_at_ms: now_ms + ASSEMBLY_CONTEXT_CACHE_TTL_MS,
    value,
  });
  try {
    return await value;
  } catch (error) {
    const current = assembly_context_cache.get(key);
    if (current?.value === value) assembly_context_cache.delete(key);
    throw error;
  }
}

function validate_request_against_context(
  request: RosettaBindingRequest,
  context: RosettaAssemblyVerificationContext,
): PeerTraitRow {
  if (
    context.source_snapshot.source_content_hash.toLowerCase()
      !== request.rosetta_binding.rosetta_source_content_hash.toLowerCase()
  ) {
    throw new Error("prism_rosetta_cached_source_binding_hash_mismatch");
  }
  if (
    context.source_snapshot.source_identity_hash.toLowerCase()
      !== request.rosetta_binding.rosetta_source_identity_hash.toLowerCase()
  ) {
    throw new Error("prism_rosetta_cached_source_identity_mismatch");
  }
  const current = context.peer_rows.find((row) => row.trait_id === request.subject_id);
  if (!current || !is_record(current.normalized_value_json)) {
    throw new Error("prism_rosetta_current_trait_payload_missing");
  }
  if (current.source_object_id !== request.rosetta_binding.source_object_id) {
    throw new Error("prism_rosetta_current_trait_object_mismatch");
  }
  return current;
}

export async function enrich_rosetta_binding_request(
  request: RosettaBindingRequest,
): Promise<DeepRosettaBindingRequest> {
  const context = await load_assembly_verification_context(request);
  const current = validate_request_against_context(request, context);
  const trait_payload = current.normalized_value_json as Record<string, unknown>;
  return deep_rosetta_binding_request_schema.parse({
    ...request,
    requested_checks: DEEP_VERIFICATION_CHECKS,
    source_snapshot: context.source_snapshot,
    document_context: context.document_context,
    trait_payload,
    trait_payload_hash: sha256_hex(canonical_json(trait_payload)),
    peer_traits: context.peer_rows.map((row) => ({
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
