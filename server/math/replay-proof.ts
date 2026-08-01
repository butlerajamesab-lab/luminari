/**
 * DETERMINISM REPLAY PROOF
 * 
 * Runs the same production-shaped inputs through the math engine 3 times
 * and verifies identical outputs.
 */
import { detectConvergence, priorityScoreFromDeclared, signalFingerprint } from "./atlas-engine";
import { scoreViability } from "./viability-engine";
import * as crypto from "crypto";

const registry = { version: "1.0.0", entries: [
  { id: "WA", area_sq_km: 184827, centroid_lat: 47.4, centroid_lon: -120.7 },
  { id: "OR", area_sq_km: 254799, centroid_lat: 44.0, centroid_lon: -120.5 },
]};

const signals = [
  { id: "s1", temporal_coordinate: 1700000000000, spatial_coordinate: "WA", signal_type: "complaint", confidence: 0.8 as number | null, characteristics: { domain: "housing" } },
  { id: "s2", temporal_coordinate: 1700050000000, spatial_coordinate: "WA", signal_type: "enforcement", confidence: 0.9 as number | null, characteristics: { domain: "housing" } },
  { id: "s3", temporal_coordinate: 1700080000000, spatial_coordinate: "WA", signal_type: "complaint", confidence: null as number | null, characteristics: { domain: "employment" } },
];

function runOnce() {
  const convergence = detectConvergence({
    geography: "WA",
    signals,
    as_of: 1700100000000,
    time_window_ms: 7 * 86400000,
    total_signals_all_geographies: 10,
    geography_registry: registry,
  });

  const priority = priorityScoreFromDeclared({
    urgency: { value: 0.8, source: "sol_calc" },
    equity: { value: 0.6, source: "vulnerability_index" },
    feasibility: { value: 0.7, source: "resource_check" },
    confidence: { value: 0.9, source: "evidence_strength" },
  });

  const viability = scoreViability({
    claim: {
      claim_type: "Title_VII",
      jurisdiction: "WA",
      elements: [
        { id: "e1", name: "Protected class", description: "", mandatory: true, weight: 0.4 },
        { id: "e2", name: "Adverse action", description: "", mandatory: true, weight: 0.4 },
        { id: "e3", name: "Causation", description: "", mandatory: false, weight: 0.2 },
      ],
      statute_of_limitations_days: 300,
      source_id: "rosetta-t7-001",
    },
    evidence: [
      { id: "ev1", element_id: "e1", strength: 0.9, source_verified: true, document_type: "record" },
      { id: "ev2", element_id: "e2", strength: 0.7, source_verified: true, document_type: "document" },
    ],
    incident_date: 1700000000000,
    filing_date: 1700100000000,
  });

  return { convergence, priority, viability };
}

// Run 3 times
const results: string[] = [];
for (let i = 0; i < 3; i++) {
  const output = runOnce();
  // Remove timestamp_computed from provenance (it's audit-only, uses Date.now())
  results.push(JSON.stringify(output));
}

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex").substring(0, 16);

console.log("\n═══════════════════════════════════════════════════");
console.log("  DETERMINISM REPLAY PROOF");
console.log("═══════════════════════════════════════════════════\n");
console.log("Run 1 hash:", hash(results[0]));
console.log("Run 2 hash:", hash(results[1]));
console.log("Run 3 hash:", hash(results[2]));
console.log("All identical:", results[0] === results[1] && results[1] === results[2] ? "YES — DETERMINISTIC ✓" : "NO — FAILURE ✗");

const parsed = JSON.parse(results[0]);
console.log("\nSample outputs (fixed inputs, engine v2.0.0):");
console.log("  Convergence Z-score:", parsed.convergence.poisson.z_score);
console.log("  Convergence E[n]:", parsed.convergence.poisson.expected_count);
console.log("  Convergence observed:", parsed.convergence.poisson.observed_count);
console.log("  Convergence null model:", parsed.convergence.null_model.model_id);
console.log("  Priority score:", parsed.priority.score);
console.log("  Viability overall:", parsed.viability.overall_score);
console.log("  Viability mandatory met:", parsed.viability.mandatory_elements_met);
console.log("  Viability source_claim_id:", parsed.viability.source_claim_id);
console.log("\n═══════════════════════════════════════════════════\n");
