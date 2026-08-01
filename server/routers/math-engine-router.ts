/**
 * MATH ENGINE ROUTER
 * 
 * tRPC endpoints exposing the Atlas Mathematical Engine.
 * These are the API surfaces that the frontend (Sovereign Control, Data Streams tab)
 * and Sunam can call to get convergence analysis and viability scoring.
 * 
 * All endpoints return deterministic results. No LLM.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { runConvergenceAnalysis } from "../math/convergence-runner";
import {
  scoreViability,
  compareClaimViability,
  identifyEvidenceGaps,
  computeSOL,
  type ClaimDefinition,
  type EvidenceItem,
} from "../math/viability-engine";
import {
  detectConvergence,
  priorityScore,
  signalFingerprint,
  ENGINE_VERSION,
  type Signal,
} from "../math/atlas-engine";

export const mathEngineRouter = router({
  // ═══════════════════════════════════════════════════════════════
  // CONVERGENCE ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Run full convergence analysis across all geographies.
   * Returns statistically significant convergence zones with priority scores.
   */
  runConvergence: protectedProcedure
    .input(z.object({
      time_window_days: z.number().min(1).max(365).default(7),
      min_signals: z.number().min(1).max(100).default(2),
      significance_threshold: z.number().min(0).max(10).default(2.0),
    }).optional())
    .query(async ({ input }) => {
      const config = input ? {
        time_window_ms: input.time_window_days * 86_400_000,
        min_signals_for_convergence: input.min_signals,
        significance_threshold: input.significance_threshold,
      } : undefined;

      return await runConvergenceAnalysis(config);
    }),

  /**
   * Compute convergence for a specific set of signals (ad-hoc analysis).
   * Useful for Sunam: "check convergence in WA for the last 30 days"
   */
  computeConvergenceManual: protectedProcedure
    .input(z.object({
      geography: z.string(),
      signals: z.array(z.object({
        temporal_coordinate: z.number(),
        spatial_coordinate: z.string(),
        signal_type: z.string(),
        confidence: z.number().min(0).max(1),
        characteristics: z.record(z.union([z.string(), z.number(), z.boolean()])),
      })),
      time_window_ms: z.number().default(7 * 86_400_000),
      total_signals_all_geographies: z.number().default(100),
      total_geographies: z.number().default(50),
    }))
    .query(({ input }) => {
      return detectConvergence({
        geography: input.geography,
        signals: input.signals as Signal[],
        time_window_ms: input.time_window_ms,
        total_signals_all_geographies: input.total_signals_all_geographies,
        total_geographies: input.total_geographies,
      });
    }),

  /**
   * Compute priority score for an action.
   * Used by action queue to rank items.
   */
  computePriority: protectedProcedure
    .input(z.object({
      urgency: z.number().min(0).max(1),
      equity: z.number().min(0).max(1),
      feasibility: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1),
    }))
    .query(({ input }) => {
      const score = priorityScore(input);
      return {
        priority_score: score,
        inputs: input,
        engine_version: ENGINE_VERSION,
      };
    }),

  // ═══════════════════════════════════════════════════════════════
  // VIABILITY SCORING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Score a single claim's viability against evidence.
   */
  scoreClaimViability: protectedProcedure
    .input(z.object({
      claim: z.object({
        claim_type: z.string(),
        jurisdiction: z.string(),
        elements: z.array(z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          mandatory: z.boolean(),
          weight: z.number().min(0).max(1),
        })),
        statute_of_limitations_days: z.number(),
      }),
      evidence: z.array(z.object({
        id: z.string(),
        element_id: z.string(),
        strength: z.number().min(0).max(1),
        source_verified: z.boolean(),
        document_type: z.string(),
      })),
      incident_date: z.number(),
      filing_date: z.number().optional(),
    }))
    .query(({ input }) => {
      return scoreViability({
        claim: input.claim as ClaimDefinition,
        evidence: input.evidence as EvidenceItem[],
        incident_date: input.incident_date,
        filing_date: input.filing_date ?? Date.now(),
      });
    }),

  /**
   * Compare multiple claim types against the same evidence.
   * Returns claims sorted by viability (highest first).
   */
  compareClaimTypes: protectedProcedure
    .input(z.object({
      claims: z.array(z.object({
        claim_type: z.string(),
        jurisdiction: z.string(),
        elements: z.array(z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          mandatory: z.boolean(),
          weight: z.number().min(0).max(1),
        })),
        statute_of_limitations_days: z.number(),
      })),
      evidence: z.array(z.object({
        id: z.string(),
        element_id: z.string(),
        strength: z.number().min(0).max(1),
        source_verified: z.boolean(),
        document_type: z.string(),
      })),
      incident_date: z.number(),
      filing_date: z.number().optional(),
    }))
    .query(({ input }) => {
      return compareClaimViability(
        input.claims as ClaimDefinition[],
        input.evidence as EvidenceItem[],
        input.incident_date,
        input.filing_date ?? Date.now()
      );
    }),

  /**
   * Get evidence gaps for a viability result.
   */
  getEvidenceGaps: protectedProcedure
    .input(z.object({
      claim: z.object({
        claim_type: z.string(),
        jurisdiction: z.string(),
        elements: z.array(z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          mandatory: z.boolean(),
          weight: z.number().min(0).max(1),
        })),
        statute_of_limitations_days: z.number(),
      }),
      evidence: z.array(z.object({
        id: z.string(),
        element_id: z.string(),
        strength: z.number().min(0).max(1),
        source_verified: z.boolean(),
        document_type: z.string(),
      })),
      incident_date: z.number(),
      filing_date: z.number().optional(),
    }))
    .query(({ input }) => {
      const result = scoreViability({
        claim: input.claim as ClaimDefinition,
        evidence: input.evidence as EvidenceItem[],
        incident_date: input.incident_date,
        filing_date: input.filing_date ?? Date.now(),
      });
      return identifyEvidenceGaps(result);
    }),

  /**
   * Check statute of limitations for a claim.
   */
  checkSOL: protectedProcedure
    .input(z.object({
      incident_date: z.number(),
      filing_date: z.number().optional(),
      limit_days: z.number(),
    }))
    .query(({ input }) => {
      return computeSOL(
        input.incident_date,
        input.filing_date ?? Date.now(),
        input.limit_days
      );
    }),

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL UTILITIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Compute a signal fingerprint (for dedup verification).
   */
  computeFingerprint: protectedProcedure
    .input(z.object({
      temporal_coordinate: z.number(),
      spatial_coordinate: z.string(),
      signal_type: z.string(),
      confidence: z.number(),
      characteristics: z.record(z.union([z.string(), z.number(), z.boolean()])),
      temporal_bucket_ms: z.number().optional(),
    }))
    .query(({ input }) => {
      const signal: Signal = {
        temporal_coordinate: input.temporal_coordinate,
        spatial_coordinate: input.spatial_coordinate,
        signal_type: input.signal_type,
        confidence: input.confidence,
        characteristics: input.characteristics,
      };
      return {
        fingerprint: signalFingerprint(signal, input.temporal_bucket_ms),
        engine_version: ENGINE_VERSION,
      };
    }),

  /**
   * Get engine version and capabilities.
   */
  getEngineInfo: protectedProcedure
    .query(() => ({
      atlas_engine_version: ENGINE_VERSION,
      capabilities: [
        "convergence_detection",
        "priority_scoring",
        "signal_fingerprinting",
        "signal_linking",
        "geographic_normalization",
        "viability_scoring",
        "element_satisfaction",
        "sol_computation",
        "evidence_gap_analysis",
        "claim_comparison",
      ],
      deterministic: true,
      llm_free: true,
    })),
});
