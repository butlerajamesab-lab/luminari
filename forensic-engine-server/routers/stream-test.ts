/**
 * Stream Test Router
 * Simple debugging endpoint to test stream registration
 */

import { router, publicProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";

export const streamTestRouter = router({
  /**
   * Test: Insert one stream and return detailed result
   */
  testInsertOne: publicProcedure
    .query(async () => {
      try {
        const now = Math.floor(Date.now());
        const streamId = 'test_stream_' + now;

        console.log('[Stream Test] Attempting INSERT...');
        console.log('[Stream Test] Stream ID:', streamId);
        console.log('[Stream Test] Timestamp:', now);

        const result = await db.execute(sql`
          INSERT INTO data_stream_registry 
          (stream_id_dsr, stream_name_dsr, stream_type_dsr, source_dsr, enabled_dsr, created_at_dsr, updated_at_dsr)
          VALUES (${streamId}, 'Test Stream', 'test', 'test', true, ${now}, ${now})
        `);

        console.log('[Stream Test] INSERT result:', result);

        // Verify it was inserted
        const verify = await db.execute(sql`
          SELECT * FROM data_stream_registry WHERE stream_id_dsr = ${streamId}
        `);

        console.log('[Stream Test] Verification result:', verify);

        return {
          success: true,
          message: 'Test INSERT successful',
          streamId,
          insertResult: result,
          verifyResult: verify,
        };
      } catch (error) {
        console.error('[Stream Test] Error:', error);
        return {
          success: false,
          message: 'Test INSERT failed',
          error: (error as any).message,
          errorCode: (error as any).code,
          errorState: (error as any).sqlState,
        };
      }
    }),

  /**
   * Test: Check table structure
   */
  checkTableStructure: publicProcedure
    .query(async () => {
      try {
        const result = await db.execute(sql.raw(`
          DESCRIBE data_stream_registry
        `));

        return {
          success: true,
          columns: result,
        };
      } catch (error) {
        return {
          success: false,
          error: (error as any).message,
        };
      }
    }),

  /**
   * Test: Check if table exists
   */
  checkTableExists: publicProcedure
    .query(async () => {
      try {
        const result = await db.execute(sql.raw(`
          SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'data_stream_registry'
        `));

        return {
          success: true,
          exists: (result as any)[0].length > 0,
          result,
        };
      } catch (error) {
        return {
          success: false,
          error: (error as any).message,
        };
      }
    }),
});
