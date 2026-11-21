import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getPool } from "../db";
import { getDatabaseDiagnostic } from "./health-diagnostics";

const countTable = async (tableName: string): Promise<number> => {
  try {
    const safeName = `"${tableName.replace(/"/g, '""')}"`;
    const { rows } = await getPool().query(`SELECT COUNT(*)::int AS cnt FROM ${safeName}`);
    return Number(rows[0]?.cnt ?? 0);
  } catch {
    return 0;
  }
};

export const systemRouter = router({
  // Full table/view/FK inventories and pool diagnostics are administrative
  // operational data. Public liveness remains available at GET /api/health.
  health: adminProcedure.query(() => getDatabaseDiagnostic()),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Public read-only dashboard stats for Mission Control — signal counts and registry summary.
   */
  stats: publicProcedure.query(async () => {
    try {
      // Governed signal counts read the true store — public.live_data_signals,
      // the same relation the Signal Governance dashboard reads via
      // canonical-live-signal-queries.ts — with the same definitions:
      // pending = current observation candidates awaiting review,
      // approved = current promoted signals. (This procedure previously
      // counted the legacy detected_signals table by signal_status /
      // verification_status columns that table does not have, so the
      // query threw on every call and the catch below zeroed every
      // counter, registry included.) Rejected is a recorded decision, so
      // it is counted over all rows with governance_status = 'rejected',
      // current or superseded.
      const { rows: signalRows } = await getPool().query(
        `SELECT governance_status::text AS status, COUNT(*)::int AS cnt
         FROM live_data_signals
         WHERE is_current = true
         GROUP BY governance_status`
      );

      const signalMap: Record<string, number> = {};
      for (const row of signalRows as any[]) {
        signalMap[row.status] = Number(row.cnt ?? 0);
      }

      const { rows: rejectedRows } = await getPool().query(
        `SELECT COUNT(*)::int AS cnt FROM live_data_signals WHERE governance_status = 'rejected'`
      );

      const [formsRegistry, resources, registryPrograms, registrySignals] = await Promise.all([
        countTable("forms_registry"),
        countTable("resources"),
        countTable("registry_programs"),
        countTable("registry_signals"),
      ]);
      const registry = formsRegistry + resources + registryPrograms + registrySignals;

      const pending = signalMap["observation_candidate"] ?? 0;
      const approved = signalMap["promoted"] ?? 0;
      const rejected = Number((rejectedRows as any[])[0]?.cnt ?? 0);
      const total = Object.values(signalMap).reduce((a, b) => a + b, 0);

      return {
        signals: { pending, approved, rejected, total },
        registry,
      };
    } catch {
      return {
        signals: { pending: 0, approved: 0, rejected: 0, total: 0 },
        registry: 0,
      };
    }
  }),
});
