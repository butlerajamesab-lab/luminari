import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router } from "express";
import { allowed_target_hints, create_candidates_from_ready_queue, list_corpus_import_queue, get_corpus_import_queue_row, get_registry_entity_candidates_summary, list_registry_entity_candidates, set_corpus_import_queue_target_hint, verify_registry_entity_candidates_dry_run, promote_registry_entity_candidates_apply } from "../engines/ingestion-control";
import { getPool } from "../db";

const execFileAsync = promisify(execFile);

export const ingestionControlRestRouter = Router();


function clamp_integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : fallback;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

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

function failed_rows_from_stdout(parsed_stdout: any) {
  return Array.isArray(parsed_stdout?.rows)
    ? parsed_stdout.rows.filter((row: any) => row?.status === "docx_extraction_failed" || row?.error)
    : [];
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

ingestionControlRestRouter.get("/registry-entity-candidates", async (req, res) => {
  try {
    const limit = clamp_integer(req.query.limit, 25, 1, 100);
    const result = await list_registry_entity_candidates({ limit });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "registry_entity_candidates_read_failed", message: error?.message ?? String(error) });
  }
});

ingestionControlRestRouter.get("/registry-entity-candidates/summary", async (_req, res) => {
  try {
    const result = await get_registry_entity_candidates_summary();
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "registry_entity_candidates_summary_failed", message: error?.message ?? String(error) });
  }
});

ingestionControlRestRouter.post("/registry-entity-candidates/verify-dry-run", async (req, res) => {
  try {
    const limit = clamp_integer(req.body?.limit, 100, 1, 500);
    const result = await verify_registry_entity_candidates_dry_run({
      limit,
      candidate_type: typeof req.body?.candidate_type === "string" ? req.body.candidate_type : null,
      document_family: typeof req.body?.document_family === "string" ? req.body.document_family : null,
      promotion_lane: typeof req.body?.promotion_lane === "string" ? req.body.promotion_lane : null,
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "registry_entity_candidates_verify_dry_run_failed", message: error?.message ?? String(error) });
  }
});

ingestionControlRestRouter.post("/registry-entity-candidates/promote-apply", async (req, res) => {
  try {
    const limit = clamp_integer(req.body?.limit, 10, 1, 25);
    const result = await promote_registry_entity_candidates_apply({
      limit,
      dry_run: req.body?.dry_run !== false,
      target_hint: typeof req.body?.target_hint === "string" ? req.body.target_hint : "state_enriched_registry_docx_review",
      candidate_type: typeof req.body?.candidate_type === "string" ? req.body.candidate_type : "benefit_program",
      promotion_lane: typeof req.body?.promotion_lane === "string" ? req.body.promotion_lane : "state_enriched_registry_docx_review",
    });
    return res.status(result.success ? 200 : 409).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "registry_entity_candidates_promote_apply_failed", message: error?.message ?? String(error) });
  }
});


ingestionControlRestRouter.get("/corpus-import-queue", async (req, res) => {
  try {
    const status_filter = typeof req.query.status_filter === "string" ? req.query.status_filter : "all";
    const limit = clamp_integer(req.query.limit, 100, 1, 250);
    const allowed_status_filters = new Set(["all", "blocked", "review_required", "pending_bucket_content_scan", "pending_docx_normalization", "ready_for_review", "docx_extraction_failed", "candidates_created"]);
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
    const extraction_failures = Number(command_summary?.docxExtractionFailures ?? 0);
    const partial_success = command_extracted && extraction_failures > 0;
    const command_failed = command_no_output || (!command_extracted && extraction_failures > 0);
    const failed_rows = failed_rows_from_stdout(parsed_stdout);
    const command_result = {
      action: "extract_all_docx_queue_rows",
      dry_run,
      queue_row_id: null,
      runtime_ms: Date.now() - started_at,
      state_changed: command_extracted,
      command_failed,
      command_extracted,
      partial_success,
      command_summary,
      command_report,
      command_csv,
      failed_rows,
      failed_row_count: failed_rows.length,
      stdout_preview: stdout.slice(0, 12000),
      stderr_preview: stderr.slice(0, 4000),
      parsed_rows: Array.isArray(parsed_stdout?.rows) ? parsed_stdout.rows : [],
    };
    if (command_no_output) return res.status(409).json({ success: false, error: "extract_docx_no_command_output", message: "extract_docx_drain exited without JSON stdout.", ...command_result });
    if (partial_success) return res.json({ success: true, warning: "extract_docx_partial_success", message: `DOCX drain advanced ${command_summary.docxRowsExtracted} rows; ${extraction_failures} rows still need operator review.`, ...command_result });
    if (command_failed) return res.status(dry_run ? 200 : 409).json({ success: false, error: "extract_docx_command_reported_failure", message: "extract_docx_drain reported failures and advanced no rows.", ...command_result });
    return res.json({ success: true, ...command_result });
  } catch (error: any) {
    return res.status(500).json({ success: false, action: "extract_all_docx_queue_rows", error: "extract_docx_drain_failed", message: error?.message ?? String(error), runtime_ms: Date.now() - started_at, stdout_preview: error?.stdout ?? "", stderr_preview: error?.stderr ?? "" });
  }
});

ingestionControlRestRouter.post("/corpus-import-queue/create-candidates-from-ready", async (_req, res) => {
  try {
    const result = await create_candidates_from_ready_queue();
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, action: "create_candidates_from_ready", error: "create_candidates_from_ready_failed", message: error?.message ?? String(error) });
  }
});

ingestionControlRestRouter.post("/promote-staged-resources-to-readable", async (req, res) => {
  const started_at = Date.now();
  try {
    const dry_run = req.body?.dry_run !== false;
    const limit_raw = Number(req.body?.limit ?? 0);
    const args = ["scripts/promote-staged-resources-to-readable.mjs", dry_run ? "--dry-run" : "--apply"];
    if (Number.isInteger(limit_raw) && limit_raw > 0) args.push(`--limit=${limit_raw}`);
    const { stdout, stderr } = await execFileAsync(process.execPath, args, { cwd: process.cwd(), timeout: 300000, maxBuffer: 1024 * 1024 * 20, env: process.env });
    const parsed_stdout = parse_command_json(stdout);
    if (!parsed_stdout) return res.status(409).json({ success: false, action: "promote_staged_resources_to_readable", error: "promotion_command_no_json_output", runtime_ms: Date.now() - started_at, stdout_preview: stdout.slice(0, 4000), stderr_preview: stderr.slice(0, 4000) });
    return res.json({ ...parsed_stdout, action: "promote_staged_resources_to_readable", runtime_ms: Date.now() - started_at, stderr_preview: stderr.slice(0, 4000) });
  } catch (error: any) {
    return res.status(500).json({ success: false, action: "promote_staged_resources_to_readable", error: "promote_staged_resources_failed", message: error?.message ?? String(error), runtime_ms: Date.now() - started_at, stdout_preview: error?.stdout ?? "", stderr_preview: error?.stderr ?? "" });
  }
});

ingestionControlRestRouter.post("/corpus-import-queue/normalize-docx-drain", async (_req, res) => {
  const started_at = Date.now();
  try {
    const pool = getPool();
    const result = await pool.query(`with normalized as (
      update public.corpus_import_queue
         set import_status = 'ready_for_review',
             normalized_text = trim(regexp_replace(regexp_replace(regexp_replace(coalesce(raw_text, ''), E'\r\n', E'\n', 'g'), E'[ \t]+\n', E'\n', 'g'), E'\n{3,}', E'\n\n', 'g')),
             normalized_text_chars = char_length(trim(regexp_replace(regexp_replace(regexp_replace(coalesce(raw_text, ''), E'\r\n', E'\n', 'g'), E'[ \t]+\n', E'\n', 'g'), E'\n{3,}', E'\n\n', 'g'))),
             worker_state = 'completed_step',
             leased_by = null,
             lease_expires_at = null,
             last_error_code = null,
             last_error_message = null,
             last_transition_at = now(),
             updated_at = now(),
             operation_result_json = coalesce(operation_result_json, '{}'::jsonb) || jsonb_build_object('last_bulk_normalize_at', now(), 'normalizer_version', 'ui-bulk-normalize-v1', 'action', 'normalize_docx_queue_row')
       where source_ext = '.docx'
         and import_status = 'pending_docx_normalization'
         and coalesce(char_length(raw_text), 0) > 0
       returning id, normalized_text_chars
    ) select count(*)::int as normalized_rows, coalesce(sum(normalized_text_chars), 0)::bigint as normalized_characters from normalized`);
    return res.json({ success: true, action: "normalize_all_docx_queue_rows", runtime_ms: Date.now() - started_at, summary: result.rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, action: "normalize_all_docx_queue_rows", error: "normalize_docx_drain_failed", message: error?.message ?? String(error), runtime_ms: Date.now() - started_at });
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
