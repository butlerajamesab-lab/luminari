import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const C3_RECEIPT_WRITER_CONTRACT =
  "rosetta-c3-backfill-receipt-writer-v1";
export const C3_EXPECTED_EXECUTION_MANIFEST_SHA256 =
  "9b9289ec0b4dcabfbc49dfc833fe97883ac3c17e7d5ccfcc024b3c583f3c174d";
export const C3_EXPECTED_RESULT_TSV_SHA256 =
  "8b16a428d8a7638de8d4735dd3ad5743bc319467d11aac84dd4f3511aff2f9fa";
export const C3_EXPECTED_PROVEN_ROW_COUNT = 145;

type cli_options = {
  manifest_tsv: string;
  results_tsv: string;
  out_sql: string;
  expected_manifest_sha256: string;
  expected_results_sha256: string;
  expected_proven_rows: number;
};

type manifest_row = {
  ordinal: number;
  source_registry_id: string;
  host: string;
  media_type: string;
  extractor_family: string;
  source_content_hash: string;
  source_byte_hash: string;
  source_document_id: number;
  source_content_id: string;
  source_version: string;
  source_metadata: Record<string, unknown>;
  source_url: string;
};

type result_row = {
  ordinal: number;
  source_registry_id: string;
  source_content_hash: string;
  expected_source_byte_hash: string;
  fetch_status: string;
  fetched_sha256: string;
  extractor_status: string;
  text_sha256: string;
  result_status: string;
};

type receipt_target = manifest_row & {
  receipt: Record<string, unknown>;
};

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function required_arg(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`missing_value:${flag}`);
  return value;
}

function parse_args(argv: string[]): cli_options {
  const options: Partial<cli_options> = {
    expected_manifest_sha256: C3_EXPECTED_EXECUTION_MANIFEST_SHA256,
    expected_results_sha256: C3_EXPECTED_RESULT_TSV_SHA256,
    expected_proven_rows: C3_EXPECTED_PROVEN_ROW_COUNT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest-tsv") {
      options.manifest_tsv = path.resolve(required_arg(argv, ++index, arg));
    } else if (arg === "--results-tsv") {
      options.results_tsv = path.resolve(required_arg(argv, ++index, arg));
    } else if (arg === "--out-sql") {
      options.out_sql = path.resolve(required_arg(argv, ++index, arg));
    } else if (arg === "--expected-manifest-sha256") {
      options.expected_manifest_sha256 = required_arg(argv, ++index, arg);
    } else if (arg === "--expected-results-sha256") {
      options.expected_results_sha256 = required_arg(argv, ++index, arg);
    } else if (arg === "--expected-proven-rows") {
      const value = Number(required_arg(argv, ++index, arg));
      if (!Number.isInteger(value) || value < 1) throw new Error("invalid_expected_proven_rows");
      options.expected_proven_rows = value;
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }

  if (!options.manifest_tsv) throw new Error("manifest_tsv_required");
  if (!options.results_tsv) throw new Error("results_tsv_required");
  if (!options.out_sql) throw new Error("out_sql_required");

  return options as cli_options;
}

function parse_tsv(content: string): Array<Record<string, string>> {
  const lines = content.split(/\r?\n/).filter(line => line.length > 0);
  const [header_line, ...data_lines] = lines;
  if (!header_line) throw new Error("empty_tsv");
  const headers = header_line.split("\t");
  return data_lines.map(line => {
    const values = line.split("\t");
    if (values.length !== headers.length) throw new Error("invalid_tsv_row_width");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function parse_metadata(value: string): Record<string, unknown> {
  if (!value) return {};
  const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function read_manifest(content: string): manifest_row[] {
  return parse_tsv(content).map(row => ({
    ordinal: Number(row.ordinal),
    source_registry_id: row.source_registry_id,
    host: row.host,
    media_type: row.media_type,
    extractor_family: row.extractor_family,
    source_content_hash: row.source_content_hash,
    source_byte_hash: row.source_byte_hash,
    source_document_id: Number(row.source_document_id),
    source_content_id: row.source_content_id,
    source_version: row.source_version,
    source_metadata: parse_metadata(row.source_metadata_json_base64),
    source_url: row.source_url,
  }));
}

function read_results(content: string): result_row[] {
  return parse_tsv(content).map(row => ({
    ordinal: Number(row.ordinal),
    source_registry_id: row.source_registry_id,
    source_content_hash: row.source_content_hash,
    expected_source_byte_hash: row.expected_source_byte_hash,
    fetch_status: row.fetch_status,
    fetched_sha256: row.fetched_sha256,
    extractor_status: row.extractor_status,
    text_sha256: row.text_sha256,
    result_status: row.result_status,
  }));
}

function assert_sha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`invalid_sha256:${label}`);
}

function assert_uuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new Error(`invalid_uuid:${label}`);
  }
}

function metadata_string(row: manifest_row, key: string): string | null {
  const value = row.source_metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function build_receipt(row: manifest_row): Record<string, unknown> {
  const base = {
    extractor_version: row.extractor_family,
    raw_source_sha256: row.source_byte_hash,
    extracted_text_sha256: row.source_content_hash,
    census_contract: "rosetta-c3-backfill-fetchability-census-v1",
    census_membership_sha256:
      "adca0cc1e3f72958c9e1c344af0f0120f3f0c5fbea217a1b62e72faef2826b86",
    census_manifest_sha256:
      "b0aa91f2d31342d9cd00a0cea96379d7dfc3c0948cff121782451ce5959aa47a",
  };

  const auxiliary_text_url = metadata_string(row, "extraction_text_url");
  const auxiliary_text_sha256 =
    metadata_string(row, "extraction_text_byte_hash") ??
    metadata_string(row, "extraction_text_html_sha256");
  const auxiliary = auxiliary_text_url || auxiliary_text_sha256
    ? {
      auxiliary_extraction_text_url: auxiliary_text_url,
      auxiliary_extraction_text_sha256: auxiliary_text_sha256,
    }
    : {};

  if (row.media_type.toLowerCase() === "text/html" ||
      row.media_type.toLowerCase() === "application/xhtml+xml") {
    return {
      contract: "rosetta-html-content-extraction-v1",
      ...base,
      navigation_removed: true,
      action_tables_removed: true,
      vote_chrome_removed: true,
      ...auxiliary,
    };
  }

  return {
    contract: "rosetta-content-extraction-v1",
    media_type: row.media_type.toLowerCase(),
    ...base,
    projection_verified: true,
    residue_check_passed: true,
    ...auxiliary,
  };
}

export function build_receipt_targets(
  manifest_rows: manifest_row[],
  result_rows: result_row[],
  expected_count = C3_EXPECTED_PROVEN_ROW_COUNT,
): receipt_target[] {
  const manifest_by_key = new Map(
    manifest_rows.map(row => [`${row.ordinal}|${row.source_registry_id}`, row]),
  );
  const proven = result_rows.filter(row =>
    row.result_status === "byte_match_and_text_reproduced" &&
    row.fetch_status === "byte_match" &&
    row.extractor_status === "reproduced" &&
    row.fetched_sha256 === row.expected_source_byte_hash &&
    row.text_sha256 === row.source_content_hash,
  );
  if (proven.length !== expected_count) {
    throw new Error(`unexpected_proven_row_count:${proven.length}`);
  }

  return proven.map(result => {
    const manifest = manifest_by_key.get(`${result.ordinal}|${result.source_registry_id}`);
    if (!manifest) throw new Error(`manifest_row_missing:${result.ordinal}`);
    if (manifest.source_content_hash !== result.source_content_hash) {
      throw new Error(`source_content_hash_mismatch:${result.ordinal}`);
    }
    if (manifest.source_byte_hash !== result.expected_source_byte_hash) {
      throw new Error(`source_byte_hash_mismatch:${result.ordinal}`);
    }
    assert_uuid(manifest.source_registry_id, "source_registry_id");
    assert_uuid(manifest.source_content_id, "source_content_id");
    assert_sha256(manifest.source_content_hash, "source_content_hash");
    assert_sha256(manifest.source_byte_hash, "source_byte_hash");
    return { ...manifest, receipt: build_receipt(manifest) };
  });
}

function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function render_values(targets: receipt_target[]): string {
  return targets.map(target => [
    "(",
    [
      target.ordinal,
      `${q(target.source_registry_id)}::uuid`,
      target.source_document_id,
      `${q(target.source_content_id)}::uuid`,
      q(target.source_content_hash),
      q(target.source_byte_hash),
      q(target.source_url),
      q(target.source_version),
      q(target.media_type.toLowerCase()),
      q(target.extractor_family),
      `${q(JSON.stringify(target.receipt))}::jsonb`,
    ].join(", "),
    ")",
  ].join("")).join(",\n");
}

export function render_receipt_writer_sql(
  targets: receipt_target[],
  hashes: { manifest_tsv_sha256: string; results_tsv_sha256: string },
): string {
  const expected_count = targets.length;
  return `-- ============================================================================
-- C3 backfill receipt writer
-- Contract: ${C3_RECEIPT_WRITER_CONTRACT}
-- Inputs:
--   execution manifest TSV sha256: ${hashes.manifest_tsv_sha256}
--   result TSV sha256: ${hashes.results_tsv_sha256}
-- Scope:
--   Writes content_extraction_receipt + text_extractor_version only for
--   byte_match_and_text_reproduced rows.
--   Does not classify drift, legacy, or text-mismatch rows as proven.
-- ============================================================================

begin;

create temp table c3_backfill_receipt_candidate (
  ordinal integer primary key,
  source_registry_id uuid not null,
  source_document_id integer not null,
  source_content_id uuid not null,
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  source_byte_hash text not null check (source_byte_hash ~ '^[0-9a-f]{64}$'),
  source_url text not null,
  source_version text not null,
  media_type text not null,
  extractor_version text not null,
  receipt jsonb not null
) on commit drop;

insert into c3_backfill_receipt_candidate (
  ordinal,
  source_registry_id,
  source_document_id,
  source_content_id,
  source_content_hash,
  source_byte_hash,
  source_url,
  source_version,
  media_type,
  extractor_version,
  receipt
) values
${render_values(targets)};

do $$
declare
  v_expected integer := ${expected_count};
  v_seen integer;
  v_missing integer;
  v_verified integer;
  v_updated integer;
begin
  select count(*) into v_seen from c3_backfill_receipt_candidate;
  if v_seen is distinct from v_expected then
    raise exception 'c3_receipt_writer_candidate_count_mismatch:%/%', v_seen, v_expected;
  end if;

  select count(*) into v_missing
  from c3_backfill_receipt_candidate candidate
  left join rosetta_v2513.source_document_content content
    on content.source_document_id = candidate.source_document_id
   and content.source_content_id = candidate.source_content_id
   and content.source_content_hash = candidate.source_content_hash
   and lower(content.source_byte_hash) = candidate.source_byte_hash
   and content.source_url = candidate.source_url
   and content.source_version = candidate.source_version
   and lower(content.media_type) = candidate.media_type
  where content.source_content_id is null;

  if v_missing <> 0 then
    raise exception 'c3_receipt_writer_source_rows_missing_or_changed:%', v_missing;
  end if;

  update rosetta_v2513.source_document_content content
     set source_metadata = jsonb_set(
       jsonb_set(
         coalesce(content.source_metadata, '{}'::jsonb),
         '{text_extractor_version}',
         to_jsonb(candidate.extractor_version),
         true
       ),
       '{content_extraction_receipt}',
       candidate.receipt,
       true
     )
  from c3_backfill_receipt_candidate candidate
  where content.source_document_id = candidate.source_document_id
    and content.source_content_id = candidate.source_content_id
    and content.source_content_hash = candidate.source_content_hash
    and lower(content.source_byte_hash) = candidate.source_byte_hash
    and content.source_url = candidate.source_url
    and content.source_version = candidate.source_version
    and lower(content.media_type) = candidate.media_type
    and (
      content.source_metadata->'content_extraction_receipt' is distinct from candidate.receipt
      or content.source_metadata->>'text_extractor_version' is distinct from candidate.extractor_version
    );

  get diagnostics v_updated = row_count;

  select count(*) into v_verified
  from c3_backfill_receipt_candidate candidate
  join rosetta_v2513.source_document_content content
    on content.source_document_id = candidate.source_document_id
   and content.source_content_id = candidate.source_content_id
   and content.source_content_hash = candidate.source_content_hash
   and content.source_metadata->'content_extraction_receipt' = candidate.receipt
   and content.source_metadata->>'text_extractor_version' = candidate.extractor_version;

  if v_verified is distinct from v_expected then
    raise exception 'c3_receipt_writer_postcondition_failed:%/%', v_verified, v_expected;
  end if;

  raise notice 'c3 receipt writer verified % rows; updated % rows', v_verified, v_updated;
end $$;

commit;
`;
}

export async function run_c3_receipt_writer(options: cli_options): Promise<void> {
  const manifest_tsv = await readFile(options.manifest_tsv, "utf8");
  const results_tsv = await readFile(options.results_tsv, "utf8");
  const manifest_hash = sha256(manifest_tsv);
  const results_hash = sha256(results_tsv);

  if (manifest_hash !== options.expected_manifest_sha256) {
    throw new Error(`manifest_hash_mismatch:${manifest_hash}`);
  }
  if (results_hash !== options.expected_results_sha256) {
    throw new Error(`results_hash_mismatch:${results_hash}`);
  }

  const targets = build_receipt_targets(
    read_manifest(manifest_tsv),
    read_results(results_tsv),
    options.expected_proven_rows,
  );
  const sql = render_receipt_writer_sql(targets, {
    manifest_tsv_sha256: manifest_hash,
    results_tsv_sha256: results_hash,
  });
  await mkdir(path.dirname(options.out_sql), { recursive: true });
  await writeFile(options.out_sql, sql, "utf8");
}

const is_main = process.argv[1] === fileURLToPath(import.meta.url);
if (is_main) {
  run_c3_receipt_writer(parse_args(process.argv.slice(2))).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
