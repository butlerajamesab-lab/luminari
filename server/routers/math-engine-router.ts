/**
 * MATH ENGINE ROUTER v2.1.0
 *
 * Administrator-only governed runtime surface. Legal scoring accepts record
 * identifiers only; arbitrary caller-defined claims/evidence are not exposed.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { runConvergenceAnalysis } from "../math/convergence-runner";
import { ENGINE_VERSION, signalFingerprint, type Signal } from "../math/atlas-engine";
import {
  VIABILITY_ENGINE_VERSION,
  scoreViability,
  identifyEvidenceGaps,
  type ClaimDefinition,
  type ElementEvaluation,
  type ViabilityResult,
} from "../math/viability-engine";

export const mathEngineRouter = router({
  runConvergence: adminProcedure
    .input(z.object({
      as_of: z.number(),
      time_window_ms: z.number().positive(),
      geography_registry_version: z.string().min(1),
      temporal_bucket_ms: z.number().positive().default(86_400_000),
      min_signals_for_analysis: z.number().int().positive().default(2),
      z_score_threshold: z.number().default(2),
    }))
    .query(({ input }) => runConvergenceAnalysis(input)),

  scoreViabilityByContext: adminProcedure
    .input(z.object({ viability_context_id: z.string().uuid() }))
    .query(({ input }) => loadViabilityResult(input.viability_context_id)),

  getViabilityGapsByContext: adminProcedure
    .input(z.object({ viability_context_id: z.string().uuid() }))
    .query(async ({ input }) => identifyEvidenceGaps(await loadViabilityResult(input.viability_context_id))),

  computeFingerprint: adminProcedure
    .input(z.object({
      id: z.string().min(1),
      temporal_coordinate: z.number(),
      spatial_coordinate: z.string().min(1),
      signal_type: z.string().min(1),
      confidence: z.number().min(0).max(1).nullable(),
      characteristics: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
      temporal_bucket_ms: z.number().positive().default(86_400_000),
    }))
    .query(({ input }) => {
      const signal: Signal = {
        id: input.id,
        temporal_coordinate: input.temporal_coordinate,
        spatial_coordinate: input.spatial_coordinate,
        signal_type: input.signal_type,
        confidence: input.confidence,
        characteristics: input.characteristics,
      };
      return { fingerprint: signalFingerprint(signal, input.temporal_bucket_ms), engine_version: ENGINE_VERSION };
    }),

  getEngineInfo: adminProcedure.query(() => ({
    atlas_engine_version: ENGINE_VERSION,
    viability_engine_version: VIABILITY_ENGINE_VERSION,
    deterministic: true,
    llm_free: true,
    governed_legal_inputs_only: true,
  })),
});

async function loadViabilityResult(contextId: string): Promise<ViabilityResult> {
  const contextRows = await db.execute(sql`
    select vc.id, vc.case_id, vc.claim_definition_id, vc.incident_date,
           vc.filing_date, vc.as_of, vc.rule_manifest_hash,
           cd.claim_type, cd.jurisdiction, cd.elements,
           cd.statute_of_limitations_days, cd.rule_manifest_hash as claim_rule_manifest_hash
    from case_viability_context vc
    join claim_definitions cd on cd.id = vc.claim_definition_id
    where vc.id = ${contextId}
      and cd.active = true
    limit 1
  `);
  if (!contextRows.rows?.length) throw new Error(`governed viability context '${contextId}' not found`);
  const row = contextRows.rows[0] as any;
  const claim: ClaimDefinition = {
    claim_type: String(row.claim_type),
    jurisdiction: String(row.jurisdiction),
    elements: parseJson(row.elements),
    statute_of_limitations_days: row.statute_of_limitations_days === null ? null : Number(row.statute_of_limitations_days),
    source_id: String(row.claim_definition_id),
    rule_manifest_hash: String(row.claim_rule_manifest_hash),
  };

  const evaluationRows = await db.execute(sql`
    select element_id, evaluation_status, prism_verification_id,
           rule_manifest_hash, source_evidence_ids
    from claim_element_evaluations
    where viability_context_id = ${contextId}
    order by element_id
  `);
  const evaluations: ElementEvaluation[] = (evaluationRows.rows ?? []).map((evaluation: any) => ({
    element_id: String(evaluation.element_id),
    status: evaluation.evaluation_status,
    prism_verification_id: String(evaluation.prism_verification_id),
    rule_manifest_hash: String(evaluation.rule_manifest_hash),
    source_evidence_ids: parseJson(evaluation.source_evidence_ids),
  }));

  return scoreViability({
    claim,
    evaluations,
    incident_date: row.incident_date === null ? null : Number(row.incident_date),
    filing_date: row.filing_date === null ? null : Number(row.filing_date),
    as_of: Number(row.as_of),
  });
}

function parseJson(value: unknown): any { return typeof value === "string" ? JSON.parse(value) : value; }
