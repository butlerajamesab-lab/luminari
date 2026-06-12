import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router } from "express";
import { list_corpus_import_queue, get_corpus_import_queue_row } from "../engines/ingestion-control";

const execFileAsync = promisify(execFile);

export const ingestionControlRestRouter = Router();

function read_queue_row_id(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

ingestionControlRestRouter.get("/corpus-import-queue", async (req, res) => {
  try {
    const status_filter = typeof req.query.status_filter === "string" ? req.query.status_filter : "all";
    const limit_raw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
    const limit = Number.isFinite(limit_raw) ? limit_raw : 100;

    const allowed_status_filters = new Set([
      "all",
      "blocked",
      "review_required",
      "pending_bucket_content_scan",
      "pending_docx_normalization",
      "docx_extraction_failed",
      "candidates_created",
    ]);

    const result = await list_corpus_import_queue({
      status_filter: allowed_status_filters.has(status_filter) ? status_filter as any : "all",
      limit,
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: "ingestion_control_queue_read_failed",
      message: error?.message ?? String(error),
    });
  }
});

ingestionControlRestRouter.get("/corpus-import-queue/:id", async (req, res) => {
  try {
    const id = read_queue_row_id(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "invalid_queue_row_id" });
    }

    const result = await get_corpus_import_queue_row({ id });
    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: "ingestion_control_row_read_failed",
      message: error?.message ?? String(error),
    });
  }
});

ingestionControlRestRouter.post("/corpus-import-queue/:id/extract-docx", async (req, res) => {
  const started_at = Date.now();
  try {
    const id = read_queue_row_id(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "invalid_queue_row_id" });
    }

    const dry_run = Boolean(req.body?.dry_run);
    const before = await get_corpus_import_queue_row({ id });
    if (!before.success || !before.row) {
      return res.status(404).json(before);
    }

    if (before.row.source_ext !== ".docx" && before.row.next_action !== "extract_docx_queue_row") {
      return res.status(400).json({
        success: false,
        error: "row_not_eligible_for_docx_extraction",
        row: before.row,
      });
    }

    const args = ["scripts/extract-docx-corpus-queue.mjs", `--id=${id}`, dry_run ? "--dry-run" : "--apply"];
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      timeout: 300000,
      maxBuffer: 1024 * 1024 * 20,
      env: process.env,
    });

    const after = await get_corpus_import_queue_row({ id });

    return res.json({
      success: true,
      action: "extract_docx_queue_row",
      dry_run,
      queue_row_id: id,
      runtime_ms: Date.now() - started_at,
      stdout_preview: stdout.slice(0, 4000),
      stderr_preview: stderr.slice(0, 4000),
      row: after.row ?? before.row,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      action: "extract_docx_queue_row",
      error: "extract_docx_queue_row_failed",
      message: error?.message ?? String(error),
      runtime_ms: Date.now() - started_at,
    });
  }
});
