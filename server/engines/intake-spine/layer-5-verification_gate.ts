import { computeHash, EngineResult, FactStatus, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A structured fact has a canonical identity:
 * entity_id + attribute + value + applicable_time
 * 
 * This is what verification operates on — NOT raw text similarity.
 * Two sources "agree" only when they produce the same structured fact key.
 */
export interface StructuredFact {
  fact_id: string;
  entity_id: string;
  attribute: string;
  value: string;
  applicable_time: string | null; // ISO date or null if timeless
  source_artifact_key: string;
  source_span_offset: number;
  source_text: string; // verbatim text from which this fact was extracted
}

export interface VerificationRecord {
  fact_key: string; // canonical: entity_id|attribute|applicable_time
  verification_state: FactStatus;
  source_refs: SourceRef[];
  contradiction_refs: ContradictionRef[];
}

export interface SourceRef {
  artifact_key: string;
  span_offset: number;
  value_stated: string;
}

export interface ContradictionRef {
  artifact_key_a: string;
  value_a: string;
  artifact_key_b: string;
  value_b: string;
  attribute: string;
}

export interface Layer5Input {
  facts: StructuredFact[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Layer 5: Verification Gate
 * 
 * For each structured fact, determines how well it's supported by evidence.
 * Contradiction detection is structural: same entity + same attribute + 
 * same applicable_time + DIFFERENT values from different sources = contradicted.
 * 
 * Contract: same facts → same verification states → same output hash.
 */
export function processLayer5(input: Layer5Input): EngineResult<VerificationRecord[]> {
  const input_hash = computeHash(input);
  const unresolved: UnresolvedDependency[] = [];

  if (input.facts.length === 0) {
    const data: VerificationRecord[] = [];
    return {
      layer_name: 'verification_gate',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash(data),
      data,
      unresolved_dependencies: [{ field: 'facts', reason: 'incomplete', detail: 'No structured facts provided' }],
      is_sealed: false,
    };
  }

  // Group facts by canonical key: entity_id|attribute|applicable_time
  const factGroups = new Map<string, StructuredFact[]>();
  for (const fact of input.facts) {
    const key = `${fact.entity_id}|${fact.attribute}|${fact.applicable_time || 'TIMELESS'}`;
    const group = factGroups.get(key) || [];
    group.push(fact);
    factGroups.set(key, group);
  }

  const records: VerificationRecord[] = [];

  for (const [factKey, facts] of Array.from(factGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    // Get unique source artifacts
    const uniqueArtifacts = new Set(facts.map(f => f.source_artifact_key));
    
    // Get unique values stated for this fact key
    const valuesByArtifact = new Map<string, string>();
    for (const f of facts) {
      valuesByArtifact.set(f.source_artifact_key, f.value);
    }
    const uniqueValues = new Set(valuesByArtifact.values());

    // Build source refs
    const source_refs: SourceRef[] = facts.map(f => ({
      artifact_key: f.source_artifact_key,
      span_offset: f.source_span_offset,
      value_stated: f.value,
    }));

    // Detect contradictions: same key, different values, different sources
    const contradiction_refs: ContradictionRef[] = [];
    if (uniqueValues.size > 1) {
      const artifactEntries = Array.from(valuesByArtifact.entries());
      for (let i = 0; i < artifactEntries.length; i++) {
        for (let j = i + 1; j < artifactEntries.length; j++) {
          const [artA, valA] = artifactEntries[i];
          const [artB, valB] = artifactEntries[j];
          if (valA !== valB && artA !== artB) {
            contradiction_refs.push({
              artifact_key_a: artA,
              value_a: valA,
              artifact_key_b: artB,
              value_b: valB,
              attribute: facts[0].attribute,
            });
          }
        }
      }
    }

    // Determine verification state
    let verification_state: FactStatus;
    if (contradiction_refs.length > 0) {
      verification_state = 'contradicted';
    } else if (uniqueArtifacts.size >= 2) {
      verification_state = 'supported_by_multiple_sources';
    } else if (uniqueArtifacts.size === 1) {
      verification_state = 'document_stated';
    } else {
      verification_state = 'unresolved';
    }

    records.push({
      fact_key: factKey,
      verification_state,
      source_refs,
      contradiction_refs,
    });
  }

  const output_hash = computeHash(records);

  return {
    layer_name: 'verification_gate',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash,
    data: records,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}
