#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { create_pool } from "./lib/corpus-audit-utils.mjs";

function parse_args(argv = process.argv.slice(2)) {
  const args = { id: null };
  for (const arg of argv) {
    if (arg.startsWith("--id=")) args.id = Number(arg.slice("--id=".length));
  }
  if (!Number.isInteger(args.id) || args.id <= 0) throw new Error("--id=<queue_row_id> is required");
  return args;
}

function get_supabase_url() {
  return process.env.SUPABASE_URL?.trim()
    || process.env.VITE_SUPABASE_URL?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_URL?.trim()
    || "";
}

function get_service_role_key() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SERVICE_KEY?.trim()
    || process.env.SUPABASE_KEY?.trim()
    || "";
}

function assert_sql_substrate_row(row) {
  if (!row) throw Object.assign(new Error("corpus_import_queue_row_not_found"), { code: "corpus_import_queue_row_not_found" });
  if (row.source_ext !== ".sql") throw Object.assign(new Error(`expected .sql source_ext, got ${row.source_ext ?? "null"}`), { code: "unsupported_source_ext" });
  if (!row.storage_bucket || !row.storage_path) throw Object.assign(new Error("missing storage_bucket or storage_path"), { code: "missing_storage_pointer" });
  if (!String(row.target_hint ?? "").includes("substrate_sql_handoff")) {
    throw Object.assign(new Error(`target_hint is not a substrate handoff: ${row.target_hint ?? "null"}`), { code: "unsupported_target_hint" });
  }
}

async function download_sql_text(row) {
  const supabase_url = get_supabase_url();
  const service_role_key = get_service_role_key();
  if (!supabase_url || !service_role_key) {
    throw Object.assign(new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to download storage object"), { code: "missing_supabase_storage_credentials" });
  }
  const supabase = createClient(supabase_url, service_role_key, { auth: { persistSession: false } });
  const { data, error } = await supabase.storage.from(row.storage_bucket).download(row.storage_path);
  if (error) throw Object.assign(new Error(error.message), { code: "storage_download_failed" });
  const text = await data.text();
  if (!text.trim()) throw Object.assign(new Error("downloaded SQL substrate is empty"), { code: "empty_sql_substrate" });
  return text;
}

async function main() {
  const args = parse_args();
  const { pool } = create_pool("apply-sql-substrate-corpus-queue");
  if (!pool) throw Object.assign(new Error("DATABASE_URL is required"), { code: "missing_database_url" });

  try {
    const row_result = await pool.query(
      `select id, source_name, source_ext, storage_bucket, storage_path, storage_mode, target_hint, import_status, leased_by
         from public.corpus_import_queue
        where id = $1`,
      [args.id],
    );
    const row = row_result.rows[0];
    assert_sql_substrate_row(row);

    const sql_text = await download_sql_text(row);
    const started_at = Date.now();

    await pool.query(sql_text);

    const cream_result = await pool.query(`select count(*)::int as count from public.corpus_import_queue where source_name like 'cream:%'`);
    const edge_result = await pool.query(`select count(*)::int as count from public.corpus_graph_candidate_edges where source_name = 'manual_curated_v1'`);
    const cream_rows = Number(cream_result.rows[0]?.count ?? 0);
    const manual_curated_edges = Number(edge_result.rows[0]?.count ?? 0);
    if (cream_rows <= 0) throw Object.assign(new Error("substrate applied but no cream:% rows were created"), { code: "substrate_created_no_cream_rows" });

    const operation_result_json = {
      action: "execute_sql_substrate_handoff",
      runtime_ms: Date.now() - started_at,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
      sql_chars: sql_text.length,
      cream_rows,
      manual_curated_edges,
    };

    await pool.query(
      `select * from public.mark_sql_substrate_handoff_success($1, $2, $3, $4, $5::jsonb)`,
      [row.id, row.leased_by, sql_text.length, cream_rows, JSON.stringify(operation_result_json)],
    );

    console.log(JSON.stringify({ success: true, ...operation_result_json }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error?.code ?? "apply_sql_substrate_failed", message: error?.message ?? String(error) }));
  process.exit(1);
});
