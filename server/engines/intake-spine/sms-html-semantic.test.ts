import { describe, expect, it } from 'vitest';
import { processLayer4 } from './layer-4-chronology_reconstruction';
import { processLayer6, type MessageAuthorBinding } from './layer-6-entity_registry';
import { processLayer7 } from './layer-7-relationship_graph';
import { processLayer9 } from './layer-9-state_timeline';
import { collectDerivedSemanticQualityIssues } from './derived-semantic-quality';
import { isSmsTransportMetadataLeak, sourceMessageLocalTimestamp } from './semantic-substrate';
import type { ParsedArtifact, TextSpan } from './parsing-substrate';
import { parseArtifact } from './parsing-substrate';

function messageArtifact(rows: Array<{ text: string; direction?: TextSpan['message_direction']; kind?: TextSpan['message_kind']; timestamp?: string }>, key = 'sha256:html-fixture'): ParsedArtifact {
  let offset = 0;
  const extracted_text = rows.map(row => row.text).join('\n');
  return {
    artifact_key: key, raw_bytes_sha256: 'a'.repeat(64), declared_mime_type: 'text/html',
    detected_mime_type: 'application/vnd.sms-backup-restore+html', mime_type: 'application/vnd.sms-backup-restore+html',
    byte_size: Buffer.byteLength(extracted_text), extracted_text,
    extraction_status: 'success', extraction_method: 'sms_backup_html', parser_version: 'fixture-v1',
    rule_version: 'fixture-v1', parser_rule_manifest_hash: 'b'.repeat(64),
    spans: rows.map((row, index) => {
      const span: TextSpan = {
        text: row.text, start_offset: offset, end_offset: offset + row.text.length,
        source_artifact_key: key, source_kind: 'sms_message', source_record_index: index,
        message_direction: row.direction ?? 'received', message_contact_name: 'Jordan Example',
        message_kind: row.kind ?? 'message', occurred_at_local: row.timestamp ?? '2026-01-05T23:59:42',
        occurred_at_timezone: 'unknown', source_timestamp_text: 'Jan 5, 2026 11:59:42 PM',
      };
      offset += row.text.length + 1;
      return span;
    }),
  };
}

function binding(artifact: ParsedArtifact, direction: 'received' | 'sent', author: string): MessageAuthorBinding {
  return { artifact_key: artifact.artifact_key, message_direction: direction, source_contact_name: 'Jordan Example', author_canonical_name: author, provenance_ref: `review:${direction}`, verification_state: 'verified' };
}

describe('SMS HTML downstream semantics', () => {
  it('carries real viewer-table parsing through chronology, binding, and graph with no markup leakage', async () => {
    const bytes = Buffer.from('<html><body><h2>Conversation with: Jordan Example</h2><table><tr><th>Type</th><th>Date</th><th>Name / Number</th><th>Content</th></tr><tr><td>Received<br/>Sent by: Jordan Example</td><td>Sep 7, 2026 12:16:44 PM</td><td>Jordan Example (+12065550100)</td><td>I am Rowan’s caregiver.<br/>Rowan is moving to a room in long term care.</td></tr><tr><td>Sent</td><td>Sep 7, 2026 12:18:00 PM</td><td>Jordan Example (+12065550100)</td><td>Liked “Rowan is moving to a room in long term care.”</td></tr></table></body></html>');
    const artifact = await parseArtifact('sha256:html-integration', bytes, 'text/html', 'viewer.html');
    expect(artifact.extraction_method).toBe('sms_backup_html');
    expect(artifact.spans).toHaveLength(2);
    expect(isSmsTransportMetadataLeak(artifact.extracted_text)).toBe(false);
    const entities = processLayer6({ artifacts: [artifact], message_author_bindings: [binding(artifact, 'received', 'Jordan Example')] }).data;
    const chronology = processLayer4({ artifacts: [artifact] }).data;
    const relationships = processLayer7({ artifacts: [artifact], entities }).data;
    const state_transitions = processLayer9({ artifacts: [artifact], entities }).data;
    expect(chronology).toHaveLength(1);
    expect(chronology[0]).toMatchObject({ date: '2026-09-07', source_message_local_time: '2026-09-07T12:16:44', source_message_timezone: 'unknown' });
    expect(relationships.map(relationship => relationship.type)).toEqual(['caregiver_recipient']);
    expect(collectDerivedSemanticQualityIssues({ artifacts: [artifact], entities, chronology, relationships, state_transitions })).toEqual([]);
  });

  it('retains the displayed local date and time without inventing an instant or timezone', () => {
    const artifact = messageArtifact([{ text: 'Rowan is moving to a room in long term care.' }]);
    const chronology = processLayer4({ artifacts: [artifact] });
    expect(chronology.data).toHaveLength(1);
    expect(chronology.data[0]).toMatchObject({ date: '2026-01-05', date_precision: 'exact', actor: null,
      source_message_local_time: '2026-01-05T23:59:42', source_message_timezone: 'unknown',
      source_message_timestamp_text: 'Jan 5, 2026 11:59:42 PM', verification_status: 'document_stated' });
    expect(artifact.spans[0].occurred_at).toBeUndefined();
    expect(chronology.unresolved_dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ field: `artifact:${artifact.artifact_key}:message_timezone` })]));
    const entities = processLayer6({ artifacts: [artifact] }).data;
    const transitions = processLayer9({ artifacts: [artifact], entities });
    expect(transitions.data.find(value => value.to_state === 'facility_admission')).toMatchObject({ transition_date: '2026-01-05', source_message_timezone: 'unknown', source_message_local_time: '2026-01-05T23:59:42' });
  });

  it('excludes reaction quotes from chronology and relationships while preserving their source rows', () => {
    const artifact = messageArtifact([{ text: 'Liked “I am Rowan’s caregiver and Rowan is moving to long term care.”', kind: 'reaction' }]);
    const entities = processLayer6({ artifacts: [artifact], message_author_bindings: [binding(artifact, 'received', 'Jordan Example')] }).data;
    expect(artifact.spans).toHaveLength(1);
    expect(processLayer4({ artifacts: [artifact] }).data).toEqual([]);
    expect(entities).toEqual([]);
    expect(processLayer7({ artifacts: [artifact], entities }).data).toEqual([]);
  });

  it('requires a reviewed binding for the new artifact and never treats a Sent correspondent as the author', () => {
    const artifact = messageArtifact([{ text: 'I am Rowan’s caregiver.', direction: 'sent' }]);
    const oldSourceBinding = { ...binding(artifact, 'sent', 'Alex Example'), artifact_key: 'sha256:old-xml' };
    const unresolved = processLayer6({ artifacts: [artifact], message_author_bindings: [oldSourceBinding, binding(artifact, 'received', 'Jordan Example')] });
    expect(unresolved.data.some(entity => ['alex example', 'jordan example'].includes(entity.canonical_name))).toBe(false);
    expect(unresolved.unresolved_dependencies.some(value => value.detail.includes('no verified participant-author binding'))).toBe(true);
    const bound = processLayer6({ artifacts: [artifact], message_author_bindings: [binding(artifact, 'sent', 'Alex Example')] });
    expect(bound.data.find(entity => entity.canonical_name === 'alex example')?.raw_mentions[0]).toMatchObject({ raw_text: 'I', binding_provenance_refs: ['review:sent'] });
    expect(bound.data.some(entity => entity.canonical_name === 'jordan example')).toBe(false);
    expect(processLayer7({ artifacts: [artifact], entities: bound.data }).data).toHaveLength(1);
  });

  it('keeps message boundaries when constructing author mentions and source context', () => {
    const artifact = messageArtifact([
      { text: 'I am Rowan’s caregiver.', direction: 'received' },
      { text: 'I have power of attorney for Taylor.', direction: 'sent' },
    ]);
    const result = processLayer6({ artifacts: [artifact], message_author_bindings: [binding(artifact, 'received', 'Jordan Example'), binding(artifact, 'sent', 'Alex Example')] });
    expect(result.data.find(entity => entity.canonical_name === 'jordan example')?.raw_mentions[0].source_context).toBe(artifact.spans[0].text);
    expect(result.data.find(entity => entity.canonical_name === 'alex example')?.raw_mentions[0].source_context).toBe(artifact.spans[1].text);
    const relationships = processLayer7({ artifacts: [artifact], entities: result.data }).data;
    expect(relationships).toHaveLength(2);
    for (const relationship of relationships) expect(relationship.source_refs).toHaveLength(1);
  });

  it.each(['2026-02-30T12:00:00', '2026-01-05T24:00:00', '2026-01-05T12:00:00Z'])('refuses an invalid or timezone-injected local timestamp: %s', timestamp => {
    const artifact = messageArtifact([{ text: 'Rowan is moving to long term care.', timestamp }]);
    expect(sourceMessageLocalTimestamp(artifact.spans[0])).toBeUndefined();
    expect(processLayer4({ artifacts: [artifact] }).data).toEqual([]);
  });

  it('preserves the existing XML instant date behavior', () => {
    const artifact = messageArtifact([{ text: 'Rowan is moving to long term care.' }]);
    artifact.extraction_method = 'sms_backup_xml';
    artifact.spans[0].occurred_at = '2026-01-06T07:59:42.000Z';
    delete artifact.spans[0].occurred_at_local;
    delete artifact.spans[0].occurred_at_timezone;
    const chronology = processLayer4({ artifacts: [artifact] });
    expect(chronology.data[0].date).toBe('2026-01-06');
    expect(chronology.data[0].source_message_timezone).toBeUndefined();
    expect(chronology.unresolved_dependencies).toEqual([]);
  });

  it('applies the provenance and transport-leak gate to HTML message artifacts', () => {
    const artifact = messageArtifact([{ text: '<table><tr><td>Rowan is moving to long term care.</td></tr></table>' }]);
    expect(isSmsTransportMetadataLeak(artifact.extracted_text)).toBe(true);
    const issues = collectDerivedSemanticQualityIssues({ artifacts: [artifact], entities: [], chronology: [], relationships: [], state_transitions: [] });
    expect(issues.some(issue => issue.code === 'sms_transport_metadata_in_extracted_text')).toBe(true);
  });
});
