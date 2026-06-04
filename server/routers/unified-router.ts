import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  get_unified_ingestion_metrics,
  get_unified_ingestion_summary,
  get_unified_signal_summary,
  get_unified_signals,
} from "../unified-queries";

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
  get_unified_signals: publicProcedure
    .input(signal_input)
    .query(({ input }) => get_unified_signals(input ?? {})),

  get_unified_signal_summary: publicProcedure
    .input(signal_input)
    .query(({ input }) => get_unified_signal_summary(input ?? {})),

  get_unified_ingestion_metrics: publicProcedure
    .input(stream_input)
    .query(({ input }) => get_unified_ingestion_metrics(input ?? {})),

  get_unified_ingestion_summary: publicProcedure
    .query(() => get_unified_ingestion_summary()),
});
