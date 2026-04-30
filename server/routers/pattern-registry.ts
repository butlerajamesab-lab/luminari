import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  evaluateSignalsForPatterns,
  getPatternDashboard,
  getPatternDetail,
  getPatternEvolutionTimeline,
  getPatternRelationshipGraph,
  getPatternSummaryForMissionControl,
  runDecayLifecycle,
  discoverRelationships,
  checkReactivation,
} from "../pattern-registry";

export const patternRegistryRouter = router({
  /** Dashboard: list patterns with optional filters */
  dashboard: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      patternType: z.string().optional(),
      minConfidence: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      return getPatternDashboard(input || undefined);
    }),

  /** Detail: full pattern info with linked signals, evolution, relationships */
  detail: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      return getPatternDetail(input.patternId);
    }),

  /** Evolution timeline for a specific pattern */
  evolution: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      return getPatternEvolutionTimeline(input.patternId);
    }),

  /** Relationship graph: all active patterns and their connections */
  relationshipGraph: protectedProcedure
    .query(async () => {
      return getPatternRelationshipGraph();
    }),

  /** Mission Control summary widget data */
  missionControlSummary: protectedProcedure
    .query(async () => {
      return getPatternSummaryForMissionControl();
    }),

  /** Trigger pattern evaluation from existing signals */
  evaluate: protectedProcedure
    .mutation(async () => {
      return evaluateSignalsForPatterns();
    }),

  /** Trigger decay lifecycle check */
  runDecay: protectedProcedure
    .mutation(async () => {
      const decayed = await runDecayLifecycle(Date.now());
      return { decayed };
    }),

  /** Trigger relationship discovery */
  discoverRelationships: protectedProcedure
    .mutation(async () => {
      const discovered = await discoverRelationships();
      return { discovered };
    }),

  /** Check if a dormant pattern should be reactivated */
  checkReactivation: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .mutation(async ({ input }) => {
      const reactivated = await checkReactivation(input.patternId, Date.now());
      return { reactivated };
    }),
});



// ============================================================
