/**
 * Global Canonical Write Guard
 *
 * Enforces that ALL engine output writes go through canonical_* tables.
 *
 * Rules:
 * 1. NO writes to legacy tables from engine paths
 * 2. NO dual writes (canonical + legacy)
 * 3. ALL writes must pass through canonical-write-adapter.ts
 * 4. persistEngineOutputs rejects non-canonical output_refs
 *
 * This module provides:
 * - A runtime guard function for engine write paths
 * - A list of blocked legacy tables (engine output tables)
 * - An audit function to detect violations
 */

// Legacy engine output tables — writes to these are BLOCKED from engine paths
const BLOCKED_LEGACY_TABLES = [
  "pattern_aggregation_runs",
  "strategy_matter_profile",
  "strategy_fact_matrix",
  "strategy_claim_candidates",
  "strategy_viability_assessment",
  "strategy_deadline_engine",
  "strategy_element_fact_links",
  "strategy_missing_evidence_tasks",
  "strategy_paths",
  "pattern_entity_clusters",
  "pattern_conduct_clusters",
  "pattern_case_links",
  "pattern_systemic_inferences",
  "pattern_feedback_loop",
  "fact_claims",
  "case_fact_patterns",
  "claim_detection_results",
  "element_strength",
  "contradiction_scores",
  "weak_joint_hits",
  "claim_viability",
  "assembly_filing_packets",
  "assembly_party_designations",
  "assembly_exhibit_index",
  "assembly_fact_narrative_blocks",
  "assembly_legal_argument_blocks",
  "assembly_citation_index",
  "assembly_relief_requests",
  "assembly_generated_sections",
  "assembly_compliance_checklist",
];

/**
 * Guard function — throws if a write targets a blocked legacy table.
 * Call this before any engine write to enforce canonical-only policy.
 */
export function guardEngineWrite(table: string, engineId: string): void {
  // Allow canonical tables
  if (table.startsWith("canonical_")) return;

  // Allow engine_runs (tracking table, not output)
  if (table === "engine_runs") return;

  // Allow conduit_events (governance logging)
  if (table === "conduit_events") return;

  // Allow knowledge_entries and knowledge_modules (backbone persistence)
  if (table === "knowledge_entries" || table === "knowledge_modules") return;

  // Block known legacy output tables
  if (BLOCKED_LEGACY_TABLES.includes(table)) {
    throw new Error(
      `[CanonicalGuard] BLOCKED: Engine "${engineId}" attempted write to legacy table "${table}". ` +
      `All engine output writes MUST go through canonical_* tables via canonical-write-adapter.ts.`
    );
  }

  // Warn on unknown tables (not blocked, but logged)
  console.warn(
    `[CanonicalGuard] WARNING: Engine "${engineId}" writing to unclassified table "${table}". ` +
    `Consider adding to BLOCKED_LEGACY_TABLES or canonical_* tables.`
  );
}

/**
 * Validate that an output_refs object only references canonical tables.
 * Returns list of violations.
 */
export function auditOutputRefs(outputRefs: any): string[] {
  const violations: string[] = [];

  if (!outputRefs || typeof outputRefs !== "object") {
    violations.push("output_refs is null or not an object");
    return violations;
  }

  // Check primary
  if (outputRefs.primary?.table && !outputRefs.primary.table.startsWith("canonical_")) {
    violations.push(`primary.table="${outputRefs.primary.table}" is not canonical`);
  }

  // Check artifacts
  if (Array.isArray(outputRefs.artifacts)) {
    for (const a of outputRefs.artifacts) {
      if (a?.table && !a.table.startsWith("canonical_")) {
        violations.push(`artifact.table="${a.table}" is not canonical`);
      }
    }
  }

  // Check meta.tables
  if (Array.isArray(outputRefs.meta?.tables)) {
    for (const t of outputRefs.meta.tables) {
      if (!t.startsWith("canonical_")) {
        violations.push(`meta.tables contains non-canonical table "${t}"`);
      }
    }
  }

  return violations;
}

/**
 * Returns the list of blocked legacy tables for reference.
 */
export function getBlockedLegacyTables(): string[] {
  return [...BLOCKED_LEGACY_TABLES];
}
