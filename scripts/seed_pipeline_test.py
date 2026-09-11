"""Exact-value regression tests for source preservation and governed reconciliation."""
import copy
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zipfile
from seed_source_parsers import SourceParseError, parse_sql_rows, parse_workbook
from build_registry import ensure_schema, process_source, process_zip_members
from advocacy_lane_import import canonical_json, digest, prepare_reconciliation, source_document, sql_value, SCHEMA_PATH


def workbook(target='worksheets/sheet1.xml', missing=False):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Law &amp; Rights" r:id="r1"/><sheet name="Empty" r:id="r2"/><sheet name="Blank" r:id="r3"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships>' + ('' if missing else f'<Relationship Target="{target}" Id="r1"/>') + '<Relationship Target="worksheets/empty.xml" Id="r2"/><Relationship Target="worksheets/blank.xml" Id="r3"/></Relationships>')
        archive.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"/><row r="2"><c r="A2" t="inlineStr"><is><t>citation</t></is></c><c r="B2" t="inlineStr"><is><t>name</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>123 US 456</t></is></c><c r="B4" t="inlineStr"><is><t>O\'Brien</t></is></c></row></sheetData></worksheet>')
        archive.writestr('xl/worksheets/empty.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>')
        archive.writestr('xl/worksheets/blank.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t> </t></is></c></row></sheetData></worksheet>')
    return stream.getvalue()


def reconciliation_fixture(root):
    record = {'citation': '123 US 456', 'caseName': "O'Brien v. State", 'holding': 'Holding', 'domains': ['housing'], 'keyQuotes': ['Quote']}
    raw = json.dumps({'case_law': [record]}).encode()
    (root / 'legal.json').write_bytes(raw)
    manifest = {'sources': [{'source_id': 'legal_priority_1', 'path': 'legal.json', 'sha256': digest(raw)}], 'bindings': [{
        'source_id': 'legal_priority_1', 'source_record_id': 'citation:123 US 456', 'source_pointer': '/case_law/0',
        'source_record_sha256': digest(canonical_json(record).encode()), 'target_table': 'public.legal_case_law',
        'canonical_identity': {'id': '00000000-0000-0000-0000-000000000001'},
        'identity_evidence': {'citation': '/citation'},
        'expected_existing': {'citation': '123 US 456', 'case_name': None, 'summary': None, 'domains': None, 'key_quotes': None},
        'field_mapping': {'case_name': {'source_pointer': '/caseName'}, 'summary': {'source_pointer': '/holding'},
                          'domains': {'source_pointer': '/domains'}, 'key_quotes': {'source_pointer': '/keyQuotes'}}}]}
    return manifest


class SourceParserTests(unittest.TestCase):
    def test_native_docx_uses_shared_parser_and_can_bind_complete_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = reconciliation_fixture(root)
            payload = json.loads((root / 'legal.json').read_text())
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, 'w') as archive:
                text = json.dumps(payload).replace('&', '&amp;').replace('<', '&lt;')
                archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>')
            raw = stream.getvalue()
            (root / 'legal.docx').write_bytes(raw)
            manifest['sources'][0].update(path='legal.docx', sha256=digest(raw))
            manifest['bindings'][0]['source_pointer'] = '/native_records/0/record'
            parsed = source_document('legal.docx', raw)
            self.assertEqual(parsed['native_records'][0]['record'], payload['case_law'][0])
            sql, receipt = prepare_reconciliation(root, manifest, json.loads(SCHEMA_PATH.read_text()))
            self.assertTrue(sql.endswith('ROLLBACK;\n'))
            self.assertEqual(receipt['records'][0]['source_sha256'], digest(raw))

    def test_sql_apostrophes_comments_and_multiple_inserts(self):
        rows = parse_sql_rows(b"-- initial comment\nINSERT INTO legal (id,name) VALUES (1,'O''Brien'), (2,'Semi;colon'); /* middle */ INSERT INTO legal(id,name) VALUES (3,'Last');")
        self.assertEqual(rows, [('legal', {'id': 1, 'name': "O'Brien"}), ('legal', {'id': 2, 'name': 'Semi;colon'}), ('legal', {'id': 3, 'name': 'Last'})])

    def test_unsupported_sql_fails_instead_of_partial_rows(self):
        for raw in [b"INSERT INTO t(id) VALUES(1); INSERT INTO t SELECT 2;", b"INSERT INTO t(id) VALUES(now());", b"INSERT INTO t(id) VALUES('unfinished);", b"UPDATE t SET id=2;"]:
            with self.subTest(raw=raw), self.assertRaises((SourceParseError, ValueError)):
                parse_sql_rows(raw)

    def test_decimal_precision_is_preserved_as_source_text(self):
        self.assertEqual(parse_sql_rows(b"INSERT INTO t(amount) VALUES (9007199254740993.0), (0.123456789012345678901);")[0][1]['amount'], '9007199254740993.0')

    def test_duplicate_zip_members_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'duplicate.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('source.json', '[{"id":1}]')
                archive.writestr('source.json', '[{"id":2}]')
            conn = sqlite3.connect(':memory:'); ensure_schema(conn)
            with self.assertRaisesRegex(ValueError, 'duplicate ZIP member'): process_zip_members(conn, path)
            conn.close()

    def test_output_cannot_replace_source(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.json'
            raw = b'[{"id":1}]'; source.write_bytes(raw)
            run = subprocess.run([sys.executable, str(Path(__file__).with_name('build_registry.py')), '--output-db', str(source), '--inputs', str(source)], capture_output=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertEqual(source.read_bytes(), raw)

    def test_arrays_and_dollar_strings(self):
        self.assertEqual(parse_sql_rows(b"INSERT INTO t(name, domains) VALUES ($$O'Brien$$, ARRAY['one','two']);"), [('t', {'name': "O'Brien", 'domains': ['one', 'two']})])

    def test_absolute_inline_leading_empty_and_empty_sheet_receipts(self):
        records, receipts = parse_workbook(workbook('/xl/worksheets/sheet1.xml'))
        self.assertEqual(receipts, [{'sheet': 'Law & Rights', 'total': 2, 'data': 1, 'header': 1, 'preamble': 0}, {'sheet': 'Empty', 'total': 0, 'data': 0, 'header': 0, 'preamble': 0}, {'sheet': 'Blank', 'total': 0, 'data': 0, 'header': 0, 'preamble': 0}])
        self.assertEqual(records[1][1]['values'], {'citation': '123 US 456', 'name': "O'Brien"})
        self.assertEqual(records[1][1]['__source__']['row'], 4)
        self.assertEqual(records[1][1]['__source__']['row_role'], 'data')

    def test_missing_relationship_fails(self):
        with self.assertRaisesRegex(SourceParseError, 'relationship'): parse_workbook(workbook(missing=True))

    def test_registry_preserves_metadata_ndjson_and_duplicate_origins(self):
        conn = sqlite3.connect(':memory:')
        ensure_schema(conn)
        raw = b'{"metadata":{"version":2},"case_law":[{"citation":"123 US 456"}]}'
        process_source(conn, 'one.json', 'one.json', raw)
        process_source(conn, 'duplicate.json', 'duplicate.json', raw)
        process_source(conn, 'sais.ndjson', 'sais.ndjson', b'{"resource_id":"s1"}\n')
        self.assertEqual(conn.execute('select count(*) from registry_record').fetchone()[0], 3)
        self.assertEqual(conn.execute('select count(*) from source_manifest where is_duplicate=1').fetchone()[0], 1)
        payloads = [json.loads(row[0]) for row in conn.execute('select payload_json from registry_record')]
        self.assertIn({'values': {'metadata': {'version': 2}}, '__source__': {'row_role': 'metadata'}}, payloads)
        conn.close()

    def test_failed_cli_does_not_replace_existing_registry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'broken.sql'
            source.write_text('INSERT INTO t SELECT 1;')
            output = root / 'registry.db'
            output.write_bytes(b'previous valid artifact')
            run = subprocess.run([sys.executable, str(Path(__file__).with_name('build_registry.py')), '--output-db', str(output), '--inputs', str(source)], capture_output=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertEqual(output.read_bytes(), b'previous valid artifact')
            self.assertFalse(json.loads(output.with_suffix('.db.failure.json').read_text())['output_replaced'])


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.manifest = reconciliation_fixture(self.root)
        self.schema = json.loads(SCHEMA_PATH.read_text())

    def tearDown(self):
        self.temporary.cleanup()

    def test_verified_key_typed_jsonb_and_rollback_receipt(self):
        sql, receipt = prepare_reconciliation(self.root, self.manifest, self.schema)
        self.assertTrue(sql.endswith('ROLLBACK;\n'))
        self.assertIn('UPDATE "public"."legal_case_law"', sql)
        self.assertNotIn('ON CONFLICT', sql)
        self.assertNotIn('case_id', sql)
        self.assertNotIn('contact_email', sql)
        self.assertIn('::jsonb', sql)
        self.assertEqual(receipt['records'][0]['canonical_identity'], {'id': '00000000-0000-0000-0000-000000000001'})
        self.assertFalse(receipt['runtime_integration_verified'])

    def test_nonblank_values_cannot_be_overwritten(self):
        self.manifest['bindings'][0]['expected_existing']['summary'] = 'Existing curated holding'
        with self.assertRaisesRegex(ValueError, 'nonblank canonical conflict'):
            prepare_reconciliation(self.root, self.manifest, self.schema)

    def test_missing_sources_bad_hash_wrong_identity_fail(self):
        variants = []
        for mutation in [lambda m: m['sources'][0].update(path='missing.json'), lambda m: m['sources'][0].update(sha256='bad'), lambda m: m['bindings'][0].update(canonical_identity={'case_id': 'guessed'}), lambda m: m['bindings'][0]['expected_existing'].update(citation='wrong')]:
            variant = copy.deepcopy(self.manifest); mutation(variant); variants.append(variant)
        for variant in variants:
            with self.subTest(variant=variant), self.assertRaises(ValueError): prepare_reconciliation(self.root, variant, self.schema)

    def test_unknown_table_and_duplicate_canonical_bindings_fail(self):
        self.manifest['bindings'].append(copy.deepcopy(self.manifest['bindings'][0]))
        self.manifest['bindings'][1]['source_record_id'] = 'different-source-id'
        with self.assertRaisesRegex(ValueError, 'multiple bindings'): prepare_reconciliation(self.root, self.manifest, self.schema)
        self.manifest['bindings'] = self.manifest['bindings'][:1]
        self.manifest['bindings'][0]['target_table'] = 'public.reform_campaigns'
        with self.assertRaises(KeyError): prepare_reconciliation(self.root, self.manifest, self.schema)

    def test_lists_require_explicit_adapter_for_text(self):
        with self.assertRaisesRegex(ValueError, 'explicit text adapter'): sql_value(['item'], {'type': 'text', 'required': False})
        self.assertEqual(sql_value(['item'], {'type': 'jsonb', 'required': False}), '\'["item"]\'::jsonb')

    def test_archive_jsonl_csv_and_manifest_are_preserved(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr('registry.jsonl', '{"id":"one"}\n')
            archive.writestr('registry.csv', 'id,name\none,Person\n')
            archive.writestr('manifest.json', '{"version":1}')
        self.assertEqual(source_document('legislators.zip', stream.getvalue()), {'registry.jsonl': [{'id': 'one'}], 'registry.csv': [{'id': 'one', 'name': 'Person'}], 'manifest.json': {'version': 1}})


if __name__ == '__main__': unittest.main()
