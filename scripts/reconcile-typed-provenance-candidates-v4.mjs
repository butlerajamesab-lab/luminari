#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  create_pool,
  get_table_columns,
  repo_root,
  table_exists,
} from "./lib/corpus-audit-utils.mjs";
import {
  TYPED_CANDIDATE_TARGETS,
  TYPED_PROVENANCE_EXTRACTOR_VERSION,
  build_typed_provenance_candidate,
  detect_typed_candidate_types,
  sha256,
} from "./lib/typed-provenance-candidate-v4.mjs";

const default_output_dir = path.join(repo_root, "artifacts", "corpus-audit");
const DEFAULT_QUEUE_IDS = [27, 205, 215];
const MAX_APPLY_QUEUE_IDS = 10;

function parse_args(argv = process.argv.slice(2)) {
  const args = {
    apply: false,
    json_only: false,
    output_dir: default_output_dir,
    queue_ids: [],
    candidate_types: [],
    limit: 2000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--json") args.json_only = true;
    else if (arg === "--row-id") args.queue_ids.push(Number(argv[++index]));
    else if (arg.startsWith("--row-id=")) {
      args.queue_ids.push(Number(arg.slice("--row-id=".length)));
    } else if (arg === "--candidate-type") {
      args.candidate_types.push(String(argv[++index]));
    } else if (arg.startsWith("--candidate-type=")) {
      args.candidate_types.push(arg.slice("--candidate-type=".length));
    } else if (arg === "--limit") {
      args.limit = Number(argv[++index]);
    } else if (arg.startsWith("--limit=")) {
      args.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--out-dir") {
      args.output_dir = path.resolve(argv[++index]);
    } else if (arg.startsWith("--out-dir=")) {
      args.output_dir = path.resolve(arg.slice("--out-dir=".length));
    }
  }

  args.queue_ids = [...new Set(args.queue_ids.filter(Number.isInteger))];
  args.candidate_types = [
    ...new Set(args.candidate_types.map((value) => value.trim()).filter(Boolean)),
  ];
  args.limit = Math.min(Math.max(Number(args.limit) || 2000, 1), 10000);

  if (!args.apply && args.queue_ids.length === 0) {
    args.queue_ids = [...DEFAULT_QUEUE_IDS];
  }
  if (args.apply) {
    if (process.env.ALLOW_TYPED_PROVENANCE_CANDIDATE_APPLY !== "true") {
      throw new Error(
        "apply requires ALLOW_TYPED_PROVENANCE_CANDIDATE_APPLY=true",
      );
    }
    if (args.queue_ids.length === 0) {
      throw new Error("apply requires at least one explicit --row-id");
    }
    if (args.queue_ids.length > MAX_APPLY_QUEUE_IDS) {
      throw new Error(
        `apply is bounded to ${MAX_APPLY_QUEUE_IDS} queue rows per run`,
      );
    }
  }

  for (const candidate_type of args.candidate_types) {
    if (!TYPED_CANDIDATE_TARGETS[candidate_type]) {
      throw new Error(`unsupported candidate type filter: ${candidate_type}`);
    }
  }

  return args;
}

function stable_json(value) {
  if (Array.isArray(value)) return `[${value.map(stable_json).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable_json(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function source_line(provenance, primary, fallback) {
  const value = provenance?.[primary] ?? provenance?.[fallback] ?? null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function source_excerpt(provenance) {
  return String(
    provenance?.source_excerpt ??
      provenance?.raw_fragment_text ??
      provenance?.text ??
      "",
  ).trim();
}

function candidate_from_source_row(row, candidate_type, detected_candidate_types) {
  const provenance = row.forensic_provenance ?? {};
  return build_typed_provenance_candidate({
    source_queue_id: provenance.source_queue_id,
    source_candidate_id: row.id,
    source_candidate_extraction_version: row.extraction_version,
    source_file: row.source_file ?? provenance.source_file ?? provenance.source_name,
    storage_path: provenance.storage_path ?? null,
    source_text_hash: provenance.source_text_hash,
    source_excerpt: source_excerpt(provenance),
    source_line_start: source_line(provenance, "start_line", "source_line_start"),
    source_line_end: source_line(provenance, "end_line", "source_line_end"),
    jurisdiction: row.jurisdiction ?? provenance.final_jurisdiction ?? null,
    candidate_type,
    detected_candidate_types,
  });
}

function candidate_summary(candidate) {
  return {
    content_hash: candidate.content_hash,
    program_id: candidate.program_id,
    candidate_type: candidate.promotion_ready.candidate_type,
    object_class: candidate.promotion_ready.object_class,
    intended_target_table: candidate.promotion_ready.intended_target_table,
    source_queue_id: candidate.forensic_provenance.source_queue_id,
    source_candidate_id: candidate.forensic_provenance.source_candidate_id,
    source_line_start: candidate.forensic_provenance.source_line_start,
    source_line_end: candidate.forensic_provenance.source_line_end,
    source_excerpt: candidate.forensic_provenance.source_excerpt.slice(0, 750),
    field_metadata: candidate.forensic_provenance.field_metadata,
  };
}

async function fetch_source_candidates(client, args) {
  const params = [args.queue_ids.map(String), args.limit];
  const result = await client.query(
    `select id, source_file, jurisdiction, extraction_version,
            promotion_ready, forensic_provenance, confidence_scores,
            content_hash
       from public.registry_entity_extraction_v4
      where forensic_provenance->>'source_queue_id' = any($1::text[])
        and extraction_version = 'candidate_field_binding_v3_fragment_classification'
        and coalesce(promotion_ready->>'candidate_type', confidence_scores->>'candidate_type') = 'review_fragment'
        and coalesce(promotion_ready->>'status', confidence_scores->>'classification_outcome') in ('human_review_required', 'provenance_mismatch')
      order by (forensic_provenance->>'source_queue_id')::bigint, id
      limit $2`,
    params,
  );
  return result.rows;
}

async function existing_hashes(client, hashes) {
  if (hashes.length === 0) return new Set();
  const result = await client.query(
    `select content_hash
       from public.registry_entity_extraction_v4
      where content_hash = any($1::text[])`,
    [hashes],
  );
  return new Set(result.rows.map((row) => String(row.content_hash)));
}

async function validate_target_tables(client, candidates) {
  const tables = [
    ...new Set(
      candidates.map(
        (candidate) => candidate.promotion_ready.intended_target_table,
      ),
    ),
  ];
  const missing = [];
  for (const table_name of tables) {
    if (!(await table_exists(client, table_name))) missing.push(table_name);
  }
  if (missing.length > 0) {
    throw new Error(`missing intended canonical target tables: ${missing.join(", ")}`);
  }
  return tables;
}

async function insert_candidates(client, table_columns, candidates) {
  let inserted_count = 0;
  const inserted_hashes = [];

  for (const candidate of candidates) {
    const row = {
      source_file: candidate.source_file,
      jurisdiction: candidate.jurisdiction,
      extraction_timestamp: new Date(),
      extraction_version: candidate.extraction_version,
      program_id: candidate.program_id,
      name: candidate.name,
      promotion_ready: candidate.promotion_ready,
      forensic_provenance: candidate.forensic_provenance,
      forensic_hash: candidate.forensic_hash,
      confidence_scores: candidate.confidence_scores,
      geocoding_hints: candidate.geocoding_hints,
      content_hash: candidate.content_hash,
    };
    const entries = Object.entries(row).filter(([column_name]) =>
      table_columns.has(column_name),
    );
    const names = entries.map(([column_name]) => column_name);
    const values = entries.map(([, value]) => value);
    const placeholders = entries.map(([column_name, value], index) =>
      ["promotion_ready", "forensic_provenance", "confidence_scores", "geocoding_hints"].includes(
        column_name,
      ) && value !== null
        ? `$${index + 1}::jsonb`
        : `$${index + 1}`,
    );
    const result = await client.query(
      `insert into public.registry_entity_extraction_v4
         (${names.map((name) => `"${name}"`).join(", ")})
       select ${placeholders.join(", ")}
       where not exists (
         select 1 from public.registry_entity_extraction_v4 where content_hash = $${values.length + 1}
       )
       returning content_hash`,
      [...values, candidate.content_hash],
    );
    if (result.rowCount === 1) {
      inserted_count += 1;
      inserted_hashes.push(candidate.content_hash);
    }
  }

  return { inserted_count, inserted_hashes };
}

async function main() {
  const args = parse_args();
  const report = {
    report_id: "typed_provenance_candidate_reconciliation_v4",
    generated_at: new Date().toISOString(),
    extractor_version: TYPED_PROVENANCE_EXTRACTOR_VERSION,
    mode: args.apply ? "apply" : "dry_run",
    queue_ids: args.queue_ids,
    candidate_type_filters: args.candidate_types,
    status: "started",
    writes_performed: false,
    source_candidate_count: 0,
    source_candidates_with_no_detected_type: 0,
    proposed_candidate_count: 0,
    already_present_count: 0,
    would_insert_count: 0,
    inserted_count: 0,
    intended_target_tables: [],
    type_counts: {},
    proposed_candidate_fingerprint_sha256: null,
    samples: [],
  };

  let pool;
  let client;

  try {
    const pool_result = create_pool("typed-provenance-candidate-v4");
    pool = pool_result.pool;
    if (!pool) throw new Error(pool_result.database_status);
    if (!(await table_exists(pool, "registry_entity_extraction_v4"))) {
      throw new Error("missing public.registry_entity_extraction_v4");
    }

    client = await pool.connect();
    await client.query(
      args.apply
        ? "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ WRITE"
        : "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    if (args.apply) {
      await client.query(
        "select pg_advisory_xact_lock(hashtext('typed_provenance_candidate_reconciliation_v4'))",
      );
    }

    const source_rows = await fetch_source_candidates(client, args);
    report.source_candidate_count = source_rows.length;
    const proposals = [];

    for (const row of source_rows) {
      const excerpt = source_excerpt(row.forensic_provenance);
      const detected = detect_typed_candidate_types(excerpt);
      const selected = args.candidate_types.length
        ? detected.filter((candidate_type) =>
            args.candidate_types.includes(candidate_type),
          )
        : detected;
      if (selected.length === 0) {
        report.source_candidates_with_no_detected_type += 1;
        continue;
      }
      for (const candidate_type of selected) {
        proposals.push(candidate_from_source_row(row, candidate_type, detected));
      }
    }

    const deduped = [
      ...new Map(proposals.map((candidate) => [candidate.content_hash, candidate])).values(),
    ];
    report.proposed_candidate_count = deduped.length;
    report.intended_target_tables = await validate_target_tables(client, deduped);

    for (const candidate of deduped) {
      const candidate_type = candidate.promotion_ready.candidate_type;
      report.type_counts[candidate_type] =
        (report.type_counts[candidate_type] ?? 0) + 1;
    }

    report.proposed_candidate_fingerprint_sha256 = sha256(
      stable_json(
        deduped
          .map(candidate_summary)
          .sort((left, right) => left.content_hash.localeCompare(right.content_hash)),
      ),
    );
    report.samples = deduped.slice(0, 30).map(candidate_summary);

    const found_hashes = await existing_hashes(
      client,
      deduped.map((candidate) => candidate.content_hash),
    );
    const pending = deduped.filter(
      (candidate) => !found_hashes.has(candidate.content_hash),
    );
    report.already_present_count = found_hashes.size;
    report.would_insert_count = pending.length;

    if (args.apply) {
      const table_columns = await get_table_columns(
        client,
        "registry_entity_extraction_v4",
      );
      const result = await insert_candidates(client, table_columns, pending);
      report.inserted_count = result.inserted_count;
      report.inserted_hashes = result.inserted_hashes;
      report.writes_performed = result.inserted_count > 0;
    }

    await client.query(args.apply ? "COMMIT" : "ROLLBACK");
    report.status = "completed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    if (client) await client.query("ROLLBACK").catch(() => {});
  } finally {
    client?.release();
    if (pool) await pool.end().catch(() => {});

    await fs.mkdir(args.output_dir, { recursive: true });
    const file_name = args.apply
      ? "typed-provenance-candidate-reconciliation-v4-apply.json"
      : "typed-provenance-candidate-reconciliation-v4-dry-run.json";
    await fs.writeFile(
      path.join(args.output_dir, file_name),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    if (!args.json_only) console.log(JSON.stringify(report, null, 2));
  }
}

main();
