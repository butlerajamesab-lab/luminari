import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router } from "express";
import { allowed_target_hints, list_corpus_import_queue, get_corpus_import_queue_row, set_corpus_import_queue_target_hint } from "../engines/ingestion-control";
import { getPool } from "../db";

const execFileAsync = promisify(execFile);

export const ingestionControlRestRouter = Router();

function read_queue_row_id(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function row_state_changed(before_row: any, after_row: any) {
  if (!before_row || !after_row) return false;
  return (
    Number(after_row.raw_text_chars ?? 0) > Number(before_row.raw_text_chars ?? 0)
    || after_row.import_status !== before_row.import_status
    || after_row.blocked_reason !== before_row.blocked_reason
  );
}

function parse_command_json(stdout: string) {
  try {
    const trimmed = stdout.trim();
    return trimmed ? JSON.parse(trimmed) : null;
  } catch {
    return null;
  }
}

async function persist_extract_command_diagnostic(id: number, diagnostic: Record<string, unknown>) {
  const pool = getPool();
  await pool.query(
    `update public.corpus_import_queue
       set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('last_extract_command', $2::jsonb),
           updated_at = now()
     where id = $1`,
    [id, JSON.stringify(diagnostic)],
  );
}

ingestionControlRestRouter.get("/corpus-import-queue", async (req, res) => {
  try {
    const status_filter = typeof req.query.status_filter === "string" ? req.query.status_filter : "all";
    const limit_raw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
    const limit = Number.isFinite(limit_raw) ? limit_raw : 100;
    const allowed_status_filters = new Set(["all", "blocked", "review_required", "pending_bucket_content_scan", "pending_docx_normalization", "docx_extraction_failed", "candidates_created"]);
    const result = await list_corpus_import_queue({ status_filter: allowed_status_filters.has(status_filter) ? status_filter as any : "all", limit });
    res.json({ ...result, allowed_target_hints });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "ingestion_control_queue_read_failed", message: error?.message ?? String(error) });
  }
});

ingestionControlRestRouter.get("/corpus-import-queue/:id", async (req, res) => {
  try {
    const id = read_queue_row_id(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "invalid_queue_row_id" });
    const result = await get_corpus_import_queue_row({ id });
    if (!result.success) return res.status(404).json(result);
    return res.json({ ...result, allowed_target_hints });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "ingestion_control_row_read_failed", message: error?.message ?? String(error) });
  }
});

ingestionControlRestRouter.post("/corpus-import-queue/:id/set-target-hint", async (req, res) => {
  try {
    const id = read_queue_row_id(req.params.id);
    const target_hint = typeof req.body?.target_hint === "string" ? req.body.target_hint : "";
    if (!id) return res.status(400).json({ success: false, error: "invalid_queue_row_id" });
    if (!allowed_target_hints.includes(target_hint as any)) return res.status(400).json({ success: false, error: "target_hint_not_allowed", allowed_target_hints });
    const result = await set_corpus_import_queue_target_hint({ id, target_hint: target_hint as any });
    if (!result.success) return res.status(404).json(result);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "set_target_hint_failed", message: error?.message ?? String(error) });
  }
});

ingestionControlRestRouter.post("/corpus-import-queue/extract-docx-drain", async (req, res) => {
  const started_at = Date.now();
  try {
    const dry_run = Boolean(req.body?.dry_run);
    const args = ["scripts/extract-docx-corpus-queue.mjs", dry_run ? "--dry-run" : "--apply"];
    const { stdout, stderr } = await execFileAsync(process.execPath, args, { cwd: process.cwd(), timeout: 300000, maxBuffer: 1024 * 1024 * 50, env: process.env });
    const parsed_stdout = parse_command_json(stdout);
    const command_summary = parsed_stdout?.summary ?? null;
    const command_report = parsed_stdout?.report ?? null;
    const command_csv = parsed_stdout?.csv ?? null;
    const command_no_output = !stdout.trim() || !command_summary;
    const command_extracted = Number(command_summary?.docxRowsExtracted ?? 0) > 0;
    const command_failed = command_no_output || Number(command_summary?.docxExtractionFailures ?? 0) > 0;
    const command_result = { action: "extract_all_docx_queue_rows", dry_run, queue_row_id: null, runtime_ms: Date.now() - started_at, state_changed: command_extracted, command_failed, command_extracted, command_summary, command_report, command_csv, stdout_preview: stdout.slice(0, 12000), stderr_preview: stderr.slice(0, 4000), parsed_rows: Array.isArray(parsed_stdout?.rows) ? parsed_stdout.rows : [] };
    if (command_no_output) return res.status(409).json({ success: false, error: "extract_docx_no_command_output", message: "extract_docx_drain exited without JSON stdout.", ...command_result });
    if (command_failed) return res.status(dry_run ? 200 : 409).json({ success: false, error: "extract_docx_command_reported_failure", message: "extract_docx_drain reported one or more failures.", ...command_result });
    return res.json({ success: true, ...command_result });
  } catch (error: any) {
    return res.status(500).json({ success: false, action: "extract_all_docx_queue_rows", error: "extract_docx_drain_failed", message: error?.message ?? String(error), runtime_ms: Date.now() - started_at, stdout_preview: error?.stdout ?? "", stderr_preview: error?.stderr ?? "" });
  }
});

ingestionControlRestRouter.post("/corpus-import-queue/:id/extract-docx", async (req, res) => {
  const started_at = Date.now();
  try {
    const id = read_queue_row_id(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "invalid_queue_row_id" });
    const dry_run = Boolean(req.body?.dry_run);
    const before = await get_corpus_import_queue_row({ id });
    if (!before.success || !before.row) return res.status(404).json(before);
    if (before.row.source_ext !== ".docx" && before.row.next_action !== "extract_docx_queue_row") return res.status(400).json({ success: false, error: "row_not_eligible_for_docx_extraction", row: before.row });

    const args = ["scripts/extract-docx-corpus-queue.mjs", `--id=${id}`, dry_run ? "--dry-run" : "--apply"];
    const { stdout, stderr } = await execFileAsync(process.execPath, args, { cwd: process.cwd(), timeout: 300000, maxBuffer: 1024 * 1024 * 20, env: process.env });
    const parsed_stdout = parse_command_json(stdout);
    const command_summary = parsed_stdout?.summary ?? null;
    const command_report = parsed_stdout?.report ?? null;
    const command_csv = parsed_stdout?.csv ?? null;
    const command_no_output = !stdout.trim() || !command_summary;
    const command_extracted = Number(command_summary?.docxRowsExtracted ?? 0) > 0;
    const command_zero_extracted = !command_no_output && !command_extracted;
    const command_failed = command_no_output || command_zero_extracted || Number(command_summary?.docxExtractionFailures ?? 0) > 0;
    const after = await get_corpus_import_queue_row({ id });
    const state_changed = row_state_changed(before.row, after.row);
    const command_result = { action: "extract_docx_queue_row", dry_run, queue_row_id: id, runtime_ms: Date.now() - started_at, state_changed, command_failed, command_extracted, command_summary, command_report, command_csv, stdout_preview: stdout.slice(0, 4000), stderr_preview: stderr.slice(0, 4000) };
    const error_code = command_no_output ? "extract_docx_no_command_output" : (command_zero_extracted ? "extract_docx_zero_rows_extracted" : (command_failed ? "extract_docx_command_reported_failure" : (!dry_run && !state_changed ? "extract_docx_no_state_change" : null)));
    await persist_extract_command_diagnostic(id, { ...command_result, error_code, recorded_at: new Date().toISOString() });
    const refreshed = await get_corpus_import_queue_row({ id });
    const response_result = { ...command_result, before_row: before.row, row: refreshed.row ?? after.row ?? before.row };

    if (command_no_output) return res.status(409).json({ success: false, error: "extract_docx_no_command_output", message: "extract_docx_queue_row exited without JSON stdout; extractor did not actually report a result.", ...response_result });
    if (command_zero_extracted) return res.status(dry_run ? 200 : 409).json({ success: false, error: "extract_docx_zero_rows_extracted", message: "extract_docx_queue_row returned JSON but extracted zero rows for the requested id.", ...response_result });
    if (command_failed) return res.status(dry_run ? 200 : 409).json({ success: false, error: "extract_docx_command_reported_failure", message: "extract_docx_queue_row reported one or more DOCX extraction failures.", ...response_result });
    if (!dry_run && !state_changed) return res.status(409).json({ success: false, error: "extract_docx_no_state_change", message: "extract_docx_queue_row finished but raw_text_chars, import_status, and blocked_reason did not change.", ...response_result });
    return res.json({ success: true, ...response_result });
  } catch (error: any) {
    return res.status(500).json({ success: false, action: "extract_docx_queue_row", error: "extract_docx_queue_row_failed", message: error?.message ?? String(error), runtime_ms: Date.now() - started_at, stdout_preview: error?.stdout ?? "", stderr_preview: error?.stderr ?? "" });
  }
});
