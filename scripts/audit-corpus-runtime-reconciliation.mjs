#!/usr/bin/env node
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  create_pool,
  repo_root,
  table_exists,
} from "./lib/corpus-audit-utils.mjs";

const default_config_path = path.join(
  repo_root,
  "config",
  "corpus-runtime-reconciliation-v1.json",
);
const default_output_dir = path.join(repo_root, "artifacts", "corpus-audit");

function parse_cli_args(argv = process.argv.slice(2)) {
  const args = {
    config_path: default_config_path,
    output_dir: default_output_dir,
    json_only: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") args.config_path = path.resolve(argv[++index]);
    else if (arg.startsWith("--config=")) {
      args.config_path = path.resolve(arg.slice("--config=".length));
    } else if (arg === "--out-dir") {
      args.output_dir = path.resolve(argv[++index]);
    } else if (arg.startsWith("--out-dir=")) {
      args.output_dir = path.resolve(arg.slice("--out-dir=".length));
    } else if (arg === "--json") {
      args.json_only = true;
    }
  }

  return args;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stable_json(value) {
  if (Array.isArray(value)) return `[${value.map(stable_json).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable_json(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalize_queue_row(row, source_role) {
  const source_text = row.normalized_text || row.raw_text || "";
  return {
    queue_id: Number(row.id),
    source_role,
    source_name: row.source_name,
    storage_path: row.storage_path,
    stored_sha256: row.sha256,
    source_text_sha256: sha256(source_text),
    normalized_text_chars: Number(row.normalized_text_chars ?? source_text.length),
    target_hint: row.target_hint,
    import_status: row.import_status,
    worker_state: row.worker_state,
    last_error_code: row.last_error_code,
    updated_at: row.updated_at,
  };
}

function summarize_candidate(candidate) {
  const promotion_ready = candidate.promotion_ready ?? {};
  const forensic_provenance = candidate.forensic_provenance ?? {};
  const confidence_scores = candidate.confidence_scores ?? {};
  const fields =
    forensic_provenance.fields ??
    forensic_provenance.field_metadata ??
    {};
  const source_line_start =
    forensic_provenance.start_line ??
    forensic_provenance.source_line_start;
  const source_line_end =
    forensic_provenance.end_line ??
    forensic_provenance.source_line_end;
  const excerpt = String(forensic_provenance.source_excerpt ?? "");
  return {
    id: String(candidate.id),
    source_queue_id: String(forensic_provenance.source_queue_id ?? ""),
    candidate_type: String(
      promotion_ready.candidate_type ??
        confidence_scores.candidate_type ??
        "(null)",
    ),
    candidate_status: String(
      promotion_ready.status ??
        confidence_scores.classification_outcome ??
        "(null)",
    ),
    document_family: String(promotion_ready.document_family ?? "(null)"),
    promotion_ready: promotion_ready.ready === true,
    content_hash: candidate.content_hash ?? null,
    forensic_hash: candidate.forensic_hash ?? null,
    source_span_present:
      Number.isFinite(Number(source_line_start)) &&
      Number.isFinite(Number(source_line_end)),
    source_excerpt_present: excerpt.length > 0,
    fields_present:
      fields && typeof fields === "object" && Object.keys(fields).length > 0,
    useful_source_signal:
      /https?:\/\/|www\.|\b(?:phone|hotline|website|address|deadline|appeal|days?|wage|tribe|tribal)\b|§|u\.s\.c\.|c\.f\.r\./i
        .test(excerpt),
    source_excerpt: excerpt.slice(0, 1200),
  };
}

function aggregate_candidates(candidates) {
  const grouped = new Map();
  let source_excerpt_count = 0;
  let source_span_count = 0;
  let fields_present_count = 0;
  let promotable_count = 0;
  let field_binding_loss_count = 0;

  for (const candidate of candidates) {
    const key = [
      candidate.document_family,
      candidate.candidate_type,
      candidate.candidate_status,
    ].join("|");
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
    if (candidate.source_excerpt_present) source_excerpt_count += 1;
    if (candidate.source_span_present) source_span_count += 1;
    if (candidate.fields_present) fields_present_count += 1;
    if (candidate.promotion_ready) promotable_count += 1;
    if (
      candidate.candidate_type === "review_fragment" &&
      candidate.source_excerpt_present &&
      candidate.useful_source_signal &&
      !candidate.fields_present
    ) {
      field_binding_loss_count += 1;
    }
  }

  const classification_counts = [...grouped.entries()]
    .map(([key, rows]) => {
      const [document_family, candidate_type, candidate_status] = key.split("|");
      return { document_family, candidate_type, candidate_status, rows };
    })
    .sort((left, right) =>
      right.rows - left.rows ||
      left.candidate_type.localeCompare(right.candidate_type) ||
      left.candidate_status.localeCompare(right.candidate_status)
    );

  const fingerprint_rows = candidates
    .map((candidate) => ({
      id: candidate.id,
      source_queue_id: candidate.source_queue_id,
      candidate_type: candidate.candidate_type,
      candidate_status: candidate.candidate_status,
      document_family: candidate.document_family,
      promotion_ready: candidate.promotion_ready,
      content_hash: candidate.content_hash,
      forensic_hash: candidate.forensic_hash,
      source_span_present: candidate.source_span_present,
      source_excerpt_present: candidate.source_excerpt_present,
      fields_present: candidate.fields_present,
    }))
    .sort((left, right) => left.id.localeCompare(right.id, undefined, {
      numeric: true,
    }));

  return {
    total_candidates: candidates.length,
    source_excerpt_count,
    source_span_count,
    fields_present_count,
    promotable_count,
    field_binding_loss_count,
    candidate_fingerprint_sha256: sha256(stable_json(fingerprint_rows)),
    classification_counts,
  };
}

function render_markdown(report) {
  const lines = [
    "# Corpus-to-Runtime Reconciliation V1",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Status: **${report.status}**`,
    "",
    `Configuration hash: \`${report.config_sha256}\``,
    "",
  ];

  if (report.error) {
    lines.push(`Error: ${report.error}`, "");
  }

  for (const slice of report.slices) {
    lines.push(`## ${slice.slice_id}`, "");
    lines.push(`Family: \`${slice.family_key}\``, "");
    lines.push(`Jurisdiction: ${slice.jurisdiction}`, "");
    lines.push("### Source rows", "");
    lines.push("| Queue ID | Role | Source | Status | Text chars | Text SHA-256 |");
    lines.push("|---:|---|---|---|---:|---|");
    for (const source of slice.queue_rows) {
      lines.push(
        `| ${source.queue_id} | ${source.source_role} | ${source.source_name} | ${source.import_status} | ${source.normalized_text_chars} | \`${source.source_text_sha256}\` |`,
      );
    }
    lines.push("", "### Candidate proof", "");
    lines.push(
      `- Total candidates: ${slice.candidate_summary.total_candidates}`,
      `- Source excerpts preserved: ${slice.candidate_summary.source_excerpt_count}`,
      `- Exact source spans present: ${slice.candidate_summary.source_span_count}`,
      `- Candidates with bound fields: ${slice.candidate_summary.fields_present_count}`,
      `- Promotable candidates: ${slice.candidate_summary.promotable_count}`,
      `- Source-backed likely field-binding losses: ${slice.candidate_summary.field_binding_loss_count}`,
      `- Candidate fingerprint: \`${slice.candidate_summary.candidate_fingerprint_sha256}\``,
      "",
    );
    lines.push("| Family | Candidate type | Status | Rows |");
    lines.push("|---|---|---|---:|");
    for (const item of slice.candidate_summary.classification_counts) {
      lines.push(
        `| ${item.document_family} | ${item.candidate_type} | ${item.candidate_status} | ${item.rows} |`,
      );
    }
    lines.push("", "### Current conclusion", "");
    lines.push(`- First demonstrated loss point: \`${slice.first_loss_point}\``);
    lines.push(`- Promotion state: \`${slice.promotion_state}\``);
    lines.push(`- Runtime consumers declared: ${slice.runtime_consumers.join(", ") || "none"}`);
    lines.push("");
  }

  lines.push(
    "## Safety receipt",
    "",
    "- Database transaction mode: `REPEATABLE READ READ ONLY`",
    "- Database mutations: none",
    "- Production promotions: none",
    "- Docket Room / LegiScan changes: none",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function load_config(config_path) {
  const raw = await fs.readFile(config_path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.slices) || parsed.slices.length === 0) {
    throw new Error("reconciliation config must contain at least one slice");
  }
  return { raw, parsed };
}

async function fetch_family_contract(client, family_key) {
  const result = await client.query(
    `select family_key, family_name, scope_description, required_object_classes,
            expected_runtime_consumers, canonical_destination_notes, is_active
       from public.luminari_document_family_contracts
      where family_key = $1`,
    [family_key],
  );
  return result.rows[0] ?? null;
}

async function fetch_source_precedence(client, family_key) {
  const result = await client.query(
    `select object_class, jurisdiction_scope, preferred_family_key,
            fallback_family_keys, rule_description, is_active
       from public.luminari_source_precedence_rules
      where preferred_family_key = $1
         or $1 = any(coalesce(fallback_family_keys, array[]::text[]))
      order by object_class, jurisdiction_scope`,
    [family_key],
  );
  return result.rows;
}

async function fetch_runtime_table_candidates(client, runtime_consumers) {
  if (!Array.isArray(runtime_consumers) || runtime_consumers.length === 0) {
    return [];
  }
  const result = await client.query(
    `select table_name, table_type, current_row_count, domain_family,
            lifecycle_status, canonical_target, write_policy,
            runtime_consumer, source_of_truth_rank, review_status
       from public.luminari_table_classification classification
      where exists (
        select 1
          from unnest($1::text[]) consumer
         where coalesce(classification.runtime_consumer, '') ilike '%' || consumer || '%'
      )
      order by source_of_truth_rank nulls last, table_name`,
    [runtime_consumers],
  );
  return result.rows;
}

async function fetch_queue_rows(client, slice) {
  const queue_ids = slice.queue_rows.map((row) => Number(row.queue_id));
  const result = await client.query(
    `select id, source_name, storage_path, sha256, target_hint, import_status,
            worker_state, last_error_code, normalized_text_chars, normalized_text,
            raw_text, updated_at
       from public.corpus_import_queue
      where id = any($1::bigint[])
      order by id`,
    [queue_ids],
  );

  const by_id = new Map(result.rows.map((row) => [Number(row.id), row]));
  return slice.queue_rows.map((expected) => {
    const actual = by_id.get(Number(expected.queue_id));
    if (!actual) {
      throw new Error(
        `${slice.slice_id}: missing corpus_import_queue row ${expected.queue_id}`,
      );
    }
    const haystack = `${actual.source_name ?? ""} ${actual.storage_path ?? ""}`;
    const pattern = new RegExp(expected.expected_name_pattern, "i");
    if (!pattern.test(haystack)) {
      throw new Error(
        `${slice.slice_id}: queue row ${expected.queue_id} failed expected name pattern ${expected.expected_name_pattern}`,
      );
    }
    return normalize_queue_row(actual, expected.source_role);
  });
}

async function fetch_candidates(client, queue_ids) {
  const result = await client.query(
    `select id, source_file, jurisdiction, name, promotion_ready,
            forensic_provenance, confidence_scores, content_hash, forensic_hash
       from public.registry_entity_extraction_v4
      where forensic_provenance->>'source_queue_id' = any($1::text[])
      order by id`,
    [queue_ids.map(String)],
  );
  return result.rows.map(summarize_candidate);
}

async function fetch_promotion_accounting(client, queue_ids) {
  const result = await client.query(
    `select accounting.lane, accounting.action_type, accounting.is_dry_run,
            accounting.status, accounting.reason, count(*)::int as rows
       from public.conveyor_promotion_accounting accounting
       join public.registry_entity_extraction_v4 candidate
         on accounting.source_record_id = candidate.id::text
      where candidate.forensic_provenance->>'source_queue_id' = any($1::text[])
      group by accounting.lane, accounting.action_type, accounting.is_dry_run,
               accounting.status, accounting.reason
      order by rows desc, accounting.lane, accounting.status`,
    [queue_ids.map(String)],
  );
  return result.rows;
}

function derive_first_loss_point(slice, candidate_summary) {
  if (candidate_summary.total_candidates === 0) {
    return "candidate_extraction";
  }
  if (
    slice.slice_id === "utah_parser_loss" &&
    candidate_summary.field_binding_loss_count > 0
  ) {
    return "candidate_field_binding";
  }
  if (candidate_summary.source_excerpt_count < candidate_summary.total_candidates) {
    return "candidate_source_span_preservation";
  }
  if (candidate_summary.fields_present_count === 0) {
    return "candidate_field_binding";
  }
  return "not_yet_proven_beyond_candidate_verification";
}

async function reconcile_slice(client, slice) {
  const queue_rows = await fetch_queue_rows(client, slice);
  const queue_ids = queue_rows.map((row) => row.queue_id);
  const family_contract = await fetch_family_contract(client, slice.family_key);
  if (!family_contract) {
    throw new Error(`${slice.slice_id}: missing family contract ${slice.family_key}`);
  }

  const candidates = await fetch_candidates(client, queue_ids);
  const candidate_summary = aggregate_candidates(candidates);
  const source_precedence = await fetch_source_precedence(
    client,
    slice.family_key,
  );
  const runtime_consumers = family_contract.expected_runtime_consumers ?? [];
  const runtime_table_candidates = await fetch_runtime_table_candidates(
    client,
    runtime_consumers,
  );
  const promotion_accounting = await fetch_promotion_accounting(
    client,
    queue_ids,
  );

  const blocker_samples = candidates
    .filter((candidate) =>
      candidate.candidate_status === "human_review_required" ||
      candidate.candidate_status === "provenance_mismatch" ||
      (
        candidate.candidate_type === "review_fragment" &&
        candidate.useful_source_signal &&
        !candidate.fields_present
      )
    )
    .slice(0, 25);

  const observed_types = new Set(
    candidates.map((candidate) => candidate.candidate_type),
  );
  const missing_required_candidate_classes =
    slice.required_candidate_classes.filter((candidate_type) =>
      !observed_types.has(candidate_type)
    );

  return {
    slice_id: slice.slice_id,
    family_key: slice.family_key,
    jurisdiction: slice.jurisdiction,
    acceptance_focus: slice.acceptance_focus,
    queue_rows,
    family_contract,
    source_precedence,
    runtime_consumers,
    runtime_table_candidates,
    candidate_summary,
    missing_required_candidate_classes,
    promotion_accounting,
    blocker_samples,
    first_loss_point: derive_first_loss_point(slice, candidate_summary),
    promotion_state:
      candidate_summary.field_binding_loss_count > 0 ||
        blocker_samples.length > 0
        ? "blocked_pending_reconciliation"
        : "audit_only_no_promotion_authorized",
  };
}

async function main() {
  const args = parse_cli_args();
  const report = {
    report_id: "corpus_runtime_reconciliation_v1",
    generated_at: new Date().toISOString(),
    status: "started",
    database_status: "unknown",
    config_path: path.relative(repo_root, args.config_path),
    config_sha256: null,
    transaction_mode: "repeatable_read_read_only",
    writes_performed: false,
    slices: [],
  };

  let pool;
  let client;

  try {
    const config = await load_config(args.config_path);
    report.config_sha256 = sha256(config.raw);

    const pool_result = create_pool("corpus-runtime-reconciliation-v1");
    pool = pool_result.pool;
    report.database_status = pool_result.database_status;
    if (!pool) throw new Error(pool_result.database_status);

    const required_tables = [
      "corpus_import_queue",
      "registry_entity_extraction_v4",
      "luminari_document_family_contracts",
      "luminari_source_precedence_rules",
      "luminari_table_classification",
      "conveyor_promotion_accounting",
    ];
    for (const table_name of required_tables) {
      if (!(await table_exists(pool, table_name))) {
        throw new Error(`missing required table public.${table_name}`);
      }
    }

    client = await pool.connect();
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );

    for (const slice of config.parsed.slices) {
      report.slices.push(await reconcile_slice(client, slice));
    }

    await client.query("COMMIT");
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
    const json_path = path.join(
      args.output_dir,
      "corpus-runtime-reconciliation-v1.json",
    );
    const markdown_path = path.join(
      args.output_dir,
      "corpus-runtime-reconciliation-v1.md",
    );
    await fs.writeFile(json_path, `${JSON.stringify(report, null, 2)}\n`);
    if (!args.json_only) {
      await fs.writeFile(markdown_path, render_markdown(report));
    }
    console.log(JSON.stringify(report, null, 2));
  }
}

main();
