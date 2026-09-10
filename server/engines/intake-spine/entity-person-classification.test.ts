import { describe, expect, it } from 'vitest';
import { processLayer6, RULE_MANIFEST_HASH } from './layer-6-entity_registry';
import { processLayer7 } from './layer-7-relationship_graph';
import type { ParsedArtifact } from './parsing-substrate';

function artifact(sentences: string[], key = 'sha256:care-person-fixture'): ParsedArtifact {
  const extracted_text = sentences.join('\n');
  let offset = 0;
  return {
    artifact_key: key,
    raw_bytes_sha256: 'a'.repeat(64),
    declared_mime_type: 'text/plain',
    detected_mime_type: 'text/plain',
    mime_type: 'text/plain',
    byte_size: Buffer.byteLength(extracted_text),
    extracted_text,
    spans: sentences.map((text, paragraph_index) => {
      const span = { text, start_offset: offset, end_offset: offset + text.length, paragraph_index, source_artifact_key: key };
      offset += text.length + 1;
      return span;
    }),
    extraction_status: 'success',
    extraction_method: 'utf8_text',
    parser_version: 'fixture-v1',
    rule_version: 'fixture-v1',
    parser_rule_manifest_hash: 'b'.repeat(64),
  };
}

describe('source-bound care recipient person classification', () => {
  it.each([
    'I am Rowan’s sole caregiver & POA & he is not often able to speak for himself.',
    "I said because I am Rowan's caregiver.",
    'Jordan is caregiver for Rowan.',
    'Jordan was the sole caregiver for Rowan.',
    'I have power of attorney for Rowan.',
    'Jordan holds a power of attorney for Rowan.',
    "Jordan is Rowan's POA.",
    'Jordan is authorized representative for Rowan.',
  ])('classifies the explicit named recipient without inventing a surname: %s', sentence => {
    const source = artifact(['Rowan was present.', sentence]);
    const result = processLayer6({ artifacts: [source] });
    const recipients = result.data.filter(entity => entity.canonical_name === 'rowan');
    expect(recipients).toHaveLength(1);
    expect(recipients[0].type).toBe('person');
    expect(recipients[0].raw_mentions).toHaveLength(2);
    for (const mention of recipients[0].raw_mentions) {
      expect(mention.artifact_key).toBe(source.artifact_key);
      expect(source.extracted_text.slice(mention.span_offset, mention.span_offset + mention.raw_text.length)).toBe('Rowan');
    }
    expect(result.layer_version).toBe('2.6.4');
    expect(result.rule_version).toBe('2.6.4');
    expect(RULE_MANIFEST_HASH).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    'Rowan was present.',
    'I asked Rowan’s caregiver.',
    'I am asking Rowan’s caregiver.',
    'I am not Rowan’s caregiver.',
    'I may be Rowan’s caregiver.',
    'Maybe I am Rowan’s caregiver.',
    'Maybe Jordan is Rowan’s caregiver.',
    'If Jordan is Rowan’s caregiver, contact the office.',
    'I never said I am Rowan’s caregiver.',
    'I deny that I am Rowan’s caregiver.',
    'I am Rowan’s caregiver?',
    'I am Rowan’s neighbor.',
  ])('keeps unsupported or uncertain names unknown: %s', sentence => {
    const result = processLayer6({ artifacts: [artifact([sentence])] });
    expect(result.data.find(entity => entity.canonical_name === 'rowan')?.type).toBe('unknown');
  });

  it('does not classify same-spelled names in other documents using this assertion', () => {
    const supported = artifact(['I am Rowan’s caregiver.'], 'sha256:supported');
    const unresolved = artifact(['Rowan was present.'], 'sha256:unresolved');
    const result = processLayer6({ artifacts: [supported, unresolved] });
    const person = result.data.find(entity => entity.canonical_name === 'rowan' && entity.type === 'person');
    const unknown = result.data.find(entity => entity.canonical_name === 'rowan' && entity.type === 'unknown');
    expect(person?.raw_mentions.map(mention => mention.artifact_key)).toEqual([supported.artifact_key]);
    expect(unknown?.raw_mentions.map(mention => mention.artifact_key)).toEqual([unresolved.artifact_key]);
    expect(processLayer6({ artifacts: [unresolved, supported] }).output_hash).toBe(result.output_hash);
  });

  it('preserves near matches as separate review candidates', () => {
    const result = processLayer6({ artifacts: [artifact(['I am Rowan’s caregiver.', 'I am Rohan’s caregiver.'])] });
    const people = result.data.filter(entity => ['rowan', 'rohan'].includes(entity.canonical_name));
    expect(people).toHaveLength(2);
    expect(new Set(people.map(entity => entity.entity_id)).size).toBe(2);
    for (const person of people) expect(person.review_candidates).toHaveLength(1);
  });

  it('keeps the verified author and both explicit care roles linked to the newly typed recipient', () => {
    const source = artifact(['I am Rowan’s sole caregiver & POA & he is not often able to speak for himself.']);
    source.extraction_method = 'sms_backup_xml';
    source.spans = source.spans.map(span => ({ ...span, source_kind: 'sms_message', message_kind: 'message', message_direction: 'received', message_contact_name: 'Source contact' }));
    const result = processLayer6({
      artifacts: [source],
      message_author_bindings: [{ artifact_key: source.artifact_key, message_direction: 'received', source_contact_name: 'Source contact', author_canonical_name: 'Jordan', provenance_ref: 'review:test', verification_state: 'verified' }],
    });
    const recipient = result.data.find(entity => entity.canonical_name === 'rowan');
    expect(recipient?.type).toBe('person');
    const relationships = processLayer7({ artifacts: [source], entities: result.data }).data;
    expect(relationships.map(relationship => relationship.type).sort()).toEqual(['authorized_representative_subject', 'caregiver_recipient']);
    for (const relationship of relationships) {
      expect([relationship.entity_a_id, relationship.entity_b_id]).toContain(recipient?.entity_id);
      expect(relationship.source_refs[0].artifact_key).toBe(source.artifact_key);
    }
  });

  it('does not classify a recipient from a quoted reaction', () => {
    const source = artifact(['👍 to “I am Rowan’s caregiver.”']);
    source.extraction_method = 'sms_backup_xml';
    source.spans = source.spans.map(span => ({ ...span, source_kind: 'sms_message', message_kind: 'reaction', message_direction: 'received' }));
    expect(processLayer6({ artifacts: [source] }).data).toEqual([]);
  });

  it('preserves exact bounded context without leaking adjacent messages', () => {
    const sentences = [
      'Private preceding message.',
      'Jordan is caregiver for Rowan. The care discussion stays within this message.',
      'Private following message.',
    ];
    const source = artifact(sentences);
    source.extraction_method = 'sms_backup_xml';
    source.spans = source.spans.map(span => ({ ...span, source_kind: 'sms_message', message_kind: 'message', message_direction: 'received' }));
    const recipient = processLayer6({ artifacts: [source] }).data.find(entity => entity.canonical_name === 'rowan');
    const mention = recipient?.raw_mentions[0];
    expect(mention?.source_context).toBe(sentences[1]);
    expect(mention?.source_context_offset).toBe(sentences[0].length + 1);
    expect(source.extracted_text.slice(mention!.source_context_offset, mention!.source_context_offset! + mention!.source_context!.length)).toBe(mention?.source_context);
  });

  it('bounds long source context and retains the exact source offset', () => {
    const source = artifact([`${'padding '.repeat(80)}I am Rowan’s caregiver. ${'following '.repeat(80)}`]);
    const mention = processLayer6({ artifacts: [source] }).data.find(entity => entity.canonical_name === 'rowan')?.raw_mentions[0];
    expect(mention?.source_context).toHaveLength(600);
    expect(mention?.source_context).toContain('Rowan’s caregiver');
    expect(source.extracted_text.slice(mention!.source_context_offset, mention!.source_context_offset! + 600)).toBe(mention?.source_context);
  });

  it('omits context when parsed mention offsets do not match original source text', () => {
    const source = artifact(['Rowan was present.']);
    source.spans[0].start_offset = 5;
    source.spans[0].end_offset += 5;
    const mention = processLayer6({ artifacts: [source] }).data.find(entity => entity.canonical_name === 'rowan')?.raw_mentions[0];
    expect(mention).toBeDefined();
    expect(mention?.source_context).toBeUndefined();
    expect(mention?.source_context_offset).toBeUndefined();
  });

  it.each([
    'Rowan’s dementia diagnosis remains the primary diagnosis contributing to the observed changes.',
    "Rowan's diabetes diagnosis is recorded in the assessment.",
    'Rowan’s care assessment was completed during the conference.',
  ])('classifies an independently evidenced clinical subject: %s', sentence => {
    const source = artifact(['Care Conference Agenda', 'General Care Concerns', sentence]);
    source.extraction_method = 'tesseract_ocr';
    source.spans = source.spans.map(span => ({ ...span, source_kind: 'ocr_page', page: 1 }));
    const entities = processLayer6({ artifacts: [source] }).data;
    const subject = entities.filter(entity => entity.canonical_name === 'rowan');
    expect(subject).toHaveLength(1);
    expect(subject[0].type).toBe('person');
    expect(subject[0].raw_mentions).toEqual([{
      raw_text: 'Rowan', artifact_key: source.artifact_key,
      span_offset: source.extracted_text.indexOf('Rowan'),
      source_context: sentence, source_context_offset: source.extracted_text.indexOf('Rowan'),
    }]);
    // A source's diagnosis assertion remains source text; entity classification
    // does not add a verified diagnosis, surname, or unsupported alias.
    expect(Object.keys(subject[0]).sort()).toEqual(['canonical_name', 'entity_id', 'raw_mentions', 'review_candidates', 'type']);
    expect(processLayer7({ artifacts: [source], entities }).data).toEqual([]);
  });

  it.each([
    ['Care Conference Agenda', 'Maybe Rowan’s diagnosis is recorded.'],
    ['Care Conference Agenda', 'If Rowan’s diagnosis is recorded, request review.'],
    ['Care Conference Agenda', 'Rowan’s diagnosis is not confirmed.'],
    ['Care Conference Agenda', 'Rowan’s diagnosis remains disputed.'],
    ['Care Conference Agenda', 'Rowan’s care assessment was completed?'],
    ['Veterinary care plan for the dog', 'Rowan’s dementia diagnosis remains recorded.'],
    ['Software device care plan', 'Rowan’s diagnosis is recorded.'],
    ['Unrelated source heading', 'Rowan’s dementia diagnosis remains recorded.'],
  ])('does not use unsupported or nonhuman diagnostic context: %s; %s', (heading, sentence) => {
    const subject = processLayer6({ artifacts: [artifact([heading, sentence])] }).data.find(entity => entity.canonical_name === 'rowan');
    expect(subject?.type).toBe('unknown');
  });

  it('does not import a care heading from another page or SMS message', () => {
    const source = artifact(['Care Conference Agenda', 'Rowan’s dementia diagnosis remains recorded for the resident.']);
    source.extraction_method = 'tesseract_ocr';
    source.spans = source.spans.map((span, index) => ({ ...span, source_kind: 'ocr_page', page: index + 1 }));
    expect(processLayer6({ artifacts: [source] }).data.find(entity => entity.canonical_name === 'rowan')?.type).toBe('unknown');

    source.extraction_method = 'sms_backup_xml';
    source.spans = source.spans.map(span => ({ ...span, source_kind: 'sms_message', message_kind: 'message', message_direction: 'received' }));
    expect(processLayer6({ artifacts: [source] }).data.find(entity => entity.canonical_name === 'rowan')?.type).toBe('unknown');
  });

  it('keeps a nearby different name and a different document’s bare name unresolved', () => {
    const source = artifact(['Care Conference Agenda', 'Rowan’s dementia diagnosis remains recorded.', 'Rohan was present.'], 'sha256:clinical-subject');
    const other = artifact(['Rowan was present.'], 'sha256:other-source');
    const result = processLayer6({ artifacts: [source, other] });
    const subject = result.data.find(entity => entity.canonical_name === 'rowan' && entity.type === 'person');
    expect(subject?.raw_mentions.map(mention => mention.artifact_key)).toEqual([source.artifact_key]);
    expect(result.data.find(entity => entity.canonical_name === 'rowan' && entity.type === 'unknown')?.raw_mentions.map(mention => mention.artifact_key)).toEqual([other.artifact_key]);
    expect(result.data.find(entity => entity.canonical_name === 'rohan')?.type).toBe('unknown');
    expect(processLayer6({ artifacts: [other, source] }).output_hash).toBe(result.output_hash);
  });

  it.each(['Cedar Clinic', 'Cedar Hospital', 'Cedar Corporation', 'Cedar Inc'])('does not classify an organization as a clinical person: %s', name => {
    const source = artifact(['Care Conference Agenda', `${name}’s care assessment was completed.`]);
    source.extraction_method = 'tesseract_ocr';
    source.spans = source.spans.map(span => ({ ...span, source_kind: 'ocr_page', page: 1 }));
    const result = processLayer6({ artifacts: [source] });
    expect(result.data.some(entity => entity.type === 'person')).toBe(false);
    if (name !== 'Cedar Inc') {
      expect(result.data.find(entity => entity.canonical_name === name.toLowerCase())?.type).toBe('organization');
    }
  });
});
