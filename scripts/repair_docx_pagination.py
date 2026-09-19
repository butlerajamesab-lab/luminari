#!/usr/bin/env python3
"""Keep dossier rows intact and attach banners to the content they introduce."""
import argparse
import copy
import io
import json
import pathlib
import zipfile

from lxml import etree

from audit_docx_corpus import NS, W, sha, xml_text, parse_docx


def flag(parent, name):
    node = parent.find(W + name)
    if node is None:
        node = etree.SubElement(parent, W + name)
    node.set(W + 'val', '1')


def keep_next(paragraph):
    props = paragraph.find(W + 'pPr')
    if props is None:
        props = etree.Element(W + 'pPr')
        paragraph.insert(0, props)
    flag(props, 'keepNext')


def repair_pagination(source, expected_sha256):
    if sha(source) != expected_sha256:
        raise ValueError('Source generation changed')
    with zipfile.ZipFile(io.BytesIO(source)) as old:
        root = etree.fromstring(old.read('word/document.xml'))
        changed_rows = 0
        for row in root.xpath('//w:tr', namespaces=NS):
            props = row.find(W + 'trPr')
            if props is None:
                props = etree.Element(W + 'trPr')
                row.insert(0, props)
            current = props.find(W + 'cantSplit')
            if current is None or current.get(W + 'val') in ('0', 'false', 'off'):
                changed_rows += 1
            flag(props, 'cantSplit')
        body = root.find(W + 'body')
        blocks = list(body)
        grouped_banners = 0
        for i, block in enumerate(blocks):
            if block.tag != W + 'tbl':
                continue
            rows = block.findall(W + 'tr')
            if len(rows) != 1 or len(rows[0].findall(W + 'tc')) != 1:
                continue
            cell = rows[0].find(W + 'tc')
            shade = cell.find('./w:tcPr/w:shd', NS)
            if shade is None or shade.get(W + 'fill', '').upper() not in ('1F3864', 'EEF2F8', '8B0000'):
                continue
            for paragraph in cell.findall(W + 'p'):
                keep_next(paragraph)
                if xml_text(paragraph).strip().upper().startswith('SECTION:'):
                    flag(paragraph.find(W + 'pPr'), 'pageBreakBefore')
            grouped_banners += 1
            for following in blocks[i + 1:]:
                if following.tag != W + 'p' or xml_text(following).strip():
                    break
                # A deliberate page break remains a boundary.
                if following.xpath('.//w:br[@w:type="page"]', namespaces=NS):
                    break
                keep_next(following)
        xml = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as new:
            for info in old.infolist():
                new.writestr(copy.copy(info), xml if info.filename == 'word/document.xml' else old.read(info))
        result = buf.getvalue()
        with zipfile.ZipFile(io.BytesIO(result)) as new:
            for name in old.namelist():
                if name != 'word/document.xml' and old.read(name) != new.read(name):
                    raise ValueError('Unrelated package part changed')
    a, b = parse_docx(source, sha(source)), parse_docx(result, sha(result))
    # Table XML hashes change with layout; compare values and locations explicitly.
    if a['text_sha256'] != b['text_sha256'] or [(t['location'], t['rows']) for t in a['tables']] != [(t['location'], t['rows']) for t in b['tables']]:
        raise ValueError('Text or table content changed')
    if a['resource_ids'] != b['resource_ids'] or a['relationships'] != b['relationships']:
        raise ValueError('Identity or link target changed')
    return result, {'rows_repaired': changed_rows, 'banners_grouped': grouped_banners}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--source-sha256', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    source = pathlib.Path(args.source).read_bytes()
    result, changes = repair_pagination(source, args.source_sha256)
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(result)
    out.with_suffix('.receipt.json').write_text(json.dumps({
        'source_sha256': sha(source), 'sha256': sha(result), **changes,
        'local_path': str(out.resolve()), 'status': 'render_and_visual_review_required'}, indent=2))
