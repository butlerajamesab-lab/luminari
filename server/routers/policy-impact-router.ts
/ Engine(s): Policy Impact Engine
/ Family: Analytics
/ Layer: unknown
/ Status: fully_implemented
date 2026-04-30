import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getPolicyEvents,
  getPolicyEventById,
  createPolicyEvent,
  measurePolicyImpact,
  getImpactsForPattern,
  getImpactsForPolicy,
  getPolicyDashboard,
  getPolicyTimelineForTrend,
} from "../policy-impact-engine";

export const policyImpactRouter = router({
  // ─── Dashboard ─────────────────────────────────────────────────────
  dashboard: protectedProcedure.query(async () => {
    return getPolicyDashboard();
  }),

  // ─── Policy Events ─────────────────────────────────────────────────
  events: protectedProcedure
    .input(z.object({
      policyType: z.string().optional(),
      jurisdiction: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return getPolicyEvents(input);
    }),

  eventDetail: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ input }) => {
      return getPolicyEventById(input.policyId);
    }),

  createEvent: protectedProcedure
    .input(z.object({
      policyName: z.string(),
      policyType: z.string(),
      jurisdiction: z.string().optional(),
      effectiveDate: z.string().optional(),
      enactedDate: z.string().optional(),
      affectedDomains: z.array(z.string()).optional(),
      relatedLaws: z.array(z.string()).optional(),
      description: z.string().optional(),
      sourceUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return createPolicyEvent(input);
    }),

  // ─── Impact Measurement ────────────────────────────────────────────
  measureImpact: protectedProcedure
    .input(z.object({
      policyId: z.string(),
      patternId: z.string(),
      measurementWindowDays: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return measurePolicyImpact(input);
    }),

  impactsForPattern: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      return getImpactsForPattern(input.patternId);
    }),

  impactsForPolicy: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ input }) => {
      return getImpactsForPolicy(input.policyId);
    }),

  // ─── Policy Timeline (for Trend Overlay) ───────────────────────────
  timeline: protectedProcedure
    .input(z.object({
      patternId: z.string().optional(),
      domain: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return getPolicyTimelineForTrend(input || {});
    }),
});
