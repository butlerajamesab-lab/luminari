import { describe, expect, it } from 'vitest';
import { processLayer4 } from './layer-4-chronology_reconstruction';
import { processLayer6 } from './layer-6-entity_registry';
import { processLayer7 } from './layer-7-relationship_graph';
import type { ParsedArtifact, TextSpan } from './parsing-substrate';
import type { MessageAuthorBinding } from './layer-6-entity_registry';

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

function smsArtifact(sentences: string[], direction: 'received' | 'sent', contactName: string): ParsedArtifact {
  const artifact = artifactFromSentences(sentences);
  artifact.extraction_method = 'sms_backup_xml';
  artifact.spans = artifact.spans.map(span => ({
    ...span,
    source_kind: 'sms_message' as const,
    message_kind: 'message' as const,
    message_direction: direction,
    message_contact_name: contactName,
  }));
  return artifact;
}

function authorBinding(
  artifact: ParsedArtifact,
  direction: 'received' | 'sent',
  author: string,
  contactName?: string,
  provenance = 'case-participant-assertion:test',
): MessageAuthorBinding {
  return {
    artifact_key: artifact.artifact_key,
    message_direction: direction,
    ...(contactName ? { source_contact_name: contactName } : {}),
    author_canonical_name: author,
    provenance_ref: provenance,
    verification_state: 'verified',
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

  it('binds inbound first-person caregiver and POA declarations only through a verified participant assertion', () => {
    const artifact = smsArtifact([
      "I am Rick's caregiver.",
      'I have power of attorney for Rick.',
    ], 'received', 'Cheryl');
    const bindings = [authorBinding(artifact, 'received', 'Cheryl', 'Cheryl')];
    const entityResult = processLayer6({ artifacts: [artifact], message_author_bindings: bindings });
    expect(entityResult.data.find(entity => entity.canonical_name === 'cheryl')?.raw_mentions)
      .toEqual(expect.arrayContaining([expect.objectContaining({ raw_text: 'I', binding_provenance_refs: ['case-participant-assertion:test'] })]));
    const relationships = processLayer7({ entities: entityResult.data, artifacts: [artifact] }).data;
    expect(new Set(relationships.map(value => value.type))).toEqual(new Set([
      'caregiver_recipient', 'authorized_representative_subject',
    ]));
  });

  it.each([
    'I am Rowan’s sole caregiver & POA.',
    "I am Rowan's caregiver and power of attorney.",
    'I said because I am Rowan’s sole caregiver & POA & he is not often able to speak for himself.',
  ])('preserves both explicitly coordinated roles with verified authorship: %s', sentence => {
    const artifact = smsArtifact([sentence], 'received', 'Source contact');
    const entities = processLayer6({
      artifacts: [artifact],
      message_author_bindings: [authorBinding(artifact, 'received', 'Jordan', 'Source contact')],
    }).data;
    const result = processLayer7({ entities, artifacts: [artifact] });
    expect(result.layer_version).toBe('2.6.2');
    expect(result.rule_version).toBe('2.6.2');
    expect(result.data.map(relationship => relationship.type).sort()).toEqual([
      'authorized_representative_subject', 'caregiver_recipient',
    ]);
    const authorId = entities.find(entity => entity.canonical_name === 'jordan')?.entity_id;
    const recipientId = entities.find(entity => entity.canonical_name === 'rowan')?.entity_id;
    expect(authorId).toBeTruthy();
    expect(recipientId).toBeTruthy();
    for (const relationship of result.data) {
      const authorityId = relationship.direction === 'a_to_b'
        ? relationship.entity_a_id : relationship.entity_b_id;
      const subjectId = relationship.direction === 'a_to_b'
        ? relationship.entity_b_id : relationship.entity_a_id;
      expect(authorityId).toBe(authorId);
      expect(subjectId).toBe(recipientId);
      expect(relationship.source_refs).toHaveLength(1);
      const reference = relationship.source_refs[0];
      expect(reference.artifact_key).toBe(artifact.artifact_key);
      expect(reference.span_text).toBe(sentence);
      expect(reference.marker_text).toMatch(/caregiver.*(?:POA|power of attorney)/);
      expect(artifact.extracted_text!.slice(reference.marker_offset,
        reference.marker_offset + reference.marker_text.length)).toBe(reference.marker_text);
    }
    expect(processLayer7({ entities: [...entities].reverse(), artifacts: [artifact] }).output_hash)
      .toBe(result.output_hash);
  });

  it.each([
    ['I am Rowan’s sole caregiver.', 'caregiver_recipient'],
    ['I am Rowan’s POA.', 'authorized_representative_subject'],
  ])('binds a single explicit possessive role: %s', (sentence, relationshipType) => {
    const artifact = smsArtifact([sentence], 'received', 'Source contact');
    const entities = processLayer6({
      artifacts: [artifact],
      message_author_bindings: [authorBinding(artifact, 'received', 'Jordan', 'Source contact')],
    }).data;
    expect(processLayer7({ entities, artifacts: [artifact] }).data.map(relationship => relationship.type))
      .toEqual([relationshipType]);
  });

  it.each(['received', 'sent'] as const)('does not infer %s compound-role authorship from a contact label', direction => {
    const artifact = smsArtifact(['I am Rowan’s sole caregiver & POA.'], direction, 'Jordan');
    const entities = processLayer6({ artifacts: [artifact] }).data;
    expect(processLayer7({ entities, artifacts: [artifact] }).data).toEqual([]);
  });

  it.each([
    'I asked Rowan’s caregiver.',
    'I am asking Rowan’s caregiver.',
    'I asked Rowan’s sole caregiver & POA.',
    'I am asking Rowan’s sole caregiver & POA.',
    'I am not Rowan’s sole caregiver & POA.',
    'I may be Rowan’s sole caregiver & POA.',
  ])('does not turn nondeclarative possessives into roles: %s', sentence => {
    const artifact = smsArtifact([sentence], 'received', 'Source contact');
    const entities = processLayer6({
      artifacts: [artifact],
      message_author_bindings: [authorBinding(artifact, 'received', 'Jordan', 'Source contact')],
    }).data;
    expect(processLayer7({ entities, artifacts: [artifact] }).data).toEqual([]);
  });

  it('does not transfer a coordinated POA expressly assigned to a different recipient', () => {
    const artifact = smsArtifact(['I am Rowan’s caregiver and POA for Taylor.'], 'received', 'Source contact');
    const entities = processLayer6({
      artifacts: [artifact],
      message_author_bindings: [authorBinding(artifact, 'received', 'Jordan', 'Source contact')],
    }).data;
    expect(processLayer7({ entities, artifacts: [artifact] }).data.map(relationship => relationship.type))
      .toEqual(['caregiver_recipient']);
  });

  it('accepts agreeing verified author assertions and preserves all distinct provenance deterministically', () => {
    const artifact = smsArtifact(["I am Rick's caregiver."], 'received', 'Cheryl');
    const bindings = [
      authorBinding(artifact, 'received', 'Cheryl', 'Cheryl', 'assertion:2'),
      authorBinding(artifact, 'received', ' CHERYL ', 'Cheryl', 'assertion:1'),
      authorBinding(artifact, 'received', 'Cheryl', 'Cheryl', 'assertion:2'),
    ];
    const result = processLayer6({ artifacts: [artifact], message_author_bindings: bindings });
    const author = result.data.find(entity => entity.canonical_name === 'cheryl');
    expect(author?.raw_mentions).toEqual([{
      raw_text: 'I',
      artifact_key: artifact.artifact_key,
      span_offset: 0,
      binding_provenance_refs: ['assertion:1', 'assertion:2'],
    }]);
    expect(result.unresolved_dependencies).toEqual([]);
    const relationships = processLayer7({ entities: result.data, artifacts: [artifact] }).data;
    expect(relationships).toHaveLength(1);
    expect(relationships[0].type).toBe('caregiver_recipient');
    expect(relationships[0].source_refs).toHaveLength(1);

    const replay = processLayer6({ artifacts: [artifact], message_author_bindings: [...bindings].reverse() });
    expect(replay.input_hash).toBe(result.input_hash);
    expect(replay.output_hash).toBe(result.output_hash);
    expect(replay.data).toEqual(result.data);
  });

  it('supports syntax-bounded family and facility declarations in ordinary evidence', () => {
    const artifact = artifactFromSentences([
      "Cheryl is Rick's daughter.",
      'Rick lives at Kline Galland Home.',
    ]);
    const entities = processLayer6({ artifacts: [artifact] }).data;
    expect(new Set(processLayer7({ entities, artifacts: [artifact] }).data.map(value => value.type)))
      .toEqual(new Set(['family', 'facility_resident']));
  });

  it('supports an explicitly mapped outbound author without treating the remote contact as author', () => {
    const artifact = smsArtifact(["I am Dana's caregiver."], 'sent', 'Dana');
    const bindings = [authorBinding(artifact, 'sent', 'Morgan')];
    const entities = processLayer6({ artifacts: [artifact], message_author_bindings: bindings }).data;
    expect(entities.some(entity => entity.canonical_name === 'morgan')).toBe(true);
    expect(processLayer7({ entities, artifacts: [artifact] }).data).toHaveLength(1);
  });

  it('keeps unmapped and ambiguous first-person SMS authors unresolved and emits no relationship', () => {
    const artifact = smsArtifact(["I am Rick's caregiver."], 'received', 'Cheryl');
    const unmapped = processLayer6({ artifacts: [artifact] });
    expect(unmapped.data.some(entity => entity.canonical_name === 'cheryl')).toBe(false);
    expect(unmapped.unresolved_dependencies.some(value => value.detail.includes('no verified'))).toBe(true);
    expect(processLayer7({ entities: unmapped.data, artifacts: [artifact] }).data).toEqual([]);

    const ambiguous = processLayer6({
      artifacts: [artifact],
      message_author_bindings: [
        authorBinding(artifact, 'received', 'Cheryl', 'Cheryl', 'assertion:1'),
        authorBinding(artifact, 'received', 'CHERYL', 'Cheryl', 'assertion:3'),
        authorBinding(artifact, 'received', 'Charlotte', 'Cheryl', 'assertion:2'),
      ],
    });
    expect(ambiguous.unresolved_dependencies.some(value => value.detail.includes('ambiguous'))).toBe(true);
    expect(ambiguous.data.flatMap(entity => entity.raw_mentions).some(mention => mention.binding_provenance_refs)).toBe(false);
    expect(processLayer7({ entities: ambiguous.data, artifacts: [artifact] }).data).toEqual([]);
  });

  it('does not misbind descriptive possessives outside the declared-subject syntax', () => {
    const artifact = smsArtifact(["I spoke to Rick's caregiver, Cheryl, about his care."], 'received', 'Morgan');
    const bindings = [authorBinding(artifact, 'received', 'Morgan', 'Morgan')];
    const entities = processLayer6({ artifacts: [artifact], message_author_bindings: bindings }).data;
    expect(processLayer7({ entities, artifacts: [artifact] }).data).toEqual([]);
  });
});
