/**
 * Gate B Kernel 2 — Signal Publication Router.
 *
 * The gate side is admin-only: listing promoted signals, publishing,
 * and unpublishing are governed acts (each publish/unpublish writes a
 * governance log entry in the same transaction as the publication
 * record — see server/services/signal-publication.ts).
 *
 * The public side follows the governance router's public-feed
 * discipline: dedicated public procedures fed by an explicit field
 * whitelist over a pinned selection (active publications ⋈ current
 * promoted rows). An observation candidate id returns nothing here —
 * unreviewed content has no public path.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  getPublishedSignal,
  listPromotedSignals,
  listPublishedSignals,
  publishSignal,
  SignalNotPublicSafeError,
  unpublishSignal,
} from "../services/signal-publication";

const publishInput = z.object({
  signalId: z.string().uuid(),
  // The governance log validates the rationale again server-side
  // (≥10 chars, ≥3 words, no filler); this bound is just the wire cap.
  rationale: z.string().min(1).max(2000),
});

export const signalPublicationRouter = router({
  /** Gate: promoted signals with their publication state and the
   *  why-it-is-a-signal detail the reviewer reads before acting. */
  listPromoted: adminProcedure.query(async () => {
    return listPromotedSignals();
  }),

  /** Gate act: publish one promoted signal (governance-logged). A
   *  not-public-safe signal is refused as a precondition failure
   *  carrying the stated reason — the gate sees why, not a 500. */
  publish: adminProcedure
    .input(publishInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await publishSignal({
          signalId: input.signalId,
          rationale: input.rationale,
          actorId: ctx.user.open_id ?? String(ctx.user.id),
        });
      } catch (err) {
        if (err instanceof SignalNotPublicSafeError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: err.message,
            cause: err,
          });
        }
        throw err;
      }
    }),

  /** Gate act: withdraw one signal's active publication (governance-logged). */
  unpublish: adminProcedure
    .input(publishInput)
    .mutation(async ({ ctx, input }) => {
      return unpublishSignal({
        signalId: input.signalId,
        rationale: input.rationale,
        actorId: ctx.user.open_id ?? String(ctx.user.id),
      });
    }),

  /** Public: the published explainers — promoted + published only. */
  listPublished: publicProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(1000).optional() })
        .optional(),
    )
    .query(async ({ input }) => {
      return listPublishedSignals(input?.limit ?? 100);
    }),

  /** Public: one published explainer by signal id, or null. A
   *  candidate, held, rejected, demoted, or unpublished id is null. */
  getPublished: publicProcedure
    .input(z.object({ signalId: z.string() }))
    .query(async ({ input }) => {
      return getPublishedSignal(input.signalId);
    }),
});
