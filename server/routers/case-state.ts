/**
 * Case State Router — The Commitment Layer
 *
 * All platform outputs that get "committed" to a case land here.
 * Control Room reads from this table exclusively.
 *
 * State rules:
 *   - procedural_path: single slot, overwrite on new commit
 *   - remedy_strategy: single slot, overwrite on new commit
 *   - claim_type: single slot, controlled set
 *   - findings/barriers/benefits/signals/statutes/foia/filings: multi, append
 *
 * Signal routing on commit:
 *   - structural → barriers
 *   - evidentiary → findings
 *   - pattern → strategy context (stored in signals with tag)
 *   - resource → benefits
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { cases, caseState, caseFlags } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { emitSignal } from "../live-signal-emitter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyCaseOwnership(caseId: number, userId: number) {
  const [c] = await db.select({ id: cases.id, userId: cases.userId })
    .from(cases).where(eq(cases.id, caseId));
  if (!c || c.userId !== userId) {
    throw new Error("Case not found or access denied");
  }
  return c;
}

async function getOrCreateCaseState(caseId: number, userId: number) {
  const [existing] = await db.select().from(caseState).where(eq(caseState.caseId, caseId));
  if (existing) return existing;

  const now = Date.now();
  await db.insert(caseState).values({
    caseId,
    userId,
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

  const [created] = await db.select().from(caseState).where(eq(caseState.caseId, caseId));
  return created;
}

function computeCompleteness(state: typeof caseState.$inferSelect): {
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

  const present = checks.filter(c => c.present).map(c => c.label);
  const missing = checks.filter(c => !c.present).map(c => c.label);
  const score = Math.round((present.length / checks.length) * 100);

  return { score, missing, present };
}

async function updateCompleteness(caseId: number) {
  const [state] = await db.select().from(caseState).where(eq(caseState.caseId, caseId));
  if (!state) return;

  const { score, missing, present } = computeCompleteness(state);

  // Generate system flags for missing items
  await db.delete(caseFlags).where(
    and(eq(caseFlags.caseId, caseId), eq(caseFlags.type, "system"), eq(caseFlags.status, "open"))
  );

  const now = Date.now();
  const flagsToInsert = missing.map(label => ({
    caseId,
    userId: state.userId,
    type: "system" as const,
    location: "completeness",
    message: `Missing: ${label}`,
    status: "open" as const,
    createdAt: now,
  }));

  if (flagsToInsert.length > 0) {
    await db.insert(caseFlags).values(flagsToInsert);
  }

  await db.update(caseState)
    .set({
      completenessScore: score,
      completenessBreakdown: { score, missing, present },
      updatedAt: now,
    })
    .where(eq(caseState.caseId, caseId));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const caseStateRouter = router({
  /**
   * Get the current case state for a case
   */
  get: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      // Get open flags
      const flags = await db.select().from(caseFlags)
        .where(and(eq(caseFlags.caseId, input.caseId), eq(caseFlags.status, "open")));

      return { state, flags };
    }),

  /**
   * Commit a finding to the case state
   */
  commitFinding: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      findingId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      const current = (state.committedFindingIds as number[]) || [];
      if (!current.includes(input.findingId)) {
        await db.update(caseState)
          .set({
            committedFindingIds: [...current, input.findingId],
            updatedAt: Date.now(),
          })
          .where(eq(caseState.caseId, input.caseId));
      }

      await updateCompleteness(input.caseId);
      return { success: true, findingId: input.findingId };
    }),

  /**
   * Commit a procedural path (single slot — overwrites)
   */
  commitProceduralPath: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      pathId: z.number().optional(),
      pathLabel: z.string(),
      deadlines: z.array(z.object({
        label: z.string(),
        date: z.string(),
        daysRemaining: z.number(),
        critical: z.boolean(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      await getOrCreateCaseState(input.caseId, ctx.user.id);

      await db.update(caseState)
        .set({
          proceduralPathId: input.pathId ?? null,
          proceduralPathLabel: input.pathLabel,
          computedDeadlines: input.deadlines ?? null,
          updatedAt: Date.now(),
        })
        .where(eq(caseState.caseId, input.caseId));

      await updateCompleteness(input.caseId);

      // Emit DEADLINE_APPROACHING signals for any critical deadlines within 14 days
      if (input.deadlines && input.deadlines.length > 0) {
        const criticalDeadlines = input.deadlines.filter(
          d => d.daysRemaining >= 0 && d.daysRemaining <= 14
        );
        for (const deadline of criticalDeadlines) {
          try {
            // Get case jurisdiction for the signal
            const [cs] = await db.select({ jurisdiction: caseState.jurisdiction })
              .from(caseState).where(eq(caseState.caseId, input.caseId));
            await emitSignal({
              effectType: "DEADLINE_APPROACHING",
              targetTable: "case_state",
              targetId: input.caseId,
              signalType: "DEADLINE_APPROACHING:case_state",
              title: `Deadline in ${deadline.daysRemaining} days: ${deadline.label}`,
              explanation: `Case #${input.caseId} procedural path "${input.pathLabel}" has a deadline approaching: ${deadline.label} on ${deadline.date} (${deadline.daysRemaining} days remaining).`,
              severity: deadline.daysRemaining <= 3 ? "critical" : deadline.daysRemaining <= 7 ? "high" : "medium",
              jurisdiction: cs?.jurisdiction ?? "federal",
              domain: "procedural",
              deadlineDays: deadline.daysRemaining,
              sourceTimestamp: Date.now(),
            });
          } catch { /* non-fatal */ }
        }
      }

      return { success: true, pathLabel: input.pathLabel };
    }),

  /**
   * Commit a remedy strategy (single slot — overwrites)
   */
  commitRemedyStrategy: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      strategyId: z.number().optional(),
      strategyLabel: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      await getOrCreateCaseState(input.caseId, ctx.user.id);

      await db.update(caseState)
        .set({
          remedyStrategyId: input.strategyId ?? null,
          remedyStrategyLabel: input.strategyLabel,
          updatedAt: Date.now(),
        })
        .where(eq(caseState.caseId, input.caseId));

      await updateCompleteness(input.caseId);
      return { success: true, strategyLabel: input.strategyLabel };
    }),

  /**
   * Set claim type (single slot — overwrites)
   */
  setClaimType: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      claimType: z.enum([
        "wage_theft", "wrongful_termination", "discrimination_employment",
        "discrimination_housing", "eviction_unlawful", "housing_denial",
        "benefits_denial", "other"
      ]),
      jurisdiction: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      await getOrCreateCaseState(input.caseId, ctx.user.id);

      await db.update(caseState)
        .set({
          claimType: input.claimType,
          jurisdiction: input.jurisdiction ?? null,
          updatedAt: Date.now()
        })
        .where(eq(caseState.caseId, input.caseId));

      await updateCompleteness(input.caseId);
      return { success: true, claimType: input.claimType, jurisdiction: input.jurisdiction };
    }),

  /**
   * Commit a litigation barrier
   */
  commitBarrier: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      barrierId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      const current = (state.committedBarrierIds as number[]) || [];
      if (!current.includes(input.barrierId)) {
        await db.update(caseState)
          .set({
            committedBarrierIds: [...current, input.barrierId],
            updatedAt: Date.now(),
          })
          .where(eq(caseState.caseId, input.caseId));
      }

      await updateCompleteness(input.caseId);
      return { success: true, barrierId: input.barrierId };
    }),

  /**
   * Commit a benefit program
   */
  commitBenefit: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      benefitId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      const current = (state.committedBenefitIds as number[]) || [];
      if (!current.includes(input.benefitId)) {
        await db.update(caseState)
          .set({
            committedBenefitIds: [...current, input.benefitId],
            updatedAt: Date.now(),
          })
          .where(eq(caseState.caseId, input.caseId));
      }

      await updateCompleteness(input.caseId);
      return { success: true, benefitId: input.benefitId };
    }),

  /**
   * Commit a signal — routes by signal type
   * structural → barriers, evidentiary → findings, pattern → signals (tagged), resource → benefits
   */
  commitSignal: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      signalId: z.number(),
      signalType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      const current = (state.committedSignalIds as number[]) || [];
      if (!current.includes(input.signalId)) {
        await db.update(caseState)
          .set({
            committedSignalIds: [...current, input.signalId],
            updatedAt: Date.now(),
          })
          .where(eq(caseState.caseId, input.caseId));
      }

      await updateCompleteness(input.caseId);
      return { success: true, signalId: input.signalId, routedAs: input.signalType ?? "signal" };
    }),

  /**
   * Commit a statute or case law reference
   */
  commitStatute: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      statuteId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      const current = (state.committedStatuteIds as number[]) || [];
      if (!current.includes(input.statuteId)) {
        await db.update(caseState)
          .set({
            committedStatuteIds: [...current, input.statuteId],
            updatedAt: Date.now(),
          })
          .where(eq(caseState.caseId, input.caseId));
      }

      await updateCompleteness(input.caseId);
      return { success: true, statuteId: input.statuteId };
    }),

  /**
   * Commit a FOIA request to the case
   */
  commitFoia: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      foiaId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      const current = (state.committedFoiaIds as number[]) || [];
      if (!current.includes(input.foiaId)) {
        await db.update(caseState)
          .set({
            committedFoiaIds: [...current, input.foiaId],
            updatedAt: Date.now(),
          })
          .where(eq(caseState.caseId, input.caseId));
      }

      await updateCompleteness(input.caseId);
      return { success: true, foiaId: input.foiaId };
    }),

  /**
   * Commit a filing packet
   */
  commitFiling: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      filingId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      const current = (state.committedFilingIds as number[]) || [];
      if (!current.includes(input.filingId)) {
        await db.update(caseState)
          .set({
            committedFilingIds: [...current, input.filingId],
            updatedAt: Date.now(),
          })
          .where(eq(caseState.caseId, input.caseId));
      }

      await updateCompleteness(input.caseId);
      return { success: true, filingId: input.filingId };
    }),

  /**
   * Remove a committed item (undo commit)
   */
  removeCommit: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      itemType: z.enum(["finding", "barrier", "benefit", "signal", "statute", "foia", "filing"]),
      itemId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const state = await getOrCreateCaseState(input.caseId, ctx.user.id);

      const fieldMap: Record<string, keyof typeof state> = {
        finding: "committedFindingIds",
        barrier: "committedBarrierIds",
        benefit: "committedBenefitIds",
        signal: "committedSignalIds",
        statute: "committedStatuteIds",
        foia: "committedFoiaIds",
        filing: "committedFilingIds",
      };

      const field = fieldMap[input.itemType];
      const current = (state[field] as number[]) || [];
      const updated = current.filter(id => id !== input.itemId);

      await db.update(caseState)
        .set({ [field]: updated, updatedAt: Date.now() } as any)
        .where(eq(caseState.caseId, input.caseId));

      await updateCompleteness(input.caseId);
      return { success: true };
    }),

  /**
   * Add a user flag to a case
   */
  addFlag: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      location: z.string(),
      message: z.string(),
      targetId: z.number().optional(),
      targetType: z.string().optional(),
      areaName: z.string().optional(),
      state: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const now = Date.now();
      await db.insert(caseFlags).values({
        caseId: input.caseId,
        userId: ctx.user.id,
        type: "user",
        location: input.location,
        message: input.message,
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
        areaName: input.areaName ?? null,
        state: input.state ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        status: "open",
        createdAt: now,
      });

      return { success: true };
    }),

  /**
   * Resolve a flag
   */
  resolveFlag: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      flagId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      await db.update(caseFlags)
        .set({ status: "resolved", resolvedAt: Date.now() })
        .where(and(eq(caseFlags.id, input.flagId), eq(caseFlags.caseId, input.caseId)));

      return { success: true };
    }),

  /**
   * Get procedural deadlines from procedural_timelines table
   * by claim type + jurisdiction committed to the case
   */
  getProceduralDeadlines: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      // Get the committed claim type and jurisdiction from case_state
      const [state] = await db.select({
        claimType: caseState.claimType,
        jurisdiction: caseState.jurisdiction,
      }).from(caseState).where(eq(caseState.caseId, input.caseId));

      if (!state?.claimType) return [];

      const jurisdiction = state.jurisdiction || "federal";
      const claimType = state.claimType;

      // Query procedural_timelines directly via raw SQL since table is not in Drizzle schema
      const conn = await import("mysql2/promise");
      const connection = await conn.default.createConnection(process.env.DATABASE_URL!);

      // Try exact jurisdiction match first, then fall back to federal
      const [rows] = await connection.query(
        `SELECT * FROM procedural_timelines 
         WHERE claim_type = ? AND (jurisdiction = ? OR jurisdiction = 'federal')
         ORDER BY CASE WHEN jurisdiction = ? THEN 0 ELSE 1 END
         LIMIT 3`,
        [claimType, jurisdiction, jurisdiction]
      ) as any;

      await connection.end();

      const timelines = rows as any[];
      if (!timelines.length) return [];

      // Convert timeline rows into deadline objects for the UI
      const deadlines: Array<{
        id: string;
        claimType: string;
        deadlineType: string;
        deadlineDate: string | null;
        deadlineDays: number | null;
        description: string;
        jurisdiction: string;
        tollingApplied: boolean;
        specialConsiderations: string | null;
      }> = [];

      const now = new Date();

      for (const t of timelines) {
        // Main filing deadline
        if (t.filing_deadline) {
          const deadlineDate = t.filing_deadline_days
            ? new Date(now.getTime() + t.filing_deadline_days * 24 * 60 * 60 * 1000).toISOString()
            : null;
          deadlines.push({
            id: `filing-${t.id}`,
            claimType: t.claim_type,
            deadlineType: "Filing Deadline",
            deadlineDate,
            deadlineDays: t.filing_deadline_days,
            description: t.filing_deadline,
            jurisdiction: t.jurisdiction,
            tollingApplied: false,
            specialConsiderations: t.special_considerations,
          });
        }
        // EEOC charge deadline
        if (t.eeoc_charge_deadline) {
          deadlines.push({
            id: `eeoc-${t.id}`,
            claimType: t.claim_type,
            deadlineType: "EEOC Charge",
            deadlineDate: null,
            deadlineDays: null,
            description: t.eeoc_charge_deadline,
            jurisdiction: t.jurisdiction,
            tollingApplied: false,
            specialConsiderations: null,
          });
        }
        // DFEH complaint deadline
        if (t.dfeh_complaint_deadline) {
          deadlines.push({
            id: `dfeh-${t.id}`,
            claimType: t.claim_type,
            deadlineType: "DFEH Complaint",
            deadlineDate: null,
            deadlineDays: null,
            description: t.dfeh_complaint_deadline,
            jurisdiction: t.jurisdiction,
            tollingApplied: false,
            specialConsiderations: null,
          });
        }
        // Appeal deadline
        if (t.appeal_deadline) {
          deadlines.push({
            id: `appeal-${t.id}`,
            claimType: t.claim_type,
            deadlineType: "Appeal Deadline",
            deadlineDate: null,
            deadlineDays: null,
            description: t.appeal_deadline,
            jurisdiction: t.jurisdiction,
            tollingApplied: false,
            specialConsiderations: null,
          });
        }
      }

      return deadlines;
    }),

  /**
   * Get remedy matrix for the committed claim type + jurisdiction
   */
  getRemedyMatrix: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const [state] = await db.select({
        claimType: caseState.claimType,
        jurisdiction: caseState.jurisdiction,
      }).from(caseState).where(eq(caseState.caseId, input.caseId));

      if (!state?.claimType) return null;

      const conn = await import("mysql2/promise");
      const connection = await conn.default.createConnection(process.env.DATABASE_URL!);

      const [rows] = await connection.query(
        `SELECT * FROM remedy_matrix 
         WHERE claim_type = ? AND (jurisdiction = ? OR jurisdiction = 'federal')
         ORDER BY CASE WHEN jurisdiction = ? THEN 0 ELSE 1 END
         LIMIT 1`,
        [state.claimType, state.jurisdiction || "federal", state.jurisdiction || "federal"]
      ) as any;

      await connection.end();
      return (rows as any[])[0] ?? null;
    }),

  /**
   * Get full remedy feasibility data from remedy_feasibility_full table
   * Returns all 5 strategy types for the case's jurisdiction
   */
  getRemedyFull: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const [state] = await db.select({
        claimType: caseState.claimType,
        jurisdiction: caseState.jurisdiction,
      }).from(caseState).where(eq(caseState.caseId, input.caseId));

      const jurisdiction = state?.jurisdiction || null;
      const conn = await import("mysql2/promise");
      const connection = await conn.default.createConnection(process.env.DATABASE_URL!);

      const queryJurisdiction = jurisdiction || 'CA';
      const [rows] = await connection.query(
        `SELECT * FROM remedy_feasibility_full WHERE jurisdiction = ? ORDER BY strategy_type`,
        [queryJurisdiction]
      ) as any;

      await connection.end();

      return {
        jurisdiction: queryJurisdiction,
        isFallback: !jurisdiction,
        strategies: (rows as any[]).map((row: any) => ({
          strategyType: row.strategy_type as string,
          costRange: row.cost_range as string,
          timeEstimate: row.time_estimate as string,
          prerequisites: typeof row.prerequisites === 'string' ? JSON.parse(row.prerequisites) : (row.prerequisites ?? []),
          riskFlags: typeof row.risk_flags === 'string' ? JSON.parse(row.risk_flags) : (row.risk_flags ?? []),
        })),
      };
    }),

  /**
   * Get all flags for a case
   */
  getFlags: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      status: z.enum(["open", "resolved", "all"]).optional().default("open"),
    }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const query = db.select().from(caseFlags).where(eq(caseFlags.caseId, input.caseId));

      if (input.status !== "all") {
        return db.select().from(caseFlags).where(
          and(eq(caseFlags.caseId, input.caseId), eq(caseFlags.status, input.status))
        );
      }

      return query;
    }),
});
