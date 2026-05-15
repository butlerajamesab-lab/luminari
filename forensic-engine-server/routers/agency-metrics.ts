import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { db } from "../db";
import { agencyPerformanceMetrics, legalWeakJoints } from "../../drizzle/schema";
import { eq, and, desc, sql, like } from "drizzle-orm";

export const agencyMetricsRouter = router({
  // Get all agencies with their latest year data
  listAgencies: publicProcedure.query(async () => {
    const rows = await db.select({
      agencyName: agencyPerformanceMetrics.agencyName,
      agencyAbbreviation: agencyPerformanceMetrics.agencyAbbreviation,
      jurisdiction: agencyPerformanceMetrics.jurisdiction,
      statutoryAuthority: agencyPerformanceMetrics.statutoryAuthority,
    })
      .from(agencyPerformanceMetrics)
      .groupBy(
        agencyPerformanceMetrics.agencyName,
        agencyPerformanceMetrics.agencyAbbreviation,
        agencyPerformanceMetrics.jurisdiction,
        agencyPerformanceMetrics.statutoryAuthority,
      );
    return rows;
  }),

  // Get all yearly data for a specific agency
  getAgencyTimeline: publicProcedure
    .input(z.object({ agencyName: z.string() }))
    .query(async ({ input }) => {
      const rows = await db.select()
        .from(agencyPerformanceMetrics)
        .where(eq(agencyPerformanceMetrics.agencyName, input.agencyName))
        .orderBy(desc(agencyPerformanceMetrics.fiscalYear));
      return rows;
    }),

  // Get all metrics (all agencies, all years)
  getAll: publicProcedure.query(async () => {
    const rows = await db.select()
      .from(agencyPerformanceMetrics)
      .orderBy(
        agencyPerformanceMetrics.agencyName,
        desc(agencyPerformanceMetrics.fiscalYear),
      );
    return rows;
  }),

  // Get weak joints related to an agency (by matching statuteCitation keywords)
  getAgencyWeakJoints: publicProcedure
    .input(z.object({ agencyName: z.string() }))
    .query(async ({ input }) => {
      // Map agency names to statute citation patterns
      const citationPatterns: Record<string, string[]> = {
        "Equal Employment Opportunity Commission": ["2000e", "Title VII", "ADA", "ADEA", "EPA", "GINA"],
        "HUD Office of Fair Housing": ["3601", "3604", "3605", "Fair Housing"],
        "DOL Wage and Hour Division": ["FLSA", "206", "207", "212", "213"],
        "HHS Office for Civil Rights": ["HIPAA", "1557", "Civil Rights Act"],
        "SSA Office of Disability": ["423", "1382", "Social Security"],
        "EPA Office of Enforcement": ["7401", "Clean Air", "Clean Water", "CERCLA"],
      };
      const patterns = citationPatterns[input.agencyName] || [input.agencyName];
      const conditions = patterns.map(p => like(legalWeakJoints.statuteCitation, `%${p}%`));
      const rows = await db.select()
        .from(legalWeakJoints)
        .where(conditions.length === 1 ? conditions[0] : sql`(${sql.join(conditions, sql` OR `)})`)
        .orderBy(desc(legalWeakJoints.severity))
        .limit(20);
      return rows;
    }),

  // Summary stats
  stats: publicProcedure.query(async () => {
    const [agencyCount] = await db.select({
      count: sql<number>`COUNT(DISTINCT agencyName)`,
    }).from(agencyPerformanceMetrics);
    const [yearCount] = await db.select({
      count: sql<number>`COUNT(DISTINCT fiscalYear)`,
    }).from(agencyPerformanceMetrics);
    const [totalRows] = await db.select({
      count: sql<number>`COUNT(*)`,
    }).from(agencyPerformanceMetrics);
    return {
      agencies: agencyCount?.count ?? 0,
      years: yearCount?.count ?? 0,
      totalDataPoints: totalRows?.count ?? 0,
    };
  }),
});
