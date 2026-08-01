/**
 * MATH ENGINE ROUTER v2.0.0
 *
 * tRPC endpoints exposing the Atlas Mathematical Engine.
 * ADMIN-GATED — all procedures require administrator authentication.
 *
 * REPAIR NOTES:
 *   - All procedures use adminProcedure (not protectedProcedure)
 *   - as_of is required input (no Date.now() fallback)
 *   - Viability endpoints accept governed record IDs and resolve from canonical sources
 *   - Manual convergence does NOT accept caller-invented population baselines
 *   - No p-value language in responses
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
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
  signalFingerprint,
  haversineDistance,
  validatePartitionOfUnity,
  type Signal,
  ENGINE_VERSION,
} from "../math/atlas-engine";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ============================================================
// ROUTER — ALL ADMIN-GATED
// ============================================================

export const mathEngineRouter = router({
  // ═══════════════════════════════════════════════════════════════
  // CONVERGENCE ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Run full convergence analysis across all geographies.
   * Requires explicit as_of timestamp.
   * Loads geography_registry from canonical source.
   * Does NOT accept caller-invented population baselines.
   */
  runConvergence: adminProcedure
    .input(z.object({
      as_of: z.number().describe("Explicit timestamp for analysis (Unix ms)"),
      time_window_ms: z.number().default(7 * 86_400_000),
      temporal_bucket_ms: z.number().default(86_400_000),
      min_signals_for_analysis: z.number().default(2),
      z_score_threshold: z.number().default(2.0),
    }))
    .query(async ({ input }) => {
      return runConvergenceAnalysis({
        as_of: input.as_of,
        time_window_ms: input.time_window_ms,
        temporal_bucket_ms: input.temporal_bucket_ms,
        min_signals_for_analysis: input.min_signals_for_analysis,
        z_score_threshold: input.z_score_threshold,
      });
    }),

  // ═══════════════════════════════════════════════════════════════
  // VIABILITY SCORING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Score viability using governed record identifiers.
   * Resolves claim definition from canonical tables.
   * Resolves evidence from case_evidence table.
   */
  scoreByRecordIds: adminProcedure
    .input(z.object({
      claim_definition_id: z.string().describe("Canonical claim definition ID"),
      case_id: z.string().describe("Case record ID for evidence lookup"),
      incident_date: z.number().describe("Incident date (Unix ms)"),
      filing_date: z.number().describe("Filing date (Unix ms) — explicit, not now()"),
    }))
    .query(async ({ input }) => {
      // Resolve claim definition from canonical source
      const claimRows = await db.execute(sql`
        SELECT id, claim_type, jurisdiction, elements, statute_of_limitations_days
        FROM claim_definitions
        WHERE id = ${input.claim_definition_id}
        LIMIT 1
      `);

      if (!claimRows.rows || claimRows.rows.length === 0) {
        return { error: `Claim definition '${input.claim_definition_id}' not found in canonical source` };
      }

      const row = claimRows.rows[0] as any;
      const claim: ClaimDefinition = {
        claim_type: row.claim_type,
        jurisdiction: row.jurisdiction,
        elements: typeof row.elements === "string" ? JSON.parse(row.elements) : row.elements,
        statute_of_limitations_days: row.statute_of_limitations_days,
        source_id: row.id,
      };

      // Resolve evidence from case records
      const evidenceRows = await db.execute(sql`
        SELECT id, element_id, strength, source_verified, document_type
        FROM case_evidence
        WHERE case_id = ${input.case_id}
      `);

      const evidence: EvidenceItem[] = (evidenceRows.rows || []).map((r: any) => ({
        id: r.id,
        element_id: r.element_id,
        strength: parseFloat(r.strength),
        source_verified: r.source_verified === true,
        document_type: r.document_type,
      }));

      return scoreViability({
        claim,
        evidence,
        incident_date: input.incident_date,
        filing_date: input.filing_date,
      });
    }),

  /**
   * Score viability with pre-resolved inputs (admin testing only).
   * filing_date is REQUIRED — no Date.now() fallback.
   */
  scoreDirect: adminProcedure
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
        source_id: z.string().optional(),
      }),
      evidence: z.array(z.object({
        id: z.string(),
        element_id: z.string(),
        strength: z.number().min(0).max(1),
        source_verified: z.boolean(),
        document_type: z.string(),
      })),
      incident_date: z.number(),
      filing_date: z.number().describe("REQUIRED — explicit filing date"),
    }))
    .query(({ input }) => {
      return scoreViability({
        claim: input.claim as ClaimDefinition,
        evidence: input.evidence as EvidenceItem[],
        incident_date: input.incident_date,
        filing_date: input.filing_date,
      });
    }),

  /**
   * Compare multiple claim types against the same evidence.
   */
  compareClaimTypes: adminProcedure
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
        source_id: z.string().optional(),
      })),
      evidence: z.array(z.object({
        id: z.string(),
        element_id: z.string(),
        strength: z.number().min(0).max(1),
        source_verified: z.boolean(),
        document_type: z.string(),
      })),
      incident_date: z.number(),
      filing_date: z.number().describe("REQUIRED — explicit filing date"),
    }))
    .query(({ input }) => {
      return compareClaimViability(
        input.claims as ClaimDefinition[],
        input.evidence as EvidenceItem[],
        input.incident_date,
        input.filing_date
      );
    }),

  /**
   * Get evidence gaps.
   */
  getEvidenceGaps: adminProcedure
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
        source_id: z.string().optional(),
      }),
      evidence: z.array(z.object({
        id: z.string(),
        element_id: z.string(),
        strength: z.number().min(0).max(1),
        source_verified: z.boolean(),
        document_type: z.string(),
      })),
      incident_date: z.number(),
      filing_date: z.number().describe("REQUIRED — explicit filing date"),
    }))
    .query(({ input }) => {
      const result = scoreViability({
        claim: input.claim as ClaimDefinition,
        evidence: input.evidence as EvidenceItem[],
        incident_date: input.incident_date,
        filing_date: input.filing_date,
      });
      return identifyEvidenceGaps(result);
    }),

  /**
   * Check statute of limitations.
   */
  checkSOL: adminProcedure
    .input(z.object({
      incident_date: z.number(),
      filing_date: z.number().describe("REQUIRED — explicit filing date"),
      limit_days: z.number(),
    }))
    .query(({ input }) => {
      return computeSOL(input.incident_date, input.filing_date, input.limit_days);
    }),

  // ═══════════════════════════════════════════════════════════════
  // SIGNAL UTILITIES
  // ═══════════════════════════════════════════════════════════════

  computeFingerprint: adminProcedure
    .input(z.object({
      temporal_coordinate: z.number(),
      spatial_coordinate: z.string(),
      signal_type: z.string(),
      confidence: z.number().nullable(),
      characteristics: z.record(z.union([z.string(), z.number(), z.boolean()])),
      temporal_bucket_ms: z.number().default(86_400_000),
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

  computeDistance: adminProcedure
    .input(z.object({
      lat1: z.number(), lon1: z.number(),
      lat2: z.number(), lon2: z.number(),
    }))
    .query(({ input }) => ({
      distance_km: haversineDistance(input.lat1, input.lon1, input.lat2, input.lon2),
      equation: "d=R×2×atan2(√a,√(1-a)); R=6371km",
    })),

  validatePartition: adminProcedure
    .input(z.object({
      weights: z.array(z.number()),
      tolerance: z.number().default(1e-6),
    }))
    .query(({ input }) => validatePartitionOfUnity(input.weights, input.tolerance)),

  getEngineInfo: adminProcedure
    .query(() => ({
      atlas_engine_version: ENGINE_VERSION,
      capabilities: [
        "convergence_detection", "signal_fingerprinting", "signal_linking",
        "geographic_normalization", "haversine_distance", "network_adjacency_kernel",
        "viability_scoring", "element_satisfaction", "sol_computation",
        "evidence_gap_analysis", "claim_comparison", "provenance_receipts",
      ],
      deterministic: true,
      llm_free: true,
      admin_gated: true,
    })),
});
