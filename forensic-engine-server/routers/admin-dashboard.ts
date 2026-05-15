import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { sql, count, desc, eq, gte, and, inArray } from "drizzle-orm";
import {
  users,
  cases,
  documents,
  findings,
  engineRuns,
  legalStatutes,
  legalCaseLaw,
  agencyAuthorityMap,
  strategyClaimCatalog,
  lumensendTemplates,
  assemblySectionLibrary,
  legislatorContacts,
  advocacyOrganizations,
} from "../../drizzle/schema";

/* ─── Admin guard ─── */
const adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  return next({ ctx });
});

export const adminDashboardRouter = router({
  /* ── Panel 1: System Health ── */
  systemHealth: adminProcedure2.query(async () => {
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const oneHourAgo = now - 3600000;

    // Engine run stats
    const [totalRuns] = await db.select({ cnt: count() }).from(engineRuns);
    const [recentRuns] = await db.select({ cnt: count() }).from(engineRuns).where(gte(engineRuns.createdAt, oneDayAgo));
    const [failedRuns] = await db.select({ cnt: count() }).from(engineRuns).where(
      and(eq(engineRuns.runStatus, "failed"), gte(engineRuns.createdAt, oneDayAgo))
    );
    const [completedRuns] = await db.select({ cnt: count() }).from(engineRuns).where(
    // @ts-ignore
      and(eq(engineRuns.runStatus, "completed"), gte(engineRuns.createdAt, oneDayAgo))
    );
    const [runningNow] = await db.select({ cnt: count() }).from(engineRuns).where(eq(engineRuns.runStatus, "running"));

    // Engine breakdown by type (last 24h)
    const engineBreakdown = await db
      .select({ runType: engineRuns.runType, cnt: count() })
      .from(engineRuns)
      .where(gte(engineRuns.createdAt, oneDayAgo))
      .groupBy(engineRuns.runType);

    return {
      totalRuns: totalRuns?.cnt ?? 0,
      last24h: {
        total: recentRuns?.cnt ?? 0,
        completed: completedRuns?.cnt ?? 0,
        failed: failedRuns?.cnt ?? 0,
        running: runningNow?.cnt ?? 0,
        successRate: recentRuns?.cnt ? Math.round(((completedRuns?.cnt ?? 0) / recentRuns.cnt) * 100) : 100,
      },
      engineBreakdown: engineBreakdown.map((e) => ({
        type: e.runType,
        count: e.cnt,
      })),
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: now,
    };
  }),

  /* ── Panel 3: Case Activity ── */
  caseActivity: adminProcedure2.query(async () => {
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const oneWeekAgo = now - 604800000;

    const [totalCases] = await db.select({ cnt: count() }).from(cases);
    const [casesToday] = await db.select({ cnt: count() }).from(cases).where(gte(cases.createdAt, oneDayAgo));
    const [casesThisWeek] = await db.select({ cnt: count() }).from(cases).where(gte(cases.createdAt, oneWeekAgo));
    const [totalDocs] = await db.select({ cnt: count() }).from(documents);
    const [docsToday] = await db.select({ cnt: count() }).from(documents).where(gte(documents.createdAt, oneDayAgo));
    const [totalFindings] = await db.select({ cnt: count() }).from(findings);
    const [findingsToday] = await db.select({ cnt: count() }).from(findings).where(gte(findings.createdAt, oneDayAgo));
    const [totalUsers] = await db.select({ cnt: count() }).from(users);
    const [usersToday] = await db.select({ cnt: count() }).from(users).where(gte(users.createdAt, oneDayAgo));

    // Recent cases
    const recentCases = await db
      .select({ id: cases.id, name: cases.name, createdAt: cases.createdAt })
      .from(cases)
      .orderBy(desc(cases.createdAt))
      .limit(10);

    return {
      cases: { total: totalCases?.cnt ?? 0, today: casesToday?.cnt ?? 0, thisWeek: casesThisWeek?.cnt ?? 0 },
      documents: { total: totalDocs?.cnt ?? 0, today: docsToday?.cnt ?? 0 },
      findings: { total: totalFindings?.cnt ?? 0, today: findingsToday?.cnt ?? 0 },
      users: { total: totalUsers?.cnt ?? 0, today: usersToday?.cnt ?? 0 },
      recentCases,
    };
  }),

  /* ── Panel 4: Structural Signals (aggregated) ── */
  structuralSignals: adminProcedure2.query(async () => {
    // Count findings by severity across all cases
    const severityCounts = await db
      .select({ severity: findings.confidence, cnt: count() })
      .from(findings)
      .groupBy(findings.confidence);

    // Count findings by category
    const categoryCounts = await db
      .select({ category: findings.findingType, cnt: count() })
      .from(findings)
      .groupBy(findings.findingType);

    // Recent high-severity findings
    const criticalFindings = await db
      .select({
        id: findings.id,
        caseId: findings.caseId,
        title: findings.title,
        severity: findings.confidence,
        category: findings.findingType,
        createdAt: findings.createdAt,
      })
      .from(findings)
      .where(eq(findings.confidence, "strong"))
      .orderBy(desc(findings.createdAt))
      .limit(10);

    return {
      bySeverity: severityCounts.map((s) => ({ severity: s.severity, count: s.cnt })),
      byCategory: categoryCounts.map((c) => ({ category: c.category, count: c.cnt })),
      criticalFindings,
      totalFindings: severityCounts.reduce((sum, s) => sum + s.cnt, 0),
    };
  }),

  /* ── Panel 5: Work Queue ── */
  workQueue: adminProcedure2.query(async () => {
    // Pending/running engine runs
    const pendingRuns = await db
      .select({
        id: engineRuns.id,
        caseId: engineRuns.caseId,
        runType: engineRuns.runType,
        runStatus: engineRuns.runStatus,
        createdAt: engineRuns.createdAt,
      })
      .from(engineRuns)
      .where(eq(engineRuns.runStatus, "running"))
      .orderBy(desc(engineRuns.createdAt))
      .limit(20);

    // Recently failed runs
    const failedRuns = await db
      .select({
        id: engineRuns.id,
        caseId: engineRuns.caseId,
        runType: engineRuns.runType,
        runStatus: engineRuns.runStatus,
        errorMessage: engineRuns.errorMessage,
        createdAt: engineRuns.createdAt,
      })
      .from(engineRuns)
      .where(eq(engineRuns.runStatus, "failed"))
      .orderBy(desc(engineRuns.createdAt))
      .limit(10);

    // Recently completed runs
    const completedRuns = await db
      .select({
        id: engineRuns.id,
        caseId: engineRuns.caseId,
        runType: engineRuns.runType,
        completedAt: engineRuns.completedAt,
      })
      .from(engineRuns)
    // @ts-ignore
      .where(eq(engineRuns.runStatus, "completed"))
      .orderBy(desc(engineRuns.completedAt))
      .limit(10);

    return {
      running: pendingRuns,
      failed: failedRuns,
      recentlyCompleted: completedRuns,
    };
  }),

  /* ── Findings drill-through by severity ── */
  findingsBySeverity: adminProcedure2
    .input(z.object({ severity: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: findings.id,
          caseId: findings.caseId,
          title: findings.title,
          severity: findings.confidence,
          category: findings.findingType,
          createdAt: findings.createdAt,
        })
        .from(findings)
    // @ts-ignore
        .where(input.severity ? eq(findings.confidence, input.severity) : undefined)
        .orderBy(desc(findings.createdAt))
        .limit(50);
      return rows;
    }),
});
