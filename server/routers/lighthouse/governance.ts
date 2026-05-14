/**
 * lighthouse/governance.ts
 *
 * tRPC procedures for the Gate Review / Governance surface.
 * Reads exclusively from v_gate_decisions and v_staged_signals canonical views.
 * All procedures are read-only.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc.js";
import {
  getGateDecisions,
  getStagedSignals,
  getPipelineHealth,
} from "../../services/lighthouseClient.js";

export const lighthouseGovernanceRouter = router({
  /** Gate decision log with optional filters */
  gateDecisions: protectedProcedure
    .input(
      z.object({
        decision: z.enum(["PROMOTE", "STAGE", "HOLD", "REJECT", "ESCALATE_REVIEW"]).optional(),
        sourceSystem: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
    )
    .query(async ({ input }) => {
      const decisions = await getGateDecisions({
        decision: input.decision,
        sourceSystem: input.sourceSystem,
        limit: input.limit,
      });
      return { decisions, count: decisions.length };
    }),

  /** Staged signals pending admin review */
  stagedSignals: protectedProcedure.query(async () => {
    const staged = await getStagedSignals();
    return { staged, count: staged.length };
  }),

  /** Gate decision distribution summary */
  decisionSummary: protectedProcedure.query(async () => {
    const decisions = await getGateDecisions({ limit: 500 });
    const byDecision: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let totalPromoted = 0;
    let avgScore = 0;
    for (const d of decisions) {
      byDecision[d.decision] = (byDecision[d.decision] ?? 0) + 1;
      bySource[d.source_system] = (bySource[d.source_system] ?? 0) + 1;
      if (d.was_promoted) totalPromoted++;
      avgScore += d.composite_score;
    }
    return {
      totalDecisions: decisions.length,
      totalPromoted,
      promotionRate:
        decisions.length > 0 ? Math.round((totalPromoted / decisions.length) * 100) : 0,
      avgCompositeScore:
        decisions.length > 0 ? Math.round((avgScore / decisions.length) * 100) / 100 : 0,
      byDecision,
      bySource,
    };
  }),

  /** Pipeline health — single-row operational summary */
  pipelineHealth: protectedProcedure.query(async () => {
    const health = await getPipelineHealth();
    return { health };
  }),
});
