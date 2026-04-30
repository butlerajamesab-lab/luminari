import { router, publicProcedure } from '../_core/trpc';
import { z } from 'zod';
import { pool } from '../db';

export const sunamRouter = router({
  /**
   * Enrich a proto-form through Sunam gate with explicit transaction
   */
  enrichForm: publicProcedure
    .input(z.object({
      protoFormId: z.string(),
    }))
    .mutation(async ({ input }) => {
      let conn: any;
      try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Get proto-form from staging
        const [protoFormRows] = await conn.query(
          `SELECT * FROM forms_registry_staging WHERE id = ?`,
          [input.protoFormId]
        );

        const protoForm = (protoFormRows as any[])[0];
        if (!protoForm) {
          throw new Error('Proto-form not found');
        }

        // Enrich the form
        const enriched = {
          ...protoForm,
          enrichment_status: 'enriched',
          enriched_at: Date.now(),
        };

        // Insert to detected_signals within transaction
        const [result] = await conn.query(
          `INSERT INTO detected_signals (
            signal_type, title, description, severity, confidence, 
            domain, raw_context, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'FORM_DETECTION',
            enriched.form_name || 'Form',
            JSON.stringify(enriched),
            'medium',
            enriched.confidence_score || 0.5,
            enriched.primary_domain || 'general',
            enriched.raw_context || '',
            Date.now(),
          ]
        );

        // Commit transaction
        await conn.commit();

        return {
          success: true,
          signalId: (result as any).insertId,
          protoFormId: input.protoFormId,
        };
      } catch (error) {
        if (conn) {
          try {
            await conn.rollback();
          } catch (e) {
            console.error('[Sunam] Rollback error:', e);
          }
        }
        console.error('[Sunam] Enrichment failed:', error);
        throw error;
      } finally {
        if (conn) {
          conn.release();
        }
      }
    }),

  /**
   * Get enrichment status for a form
   */
  getStatus: publicProcedure
    .input(z.object({
      protoFormId: z.string(),
    }))
    .query(async ({ input }) => {
      let conn: any;
      try {
        conn = await pool.getConnection();
        const [form] = await conn.query(
          `SELECT enrichment_status, enriched_at FROM forms_registry_staging WHERE id = ?`,
          [input.protoFormId]
        );
        return form || { status: 'not_found' };
      } finally {
        if (conn) conn.release();
      }
    }),

  /**
   * List all enriched signals
   */
  listSignals: publicProcedure.query(async () => {
    let conn: any;
    try {
      conn = await pool.getConnection();
      const [signals] = await conn.query(
        `SELECT id, signal_type, title, severity, confidence, created_at 
         FROM detected_signals 
         ORDER BY created_at DESC 
         LIMIT 100`
      );
      return signals || [];
    } finally {
      if (conn) conn.release();
    }
  }),
});
