import { router, publicProcedure } from "../_core/trpc";
import { pool } from "../db";

export const debugDbRouter = router({
  checkLiveSignalsTable: publicProcedure.query(async () => {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.execute(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_signals'"
      );
      conn.release();
      return { exists: (rows as any[]).length > 0 };
    } catch (error) {
      return { exists: false, error: (error as any).message };
    }
  }),

  getTableColumns: publicProcedure.query(async () => {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.execute(
        "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_signals' ORDER BY ORDINAL_POSITION"
      );
      conn.release();
      return { columns: rows };
    } catch (error) {
      return { error: (error as any).message };
    }
  }),

  testInsert: publicProcedure.query(async () => {
    try {
      const conn = await pool.getConnection();
      const now = Date.now();
      const fingerprint = `test_${now}`;
      
      await conn.execute(
        "INSERT INTO live_signals (signalType, datasetId, jurisdiction, domain, severity, title, explanation, patternSummary, supportingStatistics, confidenceScore, detectedAt, signalFingerprint, active_ls, createdAt, explanation_ls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ["test", "test-ds", "TEST", "test", "high", "Test Signal", "Test explanation", "Test pattern", JSON.stringify({test: true}), 0.85, now, fingerprint, 1, now, "Test explanation"]
      );
      
      conn.release();
      return { success: true, message: "Test insert successful", fingerprint };
    } catch (error) {
      return { success: false, error: (error as any).message };
    }
  }),
});
