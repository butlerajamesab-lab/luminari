/**
 * lighthouse/patterns.ts
 *
 * tRPC procedures for the Pattern Registry surface.
 * Reads exclusively from v_active_patterns canonical view via lighthouseClient.
 * All procedures are read-only. No writes to Lighthouse from this router.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc.js";
import { getActivePatterns } from "../../services/lighthouseClient.js";

export const lighthousePatternsRouter = router({
  /** List active patterns with optional filters */
  list: protectedProcedure
    .input(
      z.object({
        jurisdiction: z.string().optional(),
        signalType: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const patterns = await getActivePatterns({
        jurisdiction: input.jurisdiction,
        signalType: input.signalType,
        limit: input.limit,
      });
      return { patterns, count: patterns.length };
    }),

  /** Get a single pattern by pattern_id */
  getById: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      const all = await getActivePatterns({ limit: 500 });
      const pattern = all.find((p) => p.pattern_id === input.patternId) ?? null;
      return { pattern };
    }),

  /** Summary stats across all active patterns */
  summary: protectedProcedure.query(async () => {
    const patterns = await getActivePatterns({ limit: 500 });
    const byJurisdiction: Record<string, number> = {};
    const byPatternType: Record<string, number> = {};
    let totalSignals = 0;
    let avgConfidence = 0;

    for (const p of patterns) {
      byJurisdiction[p.jurisdiction] = (byJurisdiction[p.jurisdiction] ?? 0) + 1;
      byPatternType[p.pattern_type] = (byPatternType[p.pattern_type] ?? 0) + 1;
      totalSignals += p.signal_count;
      avgConfidence += p.confidence_score;
    }

    return {
      totalPatterns: patterns.length,
      totalSignals,
      avgConfidence: patterns.length > 0 ? Math.round(avgConfidence / patterns.length) : 0,
      byJurisdiction,
      byPatternType,
    };
  }),
});
