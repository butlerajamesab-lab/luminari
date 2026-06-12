import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { getPool } from "../db";

const execFileAsync = promisify(execFile);

const worker_id = `corpus-import-worker-${process.pid}-${randomUUID()}`;
const lease_seconds = Number(process.env.CORPUS_IMPORT_WORKER_LEASE_SECONDS ?? 300);
const idle_sleep_ms = Number(process.env.CORPUS_IMPORT_WORKER_IDLE_SLEEP_MS ?? 2000);
const max_batch_per_tick = Number(process.env.CORPUS_IMPORT_WORKER_MAX_BATCH_PER_TICK ?? 3);

type corpus_import_worker_action =
  | "extract_docx_queue_row"
  | "normalize_docx_queue_row"
  | "route_corpus_queue_dry_run";

type claimed_row = {
  id: number;
  import_status: string | null;
  source_ext: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_mode: string | null;
  target_hint: string | null;
  raw_text: string | null;
  attempt_count: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function action_to_status(action: corpus_import_worker_action) {
  if (action === "extract_docx_queue_row") return "pending_bucket_content_scan";
  if (action === "normalize_docx_queue_row") return "pending_docx_normalization";
  return "pending_bucket_content_scan";
}

async function claim_next_row(action: corpus_import_worker_action) {
  const pool = getPool();
  const result = await pool.query(
    `select * from public.claim_corpus_import_queue_row($1, $2, $3)`,
    [worker_id, action_to_status(action), lease_seconds],
  );
  return (result.rows[0] ?? null) as claimed_row | null;
}

async function mark_failure(row: claimed_row, error: any, retryable = true) {
  const pool = getPool();
  await pool.query(
    `select * from public.mark_corpus_import_queue_failure($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      row.id,
      worker_id,
      error?.code ?? "worker_error",
      error?.message ?? String(error),
      retryable,
      JSON.stringify({
        worker_id,
        worker_action_error: error?.message ?? String(error),
        at: new Date().toISOString(),
      }),
    ],
  );
}

async function extract_docx(row: claimed_row) {
  const pool = getPool();
  const started_at = Date.now();
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["scripts/extract-docx-corpus-queue.mjs", `--id=${row.id}`, "--apply"],
    {
      cwd: process.cwd(),
      timeout: 300000,
      maxBuffer: 1024 * 1024 * 20,
      env: process.env,
    },
  );

  const diagnostic = {
    worker_id,
    action: "extract_docx_queue_row",
    queue_row_id: row.id,
    runtime_ms: Date.now() - started_at,
    stdout_preview: stdout.slice(0, 4000),
    stderr_preview: stderr.slice(0, 4000),
    at: new Date().toISOString(),
  };

  await pool.query(
    `update public.corpus_import_queue
       set operation_result_json = coalesce(operation_result_json, '{}'::jsonb) || jsonb_build_object('last_worker_extract', $2::jsonb),
           payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('last_worker_extract', $2::jsonb),
           leased_by = null,
           lease_expires_at = null,
           worker_state = 'extract_command_completed',
           last_transition_at = now(),
           updated_at = now()
     where id = $1`,
    [row.id, JSON.stringify(diagnostic)],
  );
}

async function normalize_docx(row: claimed_row) {
  const normalized_text = (row.raw_text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized_text) {
    throw Object.assign(new Error("missing_raw_text_for_normalization"), { code: "missing_raw_text_for_normalization" });
  }

  const pool = getPool();
  await pool.query(
    `select * from public.mark_normalize_docx_success($1, $2, $3, $4::jsonb)`,
    [row.id, worker_id, normalized_text, JSON.stringify({ worker_id, normalizer: "whitespace_v1", at: new Date().toISOString() })],
  );
}

async function route_dry_run(row: claimed_row) {
  const pool = getPool();
  const route_plan = {
    mode: "dry_run",
    destination: row.target_hint ?? "target_hint_required",
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    storage_mode: row.storage_mode,
    no_canonical_promotion: true,
    requires_manual_review: true,
    at: new Date().toISOString(),
  };

  await pool.query(
    `select * from public.mark_route_dry_run_success($1, $2, $3::jsonb)`,
    [row.id, worker_id, JSON.stringify(route_plan)],
  );
}

async function process_claimed_row(action: corpus_import_worker_action, row: claimed_row) {
  if (action === "extract_docx_queue_row") return extract_docx(row);
  if (action === "normalize_docx_queue_row") return normalize_docx(row);
  return route_dry_run(row);
}

export async function process_one(action: corpus_import_worker_action) {
  const row = await claim_next_row(action);
  if (!row) return false;
  try {
    await process_claimed_row(action, row);
    return true;
  } catch (error) {
    await mark_failure(row, error, (row.attempt_count ?? 0) < 5);
    return false;
  }
}

export async function corpus_import_worker_loop() {
  const actions: corpus_import_worker_action[] = [
    "extract_docx_queue_row",
    "extract_docx_queue_row",
    "normalize_docx_queue_row",
    "route_corpus_queue_dry_run",
  ];

  for (;;) {
    let worked = false;
    for (let i = 0; i < max_batch_per_tick; i += 1) {
      for (const action of actions) {
        worked = (await process_one(action)) || worked;
      }
    }
    if (!worked) await sleep(idle_sleep_ms);
  }
}

if (process.argv.includes("--loop")) {
  corpus_import_worker_loop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
