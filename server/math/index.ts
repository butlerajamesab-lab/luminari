/**
 * LUMINARI MATHEMATICAL ENGINE INDEX
 * 
 * All deterministic computation lives here.
 * No LLM. No inference. Same input → same output.
 * 
 * Modules:
 *   atlas-engine    — Core signal math (convergence, priority, fingerprinting, similarity)
 *   viability-engine — Legal claim scoring (element satisfaction, SOL, gap analysis)
 *   convergence-runner — Database bridge for atlas-engine (reads signals, computes convergence)
 */

export {
  // Atlas core math
  signalFingerprint,
  jaccardSimilarity,
  cosineSimilarity,
  precedenceScore,
  weightedConfidence,
  detectConvergence,
  temporalSimilarity,
  spatialSimilarity,
  jointSimilarity,
  priorityScore,
  urgencyFromDeadline,
  feasibilityScore,
  normalizeGeographicWeights,
  translateSignalConfidence,
  deduplicateSignals,
  ENGINE_VERSION,
  type Signal,
  type PrecedenceRecord,
  type ConvergenceInput,
  type ConvergenceResult,
  type PriorityInput,
  type SimilarityInput,
  type GeographicAllocation,
} from "./atlas-engine";

export {
  // Viability scoring
  scoreViability,
  computeSOL,
  compareClaimViability,
  identifyEvidenceGaps,
  VIABILITY_ENGINE_VERSION,
  type LegalElement,
  type EvidenceItem,
  type ClaimDefinition,
  type ClaimInput,
  type ViabilityResult,
  type ElementScore,
  type SOLStatus,
} from "./viability-engine";

export {
  // Convergence runner (database bridge)
  runConvergenceAnalysis,
  type ConvergenceRunConfig,
  type ConvergenceRunResult,
  type ConvergenceZone,
  type PrioritizedAction,
} from "./convergence-runner";
