/**
 * Case State Router — The Commitment Layer
 *
 * All platform outputs that get "committed" to a case land here.
 * Control Room reads from this table exclusively.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { cases, caseState, caseFlags } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { emitSignal } from "../live-signal-emitter";

async function verify_case_ownership(case_id: number, user_id: number) {
  const [case_row] = await db.select({ id: cases.id, user_id: cases.userId })
    .from(cases).where(eq(cases.id, String(case_id)));
  if (!case_row || case_row.user_id !== user_id) {
    throw new Error("Case not found or access denied");
  }
  return case_row;
}

async function get_or_create_case_state(case_id: number, user_id: number) {
  const [existing] = await db.select().from(caseState).where(eq(caseState.caseId, case_id));
  if (existing) return existing;

  const now = Date.now();
  await db.insert(caseState).values({
    caseId: case_id,
    userId: user_id,
    committedFindingIds: [],
    committedBarrierIds: [],
    committedBenefitIds: [],
    committedSignalIds: [],
    committedStatuteIds: [],
    committedFoiaIds: [],
    committedFilingIds: [],
    completenessScore: 0,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db.select().from(caseState).where(eq(caseState.caseId, case_id));
  return created;
}

function compute_completeness(state: typeof caseState.$inferSelect): {
  score: number;
  missing: string[];
  present: string[];
} {
  const checks = [
    { key: "procedural_path", label: "Procedural path selected", present: !!state.proceduralPathLabel },
    { key: "remedy_strategy", label: "Remedy strategy selected", present: !!state.remedyStrategyLabel },
    { key: "claim_type", label: "Claim type identified", present: !!state.claimType },
    { key: "findings", label: "At least one finding committed", present: (state.committedFindingIds as number[]).length > 0 },
    { key: "barriers", label: "Barriers assessed", present: (state.committedBarrierIds as number[]).length > 0 },
    { key: "benefits", label: "Benefits identified", present: (state.committedBenefitIds as number[]).length > 0 },
    { key: "statutes", label: "Relevant statutes attached", present: (state.committedStatuteIds as number[]).length > 0 },
  ];

  const present = checks.filter((check) => check.present).map((check) => check.label);
  const missing = checks.filter((check) => !check.present).map((check) => check.label);
  const score = Math.round((present.length / checks.length) * 100);

  return { score, missing, present };
}

async function update_completeness(case_id: number) {
  const [state] = await db.select().from(caseState).where(eq(caseState.caseId, case_id));
  if (!state) return;

  const { score, missing, present } = compute_completeness(state);

  await db.delete(caseFlags).where(
    and(eq(caseFlags.caseId, case_id), eq(caseFlags.type, "system"), eq(caseFlags.status, "open"))
  );

  const now = Date.now();
  const flags_to_insert = missing.map((label) => ({
    caseId: case_id,
    userId: state.userId,
    type: "system" as const,
    location: "completeness",
    message: `Missing: ${label}`,
    status: "open" as const,
    createdAt: now,
  }));

  if (flags_to_insert.length > 0) {
    await db.insert(caseFlags).values(flags_to_insert);
  }

  await db.update(caseState)
    .set({
      completenessScore: score,
      completenessBreakdown: { score, missing, present },
      updatedAt: now,
    })
    .where(eq(caseState.caseId, case_id));
}

export const caseStateRouter = router({
  get: protectedProcedure
    .input(z.object({ case_id: z.number() }))
    .query(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const flags = await db.select().from(caseFlags)
        .where(and(eq(caseFlags.caseId, input.case_id), eq(caseFlags.status, "open")));
      return { state, flags };
    }),

  commit_finding: protectedProcedure
    .input(z.object({ case_id: z.number(), finding_id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const current = (state.committedFindingIds as number[]) || [];
      if (!current.includes(input.finding_id)) {
        await db.update(caseState)
          .set({ committedFindingIds: [...current, input.finding_id], updatedAt: Date.now() })
          .where(eq(caseState.caseId, input.case_id));
      }
      await update_completeness(input.case_id);
      return { success: true, finding_id: input.finding_id };
    }),

  commit_procedural_path: protectedProcedure
    .input(z.object({
      case_id: z.number(),
      path_id: z.number().optional(),
      path_label: z.string(),
      deadlines: z.array(z.object({
        label: z.string(),
        date: z.string(),
        days_remaining: z.number(),
        critical: z.boolean(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      await get_or_create_case_state(input.case_id, ctx.user.id);
      await db.update(caseState)
        .set({
          proceduralPathId: input.path_id ?? null,
          proceduralPathLabel: input.path_label,
          computedDeadlines: input.deadlines ?? null,
          updatedAt: Date.now(),
        })
        .where(eq(caseState.caseId, input.case_id));

      await update_completeness(input.case_id);

      if (input.deadlines && input.deadlines.length > 0) {
        const critical_deadlines = input.deadlines.filter(
          (deadline) => deadline.days_remaining >= 0 && deadline.days_remaining <= 14
        );
        for (const deadline of critical_deadlines) {
          try {
            const [case_state_row] = await db.select({ jurisdiction: caseState.jurisdiction })
              .from(caseState).where(eq(caseState.caseId, input.case_id));
            await emitSignal({
              effectType: "DEADLINE_APPROACHING",
              targetTable: "case_state",
              targetId: input.case_id,
              signalType: "DEADLINE_APPROACHING:case_state",
              title: `Deadline in ${deadline.days_remaining} days: ${deadline.label}`,
              explanation: `Case #${input.case_id} procedural path "${input.path_label}" has a deadline approaching: ${deadline.label} on ${deadline.date} (${deadline.days_remaining} days remaining).`,
              severity: deadline.days_remaining <= 3 ? "critical" : deadline.days_remaining <= 7 ? "high" : "medium",
              jurisdiction: case_state_row?.jurisdiction ?? "federal",
              domain: "procedural",
              deadlineDays: deadline.days_remaining,
              sourceTimestamp: Date.now(),
            });
          } catch { /* non-fatal */ }
        }
      }

      return { success: true, path_label: input.path_label };
    }),

  commit_remedy_strategy: protectedProcedure
    .input(z.object({ case_id: z.number(), strategy_id: z.number().optional(), strategy_label: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      await get_or_create_case_state(input.case_id, ctx.user.id);
      await db.update(caseState)
        .set({ remedyStrategyId: input.strategy_id ?? null, remedyStrategyLabel: input.strategy_label, updatedAt: Date.now() })
        .where(eq(caseState.caseId, input.case_id));
      await update_completeness(input.case_id);
      return { success: true, strategy_label: input.strategy_label };
    }),

  set_claim_type: protectedProcedure
    .input(z.object({
      case_id: z.number(),
      claim_type: z.enum(["wage_theft", "wrongful_termination", "discrimination_employment", "discrimination_housing", "eviction_unlawful", "housing_denial", "benefits_denial", "other"]),
      jurisdiction: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      await get_or_create_case_state(input.case_id, ctx.user.id);
      await db.update(caseState)
        .set({ claimType: input.claim_type, jurisdiction: input.jurisdiction ?? null, updatedAt: Date.now() })
        .where(eq(caseState.caseId, input.case_id));
      await update_completeness(input.case_id);
      return { success: true, claim_type: input.claim_type, jurisdiction: input.jurisdiction };
    }),

  commit_barrier: protectedProcedure
    .input(z.object({ case_id: z.number(), barrier_id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const current = (state.committedBarrierIds as number[]) || [];
      if (!current.includes(input.barrier_id)) {
        await db.update(caseState)
          .set({ committedBarrierIds: [...current, input.barrier_id], updatedAt: Date.now() })
          .where(eq(caseState.caseId, input.case_id));
      }
      await update_completeness(input.case_id);
      return { success: true, barrier_id: input.barrier_id };
    }),

  commit_benefit: protectedProcedure
    .input(z.object({ case_id: z.number(), benefit_id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const current = (state.committedBenefitIds as number[]) || [];
      if (!current.includes(input.benefit_id)) {
        await db.update(caseState)
          .set({ committedBenefitIds: [...current, input.benefit_id], updatedAt: Date.now() })
          .where(eq(caseState.caseId, input.case_id));
      }
      await update_completeness(input.case_id);
      return { success: true, benefit_id: input.benefit_id };
    }),

  commit_signal: protectedProcedure
    .input(z.object({ case_id: z.number(), signal_id: z.number(), signal_type: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const current = (state.committedSignalIds as number[]) || [];
      if (!current.includes(input.signal_id)) {
        await db.update(caseState)
          .set({ committedSignalIds: [...current, input.signal_id], updatedAt: Date.now() })
          .where(eq(caseState.caseId, input.case_id));
      }
      await update_completeness(input.case_id);
      return { success: true, signal_id: input.signal_id, routed_as: input.signal_type ?? "signal" };
    }),

  commit_statute: protectedProcedure
    .input(z.object({ case_id: z.number(), statute_id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const current = (state.committedStatuteIds as number[]) || [];
      if (!current.includes(input.statute_id)) {
        await db.update(caseState)
          .set({ committedStatuteIds: [...current, input.statute_id], updatedAt: Date.now() })
          .where(eq(caseState.caseId, input.case_id));
      }
      await update_completeness(input.case_id);
      return { success: true, statute_id: input.statute_id };
    }),

  commit_foia: protectedProcedure
    .input(z.object({ case_id: z.number(), foia_id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const current = (state.committedFoiaIds as number[]) || [];
      if (!current.includes(input.foia_id)) {
        await db.update(caseState)
          .set({ committedFoiaIds: [...current, input.foia_id], updatedAt: Date.now() })
          .where(eq(caseState.caseId, input.case_id));
      }
      await update_completeness(input.case_id);
      return { success: true, foia_id: input.foia_id };
    }),

  commit_filing: protectedProcedure
    .input(z.object({ case_id: z.number(), filing_id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const current = (state.committedFilingIds as number[]) || [];
      if (!current.includes(input.filing_id)) {
        await db.update(caseState)
          .set({ committedFilingIds: [...current, input.filing_id], updatedAt: Date.now() })
          .where(eq(caseState.caseId, input.case_id));
      }
      await update_completeness(input.case_id);
      return { success: true, filing_id: input.filing_id };
    }),

  remove_commit: protectedProcedure
    .input(z.object({
      case_id: z.number(),
      item_type: z.enum(["finding", "barrier", "benefit", "signal", "statute", "foia", "filing"]),
      item_id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const state = await get_or_create_case_state(input.case_id, ctx.user.id);
      const field_map: Record<string, keyof typeof state> = {
        finding: "committedFindingIds",
        barrier: "committedBarrierIds",
        benefit: "committedBenefitIds",
        signal: "committedSignalIds",
        statute: "committedStatuteIds",
        foia: "committedFoiaIds",
        filing: "committedFilingIds",
      };
      const field = field_map[input.item_type];
      const current = (state[field] as number[]) || [];
      const updated = current.filter((id) => id !== input.item_id);
      await db.update(caseState)
        .set({ [field]: updated, updatedAt: Date.now() } as any)
        .where(eq(caseState.caseId, input.case_id));
      await update_completeness(input.case_id);
      return { success: true };
    }),

  add_flag: protectedProcedure
    .input(z.object({
      case_id: z.number(),
      location: z.string(),
      message: z.string(),
      target_id: z.number().optional(),
      target_type: z.string().optional(),
      area_name: z.string().optional(),
      state: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const now = Date.now();
      await db.insert(caseFlags).values({
        caseId: input.case_id,
        userId: ctx.user.id,
        type: "user",
        location: input.location,
        message: input.message,
        targetId: input.target_id ?? null,
        targetType: input.target_type ?? null,
        areaName: input.area_name ?? null,
        state: input.state ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        status: "open",
        createdAt: now,
      });
      return { success: true };
    }),

  resolve_flag: protectedProcedure
    .input(z.object({ case_id: z.number(), flag_id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      await db.update(caseFlags)
        .set({ status: "resolved", resolvedAt: Date.now() })
        .where(and(eq(caseFlags.id, input.flag_id), eq(caseFlags.caseId, input.case_id)));
      return { success: true };
    }),

  get_procedural_deadlines: protectedProcedure
    .input(z.object({ case_id: z.number() }))
    .query(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const [state] = await db.select({ claim_type: caseState.claimType, jurisdiction: caseState.jurisdiction })
        .from(caseState).where(eq(caseState.caseId, input.case_id));
      if (!state?.claim_type) return [];

      const jurisdiction = state.jurisdiction || "federal";
      const claim_type = state.claim_type;
      const conn = await import("mysql2/promise");
      const connection = await conn.default.createConnection(process.env.DATABASE_URL!);
      const [rows] = await connection.query(
        `SELECT * FROM procedural_timelines
         WHERE claim_type = ? AND (jurisdiction = ? OR jurisdiction = 'federal')
         ORDER BY CASE WHEN jurisdiction = ? THEN 0 ELSE 1 END
         LIMIT 3`,
        [claim_type, jurisdiction, jurisdiction]
      ) as any;
      await connection.end();

      const timelines = rows as any[];
      if (!timelines.length) return [];
      const deadlines: Array<{
        id: string;
        claim_type: string;
        deadline_type: string;
        deadline_date: string | null;
        deadline_days: number | null;
        description: string;
        jurisdiction: string;
        tolling_applied: boolean;
        special_considerations: string | null;
      }> = [];
      const now = new Date();

      for (const timeline of timelines) {
        if (timeline.filing_deadline) {
          const deadline_date = timeline.filing_deadline_days
            ? new Date(now.getTime() + timeline.filing_deadline_days * 24 * 60 * 60 * 1000).toISOString()
            : null;
          deadlines.push({
            id: `filing-${timeline.id}`,
            claim_type: timeline.claim_type,
            deadline_type: "Filing Deadline",
            deadline_date,
            deadline_days: timeline.filing_deadline_days,
            description: timeline.filing_deadline,
            jurisdiction: timeline.jurisdiction,
            tolling_applied: false,
            special_considerations: timeline.special_considerations,
          });
        }
        if (timeline.eeoc_charge_deadline) {
          deadlines.push({
            id: `eeoc-${timeline.id}`,
            claim_type: timeline.claim_type,
            deadline_type: "EEOC Charge",
            deadline_date: null,
            deadline_days: null,
            description: timeline.eeoc_charge_deadline,
            jurisdiction: timeline.jurisdiction,
            tolling_applied: false,
            special_considerations: null,
          });
        }
        if (timeline.dfeh_complaint_deadline) {
          deadlines.push({
            id: `dfeh-${timeline.id}`,
            claim_type: timeline.claim_type,
            deadline_type: "DFEH Complaint",
            deadline_date: null,
            deadline_days: null,
            description: timeline.dfeh_complaint_deadline,
            jurisdiction: timeline.jurisdiction,
            tolling_applied: false,
            special_considerations: null,
          });
        }
        if (timeline.appeal_deadline) {
          deadlines.push({
            id: `appeal-${timeline.id}`,
            claim_type: timeline.claim_type,
            deadline_type: "Appeal Deadline",
            deadline_date: null,
            deadline_days: null,
            description: timeline.appeal_deadline,
            jurisdiction: timeline.jurisdiction,
            tolling_applied: false,
            special_considerations: null,
          });
        }
      }
      return deadlines;
    }),

  get_remedy_matrix: protectedProcedure
    .input(z.object({ case_id: z.number() }))
    .query(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const [state] = await db.select({ claim_type: caseState.claimType, jurisdiction: caseState.jurisdiction })
        .from(caseState).where(eq(caseState.caseId, input.case_id));
      if (!state?.claim_type) return null;
      const conn = await import("mysql2/promise");
      const connection = await conn.default.createConnection(process.env.DATABASE_URL!);
      const [rows] = await connection.query(
        `SELECT * FROM remedy_matrix
         WHERE claim_type = ? AND (jurisdiction = ? OR jurisdiction = 'federal')
         ORDER BY CASE WHEN jurisdiction = ? THEN 0 ELSE 1 END
         LIMIT 1`,
        [state.claim_type, state.jurisdiction || "federal", state.jurisdiction || "federal"]
      ) as any;
      await connection.end();
      return (rows as any[])[0] ?? null;
    }),

  get_remedy_full: protectedProcedure
    .input(z.object({ case_id: z.number() }))
    .query(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const [state] = await db.select({ jurisdiction: caseState.jurisdiction })
        .from(caseState).where(eq(caseState.caseId, input.case_id));
      const jurisdiction = state?.jurisdiction || null;
      const conn = await import("mysql2/promise");
      const connection = await conn.default.createConnection(process.env.DATABASE_URL!);
      const query_jurisdiction = jurisdiction || 'CA';
      const [rows] = await connection.query(
        `SELECT * FROM remedy_feasibility_full WHERE jurisdiction = ? ORDER BY strategy_type`,
        [query_jurisdiction]
      ) as any;
      await connection.end();
      return {
        jurisdiction: query_jurisdiction,
        is_fallback: !jurisdiction,
        strategies: (rows as any[]).map((row: any) => ({
          strategy_type: row.strategy_type as string,
          cost_range: row.cost_range as string,
          time_estimate: row.time_estimate as string,
          prerequisites: typeof row.prerequisites === 'string' ? JSON.parse(row.prerequisites) : (row.prerequisites ?? []),
          risk_flags: typeof row.risk_flags === 'string' ? JSON.parse(row.risk_flags) : (row.risk_flags ?? []),
        })),
      };
    }),

  get_flags: protectedProcedure
    .input(z.object({ case_id: z.number(), status: z.enum(["open", "resolved", "all"]).optional().default("open") }))
    .query(async ({ ctx, input }) => {
      await verify_case_ownership(input.case_id, ctx.user.id);
      const query = db.select().from(caseFlags).where(eq(caseFlags.caseId, input.case_id));
      if (input.status !== "all") {
        return db.select().from(caseFlags).where(and(eq(caseFlags.caseId, input.case_id), eq(caseFlags.status, input.status)));
      }
      return query;
    }),
});
