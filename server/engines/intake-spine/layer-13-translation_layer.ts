import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  CANONICALIZATION_VERSION,
} from './utils';
import { ChronologyEvent } from './layer-4-chronology_reconstruction';
import { Entity } from './layer-6-entity_registry';
import { ClaimCandidate } from './layer-12-rights_and_duties_matrix';

export interface TranslationOutput {
  timeline_summary: string[];
  entity_summary: string[];
  claim_summaries: string[];
  gap_summaries: string[];
}

export const LAYER_VERSION = '2.1.0';
export const RULE_VERSION = '2.1.0';

export const RULE_MANIFEST = {
  timeline_template: 'On {date}, {actor}: {event_text} (Source: {source_artifact_key})',
  entity_template: '{canonical_name} ({type}) — source artifacts: {artifact_keys}',
  claim_template: 'CANDIDATE — NOT YET LEGALLY EVALUATED: {claim_type_name} ({jurisdiction}). Structural rule: {matching_rule}. Required elements still unresolved: {unresolved_elements}.',
  gap_template: 'For {claim_type_name}: downstream claim/proof evaluation is still required for {unresolved_elements}.',
  missing_actor_token: '[actor unknown]',
  no_unresolved_elements_token: '[no governed element records bound]',
} as const;

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

export function processLayer13(input: {
  events: ChronologyEvent[];
  entities: Entity[];
  claims: ClaimCandidate[];
}): EngineResult<TranslationOutput> {
  const events = [...input.events].sort((a, b) => a.event_id.localeCompare(b.event_id));
  const entities = [...input.entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const claims = [...input.claims].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  const input_hash = computeHash({
    event_ids: events.map(event => event.event_id),
    entity_ids: entities.map(entity => entity.entity_id),
    claim_candidate_ids: claims.map(claim => claim.candidate_id),
  });

  const timeline_summary = events
    .filter(event => event.date)
    .map(event => render(RULE_MANIFEST.timeline_template, {
      date: event.date as string,
      actor: event.actor || RULE_MANIFEST.missing_actor_token,
      event_text: event.event_text,
      source_artifact_key: event.source_artifact_key,
    }));

  const entity_summary = entities.map(entity => render(RULE_MANIFEST.entity_template, {
    canonical_name: entity.canonical_name,
    type: entity.type,
    artifact_keys: Array.from(new Set(entity.raw_mentions.map(mention => mention.artifact_key))).sort().join(', '),
  }));

  const claim_summaries = claims.map(claim => render(RULE_MANIFEST.claim_template, {
    claim_type_name: claim.claim_type_name,
    jurisdiction: claim.jurisdiction,
    matching_rule: claim.matching_rule,
    unresolved_elements: claim.unresolved_elements.join(', ') || RULE_MANIFEST.no_unresolved_elements_token,
  }));

  const gap_summaries = claims.map(claim => render(RULE_MANIFEST.gap_template, {
    claim_type_name: claim.claim_type_name,
    unresolved_elements: claim.unresolved_elements.join(', ') || RULE_MANIFEST.no_unresolved_elements_token,
  }));

  const data: TranslationOutput = {
    timeline_summary,
    entity_summary,
    claim_summaries,
    gap_summaries,
  };

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

function render(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(value),
    template,
  );
}
