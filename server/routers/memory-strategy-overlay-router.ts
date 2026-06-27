/**
 * Memory-Informed Strategy Overlay Router
 *
 * Surfaces Memory Engine data at the point of strategy decision:
 * - Historical guidance for a given pattern/jurisdiction
 * - Strategy comparison (current vs memory-informed alternatives)
 * - Mission Control memory metrics widget data
 * - Remedy-level memory context
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Reliability helpers ──────────────────────────────────────────────────

export function reliabilityLevel(sampleSize: number): "high" | "medium" | "low" {
  if (sampleSize > 15) return "high";
  if (sampleSize >= 5) return "medium";
  return "low";
}

export function reliabilityLabel(sampleSize: number): string {
  const level = reliabilityLevel(sampleSize);
  if (level === "high") return "High reliability";
  if (level === "medium") return "Medium reliability";
  return "Low reliability — limited data";
}

// ── Types ────────────────────────────────────────────────────────────────

export interface HistoricalRecommendation {
  strategyId: string;
  strategyName: string;
  successRate: number;
  avgTimeToImpact: number;
  avgCost: number;
  avgSignalReduction: number;
  sampleSize: number;
  jurisdiction: string;
  confidenceScore: number;
  reliability: "high" | "medium" | "low";
  reliabilityLabel: string;
  recommendation: string;
}

export interface StrategyComparison {
  currentStrategy: {
    strategyId: string;
    strategyName: string;
    successProbability: number;
    estimatedCost: number | null;
    confidenceScore: number;
  };
  memoryAlternatives: HistoricalRecommendation[];
  recommendedByEngine: boolean;
  supportedByMemory: boolean;
  memoryRank: number | null;
  conflictFlag: boolean;
  conflictMessage: string | null;
}

// ── Router ───────────────────────────────────────────────────────────────

export const memoryStrategyOverlayRouter = router({
  /**
   * T1: Historical Guidance — top recommendations for a pattern type + optional jurisdiction
   */
  historicalGuidance: protectedProcedure
    .input(z.object({
      patternType: z.string(),
      jurisdiction: z.string().optional(),
      claimType: z.string().optional(),
      limit: z.number().optional().default(5),
    }))
    .query(async ({ input }) => {
      const { patternType, jurisdiction, claimType, limit } = input;

      // Build dynamic query
      let q = sql`
        SELECT sms.strategy_id, sms.avg_success_score, sms.avg_cost,
               sms.avg_time_to_impact, sms.success_rate, sms.sample_size,
               sms.jurisdiction, sms.claim_type,
               COALESCE(sr.strategy_name, sms.strategy_id) AS strategy_name,
               sr.historical_success_rate AS registry_success_rate
        FROM strategy_memory_summary sms
        LEFT JOIN strategy_registry sr ON sms.strategy_id = sr.strategy_id
        WHERE sms.pattern_type = ${patternType}
      `;

      if (jurisdiction) {
        q = sql`${q} AND (sms.jurisdiction = ${jurisdiction} OR sms.jurisdiction = '' OR sms.jurisdiction IS NULL)`;
      }
      if (claimType) {
        q = sql`${q} AND (sms.claim_type = ${claimType} OR sms.claim_type = '' OR sms.claim_type IS NULL)`;
      }

      q = sql`${q} ORDER BY sms.avg_success_score DESC LIMIT ${limit}`;

      const [rows] = await db.execute(q);

      const recommendations: HistoricalRecommendation[] = (rows as unknown as any[]).map(r => {
        const sampleSize = Number(r.sample_size) || 0;
        const avgSuccessScore = Number(r.avg_success_score) || 0;
        return {
          strategy_id: r.strategy_id,
          strategy_name: r.strategy_name || r.strategy_id,
          success_rate: Number(r.success_rate) || 0,
          avg_time_to_impact: Number(r.avg_time_to_impact) || 0,
          avg_cost: Number(r.avg_cost) || 0,
          avg_signal_reduction: avgSuccessScore, // success score approximates signal reduction
          sampleSize,
          jurisdiction: r.jurisdiction || "all",
          confidence_score: avgSuccessScore,
          reliability: reliabilityLevel(sampleSize),
          reliability_label: reliabilityLabel(sampleSize),
          recommendation: avgSuccessScore >= 70 ? "highly_recommended"
            : avgSuccessScore >= 50 ? "recommended"
            : avgSuccessScore >= 30 ? "use_with_caution"
            : "not_recommended",
        };
      });

      return { recommendations, patternType, jurisdiction: jurisdiction || "all" };
    }),

  /**
   * T2: Strategy Comparison — compare current strategy path against memory alternatives
   */
  compareStrategy: protectedProcedure
    .input(z.object({
      pathId: z.string(),
    }))
    .query(async ({ input }) => {
      // Get current strategy path details
      const [pathRows] = await db.execute(sql`
        SELECT sp.*, sr.strategy_name, sr.strategy_type, sr.historical_success_rate,
               pr.pattern_type, pr.confidence_score AS pattern_confidence
        FROM sys_strategy_paths sp
        JOIN strategy_registry sr ON sp.strategy_id = sr.strategy_id
        LEFT JOIN pattern_registry pr ON sp.pattern_id = pr.pattern_id
        WHERE sp.path_id = ${input.pathId}
      `);

      const path = (pathRows as unknown as any[])[0];
      if (!path) {
        // @ts-expect-error pre-existing type mismatch
        return {
          current_strategy: null,
          memory_alternatives: [],
          recommended_by_engine: false,
          supported_by_memory: false,
          memory_rank: null,
          conflict_flag: false,
          conflict_message: null,
        } as StrategyComparison;
      }

      const patternType = path.pattern_type || "";

      // Get memory alternatives
      const [memRows] = await db.execute(sql`
        SELECT sms.strategy_id, sms.avg_success_score, sms.avg_cost,
               sms.avg_time_to_impact, sms.success_rate, sms.sample_size,
               sms.jurisdiction,
               COALESCE(sr.strategy_name, sms.strategy_id) AS strategy_name
        FROM strategy_memory_summary sms
        LEFT JOIN strategy_registry sr ON sms.strategy_id = sr.strategy_id
        WHERE sms.pattern_type = ${patternType}
        ORDER BY sms.avg_success_score DESC
        LIMIT 10
      `);

      const memoryAlternatives: HistoricalRecommendation[] = (memRows as unknown as any[]).map(r => {
        const sampleSize = Number(r.sample_size) || 0;
        const avgSuccessScore = Number(r.avg_success_score) || 0;
        return {
          strategy_id: r.strategy_id,
          strategy_name: r.strategy_name || r.strategy_id,
          success_rate: Number(r.success_rate) || 0,
          avg_time_to_impact: Number(r.avg_time_to_impact) || 0,
          avg_cost: Number(r.avg_cost) || 0,
          avg_signal_reduction: avgSuccessScore,
          sampleSize,
          jurisdiction: r.jurisdiction || "all",
          confidence_score: avgSuccessScore,
          reliability: reliabilityLevel(sampleSize),
          reliability_label: reliabilityLabel(sampleSize),
          recommendation: avgSuccessScore >= 70 ? "highly_recommended"
            : avgSuccessScore >= 50 ? "recommended"
            : avgSuccessScore >= 30 ? "use_with_caution"
            : "not_recommended",
        };
      });

      // Determine if current strategy is in memory and its rank
      const currentIdx = memoryAlternatives.findIndex(a => a.strategyId === path.strategy_id);
      const memoryRank = currentIdx >= 0 ? currentIdx + 1 : null;
      const topMemory = memoryAlternatives[0];

      const supportedByMemory = memoryRank !== null && memoryRank <= 3;
      const conflictFlag = topMemory && memoryRank !== null && memoryRank > 1 && topMemory.sampleSize >= 5;
      const conflictMessage = conflictFlag
        ? `This strategy is valid, but historical data suggests "${topMemory.strategyName}" has performed better in similar cases (${topMemory.successRate}% success rate, ${topMemory.sampleSize} cases).`
        : null;

      return {
        current_strategy: {
          strategy_id: path.strategy_id,
          strategy_name: path.strategy_name,
          success_probability: Number(path.success_probability) || 0,
          estimated_cost: path.estimated_cost ? Number(path.estimated_cost) : null,
          confidence_score: Number(path.pattern_confidence) || 0,
        },
        memoryAlternatives,
        recommended_by_engine: true,
        supportedByMemory,
        memoryRank,
        conflict_flag: !!conflictFlag,
        conflictMessage,
      } as StrategyComparison;
    }),

  /**
   * T3: Remedy Memory Context — memory-informed data for remedy generation
   */
  remedyContext: protectedProcedure
    .input(z.object({
      patternType: z.string(),
      jurisdiction: z.string().optional(),
      claimType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { patternType, jurisdiction, claimType } = input;

      // Best-performing strategies for this pattern
      let stratQ = sql`
        SELECT sms.strategy_id, sms.avg_success_score, sms.avg_cost,
               sms.success_rate, sms.sample_size, sms.jurisdiction,
               COALESCE(sr.strategy_name, sms.strategy_id) AS strategy_name
        FROM strategy_memory_summary sms
        LEFT JOIN strategy_registry sr ON sms.strategy_id = sr.strategy_id
        WHERE sms.pattern_type = ${patternType}
      `;
      if (jurisdiction) {
        stratQ = sql`${stratQ} AND (sms.jurisdiction = ${jurisdiction} OR sms.jurisdiction = '' OR sms.jurisdiction IS NULL)`;
      }
      stratQ = sql`${stratQ} ORDER BY sms.avg_success_score DESC LIMIT 3`;
      const [stratRows] = await db.execute(stratQ);

      // Jurisdiction effectiveness comparison
      const [jurisRows] = await db.execute(sql`
        SELECT sms.jurisdiction, AVG(sms.avg_success_score) AS avg_score,
               SUM(sms.sample_size) AS total_samples,
               AVG(sms.avg_cost) AS avg_cost
        FROM strategy_memory_summary sms
        WHERE sms.pattern_type = ${patternType}
          AND sms.jurisdiction IS NOT NULL AND sms.jurisdiction != ''
        GROUP BY sms.jurisdiction
        ORDER BY avg_score DESC
        LIMIT 5
      `);

      return {
        top_strategies: (stratRows as unknown as any[]).map(r => ({
          strategy_id: r.strategy_id,
          strategy_name: r.strategy_name,
          success_rate: Number(r.success_rate) || 0,
          avg_cost: Number(r.avg_cost) || 0,
          sample_size: Number(r.sample_size) || 0,
          reliability: reliabilityLevel(Number(r.sample_size) || 0),
        })),
        jurisdiction_comparison: (jurisRows as unknown as any[]).map(r => ({
          jurisdiction: r.jurisdiction,
          avg_score: Number(r.avg_score) || 0,
          total_samples: Number(r.total_samples) || 0,
          avg_cost: Number(r.avg_cost) || 0,
          reliability: reliabilityLevel(Number(r.total_samples) || 0),
        })),
      };
    }),

  /**
   * T4: Mission Control Memory Metrics Widget
   */
  missionControlMetrics: protectedProcedure.query(async () => {
    // Most successful strategies by pattern type
    const [topByPatternRows] = await db.execute(sql`
      SELECT sms.pattern_type, sms.strategy_id,
             COALESCE(sr.strategy_name, sms.strategy_id) AS strategy_name,
             sms.avg_success_score, sms.success_rate, sms.sample_size
      FROM strategy_memory_summary sms
      LEFT JOIN strategy_registry sr ON sms.strategy_id = sr.strategy_id
      WHERE sms.sample_size >= 3
      ORDER BY sms.avg_success_score DESC
      LIMIT 10
    `);

    // Top jurisdictions by success rate
    const [topJurisRows] = await db.execute(sql`
      SELECT jurisdiction, AVG(avg_success_score) AS avg_score,
             SUM(sample_size) AS total_samples
      FROM strategy_memory_summary
      WHERE jurisdiction IS NOT NULL AND jurisdiction != ''
        AND sample_size >= 3
      GROUP BY jurisdiction
      ORDER BY avg_score DESC
      LIMIT 8
    `);

    // Declining strategies (low success, some data)
    const [decliningRows] = await db.execute(sql`
      SELECT sms.strategy_id,
             COALESCE(sr.strategy_name, sms.strategy_id) AS strategy_name,
             sms.pattern_type, sms.avg_success_score, sms.success_rate, sms.sample_size
      FROM strategy_memory_summary sms
      LEFT JOIN strategy_registry sr ON sms.strategy_id = sr.strategy_id
      WHERE sms.avg_success_score < 40 AND sms.sample_size >= 3
      ORDER BY sms.avg_success_score ASC
      LIMIT 5
    `);

    // Low-confidence recommendations needing analyst review (sample < 5 but some data)
    const [lowConfRows] = await db.execute(sql`
      SELECT sms.strategy_id,
             COALESCE(sr.strategy_name, sms.strategy_id) AS strategy_name,
             sms.pattern_type, sms.avg_success_score, sms.sample_size, sms.jurisdiction
      FROM strategy_memory_summary sms
      LEFT JOIN strategy_registry sr ON sms.strategy_id = sr.strategy_id
      WHERE sms.sample_size < 5 AND sms.sample_size >= 1
      ORDER BY sms.sample_size ASC, sms.avg_success_score DESC
      LIMIT 8
    `);

    // Aggregate totals
    const [totalRows] = await db.execute(sql`
      SELECT COUNT(*) AS total_summaries,
             SUM(sample_size) AS total_memories,
             AVG(avg_success_score) AS overall_avg
      FROM strategy_memory_summary
    `);
    const totals = (totalRows as unknown as any[])[0] || {};

    return {
      total_summaries: Number(totals.total_summaries) || 0,
      total_memories: Number(totals.total_memories) || 0,
      overall_avg_score: Number(totals.overall_avg) || 0,
      top_strategies_by_pattern: (topByPatternRows as unknown as any[]).map(r => ({
        pattern_type: r.pattern_type,
        strategy_id: r.strategy_id,
        strategy_name: r.strategy_name,
        avg_success_score: Number(r.avg_success_score) || 0,
        success_rate: Number(r.success_rate) || 0,
        sample_size: Number(r.sample_size) || 0,
        reliability: reliabilityLevel(Number(r.sample_size) || 0),
      })),
      top_jurisdictions: (topJurisRows as unknown as any[]).map(r => ({
        jurisdiction: r.jurisdiction,
        avg_score: Number(r.avg_score) || 0,
        total_samples: Number(r.total_samples) || 0,
        reliability: reliabilityLevel(Number(r.total_samples) || 0),
      })),
      declining_strategies: (decliningRows as unknown as any[]).map(r => ({
        strategy_id: r.strategy_id,
        strategy_name: r.strategy_name,
        pattern_type: r.pattern_type,
        avg_success_score: Number(r.avg_success_score) || 0,
        success_rate: Number(r.success_rate) || 0,
        sample_size: Number(r.sample_size) || 0,
      })),
      low_confidence_recommendations: (lowConfRows as unknown as any[]).map(r => ({
        strategy_id: r.strategy_id,
        strategy_name: r.strategy_name,
        pattern_type: r.pattern_type,
        avg_success_score: Number(r.avg_success_score) || 0,
        sample_size: Number(r.sample_size) || 0,
        jurisdiction: r.jurisdiction || "all",
        reliability: "low" as const,
      })),
    };
  }),

  /**
   * T5: Apply memory-informed strategy — analyst picks a historical alternative
   */
  applyHistoricalStrategy: protectedProcedure
    .input(z.object({
      pathId: z.string(),
      newStrategyId: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Update the strategy path to use the memory-informed alternative
      await db.execute(sql`
        UPDATE sys_strategy_paths
        SET strategy_id = ${input.newStrategyId},
            updated_at = NOW()
        WHERE path_id = ${input.pathId}
      `);
      return { success: true, path_id: input.pathId, new_strategy_id: input.newStrategyId };
    }),
});
