import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  get_canonical_live_signal_summary,
  get_canonical_live_signals,
} from "../canonical-live-signal-queries";
import {
  get_canonical_atlas_stream_metrics,
  get_canonical_atlas_stream_summary,
} from "../canonical-atlas-stream-queries";

const signal_input = z.object({
  stream_id: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
}).optional();

const stream_input = z.object({
  stream_id: z.string().optional(),
}).optional();

export const unifiedRouter = router({
  /**
   * Mission Control's unified signal surface is a Lighthouse projection of the
   * current governed Atlas Domain 3 state. Legacy detected_signals remain in
   * storage for audit history but are not current runtime signal output.
   */
  get_unified_signals: publicProcedure
    .input(signal_input)
    .query(({ input }) => get_canonical_live_signals({
      stream_id: input?.stream_id,
      severity: input?.severity,
      status: input?.status,
      limit: input?.limit,
      offset: input?.offset,
    })),

  get_unified_signal_summary: publicProcedure
    .input(signal_input)
    .query(({ input }) => get_canonical_live_signal_summary({
      stream_id: input?.stream_id,
      severity: input?.severity,
      status: input?.status,
    })),

  /**
   * Stream/runtime state is owned by Atlas and projected into Lighthouse DB.
   * Mission Control remains an observer and does not infer runtime state from
   * the older local data_stream_registry scheduler.
   */
  get_unified_ingestion_metrics: publicProcedure
    .input(stream_input)
    .query(({ input }) => get_canonical_atlas_stream_metrics(input ?? {})),

  get_unified_ingestion_summary: publicProcedure
    .query(() => get_canonical_atlas_stream_summary()),
});
