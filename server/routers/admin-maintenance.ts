/**
 * Admin Maintenance Router
 * 
 * Minimal, permanent endpoints for database maintenance.
 * All changes are persistent.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";

export const adminMaintenanceRouter = router({
  /**
   * Backfill confidence scores for signals with NULL or 0 values.
   * This is a one-time operation that permanently updates the database.
   */
  backfillConfidenceScores: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user?.role !== 'admin') {
        throw new Error('Admin access required');
      }

      try {
        // Update confidence scores based on severity and status
        await db.execute(sql.raw(`
          UPDATE detected_signals
          SET confidence_score = CASE
            WHEN severity_level = 'critical' THEN 75
            WHEN severity_level = 'high' THEN 65
            WHEN severity_level = 'medium' THEN 55
            WHEN severity_level = 'low' THEN 45
            ELSE 50
          END +
          CASE
            WHEN escalation_status = 'escalated' THEN 20
            WHEN escalation_status = 'pending' THEN 0
            ELSE 0
          END +
          CASE
            WHEN sunam_status = 'approved' THEN 15
            WHEN sunam_status = 'pending' THEN 0
            WHEN sunam_status = 'rejected' THEN -30
            ELSE 0
          END
          WHERE confidence_score IS NULL OR confidence_score = 0
        `));

        // Clamp to 0-100
        await db.execute(sql.raw(`UPDATE detected_signals SET confidence_score = 100 WHERE confidence_score > 100`));
        await db.execute(sql.raw(`UPDATE detected_signals SET confidence_score = 0 WHERE confidence_score < 0`));

        // Get stats
        const stats = await db.execute(sql.raw(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN confidence_score >= 85 THEN 1 END) as high,
            COUNT(CASE WHEN confidence_score >= 70 AND confidence_score < 85 THEN 1 END) as medium_high,
            COUNT(CASE WHEN confidence_score >= 50 AND confidence_score < 70 THEN 1 END) as medium,
            COUNT(CASE WHEN confidence_score < 50 THEN 1 END) as low,
            ROUND(AVG(confidence_score), 1) as avg_score
          FROM detected_signals
        `));

        const s = (stats as any)[0][0];

        return {
          success: true,
          message: 'Confidence scores backfilled permanently',
          stats: {
            total: s.total,
            high: s.high,
            medium_high: s.medium_high,
            medium: s.medium,
            low: s.low,
            avg_score: s.avg_score,
          },
        };
      } catch (error) {
        console.error('[Backfill] Error:', error);
        throw error;
      }
    }),

  /**
   * Check current confidence score statistics
   */
  checkConfidenceStats: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user?.role !== 'admin') {
        throw new Error('Admin access required');
      }

      const stats = await db.execute(sql.raw(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN confidence_score > 0 THEN 1 END) as with_score,
          COUNT(CASE WHEN confidence_score IS NULL THEN 1 END) as null_scores,
          COUNT(CASE WHEN confidence_score = 0 THEN 1 END) as zero_scores,
          COUNT(CASE WHEN confidence_score >= 85 THEN 1 END) as high,
          COUNT(CASE WHEN confidence_score >= 70 AND confidence_score < 85 THEN 1 END) as medium_high,
          COUNT(CASE WHEN confidence_score >= 50 AND confidence_score < 70 THEN 1 END) as medium,
          COUNT(CASE WHEN confidence_score < 50 THEN 1 END) as low,
          MIN(confidence_score) as min_score,
          MAX(confidence_score) as max_score,
          ROUND(AVG(confidence_score), 1) as avg_score
        FROM detected_signals
      `));

      const s = (stats as any)[0][0];

      return {
        total: s.total,
        with_score: s.with_score,
        null_scores: s.null_scores,
        zero_scores: s.zero_scores,
        distribution: {
          high: s.high,
          medium_high: s.medium_high,
          medium: s.medium,
          low: s.low,
        },
        range: {
          min: s.min_score,
          max: s.max_score,
          avg: s.avg_score,
        },
      };
    }),
});
