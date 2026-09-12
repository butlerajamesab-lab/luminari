#!/usr/bin/env python3
"""Inventory DOCX packages, including nested archives, without altering source bytes.

Exact duplicates require identical complete bytes. Text/package similarities are
reported separately and never authorize deletion. All findings retain XML locations.
"""
import argparse
import collections
import hashlib
import io
import json
import pathlib
import re
import tarfile
import zipfile
from lxml import etree

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}
W = '{' + NS['w'] + '}'
R = '{' + NS['r'] + '}'
JURISDICTIONS = set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI GU AS MP'.split())
EXACT_PLACEHOLDERS = {'website', 'url', 'official url', 'insert url', 'insert website', 'tbd', 'todo', 'tbc', 'n/a placeholder', 'placeholder', 'lorem ipsum'}
PLACEHOLDER_PATTERN = re.compile(r'\b(?:TBD|TODO|FIXME|lorem ipsum)\b|\[(?:insert|enter|replace with)\b[^\]]*\]|https?://(?:www\.)?example\.(?:com|org|net)\b', re.I)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def xml_text(node):
    out = []
    for el in node.iter():
        if el.tag == W + 't': out.append(el.text or '')
        elif el.tag == W + 'tab': out.append('\t')
        elif el.tag in (W + 'br', W + 'cr'): out.append('\n')
    return ''.join(out)

def cell_text(node):
    return '\n'.join(xml_text(p) for p in node.xpath('./w:p', namespaces=NS))

def parse_docx(data, content_hash):
    findings, paragraphs, tables, relationships = [], [], [], []
    def add(code, location, text, **extra):
        findings.append({'code': code, 'location': location, 'source_text': text, **extra})
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        bad = z.testzip()
        if bad: raise ValueError('ZIP CRC failed: ' + bad)
        members = z.namelist()
        part_digests = []
        for name in sorted(members):
            if name.endswith('/'): continue
            part_digests.append([name, sha(z.read(name))])
        for name in sorted(members):
            if not (name.startswith('word/') and name.endswith('.xml')): continue
            root = etree.fromstring(z.read(name), etree.XMLParser(resolve_entities=False, no_network=True))
            tree = root.getroottree()
            for p in root.xpath('//w:p', namespaces=NS):
                txt = xml_text(p)
                if txt:
                    loc = name + ':' + tree.getpath(p)
                    paragraphs.append({'part': name, 'location': loc, 'text': txt})
                    if PLACEHOLDER_PATTERN.search(txt): add('placeholder_token_review', loc, txt)
            if name != 'word/document.xml': continue
            body = root.find(W + 'body')
            heading = ''
            for node in body:
                if node.tag == W + 'p':
                    txt = xml_text(node)
                    style = node.find('./w:pPr/w:pStyle', NS)
                    if style is not None and 'heading' in str(style.get(W+'val', '')).lower(): heading = txt
                    continue
                if node.tag != W + 'tbl': continue
                row_nodes = node.findall(W + 'tr')
                matrix = [[cell_text(c) for c in row.findall(W+'tc')] for row in row_nodes]
                location = name + ':' + tree.getpath(node)
                if len(matrix) == 1 and len(matrix[0]) == 1:
                    shade = node.find('./w:tr/w:tc/w:tcPr/w:shd', NS)
                    if shade is not None and str(shade.get(W+'fill','')).upper() == '1F3864': heading = matrix[0][0]
                table = {'location': location, 'heading': heading, 'rows': matrix, 'text_sha256': sha(canonical_json(matrix)), 'xml_sha256': sha(etree.tostring(node))}
                tables.append(table)
                headers = [c.strip().lower() for c in (matrix[0] if matrix else [])]
                for ri, (row, vals) in enumerate(zip(row_nodes, matrix)):
                    cells = row.findall(W+'tc')
                    for ci, (cell, value) in enumerate(zip(cells, vals)):
                        normalized = value.strip().lower()
                        column = headers[ci] if ci < len(headers) else ''
                        kv_value = len(vals) == 2 and ci == 1
                        data_cell = (ri > 0 and len(headers) >= 3) or kv_value
                        if not data_cell: continue
                        has_hyperlink = bool(cell.xpath('.//w:hyperlink[@r:id or @w:anchor] | .//w:instrText[contains(., "HYPERLINK")] | .//w:fldSimple[contains(@w:instr, "HYPERLINK")]', namespaces=NS))
                        url_label = any(k in column for k in ('website', 'url')) or (kv_value and any(k in vals[0].lower() for k in ('website', 'url')))
                        # A schema field literally named `url` is data, not a missing link.
                        is_placeholder = normalized in EXACT_PLACEHOLDERS and (normalized not in {'website', 'url', 'official url'} or url_label)
                        if is_placeholder and not has_hyperlink:
                            add('literal_placeholder_cell', name+':'+tree.getpath(cell), value, table_heading=heading, row=ri, column=ci, column_label=column)
                        if normalized == 'contact state bar lawyer referral service':
                            add('unresolved_contact_instruction', name+':'+tree.getpath(cell), value, table_heading=heading, row=ri, column=ci)
                if headers and headers[0] in ('state','jurisdiction') and 'agency' in headers:
                    codes=[row[0].strip() for row in matrix[1:] if row]
                    duplicates=[k for k,v in collections.Counter(codes).items() if v>1]
                    if duplicates: add('duplicate_jurisdiction_codes',location,heading,codes=duplicates)
                    if re.search(r'56\s+(?:Jurisdiction|State)',heading,re.I):
                        missing=sorted(JURISDICTIONS-set(codes))
                        if missing:add('missing_jurisdiction_codes',location,heading,codes=missing)
                    agency_index=headers.index('agency')
                    referral_count=sum('Immigrant Legal Services Referral' in row[agency_index] for row in matrix[1:] if len(row)>agency_index)
                    if referral_count and re.search(r'PROTECTION AND ADVOCACY|STATE LABOR|ANTI.TRAFFICKING|CHILD WELFARE',heading,re.I):
                        add('jurisdiction_heading_content_mismatch',location,heading,immigration_referral_rows=referral_count)
        for name in sorted(members):
            if not name.endswith('.rels'):continue
            root=etree.fromstring(z.read(name),etree.XMLParser(resolve_entities=False,no_network=True))
            for rel in root:
                relationships.append({'part':name,'id':rel.get('Id'),'type':rel.get('Type'),'target':rel.get('Target'),'mode':rel.get('TargetMode')})
        doc_body=[p['text'] for p in paragraphs if p['part']=='word/document.xml']
        resource_ids=[]
        metadata_groups=[]
        resources=[]
        current_resource=None
        for t in tables:
            matrix=t['rows']
            if not matrix:continue
            if len(matrix)==1 and len(matrix[0])==1:
                m=re.search(r'\[(SAIS-[A-Z0-9-]+)\]',matrix[0][0])
                if m:
                    resource_ids.append(m.group(1))
                    current_resource={'resource_id':m.group(1),'title':matrix[0][0],'location':t['location'],'blocks':[]}
                    resources.append(current_resource)
            if current_resource is not None and matrix and all(len(row)==2 for row in matrix): current_resource['blocks'].append(matrix)
            if matrix[0] and matrix[0][0].strip()=='resource_id':metadata_groups.append(t)
        dup_ids=[k for k,v in collections.Counter(resource_ids).items() if v>1]
        if dup_ids:add('duplicate_resource_cards','word/document.xml','',resource_ids=dup_ids)
        for t in metadata_groups:
            group_ids=[r[0] for r in t['rows'][1:] if r]
            if resource_ids and set(group_ids)!=set(resource_ids):add('metadata_resource_id_mismatch',t['location'],'',card_ids=resource_ids,appendix_ids=group_ids)
        for p in paragraphs:
            if p['part']!='word/document.xml':continue
            m=re.search(r'\b(\d+) Verified Resources\b',p['text'])
            if m and resource_ids and int(m.group(1))!=len(resource_ids):add('resource_header_count_mismatch',p['location'],p['text'],actual_count=len(resource_ids))
        images=[n for n in members if n.startswith('word/media/') and not n.endswith('/')]
        fields=[p for p in members if p.startswith('word/') and p.endswith('.xml')]
        return {'sha256':content_hash,'byte_size':len(data),'package_parts_sha256':sha(canonical_json(part_digests)),
                'text_sha256':sha(canonical_json([[p['part'],p['text']] for p in paragraphs])),
                'paragraphs':paragraphs,'tables':tables,'relationships':relationships,'resources':resources,
                'resource_ids':resource_ids,'metadata_group_count':len(metadata_groups),'embedded_images':images,
                'findings':findings,'verification_scope':'package, structure, literal text, cross-field consistency; external factual accuracy not yet verified'}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--receipts',required=True,nargs='+')
    ap.add_argument('--out',required=True)
    args=ap.parse_args()
    out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
    (out/'documents').mkdir(exist_ok=True)
    (out/'content').mkdir(exist_ok=True)
    docs,archives,errors,non_docx={},[],[],[]
    observed=[]
    def visit(data,origin,depth=0):
        content_hash=sha(data)
        if depth>20:
            errors.append({'origin':origin,'error':'nested_archive_depth_exceeds_20','coverage':'not_inspected'});return
        if zipfile.is_zipfile(io.BytesIO(data)):
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names=z.namelist()
                if 'word/document.xml' in names:
                    if content_hash not in docs:
                        try:
                            d=parse_docx(data,content_hash)
                            d['origins']=[]
                            p=out/'content'/(content_hash+'.docx');p.write_bytes(data)
                            d['local_path']=str(p.resolve())
                            docs[content_hash]=d
                        except Exception as exc:
                            errors.append({'origin':origin,'sha256':content_hash,'error':str(exc),'coverage':'not_inspected'});return
                    elif pathlib.Path(docs[content_hash]['local_path']).read_bytes()!=data:
                        raise RuntimeError('Hash match without byte equality')
                    docs[content_hash]['origins'].append(origin)
                    observed.append({'sha256':content_hash,'origin':origin,'kind':'docx'})
                    for member in z.infolist():
                        if member.filename.startswith('word/embeddings/'):
                            visit(z.read(member),{**origin,'member_chain':origin.get('member_chain',[])+[member.filename]},depth+1)
                    return
                # Spreadsheet and PowerPoint packages may contain embedded Word files.
                is_office=any(n in names for n in ('xl/workbook.xml','ppt/presentation.xml'))
                member_count=0
                for member in z.infolist():
                    if member.is_dir():continue
                    if is_office and '/embeddings/' not in member.filename:continue
                    if member.file_size>512*1024*1024:
                        errors.append({'origin':origin,'member':member.filename,'error':'member_exceeds_512_mib','coverage':'not_inspected'});continue
                    child=z.read(member)
                    if child.startswith((b'PK\x03\x04',b'\x1f\x8b')) or member.filename.lower().endswith(('.docx','.zip','.tar','.gz','.tgz')):
                        visit(child,{**origin,'member_chain':origin.get('member_chain',[])+[member.filename]},depth+1)
                    member_count+=1
                archives.append({'sha256':content_hash,'origin':origin,'members_inspected':member_count,'kind':'office_other' if is_office else 'zip'})
                return
        try:
            with tarfile.open(fileobj=io.BytesIO(data),mode='r:*') as tar:
                count=0
                for m in tar:
                    if not m.isfile():continue
                    if m.size>512*1024*1024:
                        errors.append({'origin':origin,'member':m.name,'error':'member_exceeds_512_mib','coverage':'not_inspected'});continue
                    raw=tar.extractfile(m).read()
                    if raw.startswith((b'PK\x03\x04',b'\x1f\x8b')) or m.name.lower().endswith(('.docx','.zip','.tar','.gz','.tgz')):visit(raw,{**origin,'member_chain':origin.get('member_chain',[])+[m.name]},depth+1)
                    count+=1
                archives.append({'sha256':content_hash,'origin':origin,'members_inspected':count,'kind':'tar'});return
        except tarfile.ReadError:pass
        name=(origin.get('member_chain') or [origin.get('name','')])[-1]
        if name.lower().endswith(('.docx','.zip','.tar','.gz','.tgz','.7z','.rar')):
            errors.append({'origin':origin,'sha256':content_hash,'error':'unsupported_or_invalid_document_or_archive','coverage':'not_inspected'})
        else:non_docx.append({'origin':origin,'sha256':content_hash})
    for receipt_file in args.receipts:
        for r in json.loads(pathlib.Path(receipt_file).read_text()):
            if r.get('status')!='downloaded':errors.append({'origin':r,'error':r.get('error','not_downloaded'),'coverage':'not_inspected'});continue
            data=pathlib.Path(r['local_path']).read_bytes()
            if sha(data)!=r['sha256']:raise ValueError('Downloaded-file receipt mismatch')
            origin={k:v for k,v in r.items() if k not in ('local_path','sha256','status')}
            origin.setdefault('member_chain',[])
            visit(data,origin)
    summary_docs=[]
    for h,d in docs.items():
        (out/'documents'/(h+'.json')).write_text(json.dumps(d,ensure_ascii=False,indent=2))
        summary_docs.append({k:v for k,v in d.items() if k not in ('paragraphs','tables','relationships','resources')})
    summary={'unique_docx_packages':len(docs),'docx_occurrences':sum(len(d['origins']) for d in docs.values()),
             'exact_duplicate_groups':sum(len(d['origins'])>1 for d in docs.values()),
             'redundant_docx_occurrences':sum(max(0,len(d['origins'])-1) for d in docs.values()),
             'findings_by_code':dict(collections.Counter(f['code'] for d in docs.values() for f in d['findings'])),
             'documents_with_findings':sum(bool(d['findings']) for d in docs.values()),'archive_occurrences':len(archives),'errors':len(errors),
             'embedded_image_occurrences_unique_documents':sum(len(d['embedded_images']) for d in docs.values()),
             'scope':'All files in supplied download receipts, including recursively discovered DOCX packages; unresolved errors remain explicit.'}
    (out/'index.json').write_text(json.dumps({'summary':summary,'documents':summary_docs,'archives':archives,'errors':errors,'other_files':non_docx},ensure_ascii=False,indent=2))
    print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
