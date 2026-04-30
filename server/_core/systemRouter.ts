import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { pool } from "../db";

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
   * Dashboard stats for Mission Control — signal counts and registry summary
   */
  stats: adminProcedure.query(async () => {
    try {
      // Signal counts by approvalStatus
      const [signalRows] = await pool.query(
        `SELECT approvalStatus, COUNT(*) as cnt
         FROM detected_signals
         GROUP BY approvalStatus`
      );

      const signalMap: Record<string, number> = {};
      for (const row of (signalRows as any[])) {
        signalMap[row.approvalStatus] = Number(row.cnt);
      }

      // Registry count (forms + resources)
      const [regRows] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM forms_registry) +
           (SELECT COUNT(*) FROM resources) as total`
      );
      const registry = Number((regRows as any[])[0]?.total || 0);

      return {
        signals: {
          pending: signalMap["pending"] || 0,
          approved: signalMap["approved"] || 0,
          rejected: signalMap["rejected"] || 0,
          total: Object.values(signalMap).reduce((a, b) => a + b, 0),
        },
        registry,
      };
    } catch (e: any) {
      // Return safe defaults on error so the page doesn't crash
      return {
        signals: { pending: 0, approved: 0, rejected: 0, total: 0 },
        registry: 0,
      };
    }
  }),
});
