import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PDFParse } from "pdf-parse";
import pg from "pg";

import {
  normalize_official_html,
  normalize_wa_official_html,
} from "../civic-genome-rosetta-extraction";

const { Pool } = pg;

export const C3_FETCH_CENSUS_CONTRACT = "rosetta-c3-backfill-fetchability-census-v1";
export const C3_FETCH_CENSUS_20260904_MEMBERSHIP_SHA256 =
  "adca0cc1e3f72958c9e1c344af0f0120f3f0c5fbea217a1b62e72faef2826b86";
export const C3_FETCH_CENSUS_20260904_MANIFEST_SHA256 =
  "b0aa91f2d31342d9cd00a0cea96379d7dfc3c0948cff121782451ce5959aa47a";

const FETCH_TIMEOUT_MS = 45_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const KNOWN_EXTRACTOR_FAMILIES = [
  "wa-official-legislative-version-html-strip-v1",
  "official-legislative-version-html-strip-v1",
  "official-legislative-html-strip-v1",
  "pdf-parse-2.4.5-legislative-version-v1",
  "pdf-parse-2.4.5-getText-v1",
] as const;

export type source_manifest_row = {
  ordinal: number;
  source_registry_id: string;
  host: string;
  media_type: string;
  extractor_family: string;
  source_content_hash: string;
  source_byte_hash: string | null;
  source_url: string;
  source_version: string;
  source_metadata: Record<string, unknown>;
  source_document_id: number;
  source_content_id: string;
};

export type census_result_status =
  | "byte_match_and_text_reproduced"
  | "byte_match_text_mismatch"
  | "byte_match_extractor_unavailable"
  | "byte_match_extraction_error"
  | "byte_drift"
  | "fetch_blocked"
  | "fetch_missing"
  | "fetch_error"
  | "legacy_unverifiable";

type cli_options = {
  manifest_tsv?: string;
  derive_manifest: boolean;
  out_dir: string;
  limit?: number;
  dry_run: boolean;
  manifest_only: boolean;
};

type fetched_source = {
  http_code: string;
  status:
    | "byte_match"
    | "byte_drift"
    | "fetch_blocked"
    | "fetch_missing"
    | "fetch_error"
    | "legacy_unverifiable";
  fetched_bytes: number;
  fetched_sha256: string;
  bytes: Buffer | null;
  content_type: string | null;
  error_code: string | null;
  error_message: string | null;
};

type extraction_result = {
  extractor_status: "not_attempted" | "reproduced" | "text_mismatch" | "extractor_unavailable" | "extraction_error";
  text_sha256: string | null;
  text_char_count: number | null;
  warning_code: string | null;
  error_code: string | null;
  error_message: string | null;
};

type output_row = source_manifest_row & {
  http_code: string;
  fetch_status: fetched_source["status"];
  fetched_bytes: number;
  fetched_sha256: string;
  extractor_status: extraction_result["extractor_status"];
  text_sha256: string | null;
  text_char_count: number | null;
  warning_code: string | null;
  result_status: census_result_status;
  error_code: string | null;
  error_message: string | null;
  fetched_at: string;
};

type manifest_hashes = {
  membership_sha256: string;
  manifest_sha256: string;
};

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function join_without_trailing_terminator(lines: string[]): string {
  return lines.join("\n");
}

export function compute_manifest_hashes(rows: source_manifest_row[]): manifest_hashes {
  const ordered = [...rows].sort((left, right) => left.ordinal - right.ordinal);
  return {
    membership_sha256: sha256(
      join_without_trailing_terminator(ordered.map(row => row.source_registry_id)),
    ),
    manifest_sha256: sha256(
      join_without_trailing_terminator(
        ordered.map(row => [
          row.ordinal,
          row.source_registry_id,
          row.host,
          row.media_type,
          row.extractor_family,
          row.source_content_hash,
        ].join("|")),
      ),
    ),
  };
}

export function derive_extractor_family(source_version: string): string {
  for (const family of KNOWN_EXTRACTOR_FAMILIES) {
    if (source_version.endsWith(family) || source_version.includes(`${family}:`)) {
      return family;
    }
  }
  return source_version;
}

export function host_from_url(source_url: string): string {
  try {
    return new URL(source_url).hostname.toLowerCase();
  } catch {
    return "invalid-url";
  }
}

function as_record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadata_string(row: source_manifest_row, key: string): string | null {
  const value = row.source_metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parse_args(argv: string[]): cli_options {
  const options: cli_options = {
    derive_manifest: false,
    out_dir: path.resolve("artifacts/rosetta-c3-backfill-census"),
    dry_run: false,
    manifest_only: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest-tsv") {
      options.manifest_tsv = path.resolve(required_arg(argv, ++index, arg));
    } else if (arg === "--derive-manifest") {
      options.derive_manifest = true;
    } else if (arg === "--out-dir") {
      options.out_dir = path.resolve(required_arg(argv, ++index, arg));
    } else if (arg === "--limit") {
      const limit = Number(required_arg(argv, ++index, arg));
      if (!Number.isInteger(limit) || limit < 1) throw new Error("invalid_limit");
      options.limit = limit;
    } else if (arg === "--dry-run") {
      options.dry_run = true;
    } else if (arg === "--manifest-only") {
      options.manifest_only = true;
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }

  if (!options.manifest_tsv && !options.derive_manifest) {
    throw new Error("manifest_source_required: pass --manifest-tsv or --derive-manifest");
  }
  return options;
}

function required_arg(argv: string[], index: number, flag: string): string {
  const value = argv[index]?.trim();
  if (!value) throw new Error(`missing_value_for:${flag}`);
  return value;
}

function database_url(): string {
  const value = process.env.ROSETTA_REPLAY_DATABASE_URL ?? process.env.ROSETTA_DATABASE_URL;
  if (!value?.trim()) {
    throw new Error("missing_rosetta_replay_database_url");
  }
  return value.trim();
}

function create_pool(): pg.Pool {
  const connectionString = database_url();
  return new Pool({
    connectionString,
    ssl: /supabase\.co|pooler\.supabase\.com/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

function normalize_header(value: string): string {
  return value.trim().replace(/^\uFEFF/, "");
}

function parse_tsv_line(line: string): string[] {
  return line.split("\t");
}

async function read_manifest_tsv(file_path: string, pool: pg.Pool): Promise<source_manifest_row[]> {
  const content = await readFile(file_path, "utf8");
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const [header_line, ...data_lines] = lines;
  if (!header_line) throw new Error("empty_manifest_tsv");
  const headers = parse_tsv_line(header_line).map(normalize_header);
  const source_registry_index = headers.indexOf("source_registry_id");
  const ordinal_index = headers.indexOf("ordinal");
  if (source_registry_index === -1 || ordinal_index === -1) {
    throw new Error("manifest_tsv_requires_ordinal_and_source_registry_id");
  }
  const full_manifest_indexes = {
    host: headers.indexOf("host"),
    media_type: headers.indexOf("media_type"),
    extractor_family: headers.indexOf("extractor_family"),
    source_content_hash: headers.indexOf("source_content_hash"),
    source_byte_hash: headers.indexOf("source_byte_hash"),
    source_document_id: headers.indexOf("source_document_id"),
    source_content_id: headers.indexOf("source_content_id"),
    source_version: headers.indexOf("source_version"),
    source_metadata_json_base64: headers.indexOf("source_metadata_json_base64"),
    source_url: headers.indexOf("source_url"),
  };
  const has_full_manifest = Object.values(full_manifest_indexes).every(index => index !== -1);

  const partial_rows = data_lines.map(line => {
    const values = parse_tsv_line(line);
    return {
      ordinal: Number(values[ordinal_index]),
      source_registry_id: values[source_registry_index],
      values,
    };
  });
  if (partial_rows.some(row => !Number.isInteger(row.ordinal) || !row.source_registry_id)) {
    throw new Error("invalid_manifest_tsv_row");
  }

  if (has_full_manifest) {
    return partial_rows.map(row => ({
      ordinal: row.ordinal,
      source_registry_id: row.source_registry_id,
      host: row.values[full_manifest_indexes.host],
      media_type: row.values[full_manifest_indexes.media_type],
      extractor_family: row.values[full_manifest_indexes.extractor_family],
      source_content_hash: row.values[full_manifest_indexes.source_content_hash],
      source_byte_hash: tsv_unescape(row.values[full_manifest_indexes.source_byte_hash]),
      source_url: row.values[full_manifest_indexes.source_url],
      source_version: row.values[full_manifest_indexes.source_version],
      source_metadata: metadata_from_tsv(row.values[full_manifest_indexes.source_metadata_json_base64]),
      source_document_id: Number(row.values[full_manifest_indexes.source_document_id]),
      source_content_id: row.values[full_manifest_indexes.source_content_id],
    }));
  }

  const ids = partial_rows.map(row => row.source_registry_id);
  const registry = await enrich_manifest_rows(pool, ids);
  return partial_rows.map(row => {
    const enriched = registry.get(row.source_registry_id);
    if (!enriched) throw new Error(`source_registry_id_not_found:${row.source_registry_id}`);
    return { ...enriched, ordinal: row.ordinal };
  });
}

async function enrich_manifest_rows(
  pool: pg.Pool,
  source_registry_ids: string[],
): Promise<Map<string, Omit<source_manifest_row, "ordinal">>> {
  const { rows } = await pool.query<{
    source_registry_id: string;
    source_content_id: string;
    source_document_id: number;
    source_version: string;
    source_url: string;
    media_type: string;
    source_content_hash: string;
    source_byte_hash: string | null;
    source_metadata: unknown;
  }>(
    `select
        r.source_registry_id::text,
        r.source_content_id::text,
        c.source_document_id,
        c.source_version,
        c.source_url,
        c.media_type,
        c.source_content_hash,
        c.source_byte_hash,
        c.source_metadata
       from rosetta_replay.replay_source_registry r
       join rosetta_v2513.source_document_content c
         on c.source_content_id = r.source_content_id
        and c.source_content_hash = r.source_content_hash
      where r.source_registry_id = any($1::uuid[])`,
    [source_registry_ids],
  );

  return new Map(rows.map(row => [
    row.source_registry_id,
    {
      source_registry_id: row.source_registry_id,
      host: host_from_url(row.source_url),
      media_type: row.media_type,
      extractor_family: derive_extractor_family(row.source_version),
      source_content_hash: row.source_content_hash,
      source_byte_hash: row.source_byte_hash,
      source_url: row.source_url,
      source_version: row.source_version,
      source_metadata: as_record(row.source_metadata),
      source_document_id: row.source_document_id,
      source_content_id: row.source_content_id,
    },
  ]));
}

async function derive_manifest_rows(pool: pg.Pool): Promise<source_manifest_row[]> {
  const { rows } = await pool.query<{
    source_registry_id: string;
    source_content_id: string;
    source_document_id: number;
    source_version: string;
    source_url: string;
    media_type: string;
    source_content_hash: string;
    source_byte_hash: string | null;
    source_metadata: unknown;
  }>(
    `with source_rows as (
       select
         r.source_registry_id::text,
         r.source_content_id::text,
         c.source_document_id,
         c.source_version,
         c.source_url,
         c.media_type,
         c.source_content_hash,
         c.source_byte_hash,
         c.source_metadata,
         lower(split_part(split_part(c.source_url, '://', 2), '/', 1)) as host
       from rosetta_replay.replay_source_registry r
       join rosetta_v2513.source_document_content c
         on c.source_content_id = r.source_content_id
        and c.source_content_hash = r.source_content_hash
     )
     select *
       from source_rows
      order by source_content_hash, source_registry_id`,
  );

  const cells = new Map<string, source_manifest_row[]>();
  for (const row of rows) {
    const manifest_row: source_manifest_row = {
      ordinal: 0,
      source_registry_id: row.source_registry_id,
      host: host_from_url(row.source_url),
      media_type: row.media_type,
      extractor_family: derive_extractor_family(row.source_version),
      source_content_hash: row.source_content_hash,
      source_byte_hash: row.source_byte_hash,
      source_url: row.source_url,
      source_version: row.source_version,
      source_metadata: as_record(row.source_metadata),
      source_document_id: row.source_document_id,
      source_content_id: row.source_content_id,
    };
    const cell_key = [
      manifest_row.host,
      manifest_row.media_type,
      manifest_row.extractor_family,
    ].join("|");
    const members = cells.get(cell_key) ?? [];
    members.push(manifest_row);
    cells.set(cell_key, members);
  }

  const selected = [...cells.values()]
    .map(members => ({
      members: members.slice(0, 3),
      key: [
        members[0]?.host ?? "",
        members[0]?.media_type ?? "",
        members[0]?.extractor_family ?? "",
      ],
      size: members.length,
    }))
    .sort((left, right) => {
      if (right.size !== left.size) return right.size - left.size;
      return left.key.join("|").localeCompare(right.key.join("|"));
    })
    .flatMap(cell => cell.members);

  return selected.map((row, index) => ({ ...row, ordinal: index + 1 }));
}

export function classify_fetch_failure(status: number | null, error_code: string | null): fetched_source["status"] {
  if (status === 404 || status === 410) return "fetch_missing";
  if (status === 401 || status === 403 || status === 429 || status === 451) return "fetch_blocked";
  if (error_code && /blocked|forbidden|denied|captcha/i.test(error_code)) return "fetch_blocked";
  return "fetch_error";
}

async function fetch_source(row: source_manifest_row): Promise<fetched_source> {
  if (!row.source_byte_hash || !row.source_url.startsWith("https://")) {
    return {
      http_code: "000",
      status: "legacy_unverifiable",
      fetched_bytes: 0,
      fetched_sha256: sha256(Buffer.alloc(0)),
      bytes: null,
      content_type: null,
      error_code: "source_byte_hash_or_https_url_missing",
      error_message: "row cannot earn byte provenance from this worker",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(row.source_url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/pdf,text/html,application/xhtml+xml,*/*;q=0.1",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": USER_AGENT,
      },
    });

    const http_code = String(response.status).padStart(3, "0");
    if (!response.ok) {
      return {
        http_code,
        status: classify_fetch_failure(response.status, null),
        fetched_bytes: 0,
        fetched_sha256: sha256(Buffer.alloc(0)),
        bytes: null,
        content_type: response.headers.get("content-type"),
        error_code: `http_${response.status}`,
        error_message: response.statusText,
      };
    }

    const content_length = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(content_length) && content_length > MAX_SOURCE_BYTES) {
      throw new Error("source_exceeds_max_bytes");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error("source_empty");
    if (bytes.length > MAX_SOURCE_BYTES) throw new Error("source_exceeds_max_bytes");
    const fetched_sha256 = sha256(bytes);
    return {
      http_code,
      status: fetched_sha256 === row.source_byte_hash ? "byte_match" : "byte_drift",
      fetched_bytes: bytes.length,
      fetched_sha256,
      bytes,
      content_type: response.headers.get("content-type"),
      error_code: null,
      error_message: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "unknown_fetch_error";
    return {
      http_code: "000",
      status: classify_fetch_failure(null, `${name}:${message}`),
      fetched_bytes: 0,
      fetched_sha256: sha256(Buffer.alloc(0)),
      bytes: null,
      content_type: null,
      error_code: name,
      error_message: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function is_pdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function fetch_expected_bytes(url: string, expected_sha256: string): Promise<Buffer> {
  if (!url.startsWith("https://")) throw new Error("auxiliary_https_url_required");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/pdf,text/html,application/xhtml+xml,*/*;q=0.1",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`auxiliary_fetch_failed:http_${response.status}`);
    const content_length = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(content_length) && content_length > MAX_SOURCE_BYTES) {
      throw new Error("auxiliary_source_exceeds_max_bytes");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error("auxiliary_source_empty");
    if (bytes.length > MAX_SOURCE_BYTES) throw new Error("auxiliary_source_exceeds_max_bytes");
    const observed_sha256 = sha256(bytes);
    if (observed_sha256 !== expected_sha256) {
      throw new Error(`auxiliary_byte_hash_mismatch:${observed_sha256}`);
    }
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

async function extract_pdf_text(pdf_bytes: Buffer): Promise<string> {
  if (!is_pdf(pdf_bytes)) throw new Error("source_is_not_pdf");
  const parser = new PDFParse({ data: pdf_bytes });
  try {
    const result = await parser.getText();
    return result.text.replace(/\r\n?/g, "\n").trimEnd();
  } finally {
    await parser.destroy();
  }
}

async function reproduce_text(row: source_manifest_row, bytes: Buffer): Promise<extraction_result> {
  try {
    let source_text: string;
    if (
      row.extractor_family === "pdf-parse-2.4.5-legislative-version-v1" ||
      row.extractor_family === "pdf-parse-2.4.5-getText-v1"
    ) {
      source_text = await extract_pdf_text(bytes);
    } else if (row.extractor_family === "official-legislative-version-html-strip-v1" ||
      row.extractor_family === "official-legislative-html-strip-v1") {
      source_text = normalize_official_html(bytes.toString("utf8"));
    } else if (row.extractor_family === "wa-official-legislative-version-html-strip-v1") {
      const extraction_text_url = metadata_string(row, "extraction_text_url");
      const extraction_text_byte_hash = metadata_string(row, "extraction_text_byte_hash");
      if (!extraction_text_url || !extraction_text_byte_hash) {
        throw new Error("wa_extraction_text_receipt_missing");
      }
      const html_bytes = await fetch_expected_bytes(
        extraction_text_url,
        extraction_text_byte_hash,
      );
      source_text = normalize_wa_official_html(html_bytes.toString("utf8"));
    } else {
      return {
        extractor_status: "extractor_unavailable",
        text_sha256: null,
        text_char_count: null,
        warning_code: null,
        error_code: "extractor_family_unavailable",
        error_message: row.extractor_family,
      };
    }

    const text_sha256 = sha256(source_text);
    const text_char_count = source_text.trim().length;
    return {
      extractor_status: text_sha256 === row.source_content_hash ? "reproduced" : "text_mismatch",
      text_sha256,
      text_char_count,
      warning_code: text_char_count < 200 ? "source_text_below_200_chars" : null,
      error_code: null,
      error_message: null,
    };
  } catch (error) {
    return {
      extractor_status: "extraction_error",
      text_sha256: null,
      text_char_count: null,
      warning_code: null,
      error_code: error instanceof Error ? error.message : "unknown_extraction_error",
      error_message: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }
}

function result_status(fetch_result: fetched_source, extraction: extraction_result): census_result_status {
  if (fetch_result.status === "byte_drift") return "byte_drift";
  if (fetch_result.status === "fetch_blocked") return "fetch_blocked";
  if (fetch_result.status === "fetch_missing") return "fetch_missing";
  if (fetch_result.status === "fetch_error") return "fetch_error";
  if (fetch_result.status === "legacy_unverifiable") return "legacy_unverifiable";
  if (extraction.extractor_status === "reproduced") return "byte_match_and_text_reproduced";
  if (extraction.extractor_status === "text_mismatch") return "byte_match_text_mismatch";
  if (extraction.extractor_status === "extractor_unavailable") return "byte_match_extractor_unavailable";
  return "byte_match_extraction_error";
}

async function run_row(row: source_manifest_row, dry_run: boolean): Promise<output_row> {
  const fetched_at = new Date().toISOString();
  const fetch_result = dry_run
    ? {
      http_code: "000",
      status: "fetch_error" as const,
      fetched_bytes: 0,
      fetched_sha256: sha256(Buffer.alloc(0)),
      bytes: null,
      content_type: null,
      error_code: "dry_run",
      error_message: "fetch skipped by --dry-run",
    }
    : await fetch_source(row);

  const extraction = fetch_result.status === "byte_match" && fetch_result.bytes
    ? await reproduce_text(row, fetch_result.bytes)
    : {
      extractor_status: "not_attempted" as const,
      text_sha256: null,
      text_char_count: null,
      warning_code: null,
      error_code: null,
      error_message: null,
    };

  return {
    ...row,
    http_code: fetch_result.http_code,
    fetch_status: fetch_result.status,
    fetched_bytes: fetch_result.fetched_bytes,
    fetched_sha256: fetch_result.fetched_sha256,
    extractor_status: extraction.extractor_status,
    text_sha256: extraction.text_sha256,
    text_char_count: extraction.text_char_count,
    warning_code: extraction.warning_code,
    result_status: result_status(fetch_result, extraction),
    error_code: extraction.error_code ?? fetch_result.error_code,
    error_message: extraction.error_message ?? fetch_result.error_message,
    fetched_at,
  };
}

function summarize<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, number> {
  return rows.reduce<Record<string, number>>((summary, row) => {
    const value = String(row[key] ?? "unknown");
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
}

function tsv_escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function tsv_unescape(value: string): string | null {
  return value === "" ? null : value;
}

function metadata_to_tsv(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function metadata_from_tsv(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return as_record(JSON.parse(Buffer.from(value, "base64").toString("utf8")));
  } catch {
    throw new Error("invalid_manifest_source_metadata_json_base64");
  }
}

function render_output_tsv(rows: output_row[]): string {
  const headers = [
    "ordinal",
    "source_registry_id",
    "host",
    "media_type",
    "extractor_family",
    "source_content_hash",
    "expected_source_byte_hash",
    "http_code",
    "fetch_status",
    "fetched_bytes",
    "fetched_sha256",
    "extractor_status",
    "text_sha256",
    "text_char_count",
    "warning_code",
    "result_status",
    "error_code",
    "error_message",
    "fetched_at",
    "url",
  ];
  const lines = rows.map(row => [
    row.ordinal,
    row.source_registry_id,
    row.host,
    row.media_type,
    row.extractor_family,
    row.source_content_hash,
    row.source_byte_hash,
    row.http_code,
    row.fetch_status,
    row.fetched_bytes,
    row.fetched_sha256,
    row.extractor_status,
    row.text_sha256,
    row.text_char_count,
    row.warning_code,
    row.result_status,
    row.error_code,
    row.error_message,
    row.fetched_at,
    row.source_url,
  ].map(tsv_escape).join("\t"));
  return [headers.join("\t"), ...lines].join("\n") + "\n";
}

export function render_manifest_tsv(rows: source_manifest_row[]): string {
  const ordered = [...rows].sort((left, right) => left.ordinal - right.ordinal);
  const headers = [
    "ordinal",
    "source_registry_id",
    "host",
    "media_type",
    "extractor_family",
    "source_content_hash",
    "source_byte_hash",
    "source_document_id",
    "source_content_id",
    "source_version",
    "source_metadata_json_base64",
    "source_url",
  ];
  const lines = ordered.map(row => [
    row.ordinal,
    row.source_registry_id,
    row.host,
    row.media_type,
    row.extractor_family,
    row.source_content_hash,
    row.source_byte_hash,
    row.source_document_id,
    row.source_content_id,
    row.source_version,
    metadata_to_tsv(row.source_metadata),
    row.source_url,
  ].map(tsv_escape).join("\t"));
  return [headers.join("\t"), ...lines].join("\n") + "\n";
}

async function write_manifest_outputs(
  out_dir: string,
  manifest_rows: source_manifest_row[],
): Promise<{ manifest_path: string; manifest_sha256: string; receipt_path: string }> {
  await mkdir(out_dir, { recursive: true });
  const hashes = compute_manifest_hashes(manifest_rows);
  const manifest_tsv = render_manifest_tsv(manifest_rows);
  const manifest_path = path.join(out_dir, "c3-fetchability-census-manifest.tsv");
  const receipt_path = path.join(out_dir, "c3-fetchability-census-manifest-receipt.json");
  await writeFile(manifest_path, manifest_tsv, "utf8");

  const receipt = {
    contract: `${C3_FETCH_CENSUS_CONTRACT}:manifest-freeze`,
    generated_at: new Date().toISOString(),
    row_count: manifest_rows.length,
    declared_20260904_constants: {
      membership_sha256: C3_FETCH_CENSUS_20260904_MEMBERSHIP_SHA256,
      manifest_sha256: C3_FETCH_CENSUS_20260904_MANIFEST_SHA256,
    },
    declared_20260904_manifest_match:
      manifest_rows.length === 164 &&
      hashes.membership_sha256 === C3_FETCH_CENSUS_20260904_MEMBERSHIP_SHA256 &&
      hashes.manifest_sha256 === C3_FETCH_CENSUS_20260904_MANIFEST_SHA256,
    hashes,
    canonical_hash_recipes: {
      membership_sha256:
        "SHA-256 over source_registry_id values in ordinal order, joined by \\n separators only, no trailing terminator.",
      manifest_sha256:
        "SHA-256 over ordinal|source_registry_id|host|media_type|extractor_family|source_content_hash lines in ordinal order, joined by \\n separators only, no trailing terminator.",
      manifest_file_sha256:
        "SHA-256 over the emitted manifest TSV bytes, including its ordinary final newline.",
    },
    outputs: {
      manifest_tsv: {
        path: manifest_path,
        sha256: sha256(manifest_tsv),
      },
      receipt_json: {
        path: receipt_path,
      },
    },
    boundaries: [
      "This manifest-freeze step is read-only against Supabase/PostgreSQL.",
      "This artifact binds the exact member order for a later census run.",
      "Receipt-writing migrations remain a separate generated-SQL lane.",
    ],
  };
  await writeFile(receipt_path, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  return {
    manifest_path,
    manifest_sha256: sha256(manifest_tsv),
    receipt_path,
  };
}

async function write_outputs(
  out_dir: string,
  manifest_rows: source_manifest_row[],
  output_rows: output_row[],
  input_manifest_path: string | null,
): Promise<void> {
  await mkdir(out_dir, { recursive: true });
  const manifest_output = input_manifest_path
    ? {
      manifest_path: input_manifest_path,
      manifest_sha256: sha256(await readFile(input_manifest_path, "utf8")),
    }
    : await write_manifest_outputs(out_dir, manifest_rows);
  const hashes = compute_manifest_hashes(manifest_rows);
  const result_tsv = render_output_tsv(output_rows);
  const result_path = path.join(out_dir, "c3-fetchability-census-results.tsv");
  const receipt_path = path.join(out_dir, "c3-fetchability-census-receipt.json");
  await writeFile(result_path, result_tsv, "utf8");

  const receipt: {
    contract: string;
    generated_at: string;
    row_count: number;
    full_20260904_manifest_match: boolean;
    hashes: manifest_hashes;
    canonical_hash_recipes: Record<string, string>;
    tallies: {
      fetch_status: Record<string, number>;
      extractor_status: Record<string, number>;
      result_status: Record<string, number>;
    };
    non_reproducible_rows: Array<Record<string, unknown>>;
    outputs: {
      manifest_tsv: { path: string; sha256: string };
      result_tsv: { path: string; sha256: string };
      receipt_json: { path: string };
    };
    boundaries: string[];
  } = {
    contract: C3_FETCH_CENSUS_CONTRACT,
    generated_at: new Date().toISOString(),
    row_count: manifest_rows.length,
    full_20260904_manifest_match:
      manifest_rows.length === 164 &&
      hashes.membership_sha256 === C3_FETCH_CENSUS_20260904_MEMBERSHIP_SHA256 &&
      hashes.manifest_sha256 === C3_FETCH_CENSUS_20260904_MANIFEST_SHA256,
    hashes,
    canonical_hash_recipes: {
      membership_sha256:
        "SHA-256 over source_registry_id values in ordinal order, joined by \\n separators only, no trailing terminator.",
      manifest_sha256:
        "SHA-256 over ordinal|source_registry_id|host|media_type|extractor_family|source_content_hash lines in ordinal order, joined by \\n separators only, no trailing terminator.",
      result_file_sha256:
        "SHA-256 over the emitted TSV bytes, including its ordinary final newline.",
    },
    tallies: {
      fetch_status: summarize(output_rows, "fetch_status"),
      extractor_status: summarize(output_rows, "extractor_status"),
      result_status: summarize(output_rows, "result_status"),
    },
    non_reproducible_rows: output_rows
      .filter(row => row.result_status !== "byte_match_and_text_reproduced")
      .map(row => ({
        ordinal: row.ordinal,
        source_registry_id: row.source_registry_id,
        host: row.host,
        result_status: row.result_status,
        http_code: row.http_code,
        error_code: row.error_code,
      })),
    outputs: {
      manifest_tsv: {
        path: manifest_output.manifest_path,
        sha256: manifest_output.manifest_sha256,
      },
      result_tsv: {
        path: result_path,
        sha256: sha256(result_tsv),
      },
      receipt_json: {
        path: receipt_path,
      },
    },
    boundaries: [
      "This worker is read-only against Supabase/PostgreSQL.",
      "Network fetch errors are transport evidence only, not provenance failures.",
      "Receipt-writing migrations remain a separate generated-SQL lane.",
    ],
  };
  await writeFile(receipt_path, JSON.stringify(receipt, null, 2) + "\n", "utf8");
}

export async function run_c3_backfill_census(options: cli_options): Promise<void> {
  const pool = create_pool();
  try {
    const manifest_rows = options.manifest_tsv
      ? await read_manifest_tsv(options.manifest_tsv, pool)
      : await derive_manifest_rows(pool);
    const selected_rows = options.limit ? manifest_rows.slice(0, options.limit) : manifest_rows;
    if (options.manifest_only) {
      await write_manifest_outputs(options.out_dir, selected_rows);
      return;
    }
    const output_rows: output_row[] = [];
    for (const row of selected_rows) {
      output_rows.push(await run_row(row, options.dry_run));
    }
    await write_outputs(options.out_dir, selected_rows, output_rows, options.manifest_tsv ?? null);
  } finally {
    await pool.end();
  }
}

const current_file = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === current_file) {
  run_c3_backfill_census(parse_args(process.argv.slice(2))).catch(error => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
