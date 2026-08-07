import { computeHash, EngineResult } from './utils';
import { ParsedArtifact } from './parsing-substrate';

export interface ChronologyEvent {
  date: string;
  source_artifact_id: string;
  source_context: string;
  event_text: string;
  actor: string | 'unknown';
  verification_state: 'user_reported' | 'document_stated';
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

// Simple regex for dates: YYYY-MM-DD or MM/DD/YYYY
const DATE_REGEX = /(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})/g;

export function processLayer4(artifacts: ParsedArtifact[]): EngineResult<ChronologyEvent[]> {
  const input_hash = computeHash(artifacts.map(a => a.sha256));
  const events: ChronologyEvent[] = [];

  for (const artifact of artifacts) {
    const text = artifact.extracted_text;
    let match;
    while ((match = DATE_REGEX.exec(text)) !== null) {
      const date = match[0];
      const index = match.index;
      const context = text.substring(Math.max(0, index - 50), Math.min(text.length, index + 100));
      
      events.push({
        date,
        source_artifact_id: artifact.artifact_key,
        source_context: context.trim(),
        event_text: context.trim(), // In a real engine, this would be more refined
        actor: 'unknown',
        verification_state: 'document_stated'
      });
    }
  }

  // Deterministic sorting
  events.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a.source_artifact_id.localeCompare(b.source_artifact_id);
  });

  const output_hash = computeHash(events);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: events,
    unresolved_dependencies: [],
    is_sealed: false
  };
}
