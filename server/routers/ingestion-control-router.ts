import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { inferRuntimeCounts, withRuntimeEnvelope } from "../../shared/runtime-envelope";

const INGESTION_CONTROL_TRPC_SOURCE = "ingestion-control.trpc";

function runtime_response<T extends Record<string, any>>(payload: T, options: { data?: unknown; availability?: "available" | "partial" | "empty" | "unavailable"; counts?: Record<string, number> } = {}) {
  return withRuntimeEnvelope(payload, {
    source: INGESTION_CONTROL_TRPC_SOURCE,
    data: options.data ?? payload,
    availability: options.availability,
    counts: options.counts,
  });
}

export const ingestionControlRouter = router({
  list_corpus_import_queue: adminProcedure
    .input(z.object({
      status_filter: z.enum([
        "all",
        "blocked",
        "review_required",
        "pending_bucket_content_scan",
        "pending_docx_normalization",
        "ready_for_review",
        "docx_extraction_failed",
        "candidates_created",
      ]).default("all"),
      limit: z.number().min(1).max(500).default(100),
    }).optional())
    .query(async ({ input }) => {
      const { list_corpus_import_queue } = await import("../engines/ingestion_control");
      const result = await list_corpus_import_queue(input);
      return runtime_response(result, { data: result, counts: inferRuntimeCounts(result as any, ["row_count"]) });
    }),

  get_corpus_import_queue_row: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { get_corpus_import_queue_row } = await import("../engines/ingestion_control");
      const result = await get_corpus_import_queue_row(input);
      return runtime_response(result, { data: result, availability: result.success ? "available" : "unavailable" });
    }),
});
