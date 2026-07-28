import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getPool } from "../db";

const toMillis = (value: Date | string | number | null | undefined): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const oneDayAgoIso = () => new Date(Date.now() - 86_400_000).toISOString();
const oneDayAgoMillis = () => Date.now() - 86_400_000;
const oneWeekAgoMillis = () => Date.now() - 604_800_000;

const NORMALIZED_SIGNAL_CATEGORY_SQL = `CASE
  WHEN COALESCE(signal_type, 'unknown') ~ '^(contradiction|inconsistency|missing_evidence)_[0-9]+$'
    THEN regexp_replace(COALESCE(signal_type, 'unknown'), '_[0-9]+$', '')
  ELSE COALESCE(signal_type, 'unknown')
END`;

const getCount = async (query: string, params: unknown[] = []): Promise<number> => {
  const { rows } = await getPool().query(query, params);
  return Number(rows[0]?.cnt ?? 0);
};

/* ─── Public read-only Mission Control dashboard ─── */
export const adminDashboardRouter = router({
  /* ── Panel 1: System Health ── */
  systemHealth: publicProcedure.query(async () => {
    const oneDayAgo = oneDayAgoIso();

    const [totalRuns, recentRuns, failedRuns, completedRuns, runningNow, engineBreakdownRows] = await Promise.all([
      getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs`),
      getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs WHERE started_at >= $1`, [oneDayAgo]),
      getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs WHERE status = 'failed' AND started_at >= $1`, [oneDayAgo]),
      getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs WHERE status = 'completed' AND started_at >= $1`, [oneDayAgo]),
      getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs WHERE status IN ('running', 'pending')`),
      getPool().query(
        `SELECT COALESCE(ruleset_version, status::text, 'pipeline_run') AS run_type, COUNT(*)::int AS cnt
         FROM pipeline_runs
         WHERE started_at >= $1
         GROUP BY COALESCE(ruleset_version, status::text, 'pipeline_run')
         ORDER BY cnt DESC`,
        [oneDayAgo]
      ),
    ]);

    const memoryUsage = process.memoryUsage();
    const engineBreakdown = engineBreakdownRows.rows.map((row: any) => ({
      type: row.run_type,
      count: Number(row.cnt ?? 0),
    }));
    const successRate = recentRuns ? Math.round((completedRuns / recentRuns) * 100) : 100;
    const serverUptime = process.uptime();

    return {
      total_runs: totalRuns,
      totalRuns,
      last24h: {
        total: recentRuns,
        completed: completedRuns,
        failed: failedRuns,
        running: runningNow,
        success_rate: successRate,
        successRate,
      },
      engine_breakdown: engineBreakdown,
      engineBreakdown,
      server_uptime: serverUptime,
      serverUptime,
      memory_usage: memoryUsage,
      memoryUsage,
      timestamp: Date.now(),
    };
  }),

  /* ── Panel 3: Case Activity ── */
  caseActivity: publicProcedure.query(async () => {
    const oneDayAgo = oneDayAgoMillis();
    const oneWeekAgo = oneWeekAgoMillis();

    const [totalCases, casesToday, casesThisWeek, totalDocs, docsToday, totalFindings, findingsToday, totalUsers, usersToday, recentCasesRows] = await Promise.all([
      getCount(`SELECT COUNT(*)::int AS cnt FROM cases`),
      getCount(`SELECT COUNT(*)::int AS cnt FROM cases WHERE created_at >= $1`, [oneDayAgo]),
      getCount(`SELECT COUNT(*)::int AS cnt FROM cases WHERE created_at >= $1`, [oneWeekAgo]),
      getCount(`SELECT COUNT(*)::int AS cnt FROM documents`),
      getCount(`SELECT COUNT(*)::int AS cnt FROM documents WHERE created_at >= $1`, [oneDayAgo]),
      getCount(`SELECT COUNT(*)::int AS cnt FROM findings`),
      getCount(`SELECT COUNT(*)::int AS cnt FROM findings WHERE created_at >= $1`, [oneDayAgo]),
      getCount(`SELECT COUNT(*)::int AS cnt FROM users`),
      getCount(`SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= $1`, [oneDayAgo]),
      getPool().query(
        `SELECT id::text, COALESCE(name, description, id::text) AS name, created_at
         FROM cases
         ORDER BY created_at DESC
         LIMIT 10`
      ),
    ]);

    const recentCases = recentCasesRows.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      created_at: toMillis(row.created_at) ?? Date.now(),
      createdAt: toMillis(row.created_at) ?? Date.now(),
    }));

    return {
      cases: { total: totalCases, today: casesToday, this_week: casesThisWeek, thisWeek: casesThisWeek },
      documents: { total: totalDocs, today: docsToday },
      findings: { total: totalFindings, today: findingsToday },
      users: { total: totalUsers, today: usersToday },
      recent_cases: recentCases,
      recentCases,
    };
  }),

  /* ── Panel 4: Structural Signals (aggregated) ── */
  structuralSignals: publicProcedure.query(async () => {
    const [severityRows, categoryRows, criticalRows, totalSignals] = await Promise.all([
      getPool().query(
        `SELECT severity::text AS severity, COUNT(*)::int AS cnt
         FROM detected_signals
         GROUP BY severity::text
         ORDER BY cnt DESC`
      ),
      getPool().query(
        `SELECT ${NORMALIZED_SIGNAL_CATEGORY_SQL} AS category, COUNT(*)::int AS cnt
         FROM detected_signals
         GROUP BY ${NORMALIZED_SIGNAL_CATEGORY_SQL}
         ORDER BY cnt DESC, category`
      ),
      getPool().query(
        `SELECT id::text, case_id::text, COALESCE(signal_description, signal_type, 'Detected signal') AS title,
                severity::text AS severity, ${NORMALIZED_SIGNAL_CATEGORY_SQL} AS category, created_at
         FROM detected_signals
         WHERE severity::text IN ('high', 'critical')
         ORDER BY created_at DESC
         LIMIT 10`
      ),
      getCount(`SELECT COUNT(*)::int AS cnt FROM detected_signals`),
    ]);

    const bySeverity = severityRows.rows.map((row: any) => ({ severity: row.severity, count: Number(row.cnt ?? 0) }));
    const byCategory = categoryRows.rows.map((row: any) => ({ category: row.category, count: Number(row.cnt ?? 0) }));
    const criticalFindings = criticalRows.rows.map((row: any) => {
      const createdAt = toMillis(row.created_at) ?? Date.now();
      return {
        id: row.id,
        case_id: row.case_id,
        caseId: row.case_id,
        title: row.title,
        severity: row.severity,
        category: row.category,
        created_at: createdAt,
        createdAt,
      };
    });

    return {
      by_severity: bySeverity,
      bySeverity,
      by_category: byCategory,
      byCategory,
      critical_findings: criticalFindings,
      criticalFindings,
      total_findings: totalSignals,
      totalFindings: totalSignals,
    };
  }),

  /* ── Panel 5: Work Queue ── */
  workQueue: publicProcedure.query(async () => {
    const [runningRows, failedRows, completedRows] = await Promise.all([
      getPool().query(
        `SELECT id::text, case_id::text, COALESCE(ruleset_version, 'pipeline_run') AS run_type,
                status::text AS run_status, started_at
         FROM pipeline_runs
         WHERE status::text IN ('running', 'pending')
         ORDER BY started_at DESC
         LIMIT 20`
      ),
      getPool().query(
        `SELECT id::text, case_id::text, COALESCE(ruleset_version, 'pipeline_run') AS run_type,
                status::text AS run_status, error_message, started_at
         FROM pipeline_runs
         WHERE status::text = 'failed'
         ORDER BY started_at DESC
         LIMIT 10`
      ),
      getPool().query(
        `SELECT id::text, case_id::text, COALESCE(ruleset_version, 'pipeline_run') AS run_type,
                completed_at, started_at
         FROM pipeline_runs
         WHERE status::text = 'completed'
         ORDER BY COALESCE(completed_at, started_at) DESC
         LIMIT 10`
      ),
    ]);

    const running = runningRows.rows.map((row: any) => {
      const createdAt = toMillis(row.started_at) ?? Date.now();
      return { id: row.id, case_id: row.case_id, caseId: row.case_id, run_type: row.run_type, runType: row.run_type, run_status: row.run_status, runStatus: row.run_status, created_at: createdAt, createdAt };
    });
    const failed = failedRows.rows.map((row: any) => {
      const createdAt = toMillis(row.started_at) ?? Date.now();
      return { id: row.id, case_id: row.case_id, caseId: row.case_id, run_type: row.run_type, runType: row.run_type, run_status: row.run_status, runStatus: row.run_status, error_message: row.error_message, errorMessage: row.error_message, created_at: createdAt, createdAt };
    });
    const recentlyCompleted = completedRows.rows.map((row: any) => {
      const completedAt = toMillis(row.completed_at) ?? toMillis(row.started_at) ?? Date.now();
      return { id: row.id, case_id: row.case_id, caseId: row.case_id, run_type: row.run_type, runType: row.run_type, completed_at: completedAt, completedAt };
    });

    return {
      running,
      failed,
      recently_completed: recentlyCompleted,
      recentlyCompleted,
    };
  }),

  /* ── Findings drill-through by severity ── */
  findingsBySeverity: publicProcedure
    .input(z.object({ severity: z.string().optional() }))
    .query(async ({ input }) => {
      const params: unknown[] = [];
      let whereClause = "";
      if (input.severity) {
        params.push(input.severity);
        whereClause = `WHERE severity::text = $1`;
      }

      const { rows } = await getPool().query(
        `SELECT id::text, case_id::text, COALESCE(signal_description, signal_type, 'Detected signal') AS title,
                severity::text AS severity, ${NORMALIZED_SIGNAL_CATEGORY_SQL} AS category, created_at
         FROM detected_signals
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT 50`,
        params
      );

      return rows.map((row: any) => ({
        id: row.id,
        case_id: row.case_id,
        caseId: row.case_id,
        title: row.title,
        severity: row.severity,
        category: row.category,
        created_at: toMillis(row.created_at) ?? Date.now(),
        createdAt: toMillis(row.created_at) ?? Date.now(),
      }));
    }),
});
