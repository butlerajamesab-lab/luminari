import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";

import { getPool } from "./db";
import { get_bill } from "./services/legiscan";
import {
  ingest_docket_bill_to_rosetta_source,
  type rosetta_source_ingestion_result,
} from "./civic-genome-rosetta-source-ingestion";
import {
  assemble_rosetta_and_resolve_family,
  type rosetta_family_orchestration_result,
} from "./civic-genome-rosetta-family-orchestration";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";
import { fetch_california_official_pdf } from "./california-legislative-source";

const PDF_PARSE_VERSION = "2.4.5";
const WA_HTML_EXTRACTOR_VERSION = "wa-official-session-law-html-strip-v1";
const OFFICIAL_HTML_EXTRACTOR_VERSION = "official-legislative-html-strip-v1";
const PDF_EXTRACTOR_VERSION = `pdf-parse-${PDF_PARSE_VERSION}-getText-v1`;
const CA_PDF_EXTRACTOR_VERSION = `ca-official-bill-pdf-v1+${PDF_EXTRACTOR_VERSION}`;
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
  mime?: string;
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
  media_type: string;
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

export function select_official_document(bill: docket_bill_payload): docket_text_document {
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

async function load_or_refresh_cached_docket_bill(
  source_bill_id: number,
): Promise<cached_docket_bill> {
  const pool = getPool();
  const { rows } = await pool.query<cached_docket_bill>(
    `select bill, fetched_at::text
       from public.docket_bill_detail_cache
      where bill_id = $1
      order by fetched_at desc
      limit 1`,
    [source_bill_id],
  );
  const existing = rows[0];
  if (existing && as_record(existing.bill)) return existing;

  const refreshed = await get_bill(source_bill_id);
  if (!as_record(refreshed)) throw new Error("docket_bill_detail_refresh_invalid");
  const fetched_at = new Date().toISOString();

  await pool.query(
    `insert into public.docket_bill_detail_cache
       (bill_id, bill, fetched_at, source, created_at, updated_at)
     values ($1, $2::jsonb, $3::timestamptz, 'legiscan_get_bill', now(), now())
     on conflict (bill_id) do update
       set bill = excluded.bill,
           fetched_at = excluded.fetched_at,
           source = excluded.source,
           updated_at = now()`,
    [source_bill_id, JSON.stringify(refreshed), fetched_at],
  );

  return {
    bill: refreshed as docket_bill_payload,
    fetched_at,
  };
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

/**
 * California's state_link uses a client-side JSF billText route whose
 * fragment is not sent to the server. The official billNav route is the
 * server-rendered text surface for the same bill identity.
 */
export function derive_california_official_text_url(source_url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(source_url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== "leginfo.legislature.ca.gov") return null;
  if (!/\/faces\/billTextClient\.xhtml$/i.test(parsed.pathname)) return null;
  const bill_id = parsed.searchParams.get("bill_id")?.trim();
  if (!bill_id) return null;
  const canonical = new URL("https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml");
  canonical.searchParams.set("bill_id", bill_id);
  return canonical.toString();
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

function decode_html_entities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const value = Number(code);
      return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const value = Number.parseInt(code, 16);
      return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : " ";
    });
}

/**
 * Deterministic structural extraction for official legislative HTML sources.
 * It removes executable/page-navigation containers, preserves visible source
 * order, decodes declared entities, and normalizes whitespace only. It does not
 * paraphrase, summarize, or infer legal meaning.
 */
export function normalize_official_html(html: string): string {
  const body_match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const body = body_match?.[1] ?? html;
  const without_chrome = body
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|button)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|tr|li|h[1-6]|pre|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const normalized = decode_html_entities(without_chrome)
    .replace(/\r/g, "")
    .replace(/[ \t\n\v\f]+/g, " ")
    .trim();
  if (normalized.length < 200) throw new Error("docket_html_text_incomplete");
  return normalized;
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

function source_is_html(bytes: Buffer, content_type: string | null): boolean {
  if (String(content_type ?? "").toLowerCase().includes("html")) return true;
  const prefix = bytes.subarray(0, Math.min(bytes.length, 512)).toString("utf8").toLowerCase();
  return prefix.includes("<!doctype html") || prefix.includes("<html") || prefix.includes("<body");
}

async function extract_source(
  source_bill_id: number,
  cached: cached_docket_bill,
  document: docket_text_document,
): Promise<extracted_source> {
  const selected_source_url = String(document.state_link ?? "").trim();
  const doc_id = String(document.doc_id ?? "").trim();
  const document_type = String(document.type ?? "official").trim() || "official";
  if (!selected_source_url || !doc_id) throw new Error("docket_document_identity_incomplete");

  const california_page_url = derive_california_official_text_url(selected_source_url);
  const california_pdf = california_page_url
    ? await fetch_california_official_pdf(selected_source_url)
    : null;
  const source_url = california_pdf?.source_url ?? selected_source_url;
  const official = california_pdf
    ? { bytes: california_pdf.bytes, content_type: "application/pdf" }
    : await fetch_bytes(source_url);
  const source_byte_hash = sha256(official.bytes);
  const is_pdf = official.bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const html_url = is_pdf && !california_pdf
    ? derive_wa_official_html_url(source_url)
    : null;

  let source_text: string;
  let source_version: string;
  let extractor_version: string;
  let media_type: string;
  let extraction_text_url: string = source_url;
  let extraction_text_byte_hash: string = source_byte_hash;

  if (html_url) {
    const html = await fetch_bytes(html_url);
    const html_text = html.bytes.toString("utf8");
    source_text = normalize_wa_official_html(html_text);
    if (source_text.trim().length < 200) throw new Error("docket_html_text_incomplete");
    source_version = `legiscan_text:${doc_id}:${document_type}`;
    extractor_version = WA_HTML_EXTRACTOR_VERSION;
    media_type = "application/pdf";
    extraction_text_url = html_url;
    extraction_text_byte_hash = sha256(html.bytes);
  } else if (is_pdf) {
    source_text = await extract_pdf_text(official.bytes);
    source_version = california_pdf
      ? `legiscan_text:${doc_id}:${document_type}:${CA_PDF_EXTRACTOR_VERSION}`
      : `legiscan_text:${doc_id}:${document_type}:${PDF_EXTRACTOR_VERSION}`;
    extractor_version = california_pdf
      ? CA_PDF_EXTRACTOR_VERSION
      : PDF_EXTRACTOR_VERSION;
    media_type = "application/pdf";
  } else if (source_is_html(official.bytes, official.content_type)) {
    source_text = normalize_official_html(official.bytes.toString("utf8"));
    source_version = `legiscan_text:${doc_id}:${document_type}:${OFFICIAL_HTML_EXTRACTOR_VERSION}`;
    extractor_version = OFFICIAL_HTML_EXTRACTOR_VERSION;
    media_type = "text/html";
  } else {
    throw new Error("docket_official_source_format_unsupported");
  }

  const source_content_hash = sha256(source_text);
  return {
    source_text,
    source_content_hash,
    source_byte_hash,
    source_url,
    source_version,
    media_type,
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
      provider_state_link: selected_source_url,
      source_url_rewritten: source_url !== selected_source_url,
      california_bill_page_url: california_pdf?.bill_page_url ?? null,
      california_session_bootstrapped: california_pdf?.session_bootstrapped ?? false,
      docket_source_content_type: official.content_type,
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
  const headers = create_rosetta_supabase_headers(service_role_key, {
    accept: "application/json",
    "content-type": "application/json",
  });
  const response = await fetch(`${base_url}/rest/v1/rpc/run_rosetta_v3_extraction`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_source_document_id: source_document_id,
      p_source_text: source.source_text,
      p_expected_source_content_hash: source.source_content_hash,
      p_source_url: source.source_url,
      p_source_version: source.source_version,
      p_media_type: source.media_type,
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
  // Validate and hash the official source before a Rosetta extraction attempt is
  // created. This prevents source-fetch or parser failures from leaving an
  // indefinitely in-progress handoff row.
  const cached = await load_or_refresh_cached_docket_bill(source_bill_id);
  const document = select_official_document(cached.bill);
  const source = await extract_source(source_bill_id, cached, document);
  const ingestion = await ingest_docket_bill_to_rosetta_source(source_bill_id);
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
