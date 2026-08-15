import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";

import { getPool } from "./db";
import {
  assemble_rosetta_and_resolve_family,
  type rosetta_family_orchestration_result,
} from "./civic-genome-rosetta-family-orchestration";
import {
  derive_california_official_text_url,
  normalize_official_html,
  normalize_wa_official_html,
  type rosetta_extraction_receipt,
} from "./civic-genome-rosetta-extraction";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";
import { fetch_california_official_pdf } from "./california-legislative-source";

const PDF_PARSE_VERSION = "2.4.5";
const WA_HTML_EXTRACTOR_VERSION = "wa-official-legislative-version-html-strip-v1";
const OFFICIAL_HTML_EXTRACTOR_VERSION = "official-legislative-version-html-strip-v1";
const PDF_EXTRACTOR_VERSION = `pdf-parse-${PDF_PARSE_VERSION}-legislative-version-v1`;
const CA_PDF_EXTRACTOR_VERSION = `ca-official-legislative-version-pdf-v1+${PDF_EXTRACTOR_VERSION}`;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const SOURCE_FETCH_TIMEOUT_MS = 30_000;
const ROSETTA_CORPUS_NAME = "Lighthouse Docket Legislative Versions";
const ROSETTA_CORPUS_TYPE = "legislative_version";

export type legislative_version_processing_result = {
  bill_version_id: string;
  genome_bill_id: string;
  source_document_key: string;
  source_bill_id: number;
  document_family: "text" | "amendment";
  version_type: string;
  rosetta_source_document_id: number;
  extraction: rosetta_extraction_receipt;
  assembly: rosetta_family_orchestration_result;
};

type legislative_version_row = {
  bill_version_id: string;
  genome_bill_id: string;
  source_document_key: string;
  source_bill_id: number;
  document_family: "text" | "amendment";
  version_type: string;
  provider_sequence: number;
  stage_rank: number;
  chamber: string | null;
  predecessor_bill_version_id: string | null;
  base_bill_version_id: string | null;
  provider_document_id: string;
  provider_document_type: string;
  source_url: string;
  provider_url: string | null;
  provider_hash: string | null;
  provider_size: string | null;
  provider_date: string | null;
  adopted: boolean | null;
  description: string | null;
  predecessor_source_document_key: string | null;
  base_source_document_key: string | null;
  latest_metadata: Record<string, unknown>;
  latest_observed_at: string;
  source_bill_number: string;
  source_bill_title: string | null;
};

type extracted_legislative_source = {
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

type rosetta_row = Record<string, unknown>;

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

async function fetch_bytes(
  url: string,
  required = true,
): Promise<{ bytes: Buffer; content_type: string | null } | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "application/pdf,text/html;q=0.9,*/*;q=0.1" },
      signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const source_host = new URL(url).hostname.toLowerCase();
    const cause = error instanceof Error && error.cause && typeof error.cause === "object"
      && "code" in error.cause
      ? String(error.cause.code)
      : error instanceof Error
        ? error.name
        : "unknown";
    throw new Error(`legislative_version_source_fetch_network_failed:${source_host}:${cause}`);
  }
  if (!response.ok) {
    if (!required) return null;
    throw new Error(`legislative_version_source_fetch_failed:${response.status}`);
  }
  const content_length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(content_length) && content_length > MAX_SOURCE_BYTES) {
    throw new Error("legislative_version_source_exceeds_max_bytes");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("legislative_version_source_empty");
  if (bytes.length > MAX_SOURCE_BYTES) {
    throw new Error("legislative_version_source_exceeds_max_bytes");
  }
  return { bytes, content_type: response.headers.get("content-type") };
}

function derive_wa_official_html_url(pdf_url: string): string | null {
  if (!pdf_url.includes("lawfilesext.leg.wa.gov/")) return null;
  if (!/\/Pdf\//i.test(pdf_url) || !/\.pdf$/i.test(pdf_url)) return null;
  return pdf_url.replace(/\/Pdf\//i, "/Htm/").replace(/\.pdf$/i, ".htm");
}

async function extract_pdf_text(pdf_bytes: Buffer): Promise<string> {
  if (pdf_bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("legislative_version_source_is_not_pdf");
  }
  const parser = new PDFParse({ data: pdf_bytes });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\r\n?/g, "\n").trimEnd();
    if (text.trim().length < 200) {
      throw new Error("legislative_version_pdf_text_incomplete");
    }
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

async function load_version(bill_version_id: string): Promise<legislative_version_row> {
  const result = await getPool().query<legislative_version_row>(
    `select version.bill_version_id::text,
            version.genome_bill_id::text,
            version.source_document_key,
            version.source_bill_id,
            version.document_family,
            version.version_type,
            version.provider_sequence,
            version.stage_rank,
            version.chamber,
            version.predecessor_bill_version_id::text,
            version.base_bill_version_id::text,
            document.provider_document_id::text,
            document.provider_document_type,
            document.source_url,
            document.provider_url,
            document.provider_hash,
            document.provider_size::text,
            document.provider_date::text,
            document.adopted,
            document.description,
            document.predecessor_source_document_key,
            document.base_source_document_key,
            document.latest_metadata,
            document.latest_observed_at::text,
            bill.source_bill_number,
            bill.source_bill_title
       from public.civic_genome_bill_version version
       join public.docket_bill_source_document document
         on document.source_document_key = version.source_document_key
       join public.civic_genome_bill bill
         on bill.genome_bill_id = version.genome_bill_id
      where version.bill_version_id = $1::uuid`,
    [bill_version_id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("legislative_version_not_found");
  return row;
}

async function rosetta_request(
  path: string,
  init: RequestInit,
): Promise<rosetta_row[]> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key, init.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");

  const response = await fetch(`${base_url}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const preview = (await response.text()).slice(0, 1_000);
    throw new Error(`legislative_version_rosetta_request_failed:${response.status}:${preview}`);
  }
  if (response.status === 204) return [];
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("invalid_legislative_version_rosetta_response");
  return payload as rosetta_row[];
}

async function ensure_rosetta_corpus(): Promise<number> {
  const query = new URLSearchParams({
    select: "id",
    corpus_name: `eq.${ROSETTA_CORPUS_NAME}`,
    corpus_type: `eq.${ROSETTA_CORPUS_TYPE}`,
    limit: "1",
  });
  const existing = await rosetta_request(`corpus?${query.toString()}`, { method: "GET" });
  if (existing[0]?.id !== undefined) return Number(existing[0].id);

  const created = await rosetta_request("corpus", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      corpus_name: ROSETTA_CORPUS_NAME,
      corpus_type: ROSETTA_CORPUS_TYPE,
    }),
  });
  if (created[0]?.id === undefined) throw new Error("legislative_version_rosetta_corpus_missing_id");
  return Number(created[0].id);
}

async function ensure_rosetta_source_document(
  version: legislative_version_row,
): Promise<number> {
  const corpus_id = await ensure_rosetta_corpus();
  const identifier = `docket:${version.source_bill_id}:${version.source_document_key}`;
  const query = new URLSearchParams({
    select: "id",
    corpus_id: `eq.${corpus_id}`,
    document_identifier: `eq.${identifier}`,
    limit: "1",
  });
  const existing = await rosetta_request(`source_document?${query.toString()}`, { method: "GET" });
  if (existing[0]?.id !== undefined) return Number(existing[0].id);

  const created = await rosetta_request("source_document", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      corpus_id,
      document_name: `${version.source_bill_number}: ${version.provider_document_type} — ${version.source_bill_title ?? "Untitled bill"}`,
      document_type: version.document_family === "text" ? "bill_version" : "bill_amendment",
      document_identifier: identifier,
    }),
  });
  if (created[0]?.id === undefined) {
    throw new Error("legislative_version_rosetta_source_document_missing_id");
  }
  return Number(created[0].id);
}

function deterministic_reference_date(version: legislative_version_row): string {
  const provider_date = String(version.provider_date ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(provider_date)) return provider_date;
  const observed = String(version.latest_observed_at ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(observed)) return observed;
  throw new Error("legislative_version_reference_date_unavailable");
}

async function extract_version_source(
  version: legislative_version_row,
): Promise<extracted_legislative_source> {
  const selected_source_url = version.source_url.trim();
  if (!selected_source_url.startsWith("https://")) {
    throw new Error("legislative_version_source_url_invalid");
  }

  const california_page_url = derive_california_official_text_url(selected_source_url);
  const california_pdf = california_page_url
    ? await fetch_california_official_pdf(selected_source_url)
    : null;
  const source_url = california_pdf?.source_url ?? selected_source_url;
  const official = california_pdf
    ? { bytes: california_pdf.bytes, content_type: "application/pdf" }
    : await fetch_bytes(source_url, true);
  if (!official) throw new Error("legislative_version_source_fetch_missing");

  const source_byte_hash = sha256(official.bytes);
  const is_pdf = official.bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const html_url = is_pdf && !california_pdf
    ? derive_wa_official_html_url(source_url)
    : null;

  let source_text: string;
  let extractor_version: string;
  let media_type: string;
  let extraction_text_url = source_url;
  let extraction_text_byte_hash = source_byte_hash;

  if (html_url) {
    const html = await fetch_bytes(html_url, false);
    if (html) {
      source_text = normalize_wa_official_html(html.bytes.toString("utf8"));
      if (source_text.trim().length < 200) {
        throw new Error("legislative_version_html_text_incomplete");
      }
      extractor_version = WA_HTML_EXTRACTOR_VERSION;
      media_type = "application/pdf";
      extraction_text_url = html_url;
      extraction_text_byte_hash = sha256(html.bytes);
    } else {
      source_text = await extract_pdf_text(official.bytes);
      extractor_version = PDF_EXTRACTOR_VERSION;
      media_type = "application/pdf";
    }
  } else if (is_pdf) {
    source_text = await extract_pdf_text(official.bytes);
    extractor_version = california_pdf
      ? CA_PDF_EXTRACTOR_VERSION
      : PDF_EXTRACTOR_VERSION;
    media_type = "application/pdf";
  } else if (source_is_html(official.bytes, official.content_type)) {
    source_text = normalize_official_html(official.bytes.toString("utf8"));
    extractor_version = OFFICIAL_HTML_EXTRACTOR_VERSION;
    media_type = "text/html";
  } else {
    throw new Error("legislative_version_source_format_unsupported");
  }

  const family_prefix = version.document_family === "text"
    ? "legiscan_text"
    : "legiscan_amendment";
  const source_version = `${family_prefix}:${version.provider_document_id}:${version.provider_document_type}:${extractor_version}`;
  const source_content_hash = sha256(source_text);

  return {
    source_text,
    source_content_hash,
    source_byte_hash,
    source_url,
    source_version,
    media_type,
    provider_hash: version.provider_hash,
    extractor_version,
    source_metadata: {
      docket_bill_id: version.source_bill_id,
      docket_source_document_key: version.source_document_key,
      docket_document_family: version.document_family,
      docket_version_type: version.version_type,
      docket_provider_sequence: version.provider_sequence,
      docket_stage_rank: version.stage_rank,
      docket_chamber: version.chamber,
      docket_predecessor_source_document_key: version.predecessor_source_document_key,
      docket_base_source_document_key: version.base_source_document_key,
      docket_provider_document_id: Number(version.provider_document_id),
      docket_provider_document_type: version.provider_document_type,
      docket_provider_hash: version.provider_hash,
      docket_provider_size: version.provider_size ? Number(version.provider_size) : null,
      docket_provider_date: version.provider_date,
      docket_adopted: version.adopted,
      docket_description: version.description,
      docket_provider_url: version.provider_url,
      docket_source_url: source_url,
      extraction_text_url,
      extraction_text_byte_hash,
      source_url_rewritten: source_url !== selected_source_url,
      california_bill_page_url: california_pdf?.bill_page_url ?? null,
      california_session_bootstrapped: california_pdf?.session_bootstrapped ?? false,
      registered_metadata: version.latest_metadata,
      registered_observed_at: version.latest_observed_at,
    },
  };
}

async function invoke_rosetta_extraction(
  source_document_id: number,
  source: extracted_legislative_source,
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
    throw new Error(`legislative_version_rosetta_extraction_failed:${response.status}:${preview}`);
  }
  const payload: unknown = await response.json();
  const receipt = Array.isArray(payload) ? payload[0] : payload;
  if (!as_record(receipt)) throw new Error("invalid_legislative_version_extraction_receipt");
  return receipt as unknown as rosetta_extraction_receipt;
}

async function record_source_ingested(
  bill_version_id: string,
  source_document_id: number,
  source: extracted_legislative_source,
): Promise<void> {
  await getPool().query(
    `update public.civic_genome_bill_version
        set rosetta_source_document_id = $2,
            processing_state = 'source_ingested',
            failure_code = null,
            receipt_json = receipt_json || jsonb_build_object(
              'source_document_id', $2::bigint,
              'source_version', $3::text,
              'source_url', $4::text,
              'source_content_hash', $5::text,
              'source_byte_hash', $6::text,
              'text_extractor_version', $7::text
            ),
            updated_at = now()
      where bill_version_id = $1::uuid`,
    [
      bill_version_id,
      source_document_id,
      source.source_version,
      source.source_url,
      source.source_content_hash,
      source.source_byte_hash,
      source.extractor_version,
    ],
  );
}

async function record_extracted(
  bill_version_id: string,
  extraction: rosetta_extraction_receipt,
): Promise<void> {
  await getPool().query(
    `update public.civic_genome_bill_version
        set rosetta_extraction_run_id = $2,
            processing_state = 'extracted',
            failure_code = null,
            receipt_json = receipt_json || jsonb_build_object(
              'rosetta_extraction_run_id', $2::text,
              'rosetta_engine_version', $3::text,
              'rosetta_rule_set_version', $4::text,
              'rosetta_rule_manifest_hash', $5::text,
              'rosetta_configuration_hash', $6::text,
              'rosetta_output_content_hash', $7::text,
              'rosetta_run_version', $8::integer,
              'rosetta_replayed', $9::boolean
            ),
            updated_at = now()
      where bill_version_id = $1::uuid`,
    [
      bill_version_id,
      String(extraction.extraction_run_id),
      extraction.engine_version,
      extraction.rule_set_version,
      extraction.rule_manifest_hash,
      extraction.configuration_hash,
      extraction.output_content_hash,
      extraction.run_version,
      extraction.replayed,
    ],
  );
}

async function record_assembled(
  bill_version_id: string,
  assembly: rosetta_family_orchestration_result,
): Promise<void> {
  await getPool().query(
    `update public.civic_genome_bill_version
        set assembly_run_id = $2::uuid,
            processing_state = 'assembled',
            failure_code = null,
            receipt_json = receipt_json || jsonb_build_object(
              'assembly_run_id', $2::uuid,
              'assembly_engine_version', 'rosetta-genome-assembly-v1',
              'assembly_rule_version', 'rosetta-five-layer-trait-map-v1',
              'assembly_input_hash', $3::text,
              'assembly_output_hash', $4::text,
              'assembly_trait_count', $5::integer,
              'assembly_verification_state', $6::text,
              'assembly_replayed', $7::boolean,
              'family_resolution_status', $8::text
            ),
            updated_at = now()
      where bill_version_id = $1::uuid`,
    [
      bill_version_id,
      assembly.assembly_run_id,
      assembly.input_hash,
      assembly.output_hash,
      assembly.trait_count,
      assembly.verification_state,
      assembly.replayed,
      assembly.family_resolution.status,
    ],
  );
}

export async function process_legislative_version(
  bill_version_id: string,
): Promise<legislative_version_processing_result> {
  const version = await load_version(bill_version_id);
  const source_document_id = await ensure_rosetta_source_document(version);
  const source = await extract_version_source(version);
  await record_source_ingested(bill_version_id, source_document_id, source);

  const extraction = await invoke_rosetta_extraction(
    source_document_id,
    source,
    deterministic_reference_date(version),
  );
  if (extraction.source_document_id !== source_document_id) {
    throw new Error("legislative_version_extraction_source_document_mismatch");
  }
  if (extraction.run_status !== "completed" || extraction.admissibility_state !== "admissible") {
    throw new Error(
      `legislative_version_extraction_not_admissible:${extraction.run_status}:${extraction.admissibility_state}`,
    );
  }
  if (!extraction.output_content_hash) {
    throw new Error("legislative_version_extraction_output_hash_missing");
  }
  await record_extracted(bill_version_id, extraction);

  const assembly = await assemble_rosetta_and_resolve_family({
    genome_bill_id: version.genome_bill_id,
    source_document_id,
    extraction_run_id: extraction.extraction_run_id,
  });
  await record_assembled(bill_version_id, assembly);

  return {
    bill_version_id,
    genome_bill_id: version.genome_bill_id,
    source_document_key: version.source_document_key,
    source_bill_id: version.source_bill_id,
    document_family: version.document_family,
    version_type: version.version_type,
    rosetta_source_document_id: source_document_id,
    extraction,
    assembly,
  };
}
