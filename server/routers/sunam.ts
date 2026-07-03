import { router, publicProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getPool } from '../db';

export const sunamRouter = router({
  /**
   * Enrich a proto-form through Sunam gate with explicit transaction
   */
  enrichForm: publicProcedure
    .input(z.object({
      protoFormId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');

        // Get proto-form from staging
        const { rows: protoFormRows } = await client.query(
          `SELECT * FROM forms_registry_staging WHERE id = $1`,
          [input.protoFormId]
        );

        const protoForm = protoFormRows[0];
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
        const { rows: result } = await client.query(
          `INSERT INTO detected_signals (
            signal_type, title, description, severity, confidence, 
            domain, raw_context, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
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
        await client.query('COMMIT');

        return {
          success: true,
          signal_id: result[0]?.id,
          proto_form_id: input.protoFormId,
        };
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (e) {
          console.error('[Sunam] Rollback error:', e);
        }
        console.error('[Sunam] Enrichment failed:', error);
        throw error;
      } finally {
        client.release();
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
      const { rows } = await getPool().query(
        `SELECT enrichment_status, enriched_at FROM forms_registry_staging WHERE id = $1`,
        [input.protoFormId]
      );
      return rows[0] || { status: 'not_found' };
    }),

  /**
   * List all enriched signals
   */
  listSignals: publicProcedure.query(async () => {
    const { rows } = await getPool().query(
      `SELECT id, signal_type, title, severity, confidence, created_at 
       FROM detected_signals 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    return rows || [];
  }),
});
