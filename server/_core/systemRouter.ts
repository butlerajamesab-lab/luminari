import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getPool } from "../db";

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
  health: publicProcedure.query(() => ({
    ok: true,
    supabaseProject: "wepxlinwbjrkqdzkqpar",
  })),

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
      const { rows: signalRows } = await getPool().query(
        `SELECT COALESCE(signal_status::text, verification_status::text, 'pending') AS status, COUNT(*)::int AS cnt
         FROM detected_signals
         GROUP BY COALESCE(signal_status::text, verification_status::text, 'pending')`
      );

      const signalMap: Record<string, number> = {};
      for (const row of signalRows as any[]) {
        signalMap[row.status] = Number(row.cnt ?? 0);
      }

      const [formsRegistry, resources, registryPrograms, registrySignals] = await Promise.all([
        countTable("forms_registry"),
        countTable("resources"),
        countTable("registry_programs"),
        countTable("registry_signals"),
      ]);
      const registry = formsRegistry + resources + registryPrograms + registrySignals;

      const approved = (signalMap["approved"] ?? 0) + (signalMap["verified"] ?? 0) + (signalMap["active"] ?? 0);
      const rejected = (signalMap["rejected"] ?? 0) + (signalMap["dismissed"] ?? 0) + (signalMap["inactive"] ?? 0);
      const total = Object.values(signalMap).reduce((a, b) => a + b, 0);
      const pending = Math.max(0, total - approved - rejected);

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
