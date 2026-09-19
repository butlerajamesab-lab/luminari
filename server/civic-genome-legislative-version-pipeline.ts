import { load_rosetta_current_docket_result_for_binding } from "./civic-genome-rosetta-evaluation";
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
import { get_amendment, get_bill_text } from "./services/legiscan";
import { assert_legislative_document_role } from "./legislative-document-role";
import {
  resolve_amendment_base,
  type amendment_base_candidate,
  type amendment_base_resolution,
} from "./civic-genome-amendment-attachment";
import {
  assert_official_source_response,
  is_official_source_rejection_error,
} from "./official-source-response";

const PDF_PARSE_VERSION = "2.4.5";
const WA_HTML_EXTRACTOR_VERSION = "wa-official-legislative-version-html-strip-v1";
const OFFICIAL_HTML_EXTRACTOR_VERSION = "official-legislative-version-html-strip-v1";
const PDF_EXTRACTOR_VERSION = `pdf-parse-${PDF_PARSE_VERSION}-legislative-version-v1`;
const CA_PDF_EXTRACTOR_VERSION = `ca-official-legislative-version-pdf-v1+${PDF_EXTRACTOR_VERSION}`;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const SOURCE_FETCH_TIMEOUT_MS = 30_000;
const ROSETTA_REQUEST_TIMEOUT_MS = 150_000;
const ROSETTA_CORPUS_NAME = "Lighthouse Docket Legislative Versions";
const ROSETTA_CORPUS_TYPE = "legislative_version";
const PROVIDER_COPY_FALLBACK_VERSION = "legiscan-api-hash-checked-provider-copy-v2";
const PROVIDER_COPY_HOSTS = new Set(["legiscan.com", "www.legiscan.com"]);
const MAX_PROVIDER_COPY_BASE64_LENGTH = Math.ceil(MAX_SOURCE_BYTES / 3) * 4;

export const LEGISLATIVE_VERSION_PROVIDER_SHARED_OUTAGE_ERROR_CODE =
  "legislative_version_provider_fallback_shared_service_unavailable";

export type current_legislative_extraction_receipt = Omit<rosetta_extraction_receipt, "run_version" | "replayed"> & {
  run_version: null;
  replayed: null;
  receipt_source: "current_docket_projection";
};

export type legislative_version_processing_result = {
  bill_version_id: string;
  genome_bill_id: string;
  source_document_key: string;
  source_bill_id: number;
  document_family: "text" | "amendment";
  version_type: string;
  rosetta_source_document_id: number;
  extraction: current_legislative_extraction_receipt;
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
  receipt_json: Record<string, unknown>;
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
  state_code?: string | null;
  session_key?: string | null;
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

type provider_copy_contract = {
  locator_url: string;
  provider_document_id: number;
  document_family: "text" | "amendment";
  expected_md5: string;
  expected_size: number;
};

type provider_copy_retrieval_mode =
  | "legiscan_api_get_bill_text"
  | "legiscan_api_get_amendment";

type provider_copy_source = {
  bytes: Buffer;
  content_type: string | null;
  locator_url: string;
  api_document_id: number;
  retrieval_mode: provider_copy_retrieval_mode;
};

const PROVIDER_COPY_DOCUMENT_ID_FAILURE_CODES = new Set([
  "invalid_legiscan_bill_text_response_document_id",
  "invalid_legiscan_amendment_response_id",
]);

const PROVIDER_COPY_DOCUMENT_PAYLOAD_FAILURE_CODES = new Set([
  "invalid_legiscan_bill_text_payload",
  "invalid_legiscan_amendment_payload",
]);

const PROVIDER_COPY_DOCUMENT_UNAVAILABLE_FAILURE_CODES = new Set([
  "legiscan_record_api_error_while_calling_get_bill_text",
  "legiscan_record_api_error_while_calling_get_amendment",
]);

function provider_copy_document_failure_code(error: unknown): string | null {
  const error_code = error instanceof Error ? error.message : "";
  if (PROVIDER_COPY_DOCUMENT_ID_FAILURE_CODES.has(error_code)) {
    return "legislative_version_provider_fallback_document_id_mismatch";
  }
  if (PROVIDER_COPY_DOCUMENT_PAYLOAD_FAILURE_CODES.has(error_code)) {
    return "legislative_version_provider_fallback_api_payload_invalid";
  }
  if (PROVIDER_COPY_DOCUMENT_UNAVAILABLE_FAILURE_CODES.has(error_code)) {
    return "legislative_version_provider_fallback_document_unavailable";
  }
  return null;
}

type rosetta_amendment_attachment_receipt = {
  contract: "rosetta-current-amendment-attachment-receipt-v1";
  receipt_id: string;
  receipt_hash: string;
  source_content_id: string;
  source_document_key: string;
  source_content_hash: string;
  base_source_document_key: string;
  base_source_content_hash: string;
  relationship_basis: "official_explicit_reference" | "reviewed_exact_attachment";
  attachment_state: "proposed" | "adopted" | "incorporated";
  attachment_evidence_hash: string;
  registered: boolean;
  replayed: boolean;
  recorded_at: string;
};

type amendment_attachment_context = {
  resolution: amendment_base_resolution;
  attachment_state: "proposed" | "adopted" | null;
};

type rosetta_source_content_receipt = {
  contract: "rosetta-durable-source-content-v1";
  source_document_id: number;
  source_content_id: string;
  source_identity_hash: string;
  source_content_hash: string;
  source_byte_hash: string | null;
  source_version: string;
  source_url: string;
  media_type: string;
  registered: boolean;
  replayed: boolean;
  registered_at: string;
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

function md5(value: Buffer): string {
  return createHash("md5").update(value).digest("hex");
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "application/pdf,text/html;q=0.9,*/*;q=0.1" },
      signal: controller.signal,
    });
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
    assert_official_source_response(response.status, bytes);
    return { bytes, content_type: response.headers.get("content-type") };
  } catch (error) {
    if (error instanceof Error && is_official_source_rejection_error(error.message)) {
      if (!required) return null;
      throw error;
    }
    if (
      error instanceof Error
      && error.message.startsWith("legislative_version_")
    ) {
      throw error;
    }
    if (!required) return null;
    const source_host = new URL(url).hostname.toLowerCase();
    if (controller.signal.aborted) {
      throw new Error(
        `legislative_version_source_fetch_timeout:${source_host}:${SOURCE_FETCH_TIMEOUT_MS}`,
      );
    }
    const cause = error instanceof Error && error.cause && typeof error.cause === "object"
      && "code" in error.cause
      ? String(error.cause.code)
      : error instanceof Error
        ? error.name
        : "unknown";
    throw new Error(
      `legislative_version_source_fetch_network_failed:${source_host}:${cause}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function validated_provider_copy_url(
  value: string,
  failure_code: "url_invalid" | "authority_invalid",
): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`legislative_version_provider_fallback_${failure_code}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:"
    || !PROVIDER_COPY_HOSTS.has(host)
    || (parsed.port !== "" && parsed.port !== "443")
    || parsed.username !== ""
    || parsed.password !== ""
  ) {
    throw new Error("legislative_version_provider_fallback_authority_invalid");
  }
  return parsed;
}

function provider_copy_contract_for(
  version: legislative_version_row,
  official_source_url: string,
): provider_copy_contract | null {
  const provider_url = String(version.provider_url ?? "").trim();
  const provider_hash = String(version.provider_hash ?? "").trim().toLowerCase();
  const provider_size_text = String(version.provider_size ?? "").trim();
  const provider_document_id = Number(
    String(version.provider_document_id ?? "").trim(),
  );

  if (!provider_url && !provider_hash && !provider_size_text) return null;
  if (!provider_url || !provider_hash || !provider_size_text) {
    throw new Error("legislative_version_provider_fallback_contract_incomplete");
  }
  if (!Number.isSafeInteger(provider_document_id) || provider_document_id <= 0) {
    throw new Error("legislative_version_provider_fallback_document_id_invalid");
  }

  const parsed = validated_provider_copy_url(provider_url, "url_invalid");
  if (parsed.toString() === official_source_url) {
    throw new Error("legislative_version_provider_fallback_not_distinct");
  }
  if (!/^[0-9a-f]{32}$/.test(provider_hash)) {
    throw new Error("legislative_version_provider_fallback_hash_invalid");
  }

  const expected_size = Number(provider_size_text);
  if (
    !Number.isSafeInteger(expected_size)
    || expected_size <= 0
    || expected_size > MAX_SOURCE_BYTES
  ) {
    throw new Error("legislative_version_provider_fallback_size_invalid");
  }

  return {
    locator_url: parsed.toString(),
    provider_document_id,
    document_family: version.document_family,
    expected_md5: provider_hash,
    expected_size,
  };
}

function verify_provider_copy_bytes(
  bytes: Buffer,
  contract: provider_copy_contract,
): void {
  if (bytes.length !== contract.expected_size) {
    throw new Error("legislative_version_provider_fallback_size_mismatch");
  }
  if (md5(bytes) !== contract.expected_md5) {
    throw new Error("legislative_version_provider_fallback_hash_mismatch");
  }
}

async function fetch_provider_copy(
  contract: provider_copy_contract,
): Promise<provider_copy_source> {
  let document: {
    doc: string;
    document_id: number | string;
    mime?: string;
    provider_size?: number | string;
    provider_hash?: string;
    retrieval_mode: provider_copy_retrieval_mode;
  };
  try {
    if (contract.document_family === "text") {
      const bill_text = await get_bill_text(contract.provider_document_id);
      document = {
        doc: bill_text.doc,
        document_id: bill_text.doc_id,
        mime: bill_text.mime,
        provider_size: bill_text.text_size,
        provider_hash: bill_text.text_hash,
        retrieval_mode: "legiscan_api_get_bill_text",
      };
    } else {
      const amendment = await get_amendment(contract.provider_document_id);
      document = {
        doc: amendment.doc,
        document_id: amendment.amendment_id,
        mime: amendment.mime,
        provider_size: amendment.amendment_size,
        provider_hash: amendment.amendment_hash,
        retrieval_mode: "legiscan_api_get_amendment",
      };
    }
  } catch (error) {
    const document_failure_code = provider_copy_document_failure_code(error);
    if (document_failure_code) throw new Error(document_failure_code);
    // The queue must treat every failure inside the authenticated provider
    // transport/envelope boundary as a shared-service outage. Stable
    // per-document payload and identity failures are mapped above, and byte
    // verification begins below, so none of those pause unrelated work.
    throw new Error(LEGISLATIVE_VERSION_PROVIDER_SHARED_OUTAGE_ERROR_CODE);
  }

  const returned_document_id = Number(document.document_id);
  if (
    !Number.isSafeInteger(returned_document_id)
    || returned_document_id !== contract.provider_document_id
  ) {
    throw new Error("legislative_version_provider_fallback_document_id_mismatch");
  }

  const encoded_document = document.doc.trim();
  if (
    !encoded_document
    || encoded_document.length > MAX_PROVIDER_COPY_BASE64_LENGTH
    || encoded_document.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded_document,
    )
  ) {
    throw new Error("legislative_version_provider_fallback_document_base64_invalid");
  }

  const bytes = Buffer.from(encoded_document, "base64");
  if (bytes.length === 0) {
    throw new Error("legislative_version_provider_fallback_empty");
  }
  if (
    bytes.length > MAX_SOURCE_BYTES
    || bytes.toString("base64") !== encoded_document
  ) {
    throw new Error("legislative_version_provider_fallback_document_base64_invalid");
  }

  if (document.provider_size !== undefined && document.provider_size !== null) {
    const returned_size = Number(document.provider_size);
    if (
      !Number.isSafeInteger(returned_size)
      || returned_size !== contract.expected_size
    ) {
      throw new Error("legislative_version_provider_fallback_api_size_mismatch");
    }
  }
  if (document.provider_hash !== undefined && document.provider_hash !== null) {
    const returned_hash = String(document.provider_hash).trim().toLowerCase();
    if (returned_hash !== contract.expected_md5) {
      throw new Error("legislative_version_provider_fallback_api_hash_mismatch");
    }
  }

  verify_provider_copy_bytes(bytes, contract);
  return {
    bytes,
    content_type: typeof document.mime === "string" && document.mime.trim()
      ? document.mime.trim()
      : null,
    locator_url: contract.locator_url,
    api_document_id: contract.provider_document_id,
    retrieval_mode: document.retrieval_mode,
  };
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
            version.receipt_json,
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
            bill.source_bill_title,
            bill.state_code,
            bill.session_key
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

async function load_amendment_base_candidates(
  version: legislative_version_row,
): Promise<amendment_base_candidate[]> {
  const result = await getPool().query<amendment_base_candidate>(
    `select candidate.bill_version_id::text,
            candidate.source_document_key,
            candidate.version_type,
            document.provider_document_type,
            candidate.provider_sequence,
            document.source_url,
            case
              when candidate.receipt_json->>'source_content_hash' ~ '^[0-9a-fA-F]{64}$'
                then lower(candidate.receipt_json->>'source_content_hash')
              else null
            end as source_content_hash
       from public.civic_genome_bill_version candidate
       join public.docket_bill_source_document document
         on document.source_document_key=candidate.source_document_key
      where candidate.genome_bill_id=$1::uuid
        and candidate.document_family='text'
      order by candidate.stage_rank,candidate.provider_sequence,candidate.bill_version_id`,
    [version.genome_bill_id],
  );
  return result.rows;
}

function amendment_attachment_state(
  version: legislative_version_row,
): "proposed" | "adopted" | null {
  if (version.adopted === true) return "adopted";
  if (version.adopted === false) return "proposed";
  const label = version.provider_document_type.toLowerCase();
  if (label.includes("adopted")) return "adopted";
  if (label.includes("proposed") || label.includes("draft")) return "proposed";
  return null;
}

async function persist_amendment_base_identity(
  version: legislative_version_row,
  base: amendment_base_candidate,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const source = await client.query<{ base_source_document_key: string | null }>(
      `select base_source_document_key
         from public.docket_bill_source_document
        where source_document_key=$1::text
        for update`,
      [version.source_document_key],
    );
    if (source.rows.length !== 1) {
      throw new Error("legislative_amendment_source_identity_missing");
    }
    const existing_source_base = source.rows[0].base_source_document_key;
    if (existing_source_base && existing_source_base !== base.source_document_key) {
      throw new Error("legislative_amendment_base_identity_conflict");
    }

    const genome = await client.query<{ base_bill_version_id: string | null }>(
      `select base_bill_version_id::text
         from public.civic_genome_bill_version
        where bill_version_id=$1::uuid
        for update`,
      [version.bill_version_id],
    );
    if (genome.rows.length !== 1) {
      throw new Error("legislative_amendment_genome_version_missing");
    }
    const existing_version_base = genome.rows[0].base_bill_version_id;
    if (existing_version_base && existing_version_base !== base.bill_version_id) {
      throw new Error("legislative_amendment_base_version_conflict");
    }

    await client.query(
      `update public.docket_bill_source_document
          set base_source_document_key=$2::text,
              updated_at=now()
        where source_document_key=$1::text
          and base_source_document_key is null`,
      [version.source_document_key, base.source_document_key],
    );
    await client.query(
      `update public.civic_genome_bill_version
          set base_bill_version_id=$2::uuid,
              updated_at=now()
        where bill_version_id=$1::uuid
          and base_bill_version_id is null`,
      [version.bill_version_id, base.bill_version_id],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

type amendment_source_basis = Pick<
  extracted_legislative_source,
  "source_text" | "source_content_hash" | "source_url"
>;

async function resolve_current_amendment_attachment(
  version: legislative_version_row,
  source: amendment_source_basis,
): Promise<amendment_attachment_context | null> {
  if (version.document_family !== "amendment") return null;
  const candidates = await load_amendment_base_candidates(version);
  const resolution = resolve_amendment_base({
    source_text: source.source_text,
    source_bill_number: version.source_bill_number,
    state_code: version.state_code,
    amendment_source_document_key: version.source_document_key,
    amendment_source_content_hash: source.source_content_hash,
    amendment_source_url: source.source_url,
    candidates,
  });
  if (resolution.status === "resolved" || resolution.status === "awaiting_base_content") {
    await persist_amendment_base_identity(version, resolution.base);
  }
  return {
    resolution,
    attachment_state: amendment_attachment_state(version),
  };
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${base_url}/rest/v1/${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const response_body = response.status === 204 ? "" : await response.text();
    if (!response.ok) {
      throw new Error(
        `legislative_version_rosetta_request_failed:${response.status}:${response_body.slice(0, 1_000)}`,
      );
    }
    if (response.status === 204) return [];

    let payload: unknown;
    try {
      payload = JSON.parse(response_body);
    } catch {
      throw new Error("invalid_legislative_version_rosetta_response_json");
    }
    if (!Array.isArray(payload)) {
      throw new Error("invalid_legislative_version_rosetta_response");
    }
    return payload as rosetta_row[];
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.startsWith("legislative_version_rosetta_request_failed:")
        || error.message.startsWith("invalid_legislative_version_rosetta_response")
      )
    ) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new Error(
        `legislative_version_rosetta_request_timeout:${ROSETTA_REQUEST_TIMEOUT_MS}`,
      );
    }
    const cause = error instanceof Error ? error.name : "unknown";
    throw new Error(`legislative_version_rosetta_request_network_failed:${cause}`);
  } finally {
    clearTimeout(timeout);
  }
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

export async function extract_version_source(
  version: legislative_version_row,
): Promise<extracted_legislative_source> {
  assert_legislative_document_role(version);
  const selected_source_url = version.source_url.trim();
  if (!selected_source_url.startsWith("https://")) {
    throw new Error("legislative_version_source_url_invalid");
  }

  let california_pdf:
    | Awaited<ReturnType<typeof fetch_california_official_pdf>>
    | null = null;
  let source_url = selected_source_url;
  let source_fetch_mode: "official" | "provider_copy_fallback" = "official";
  let official_fetch_error: string | null = null;
  let provider_copy_api_document_id: number | null = null;
  let provider_copy_retrieval_mode: provider_copy_retrieval_mode | null = null;
  let official: { bytes: Buffer; content_type: string | null } | null;

  try {
    const california_page_url = derive_california_official_text_url(selected_source_url);
    california_pdf = california_page_url
      ? await fetch_california_official_pdf(selected_source_url)
      : null;
    source_url = california_pdf?.source_url ?? selected_source_url;
    official = california_pdf
      ? { bytes: california_pdf.bytes, content_type: "application/pdf" }
      : await fetch_bytes(source_url, true);
  } catch (error) {
    const fallback = provider_copy_contract_for(version, selected_source_url);
    if (!fallback) throw error;

    official_fetch_error = error instanceof Error ? error.message : "unknown";
    california_pdf = null;
    const provider_copy = await fetch_provider_copy(fallback);
    source_url = provider_copy.locator_url;
    provider_copy_api_document_id = provider_copy.api_document_id;
    provider_copy_retrieval_mode = provider_copy.retrieval_mode;
    official = provider_copy;
    source_fetch_mode = "provider_copy_fallback";
  }
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
  const source_version = [
    family_prefix,
    version.provider_document_id,
    version.provider_document_type,
    extractor_version,
    source_fetch_mode === "provider_copy_fallback"
      ? PROVIDER_COPY_FALLBACK_VERSION
      : null,
  ].filter(Boolean).join(":");
  const source_content_hash = sha256(source_text);
  const extraction_provenance =
    media_type.toLowerCase() === "text/html"
    || media_type.toLowerCase() === "application/xhtml+xml"
      ? {
          text_extractor_version: extractor_version,
          content_extraction_receipt: {
            contract: "rosetta-html-content-extraction-v1",
            extractor_version,
            raw_source_sha256: source_byte_hash,
            extracted_text_sha256: source_content_hash,
            navigation_removed: true,
            action_tables_removed: true,
            vote_chrome_removed: true,
            acquisition_source: "lighthouse-legiscan-current-source-v1",
            provider_copy_hash_verified:
              source_fetch_mode === "provider_copy_fallback",
            provider_copy_size_verified:
              source_fetch_mode === "provider_copy_fallback",
            extraction_text_url,
            extraction_text_byte_hash,
          },
        }
      : {};

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
      // Preserve the registered bill identity, including federal jurisdiction US.
      // Procedural live/completed state is not a text-extraction eligibility gate.
      jurisdiction: version.state_code ?? null,
      docket_session_key: version.session_key ?? null,
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
      docket_official_source_url: selected_source_url,
      provider_copy_locator_url:
        source_fetch_mode === "provider_copy_fallback" ? source_url : null,
      provider_copy_retrieval_mode:
        source_fetch_mode === "provider_copy_fallback"
          ? provider_copy_retrieval_mode
          : null,
      provider_copy_api_document_id:
        source_fetch_mode === "provider_copy_fallback"
          ? provider_copy_api_document_id
          : null,
      extraction_text_url,
      extraction_text_byte_hash,
      source_url_rewritten: source_url !== selected_source_url,
      source_fetch_mode,
      provider_copy_fallback_used: source_fetch_mode === "provider_copy_fallback",
      provider_copy_hash_verified: source_fetch_mode === "provider_copy_fallback",
      provider_copy_size_verified: source_fetch_mode === "provider_copy_fallback",
      official_fetch_error,
      california_bill_page_url: california_pdf?.bill_page_url ?? null,
      california_session_bootstrapped: california_pdf?.session_bootstrapped ?? false,
      registered_metadata: version.latest_metadata,
      registered_observed_at: version.latest_observed_at,
      ...extraction_provenance,
    },
  };
}


async function register_rosetta_source_content(
  source_document_id: number,
  source: extracted_legislative_source,
): Promise<rosetta_source_content_receipt> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key, {
    accept: "application/json",
    "content-type": "application/json",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${base_url}/rest/v1/rpc/rosetta_register_source_content_v1`,
      {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          p_source_document_id: source_document_id,
          p_source_text: source.source_text,
          p_expected_source_content_hash: source.source_content_hash,
          p_source_url: source.source_url,
          p_source_version: source.source_version,
          p_media_type: source.media_type,
          p_source_byte_hash: source.source_byte_hash,
          p_source_provider_hash: source.provider_hash,
          p_source_metadata: source.source_metadata,
        }),
      },
    );
    const response_body = await response.text();
    if (!response.ok) {
      throw new Error(
        `legislative_version_rosetta_content_registration_failed:${response.status}:${response_body.slice(0, 1_000)}`,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(response_body);
    } catch {
      throw new Error("invalid_legislative_version_content_registration_receipt_json");
    }
    const raw_receipt = Array.isArray(payload) ? payload[0] : payload;
    const receipt = as_record(raw_receipt);
    if (!receipt) {
      throw new Error("invalid_legislative_version_content_registration_receipt");
    }
    if (
      receipt.contract !== "rosetta-durable-source-content-v1"
      || Number(receipt.source_document_id) !== source_document_id
      || typeof receipt.source_content_id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(receipt.source_content_id)
      || receipt.source_content_hash !== source.source_content_hash
      || receipt.source_byte_hash !== source.source_byte_hash
      || typeof receipt.source_identity_hash !== "string"
      || !/^[0-9a-f]{64}$/.test(receipt.source_identity_hash)
      || receipt.source_version !== source.source_version
      || receipt.source_url !== source.source_url
      || receipt.media_type !== source.media_type
      || typeof receipt.registered !== "boolean"
      || typeof receipt.replayed !== "boolean"
      || receipt.registered === receipt.replayed
      || typeof receipt.registered_at !== "string"
      || receipt.registered_at.length === 0
    ) {
      throw new Error("legislative_version_content_registration_identity_mismatch");
    }
    return receipt as unknown as rosetta_source_content_receipt;
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.startsWith("legislative_version_rosetta_content_registration_failed:")
        || error.message.startsWith("invalid_legislative_version_content_registration_receipt")
        || error.message === "legislative_version_content_registration_identity_mismatch"
      )
    ) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new Error(
        `legislative_version_rosetta_content_registration_timeout:${ROSETTA_REQUEST_TIMEOUT_MS}`,
      );
    }
    const cause = error instanceof Error ? error.name : "unknown";
    throw new Error(
      `legislative_version_rosetta_content_registration_network_failed:${cause}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function register_rosetta_amendment_attachment(
  source_content_id: string,
  source_content_hash: string,
  context: amendment_attachment_context,
): Promise<rosetta_amendment_attachment_receipt> {
  if (context.resolution.status !== "resolved") {
    throw new Error("legislative_amendment_attachment_not_resolved");
  }
  if (!context.attachment_state) {
    throw new Error("legislative_amendment_attachment_state_unresolved");
  }

  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key, {
    accept: "application/json",
    "content-type": "application/json",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${base_url}/rest/v1/rpc/rosetta_register_current_amendment_attachment_v1`,
      {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          p_source_document_key: context.resolution.evidence.amendment_source_document_key,
          p_source_content_hash: source_content_hash,
          p_base_source_document_key: context.resolution.base.source_document_key,
          p_base_source_content_hash: context.resolution.base.source_content_hash,
          p_relationship_basis: context.resolution.relationship_basis,
          p_attachment_state: context.attachment_state,
          p_attachment_evidence_hash: context.resolution.attachment_evidence_hash,
        }),
      },
    );
    const response_body = await response.text();
    if (!response.ok) {
      throw new Error(
        `legislative_amendment_attachment_registration_failed:${response.status}:${response_body.slice(0, 1_000)}`,
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(response_body);
    } catch {
      throw new Error("invalid_legislative_amendment_attachment_receipt_json");
    }
    const raw = Array.isArray(payload) ? payload[0] : payload;
    const receipt = as_record(raw);
    if (
      !receipt
      || receipt.contract !== "rosetta-current-amendment-attachment-receipt-v1"
      || receipt.source_content_id !== source_content_id
      || receipt.source_document_key !== context.resolution.evidence.amendment_source_document_key
      || receipt.source_content_hash !== source_content_hash
      || receipt.base_source_document_key !== context.resolution.base.source_document_key
      || receipt.base_source_content_hash !== context.resolution.base.source_content_hash
      || receipt.relationship_basis !== context.resolution.relationship_basis
      || receipt.attachment_state !== context.attachment_state
      || receipt.attachment_evidence_hash !== context.resolution.attachment_evidence_hash
      || typeof receipt.receipt_id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.receipt_id)
      || typeof receipt.receipt_hash !== "string"
      || !/^[0-9a-f]{64}$/.test(receipt.receipt_hash)
      || typeof receipt.registered !== "boolean"
      || typeof receipt.replayed !== "boolean"
      || receipt.registered === receipt.replayed
      || typeof receipt.recorded_at !== "string"
      || receipt.recorded_at.length === 0
    ) {
      throw new Error("invalid_legislative_amendment_attachment_receipt");
    }
    return receipt as unknown as rosetta_amendment_attachment_receipt;
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.startsWith("legislative_amendment_attachment_registration_failed:")
        || error.message.startsWith("invalid_legislative_amendment_attachment_receipt")
      )
    ) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new Error(
        `legislative_amendment_attachment_registration_timeout:${ROSETTA_REQUEST_TIMEOUT_MS}`,
      );
    }
    const cause = error instanceof Error ? error.name : "unknown";
    throw new Error(`legislative_amendment_attachment_registration_network_failed:${cause}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function record_amendment_attachment(
  bill_version_id: string,
  context: amendment_attachment_context,
  receipt: rosetta_amendment_attachment_receipt,
): Promise<void> {
  if (context.resolution.status !== "resolved") return;
  await getPool().query(
    `update public.civic_genome_bill_version
        set receipt_json=coalesce(receipt_json,'{}'::jsonb)
          || jsonb_build_object(
            'amendment_attachment_v1',
            jsonb_build_object(
              'contract','lighthouse-amendment-attachment-v1',
              'base_bill_version_id',$2::uuid,
              'base_source_document_key',$3::text,
              'base_source_content_hash',$4::text,
              'relationship_basis',$5::text,
              'attachment_state',$6::text,
              'attachment_evidence_hash',$7::text,
              'evidence',$8::jsonb,
              'rosetta_receipt_id',$9::uuid,
              'rosetta_receipt_hash',$10::text,
              'rosetta_registered',$11::boolean,
              'rosetta_replayed',$12::boolean,
              'recorded_at',$13::timestamptz
            )
          ),
            updated_at=now()
      where bill_version_id=$1::uuid`,
    [
      bill_version_id,
      context.resolution.base.bill_version_id,
      context.resolution.base.source_document_key,
      context.resolution.base.source_content_hash,
      context.resolution.relationship_basis,
      context.attachment_state,
      context.resolution.attachment_evidence_hash,
      JSON.stringify(context.resolution.evidence),
      receipt.receipt_id,
      receipt.receipt_hash,
      receipt.registered,
      receipt.replayed,
      receipt.recorded_at,
    ],
  );
}


type preserved_amendment_source = amendment_source_basis & {
  source_content_id: string;
};

async function load_preserved_amendment_source(
  version: legislative_version_row,
): Promise<preserved_amendment_source> {
  if (version.document_family !== "amendment") {
    throw new Error("legislative_amendment_source_completion_requires_amendment");
  }
  const receipt = as_record(version.receipt_json);
  const source_content_id = String(receipt?.rosetta_source_content_id ?? "").trim();
  const source_content_hash = String(receipt?.source_content_hash ?? "").trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      source_content_id,
    )
    || !/^[0-9a-f]{64}$/.test(source_content_hash)
  ) {
    throw new Error("legislative_amendment_preserved_source_identity_missing");
  }

  const query = new URLSearchParams({
    select: "source_content_id,source_content_hash,source_text,source_url,source_metadata",
    source_content_id: `eq.${source_content_id}`,
    source_content_hash: `eq.${source_content_hash}`,
    limit: "2",
  });
  const rows = await rosetta_request(
    `source_document_content?${query.toString()}`,
    { method: "GET" },
  );
  if (rows.length !== 1) {
    throw new Error("legislative_amendment_preserved_source_absent_or_ambiguous");
  }
  const row = rows[0];
  const metadata = as_record(row.source_metadata);
  if (
    row.source_content_id !== source_content_id
    || row.source_content_hash !== source_content_hash
    || metadata?.docket_source_document_key !== version.source_document_key
    || String(metadata?.docket_document_family ?? "").trim().toLowerCase() !== "amendment"
  ) {
    throw new Error("legislative_amendment_preserved_source_identity_mismatch");
  }
  const source_text = typeof row.source_text === "string" ? row.source_text : "";
  const source_url = typeof row.source_url === "string" ? row.source_url.trim() : "";
  if (!source_text.trim() || !source_url.startsWith("https://")) {
    throw new Error("legislative_amendment_preserved_source_incomplete");
  }
  return {
    source_content_id,
    source_content_hash,
    source_text,
    source_url,
  };
}

export type amendment_source_completion_result = {
  failure_class:
    | "awaiting_amendment_attachment"
    | "awaiting_amendment_base"
    | "awaiting_delta_executor";
  error_code: string;
};

/**
 * Complete the source basis for an already-preserved amendment.
 *
 * This function does not fetch provider bytes, register source content, invoke
 * Rosetta decomposition, read a one-source current result, replay, or retry an
 * execution edge. It only resolves exact amendment -> base identity, appends
 * the existing immutable attachment receipt, and reports the dependency lane
 * in which the amendment must park before delta execution.
 */
export async function reconcile_preserved_amendment_source_basis(
  bill_version_id: string,
): Promise<amendment_source_completion_result> {
  const version = await load_version(bill_version_id);
  if (version.document_family !== "amendment") {
    throw new Error("legislative_amendment_source_completion_requires_amendment");
  }
  const source = await load_preserved_amendment_source(version);
  const attachment = await resolve_current_amendment_attachment(version, source);
  if (!attachment || attachment.resolution.status === "unresolved") {
    const reason = attachment?.resolution.status === "unresolved"
      ? attachment.resolution.reason
      : "attachment_resolution_missing";
    return {
      failure_class: "awaiting_amendment_attachment",
      error_code: `legislative_amendment_attachment_unresolved:${reason}`,
    };
  }
  if (attachment.resolution.status === "awaiting_base_content") {
    return {
      failure_class: "awaiting_amendment_base",
      error_code: "legislative_amendment_base_content_unavailable",
    };
  }
  if (!attachment.attachment_state) {
    return {
      failure_class: "awaiting_amendment_attachment",
      error_code: "legislative_amendment_attachment_state_unresolved",
    };
  }

  const receipt = await register_rosetta_amendment_attachment(
    source.source_content_id,
    source.source_content_hash,
    attachment,
  );
  await record_amendment_attachment(
    bill_version_id,
    attachment,
    receipt,
  );
  return {
    failure_class: "awaiting_delta_executor",
    error_code: "legislative_amendment_delta_execution_contract_unavailable",
  };
}

async function record_source_ingested(
  bill_version_id: string,
  source_document_id: number,
  source: extracted_legislative_source,
  content: rosetta_source_content_receipt,
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
              'text_extractor_version', $7::text,
              'rosetta_source_content_id', $8::uuid,
              'rosetta_source_identity_hash', $9::text,
              'durable_source_content_contract', $10::text,
              'durable_source_content_replayed', $11::boolean,
              'durable_source_content_registered_at', $12::timestamptz
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
      content.source_content_id,
      content.source_identity_hash,
      content.contract,
      content.replayed,
      content.registered_at,
    ],
  );
}

async function record_extracted(
  bill_version_id: string,
  extraction: current_legislative_extraction_receipt,
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
              'rosetta_replayed', $9::boolean,
              'rosetta_receipt_source', 'current_docket_projection'
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
  assert_legislative_document_role(version);
  const source_document_id = await ensure_rosetta_source_document(version);
  const source = await extract_version_source(version);
  const content = await register_rosetta_source_content(source_document_id, source);
  await record_source_ingested(
    bill_version_id,
    source_document_id,
    source,
    content,
  );

  if (version.document_family === "amendment") {
    const attachment = await resolve_current_amendment_attachment(version, source);
    if (!attachment || attachment.resolution.status === "unresolved") {
      const reason = attachment?.resolution.status === "unresolved"
        ? attachment.resolution.reason
        : "attachment_resolution_missing";
      throw new Error(`legislative_amendment_attachment_unresolved:${reason}`);
    }
    if (attachment.resolution.status === "awaiting_base_content") {
      throw new Error("legislative_amendment_base_content_unavailable");
    }
    if (!attachment.attachment_state) {
      throw new Error("legislative_amendment_attachment_state_unresolved");
    }
    const attachment_receipt = await register_rosetta_amendment_attachment(
      content.source_content_id,
      source.source_content_hash,
      attachment,
    );
    await record_amendment_attachment(
      bill_version_id,
      attachment,
      attachment_receipt,
    );

    // An amendment is a delta against the exact base above, not standalone law.
    // Do not query or invoke the one-source decomposition path.
    throw new Error("legislative_amendment_delta_execution_contract_unavailable");
  }

  // Ingestion is separate from processing. This consumer never starts a second
  // legacy-engine pass to obtain a handoff; Rosetta owns execution and routing.
  const current = await load_rosetta_current_docket_result_for_binding({
    source_document_key: version.source_document_key,
    source_content_hash: source.source_content_hash,
  });
  if (!current || current.status !== "complete" || !current.current_result) {
    await getPool().query(`update public.civic_genome_bill_version
      set processing_state='source_ingested', failure_code=$2,
          receipt_json=receipt_json || jsonb_build_object('current_rosetta_status',$3::text), updated_at=now()
      where bill_version_id=$1::uuid`,
    [bill_version_id, `rosetta_public_current_docket_result_${current?.status ?? "unavailable"}`, current?.status ?? "unavailable"]);
    throw new Error(`rosetta_public_current_docket_result_${current?.status ?? "unavailable"}`);
  }
  const extraction: current_legislative_extraction_receipt = {
    ...current.current_result,
    extraction_run_id: Number(current.current_result.extraction_run_id),
    source_document_id,
    source_content_id: content.source_content_id,
    source_identity_hash: content.source_identity_hash,
    source_content_hash: source.source_content_hash,
    source_byte_hash: source.source_byte_hash,
    source_url: source.source_url,
    source_version: source.source_version,
    run_status: "completed", run_version: null, replayed: null,
    coverage: current.coverage, receipt_source: "current_docket_projection",
  };
  if (!Number.isSafeInteger(extraction.extraction_run_id)) throw new Error("rosetta_current_extraction_run_invalid");
  const assembly = await assemble_rosetta_and_resolve_family({
    genome_bill_id: version.genome_bill_id,
    source_document_id,
    extraction_run_id: extraction.extraction_run_id,
    source_document_key: version.source_document_key,
    source_content_hash: source.source_content_hash,
  });
  await record_extracted(bill_version_id, extraction);
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
