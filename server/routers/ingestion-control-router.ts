import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";

export const ingestionControlRouter = router({
  list_corpus_import_queue: adminProcedure
    .input(z.object({
      status_filter: z.enum([
        "all",
        "blocked",
        "review_required",
        "pending_bucket_content_scan",
        "pending_docx_normalization",
        "docx_extraction_failed",
        "candidates_created",
      ]).default("all"),
      limit: z.number().min(1).max(500).default(100),
    }).optional())
    .query(async ({ input }) => {
      const { list_corpus_import_queue } = await import("../engines/ingestion-control");
      return list_corpus_import_queue(input);
    }),

  get_corpus_import_queue_row: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { get_corpus_import_queue_row } = await import("../engines/ingestion-control");
      return get_corpus_import_queue_row(input);
    }),
});
