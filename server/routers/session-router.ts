/**
 * Session Router — tRPC procedures for session lifecycle
 * 
 * Admin-only procedures for managing the Tsunam ↔ Luminari execution loop.
 */

import { router, adminProcedure } from "../_core/trpc.ts";
import { z } from "zod";
import {
  startSession,
  getCurrentSession,
  recordSessionAction,
  endSession,
  getSessionHandoff,
  getSessionHistory,
} from "../session-management.ts";

export const sessionRouter = router({
  /**
   * Start a new session anchored to the current verified governance state
   */
  startSession: adminProcedure
    .input(z.enum(["tsunam", "luminari"]))
    .mutation(async ({ input: actorType }) => {
      return await startSession(actorType);
    }),

  /**
   * Get the current active session for an actor
   */
  getCurrentSession: adminProcedure
    .input(z.enum(["tsunam", "luminari"]))
    .query(async ({ input: actorType }) => {
      const session = await getCurrentSession(actorType);
      if (!session) {
        return null;
      }

      return {
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        governanceAnchor: session.governanceAnchor,
        actorType: session.actorType,
        actionCount: (JSON.parse(session.actionsTaken as unknown as string) as unknown[])
          .length,
      };
    }),

  /**
   * Record an action in the current session
   */
  recordAction: adminProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        action: z.string(),
        input: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      await recordSessionAction(input.sessionId, {
        action: input.action,
        input: input.input,
        timestamp: Date.now(),
      });

      return { success: true };
    }),

  /**
   * End the session and produce a handoff
   */
  endSession: adminProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        results: z.record(z.string(), z.unknown()),
        nextActions: z.array(
          z.object({
            action: z.string(),
            description: z.string(),
            inputs: z.record(z.string(), z.unknown()).optional(),
          })
        ),
        stateSnapshot: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      const handoff = await endSession(
        input.sessionId,
        input.results,
        input.nextActions,
        input.stateSnapshot
      );

      return handoff;
    }),

  /**
   * Get a completed session's handoff
   */
  getHandoff: adminProcedure
    .input(z.string().uuid())
    .query(async ({ input: sessionId }) => {
      return await getSessionHandoff(sessionId);
    }),

  /**
   * Get session history for an actor
   */
  getHistory: adminProcedure
    .input(
      z.object({
        actorType: z.enum(["tsunam", "luminari"]),
        limit: z.number().min(1).max(100).default(10),
      })
    )
    .query(async ({ input }) => {
      return await getSessionHistory(input.actorType, input.limit);
    }),
});
