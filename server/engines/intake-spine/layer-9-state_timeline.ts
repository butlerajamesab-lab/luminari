import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  FactStatus,
  regexFromManifest,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { Entity } from './layer-6-entity_registry';
import { ParsedArtifact } from './parsing-substrate';

export interface StateTransition {
  transition_id: string;
  entity_id: string;
  from_state: string | null;
  to_state: string;
  transition_date: string | null;
  source_artifact_key: string;
  source_span_offset: number;
  source_text: string;
  verification_status: FactStatus;
}

export interface Layer9Input {
  entities: Entity[];
  artifacts: ParsedArtifact[];
}

export const LAYER_VERSION = '2.1.0';
export const RULE_VERSION = '2.1.0';

type StateRule = {
  regex: { source: string; flags: string };
  to_state: string;
  domain: string;
};

export const RULE_MANIFEST: {
  state_rules: StateRule[];
  date_patterns: Array<{ source: string; flags: string }>;
  attribution_scope: 'sentence';
  ambiguous_entity_policy: 'unresolved';
  missing_date_policy: 'null';
  from_state_policy: 'null_without_explicit_prior_state_rule';
} = {
  state_rules: [
    { regex: { source: '\\b(?:was |been |got )?terminated\\b', flags: 'gi' }, to_state: 'terminated', domain: 'employment' },
    { regex: { source: '\\b(?:was |been |got )?fired\\b', flags: 'gi' }, to_state: 'terminated', domain: 'employment' },
    { regex: { source: '\\b(?:was |been |got )?laid off\\b', flags: 'gi' }, to_state: 'laid_off', domain: 'employment' },
    { regex: { source: '\\bresigned\\b', flags: 'gi' }, to_state: 'resigned', domain: 'employment' },
    { regex: { source: '\\b(?:was |been |got )?hired\\b', flags: 'gi' }, to_state: 'employed', domain: 'employment' },
    { regex: { source: '\\b(?:was |been |got )?promoted\\b', flags: 'gi' }, to_state: 'promoted', domain: 'employment' },
    { regex: { source: '\\b(?:was |been |got )?demoted\\b', flags: 'gi' }, to_state: 'demoted', domain: 'employment' },
    { regex: { source: '\\b(?:was |been |got )?suspended\\b', flags: 'gi' }, to_state: 'suspended', domain: 'employment' },
    { regex: { source: '\\b(?:was |been |got )?evicted\\b', flags: 'gi' }, to_state: 'evicted', domain: 'housing' },
    { regex: { source: '\\beviction notice\\b', flags: 'gi' }, to_state: 'eviction_notice_served', domain: 'housing' },
    { regex: { source: '\\bmoved in\\b', flags: 'gi' }, to_state: 'housed', domain: 'housing' },
    { regex: { source: '\\blease (?:was )?(?:signed|executed)\\b', flags: 'gi' }, to_state: 'lease_active', domain: 'housing' },
    { regex: { source: '\\blease (?:was )?terminated\\b', flags: 'gi' }, to_state: 'lease_terminated', domain: 'housing' },
    { regex: { source: '\\b(?:was |been |got )?(?:benefits? )?denied\\b', flags: 'gi' }, to_state: 'denied', domain: 'benefits' },
    { regex: { source: '\\b(?:was |been |got )?(?:benefits? )?approved\\b', flags: 'gi' }, to_state: 'approved', domain: 'benefits' },
    { regex: { source: '\\b(?:benefits? )?(?:was |were |been )?terminated\\b', flags: 'gi' }, to_state: 'benefits_terminated', domain: 'benefits' },
    { regex: { source: '\\bappealed\\b', flags: 'gi' }, to_state: 'appealed', domain: 'benefits' },
    { regex: { source: '\\bapplied (?:for)\\b', flags: 'gi' }, to_state: 'applied', domain: 'benefits' },
    { regex: { source: '\\bclaim (?:was |been )?denied\\b', flags: 'gi' }, to_state: 'claim_denied', domain: 'insurance' },
    { regex: { source: '\\bclaim (?:was |been )?filed\\b', flags: 'gi' }, to_state: 'claim_filed', domain: 'insurance' },
    { regex: { source: '\\bpolicy (?:was |been )?cancelled\\b', flags: 'gi' }, to_state: 'policy_cancelled', domain: 'insurance' },
    { regex: { source: '\\bfiled (?:a )?complaint\\b', flags: 'gi' }, to_state: 'complaint_filed', domain: 'legal' },
    { regex: { source: '\\bfiled (?:a )?(?:law)?suit\\b', flags: 'gi' }, to_state: 'lawsuit_filed', domain: 'legal' },
    { regex: { source: '\\bcharge(?:d)? (?:was )?filed\\b', flags: 'gi' }, to_state: 'charge_filed', domain: 'legal' },
  ],
  date_patterns: [
    { source: '\\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4})\\b', flags: 'i' },
    { source: '\\b(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\b', flags: '' },
    { source: '\\b(\\d{4}-\\d{2}-\\d{2})\\b', flags: '' },
  ],
  attribution_scope: 'sentence',
  ambiguous_entity_policy: 'unresolved',
  missing_date_policy: 'null',
  from_state_policy: 'null_without_explicit_prior_state_rule',
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

const STATE_RULES = RULE_MANIFEST.state_rules.map(rule => ({
  ...rule,
  pattern: regexFromManifest(rule.regex),
}));
const DATE_PATTERNS = RULE_MANIFEST.date_patterns.map(regexFromManifest);

export function processLayer9(input: Layer9Input): EngineResult<StateTransition[]> {
  const input_hash = computeHash({
    entities: input.entities.map(e => e.entity_id).sort(),
    artifacts: input.artifacts.map(a => a.raw_bytes_sha256).sort(),
  });
  const unresolved: UnresolvedDependency[] = [];
  const transitions = new Map<string, StateTransition>();

  for (const artifact of [...input.artifacts].sort((a, b) => a.artifact_key.localeCompare(b.artifact_key))) {
    if (artifact.extraction_status !== 'success') continue;

    for (const span of [...artifact.spans].sort((a, b) => a.start_offset - b.start_offset)) {
      for (const rule of STATE_RULES) {
        rule.pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = rule.pattern.exec(span.text)) !== null) {
          const bounds = sentenceBounds(span.text, match.index);
          const sentence = span.text.substring(bounds.start, bounds.end).trim();
          const sentenceAbsoluteOffset = span.start_offset + bounds.start;
          const entities = entitiesMentionedInSentence(
            input.entities,
            artifact.artifact_key,
            span.start_offset,
            bounds.start,
            bounds.end,
            sentence,
          );

          if (entities.length === 0) continue;
          if (entities.length > 1) {
            unresolved.push({
              field: `transition:${rule.to_state}:${artifact.artifact_key}:${sentenceAbsoluteOffset}`,
              reason: 'unresolved',
              detail: `Multiple entities occur in the bounded sentence: ${entities.map(e => e.canonical_name).sort().join(', ')}`,
            });
            continue;
          }

          const entity = entities[0];
          const transitionDate = extractDate(sentence);
          const transition_id = `trans_${computeHash({
            entity_id: entity.entity_id,
            to_state: rule.to_state,
            artifact_key: artifact.artifact_key,
            sentence_offset: sentenceAbsoluteOffset,
            marker_offset: sentenceAbsoluteOffset + (match.index - bounds.start),
          }).substring(0, 16)}`;

          transitions.set(transition_id, {
            transition_id,
            entity_id: entity.entity_id,
            from_state: null,
            to_state: rule.to_state,
            transition_date: transitionDate,
            source_artifact_key: artifact.artifact_key,
            source_span_offset: sentenceAbsoluteOffset,
            source_text: sentence,
            verification_status: 'document_stated',
          });
        }
      }
    }
  }

  const data = Array.from(transitions.values()).sort((a, b) => a.transition_id.localeCompare(b.transition_id));
  return {
    layer_name: 'state_timeline',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: unresolved.sort((a, b) => a.field.localeCompare(b.field)),
    is_sealed: false,
  };
}

function sentenceBounds(text: string, position: number): { start: number; end: number } {
  let start = 0;
  for (let i = position - 1; i >= 0; i--) {
    if (text[i] === '.' || text[i] === '!' || text[i] === '?' || text[i] === '\n') {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = position; i < text.length; i++) {
    if (text[i] === '.' || text[i] === '!' || text[i] === '?' || text[i] === '\n') {
      end = i + 1;
      break;
    }
  }
  return { start, end };
}

function entitiesMentionedInSentence(
  entities: Entity[],
  artifactKey: string,
  spanStartOffset: number,
  sentenceStart: number,
  sentenceEnd: number,
  sentence: string,
): Entity[] {
  const absoluteStart = spanStartOffset + sentenceStart;
  const absoluteEnd = spanStartOffset + sentenceEnd;
  const matches = new Map<string, Entity>();

  for (const entity of entities) {
    for (const mention of entity.raw_mentions) {
      if (mention.artifact_key !== artifactKey) continue;
      if (mention.span_offset >= absoluteStart && mention.span_offset < absoluteEnd) {
        matches.set(entity.entity_id, entity);
      }
      if (mention.raw_text && sentence.toLowerCase().includes(mention.raw_text.toLowerCase())) {
        matches.set(entity.entity_id, entity);
      }
    }
  }
  return Array.from(matches.values()).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

function extractDate(sentence: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(sentence);
    if (!match) continue;
    const normalized = normalizeDate(match[1]);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeDate(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}
