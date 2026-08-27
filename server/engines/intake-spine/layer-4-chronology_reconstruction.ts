import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  FactStatus,
  regexFromManifest,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { ParsedArtifact } from './parsing-substrate';

export interface ChronologyEvent {
  event_id: string;
  date: string | null;
  date_precision: 'exact' | 'month' | 'year' | 'unknown';
  event_text: string;
  actor: string | null;
  source_artifact_key: string;
  source_span_offset: number;
  verification_status: FactStatus;
}

export interface Layer4Input {
  artifacts: ParsedArtifact[];
}

export const LAYER_VERSION = '2.3.0';
export const RULE_VERSION = '2.3.0';

type DateRule = {
  regex: { source: string; flags: string };
  precision: 'exact' | 'month' | 'year';
  format: 'month_day_year' | 'us_numeric' | 'iso_date' | 'month_year';
};

export const RULE_MANIFEST: {
  date_rules: DateRule[];
  actor_subject_regex: { source: string; flags: string };
  sentence_boundaries: string[];
  excluded_non_event_sentence_patterns: Array<{ source: string; flags: string; reason: string }>;
  unsupported_artifact_policy: 'unresolved_skip';
} = {
  date_rules: [
    {
      regex: { source: '\\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4})\\b', flags: 'gi' },
      precision: 'exact',
      format: 'month_day_year',
    },
    {
      regex: { source: '\\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.?\\s+\\d{1,2},?\\s+\\d{4})\\b', flags: 'gi' },
      precision: 'exact',
      format: 'month_day_year',
    },
    { regex: { source: '\\b(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\b', flags: 'g' }, precision: 'exact', format: 'us_numeric' },
    { regex: { source: '\\b(\\d{4}-\\d{2}-\\d{2})\\b', flags: 'g' }, precision: 'exact', format: 'iso_date' },
    {
      regex: { source: '\\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4})\\b', flags: 'gi' },
      precision: 'month',
      format: 'month_year',
    },
    {
      regex: { source: '\\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.?\\s+\\d{4})\\b', flags: 'gi' },
      precision: 'month',
      format: 'month_year',
    },
  ],
  actor_subject_regex: {
    source: '^\\s*([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})\\s+(?=(?:was|is|has|had|filed|stated|reported|testified|claimed|received|submitted|appealed|applied)\\b)',
    flags: '',
  },
  sentence_boundaries: ['.', '!', '?', '\\n'],
  excluded_non_event_sentence_patterns: [
    {
      source: '^\\s*(?:then\\s+)?add\\s+(?:a\\s+)?(?:short\\s+)?summary\\b',
      flags: 'i',
      reason: 'editorial_instruction_not_event',
    },
    {
      source: '^\\s*this\\s+(?:packet|document|summary|thread)\\s+(?:documents|summarizes|covers|spans)\\b',
      flags: 'i',
      reason: 'document_summary_not_event',
    },
    {
      source: '\\b(?:the\\s+)?thread\\s+spans\\s+[A-Z][a-z]+\\s+\\d{4}\\s+through\\s+[A-Z][a-z]+\\s+\\d{4}\\b',
      flags: 'i',
      reason: 'date_range_summary_not_event',
    },
  ],
  unsupported_artifact_policy: 'unresolved_skip',
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);
const DATE_RULES = RULE_MANIFEST.date_rules.map(rule => ({ ...rule, regex: regexFromManifest(rule.regex) }));
const ACTOR_SUBJECT_PATTERN = regexFromManifest(RULE_MANIFEST.actor_subject_regex);
const EXCLUDED_NON_EVENT_PATTERNS = RULE_MANIFEST.excluded_non_event_sentence_patterns.map(rule => ({
  ...rule,
  regex: regexFromManifest(rule),
}));

export function processLayer4(input: Layer4Input): EngineResult<ChronologyEvent[]> {
  const artifacts = [...input.artifacts].sort((a, b) => a.artifact_key.localeCompare(b.artifact_key));
  const parser_version = parserVersion(artifacts);
  const input_hash = computeHash({
    artifacts: artifacts.map(artifact => ({
      artifact_key: artifact.artifact_key,
      raw_bytes_sha256: artifact.raw_bytes_sha256,
      parser_version: artifact.parser_version,
      extraction_status: artifact.extraction_status,
      parsed_output_hash: computeHash({ extracted_text: artifact.extracted_text, spans: artifact.spans }),
    })),
  });
  const unresolved: UnresolvedDependency[] = [];
  const events: ChronologyEvent[] = [];

  for (const artifact of artifacts) {
    if (artifact.extraction_status !== 'success') {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}`,
        reason: artifact.extraction_status === 'unsupported_format' ? 'unsupported_format' : 'incomplete',
        detail: `Chronology extraction skipped artifact state ${artifact.extraction_status}`,
      });
      continue;
    }

    for (const span of [...artifact.spans].sort((a, b) => a.start_offset - b.start_offset)) {
      for (const rule of DATE_RULES) {
        rule.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = rule.regex.exec(span.text)) !== null) {
          const normalizedDate = normalizeDate(match[1], rule.format);
          if (!normalizedDate) {
            unresolved.push({
              field: `chronology_date:${artifact.artifact_key}:${span.start_offset + match.index}`,
              reason: 'unresolved',
              detail: `Recognized date syntax could not be normalized exactly: ${match[1]}`,
            });
            continue;
          }
          const bounds = sentenceBounds(span.text, match.index);
          const event_text = span.text.substring(bounds.start, bounds.end).trim();
          if (isDeclaredNonEventSentence(event_text)) continue;
          const actorMatch = ACTOR_SUBJECT_PATTERN.exec(event_text);
          ACTOR_SUBJECT_PATTERN.lastIndex = 0;
          const actor = actorMatch ? actorMatch[1] : null;
          const source_span_offset = span.start_offset + match.index;

          events.push({
            event_id: `evt_${computeHash({
              artifact_key: artifact.artifact_key,
              source_span_offset,
              date: normalizedDate,
              event_text,
            }).substring(0, 16)}`,
            date: normalizedDate,
            date_precision: rule.precision,
            event_text,
            actor,
            source_artifact_key: artifact.artifact_key,
            source_span_offset,
            verification_status: 'document_stated',
          });
        }
      }
    }
  }

  const data = events.sort((a, b) =>
    (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99') ||
    a.source_artifact_key.localeCompare(b.source_artifact_key) ||
    a.source_span_offset - b.source_span_offset ||
    a.event_id.localeCompare(b.event_id),
  );

  return {
    layer_name: 'chronology_reconstruction',
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

export function isDeclaredNonEventSentence(text: string): boolean {
  for (const rule of EXCLUDED_NON_EVENT_PATTERNS) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(text)) return true;
  }
  return false;
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

function normalizeDate(
  value: string,
  format: DateRule['format'],
): string | null {
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
    if (format === 'month_year') {
      day = 1;
      year = Number(parts[1]);
    } else {
      day = Number(parts[1]);
      year = Number(parts[2]);
    }
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
