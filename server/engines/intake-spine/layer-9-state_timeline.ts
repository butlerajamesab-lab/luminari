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
import {
  classifySemanticArtifact,
  cmsSurveyDate,
  isDateOutsideCmsRecordRange,
  isExcludedFromDominantSemanticLane,
  semanticSpansForArtifact,
} from './semantic-substrate';

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

export const LAYER_VERSION = '2.5.0';
export const RULE_VERSION = '2.5.0';

type StateRule = {
  regex: { source: string; flags: string };
  to_state: string;
  domain: string;
};

type DateRule = {
  regex: { source: string; flags: string };
  format: 'month_day_year' | 'us_numeric' | 'iso_date';
};

export const RULE_MANIFEST: {
  state_rules: StateRule[];
  date_rules: DateRule[];
  attribution_scope: 'sentence';
  mention_binding: 'exact_extracted_mention_offsets_only';
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
    { regex: { source: '\\bmov(?:e|ed|ing) (?:in)?to (?:a )?(?:room in )?(?:long[ -]term care|(?:a )?nursing home|(?:a )?(?:care )?facility)\\b', flags: 'gi' }, to_state: 'facility_admission', domain: 'facility_care' },
    { regex: { source: '\\b(?:was |been )?(?:admitted to|taken to|sent to|transported to) (?:the )?hospital\\b', flags: 'gi' }, to_state: 'facility_hospitalization', domain: 'facility_care' },
    { regex: { source: '\\bin the hospital\\b', flags: 'gi' }, to_state: 'facility_hospitalization', domain: 'facility_care' },
    { regex: { source: '\\bbed[ -]?hold\\b', flags: 'gi' }, to_state: 'bed_hold_charged', domain: 'facility_care' },
    { regex: { source: '\\bcharging\\b.{0,60}\\bhold\\b.{0,20}\\bbed\\b', flags: 'gi' }, to_state: 'bed_hold_charged', domain: 'facility_care' },
    { regex: { source: '\\breadmi(?:t|tted|ssion)\\b', flags: 'gi' }, to_state: 'readmission_restricted', domain: 'facility_care' },
    { regex: { source: '\\bdehydrat(?:ion|ed)\\b', flags: 'gi' }, to_state: 'care_deficit_documented', domain: 'facility_care' },
    { regex: { source: '\\bnot (?:been )?(?:getting|received?|given)\\b.{0,40}\\b(?:fluids?|water|hydration|food|medication|care)\\b', flags: 'gi' }, to_state: 'care_deficit_documented', domain: 'facility_care' },
    { regex: { source: '\\bheat exhaustion\\b', flags: 'gi' }, to_state: 'environmental_hazard_documented', domain: 'facility_care' },
    { regex: { source: '\\bcare (?:conference|plan meeting)\\b', flags: 'gi' }, to_state: 'care_conference_referenced', domain: 'facility_care' },
    { regex: { source: '\\b(?:phone (?:number|#)|contact info(?:rmation)?)\\b.{0,60}\\b(?:POA|power of attorney)\\b', flags: 'gi' }, to_state: 'poa_instrument_info_used', domain: 'elder_advocacy' },
    { regex: { source: '\\b(?:POA|power of attorney)\\b.{0,80}\\b(?:phone (?:number|#)|contact info(?:rmation)?)\\b', flags: 'gi' }, to_state: 'poa_instrument_info_used', domain: 'elder_advocacy' },
    { regex: { source: '\\b(?:called|contacted|reached out to|invited)\\b.{0,60}\\b(?:estranged|backup|son|daughter|relative)\\b', flags: 'gi' }, to_state: 'alternate_family_contacted', domain: 'elder_advocacy' },
    { regex: { source: '\\bbrand(?:ing|ed)? (?:me|her|him|them) as ["“]?difficult\\b', flags: 'gi' }, to_state: 'advocate_characterized_difficult', domain: 'elder_advocacy' },
    { regex: { source: '\\brestraining order\\b', flags: 'gi' }, to_state: 'access_restricted', domain: 'elder_advocacy' },
    { regex: { source: '\\brestrict(?:ing|ed|ion)?s?\\b.{0,40}\\b(?:access|visit)\\b', flags: 'gi' }, to_state: 'access_restricted', domain: 'elder_advocacy' },
    { regex: { source: '\\bcharge\\b.{0,30}\\bper page\\b', flags: 'gi' }, to_state: 'records_access_obstructed', domain: 'elder_advocacy' },
    { regex: { source: '\\binspector(?:s)? (?:were |was )?(?:there|here|coming|on[ -]?site)\\b', flags: 'gi' }, to_state: 'inspection_observed', domain: 'facility_care' },
  ],
  date_rules: [
    {
      regex: { source: '\\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4})\\b', flags: 'i' },
      format: 'month_day_year',
    },
    {
      regex: { source: '\\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.?\\s+\\d{1,2},?\\s+\\d{4})\\b', flags: 'i' },
      format: 'month_day_year',
    },
    { regex: { source: '\\b(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\b', flags: '' }, format: 'us_numeric' },
    { regex: { source: '\\b(\\d{4}-\\d{2}-\\d{2})\\b', flags: '' }, format: 'iso_date' },
  ],
  attribution_scope: 'sentence',
  mention_binding: 'exact_extracted_mention_offsets_only',
  ambiguous_entity_policy: 'unresolved',
  missing_date_policy: 'null',
  from_state_policy: 'null_without_explicit_prior_state_rule',
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);
const STATE_RULES = RULE_MANIFEST.state_rules.map(rule => ({ ...rule, pattern: regexFromManifest(rule.regex) }));
const DATE_RULES = RULE_MANIFEST.date_rules.map(rule => ({ ...rule, pattern: regexFromManifest(rule.regex) }));

export function processLayer9(input: Layer9Input): EngineResult<StateTransition[]> {
  const artifacts = [...input.artifacts].sort((a, b) => a.artifact_key.localeCompare(b.artifact_key));
  const parser_version = parserVersion(artifacts);
  const input_hash = computeHash({
    entity_ids: input.entities.map(entity => entity.entity_id).sort(),
    artifacts: artifacts.map(artifact => ({
      artifact_key: artifact.artifact_key,
      raw_bytes_sha256: artifact.raw_bytes_sha256,
      parser_version: artifact.parser_version,
      extraction_status: artifact.extraction_status,
      parsed_output_hash: computeHash({ extracted_text: artifact.extracted_text, spans: artifact.spans }),
    })),
  });
  const unresolved: UnresolvedDependency[] = [];
  const transitions = new Map<string, StateTransition>();

  for (const artifact of artifacts) {
    if (artifact.extraction_status !== 'success') {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}`,
        reason: artifact.extraction_status === 'unsupported_format' ? 'unsupported_format' : 'incomplete',
        detail: `State-timeline extraction skipped artifact state ${artifact.extraction_status}`,
      });
      continue;
    }

    if (isExcludedFromDominantSemanticLane(artifact, artifacts)) {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}:semantic_lane`,
        reason: 'unresolved',
        detail: 'Artifact preserved as evidence but excluded from the dominant CMS-2567 semantic lane',
      });
      continue;
    }

    const artifactClass = classifySemanticArtifact(artifact);
    const surveyDate = artifactClass === 'cms_2567' ? cmsSurveyDate(artifact) : null;

    for (const span of semanticSpansForArtifact(artifact, artifacts)) {
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
          );

          if (entities.length === 0) continue;
          if (entities.length > 1) {
            unresolved.push({
              field: `transition:${rule.to_state}:${artifact.artifact_key}:${sentenceAbsoluteOffset}`,
              reason: 'unresolved',
              detail: `Multiple entities occur in the bounded sentence: ${entities.map(entity => entity.canonical_name).sort().join(', ')}`,
            });
            continue;
          }

          const entity = entities[0];
          const transitionDate = extractDate(sentence);
          if (
            artifactClass === 'cms_2567'
            && transitionDate
            && isDateOutsideCmsRecordRange(transitionDate, surveyDate)
          ) {
            unresolved.push({
              field: `transition_date:${artifact.artifact_key}:${sentenceAbsoluteOffset}`,
              reason: 'unresolved',
              detail: `CMS-2567 transition date is outside the bounded survey record range: ${transitionDate}`,
            });
            continue;
          }
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
    parser_version,
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
    }
  }
  return Array.from(matches.values()).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

function extractDate(sentence: string): string | null {
  for (const rule of DATE_RULES) {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(sentence);
    if (!match) continue;
    const normalized = normalizeDate(match[1], rule.format);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeDate(value: string, format: DateRule['format']): string | null {
  const trimmed = value.replace(',', '').trim();
  let year: number;
  let month: number;
  let day: number;

  if (format === 'iso_date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) return null;
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else if (format === 'us_numeric') {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (!match) return null;
    month = Number(match[1]); day = Number(match[2]); year = Number(match[3]);
  } else {
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const parts = trimmed.split(/\s+/);
    const monthToken = parts[0].toLowerCase().replace(/\.$/, '');
    month = monthNames.findIndex(name => name.startsWith(monthToken) || monthToken.startsWith(name.slice(0, 3))) + 1;
    if (month <= 0) return null;
    day = Number(parts[1]);
    year = Number(parts[2]);
  }

  if (![year, month, day].every(Number.isInteger)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parserVersion(artifacts: ParsedArtifact[]): string {
  const versions = Array.from(new Set(artifacts.map(artifact => artifact.parser_version))).sort();
  return versions.length === 0 ? 'N/A' : versions.join('|');
}
