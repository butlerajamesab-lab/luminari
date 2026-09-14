import copy
import io
import json
import hashlib
import unittest
import uuid
import zipfile
from prepare_resource_transcription_receipts import prepare_receipts

class SourceTranscriptionTests(unittest.TestCase):
    def fixture(self):
        docx = io.BytesIO()
        with zipfile.ZipFile(docx, 'w') as z:
            z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Example service</w:t></w:r></w:p><w:p><w:r><w:t>303-111-1111</w:t></w:r></w:p></w:body></w:document>')
        source = docx.getvalue()
        source_hash = hashlib.sha256(source).hexdigest()
        current = dict(object_ref='example', civic_object_uid='corpus:example', run_id=str(uuid.uuid4()),
            artifact_key='example.docx', source_content_sha256=source_hash, source_candidate_hash='b'*64,
            source_locator='lines:1-2', object_class='resource', person_facing_ready=True,
            name='Phone', phone=None, organization_name='Phone')
        record = dict(object_ref='example', source_sha256=source_hash, existing_source_locator='lines:1-2',
            resource_entity_id=str(uuid.UUID(hashlib.md5(b'example').hexdigest())),
            current_projection={'name': 'Phone'},
            source_span=dict(part='word/document.xml', xpath_start='/w:document/w:body/w:p[1]', xpath_end='/w:document/w:body/w:p[2]'),
            source_text={'P1':'Example service','P2':'303-111-1111'},
            proposed_fields=dict(resource_name='Example service', phone='303-111-1111',resource_category='housing'))
        return source, dict(source_sha256=source_hash,records=[record]), [current]

    def test_receipt_preserves_scope_and_ignores_semantic_category(self):
        source, packet, current = self.fixture()
        result = prepare_receipts(json.dumps(packet).encode(), source, current, 'agent reviewer')
        self.assertEqual(result[0]['after_fields'], {'name':'Example service','organization_name':'Example service','phone':'303-111-1111'})
        self.assertEqual(result[0]['review_scope'], 'source_assertion_only')
        self.assertEqual(result, prepare_receipts(json.dumps(packet).encode(), source, current, 'agent reviewer'))

    def test_rejects_changed_source_generation_coordinates_and_quoted_text(self):
        source, packet, current = self.fixture()
        with self.assertRaisesRegex(ValueError,'source_bytes_changed'):
            prepare_receipts(json.dumps(packet).encode(), source+b'changed', current, 'reviewer')
        altered=copy.deepcopy(packet)
        altered['records'][0]['source_span']['xpath_start']='/w:document/w:body/w:p[9]'
        with self.assertRaisesRegex(ValueError,'source_coordinate_not_unique'):
            prepare_receipts(json.dumps(altered).encode(), source, current, 'reviewer')
        altered=copy.deepcopy(packet)
        altered['records'][0]['source_text']['P1']='Other organization'
        with self.assertRaisesRegex(ValueError,'reviewed_source_text_changed'):
            prepare_receipts(json.dumps(altered).encode(), source, current, 'reviewer')

    def test_rejects_stale_before_fields_invented_content_and_held_objects(self):
        source, packet, current = self.fixture()
        changed=copy.deepcopy(current)
        changed[0]['name']='Another generation'
        with self.assertRaisesRegex(ValueError,'reviewed_before_value_changed'):
            prepare_receipts(json.dumps(packet).encode(), source, changed, 'reviewer')
        changed=copy.deepcopy(packet)
        changed['records'][0]['proposed_fields']['phone']='303-999-9999'
        with self.assertRaisesRegex(ValueError,'literal_transcription_required'):
            prepare_receipts(json.dumps(changed).encode(), source, current, 'reviewer')
        current[0]['person_facing_ready']=False
        with self.assertRaisesRegex(ValueError,'existing_publication_gate_required'):
            prepare_receipts(json.dumps(packet).encode(), source, current, 'reviewer')

if __name__ == '__main__':
    unittest.main()
