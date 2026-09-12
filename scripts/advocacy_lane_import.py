#!/usr/bin/env python3
"""Prepare rollback-only reconciliation using reviewed source and existing-row bindings.

No database connection, guessed identity, table creation, or implicit field erasure.
The manifest explicitly bounds the run; this is not a full-corpus import claim.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import tempfile
import uuid
import zipfile
from seed_source_parsers import parse_sql_rows
from seed_document_adapter import parse_document_source

SCHEMA_PATH = Path(__file__).resolve().parents[1] / 'config/advocacy-import-schema-v1.json'


def canonical_json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def quote(value):
    if '\x00' in value: raise ValueError('PostgreSQL text cannot contain NUL')
    return "'" + value.replace("'", "''") + "'"


def identifier(value):
    if not re.fullmatch(r'[a-z_][a-z0-9_]*', value): raise ValueError('invalid owned identifier')
    return '"' + value + '"'


def sql_value(value, column):
    kind = column['type']
    if value is None:
        if column['required']: raise ValueError('NULL for required column')
        return 'NULL'
    if kind == 'text[]':
        if not isinstance(value, list) or any(item is not None and not isinstance(item, str) for item in value):
            raise ValueError('one-dimensional text array required')
        return 'ARRAY[' + ','.join('NULL' if item is None else quote(item) for item in value) + ']::text[]'
    if kind in {'json', 'jsonb'}: return quote(canonical_json(value)) + '::' + kind
    if kind in {'text', 'character varying', 'uuid', 'date', 'timestamp with time zone', 'timestamp without time zone'}:
        if not isinstance(value, str): raise ValueError(f'explicit text adapter required for {kind}')
        if kind == 'uuid': uuid.UUID(value)
        return quote(value) + '::' + kind
    if kind in {'smallint', 'integer', 'bigint'}:
        if type(value) is not int: raise ValueError('integer required')
        return str(value) + '::' + kind
    if kind == 'boolean':
        if type(value) is not bool: raise ValueError('boolean required')
        return 'TRUE' if value else 'FALSE'
    if kind in {'numeric', 'real', 'double precision'}:
        if type(value) not in {int, float} or not math.isfinite(value): raise ValueError('finite number required')
        return str(value) + '::' + kind
    raise ValueError(f'unsupported target type: {kind}')


def pointer(document, location):
    if location == '': return document
    if not location.startswith('/'): raise ValueError('JSON pointer required')
    for token in location[1:].split('/'):
        token = token.replace('~1', '/').replace('~0', '~')
        if isinstance(document, list):
            if not re.fullmatch(r'0|[1-9][0-9]*', token): raise ValueError('invalid array locator')
            document = document[int(token)]
        else: document = document[token]
    return document


def source_document(name, raw):
    suffix = Path(name).suffix.lower()
    if suffix == '.docx':
        return parse_document_source(name, raw)
    if suffix == '.zip':
        inspected = parse_document_source(name, raw)
        if any(hold['code'] in {'archive_manifest_mismatch', 'archive_checksum_mismatch', 'manifest_entry_unsupported'}
               for hold in inspected['holds']):
            raise ValueError('archive integrity hold prevents canonical reconciliation')
        documents = {}
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            for member in archive.infolist():
                if member.is_dir(): continue
                if member.filename in documents: raise ValueError('duplicate ZIP member')
                documents[member.filename] = source_document(member.filename, archive.read(member))
        return documents
    text = raw.decode('utf-8-sig')
    if suffix == '.json': return json.loads(text)
    if suffix in {'.jsonl', '.ndjson'}: return [json.loads(line) for line in text.splitlines() if line.strip()]
    if suffix == '.csv':
        reader = csv.DictReader(io.StringIO(text), strict=True)
        rows = list(reader)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames): raise ValueError('invalid CSV headers')
        if any(None in row or None in row.values() for row in rows): raise ValueError('CSV cardinality mismatch')
        return rows
    if suffix == '.sql':
        tables = {}
        for table, record in parse_sql_rows(raw): tables.setdefault(table, []).append(record)
        return tables
    raise ValueError(f'unsupported reconciliation source: {name}')


def schema_guard(table, contract):
    schema, relation = table.split('.')
    checks = []
    for name, column in contract['columns'].items():
        type_check = "data_type='ARRAY' and udt_schema='pg_catalog' and udt_name='_text'" if column['type'] == 'text[]' else 'data_type=' + quote(column['type'])
        checks.append('exists (select 1 from information_schema.columns where table_schema=' + quote(schema)
                      + ' and table_name=' + quote(relation) + ' and column_name=' + quote(name)
                      + ' and ' + type_check + ' and is_nullable='
                      + quote('NO' if column['required'] else 'YES') + ')')
    primary_key = 'ARRAY[' + ','.join(quote(key) for key in contract['primary_key']) + ']::text[]'
    checks.append('(select array_agg(a.attname::text order by k.ordinality) from pg_index i '
                  'cross join lateral unnest(i.indkey) with ordinality k(attnum, ordinality) '
                  'join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum '
                  'where i.indrelid=to_regclass(' + quote(table) + ') and i.indisprimary) = ' + primary_key)
    return 'IF NOT coalesce((' + ' AND '.join(checks) + "), false) THEN RAISE EXCEPTION 'schema contract changed'; END IF;"


def prepare_reconciliation(root, manifest, schema):
    if not manifest.get('sources') or not manifest.get('bindings'): raise ValueError('explicit sources and canonical bindings required')
    sources, artifacts = {}, []
    for specification in manifest['sources']:
        source_id = specification['source_id']
        path = (root / specification['path']).resolve()
        if not source_id or source_id in sources: raise ValueError('duplicate or missing source identity')
        if not path.is_relative_to(root.resolve()) or not path.is_file(): raise ValueError(f'missing source: {source_id}')
        raw = path.read_bytes()
        if digest(raw) != specification['sha256']: raise ValueError(f'source hash mismatch: {source_id}')
        sources[source_id] = source_document(path.name, raw)
        artifacts.append({**specification, 'bytes': len(raw)})
    statements, receipts, readbacks = [], [], []
    targets, identities, contracts = set(), set(), {}
    for binding in manifest['bindings']:
        source_id, stable_id = binding['source_id'], binding['source_record_id']
        if not isinstance(stable_id, str) or not stable_id.strip() or (source_id, stable_id) in identities:
            raise ValueError('missing or duplicate stable source record identity')
        identities.add((source_id, stable_id))
        record = pointer(sources[source_id], binding['source_pointer'])
        source = sources[source_id]
        if isinstance(source, dict) and source.get('publication_state') == 'governed_non_public':
            if any(hold['code'] in {'malformed_document_xml', 'resource_field_conflict', 'metadata_table_cardinality',
                                   'missing_or_duplicate_resource_id'} for hold in source.get('holds', [])):
                raise ValueError('document integrity hold prevents canonical reconciliation')
            if not (re.fullmatch(r'/resources/[0-9]+', binding['source_pointer'])
                    or re.fullmatch(r'/native_records/[0-9]+/record', binding['source_pointer'])):
                raise ValueError('document observations and OCR require explicit review before canonical binding')
            original_id = record.get('resource_id') or record.get('uuid') or record.get('id')
            if original_id is not None and stable_id != original_id:
                raise ValueError('document binding must use the original source identity')
        record_hash = digest(canonical_json(record).encode())
        if record_hash != binding['source_record_sha256']: raise ValueError('source record hash mismatch')
        table = binding['target_table']
        contract = schema['tables'][table]
        contracts[table] = contract
        qualified = '.'.join(identifier(part) for part in table.split('.'))
        identity = binding['canonical_identity']
        if set(identity) != set(contract['primary_key']): raise ValueError('verified primary key required')
        target = (table, canonical_json(identity))
        if target in targets: raise ValueError('multiple bindings for one canonical row; reconcile first')
        targets.add(target)
        columns = contract['columns']
        where = ' AND '.join(identifier(key) + ' = ' + sql_value(value, columns[key]) for key, value in identity.items())
        baseline, evidence = binding['expected_existing'], binding['identity_evidence']
        if not evidence or not set(evidence).issubset(baseline): raise ValueError('observed identity evidence required')
        for key, location in evidence.items():
            if pointer(record, location) != baseline[key] or baseline[key] in (None, ''): raise ValueError('canonical identity evidence disagrees')
        checks = [identifier(key) + ' IS NOT DISTINCT FROM ' + sql_value(value, columns[key]) for key, value in baseline.items()]
        assignments, fields = [], []
        for key, mapping in binding['field_mapping'].items():
            if key in identity or key not in baseline: raise ValueError('mapped non-key field requires observed baseline')
            proposed = pointer(record, mapping['source_pointer'])
            adapter = mapping.get('adapter', 'identity')
            if adapter == 'json_text': proposed = canonical_json(proposed)
            elif adapter == 'decimal_integer' and isinstance(proposed, str) and re.fullmatch(r'[1-9][0-9]*', proposed): proposed = int(proposed)
            elif adapter == 'boolean_integer' and type(proposed) is bool: proposed = int(proposed)
            elif adapter != 'identity': raise ValueError('unsupported field adapter')
            sql_value(proposed, columns[key])
            existing = baseline[key]
            if proposed in (None, ''): outcome = 'preserved_absent_source_value'
            elif existing == proposed: outcome = 'already_equal'
            elif existing is None or isinstance(existing, str) and not existing.strip():
                outcome = 'fill_blank'
                assignments.append(identifier(key) + ' = ' + sql_value(proposed, columns[key]))
            else: raise ValueError(f'nonblank canonical conflict: {source_id}:{stable_id}:{key}')
            fields.append({'column': key, 'outcome': outcome, 'source_pointer': mapping['source_pointer']})
        statements.append(f'PERFORM 1 FROM {qualified} WHERE {where} AND {" AND ".join(checks)} FOR UPDATE;\n'
                          "IF NOT FOUND THEN RAISE EXCEPTION 'canonical identity or expected values changed'; END IF;")
        if assignments: statements.append(f'UPDATE {qualified} SET {", ".join(assignments)} WHERE {where};')
        receipt = {'source_id': source_id, 'source_sha256': next(a['sha256'] for a in artifacts if a['source_id'] == source_id),
                   'source_record_id': stable_id, 'source_record_sha256': record_hash, 'source_pointer': binding['source_pointer'],
                   'canonical_table': table, 'canonical_identity': identity, 'fields': fields, 'runtime_readback': 'not_measured'}
        receipts.append(receipt)
        readbacks.append('SELECT ' + quote(canonical_json(receipt)) + '::jsonb AS source_receipt, to_jsonb(canonical_row) AS canonical_row FROM '
                         + qualified + ' AS canonical_row WHERE ' + where + ';')
    body = '\n'.join([schema_guard(table, contract) for table, contract in contracts.items()] + statements)
    sql = '-- Isolated PostgreSQL reconciliation preview; rollback is mandatory.\nBEGIN;\nSET LOCAL standard_conforming_strings = on;\n'
    sql += 'DO ' + quote('BEGIN\n' + body + '\nEND;') + ';\n' + '\n'.join(readbacks) + '\nROLLBACK;\n'
    return sql, {'status': 'prepared_rollback_preview', 'runtime_integration_verified': False,
                 'scope': 'explicit_manifest_bindings_only', 'artifacts': artifacts, 'records': receipts}


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream: stream.write(content)
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True)
    parser.add_argument('--bindings', required=True, help='Reviewed source, identity, and field manifest')
    parser.add_argument('--output', required=True)
    parser.add_argument('--receipt', required=True)
    args = parser.parse_args()
    root, bindings = Path(args.source_root).resolve(), Path(args.bindings).resolve()
    output, receipt = Path(args.output).resolve(), Path(args.receipt).resolve()
    if output == receipt or output == bindings or receipt == bindings or output.is_relative_to(root) or receipt.is_relative_to(root):
        raise ValueError('outputs must be distinct and outside preserved source root')
    try:
        sql, result = prepare_reconciliation(root, json.loads(bindings.read_text()), json.loads(SCHEMA_PATH.read_text()))
        atomic_write(output, sql)
        result['sql_sha256'] = digest(sql.encode())
        atomic_write(receipt, json.dumps(result, indent=2))
    except Exception as error:
        atomic_write(receipt, json.dumps({'status': 'failed', 'runtime_integration_verified': False,
                     'error_type': type(error).__name__, 'error': str(error)}, indent=2))
        raise
    print(f"prepared_records={len(result['records'])}; rollback_only=true; runtime_integration_verified=false")


if __name__ == '__main__': main()
