import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Governance + Override Layer
 * Explicit human/system controls with full audit trail
 * No silent overrides. No destructive mutation.
 */

export const governanceRouter = router({
  /**
   * Create a governance event (audit trail entry)
   * Every override must write a governance_events record
   */
  createGovernanceEvent: adminProcedure
    .input(
      z.object({
        caseId: z.string().optional(),
        signalId: z.string().optional(),
        actionId: z.string().optional(),
        stage: z.enum([
          "lens_activation",
          "action_queue",
          "action_execution",
          "action_outcome",
          "feedback_generation",
        ]),
        eventType: z.string(),
        actorType: z.enum(["admin", "system", "tsunam", "reviewer"]),
        actorId: z.string(),
        reason: z.string(),
        beforeState: z.record(z.string(), z.any()).optional(),
        afterState: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();
      const eventId = `gov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await db.execute(
        sql`INSERT INTO governance_events (governance_event_id, case_id, signal_id, action_id, stage, event_type, actor_type, actor_id, reason, before_state, after_state, created_at)
        VALUES (${eventId}, ${input.caseId || null}, ${input.signalId || null}, ${input.actionId || null}, 
        ${input.stage}, ${input.eventType}, ${input.actorType}, ${input.actorId}, ${input.reason},
        ${input.beforeState ? JSON.stringify(input.beforeState) : null},
        ${input.afterState ? JSON.stringify(input.afterState) : null},
        ${timestamp})`
      );

      return { eventId, created_at: timestamp };
    }),

  /**
   * Pause an action (stops execution without deleting)
   */
  pauseAction: adminProcedure
    .input(
      z.object({
        actionId: z.string(),
        reason: z.string(),
        actorId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();

      // Get current action state
      const action = await db.execute(
        sql`SELECT * FROM action_queue WHERE action_id = ${input.actionId} LIMIT 1`
      );

      if (!action || (action as unknown as any[]).length === 0) {
        throw new Error(`Action ${input.actionId} not found`);
      }

      const beforeState = (action as unknown as any[])[0] as any;

      // Create governance control
      const controlId = `ctrl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.execute(
        sql`INSERT INTO governance_controls (control_id, target_type, target_id, control_type, control_status, reason, actor_id, created_at, updated_at)
        VALUES (${controlId}, 'action', ${input.actionId}, 'pause', 'active', ${input.reason}, ${input.actorId}, ${timestamp}, ${timestamp})`
      );

      // Log governance event
      await db.execute(
        sql`INSERT INTO governance_events (governance_event_id, action_id, stage, event_type, actor_type, actor_id, reason, before_state, after_state, created_at)
        VALUES (CONCAT('gov_', UUID()), ${input.actionId}, 'action_execution', 'action_paused', 'admin', ${input.actorId}, ${input.reason},
        JSON_OBJECT('status', '${beforeState.status}'),
        JSON_OBJECT('status', 'paused'),
        ${timestamp})`
      );

      return { controlId, actionId: input.actionId, status: "paused" };
    }),

  /**
   * Resume a paused action
   */
  resumeAction: adminProcedure
    .input(
      z.object({
        actionId: z.string(),
        reason: z.string(),
        actorId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();

      // Find and deactivate pause control
      await db.execute(
        sql`UPDATE governance_controls 
        SET control_status = 'inactive', updated_at = ${timestamp}
        WHERE target_id = ${input.actionId} AND control_type = 'pause' AND control_status = 'active'`
      );

      // Log governance event
      await db.execute(
        sql`INSERT INTO governance_events (governance_event_id, action_id, stage, event_type, actor_type, actor_id, reason, created_at)
        VALUES (CONCAT('gov_', UUID()), ${input.actionId}, 'action_execution', 'action_resumed', 'admin', ${input.actorId}, ${input.reason}, ${timestamp})`
      );

      return { actionId: input.actionId, status: "resumed" };
    }),

  /**
   * Force override a lens state
   */
  overrideLensState: adminProcedure
    .input(
      z.object({
        caseId: z.string(),
        lens: z.enum(["user", "professional", "systemic", "advocate", "admin"]),
        forceActive: z.boolean(),
        reason: z.string(),
        actorId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();

      // Log governance event with before/after state
      await db.execute(
        sql`INSERT INTO governance_events (governance_event_id, case_id, stage, event_type, actor_type, actor_id, reason, before_state, after_state, created_at)
        VALUES (CONCAT('gov_', UUID()), ${input.caseId}, 'lens_activation', 'lens_override', 'admin', ${input.actorId}, ${input.reason},
        JSON_OBJECT('lens', ${input.lens}, 'active', !${input.forceActive}),
        JSON_OBJECT('lens', ${input.lens}, 'active', ${input.forceActive}),
        ${timestamp})`
      );

      return {
        caseId: input.caseId,
        lens: input.lens,
        forceActive: input.forceActive,
        timestamp,
      };
    }),

  /**
   * Mark action outcome as disputed
   */
  disputeOutcome: adminProcedure
    .input(
      z.object({
        actionId: z.string(),
        reason: z.string(),
        actorId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();

      // Log governance event
      await db.execute(
        sql`INSERT INTO governance_events (governance_event_id, action_id, stage, event_type, actor_type, actor_id, reason, created_at)
        VALUES (CONCAT('gov_', UUID()), ${input.actionId}, 'action_outcome', 'outcome_disputed', 'admin', ${input.actorId}, ${input.reason}, ${timestamp})`
      );

      return { actionId: input.actionId, status: "disputed" };
    }),

  /**
   * Get governance events for a case
   */
  getGovernanceEvents: protectedProcedure
    .input(z.object({ caseId: z.string() }))
    .query(async ({ input }) => {
      const events = await db.execute(
        sql`SELECT * FROM governance_events 
        WHERE case_id = ${input.caseId}
        ORDER BY created_at DESC
        LIMIT 100`
      );
      return events || [];
    }),

  /**
   * Get active governance controls
   */
  getActiveControls: protectedProcedure.query(async () => {
    const controls = await db.execute(
      sql`SELECT * FROM governance_controls 
      WHERE control_status = 'active'
      ORDER BY created_at DESC`
    );
    return controls || [];
  }),

  /**
   * Get governance audit log (all events)
   */
  getGovernanceAuditLog: adminProcedure
    .input(
      z.object({
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const events = await db.execute(
        sql`SELECT * FROM governance_events 
        ORDER BY created_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}`
      );
      return events || [];
    }),
});
