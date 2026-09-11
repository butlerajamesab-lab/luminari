"""Loss-aware source parsers. These emit observations, never canonical records."""
from __future__ import annotations

import io
import re
import posixpath
import zipfile
from xml.etree import ElementTree as ET


class SourceParseError(ValueError):
    pass


def sql_tokens(text: str) -> list[tuple[str, str]]:
    tokens = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            i += 1
            continue
        if text.startswith('--', i):
            end = text.find('\n', i)
            i = len(text) if end < 0 else end + 1
            continue
        if text.startswith('/*', i):
            depth = 1
            i += 2
            while i < len(text) and depth:
                if text.startswith('/*', i): depth += 1; i += 2
                elif text.startswith('*/', i): depth -= 1; i += 2
                else: i += 1
            if depth: raise SourceParseError('unterminated SQL comment')
            continue
        if text[i] in "'\"":
            quote = text[i]
            i += 1
            value = []
            while i < len(text):
                if text[i] == quote:
                    if i + 1 < len(text) and text[i + 1] == quote:
                        value.append(quote); i += 2; continue
                    i += 1
                    break
                value.append(text[i]); i += 1
            else: raise SourceParseError('unterminated SQL literal')
            tokens.append(('string' if quote == "'" else 'identifier', ''.join(value)))
            continue
        if text[i] == '$':
            match = re.match(r'\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$', text[i:])
            if match:
                tag = match.group()
                end = text.find(tag, i + len(tag))
                if end < 0: raise SourceParseError('unterminated SQL dollar literal')
                tokens.append(('string', text[i+len(tag):end])); i = end + len(tag); continue
        match = re.match(r'[A-Za-z_][A-Za-z0-9_$]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|::', text[i:])
        value = match.group() if match else text[i]
        tokens.append(('token', value)); i += len(value)
    return tokens


def parse_sql_rows(raw: bytes) -> list[tuple[str, dict]]:
    tokens = sql_tokens(raw.decode('utf-8-sig'))
    statements = []
    current = []
    for token in tokens:
        if token == ('token', ';'):
            if current: statements.append(current)
            current = []
        else: current.append(token)
    if current: statements.append(current)
    output = []
    for statement in statements:
        head = statement[0][1].lower()
        # Schema/transaction declarations are preserved as asset bytes, not counted as rows.
        if head in {'begin', 'commit', 'create', 'alter', 'drop', 'grant', 'revoke', 'set', 'comment'}:
            continue
        if head != 'insert': raise SourceParseError(f'unsupported SQL statement: {head}')
        pos = 1
        def take(expected=None):
            nonlocal pos
            if pos >= len(statement): raise SourceParseError('truncated INSERT')
            value = statement[pos][1]
            if expected is not None and value.lower() != expected:
                raise SourceParseError(f'expected {expected}, found {value}')
            pos += 1
            return value
        take('into')
        table = take()
        if pos < len(statement) and statement[pos][1] == '.':
            take('.')
            schema = table
            table = take()
            if schema != 'public': table = schema + '.' + table
        take('(')
        columns = []
        while True:
            columns.append(take())
            if statement[pos][1] == ')': take(')'); break
            take(',')
        if len(set(columns)) != len(columns): raise SourceParseError('duplicate INSERT columns')
        take('values')
        def literal():
            nonlocal pos
            kind, value = statement[pos]
            pos += 1
            if kind == 'string': result = value
            elif value.lower() == 'null': result = None
            elif value.lower() in {'true', 'false'}: result = value.lower() == 'true'
            elif value.lower() == 'array':
                take('['); result = []
                while statement[pos][1] != ']':
                    result.append(literal())
                    if statement[pos][1] == ']': break
                    take(',')
                take(']')
            else:
                if value in {'-', '+'}: value += take()
                if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', value):
                    raise SourceParseError(f'unsupported SQL expression: {value}')
                # Preserve decimal/exponent lexemes exactly; binary floats lose source precision.
                result = value if any(c in value.lower() for c in '.e') else int(value)
            while pos < len(statement) and statement[pos][1] == '::':
                take('::')
                typename = take().lower()
                if typename not in {'text','varchar','uuid','json','jsonb','int','integer','bigint','numeric','boolean','date','timestamp','timestamptz'}:
                    raise SourceParseError(f'unsupported cast: {typename}')
                if pos < len(statement) and statement[pos][1] == '[': take('['); take(']')
            return result
        try:
            while True:
                take('('); values = []
                while statement[pos][1] != ')':
                    values.append(literal())
                    if statement[pos][1] == ')': break
                    take(',')
                take(')')
                if len(values) != len(columns): raise SourceParseError('INSERT column/value cardinality mismatch')
                output.append((table, dict(zip(columns, values))))
                if pos == len(statement): break
                if statement[pos][1].lower() == 'on':
                    take('on'); take('conflict'); break
                take(',')
        except IndexError as error:
            raise SourceParseError('truncated INSERT values') from error
    return output


def column_index(reference: str) -> int:
    letters = re.match(r'([A-Z]+)[1-9][0-9]*$', reference)
    if not letters: raise SourceParseError(f'invalid cell reference: {reference}')
    index = 0
    for ch in letters.group(1): index = index * 26 + ord(ch) - 64
    return index - 1


def parse_workbook(raw: bytes) -> tuple[list[tuple[str, dict]], list[dict]]:
    namespace = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    relationship_ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    output = []
    receipts = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        def part(path):
            try: return ET.fromstring(archive.read(path))
            except (KeyError, ET.ParseError) as error: raise SourceParseError(f'invalid or missing XLSX part: {path}') from error
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            for item in part('xl/sharedStrings.xml').findall('s:si', namespace):
                shared.append(''.join(t.text or '' for t in item.findall('.//s:t', namespace)))
        relationships = {r.attrib['Id']: r.attrib for r in part('xl/_rels/workbook.xml.rels')}
        seen = set()
        for sheet in part('xl/workbook.xml').findall('s:sheets/s:sheet', namespace):
            name = sheet.attrib['name']
            if name in seen: raise SourceParseError(f'duplicate worksheet name: {name}')
            seen.add(name)
            rel = relationships.get(sheet.attrib.get('{'+relationship_ns+'}id'))
            if not rel or not rel.get('Target'): raise SourceParseError(f'missing worksheet relationship: {name}')
            if rel.get('TargetMode') == 'External': raise SourceParseError(f'external worksheet: {name}')
            if rel.get('Type') and not rel['Type'].endswith('/worksheet'): continue
            target = rel['Target']
            path = posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/'+target)
            if not path.startswith('xl/') or '\\' in path: raise SourceParseError(f'invalid worksheet path: {name}')
            worksheet = part(path)
            if worksheet.tag != '{'+namespace['s']+'}worksheet' or worksheet.find('s:sheetData', namespace) is None:
                raise SourceParseError(f'unsupported worksheet structure: {name}')
            rows = []
            for row in worksheet.findall('s:sheetData/s:row', namespace):
                values = {}; cells = []
                for cell in row.findall('s:c', namespace):
                    ref = cell.attrib['r']; index = column_index(ref)
                    kind = cell.attrib.get('t')
                    value = cell.findtext('s:v', default='', namespaces=namespace)
                    if kind == 's':
                        if not value.isdigit() or int(value) >= len(shared): raise SourceParseError(f'invalid shared string: {name}:{ref}')
                        value = shared[int(value)]
                    elif kind == 'inlineStr': value = ''.join(t.text or '' for t in cell.findall('.//s:t', namespace))
                    formula = cell.findtext('s:f', namespaces=namespace)
                    values[index] = value
                    cells.append({'reference':ref, 'value':value, 'formula':formula})
                if any(value.strip() for value in values.values()) or any(c['formula'] for c in cells):
                    rows.append((int(row.attrib['r']),values,cells))
            header_index = next((i for i,(_,v,_) in enumerate(rows) if sum(bool(x.strip()) for x in v.values()) >= 2), 0)
            headers = {}; used = set()
            if rows:
                for index, value in rows[header_index][1].items():
                    base = value.strip() or f'column_{index+1}'
                    key = base; suffix = 2
                    while key in used: key = f'{base}_{suffix}'; suffix += 1
                    headers[index] = key; used.add(key)
            receipt = {'sheet':name, 'total':len(rows), 'data':0, 'header':0, 'preamble':0}
            for i,(ordinal,values,cells) in enumerate(rows):
                role = 'preamble' if i < header_index else 'header' if i == header_index else 'data'
                receipt[role] += 1
                payload = {headers.get(index,f'column_{index+1}') if role == 'data' else f'column_{index+1}': value for index,value in values.items() if value.strip()}
                output.append((name, {'values':payload, '__source__':{'sheet':name,'row':ordinal,'row_role':role,'header_row':rows[header_index][0], 'cells':cells}}))
            receipts.append(receipt)
    if not receipts: raise SourceParseError('no worksheets resolved')
    return output, receipts
