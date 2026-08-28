import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router } from "express";
import { allowed_target_hints, create_candidates_from_ready_queue, list_corpus_import_queue, get_corpus_import_queue_row, get_registry_entity_candidates_summary, list_registry_entity_candidates, set_corpus_import_queue_target_hint, verify_registry_entity_candidates_dry_run, promote_registry_entity_candidates_apply } from "../engines/ingestion_control";
import { process_one_corpus_import_queue_row, type corpus_import_worker_action } from "../workers/corpus-import-queue-worker";
import { classify_db_error, getPool } from "../db";
import { inferRuntimeCounts, withRuntimeEnvelope } from "../../shared/runtime-envelope";
import {
  background_workers_allowed,
  resolve_lighthouse_runtime_role,
} from "../runtime-role";

const execFileAsync = promisify(execFile);

export const ingestion_control_rest_router = Router();

const INGESTION_CONTROL_SOURCE = "ingestion-control.rest";

function runtime_response<T extends Record<string, any>>(payload: T, options: { action?: string; data?: unknown; availability?: "available" | "partial" | "empty" | "unavailable"; counts?: Record<string, number>; flags?: Record<string, boolean | string | number | null>; meta?: Record<string, unknown>; can_apply?: boolean; blockers?: string[] } = {}) {
  return withRuntimeEnvelope(payload, {
    source: INGESTION_CONTROL_SOURCE,
    action: options.action,
    data: options.data ?? payload,
    availability: options.availability,
    can_apply: options.can_apply,
    blockers: options.blockers,
    counts: options.counts,
    flags: options.flags,
    meta: options.meta,
  });
}

function runtime_error(error: string, message: string | undefined, options: { status?: number; action?: string; diagnostic_code?: string; backend?: unknown; extra?: Record<string, unknown> } = {}) {
  return withRuntimeEnvelope({ success: false, error, ...(message ? { message } : {}), ...(options.diagnostic_code ? { diagnostic_code: options.diagnostic_code } : {}), ...(options.extra ?? {}) }, {
    source: INGESTION_CONTROL_SOURCE,
    action: options.action,
    data: options.extra ?? null,
    availability: "unavailable",
    errors: [{ code: error, message }],
    backend: options.backend,
  });
}

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

function worker_actions_from_body(value: unknown): corpus_import_worker_action[] {
  const allowed = new Set<corpus_import_worker_action>([
    "execute_sql_substrate_handoff",
    "extract_docx_queue_row",
    "normalize_docx_queue_row",
    "create_registry_candidates",
    "promote_registry_candidates",
    "route_corpus_queue_dry_run",
  ]);
  const fallback: corpus_import_worker_action[] = [
    "execute_sql_substrate_handoff",
    "extract_docx_queue_row",
    "normalize_docx_queue_row",
    "create_registry_candidates",
    "promote_registry_candidates",
  ];
  if (!Array.isArray(value)) return fallback;
  const parsed = value.filter((entry): entry is corpus_import_worker_action => typeof entry === "string" && allowed.has(entry as corpus_import_worker_action));
  return parsed.length ? parsed : fallback;
}

// The web service may inspect queue state, but it must never execute corpus
// drains, extraction commands, or promotions in the HTTP process. Mutations
// move to an explicitly scoped worker service; until then they fail closed.
ingestion_control_rest_router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (background_workers_allowed()) return next();

  return res.status(503).json(runtime_error(
    "background_runtime_required",
    "This operation is disabled on the Lighthouse web service.",
    {
      action: "ingestion_control_mutation",
      extra: {
        retryable: false,
        runtime_role: resolve_lighthouse_runtime_role(),
      },
    },
  ));
});

ingestion_control_rest_router.get("/registry-entity-candidates", async (req, res) => {
  try {
    const limit = clamp_integer(req.query.limit, 25, 1, 100);
    const result = await list_registry_entity_candidates({ limit });
    return res.json(runtime_response(result, { data: result, counts: inferRuntimeCounts(result as any, ["total_candidate_count", "processed_count", "candidate_count", "inserted_count", "skipped_count", "verified_count", "blocked_count", "error_count"]) }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("registry_entity_candidates_read_failed", error?.message ?? String(error), { backend: error }));
  }
});

ingestion_control_rest_router.get("/registry-entity-candidates/summary", async (_req, res) => {
  try {
    const result = await get_registry_entity_candidates_summary();
    return res.json(runtime_response(result, { data: result, counts: inferRuntimeCounts(result as any, ["total_candidate_count", "processed_count", "candidate_count", "inserted_count", "skipped_count", "verified_count", "blocked_count", "error_count"]) }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("registry_entity_candidates_summary_failed", error?.message ?? String(error), { backend: error }));
  }
});

ingestion_control_rest_router.post("/registry-entity-candidates/verify-dry-run", async (req, res) => {
  try {
    const limit = clamp_integer(req.body?.limit, 100, 1, 500);
    const result = await verify_registry_entity_candidates_dry_run({
      limit,
      candidate_type: typeof req.body?.candidate_type === "string" ? req.body.candidate_type : null,
      document_family: typeof req.body?.document_family === "string" ? req.body.document_family : null,
      promotion_lane: typeof req.body?.promotion_lane === "string" ? req.body.promotion_lane : null,
    });
    return res.json(runtime_response(result, { data: result, counts: inferRuntimeCounts(result as any, ["total_candidate_count", "processed_count", "candidate_count", "inserted_count", "skipped_count", "verified_count", "blocked_count", "error_count"]) }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("registry_entity_candidates_verify_dry_run_failed", error?.message ?? String(error), { backend: error }));
  }
});

ingestion_control_rest_router.post("/registry-entity-candidates/promote-apply", async (req, res) => {
  try {
    const limit = clamp_integer(req.body?.limit, 10, 1, 25);
    const result = await promote_registry_entity_candidates_apply({
      limit,
      dry_run: req.body?.dry_run !== false,
      target_hint: typeof req.body?.target_hint === "string" ? req.body.target_hint : "state_enriched_registry_docx_review",
      candidate_type: typeof req.body?.candidate_type === "string" ? req.body.candidate_type : "benefit_program",
      promotion_lane: typeof req.body?.promotion_lane === "string" ? req.body.promotion_lane : "state_enriched_registry_docx_review",
    });
    return res.status(result.success ? 200 : 409).json(runtime_response(result, { data: result, counts: inferRuntimeCounts(result as any, ["processed_count", "would_insert_count", "would_update_blank_fields_count", "skipped_count", "blocked_count", "error_count"]), flags: { canonical_promotion_enabled: Boolean((result as any).canonical_promotion_enabled), feature_flag_enabled: Boolean((result as any).feature_flag_enabled) }, can_apply: Boolean((result as any).canonical_promotion_enabled) && Boolean((result as any).feature_flag_enabled) && !(result as any).dry_run }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("registry_entity_candidates_promote_apply_failed", error?.message ?? String(error), { backend: error }));
  }
});

ingestion_control_rest_router.post("/corpus-import-queue/worker-drain", async (req, res) => {
  const started_at = Date.now();
  try {
    const iterations = clamp_integer(req.body?.iterations, 10, 1, 50);
    const actions = worker_actions_from_body(req.body?.actions);
    const results: Array<{ iteration: number; action: corpus_import_worker_action; did_work: boolean }> = [];
    let did_work_count = 0;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      let iteration_work = false;
      for (const action of actions) {
        const did_work = await process_one_corpus_import_queue_row(action);
        if (did_work) did_work_count += 1;
        iteration_work = did_work || iteration_work;
        results.push({ iteration: iteration + 1, action, did_work });
      }
      if (!iteration_work) break;
    }

    return res.json(runtime_response({
      success: true,
      action: "corpus_import_queue_worker_drain",
      runtime_ms: Date.now() - started_at,
      iterations_requested: iterations,
      actions,
      did_work_count,
      results,
    }, { action: "corpus_import_queue_worker_drain", data: { results }, counts: { did_work_count } }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("corpus_import_queue_worker_drain_failed", error?.message ?? String(error), { action: "corpus_import_queue_worker_drain", backend: error, extra: { runtime_ms: Date.now() - started_at } }));
  }
});

ingestion_control_rest_router.get("/corpus-import-queue", async (req, res) => {
  try {
    const status_filter = typeof req.query.status_filter === "string" ? req.query.status_filter : "all";
    const limit = clamp_integer(req.query.limit, 100, 1, 250);
    const allowed_status_filters = new Set(["all", "blocked", "review_required", "pending_bucket_content_scan", "pending_docx_normalization", "ready_for_review", "docx_extraction_failed", "candidates_created"]);
    const result = await list_corpus_import_queue({ status_filter: allowed_status_filters.has(status_filter) ? status_filter as any : "all", limit });
    res.json(runtime_response({ ...result, allowed_target_hints }, { data: { ...result, allowed_target_hints }, counts: inferRuntimeCounts(result as any, ["row_count"]) }));
  } catch (error: any) {
    const diagnostic_code = classify_db_error(error);
    res.status(500).json(runtime_error(diagnostic_code === "db_error" ? "ingestion_control_queue_read_failed" : diagnostic_code, error?.message ?? String(error), { diagnostic_code, backend: error }));
  }
});

ingestion_control_rest_router.get("/corpus-import-queue/:id", async (req, res) => {
  try {
    const id = read_queue_row_id(req.params.id);
    if (!id) return res.status(400).json(runtime_error("invalid_queue_row_id", undefined));
    const result = await get_corpus_import_queue_row({ id });
    if (!result.success) return res.status(404).json(runtime_response(result, { data: result, availability: "unavailable" }));
    return res.json(runtime_response({ ...result, allowed_target_hints }, { data: { ...result, allowed_target_hints }, counts: inferRuntimeCounts(result as any, ["row_count"]) }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("ingestion_control_row_read_failed", error?.message ?? String(error), { backend: error }));
  }
});

ingestion_control_rest_router.post("/corpus-import-queue/:id/set-target-hint", async (req, res) => {
  try {
    const id = read_queue_row_id(req.params.id);
    const target_hint = typeof req.body?.target_hint === "string" ? req.body.target_hint : "";
    if (!id) return res.status(400).json(runtime_error("invalid_queue_row_id", undefined));
    if (!allowed_target_hints.includes(target_hint as any)) return res.status(400).json(runtime_error("target_hint_not_allowed", undefined, { extra: { allowed_target_hints } }));
    const result = await set_corpus_import_queue_target_hint({ id, target_hint: target_hint as any });
    if (!result.success) return res.status(404).json(runtime_response(result, { data: result, availability: "unavailable" }));
    return res.json(runtime_response(result, { data: result, counts: inferRuntimeCounts(result as any, ["total_candidate_count", "processed_count", "candidate_count", "inserted_count", "skipped_count", "verified_count", "blocked_count", "error_count"]) }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("set_target_hint_failed", error?.message ?? String(error), { backend: error }));
  }
});

ingestion_control_rest_router.post("/corpus-import-queue/extract-docx-drain", async (req, res) => {
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
    if (command_no_output) return res.status(409).json(runtime_response({ success: false, error: "extract_docx_no_command_output", message: "extract_docx_drain exited without JSON stdout.", ...command_result }, { data: command_result, availability: "unavailable", blockers: ["extract_docx_no_command_output"] }));
    if (partial_success) return res.json(runtime_response({ success: true, warning: "extract_docx_partial_success", message: `DOCX drain advanced ${command_summary.docxRowsExtracted} rows; ${extraction_failures} rows still need operator review.`, ...command_result }, { data: command_result, availability: "partial" }));
    if (command_failed) return res.status(dry_run ? 200 : 409).json(runtime_response({ success: false, error: "extract_docx_command_reported_failure", message: "extract_docx_drain reported failures and advanced no rows.", ...command_result }, { data: command_result, availability: "unavailable", blockers: ["extract_docx_command_reported_failure"] }));
    return res.json(runtime_response({ success: true, ...command_result }, { data: command_result }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("extract_docx_drain_failed", error?.message ?? String(error), { action: "extract_all_docx_queue_rows", backend: error, extra: { runtime_ms: Date.now() - started_at, stdout_preview: error?.stdout ?? "", stderr_preview: error?.stderr ?? "" } }));
  }
});

ingestion_control_rest_router.post("/corpus-import-queue/create-candidates-from-ready", async (_req, res) => {
  try {
    const result = await create_candidates_from_ready_queue();
    return res.json(runtime_response(result, { data: result, counts: inferRuntimeCounts(result as any, ["total_candidate_count", "processed_count", "candidate_count", "inserted_count", "skipped_count", "verified_count", "blocked_count", "error_count"]) }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("create_candidates_from_ready_failed", error?.message ?? String(error), { action: "create_candidates_from_ready", backend: error }));
  }
});

ingestion_control_rest_router.post("/promote-staged-resources-to-readable", async (req, res) => {
  const started_at = Date.now();
  try {
    const dry_run = req.body?.dry_run !== false;
    const limit_raw = Number(req.body?.limit ?? 0);
    const args = ["scripts/promote-staged-resources-to-readable.mjs", dry_run ? "--dry-run" : "--apply"];
    if (Number.isInteger(limit_raw) && limit_raw > 0) args.push(`--limit=${limit_raw}`);
    const { stdout, stderr } = await execFileAsync(process.execPath, args, { cwd: process.cwd(), timeout: 300000, maxBuffer: 1024 * 1024 * 20, env: process.env });
    const parsed_stdout = parse_command_json(stdout);
    if (!parsed_stdout) return res.status(409).json(runtime_error("promotion_command_no_json_output", undefined, { action: "promote_staged_resources_to_readable", extra: { runtime_ms: Date.now() - started_at, stdout_preview: stdout.slice(0, 4000), stderr_preview: stderr.slice(0, 4000) } }));
    return res.json(runtime_response({ ...parsed_stdout, action: "promote_staged_resources_to_readable", runtime_ms: Date.now() - started_at, stderr_preview: stderr.slice(0, 4000) }, { action: "promote_staged_resources_to_readable", data: parsed_stdout }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("promote_staged_resources_failed", error?.message ?? String(error), { action: "promote_staged_resources_to_readable", backend: error, extra: { runtime_ms: Date.now() - started_at, stdout_preview: error?.stdout ?? "", stderr_preview: error?.stderr ?? "" } }));
  }
});

ingestion_control_rest_router.post("/corpus-import-queue/normalize-docx-drain", async (_req, res) => {
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
    return res.json(runtime_response({ success: true, action: "normalize_all_docx_queue_rows", runtime_ms: Date.now() - started_at, summary: result.rows[0] }, { action: "normalize_all_docx_queue_rows", data: { summary: result.rows[0] }, counts: { normalized_rows: Number(result.rows[0]?.normalized_rows ?? 0), normalized_characters: Number(result.rows[0]?.normalized_characters ?? 0) } }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("normalize_docx_drain_failed", error?.message ?? String(error), { action: "normalize_all_docx_queue_rows", backend: error, extra: { runtime_ms: Date.now() - started_at } }));
  }
});

ingestion_control_rest_router.post("/corpus-import-queue/:id/extract-docx", async (req, res) => {
  const started_at = Date.now();
  try {
    const id = read_queue_row_id(req.params.id);
    if (!id) return res.status(400).json(runtime_error("invalid_queue_row_id", undefined));
    const dry_run = Boolean(req.body?.dry_run);
    const before = await get_corpus_import_queue_row({ id });
    if (!before.success || !before.row) return res.status(404).json(runtime_response(before, { action: "extract_docx_queue_row", data: before, availability: "unavailable" }));
    if (before.row.source_ext !== ".docx" && before.row.next_action !== "extract_docx_queue_row") return res.status(400).json(runtime_error("row_not_eligible_for_docx_extraction", undefined, { action: "extract_docx_queue_row", extra: { row: before.row } }));

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

    if (command_no_output) return res.status(409).json(runtime_response({ success: false, error: "extract_docx_no_command_output", message: "extract_docx_queue_row exited without JSON stdout; extractor did not actually report a result.", ...response_result }, { action: "extract_docx_queue_row", data: response_result, availability: "unavailable", blockers: ["extract_docx_no_command_output"] }));
    if (command_zero_extracted) return res.status(dry_run ? 200 : 409).json(runtime_response({ success: false, error: "extract_docx_zero_rows_extracted", message: "extract_docx_queue_row returned JSON but extracted zero rows for the requested id.", ...response_result }, { action: "extract_docx_queue_row", data: response_result, availability: "empty", blockers: ["extract_docx_zero_rows_extracted"] }));
    if (command_failed) return res.status(dry_run ? 200 : 409).json(runtime_response({ success: false, error: "extract_docx_command_reported_failure", message: "extract_docx_queue_row reported one or more DOCX extraction failures.", ...response_result }, { action: "extract_docx_queue_row", data: response_result, availability: "unavailable", blockers: ["extract_docx_command_reported_failure"] }));
    if (!dry_run && !state_changed) return res.status(409).json(runtime_response({ success: false, error: "extract_docx_no_state_change", message: "extract_docx_queue_row finished but raw_text_chars, import_status, and blocked_reason did not change.", ...response_result }, { action: "extract_docx_queue_row", data: response_result, availability: "partial", blockers: ["extract_docx_no_state_change"] }));
    return res.json(runtime_response({ success: true, ...response_result }, { action: "extract_docx_queue_row", data: response_result }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("extract_docx_queue_row_failed", error?.message ?? String(error), { action: "extract_docx_queue_row", backend: error, extra: { runtime_ms: Date.now() - started_at, stdout_preview: error?.stdout ?? "", stderr_preview: error?.stderr ?? "" } }));
  }
});
