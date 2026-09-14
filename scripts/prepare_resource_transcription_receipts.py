#!/usr/bin/env python3
"""Check an individually authored correction packet; never discover or classify records.

Inputs are explicit IDs, before/after values and exact DOCX coordinates already
reviewed by a person or agent. This offline checker reads only those coordinates,
checks source bytes and literal transcription, and emits append-only receipts.
It cannot connect to a database, activate a dossier or verify source assertions.
"""
import argparse
import hashlib
import json
import io
from pathlib import Path
import uuid
import zipfile
from lxml import etree

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
FIELDS = ('name', 'organization_name', 'phone', 'email', 'website_url', 'address',
          'eligibility_summary', 'apply_notes', 'description')

def prepare_receipts(packet_bytes, source_bytes, current_rows, reviewed_by):
    packet = json.loads(packet_bytes)
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    if source_hash != packet['source_sha256']:
        raise ValueError('source_bytes_changed')
    with zipfile.ZipFile(io.BytesIO(source_bytes)) as package:
        root = etree.fromstring(package.read('word/document.xml'),
            etree.XMLParser(resolve_entities=False, no_network=True))
    paragraphs = root.xpath('//w:p', namespaces=NS)
    current_by_ref = {}
    for current in current_rows:
        if current['object_ref'] in current_by_ref:
            raise ValueError('ambiguous_current_object')
        current_by_ref[current['object_ref']] = current
    receipts, seen = [], set()
    for record in packet['records']:
        ref = record['object_ref']
        if ref in seen:
            raise ValueError('duplicate_reviewed_object')
        seen.add(ref)
        current = current_by_ref[ref]
        if current['source_content_sha256'] != source_hash or record['source_sha256'] != source_hash:
            raise ValueError('current_source_changed')
        if current['source_locator'] != record['existing_source_locator']:
            raise ValueError('current_locator_changed')
        stable_id = str(uuid.UUID(hashlib.md5(ref.encode()).hexdigest()))
        if record['resource_entity_id'] != stable_id:
            raise ValueError('resource_identity_changed')
        if current['person_facing_ready'] is not True or current['object_class'] != 'resource':
            raise ValueError('existing_publication_gate_required')
        # Compare the previously inspected projection, not just its source hash.
        for field, value in record['current_projection'].items():
            if field != 'resource_entity_id' and current.get(field) != value:
                raise ValueError('reviewed_before_value_changed:' + field)
        span = record['source_span']
        if span['part'] != 'word/document.xml':
            raise ValueError('unsupported_source_part')
        start = root.xpath(span['xpath_start'], namespaces=NS)
        end = root.xpath(span['xpath_end'], namespaces=NS)
        if len(start) != 1 or len(end) != 1 or start[0] not in paragraphs or end[0] not in paragraphs:
            raise ValueError('source_coordinate_not_unique')
        start_index, end_index = paragraphs.index(start[0]), paragraphs.index(end[0])
        if start_index > end_index:
            raise ValueError('source_span_reversed')
        source_paragraphs = [''.join(p.xpath('.//w:t/text()', namespaces=NS))
                             for p in paragraphs[start_index:end_index + 1]]
        if source_paragraphs != list(record['source_text'].values()):
            raise ValueError('reviewed_source_text_changed:' + ref)
        source_text = '\n'.join(source_paragraphs)
        proposed = dict(record['proposed_fields'])
        proposed['name'] = proposed.pop('resource_name')
        proposed['organization_name'] = proposed['name']
        # Category is an interpretation, not a literal transcription.
        proposed.pop('resource_category', None)
        before, after = {}, {}
        for field, value in proposed.items():
            if field not in FIELDS:
                raise ValueError('field_not_permitted:' + field)
            if current.get(field) == value:
                continue
            if field == 'website_url' and value is not None and not value.startswith(('https://', 'http://')):
                raise ValueError('http_url_required')
            if value is not None and (not isinstance(value, str) or not value or value not in source_text):
                raise ValueError('literal_transcription_required:' + field)
            before[field], after[field] = current.get(field), value
        if not after:
            raise ValueError('empty_correction')
        receipt = {key: current[key] for key in ('civic_object_uid', 'object_ref', 'run_id',
            'artifact_key', 'source_content_sha256', 'source_candidate_hash', 'source_locator')}
        receipt.update(operation='correct', supersedes_revision_id=None, resource_entity_id=stable_id,
            before_fields=before, after_fields=after, source_span=span, source_text=source_text,
            review_ledger_sha256=hashlib.sha256(packet_bytes).hexdigest(), reviewed_by=reviewed_by,
            review_method='individual_source_transcription', review_scope='source_assertion_only',
            review_note='Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.')
        # Deterministic receipt ID binds the complete review payload, not a name.
        digest = hashlib.sha256(json.dumps(receipt, sort_keys=True, ensure_ascii=False,
            separators=(',', ':')).encode()).hexdigest()
        receipt['revision_id'] = str(uuid.UUID(digest[:32]))
        receipts.append(receipt)
    return receipts

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--current-rows', required=True)
    parser.add_argument('--reviewed-by', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    if not args.reviewed_by.strip():
        raise ValueError('reviewer_required')
    receipts = prepare_receipts(Path(args.packet).read_bytes(), Path(args.source).read_bytes(),
        json.loads(Path(args.current_rows).read_bytes()), args.reviewed_by)
    Path(args.out).write_text(json.dumps(receipts, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'receipts': len(receipts), 'remote_writes': 0, 'scope': 'source_assertion_only'}))

if __name__ == '__main__':
    main()
