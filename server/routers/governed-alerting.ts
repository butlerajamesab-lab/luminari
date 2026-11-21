/**
 * Gate B Kernel 1 — Governed Candidate Alerting Router.
 *
 * The review gate's notification half: subscriptions to new governed
 * candidates awaiting review, a deterministic evaluation pass that
 * records alert deliveries, and the delivery log. All state lives in
 * server/alerting/governed-candidate-alerts.ts; the candidate counts
 * and lists read the true store (public.live_data_signals) through it.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  countAwaitingReview,
  createReviewSubscription,
  deleteReviewSubscription,
  listAwaitingReviewCandidates,
  listRecentDeliveries,
  listReviewSubscriptions,
  runGovernedCandidateAlerting,
} from "../alerting/governed-candidate-alerts";

export const governedAlertingRouter = router({
  /** Awaiting-review count from the true candidate store. */
  awaitingReviewCount: protectedProcedure.query(async () => {
    return { count: await countAwaitingReview() };
  }),

  /** The governed candidates awaiting review, newest first. */
  candidates: protectedProcedure
    .input(
      z
        .object({ limit: z.number().min(1).max(200).optional() })
        .optional(),
    )
    .query(async ({ input }) => {
      return listAwaitingReviewCandidates(input?.limit ?? 50);
    }),

  /** All governed-candidate review subscriptions (the gate's list). */
  subscriptions: protectedProcedure.query(async () => {
    return listReviewSubscriptions();
  }),

  createSubscription: protectedProcedure
    .input(
      z.object({
        streamId: z.string().trim().min(1).max(128).optional(),
        jurisdictionId: z.string().trim().min(1).max(256).optional(),
        channel: z.enum(["in_app", "email", "webhook"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createReviewSubscription({
        userId: ctx.user.id.toString(),
        streamId: input.streamId ?? null,
        jurisdictionId: input.jurisdictionId ?? null,
        channel: input.channel ?? "in_app",
      });
    }),

  deleteSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteReviewSubscription(input.subscriptionId);
      return { deleted: true };
    }),

  /** Run one deterministic evaluation pass; records new deliveries. */
  runEvaluation: protectedProcedure.mutation(async () => {
    return runGovernedCandidateAlerting();
  }),

  /** Recent recorded alert deliveries, newest first. */
  deliveries: protectedProcedure
    .input(
      z
        .object({ limit: z.number().min(1).max(100).optional() })
        .optional(),
    )
    .query(async ({ input }) => {
      return listRecentDeliveries(input?.limit ?? 20);
    }),
});
