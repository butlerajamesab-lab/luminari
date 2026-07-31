import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";

import { getPool } from "./db";
import {
  ingest_docket_bill_to_rosetta_source,
  type rosetta_source_ingestion_result,
} from "./civic-genome-rosetta-source-ingestion";
import {
  assemble_rosetta_and_resolve_family,
  type rosetta_family_orchestration_result,
} from "./civic-genome-rosetta-family-orchestration";

const PDF_PARSE_VERSION = "2.4.5";
const WA_HTML_EXTRACTOR_VERSION = "wa-official-session-law-html-strip-v1";
const PDF_EXTRACTOR_VERSION = `pdf-parse-${PDF_PARSE_VERSION}-getText-v1`;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export type rosetta_extraction_receipt = {
  source_document_id: number;
  source_content_id: string;
  source_identity_hash: string;
  source_content_hash: string;
  source_byte_hash: string | null;
  source_version: string;
  source_url: string;
  extraction_run_id: number;
  run_version: number;
  run_status: string;
  admissibility_state: string;
  failure_code?: string | null;
  engine_version: string;
  rule_set_version: string;
  rule_manifest_hash: string;
  configuration_hash: string;
  output_content_hash: string | null;
  coverage: Record<string, unknown>;
  row_counts?: Record<string, number>;
  replayed: boolean;
};

export type docket_rosetta_pipeline_result = {
  source_bill_id: number;
  genome_bill_id: string;
  ingestion: rosetta_source_ingestion_result;
  extraction: rosetta_extraction_receipt;
  assembly: rosetta_family_orchestration_result;
};

type docket_text_document = {
  doc_id?: number | string;
  type?: string;
  date?: string;
  url?: string;
  state_link?: string;
  text_hash?: string;
  text_size?: number | string;
};

type docket_bill_payload = Record<string, unknown> & {
  bill_id?: number | string;
  bill_number?: string;
  state?: string;
  status_date?: string;
  last_action_date?: string;
  texts?: unknown;
};

type cached_docket_bill = {
  bill: docket_bill_payload;
  fetched_at: string;
};

type extracted_source = {
  source_text: string;
  source_content_hash: string;
  source_byte_hash: string;
  source_url: string;
  source_version: string;
  provider_hash: string | null;
  extractor_version: string;
  source_metadata: Record<string, unknown>;
};

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value.replace(/\/$/, "");
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function as_record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function collect_text_documents(value: unknown): docket_text_document[] {
  if (Array.isArray(value)) return value.filter(item => as_record(item)) as docket_text_document[];
  const record = as_record(value);
  if (!record) return [];
  const nested = record.text;
  return Array.isArray(nested)
    ? nested.filter(item => as_record(item)) as docket_text_document[]
    : [];
}

function document_score(document: docket_text_document): number {
  const type = String(document.type ?? "").toLowerCase();
  if (type.includes("chaptered") || type.includes("session law")) return 500;
  if (type.includes("enrolled")) return 400;
  if (type.includes("passed legislature") || type.includes("passed by legislature")) return 350;
  if (type.includes("engrossed")) return 250;
  return 100;
}

function select_official_document(bill: docket_bill_payload): docket_text_document {
  const candidates = collect_text_documents(bill.texts)
    .filter(document => {
      const source_url = String(document.state_link ?? "").trim();
      return source_url.startsWith("https://");
    })
    .sort((left, right) => {
      const score_delta = document_score(right) - document_score(left);
      if (score_delta !== 0) return score_delta;
      const left_id = Number(left.doc_id ?? 0);
      const right_id = Number(right.doc_id ?? 0);
      if (Number.isFinite(left_id) && Number.isFinite(right_id) && left_id !== right_id) {
        return right_id - left_id;
      }
      return String(left.state_link ?? "").localeCompare(String(right.state_link ?? ""));
    });

  const selected = candidates[0];
  if (!selected) throw new Error("docket_official_text_document_not_found");
  return selected;
}

async function load_cached_docket_bill(source_bill_id: number): Promise<cached_docket_bill> {
  const { rows } = await getPool().query<cached_docket_bill>(
    `select bill, fetched_at::text
       from public.docket_bill_detail_cache
      where bill_id = $1
      order by fetched_at desc
      limit 1`,
    [source_bill_id],
  );
  const row = rows[0];
  if (!row || !as_record(row.bill)) throw new Error("docket_bill_detail_cache_record_not_found");
  return row;
}

async function fetch_bytes(url: string): Promise<{ bytes: Buffer; content_type: string | null }> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { accept: "application/pdf,text/html;q=0.9,*/*;q=0.1" },
  });
  if (!response.ok) throw new Error(`docket_source_fetch_failed:${response.status}`);
  const content_length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(content_length) && content_length > MAX_SOURCE_BYTES) {
    throw new Error("docket_source_exceeds_max_bytes");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("docket_source_empty");
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error("docket_source_exceeds_max_bytes");
  return { bytes, content_type: response.headers.get("content-type") };
}

function derive_wa_official_html_url(pdf_url: string): string | null {
  if (!pdf_url.includes("lawfilesext.leg.wa.gov/")) return null;
  if (!/\/Pdf\//i.test(pdf_url) || !/\.pdf$/i.test(pdf_url)) return null;
  return pdf_url.replace(/\/Pdf\//i, "/Htm/").replace(/\.pdf$/i, ".htm");
}

/** Mirrors the declared SQL control extractor exactly. It deliberately preserves
 * an initial UTF-8 BOM because PostgreSQL POSIX whitespace normalization does not
 * consume it. No semantic rewriting is performed. */
export function normalize_wa_official_html(html: string): string {
  const bom = html.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = bom ? html.slice(1) : html;
  const normalized = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t\n\v\f]+/g, " ")
    .replace(/^ +| +$/g, "");
  return `${bom}${normalized}`;
}

async function extract_pdf_text(pdf_bytes: Buffer): Promise<string> {
  if (pdf_bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("docket_source_is_not_pdf");
  }
  const parser = new PDFParse({ data: pdf_bytes });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\r\n?/g, "\n").trimEnd();
    if (text.trim().length < 200) throw new Error("docket_pdf_text_incomplete");
    return text;
  } finally {
    await parser.destroy();
  }
}

async function extract_source(
  source_bill_id: number,
  cached: cached_docket_bill,
  document: docket_text_document,
): Promise<extracted_source> {
  const source_url = String(document.state_link ?? "").trim();
  const doc_id = String(document.doc_id ?? "").trim();
  const document_type = String(document.type ?? "official").trim() || "official";
  if (!source_url || !doc_id) throw new Error("docket_document_identity_incomplete");

  const pdf = await fetch_bytes(source_url);
  if (pdf.bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("docket_official_source_not_pdf");
  }
  const source_byte_hash = sha256(pdf.bytes);
  const html_url = derive_wa_official_html_url(source_url);

  let source_text: string;
  let source_version: string;
  let extractor_version: string;
  let extraction_text_url: string = source_url;
  let extraction_text_byte_hash: string = source_byte_hash;

  if (html_url) {
    const html = await fetch_bytes(html_url);
    const html_text = html.bytes.toString("utf8");
    source_text = normalize_wa_official_html(html_text);
    if (source_text.trim().length < 200) throw new Error("docket_html_text_incomplete");
    source_version = `legiscan_text:${doc_id}:${document_type}`;
    extractor_version = WA_HTML_EXTRACTOR_VERSION;
    extraction_text_url = html_url;
    extraction_text_byte_hash = sha256(html.bytes);
  } else {
    source_text = await extract_pdf_text(pdf.bytes);
    source_version = `legiscan_text:${doc_id}:${document_type}:${PDF_EXTRACTOR_VERSION}`;
    extractor_version = PDF_EXTRACTOR_VERSION;
  }

  const source_content_hash = sha256(source_text);
  return {
    source_text,
    source_content_hash,
    source_byte_hash,
    source_url,
    source_version,
    provider_hash: document.text_hash ? String(document.text_hash) : null,
    extractor_version,
    source_metadata: {
      docket_bill_id: source_bill_id,
      jurisdiction: cached.bill.state ?? null,
      bill_number: cached.bill.bill_number ?? null,
      provider: "legiscan_get_bill",
      provider_document_id: Number(doc_id),
      provider_document_type: document_type,
      provider_text_hash: document.text_hash ?? null,
      provider_text_size: document.text_size ?? null,
      docket_source_url: source_url,
      docket_source_content_type: pdf.content_type,
      extraction_text_url,
      extraction_text_byte_hash,
      fetched_at: cached.fetched_at,
    },
  };
}

async function invoke_rosetta_extraction(
  source_document_id: number,
  source: extracted_source,
  reference_date: string,
): Promise<rosetta_extraction_receipt> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${base_url}/rest/v1/rpc/run_rosetta_v3_extraction`, {
    method: "POST",
    headers: {
      apikey: service_role_key,
      authorization: `Bearer ${service_role_key}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_source_document_id: source_document_id,
      p_source_text: source.source_text,
      p_expected_source_content_hash: source.source_content_hash,
      p_source_url: source.source_url,
      p_source_version: source.source_version,
      p_media_type: "application/pdf",
      p_source_byte_hash: source.source_byte_hash,
      p_source_provider_hash: source.provider_hash,
      p_reference_date: reference_date,
      p_text_extractor_version: source.extractor_version,
      p_source_metadata: source.source_metadata,
    }),
  });
  if (!response.ok) {
    const preview = (await response.text()).slice(0, 1_000);
    throw new Error(`rosetta_extraction_failed:${response.status}:${preview}`);
  }
  const payload: unknown = await response.json();
  const receipt = Array.isArray(payload) ? payload[0] : payload;
  if (!as_record(receipt)) throw new Error("invalid_rosetta_extraction_receipt");
  return receipt as unknown as rosetta_extraction_receipt;
}

function deterministic_reference_date(cached: cached_docket_bill): string {
  const fetched = cached.fetched_at.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fetched)) return fetched;
  const fallback = String(cached.bill.status_date ?? cached.bill.last_action_date ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fallback)) return fallback;
  throw new Error("docket_reference_date_unavailable");
}

export async function run_docket_bill_through_rosetta(
  source_bill_id: number,
): Promise<{ ingestion: rosetta_source_ingestion_result; extraction: rosetta_extraction_receipt }> {
  const ingestion = await ingest_docket_bill_to_rosetta_source(source_bill_id);
  const cached = await load_cached_docket_bill(source_bill_id);
  const document = select_official_document(cached.bill);
  const source = await extract_source(source_bill_id, cached, document);
  const extraction = await invoke_rosetta_extraction(
    ingestion.source_document_id,
    source,
    deterministic_reference_date(cached),
  );

  if (extraction.source_document_id !== ingestion.source_document_id) {
    throw new Error("rosetta_extraction_source_document_mismatch");
  }
  if (extraction.run_status !== "completed" || extraction.admissibility_state !== "admissible") {
    throw new Error(`rosetta_extraction_not_admissible:${extraction.run_status}:${extraction.admissibility_state}`);
  }
  if (!extraction.output_content_hash) throw new Error("rosetta_extraction_output_hash_missing");

  return { ingestion, extraction };
}

export async function process_docket_bill_through_rosetta_and_genome(
  source_bill_id: number,
): Promise<docket_rosetta_pipeline_result> {
  const { ingestion, extraction } = await run_docket_bill_through_rosetta(source_bill_id);
  const assembly = await assemble_rosetta_and_resolve_family({
    genome_bill_id: ingestion.genome_bill_id,
    source_document_id: ingestion.source_document_id,
    extraction_run_id: extraction.extraction_run_id,
  });

  return {
    source_bill_id,
    genome_bill_id: ingestion.genome_bill_id,
    ingestion,
    extraction,
    assembly,
  };
}
