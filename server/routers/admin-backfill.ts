/**
 * Admin Backfill Router
 * 
 * Provides admin endpoints for data backfill operations.
 * Protected by admin role check.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Calculate confidence score based on signal characteristics
 */
function calculateConfidenceScore(signal: any): number {
  let score = 50; // Base score

  // Severity adjustment
  if (signal.severity_level === 'critical') score += 25;
  else if (signal.severity_level === 'high') score += 15;
  else if (signal.severity_level === 'medium') score += 5;

  // Escalation adjustment
  if (signal.escalation_status === 'escalated') score += 20;
  else if (signal.escalation_status === 'pending') score += 0;

  // Sunam status adjustment
  if (signal.sunam_status === 'approved') score += 15;
  else if (signal.sunam_status === 'pending') score += 0;
  else if (signal.sunam_status === 'rejected') score = Math.max(0, score - 30);

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

export const adminBackfillRouter = router({
  /**
   * Backfill confidence scores for signals with NULL or 0 values
   */
  backfillConfidenceScores: protectedProcedure
    .query(async ({ ctx }) => {
      // Admin check
      if (ctx.user?.role !== 'admin') {
        throw new Error('Admin access required');
      }

      try {
        // Get all signals with NULL or 0 confidence_score
        const signals = await db.execute(
          sql.raw(`
            SELECT 
              signal_id,
              severity_level,
              escalation_status,
              sunam_status,
              confidence_score
            FROM detected_signals
            WHERE confidence_score IS NULL OR confidence_score = 0
            ORDER BY created_at DESC
          `)
        );

        const signalList = (signals as any)[0] || [];
        console.log(`[Backfill] Found ${signalList.length} signals to backfill`);

        let updated = 0;
        for (const signal of signalList) {
          const newScore = calculateConfidenceScore(signal);
          
          await db.execute(
            sql.raw(
              `UPDATE detected_signals SET confidence_score = ? WHERE signal_id = ?`,
              [newScore, signal.signal_id]
            )
          );

          updated++;
          if (updated % 10 === 0) {
            console.log(`[Backfill] Updated ${updated}/${signalList.length} signals...`);
          }
        }

        console.log(`[Backfill] Complete! Updated ${updated} signals`);

        // Get distribution
        const distribution = await db.execute(
          sql.raw(`
            SELECT 
              COUNT(*) as total,
              COUNT(CASE WHEN confidence_score >= 85 THEN 1 END) as high_confidence,
              COUNT(CASE WHEN confidence_score >= 70 AND confidence_score < 85 THEN 1 END) as medium_high,
              COUNT(CASE WHEN confidence_score >= 50 AND confidence_score < 70 THEN 1 END) as medium,
              COUNT(CASE WHEN confidence_score < 50 THEN 1 END) as low_confidence,
              AVG(confidence_score) as avg_score,
              MIN(confidence_score) as min_score,
              MAX(confidence_score) as max_score
            FROM detected_signals
          `)
        );

        const dist = (distribution as any)[0][0];

        return {
          success: true,
          updated,
          distribution: {
            total: dist.total,
            high: dist.high_confidence,
            mediumHigh: dist.medium_high,
            medium: dist.medium,
            low: dist.low_confidence,
            avgScore: parseFloat(dist.avg_score || 0).toFixed(1),
            minScore: dist.min_score,
            maxScore: dist.max_score,
          },
        };
      } catch (error) {
        console.error('[Backfill] Error:', error);
        throw error;
      }
    }),

  /**
   * Get signal confidence score statistics
   */
  getConfidenceStats: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user?.role !== 'admin') {
        throw new Error('Admin access required');
      }

      const stats = await db.execute(
        sql.raw(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN confidence_score >= 85 THEN 1 END) as high_confidence,
            COUNT(CASE WHEN confidence_score >= 70 AND confidence_score < 85 THEN 1 END) as medium_high,
            COUNT(CASE WHEN confidence_score >= 50 AND confidence_score < 70 THEN 1 END) as medium,
            COUNT(CASE WHEN confidence_score < 50 THEN 1 END) as low_confidence,
            COUNT(CASE WHEN confidence_score IS NULL OR confidence_score = 0 THEN 1 END) as null_or_zero,
            AVG(confidence_score) as avg_score,
            MIN(confidence_score) as min_score,
            MAX(confidence_score) as max_score
          FROM detected_signals
        `)
      );

      const s = (stats as any)[0][0];

      return {
        total: s.total,
        high: s.high_confidence,
        mediumHigh: s.medium_high,
        medium: s.medium,
        low: s.low_confidence,
        nullOrZero: s.null_or_zero,
        avgScore: parseFloat(s.avg_score || 0).toFixed(1),
        minScore: s.min_score,
        maxScore: s.max_score,
      };
    }),
});
