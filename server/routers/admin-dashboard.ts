import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getPool } from "../db";
import {
  get_canonical_live_signal_summary,
  get_canonical_live_signals,
} from "../canonical-live-signal-queries";

const toMillis = (value: Date | string | number | null | undefined): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const oneDayAgoIso = () => new Date(Date.now() - 86_400_000).toISOString();
const oneDayAgoMillis = () => Date.now() - 86_400_000;
const oneWeekAgoMillis = () => Date.now() - 604_800_000;

const getCount = async (query: string, params: unknown[] = []): Promise<number> => {
  const { rows } = await getPool().query(query, params);
  return Number(rows[0]?.cnt ?? 0);
};

/* Public read-only Mission Control dashboard. */
export const adminDashboardRouter = router({
  systemHealth: publicProcedure.query(async () => {
    const oneDayAgo = oneDayAgoIso();
    const totalRuns = await getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs`);
    const recentRuns = await getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs WHERE started_at >= $1`, [oneDayAgo]);
    const failedRuns = await getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs WHERE status = 'failed' AND started_at >= $1`, [oneDayAgo]);
    const completedRuns = await getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs WHERE status = 'completed' AND started_at >= $1`, [oneDayAgo]);
    const runningNow = await getCount(`SELECT COUNT(*)::int AS cnt FROM pipeline_runs WHERE status IN ('running', 'pending')`);
    const engineBreakdownRows = await getPool().query(
      `SELECT COALESCE(ruleset_version, status::text, 'pipeline_run') AS run_type, COUNT(*)::int AS cnt
       FROM pipeline_runs
       WHERE started_at >= $1
       GROUP BY COALESCE(ruleset_version, status::text, 'pipeline_run')
       ORDER BY cnt DESC`,
      [oneDayAgo]
    );

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

  caseActivity: publicProcedure.query(async () => {
    const oneDayAgo = oneDayAgoMillis();
    const oneWeekAgo = oneWeekAgoMillis();
    const oneDayAgoTimestamp = oneDayAgoIso();

    const totalCases = await getCount(`SELECT COUNT(*)::int AS cnt FROM cases`);
    const casesToday = await getCount(`SELECT COUNT(*)::int AS cnt FROM cases WHERE created_at >= $1`, [oneDayAgo]);
    const casesThisWeek = await getCount(`SELECT COUNT(*)::int AS cnt FROM cases WHERE created_at >= $1`, [oneWeekAgo]);
    const totalDocs = await getCount(`SELECT COUNT(*)::int AS cnt FROM documents`);
    const docsToday = await getCount(`SELECT COUNT(*)::int AS cnt FROM documents WHERE created_at >= $1`, [oneDayAgo]);
    // The case UI exposes governed verification records. The legacy `findings`
    // table also contains unsupported and orphaned historical projections, so
    // counting it here makes Mission Control disagree with every case view.
    const totalFindings = await getCount(`SELECT COUNT(*)::int AS cnt FROM intake_verification_records`);
    // Legacy case, document, and user timestamps are epoch-millisecond bigint
    // columns. Intake verification uses timestamptz and therefore needs an ISO
    // cutoff instead of the shared bigint cutoff.
    const findingsToday = await getCount(
      `SELECT COUNT(*)::int AS cnt FROM intake_verification_records WHERE created_at >= $1`,
      [oneDayAgoTimestamp],
    );
    const totalUsers = await getCount(`SELECT COUNT(*)::int AS cnt FROM users`);
    const usersToday = await getCount(`SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= $1`, [oneDayAgo]);
    const recentCasesRows = await getPool().query(
      `SELECT id::text, COALESCE(name, description, id::text) AS name, created_at
       FROM cases
       ORDER BY created_at DESC
       LIMIT 10`
    );

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

  /* Current Atlas Domain 3 signals only. Legacy detected_signals stay historical. */
  structuralSignals: publicProcedure.query(async () => {
    const [summary, critical] = await Promise.all([
      get_canonical_live_signal_summary(),
      get_canonical_live_signals({ limit: 100 }),
    ]);

    const bySeverity = Object.entries(summary.by_severity)
      .map(([severity, count]) => ({ severity, count }))
      .sort((a, b) => b.count - a.count || a.severity.localeCompare(b.severity));
    const byCategory = Object.entries(summary.by_stream)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
    const criticalFindings = critical
      .filter(signal => signal.severity_level === "high" || signal.severity_level === "critical")
      .slice(0, 10)
      .map(signal => ({
        id: signal.signal_id,
        case_id: null,
        caseId: null,
        title: signal.title,
        severity: signal.severity_level,
        category: signal.signal_type,
        created_at: signal.detected_at ?? Date.now(),
        createdAt: signal.detected_at ?? Date.now(),
        stream_id: signal.stream_id,
        rule_id: signal.detection_rule_id,
        rule_version: signal.detection_rule_version,
        engine_id: signal.engine_id,
        engine_version: signal.engine_version,
        signal_hash: signal.signal_hash,
      }));

    return {
      by_severity: bySeverity,
      bySeverity,
      by_category: byCategory,
      byCategory,
      critical_findings: criticalFindings,
      criticalFindings,
      total_findings: summary.total_signals,
      totalFindings: summary.total_signals,
      source_relation: summary.source_relation,
      contract_version: summary.contract_version,
      legacy_archived: summary.legacy_archived,
    };
  }),

  workQueue: publicProcedure.query(async () => {
    const runningRows = await getPool().query(
      `SELECT id::text, case_id::text, COALESCE(ruleset_version, 'pipeline_run') AS run_type,
              status::text AS run_status, started_at
       FROM pipeline_runs
       WHERE status::text IN ('running', 'pending')
       ORDER BY started_at DESC
       LIMIT 20`
    );
    const failedRows = await getPool().query(
      `SELECT id::text, case_id::text, COALESCE(ruleset_version, 'pipeline_run') AS run_type,
              status::text AS run_status, error_message, started_at
       FROM pipeline_runs
       WHERE status::text = 'failed'
       ORDER BY started_at DESC
       LIMIT 10`
    );
    const completedRows = await getPool().query(
      `SELECT id::text, case_id::text, COALESCE(ruleset_version, 'pipeline_run') AS run_type,
              completed_at, started_at
       FROM pipeline_runs
       WHERE status::text = 'completed'
       ORDER BY COALESCE(completed_at, started_at) DESC
       LIMIT 10`
    );

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

  findingsBySeverity: publicProcedure
    .input(z.object({ severity: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await get_canonical_live_signals({
        severity: input.severity,
        limit: 50,
      });
      return rows.map(signal => ({
        id: signal.signal_id,
        case_id: null,
        caseId: null,
        title: signal.title,
        severity: signal.severity_level,
        category: signal.signal_type,
        created_at: signal.detected_at ?? Date.now(),
        createdAt: signal.detected_at ?? Date.now(),
        stream_id: signal.stream_id,
        rule_id: signal.detection_rule_id,
        engine_version: signal.engine_version,
        signal_hash: signal.signal_hash,
      }));
    }),
});
