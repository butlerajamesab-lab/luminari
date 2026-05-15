/**
 * lighthouse/trends.ts
 *
 * tRPC procedures for the Trend Pressure surface.
 * Reads exclusively from v_active_trends canonical view via lighthouseClient.
 * All procedures are read-only.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc.js";
import { getActiveTrends } from "../../services/lighthouseClient.js";

export const lighthouseTrendsRouter = router({
  /** List active trends with optional filters */
  list: protectedProcedure
    .input(
      z.object({
        jurisdiction: z.string().optional(),
        classification: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const trends = await getActiveTrends({
        jurisdiction: input.jurisdiction,
        classification: input.classification,
        limit: input.limit,
      });
      return { trends, count: trends.length };
    }),

  /** Get a single trend by trend_id */
  getById: protectedProcedure
    .input(z.object({ trendId: z.string() }))
    .query(async ({ input }) => {
      const all = await getActiveTrends({ limit: 500 });
      const trend = all.find((t) => t.trend_id === input.trendId) ?? null;
      return { trend };
    }),

  /** Pressure summary — top trends by pressure_index */
  pressureSummary: protectedProcedure
    .input(z.object({ topN: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const trends = await getActiveTrends({ limit: 500 });
      const sorted = [...trends].sort((a, b) => b.pressure_index - a.pressure_index);
      const top = sorted.slice(0, input.topN);

      const byClassification: Record<string, number> = {};
      for (const t of trends) {
        byClassification[t.trend_classification] = (byClassification[t.trend_classification] ?? 0) + 1;
      }

      return {
        totalTrends: trends.length,
        topByPressure: top,
        byClassification,
        avgPressure:
          trends.length > 0
            ? Math.round(trends.reduce((s, t) => s + t.pressure_index, 0) / trends.length)
            : 0,
      };
    }),
});
