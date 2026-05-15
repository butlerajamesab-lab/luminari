import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Action Routing Engine
 * Converts lens activation into deterministic, traceable actions
 * No inference. No mutation of source data.
 */

export const actionRoutingRouter = router({
  /**
   * Route actions based on active lenses
   * Deterministic: same input → same output
   * Idempotent: no duplicate actions
   */
  routeActionsFromLenses: protectedProcedure
    .input(
      z.object({
        caseId: z.string(),
        signalId: z.string().optional(),
        activeLenses: z.object({
          user: z.boolean().default(false),
          professional: z.boolean().default(false),
          systemic: z.boolean().default(false),
          advocate: z.boolean().default(false),
          admin: z.boolean().default(false),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();
      const actionsCreated: string[] = [];

      // USER LENS → Navigation Actions
      if (input.activeLenses.user) {
        const userActionId = `action_user_${input.caseId}_${timestamp}`;
        const existingUserAction = await db.query.raw(
          sql`SELECT action_id FROM action_queue WHERE case_id = ${input.caseId} AND lens = 'user' AND action_type = 'generate_next_steps' AND status != 'completed' LIMIT 1`
        );

        if (!existingUserAction || existingUserAction.length === 0) {
          await db.query.raw(
            sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
            VALUES (${userActionId}, ${input.caseId}, ${input.signalId || null}, 'user', 'generate_next_steps', 
            JSON_OBJECT('case_id', ${input.caseId}, 'required_forms', JSON_ARRAY(), 'agencies', JSON_ARRAY(), 'deadlines', JSON_ARRAY()),
            'pending', ${timestamp}, ${timestamp})`
          );
          actionsCreated.push(userActionId);
        }
      }

      // PROFESSIONAL LENS → Case Construction
      if (input.activeLenses.professional) {
        const profActionId = `action_prof_${input.caseId}_${timestamp}`;
        const existingProfAction = await db.query.raw(
          sql`SELECT action_id FROM action_queue WHERE case_id = ${input.caseId} AND lens = 'professional' AND action_type = 'build_case_structure' AND status != 'completed' LIMIT 1`
        );

        if (!existingProfAction || existingProfAction.length === 0) {
          await db.query.raw(
            sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
            VALUES (${profActionId}, ${input.caseId}, ${input.signalId || null}, 'professional', 'build_case_structure',
            JSON_OBJECT('case_id', ${input.caseId}, 'claims', JSON_ARRAY(), 'evidence_links', JSON_ARRAY(), 'legal_references', JSON_ARRAY()),
            'pending', ${timestamp}, ${timestamp})`
          );
          actionsCreated.push(profActionId);
        }
      }

      // SYSTEMIC LENS → Pattern Analysis
      if (input.activeLenses.systemic) {
        const sysActionId = `action_sys_${input.caseId}_${timestamp}`;
        const existingSysAction = await db.query.raw(
          sql`SELECT action_id FROM action_queue WHERE case_id = ${input.caseId} AND lens = 'systemic' AND action_type = 'aggregate_pattern' AND status != 'completed' LIMIT 1`
        );

        if (!existingSysAction || existingSysAction.length === 0) {
          await db.query.raw(
            sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
            VALUES (${sysActionId}, ${input.caseId}, ${input.signalId || null}, 'systemic', 'aggregate_pattern',
            JSON_OBJECT('case_id', ${input.caseId}, 'fingerprint', '', 'count', 0, 'regions', JSON_ARRAY()),
            'pending', ${timestamp}, ${timestamp})`
          );
          actionsCreated.push(sysActionId);
        }
      }

      // ADVOCATE LENS → Escalation Package
      if (input.activeLenses.advocate) {
        const advActionId = `action_adv_${input.caseId}_${timestamp}`;
        const existingAdvAction = await db.query.raw(
          sql`SELECT action_id FROM action_queue WHERE case_id = ${input.caseId} AND lens = 'advocate' AND action_type = 'generate_escalation_packet' AND status != 'completed' LIMIT 1`
        );

        if (!existingAdvAction || existingAdvAction.length === 0) {
          await db.query.raw(
            sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
            VALUES (${advActionId}, ${input.caseId}, ${input.signalId || null}, 'advocate', 'generate_escalation_packet',
            JSON_OBJECT('case_id', ${input.caseId}, 'entity', '', 'pattern_summary', '', 'evidence_quotes', JSON_ARRAY()),
            'pending', ${timestamp}, ${timestamp})`
          );
          actionsCreated.push(advActionId);
        }
      }

      // ADMIN LENS → No queue entry (direct visibility only)
      // Admin does not create actions; it governs existing actions

      return {
        caseId: input.caseId,
        actionsCreated,
        totalActions: actionsCreated.length,
        timestamp,
      };
    }),

  /**
   * Get pending actions for a case
   */
  getPendingActions: protectedProcedure
    .input(z.object({ caseId: z.string() }))
    .query(async ({ input }) => {
      const actions = await db.query.raw(
        sql`SELECT action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at 
        FROM action_queue 
        WHERE case_id = ${input.caseId} AND status = 'pending'
        ORDER BY created_at DESC`
      );
      return actions || [];
    }),

  /**
   * Update action status (pending → in_progress → completed/failed)
   */
  updateActionStatus: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        status: z.enum(["pending", "in_progress", "completed", "failed"]),
        failureReason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();

      await db.query.raw(
        sql`UPDATE action_queue 
        SET status = ${input.status}, updated_at = ${timestamp}
        WHERE action_id = ${input.actionId}`
      );

      if (input.status === "failed" && input.failureReason) {
        // Log failure with reason (no silent failures)
        await db.query.raw(
          sql`INSERT INTO governance_events (governance_event_id, action_id, stage, event_type, actor_type, reason, created_at)
          VALUES (CONCAT('gov_', UUID()), ${input.actionId}, 'action_execution', 'action_failed', 'system', ${input.failureReason}, ${timestamp})`
        );
      }

      return { actionId: input.actionId, status: input.status, updated_at: timestamp };
    }),

  /**
   * Get action queue statistics
   */
  getActionQueueStats: protectedProcedure.query(async () => {
    const stats = await db.query.raw(
      sql`SELECT 
        lens,
        action_type,
        status,
        COUNT(*) as count
      FROM action_queue
      GROUP BY lens, action_type, status
      ORDER BY lens, action_type, status`
    );
    return stats || [];
  }),
});
