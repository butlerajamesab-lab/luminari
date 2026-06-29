import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { runAction } from "../lib/constitutional-enforce";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Helpers ────────────────────────────────────────────────────────────────

async function getDistinctClaimTypes(): Promise<string[]> {
  const [rows] = await db.execute(sql`
    SELECT DISTINCT claim_type FROM procedural_paths
    WHERE claim_type IS NOT NULL
    ORDER BY claim_type ASC
  `);
  return (rows as unknown as any[]).map((r) => r.claim_type as string);
}

async function getDistinctJurisdictions(claimType?: string): Promise<string[]> {
  let rows: any[];
  if (claimType) {
    // @ts-ignore - ResultSetHeader cast is valid at runtime
    [rows] = await db.execute(sql`
      SELECT DISTINCT jurisdiction FROM procedural_paths
      WHERE claim_type = ${claimType} AND jurisdiction IS NOT NULL
      ORDER BY jurisdiction ASC
    `);
  } else {
    // @ts-ignore - ResultSetHeader cast is valid at runtime
    [rows] = await db.execute(sql`
      SELECT DISTINCT jurisdiction FROM procedural_paths
      WHERE jurisdiction IS NOT NULL
      ORDER BY jurisdiction ASC
    `);
  }
  return (rows as unknown as any[]).map((r) => r.jurisdiction as string);
}

async function getProceduralDashboard() {
  const [countRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM procedural_paths`);
  const totalPaths = Number((countRows as unknown as any[])[0]?.cnt || 0);

  const [claimRows] = await db.execute(sql`
    SELECT claim_type, COUNT(*) as cnt FROM procedural_paths
    GROUP BY claim_type ORDER BY cnt DESC
  `);
  const byClaimType: Record<string, number> = {};
    // @ts-ignore - ResultSetHeader cast is valid at runtime
  for (const r of claimRows as any[]) byClaimType[r.claim_type] = Number(r.cnt);

  const [jurRows] = await db.execute(sql`
    SELECT jurisdiction, COUNT(*) as cnt FROM procedural_paths
    GROUP BY jurisdiction ORDER BY cnt DESC LIMIT 20
  `);
  const byJurisdiction: Record<string, number> = {};
    // @ts-ignore - ResultSetHeader cast is valid at runtime
  for (const r of jurRows as any[]) byJurisdiction[r.jurisdiction] = Number(r.cnt);

  const [recentRows] = await db.execute(sql`
    SELECT claim_type, jurisdiction, agency_name, deadline_days, urgency_level
    FROM procedural_paths
    ORDER BY updated_at DESC LIMIT 10
  `);

  return {
    totalPaths,
    byClaimType,
    byJurisdiction,
    recent_paths: recentRows as unknown as unknown as any[],
  };
}

async function resolveProceduralPath(claimType: string, jurisdiction: string) {
  const [rows] = await db.execute(sql`
    SELECT * FROM procedural_paths
    WHERE claim_type = ${claimType}
      AND (jurisdiction = ${jurisdiction} OR jurisdiction = 'federal')
    ORDER BY
      CASE WHEN jurisdiction = ${jurisdiction} THEN 0 ELSE 1 END ASC,
      urgency_level DESC
    LIMIT 5
  `);
  const paths = rows as unknown as unknown as any[];
  if (!paths.length) return null;

  // Parse JSON fields
  const parsed = paths.map((p) => ({
    ...p,
    process_steps: typeof p.process_steps === "string" ? JSON.parse(p.process_steps || "[]") : (p.process_steps || []),
    key_deadlines: typeof p.key_deadlines === "string" ? JSON.parse(p.key_deadlines || "[]") : (p.key_deadlines || []),
    required_forms: typeof p.required_forms === "string" ? JSON.parse(p.required_forms || "[]") : (p.required_forms || []),
    recommendations: typeof p.recommendations === "string" ? JSON.parse(p.recommendations || "[]") : (p.recommendations || []),
    escalation_options: typeof p.escalation_options === "string" ? JSON.parse(p.escalation_options || "[]") : (p.escalation_options || []),
  }));

  return {
    claimType,
    jurisdiction,
    paths: parsed,
    primary_path: parsed[0],
  };
}

// ── Router ─────────────────────────────────────────────────────────────────

export const proceduralPathEngineRouter = router({
  // Resolve path by claim type + jurisdiction — queries procedural_paths table
  resolve: protectedProcedure
    .input(z.object({
      claimType: z.string(),
      jurisdiction: z.string(),
      caseId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return resolveProceduralPath(input.claimType, input.jurisdiction);
    }),

  // Track progress against a resolved path
  trackProgress: protectedProcedure
    .input(z.object({
      claimType: z.string(),
      jurisdiction: z.string(),
      completedStepNumbers: z.array(z.number()),
      caseId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const pathData = await resolveProceduralPath(input.claimType, input.jurisdiction);
      if (!pathData) return null;
      const allSteps = pathData.primary_path?.process_steps || [];
      const completed = new Set(input.completedStepNumbers);
      const steps = allSteps.map((step: any, idx: number) => ({
        ...step,
        stepNumber: idx + 1,
        completed: completed.has(idx + 1),
      }));
      const completionPct = allSteps.length > 0
        ? Math.round((input.completedStepNumbers.length / allSteps.length) * 100)
        : 0;
      return { ...pathData, steps, completionPct };
    }),

  // Save result to case
  saveResult: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      claimType: z.string(),
      jurisdiction: z.string(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.PROCEDURAL_PATH, caseId: input.caseId }, async () => {
        return await runAction(input.caseId, "saveProceduralResult", input);
      });
    }),

  // Dashboard — aggregate stats, no caseId required
  dashboard: protectedProcedure
    .input(z.object({ caseId: z.number() }).optional())
    .query(async () => {
      return getProceduralDashboard();
    }),

  // Aliases matching what the UI calls
  claimTypes: protectedProcedure
    .query(async () => {
      return getDistinctClaimTypes();
    }),

  jurisdictions: protectedProcedure
    .input(z.object({ claimType: z.string() }).optional())
    .query(async ({ input }) => {
      return getDistinctJurisdictions(input?.claimType);
    }),

  // Original names kept for backward compatibility
  availableClaimTypes: protectedProcedure
    .query(async () => {
      return getDistinctClaimTypes();
    }),

  availableJurisdictions: protectedProcedure
    .input(z.object({ claimType: z.string() }).optional())
    .query(async ({ input }) => {
      return getDistinctJurisdictions(input?.claimType);
    }),
});
