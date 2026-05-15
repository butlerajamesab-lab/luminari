/**
 * lighthouse/strategies.ts
 *
 * tRPC procedures for the Strategy Projection surface.
 * Reads exclusively from v_active_strategies canonical view via lighthouseClient.
 * All procedures are read-only.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc.js";
import { getActiveStrategies } from "../../services/lighthouseClient.js";

export const lighthouseStrategiesRouter = router({
  /** List active strategies with optional filters */
  list: protectedProcedure
    .input(
      z.object({
        jurisdictionScope: z.string().optional(),
        urgency: z.string().optional(),
        scope: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const strategies = await getActiveStrategies({
        jurisdictionScope: input.jurisdictionScope,
        urgency: input.urgency,
        scope: input.scope,
        limit: input.limit,
      });
      return { strategies, count: strategies.length };
    }),

  /** Get a single strategy by strategy_id */
  getById: protectedProcedure
    .input(z.object({ strategyId: z.string() }))
    .query(async ({ input }) => {
      const all = await getActiveStrategies({ limit: 500 });
      const strategy = all.find((s) => s.id === input.strategyId) ?? null;
      return { strategy };
    }),

  /** Summary breakdown by urgency, scope, and jurisdiction */
  summary: protectedProcedure.query(async () => {
    const strategies = await getActiveStrategies({ limit: 500 });
    const byUrgency: Record<string, number> = {};
    const byScope: Record<string, number> = {};
    const byJurisdiction: Record<string, number> = {};

    for (const s of strategies) {
      byUrgency[s.urgency_level] = (byUrgency[s.urgency_level] ?? 0) + 1;
      byScope[s.strategy_scope] = (byScope[s.strategy_scope] ?? 0) + 1;
      byJurisdiction[s.jurisdiction_scope ?? "unknown"] = (byJurisdiction[s.jurisdiction_scope ?? "unknown"] ?? 0) + 1;
    }

    return {
      totalStrategies: strategies.length,
      byUrgency,
      byScope,
      byJurisdiction,
    };
  }),
});
