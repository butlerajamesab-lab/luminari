/**
 * PHOENIX ROUTER
 * 
 * Real-time fraud detection endpoints
 * Monitors entity rebirth patterns and emits detection signals
 */

import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { db } from '../db';
import { detectedSignals } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import mysql from 'mysql2/promise';

/**
 * Get Phoenix signals (entity rebirth detections)
 */
export const getPhoenixSignals = protectedProcedure
  .query(async () => {
    try {
      const signals = await db.select().from(detectedSignals)
        .where(eq(detectedSignals.signalType, 'PHOENIX_ENTITY'))
        .orderBy((t) => [t.createdAt]);
      
      return {
        success: true,
        count: signals.length,
        signals: signals.map(s => ({
          signalId: s.signalId,
          entityId: s.entityId,
          confidenceScore: s.confidenceScore,
          explanation: s.plainLanguageExplanation,
          severity: s.severityLevel,
          createdAt: s.createdAt,
        })),
      };
    } catch (error) {
      console.error('[Phoenix] Query error:', error);
      return {
        success: false,
        error: String(error),
        signals: [],
      };
    }
  });

/**
 * Get Phoenix signal by ID
 */
export const getPhoenixSignal = protectedProcedure
  .input(z.object({ signalId: z.string() }))
  .query(async ({ input }) => {
    try {
      const [signal] = await db.select().from(detectedSignals)
        .where(eq(detectedSignals.signalId, input.signalId));
      
      if (!signal) {
        return { success: false, error: 'Signal not found' };
      }

      return {
        success: true,
        signal: {
          signalId: signal.signalId,
          signalType: signal.signalType,
          entityId: signal.entityId,
          confidenceScore: signal.confidenceScore,
          severityLevel: signal.severityLevel,
          explanation: signal.plainLanguageExplanation,
          escalationStatus: signal.escalationStatus,
          affectedEntities: signal.affectedEntities,
          createdAt: signal.createdAt,
          updatedAt: signal.updatedAt,
        },
      };
    } catch (error) {
      console.error('[Phoenix] Query error:', error);
      return { success: false, error: String(error) };
    }
  });

/**
 * Get Phoenix detection stats
 */
export const getPhoenixStats = protectedProcedure
  .query(async () => {
    try {
      const pool = mysql.createPool({
        host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
        port: 4000,
        user: '2jhK1AfHyk6mXSq.root',
        password: '2k5Lq94U8voiLkatA3uZ',
        database: 'luminari_registry',
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
      });

      const query = `
        SELECT 
          COUNT(*) as total_signals,
          AVG(confidence_score) as avg_confidence,
          MAX(confidence_score) as max_confidence,
          MIN(confidence_score) as min_confidence,
          SUM(CASE WHEN confidence_score >= 85 THEN 1 ELSE 0 END) as high_confidence_count,
          SUM(CASE WHEN severity_level = 'critical' THEN 1 ELSE 0 END) as critical_count,
          SUM(CASE WHEN severity_level = 'high' THEN 1 ELSE 0 END) as high_count,
          SUM(CASE WHEN severity_level = 'medium' THEN 1 ELSE 0 END) as medium_count,
          SUM(CASE WHEN severity_level = 'low' THEN 1 ELSE 0 END) as low_count
        FROM detected_signals
        WHERE signal_type = 'PHOENIX_ENTITY'
      `;

      const [rows] = await pool.execute(query);
      const stats = (rows as any[])[0] || {};

      pool.end();

      return {
        success: true,
        stats: {
          totalSignals: stats.total_signals || 0,
          avgConfidence: Math.round((stats.avg_confidence || 0) * 100) / 100,
          maxConfidence: stats.max_confidence || 0,
          minConfidence: stats.min_confidence || 0,
          highConfidenceCount: stats.high_confidence_count || 0,
          bySeverity: {
            critical: stats.critical_count || 0,
            high: stats.high_count || 0,
            medium: stats.medium_count || 0,
            low: stats.low_count || 0,
          },
        },
      };
    } catch (error) {
      console.error('[Phoenix] Stats query error:', error);
      return {
        success: false,
        error: String(error),
        stats: {},
      };
    }
  });

/**
 * Approve Phoenix signal (promote to enforcement)
 */
export const approvePhoenixSignal = protectedProcedure
  .input(z.object({ 
    signalId: z.string(),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    try {
      await db.update(detectedSignals)
        .set({
          escalationStatus: 'enforcement_escalation',
          reviewedBy: ctx.user?.email || 'system',
          reviewNotes: input.notes || 'Approved by analyst',
          updatedAt: Date.now(),
        })
        .where(eq(detectedSignals.signalId, input.signalId));

      return {
        success: true,
        message: 'Signal approved and escalated',
      };
    } catch (error) {
      console.error('[Phoenix] Approval error:', error);
      return {
        success: false,
        error: String(error),
      };
    }
  });

/**
 * Reject Phoenix signal
 */
export const rejectPhoenixSignal = protectedProcedure
  .input(z.object({ 
    signalId: z.string(),
    reason: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    try {
      await db.update(detectedSignals)
        .set({
          escalationStatus: 'monitoring_only',
          reviewedBy: ctx.user?.email || 'system',
          reviewNotes: `Rejected: ${input.reason}`,
          updatedAt: Date.now(),
        })
        .where(eq(detectedSignals.signalId, input.signalId));

      return {
        success: true,
        message: 'Signal rejected',
      };
    } catch (error) {
      console.error('[Phoenix] Rejection error:', error);
      return {
        success: false,
        error: String(error),
      };
    }
  });

/**
 * Get Phoenix detection timeline
 */
export const getPhoenixTimeline = protectedProcedure
  .query(async () => {
    try {
      const signals = await db.select().from(detectedSignals)
        .where(eq(detectedSignals.signalType, 'PHOENIX_ENTITY'))
        .orderBy((t) => [t.createdAt]);

      // Group by date
      const timeline: { [key: string]: number } = {};
      signals.forEach(s => {
        const date = new Date(s.createdAt).toISOString().split('T')[0];
        timeline[date] = (timeline[date] || 0) + 1;
      });

      return {
        success: true,
        timeline: Object.entries(timeline).map(([date, count]) => ({
          date,
          detections: count,
        })),
      };
    } catch (error) {
      console.error('[Phoenix] Timeline error:', error);
      return {
        success: false,
        error: String(error),
        timeline: [],
      };
    }
  });

export const phoenixRouter = router({
  getPhoenixSignals,
  getPhoenixSignal,
  getPhoenixStats,
  approvePhoenixSignal,
  rejectPhoenixSignal,
  getPhoenixTimeline,
});
