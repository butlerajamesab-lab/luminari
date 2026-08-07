import { computeHash, EngineResult, FactStatus, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { ParsedArtifact, TextSpan } from './parsing-substrate';

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

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

const DATE_PATTERNS: Array<{ regex: RegExp; precision: 'exact' | 'month' | 'year' }> = [
  { regex: /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi, precision: 'exact' },
  { regex: /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g, precision: 'exact' },
  { regex: /\b(\d{4}-\d{2}-\d{2})\b/g, precision: 'exact' },
  { regex: /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/gi, precision: 'month' },
];

export function processLayer4(input: Layer4Input): EngineResult<ChronologyEvent[]> {
  const input_hash = computeHash({ artifacts: input.artifacts.map(a => a.raw_bytes_sha256) });
  const unresolved: UnresolvedDependency[] = [];
  const events: ChronologyEvent[] = [];

  for (const artifact of input.artifacts) {
    if (artifact.extraction_status !== 'success') {
      unresolved.push({ field: `artifact:${artifact.artifact_key}`, reason: artifact.extraction_status === 'unsupported_format' ? 'unsupported_format' : 'incomplete' });
      continue;
    }
    for (const span of artifact.spans) {
      for (const dp of DATE_PATTERNS) {
        dp.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = dp.regex.exec(span.text)) !== null) {
          const dateStr = normalizeDate(match[1]);
          const sentenceContext = extractSentenceContext(span.text, match.index);
          const actor = extractActor(sentenceContext);
          events.push({
            event_id: `evt_${computeHash(`${artifact.artifact_key}|${span.start_offset}|${match.index}`)}`.substring(0, 16),
            date: dateStr,
            date_precision: dp.precision,
            event_text: sentenceContext,
            actor,
            source_artifact_key: artifact.artifact_key,
            source_span_offset: span.start_offset + match.index,
            verification_status: 'document_stated',
          });
        }
      }
    }
  }

  const sorted = events.sort((a, b) => {
    if (!a.date && !b.date) return a.event_id.localeCompare(b.event_id);
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  const output_hash = computeHash(sorted);

  return {
    layer_name: 'chronology_reconstruction',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash,
    data: sorted,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}

function normalizeDate(dateStr: string): string | null {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch { return null; }
}

function extractSentenceContext(text: string, position: number): string {
  const before = text.lastIndexOf('.', position);
  const after = text.indexOf('.', position);
  const start = before >= 0 ? before + 1 : 0;
  const end = after >= 0 ? after + 1 : text.length;
  return text.substring(start, end).trim();
}

function extractActor(sentence: string): string | null {
  const actorMatch = sentence.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/);
  return actorMatch ? actorMatch[1] : null;
}
