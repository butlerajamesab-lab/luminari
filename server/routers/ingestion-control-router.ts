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

  /**
   * Fresh-start registry/backbone reconciliation. This path intentionally does
   * not execute the historical corpus conveyor. Storage remains source evidence;
   * typed candidates and dedupe identities are rebuilt into new v1 relations.
   */
  queue_fresh_corpus_rebuild: adminProcedure
    .input(z.object({
      reason: z.string().max(240).optional(),
      scope_note: z.string().max(1000).optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const { queueFreshCorpusRebuild } = await import("../services/fresh-corpus-reconciliation-v1");
      const result = await queueFreshCorpusRebuild({
        requested_from: "mission_control_admin",
        reason: input?.reason ?? "fresh_start_dedupe_reconciliation",
        scope_note: input?.scope_note ?? null,
        source_buckets: ["State Enriched Registry bucket", "Everything backbone related"],
      });
      return runtime_response(result, { data: result, availability: "available" });
    }),

  run_fresh_corpus_rebuild_batch: adminProcedure
    .input(z.object({
      run_id: z.string().uuid(),
      limit: z.number().int().min(1).max(20).default(6),
    }))
    .mutation(async ({ input }) => {
      const { runFreshCorpusRebuildBatch } = await import("../services/fresh-corpus-reconciliation-v1");
      const result = await runFreshCorpusRebuildBatch(input.run_id, input.limit);
      return runtime_response(result, { data: result, availability: "available" });
    }),

  get_fresh_corpus_rebuild_status: adminProcedure
    .input(z.object({ run_id: z.string().uuid().optional() }).optional())
    .query(async ({ input }) => {
      const { getFreshCorpusRebuildStatus } = await import("../services/fresh-corpus-reconciliation-v1");
      const result = await getFreshCorpusRebuildStatus(input?.run_id);
      return runtime_response(result as Record<string, any>, {
        data: result,
        availability: (result as any)?.status === "not_started" ? "empty" : "available",
      });
    }),
});

// A queued rebuild is an explicit control-plane request stored in Postgres.
// Production startup only resumes that request; it never creates one implicitly.
// This makes deploy/restart safe while allowing a bounded run to continue after
// Render replaces an instance.
if (process.env.NODE_ENV === "production") {
  setTimeout(() => {
    void import("../services/fresh-corpus-reconciliation-v1")
      .then(({ resumeFreshCorpusRebuildFromDatabase }) =>
        resumeFreshCorpusRebuildFromDatabase({ batchSize: 6, maxBatches: 40 }))
      .then(result => {
        if ((result as any)?.status !== "idle") console.log("[FreshCorpusRebuild] startup_resume", result);
      })
      .catch(error => {
        console.error("[FreshCorpusRebuild] startup_resume_failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
      });
  }, 15_000);
}
