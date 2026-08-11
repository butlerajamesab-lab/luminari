import { describe, expect, it } from 'vitest';
import { processLayer4 } from './layer-4-chronology_reconstruction';
import { processLayer6 } from './layer-6-entity_registry';
import { processLayer7 } from './layer-7-relationship_graph';
import type { ParsedArtifact, TextSpan } from './parsing-substrate';

function artifactFromSentences(sentences: string[]): ParsedArtifact {
  const text = sentences.join('\n');
  const spans: TextSpan[] = [];
  let offset = 0;
  sentences.forEach((sentence, paragraph_index) => {
    spans.push({
      text: sentence,
      start_offset: offset,
      end_offset: offset + sentence.length,
      paragraph_index,
      source_artifact_key: 'sha256:test-fixture',
    });
    offset += sentence.length + (paragraph_index < sentences.length - 1 ? 1 : 0);
  });
  return {
    artifact_key: 'sha256:test-fixture',
    raw_bytes_sha256: 'a'.repeat(64),
    declared_mime_type: 'text/plain',
    detected_mime_type: 'text/plain',
    mime_type: 'text/plain',
    byte_size: Buffer.byteLength(text),
    extracted_text: text,
    spans,
    extraction_status: 'success',
    parser_version: 'fixture-parser-v1',
    rule_version: 'fixture-rule-v1',
    parser_rule_manifest_hash: 'b'.repeat(64),
  };
}

describe('caregiving intake projection contracts', () => {
  it('does not promote editorial date-range instructions into chronology events', () => {
    const artifact = artifactFromSentences([
      'Then add a short summary explaining that the thread spans October 2025 through June 2026 and documents a sustained caregiving dispute.',
      'On January 4, 2026, Rick was admitted to Kline Galland Home.',
    ]);
    const result = processLayer4({ artifacts: [artifact] });
    expect(result.data.some(event => event.event_text.startsWith('Then add a short summary'))).toBe(false);
    expect(result.data.some(event => event.date === '2026-01-04' && event.event_text.includes('admitted'))).toBe(true);
  });

  it('rejects document-control tokens while preserving ambiguous single names without inventing identity type', () => {
    const artifact = artifactFromSentences([
      'AND PDF JPEG BENEFIT',
      'Cheryl is caregiver for Rick.',
      'Rick was admitted to Kline Galland Home.',
      'Whether Cheryl was available remained unresolved.',
    ]);
    const result = processLayer6({ artifacts: [artifact] });
    const names = new Map(result.data.map(entity => [entity.canonical_name, entity.type]));
    expect(names.has('and')).toBe(false);
    expect(names.has('pdf')).toBe(false);
    expect(names.has('jpeg')).toBe(false);
    expect(names.has('benefit')).toBe(false);
    expect(names.has('whether cheryl')).toBe(false);
    expect(names.get('cheryl')).toBe('unknown');
    expect(names.get('rick')).toBe('unknown');
    expect(names.get('kline galland home')).toBe('organization');
  });

  it('creates only source-bound caregiving/facility edges from declared relationship language', () => {
    const artifact = artifactFromSentences([
      'Cheryl is caregiver for Rick.',
      'Rick was admitted to Kline Galland Home.',
    ]);
    const entities = processLayer6({ artifacts: [artifact] }).data;
    const result = processLayer7({ entities, artifacts: [artifact] });
    const types = result.data.map(relationship => relationship.type);
    expect(types).toContain('caregiver_recipient');
    expect(types).toContain('facility_resident');
    for (const relationship of result.data) {
      expect(relationship.source_refs.length).toBeGreaterThan(0);
      expect(relationship.source_refs[0].artifact_key).toBe(artifact.artifact_key);
    }
  });
});
