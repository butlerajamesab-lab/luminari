import { publicProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";

export const databaseAuditRouter = router({
  getTableCounts: publicProcedure.query(async () => {
    try {
      const result = await db.execute(sql`
        SELECT 
          TABLE_NAME,
          TABLE_ROWS as row_count
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME
      `);
      
      return {
        success: true,
        tables: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }),
});



// ============================================================
