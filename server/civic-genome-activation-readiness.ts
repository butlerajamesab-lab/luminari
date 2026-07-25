import { createHash } from "node:crypto";

import { getPool } from "./db";

export const CIVIC_GENOME_ACTIVATION_AUDIT_VERSION = "civic-genome-activation-readiness-v2";
const ROSETTA_PAGE_SIZE = 500;

type rosetta_export_row = {
  extraction_run_id: number;
  source_document_id: number;
  document_name: string;
  document_type: string | null;
  document_identifier: string | null;
  jurisdiction_code?: string | null;
  session_key?: string | null;
  source_bill_id?: string | number | null;
  run_version: number;
  run_status: string | null;
  provenance_state: string;
  objects: unknown;
};

type genome_bill_identity = {
  genome_bill_id: string;
  state_code: string;
  session_key: string;
  source_bill_number: string;
  source_bill_title: string | null;
  source_bill_id: string | null;
};

export type civic_genome_activation_candidate = {
  source_document_id: number;
  extraction_run_id: number;
  document_identifier: string | null;
  document_name: string;
  object_count: number;
  candidate_status: "exact_unique" | "exact_ambiguous" | "no_exact_match" | "not_bill_material";
  genome_bill_ids: string[];
  match_basis: "authoritative_source_id" | "jurisdiction_session_identifier" | "identifier_only_unresolved" | "none";
};

export type civic_genome_activation_readiness_report = {
  audit_version: string;
  generated_at: string;
  rosetta_completed_runs: number;
  exact_unique_candidates: number;
  exact_ambiguous_candidates: number;
  no_exact_match_candidates: number;
  not_bill_material: number;
  candidates: civic_genome_activation_candidate[];
  report_hash: string;
};

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value.replace(/\/$/, "");
}

export function normalize_legislative_identifier(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  return normalized || null;
}

function normalize_identity_part(value: string | number | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || null;
}

function stable_hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parse_content_range(value: string | null): { end: number; total: number } {
  const match = value?.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (!match) throw new Error("rosetta_activation_audit_invalid_content_range");
  return { end: Number(match[2]), total: Number(match[3]) };
}

export async function load_rosetta_exports_with_fetch(
  base_url: string,
  service_role_key: string,
  fetch_impl: typeof fetch = fetch,
): Promise<rosetta_export_row[]> {
  const rows: rosetta_export_row[] = [];
  let offset = 0;
  let expected_total: number | null = null;

  while (expected_total === null || offset < expected_total) {
    const query = new URLSearchParams({
      select: "extraction_run_id,source_document_id,document_name,document_type,document_identifier,jurisdiction_code,session_key,source_bill_id,run_version,run_status,provenance_state,objects",
      run_status: "eq.completed",
      order: "source_document_id.asc,run_version.desc,extraction_run_id.desc",
    });
    const end = offset + ROSETTA_PAGE_SIZE - 1;
    const response = await fetch_impl(`${base_url}/rest/v1/v_civic_genome_law_view_v1?${query.toString()}`, {
      method: "GET",
      headers: {
        apikey: service_role_key,
        authorization: `Bearer ${service_role_key}`,
        accept: "application/json",
        prefer: "count=exact",
        range: `${offset}-${end}`,
      },
    });

    if (!response.ok) {
      const preview = (await response.text()).slice(0, 500);
      throw new Error(`rosetta_activation_audit_request_failed:${response.status}:${preview}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("invalid_rosetta_activation_audit_response");
    const range = parse_content_range(response.headers.get("content-range"));
    if (expected_total === null) expected_total = range.total;
    if (range.total !== expected_total) throw new Error("rosetta_activation_audit_count_changed_during_read");
    if (payload.length === 0 && offset < expected_total) throw new Error("rosetta_activation_audit_truncated_response");

    rows.push(...(payload as rosetta_export_row[]));
    offset = range.end + 1;
  }

  if (rows.length !== expected_total) throw new Error("rosetta_activation_audit_incomplete_result_set");
  const latest_by_document = new Map<number, rosetta_export_row>();
  for (const row of rows) {
    if (!latest_by_document.has(row.source_document_id)) latest_by_document.set(row.source_document_id, row);
  }
  return [...latest_by_document.values()].sort((left, right) => left.source_document_id - right.source_document_id);
}

async function load_rosetta_exports(): Promise<rosetta_export_row[]> {
  return load_rosetta_exports_with_fetch(
    required_environment("ROSETTA_SUPABASE_URL"),
    required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY"),
  );
}

async function load_genome_bills(): Promise<genome_bill_identity[]> {
  const result = await getPool().query<genome_bill_identity>(
    `select genome_bill_id,
            state_code,
            session_key,
            source_bill_number,
            source_bill_title,
            structural_dna_json ->> 'source_bill_id' as source_bill_id
       from public.civic_genome_bill
      order by state_code, session_key, source_bill_number, genome_bill_id`,
  );
  return result.rows;
}

export function classify_activation_candidate(
  row: rosetta_export_row,
  bills: genome_bill_identity[],
): civic_genome_activation_candidate {
  const document_type = String(row.document_type ?? "").toLowerCase();
  const identifier = normalize_legislative_identifier(row.document_identifier);
  const object_count = Array.isArray(row.objects) ? row.objects.length : 0;
  const base = {
    source_document_id: row.source_document_id,
    extraction_run_id: row.extraction_run_id,
    document_identifier: row.document_identifier,
    document_name: row.document_name,
    object_count,
  };

  if (!document_type.includes("bill")) {
    return { ...base, candidate_status: "not_bill_material", genome_bill_ids: [], match_basis: "none" };
  }
  if (!identifier) {
    return { ...base, candidate_status: "no_exact_match", genome_bill_ids: [], match_basis: "none" };
  }

  const source_bill_id = normalize_identity_part(row.source_bill_id);
  if (source_bill_id) {
    const matches = bills
      .filter(bill => normalize_identity_part(bill.source_bill_id) === source_bill_id)
      .map(bill => bill.genome_bill_id)
      .sort();
    if (matches.length > 0) {
      return {
        ...base,
        candidate_status: matches.length === 1 ? "exact_unique" : "exact_ambiguous",
        genome_bill_ids: matches,
        match_basis: "authoritative_source_id",
      };
    }
  }

  const identifier_matches = bills.filter(
    bill => normalize_legislative_identifier(bill.source_bill_number) === identifier,
  );
  const jurisdiction = normalize_identity_part(row.jurisdiction_code);
  const session = normalize_identity_part(row.session_key);
  if (jurisdiction && session) {
    const matches = identifier_matches
      .filter(
        bill =>
          normalize_identity_part(bill.state_code) === jurisdiction &&
          normalize_identity_part(bill.session_key) === session,
      )
      .map(bill => bill.genome_bill_id)
      .sort();
    return {
      ...base,
      candidate_status: matches.length === 1 ? "exact_unique" : matches.length > 1 ? "exact_ambiguous" : "no_exact_match",
      genome_bill_ids: matches,
      match_basis: matches.length > 0 ? "jurisdiction_session_identifier" : "none",
    };
  }

  const unresolved = identifier_matches.map(bill => bill.genome_bill_id).sort();
  return {
    ...base,
    candidate_status: unresolved.length > 0 ? "exact_ambiguous" : "no_exact_match",
    genome_bill_ids: unresolved,
    match_basis: unresolved.length > 0 ? "identifier_only_unresolved" : "none",
  };
}

/** Read-only readiness audit. It never creates a binding or invokes assembly. */
export async function audit_civic_genome_activation_readiness(): Promise<civic_genome_activation_readiness_report> {
  const [rosetta_rows, bills] = await Promise.all([load_rosetta_exports(), load_genome_bills()]);
  const candidates = rosetta_rows.map(row => classify_activation_candidate(row, bills));
  const report_body = {
    audit_version: CIVIC_GENOME_ACTIVATION_AUDIT_VERSION,
    rosetta_completed_runs: rosetta_rows.length,
    exact_unique_candidates: candidates.filter(candidate => candidate.candidate_status === "exact_unique").length,
    exact_ambiguous_candidates: candidates.filter(candidate => candidate.candidate_status === "exact_ambiguous").length,
    no_exact_match_candidates: candidates.filter(candidate => candidate.candidate_status === "no_exact_match").length,
    not_bill_material: candidates.filter(candidate => candidate.candidate_status === "not_bill_material").length,
    candidates,
  };
  return { ...report_body, generated_at: new Date().toISOString(), report_hash: stable_hash(report_body) };
}
