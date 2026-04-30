/**
 * Engine Entrypoint Wrapper
 *
 * Provides withEngineTracking() — a tRPC middleware-style wrapper
 * that intercepts engine mutation calls and records them in engine_runs
 * via wrapEngineExecution.
 *
 * STATUS CONTRACT: pending | running | success | failed | unknown
 * No other values are permitted.
 *
 * OUTPUT_REFS CONTRACT:
 *   extractOutputRefs now returns Promise<OutputRefs> (object, not string array).
 *   Receives (result, runId) so the engine can embed run_id in trace_path.
 *
 * Unregistered engines are rejected. No fallback paths.
 *
 * Usage in routers:
 *   import { withEngineTracking } from "../engine-entrypoint-wrapper";
 *   import { buildOutputRefs } from "../output-refs";
 *
 *   buildMatterProfile: protectedProcedure
 *     .input(z.object({ caseId: z.number() }))
 *     .mutation(async ({ ctx, input }) => {
 *       return withEngineTracking({
 *         engineId: "strategy-engine",
 *         caseId: input.caseId,
 *         userId: ctx.user?.id,
 *         extractOutputRefs: async (result, runId) => buildOutputRefs({ ... }),
 *       }, async () => {
 *         // original mutation body
 *       });
 *     }),
 */
import { wrapEngineExecution, bindRunToSnapshot } from "./engine-metadata";
import type { EngineRunStatus } from "./engine-metadata";
import type { OutputRefs } from "./output-refs";
import { auditOutputRefs } from "./canonical-guard";

interface TrackingConfig {
  engineId: string;
  caseId: number;
  userId?: number;
  runType?: "full_pipeline" | "viability_only" | "strategy_only" | "assembly_only" | "pattern_only";
  snapshotId?: number;
  extractOutputRefs?: (result: any, runId: string) => Promise<OutputRefs>;
}

/**
 * Wraps an engine execution function with metadata tracking.
 * Returns the original function result (not the EngineRunResult wrapper),
 * so existing callers see no change in return type.
 * The engine_runs row is created as a side effect.
 */
export async function withEngineTracking<T>(
  config: TrackingConfig,
  fn: () => Promise<T>
): Promise<T & { _engineRunId?: string }> {
  let capturedResult: T | undefined;

  const runResult = await wrapEngineExecution(
    {
      engineId: config.engineId,
      caseId: config.caseId,
      userId: config.userId,
      runType: config.runType,
      snapshotId: config.snapshotId,
    },
    async () => {
      capturedResult = await fn();
      return capturedResult;
    },
    config.extractOutputRefs
      ? async (result: any, runId: string) => {
          const refs = await config.extractOutputRefs!(result, runId);
          // Enforce canonical-only output_refs
          const violations = auditOutputRefs(refs);
          if (violations.length > 0) {
            throw new Error(
              `[CanonicalGuard] Engine "${config.engineId}" produced non-canonical output_refs: ` +
              violations.join("; ")
            );
          }
          return refs;
        }
      : undefined
  );

  if (runResult.status === "failed" && !capturedResult) {
    // Engine failed before producing a result — throw so tRPC returns error
    throw new Error(runResult.error || `Engine ${config.engineId} failed`);
  }

  // Return original result with run ID attached
  const result = capturedResult as T & { _engineRunId?: string };
  if (result && typeof result === "object") {
    (result as any)._engineRunId = runResult.runId;
  }
  return result;
}

// Re-export for convenience
export { bindRunToSnapshot };
export type { EngineRunStatus };

// ─── Engine ID Constants ───

export const ENGINE_IDS = {
  PATTERN: "pattern-engine",
  STRATEGY: "strategy-engine",
  PROCEDURAL: "procedural-engine",
  TREND: "trend-engine",
  OUTCOME: "outcome-engine",
  VIABILITY: "viability-engine",
  ASSEMBLY: "assembly-engine",
  INGESTION: "ingestion-engine",
  HARM_INDEX: "harm-index-engine",
  LITIGATION_CORRELATION: "litigation-correlation-engine",
  RISK_FORECAST: "risk-forecast-engine",
  HARM_MAP: "harm-map-engine",
  PROBLEM_INTERPRETER: "problem-interpreter-engine",
  CASE_LINK: "case-link-engine",
  ATTORNEY_MATCH: "attorney-match-engine",
  ENTITY_INTELLIGENCE: "entity-intelligence-engine",
  INSTITUTIONAL_ACCOUNTABILITY: "institutional-accountability-engine",
  REGULATORY_CAPTURE: "regulatory-capture-engine",
  CRISIS_PREDICTION: "crisis-prediction-engine",
  SYSTEMIC_SIMULATION: "systemic-simulation-engine",
  TRANSPARENCY: "transparency-engine",
  EVIDENCE_DOSSIER: "evidence-dossier-engine",
  COLLABORATION: "collaboration-engine",
  INVESTIGATIVE_QUERY: "investigative-query-engine",
  ENTITY_TRANSPARENCY: "entity-transparency-engine",
  EVIDENCE_THRESHOLD: "evidence-threshold-engine",
  PROCEDURAL_PATH: "procedural-path-engine",
  REMEDY_FEASIBILITY: "remedy-feasibility-engine",
  CAMPAIGN: "campaign-engine",
  CLAIM_VALIDATION: "claim-validation-engine",
  EVIDENCE_CONFIDENCE: "evidence-confidence-engine",
  REFORM: "reform-engine",
  PAPERWORK: "paperwork-engine",
  REMEDY: "remedy-engine",
  SYSTEMIC_STRATEGY: "systemic-strategy-engine",
  LUMENSEND: "lumensend-engine",
  LENS: "lens-engine",
} as const;
