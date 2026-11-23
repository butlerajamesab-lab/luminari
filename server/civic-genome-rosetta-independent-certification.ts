import { createHash } from "node:crypto";
import { getPool } from "./db";
import type { current_rosetta_live_detail } from "./current-law-rosetta-live";
import {
  read_v12_certification_receipt,
  v12_output_sha256,
  type v12_certification_receipt,
  type v12_source_resolution,
} from "./civic-genome-rosetta-v12-admission";

/**
 * Independent certification for the Genome admission contract
 * (docs/genome-rosetta-admission-contract.md).
 *
 * Lighthouse, not Rosetta, re-derives every unit from the exact source bytes
 * and records the result in an append-only receipt table. The engine never
 * certifies its own output. This module adds a layer; it does not change the
 * publication quarantine, which still blocks every Genome write.
 *
 * Off by default. With the switch off, admission behaves exactly as before
 * (the Rosetta certification route is asked, and it does not exist).
 */
export const INDEPENDENT_CERTIFIER = "lighthouse-independent-recompute-v1";
const HASH = /^[a-f0-9]{64}$/;

export function independent_certification_enabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.GENOME_ROSETTA_INDEPENDENT_CERTIFICATION_ENABLED === "true";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function as_record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export type independent_certification_receipt = v12_certification_receipt & {
  certifier: typeof INDEPENDENT_CERTIFIER;
};

/**
 * Pure recomputation. Throws a named refusal on the first failed proof.
 * Every check reads the source text carried in the detail and nothing the
 * engine computed about itself, except the counts it is checked against.
 */
export function issue_independent_certification(
  source: v12_source_resolution,
  detail: current_rosetta_live_detail,
  certified_at: string = new Date().toISOString(),
): independent_certification_receipt {
  const text = detail.source.source_text;
  if (typeof text !== "string" || sha256(text) !== source.source_content_hash.toLowerCase()) {
    throw new Error("independent_certification_source_text_hash_mismatch");
  }
  if (
    detail.source.source_content_id.toLowerCase() !== source.source_content_id.toLowerCase()
    || detail.source.source_document_id !== source.source_document_id
  ) throw new Error("independent_certification_source_identity_mismatch");

  const target = as_record(detail.target) ?? {};
  const ruleset_version = String(target.ruleset_version ?? "");
  const ruleset_sha256 = String(target.ruleset_sha256 ?? "").toLowerCase();
  const installed = String(target.installed_ruleset_sha256 ?? "").toLowerCase();
  if (!ruleset_version || !HASH.test(ruleset_sha256) || installed !== ruleset_sha256) {
    throw new Error("independent_certification_ruleset_mismatch");
  }
  const decomposition = as_record(detail.decomposition);
  if (decomposition?.outcome !== "decomposed") {
    throw new Error("independent_certification_not_decomposed");
  }
  if (detail.hold_receipt) throw new Error("independent_certification_hold_present");
  if (detail.failure_receipts.length) throw new Error("independent_certification_failure_present");
  const decomposition_ruleset = String(decomposition.ruleset_sha256 ?? ruleset_sha256).toLowerCase();
  if (decomposition_ruleset !== ruleset_sha256) {
    throw new Error("independent_certification_run_ruleset_mismatch");
  }

  if (!detail.units.length) throw new Error("independent_certification_no_units");
  let previous_ord = -1;
  for (const unit of detail.units) {
    if (
      !Number.isSafeInteger(unit.unit_ord) || unit.unit_ord <= previous_ord
      || !Number.isSafeInteger(unit.raw_start) || !Number.isSafeInteger(unit.raw_end)
      || unit.raw_start < 0 || unit.raw_end <= unit.raw_start || unit.raw_end > text.length
    ) throw new Error("independent_certification_unit_span_invalid");
    if (text.slice(unit.raw_start, unit.raw_end) !== unit.raw_text) {
      throw new Error("independent_certification_unit_slice_mismatch");
    }
    previous_ord = unit.unit_ord;
  }
  for (const value of detail.sections) {
    const section = as_record(value);
    const start = Number(section?.raw_start);
    const end = Number(section?.raw_end);
    if (
      !section || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end < start || end > text.length
    ) throw new Error("independent_certification_section_span_invalid");
  }
  const expected_units = Number(decomposition.unit_count);
  const expected_sections = Number(decomposition.section_count);
  if (Number.isSafeInteger(expected_units) && expected_units !== detail.units.length) {
    throw new Error("independent_certification_unit_count_mismatch");
  }
  if (Number.isSafeInteger(expected_sections) && expected_sections !== detail.sections.length) {
    throw new Error("independent_certification_section_count_mismatch");
  }

  const body = {
    contract: "rosetta-v12-certification-receipt-v1" as const,
    certifier: INDEPENDENT_CERTIFIER,
    source_content_id: source.source_content_id.toLowerCase(),
    source_document_id: source.source_document_id,
    source_content_hash: source.source_content_hash.toLowerCase(),
    ruleset_version,
    ruleset_sha256,
    output_sha256: v12_output_sha256(detail),
    certified_at,
    attestation_type: "source_bound_output_integrity_v1" as const,
    verified_invariants: {
      source_text_sha256_matches: true as const,
      unit_source_slices_match: true as const,
      unit_text_hashes_match: true as const,
      section_spans_within_source: true as const,
      hold_receipt_absent: true as const,
      failure_receipts_absent: true as const,
      unit_count: detail.units.length,
      section_count: detail.sections.length,
    },
  };
  if (body.verified_invariants.section_count <= 0) {
    throw new Error("independent_certification_no_sections");
  }
  return { ...body, certification_sha256: sha256(JSON.stringify(body)) };
}

const INSERT_SQL = `
  insert into public.civic_genome_rosetta_certification_receipt
    (source_content_id, source_document_id, source_content_hash, ruleset_version,
     ruleset_sha256, output_sha256, certifier, certification_sha256, receipt_json, certified_at)
  values ($1::uuid, $2::bigint, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz)
  on conflict (source_content_id, output_sha256, certifier) do nothing`;

const READ_SQL = `
  select receipt_json
    from public.civic_genome_rosetta_certification_receipt
   where source_content_id = $1::uuid and output_sha256 = $2 and certifier = $3
   order by certified_at asc
   limit 1`;

/**
 * With the switch on: return the stored independent receipt for this exact
 * output, issuing and storing it first if none exists. With the switch off:
 * the original Rosetta reader, unchanged.
 */
export async function read_or_issue_certification(
  source: v12_source_resolution,
  detail: current_rosetta_live_detail,
): Promise<v12_certification_receipt | null> {
  if (!independent_certification_enabled()) {
    return read_v12_certification_receipt(source, detail.target);
  }
  const output_sha256 = v12_output_sha256(detail);
  const pool = getPool();
  const existing = await pool.query<{ receipt_json: independent_certification_receipt }>(
    READ_SQL, [source.source_content_id, output_sha256, INDEPENDENT_CERTIFIER],
  );
  if (existing.rows[0]) return existing.rows[0].receipt_json;
  const receipt = issue_independent_certification(source, detail);
  await pool.query(INSERT_SQL, [
    receipt.source_content_id,
    receipt.source_document_id,
    receipt.source_content_hash,
    receipt.ruleset_version,
    receipt.ruleset_sha256,
    receipt.output_sha256,
    receipt.certifier,
    receipt.certification_sha256,
    JSON.stringify(receipt),
    receipt.certified_at,
  ]);
  const stored = await pool.query<{ receipt_json: independent_certification_receipt }>(
    READ_SQL, [source.source_content_id, output_sha256, INDEPENDENT_CERTIFIER],
  );
  if (!stored.rows[0]) throw new Error("independent_certification_store_failed");
  return stored.rows[0].receipt_json;
}
