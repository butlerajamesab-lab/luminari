import { computeHash, EngineResult, CANONICALIZATION_VERSION } from './utils';
import { ChronologyEvent } from './layer-4-chronology_reconstruction';
import { Entity } from './layer-6-entity_registry';
import { ClaimCandidate } from './layer-12-rights_and_duties_matrix';

export interface TranslationOutput {
  timeline_summary: string[];
  entity_summary: string[];
  claim_summaries: string[];
  gap_summaries: string[];
}

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

export function processLayer13(input: { events: ChronologyEvent[]; entities: Entity[]; claims: ClaimCandidate[] }): EngineResult<TranslationOutput> {
  const input_hash = computeHash({
    events: input.events.map(e => e.event_id),
    entities: input.entities.map(e => e.entity_id),
    claims: input.claims.map(c => c.candidate_id),
  });

  const timeline_summary = input.events
    .filter(e => e.date)
    .map(e => `On ${e.date}, ${e.actor || '[actor unknown]'}: ${e.event_text} (Source: ${e.source_artifact_key})`);

  const entity_summary = input.entities.map(e =>
    `${e.canonical_name} (${e.type}) — mentioned in ${e.raw_mentions.length} location(s): ${e.raw_mentions.map(m => m.artifact_key).join(', ')}`
  );

  const claim_summaries = input.claims.map(c =>
    `CANDIDATE: ${c.claim_type_name} (${c.jurisdiction}) — ${c.satisfied_elements.length} of ${c.required_elements.length} elements satisfied. Missing: ${c.missing_elements.join(', ') || 'none'}. Source: ${c.authoritative_source}`
  );

  const gap_summaries = input.claims
    .filter(c => c.missing_elements.length > 0)
    .map(c => `For ${c.claim_type_name}: missing evidence for ${c.missing_elements.join(', ')}`);

  const data: TranslationOutput = { timeline_summary, entity_summary, claim_summaries, gap_summaries };

  return {
    layer_name: 'translation_layer',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: [],
    is_sealed: false,
  };
}
