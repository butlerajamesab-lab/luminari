/** Determinism replay proof including the governed provenance receipt. */
import * as crypto from "crypto";
import {
  computeRunKey,
  deduplicateSignals,
  detectConvergence,
  generateProvenanceReceipt,
  priorityScoreFromDeclared,
  type GeographyRegistry,
  type Signal,
} from "./atlas-engine";
import { scoreViability, type ClaimDefinition, type ElementEvaluation } from "./viability-engine";

const as_of = 1_700_100_000_000;
const registry: GeographyRegistry = { version: "2026.08.01", entries: [
  { id: "WA", area_sq_km: 184827, centroid_lat: 47.4, centroid_lon: -120.7, adjacency: ["OR"] },
  { id: "OR", area_sq_km: 254799, centroid_lat: 44, centroid_lon: -120.5, adjacency: ["WA"] },
] };
const signals: Signal[] = [
  { id: "s1", temporal_coordinate: 1_700_000_000_000, spatial_coordinate: "WA", signal_type: "complaint", confidence: 0.8, characteristics: { domain: "housing" } },
  { id: "s2", temporal_coordinate: 1_700_050_000_000, spatial_coordinate: "WA", signal_type: "enforcement", confidence: 0.9, characteristics: { domain: "housing" } },
  { id: "s3", temporal_coordinate: 1_700_080_000_000, spatial_coordinate: "WA", signal_type: "complaint", confidence: null, characteristics: { domain: "employment" } },
];
const config = { as_of, time_window_ms: 7 * 86_400_000, temporal_bucket_ms: 86_400_000, geography_registry_version: registry.version, min_signals_for_analysis: 1, z_score_threshold: 2 };
const run_key = computeRunKey({ as_of, config, geography_registry_version: registry.version });

const claim: ClaimDefinition = {
  claim_type: "governed_claim", jurisdiction: "WA", source_id: "rosetta-claim-1",
  rule_manifest_hash: "r".repeat(64), statute_of_limitations_days: 300,
  elements: [
    { id: "e1", name: "Element one", description: "", mandatory: true, weight: 0.6 },
    { id: "e2", name: "Element two", description: "", mandatory: false, weight: 0.4 },
  ],
};
const evaluations: ElementEvaluation[] = [
  { element_id: "e1", status: "satisfied", prism_verification_id: "prism-e1", rule_manifest_hash: "p".repeat(64), source_evidence_ids: ["ev1"] },
  { element_id: "e2", status: "unsatisfied", prism_verification_id: "prism-e2", rule_manifest_hash: "p".repeat(64), source_evidence_ids: [] },
];

function runOnce() {
  const convergence = detectConvergence({ geography: "WA", raw_signals: signals, as_of, time_window_ms: config.time_window_ms, temporal_bucket_ms: config.temporal_bucket_ms, total_signals_all_geographies: deduplicateSignals(signals).length, geography_registry: registry });
  const receipt = generateProvenanceReceipt({
    run_key, geography_id: "WA", equation_id: "poisson_z_score", as_of, config,
    raw_population: signals, deduplicated_population: deduplicateSignals(signals), geography_registry: registry,
    expected_count: convergence.poisson.expected_count, observed_count: convergence.poisson.observed_count,
    computed_outputs: { convergence },
  });
  const priority = priorityScoreFromDeclared({
    version: "1.0.0",
    urgency: { value: 0.8, source_record_id: "utility-u" },
    equity: { value: 0.6, source_record_id: "utility-e" },
    feasibility: { value: 0.7, source_record_id: "utility-f" },
    confidence: { value: 0.9, source_record_id: "utility-c" },
  });
  const viability = scoreViability({ claim, evaluations, incident_date: 1_700_000_000_000, filing_date: as_of, as_of });
  return { convergence, receipt, priority, viability };
}

const outputs = [runOnce(), runOnce(), runOnce()].map(v => JSON.stringify(v));
const hashes = outputs.map(v => crypto.createHash("sha256").update(v).digest("hex"));
if (!(outputs[0] === outputs[1] && outputs[1] === outputs[2])) throw new Error("determinism replay failed");
console.log(JSON.stringify({ deterministic: true, hashes, receipt_input_hash: JSON.parse(outputs[0]).receipt.input_hash }, null, 2));
