import { createHash } from "node:crypto";
import { get_current_rosetta_live_detail, type current_rosetta_live_detail } from "./current-law-rosetta-live";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";
import { get_rosetta_review_base_url } from "./rosetta-review-url";

/**
 * Lighthouse-only V12 admission proposal. Reads Rosetta's existing source-content
 * REST endpoint (the same source used by civic-genome-human-report) and live-rule
 * endpoint. No Rosetta writes, no generation-target writes, no Genome publication.
 *
 * Rosetta's read-only receipt attests exact-source output integrity. It does not
 * establish semantic correctness or grant publication authority.
 */
type record = Record<string, unknown>;
const HASH = /^[a-f0-9]{64}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CANONICAL_LAYERS = new Set(["H", "W", "A", "O", "D"]);
const RESOLUTION_TIMEOUT_MS = 10_000;
const CERTIFICATION_TIMEOUT_MS = 10_000;

export type v12_genome_binding = {
  bill_version_id?: string;
  source_document_key: string;
  rosetta_source_document_id: number;
  source_content_hash: string;
  /** Previously registered immutable source identity, when available. */
  rosetta_source_content_id?: string | null;
};

export type v12_source_resolution = {
  source_content_id: string;
  source_document_id: number;
  source_content_hash: string;
  source_document_key: string;
};

export type v12_certification_receipt = {
  contract: "rosetta-v12-certification-receipt-v1"; // PROPOSED, not an existing Rosetta API contract
  source_content_id: string;
  source_document_id: number;
  source_content_hash: string;
  ruleset_version: string;
  ruleset_sha256: string;
  output_sha256: string;
  certification_sha256: string;
  certified_at: string;
  attestation_type: "source_bound_output_integrity_v1";
  verified_invariants: {
    source_text_sha256_matches: true;
    unit_source_slices_match: true;
    unit_text_hashes_match: true;
    section_spans_within_source: true;
    hold_receipt_absent: true;
    failure_receipts_absent: true;
    unit_count: number;
    section_count: number;
  };
};

export type v12_admission_receipt = {
  contract: "civic-genome-rosetta-v12-admission-v1";
  bill_version_id: string | null;
  source_document_key: string;
  source_content_id: string | null;
  source_document_id: number;
  source_content_hash: string;
  ruleset_version: string | null;
  ruleset_sha256: string | null;
  installed_ruleset_sha256: string | null;
  read_contract_sha256: string | null;
  selected_at: string | null;
  output_sha256: string | null;
  certification_sha256: string | null;
  admission_state: "admitted" | "held" | "failed" | "rejected";
  admitted: boolean;
  reason: string | null;
  hold_receipt: record | null;
  failure_receipts: unknown[];
};

export type v12_admission_result = {
  receipt: v12_admission_receipt;
  /** Deliberately strips R; not a write-ready Genome assembly. */
  canonical_unit_layers: Array<{ unit_ord: number; layers: Array<"H" | "W" | "A" | "O" | "D"> }>;
};

const as_record = (x: unknown): record | null =>
  x !== null && typeof x === "object" && !Array.isArray(x) ? x as record : null;
const required_text = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const date_valid = (x: unknown): x is string => required_text(x) && Number.isFinite(Date.parse(x));
const sha256 = (x: string): string => createHash("sha256").update(x, "utf8").digest("hex");

// Share the same validation before either direct admission or a remote
// integrity-material fetch. A malformed V13 identity is NOT a valid
// "unsupported generation" result; it is invalid provenance.
function validate_v12_target_provenance(target: record): void {
  if (target.identity_valid !== true
    || target.engine_identity_valid !== true
    || target.read_identity_valid !== true) {
    throw new Error("rosetta_v12_target_identity_invalid");
  }
  if (!required_text(target.ruleset_version)
    || !HASH.test(String(target.ruleset_sha256 ?? ""))
    || !HASH.test(String(target.installed_ruleset_sha256 ?? ""))
    || !HASH.test(String(target.read_contract_sha256 ?? ""))
    || !date_valid(target.selected_at)) {
    throw new Error("rosetta_v12_target_provenance_missing");
  }
  if (String(target.installed_ruleset_sha256).toLowerCase() !== String(target.ruleset_sha256).toLowerCase()) {
    throw new Error("rosetta_v12_installed_ruleset_sha256_mismatch");
  }
}

export function v12_receipt_for_binding(binding: v12_genome_binding): v12_admission_receipt {
  return {
    contract: "civic-genome-rosetta-v12-admission-v1",
    bill_version_id: binding.bill_version_id ?? null,
    source_document_key: binding.source_document_key,
    source_content_id: binding.rosetta_source_content_id ?? null,
    source_document_id: binding.rosetta_source_document_id,
    source_content_hash: binding.source_content_hash.toLowerCase(),
    ruleset_version: null,
    ruleset_sha256: null,
    installed_ruleset_sha256: null,
    read_contract_sha256: null,
    selected_at: null,
    output_sha256: null,
    certification_sha256: null,
    admission_state: "rejected",
    admitted: false,
    reason: null,
    hold_receipt: null,
    failure_receipts: [],
  };
}

function validate_binding(binding: v12_genome_binding): void {
  if (
    !required_text(binding.source_document_key)
    || !Number.isSafeInteger(binding.rosetta_source_document_id)
    || binding.rosetta_source_document_id <= 0
    || !HASH.test(binding.source_content_hash)
    || (binding.rosetta_source_content_id != null && !UUID.test(binding.rosetta_source_content_id))
  ) throw new Error("rosetta_v12_genome_binding_invalid");
}

/**
 * Exact and unique read of source_document_content. Human report's existing
 * endpoint uses the same authenticated table read but intentionally chooses
 * newest-by-document for display; admission MUST NOT inherit that heuristic.
 */
export async function resolve_v12_source_content(
  binding: v12_genome_binding,
): Promise<v12_source_resolution> {
  validate_binding(binding);
  const base_url = process.env.ROSETTA_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.ROSETTA_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base_url || !key) throw new Error("rosetta_v12_source_resolution_not_configured");
  const params = new URLSearchParams({
    select: "source_content_id,source_document_id,source_content_hash,source_metadata",
    source_document_id: `eq.${binding.rosetta_source_document_id}`,
    source_content_hash: `eq.${binding.source_content_hash.toLowerCase()}`,
    "source_metadata->>docket_source_document_key": `eq.${binding.source_document_key}`,
    limit: "2",
  });
  if (binding.rosetta_source_content_id) {
    params.set("source_content_id", `eq.${binding.rosetta_source_content_id}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLUTION_TIMEOUT_MS);
  try {
    const response = await fetch(`${base_url}/rest/v1/source_document_content?${params}`, {
      method: "GET",
      headers: create_rosetta_supabase_headers(key, { accept: "application/json" }),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error(`rosetta_v12_source_resolution_http_${response.status}`);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("rosetta_v12_source_resolution_response_invalid");
    if (rows.length === 0) throw new Error("rosetta_v12_source_resolution_zero_matches");
    if (rows.length !== 1) throw new Error("rosetta_v12_source_resolution_ambiguous");
    const row = as_record(rows[0]);
    const metadata = as_record(row?.source_metadata);
    if (
      !row
      || !UUID.test(String(row.source_content_id ?? ""))
      || Number(row.source_document_id) !== binding.rosetta_source_document_id
      || String(row.source_content_hash ?? "").toLowerCase() !== binding.source_content_hash.toLowerCase()
      || metadata?.docket_source_document_key !== binding.source_document_key
      || (binding.rosetta_source_content_id != null
        && String(row.source_content_id).toLowerCase() !== binding.rosetta_source_content_id.toLowerCase())
    ) throw new Error("rosetta_v12_source_resolution_identity_mismatch");
    return {
      source_content_id: String(row.source_content_id),
      source_document_id: binding.rosetta_source_document_id,
      source_content_hash: binding.source_content_hash.toLowerCase(),
      source_document_key: binding.source_document_key,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("rosetta_v12_source_resolution_timeout");
    if (error instanceof Error && error.message.startsWith("rosetta_v12_")) throw error;
    throw new Error("rosetta_v12_source_resolution_network_error");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Hash the exact Rosetta JSONB-wire unit objects, not the presentation reader's
 * reconstructed units (which remove source hashes/rules and change nested key
 * order). The producer and consumer share these four TOP-LEVEL keys in order.
 * Validate every normalized unit against the raw source to prevent admitting
 * a displayed/assembled classification inconsistent with the hashed bytes.
 */
export function v12_output_sha256(detail: current_rosetta_live_detail): string {
  const raw_units = detail.source_bound_raw_units;
  if (!Array.isArray(raw_units) || raw_units.length !== detail.units.length) {
    throw new Error("rosetta_v12_wire_projection_unavailable");
  }
  for (let i = 0; i < raw_units.length; i++) {
    const raw = as_record(raw_units[i]);
    const unit = detail.units[i];
    if (!raw
      || raw.unit_ord !== unit.unit_ord
      || raw.section_ord !== unit.section_ord
      || raw.kind !== unit.kind
      || raw.disposition !== unit.disposition
      || raw.raw_start !== unit.raw_start
      || raw.raw_end !== unit.raw_end
      || raw.raw_text !== unit.raw_text
      || raw.effective_text !== unit.effective_text
      || !Array.isArray(raw.layers)
      || JSON.stringify(raw.layers) !== JSON.stringify(unit.layers)
    ) throw new Error("rosetta_v12_wire_unit_projection_mismatch");
  }
  const canonical = {
    decomposition: detail.decomposition,
    sections: detail.sections,
    units: raw_units,
    markup_events: detail.markup_events,
  };
  return sha256(JSON.stringify(canonical));
}

export function verify_v12_certification(
  receipt: v12_certification_receipt | null,
  source: v12_source_resolution,
  target: record,
  output_sha256: string,
): string {
  if (!receipt) throw new Error("rosetta_v12_certification_receipt_missing");
  const invariants = receipt?.verified_invariants;
  if (
    receipt.contract !== "rosetta-v12-certification-receipt-v1"
    || receipt.attestation_type !== "source_bound_output_integrity_v1"
    || receipt.source_content_id.toLowerCase() !== source.source_content_id.toLowerCase()
    || receipt.source_document_id !== source.source_document_id
    || receipt.source_content_hash.toLowerCase() !== source.source_content_hash
    || receipt.ruleset_version !== target.ruleset_version
    || receipt.ruleset_sha256.toLowerCase() !== target.ruleset_sha256
    || receipt.output_sha256.toLowerCase() !== output_sha256
    || !HASH.test(receipt.certification_sha256)
    || !date_valid(receipt.certified_at)
    || invariants?.source_text_sha256_matches !== true
    || invariants?.unit_source_slices_match !== true
    || invariants?.unit_text_hashes_match !== true
    || invariants?.section_spans_within_source !== true
    || invariants?.hold_receipt_absent !== true
    || invariants?.failure_receipts_absent !== true
    || !Number.isSafeInteger(invariants?.unit_count) || invariants.unit_count <= 0
    || !Number.isSafeInteger(invariants?.section_count) || invariants.section_count <= 0
  ) throw new Error("rosetta_v12_certification_receipt_mismatch");
  // Producer #325 hashes exactly these source-bound fields, in this order,
  // before appending certification_sha256. A syntactically valid but fabricated
  // digest must never be accepted as receipt integrity.
  const unsigned_receipt = {
    contract: receipt.contract,
    source_content_id: receipt.source_content_id,
    source_document_id: receipt.source_document_id,
    source_content_hash: receipt.source_content_hash,
    ruleset_version: receipt.ruleset_version,
    ruleset_sha256: receipt.ruleset_sha256,
    output_sha256: receipt.output_sha256,
    certified_at: receipt.certified_at,
    attestation_type: receipt.attestation_type,
    verified_invariants: receipt.verified_invariants,
  };
  if (sha256(JSON.stringify(unsigned_receipt)) !== receipt.certification_sha256.toLowerCase()) {
    throw new Error("rosetta_v12_certification_receipt_digest_mismatch");
  }
  return receipt.certification_sha256.toLowerCase();
}

export function admit_v12_live_detail(
  binding: v12_genome_binding,
  source: v12_source_resolution,
  detail: current_rosetta_live_detail,
  certification: v12_certification_receipt | null,
): v12_admission_result {
  validate_binding(binding);
  const receipt = v12_receipt_for_binding(binding);
  receipt.source_content_id = source.source_content_id;
  if (
    source.source_document_key !== binding.source_document_key
    || source.source_document_id !== binding.rosetta_source_document_id
    || source.source_content_hash !== binding.source_content_hash.toLowerCase()
    || (binding.rosetta_source_content_id
      && source.source_content_id.toLowerCase() !== binding.rosetta_source_content_id.toLowerCase())
    || detail.source.source_content_id.toLowerCase() !== source.source_content_id.toLowerCase()
    || detail.source.source_document_id !== source.source_document_id
    || detail.source.source_content_hash.toLowerCase() !== source.source_content_hash
  ) throw new Error("rosetta_v12_source_identity_mismatch");
  if (sha256(detail.source.source_text) !== source.source_content_hash) {
    throw new Error("rosetta_v12_source_text_hash_mismatch");
  }
  const target = detail.target;
  validate_v12_target_provenance(target);
  // Preserve the missing/invalid provenance error separately from a
  // well-formed but unsupported selected generation.
  if (target.ruleset_version !== "rosetta-rule-ref-v12") {
    throw new Error("rosetta_v12_selected_generation_unsupported");
  }
  receipt.ruleset_version = target.ruleset_version;
  receipt.ruleset_sha256 = String(target.ruleset_sha256).toLowerCase();
  receipt.installed_ruleset_sha256 = String(target.installed_ruleset_sha256).toLowerCase();
  receipt.read_contract_sha256 = String(target.read_contract_sha256).toLowerCase();
  receipt.selected_at = target.selected_at;
  if (detail.hold_receipt) throw new Error("rosetta_v12_hold_receipt_present");
  if (detail.failure_receipts.length) throw new Error("rosetta_v12_failure_receipts_present");
  if (detail.decomposition?.outcome !== "decomposed") {
    throw new Error("rosetta_v12_decomposition_not_decomposed");
  }
  for (const unit of detail.units) {
    if (
      !Number.isSafeInteger(unit.raw_start) || !Number.isSafeInteger(unit.raw_end)
      || unit.raw_start < 0 || unit.raw_end <= unit.raw_start
      || unit.raw_end > detail.source.source_text.length
    ) throw new Error("rosetta_v12_unit_span_out_of_bounds");
    if (detail.source.source_text.slice(unit.raw_start, unit.raw_end) !== unit.raw_text) {
      throw new Error("rosetta_v12_unit_source_slice_mismatch");
    }
  }
  receipt.output_sha256 = v12_output_sha256(detail);
  // An inline live-rule payload cannot self-certify. Certification must arrive
  // by a separately verified Rosetta read endpoint/RPC, not from detail.target.
  receipt.certification_sha256 = verify_v12_certification(certification, source, target, receipt.output_sha256);
  receipt.admitted = true;
  receipt.admission_state = "admitted";
  return {
    receipt,
    canonical_unit_layers: detail.units.map(unit => ({
      unit_ord: unit.unit_ord,
      layers: unit.layers.filter((layer): layer is "H" | "W" | "A" | "O" | "D" => CANONICAL_LAYERS.has(layer)),
    })),
  };
}

/**
 * Fetch the selected-generation integrity endpoint. V12's receipt is accepted
 * only while V12 is selected; V13 or any future generation MUST have its own
 * explicitly reviewed producer before admission. No downgrade or fallback.
 * This is distinct from /api/live-rule; receipt identity and source/ruleset/
 * output bindings are independently rechecked by verify_v12_certification.
 */
export async function read_v12_certification_receipt(
  source: v12_source_resolution,
  _target: record,
): Promise<v12_certification_receipt | null> {
  validate_v12_target_provenance(_target);
  if (_target.ruleset_version !== "rosetta-rule-ref-v12") {
    throw new Error("rosetta_v12_selected_generation_unsupported");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CERTIFICATION_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${get_rosetta_review_base_url()}/api/current-integrity/${encodeURIComponent(source.source_content_id)}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
      },
    );
    if (response.status === 409) {
      // Selected V13+ without a certified material adapter must remain blocked.
      throw new Error("rosetta_v12_selected_generation_unsupported");
    }
    if (!response.ok) throw new Error(`rosetta_v12_certification_receipt_http_${response.status}`);
    const value: unknown = await response.json();
    const row = as_record(value);
    if (
      !row
      || row.contract !== "rosetta-v12-certification-receipt-v1"
      || row.attestation_type !== "source_bound_output_integrity_v1"
      || !required_text(row.source_content_id)
      || !Number.isSafeInteger(row.source_document_id)
      || !required_text(row.source_content_hash)
      || !required_text(row.ruleset_version)
      || !required_text(row.ruleset_sha256)
      || !required_text(row.output_sha256)
      || !required_text(row.certification_sha256)
      || !required_text(row.certified_at)
    ) throw new Error("rosetta_v12_certification_receipt_response_invalid");
    const invariants = as_record(row.verified_invariants);
    if (
      !invariants
      || invariants.source_text_sha256_matches !== true
      || invariants.unit_source_slices_match !== true
      || invariants.unit_text_hashes_match !== true
      || invariants.section_spans_within_source !== true
      || invariants.hold_receipt_absent !== true
      || invariants.failure_receipts_absent !== true
      || !Number.isSafeInteger(invariants.unit_count) || Number(invariants.unit_count) <= 0
      || !Number.isSafeInteger(invariants.section_count) || Number(invariants.section_count) <= 0
    ) throw new Error("rosetta_v12_certification_receipt_invariants_invalid");
    return row as unknown as v12_certification_receipt;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("rosetta_v12_certification_receipt_timeout");
    if (error instanceof Error && (
      error.message.startsWith("rosetta_v12_certification_receipt_")
      || error.message === "rosetta_v12_selected_generation_unsupported"
    )) throw error;
    throw new Error("rosetta_v12_certification_receipt_network_error");
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspect_v12_admission_for_binding(binding: v12_genome_binding): Promise<v12_admission_result> {
  const receipt = v12_receipt_for_binding(binding);
  try {
    const source = await resolve_v12_source_content(binding);
    receipt.source_content_id = source.source_content_id;
    let detail: current_rosetta_live_detail | null;
    try {
      detail = await get_current_rosetta_live_detail({
        source_content_id: source.source_content_id,
        source_content_hash: source.source_content_hash,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "current_rosetta_live_read_timeout") throw new Error("rosetta_v12_live_rule_timeout");
      if (message.startsWith("current_rosetta_live_read_failed:")) {
        throw new Error(`rosetta_v12_live_rule_http_${message.split(":")[1]}`);
      }
      throw new Error("rosetta_v12_live_rule_invalid");
    }
    if (!detail) throw new Error("rosetta_v12_live_rule_http_404");
    // Retain observed provenance and negative receipts on rejected decisions.
    // None of these observations constitutes admission or a write capability.
    receipt.ruleset_version = required_text(detail.target.ruleset_version) ? detail.target.ruleset_version : null;
    receipt.ruleset_sha256 = HASH.test(String(detail.target.ruleset_sha256 ?? ""))
      ? String(detail.target.ruleset_sha256).toLowerCase() : null;
    receipt.selected_at = date_valid(detail.target.selected_at) ? detail.target.selected_at : null;
    receipt.installed_ruleset_sha256 = HASH.test(String(detail.target.installed_ruleset_sha256 ?? ""))
      ? String(detail.target.installed_ruleset_sha256).toLowerCase() : null;
    receipt.read_contract_sha256 = HASH.test(String(detail.target.read_contract_sha256 ?? ""))
      ? String(detail.target.read_contract_sha256).toLowerCase() : null;
    receipt.output_sha256 = v12_output_sha256(detail);
    receipt.hold_receipt = detail.hold_receipt;
    receipt.failure_receipts = detail.failure_receipts;
    // Validate ALL target identity/provenance fields first. V13 may be a
    // valid unsupported generation; malformed V13 is invalid provenance.
    // Neither state may call an older-generation producer.
    validate_v12_target_provenance(detail.target);
    if (detail.target.ruleset_version !== "rosetta-rule-ref-v12") {
      throw new Error("rosetta_v12_selected_generation_unsupported");
    }
    // Preserve held/failed observations without asking Rosetta for a receipt
    // that its integrity contract correctly refuses to issue for those states.
    const certificationEligible = detail.decomposition?.outcome === "decomposed"
      && !detail.hold_receipt
      && detail.failure_receipts.length === 0;
    const certification = certificationEligible
      ? await read_v12_certification_receipt(source, detail.target)
      : null;
    return admit_v12_live_detail(binding, source, detail, certification);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "rosetta_v12_unexpected_rejection";
    receipt.reason = reason.startsWith("rosetta_v12_") ? reason : "rosetta_v12_unexpected_rejection";
    receipt.admission_state = receipt.reason === "rosetta_v12_hold_receipt_present" ? "held"
      : receipt.reason === "rosetta_v12_failure_receipts_present" ? "failed" : "rejected";
    return { receipt, canonical_unit_layers: [] };
  }
}

export async function require_v12_admission_for_binding(binding: v12_genome_binding): Promise<v12_admission_result> {
  const result = await inspect_v12_admission_for_binding(binding);
  if (!result.receipt.admitted) throw new Error(result.receipt.reason ?? "rosetta_v12_admission_rejected");
  return result;
}
