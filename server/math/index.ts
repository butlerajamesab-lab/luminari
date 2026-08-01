/**
 * LUMINARI MATHEMATICAL ENGINE INDEX v2.0.0
 *
 * All deterministic computation lives here.
 * No LLM. No inference. Same input → same output.
 *
 * Modules:
 *   atlas-engine       — Core signal math (convergence, priority, fingerprinting, similarity)
 *   viability-engine   — Legal claim scoring (element satisfaction, SOL, gap analysis)
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
  spatialSimilarityHaversine,
  networkAdjacencyKernel,
  jointSimilarity,
  priorityScore,
  priorityScoreFromDeclared,
  urgencyFromDeadline,
  feasibilityScore,
  normalizeGeographicWeights,
  validatePartitionOfUnity,
  translateSignalConfidence,
  deduplicateSignals,
  haversineDistance,
  generateProvenanceReceipt,
  ENGINE_VERSION,
  ENGINE_EQUATIONS,
  type Signal,
  type GeographyEntry,
  type GeographyRegistry,
  type PrecedenceRecord,
  type ConvergenceInput,
  type ConvergenceResult,
  type PoissonResult,
  type NullModelReport,
  type PriorityInput,
  type DeclaredUtilities,
  type SimilarityInput,
  type GeographicAllocation,
  type ProvenanceReceipt,
} from "./atlas-engine";

export {
  // Viability scoring
  scoreViability,
  computeSOL,
  compareClaimViability,
  identifyEvidenceGaps,
  VIABILITY_ENGINE_VERSION,
  SATISFACTION_THRESHOLD,
  type ClaimElement,
  type ClaimDefinition,
  type EvidenceItem,
  type ElementScore,
  type SOLStatus,
  type ViabilityResult,
  type ViabilityInput,
} from "./viability-engine";

export {
  // Convergence runner (database bridge)
  runConvergenceAnalysis,
  type ConvergenceConfig,
  type ConvergenceRunResult,
  type ConvergenceZone,
} from "./convergence-runner";
