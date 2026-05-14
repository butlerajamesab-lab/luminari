/**
 * lighthouse/lineage.ts
 *
 * tRPC procedures for the Signal Lineage Explorer surface.
 * Reads exclusively from v_signal_lineage canonical view via lighthouseClient.
 * All procedures are read-only.
 */
import { z } from "zod";
import { router, publicProcedure } from "../../_core/trpc.js";
import { getSignalLineage } from "../../services/lighthouseClient.js";

export const lighthouseLineageRouter = router({
  /** Full lineage trace with optional filters */
  list: publicProcedure
    .input(
      z.object({
        signalType: z.string().optional(),
        decision: z.enum(["PROMOTE", "STAGE", "HOLD", "REJECT", "ESCALATE_REVIEW"]).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
    )
    .query(async ({ input }) => {
      const lineage = await getSignalLineage({
        signalType: input.signalType,
        decision: input.decision,
        limit: input.limit,
      });
      return { lineage, count: lineage.length };
    }),

  /** Get full lineage for a single signal by signal_id */
  getBySignalId: publicProcedure
    .input(z.object({ signalId: z.string().uuid() }))
    .query(async ({ input }) => {
      const all = await getSignalLineage({ limit: 500 });
      const entry = all.find((l) => l.detected_signal_id === input.signalId) ?? null;
      return { entry };
    }),

  /** Lineage coverage stats */
  coverageStats: publicProcedure.query(async () => {
    const lineage = await getSignalLineage({ limit: 500 });
    let fullChain = 0;
    let patternLinked = 0;
    let trendLinked = 0;
    let promoted = 0;
    for (const l of lineage) {
      if (l.gate_decision === "PROMOTE") promoted++;
      if (l.linked_pattern_id) patternLinked++;
      if (l.linked_trend_id) trendLinked++;
      if (l.linked_pattern_id && l.linked_trend_id) fullChain++;
    }
    return {
      totalSignals: lineage.length,
      promoted,
      patternLinked,
      trendLinked,
      fullChain,
      promotionRate: lineage.length > 0 ? Math.round((promoted / lineage.length) * 100) : 0,
      fullChainRate: promoted > 0 ? Math.round((fullChain / promoted) * 100) : 0,
    };
  }),
});
