import { Router } from "express";
import { list_corpus_import_queue, get_corpus_import_queue_row } from "../engines/ingestion-control";

export const ingestionControlRestRouter = Router();

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
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
