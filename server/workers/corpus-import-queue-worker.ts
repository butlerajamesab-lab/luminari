import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getPool } from "../db";

const execFileAsync = promisify(execFile);

const worker_id = `corpus-import-worker-${process.pid}`;
const lease_seconds = Number(process.env.CORPUS_IMPORT_WORKER_LEASE_SECONDS ?? 300);
const max_attempts = Number(process.env.CORPUS_IMPORT_WORKER_MAX_ATTEMPTS ?? 5);

export type corpus_import_worker_action =
  | "extract_docx_queue_row"
  | "normalize_docx_queue_row"
  | "route_corpus_queue_dry_run";

type claimed_queue_row = {
  id: number;
  source_ext: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_mode: string | null;
  target_hint: string | null;
  import_status: string | null;
  raw_text: string | null;
  attempt_count: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize_text(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function action_to_status(action: corpus_import_worker_action) {
  if (action === "extract_docx_queue_row") return "pending_bucket_content_scan";
  if (action === "normalize_docx_queue_row") return "pending_docx_normalization";
  return "pending_bucket_content_scan";
}

async function claim_next_row(action: corpus_import_worker_action): Promise<claimed_queue_row | null> {
  const pool = getPool();
  const result = await pool.query(
    `select * from public.claim_corpus_import_queue_row($1, $2, $3) limit 1`,
    [worker_id, action_to_status(action), lease_seconds],
  );
  const row = result.rows[0];
  return row ? { ...row, id: Number(row.id), attempt_count: Number(row.attempt_count ?? 0) } : null;
}

async function mark_failure(row: claimed_queue_row, error: any, operation_result_json: Record<string, unknown> = {}) {
  const pool = getPool();
  const retryable = Number(row.attempt_count ?? 0) < max_attempts;
  await pool.query(
    `select * from public.mark_corpus_import_queue_failure($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      row.id,
      worker_id,
      error?.code ?? "worker_error",
      error?.message ?? String(error),
      retryable,
      JSON.stringify(operation_result_json),
    ],
  );
}

async function handle_extract_docx(row: claimed_queue_row) {
  const started_at = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "scripts/extract-docx-corpus-queue.mjs",
      `--id=${row.id}`,
      "--apply",
    ], {
      cwd: process.cwd(),
      timeout: 300000,
      maxBuffer: 1024 * 1024 * 20,
      env: process.env,
    });

    let parsed: any = null;
    try { parsed = stdout.trim() ? JSON.parse(stdout.trim()) : null; } catch {}
    const summary = parsed?.summary ?? null;
    const failures = Number(summary?.docxExtractionFailures ?? 0);
    const extracted = Number(summary?.docxRowsExtracted ?? 0);

    if (failures > 0 || extracted === 0) {
      throw Object.assign(new Error("extract_docx_command_reported_failure"), {
        code: "extract_docx_command_reported_failure",
        stdout_preview: stdout.slice(0, 4000),
        stderr_preview: stderr.slice(0, 4000),
        command_summary: summary,
      });
    }

    return true;
  } catch (error: any) {
    await mark_failure(row, error, {
      action: "extract_docx_queue_row",
      runtime_ms: Date.now() - started_at,
      stdout_preview: error?.stdout_preview ?? "",
      stderr_preview: error?.stderr_preview ?? "",
      command_summary: error?.command_summary ?? null,
    });
    return false;
  }
}

async function handle_normalize_docx(row: claimed_queue_row) {
  const normalized_text = normalize_text(row.raw_text ?? "");
  if (!normalized_text) {
    await mark_failure(row, { code: "missing_raw_text", message: "No raw_text present for normalization" });
    return false;
  }

  const pool = getPool();
  await pool.query(
    `select * from public.mark_normalize_docx_success($1, $2, $3, $4::jsonb)`,
    [row.id, worker_id, normalized_text, JSON.stringify({ normalizer_version: "corpus-import-worker-v1", target_hint: row.target_hint })],
  );
  return true;
}

async function handle_route_dry_run(row: claimed_queue_row) {
  const pool = getPool();
  const route_plan = {
    mode: "dry_run",
    accepted: true,
    destination: row.target_hint ?? "target_hint_required",
    requires_manual_review: true,
    reason: "staging_only_no_canonical_promotion",
    storage_mode: row.storage_mode,
  };
  await pool.query(
    `select * from public.mark_route_dry_run_success($1, $2, $3::jsonb)`,
    [row.id, worker_id, JSON.stringify(route_plan)],
  );
  return true;
}

export async function process_one_corpus_import_queue_row(action: corpus_import_worker_action) {
  const row = await claim_next_row(action);
  if (!row) return false;

  if (action === "extract_docx_queue_row") return handle_extract_docx(row);
  if (action === "normalize_docx_queue_row") return handle_normalize_docx(row);
  return handle_route_dry_run(row);
}

export async function corpus_import_queue_worker_loop() {
  const actions: corpus_import_worker_action[] = [
    "extract_docx_queue_row",
    "extract_docx_queue_row",
    "normalize_docx_queue_row",
    "route_corpus_queue_dry_run",
  ];

  for (;;) {
    let did_work = false;
    for (const action of actions) {
      did_work = (await process_one_corpus_import_queue_row(action)) || did_work;
    }
    if (!did_work) await sleep(2000);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  corpus_import_queue_worker_loop().catch((error) => {
    console.error(JSON.stringify({ success: false, error: "corpus_import_queue_worker_crashed", message: error?.message ?? String(error) }));
    process.exit(1);
  });
}
