#!/usr/bin/env python3
"""Replace a specifically approved jurisdiction table, preserving all other parts.

The plan pins the complete source SHA, original table digest, exact paragraph
values, sourced replacement rows and the verification scope. It never promotes
resource-card verification status or changes metadata records.
"""
import argparse, copy, io, json, pathlib, zipfile
from lxml import etree
from audit_docx_corpus import NS, W, R, sha, cell_text, xml_text, parse_docx

REL_NS=NS['p']
HYPERLINK='http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'

def replace_text(node,text):
    paragraphs=node.findall(W+'p') if node.tag==W+'tc' else [node]
    if not paragraphs:raise ValueError('No paragraph template')
    p=paragraphs[0]
    run=p.find(W+'r')
    style=copy.deepcopy(run.find(W+'rPr')) if run is not None and run.find(W+'rPr') is not None else None
    for child in list(p):
        if child.tag!=W+'pPr':p.remove(child)
    for extra in paragraphs[1:]:node.remove(extra)
    r=etree.SubElement(p,W+'r')
    if style is not None:r.append(style)
    for i,line in enumerate(text.split('\n')):
        if i:etree.SubElement(r,W+'br')
        t=etree.SubElement(r,W+'t');t.text=line;t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
    return p,r

def apply_plan(source,plan):
    if sha(source)!=plan['source_sha256']:raise ValueError('Source SHA mismatch')
    with zipfile.ZipFile(io.BytesIO(source)) as old:
        root=etree.fromstring(old.read('word/document.xml'))
        original=copy.deepcopy(root)
        relpath='word/_rels/document.xml.rels'
        rels=etree.fromstring(old.read(relpath))
        ids={r.get('Id') for r in rels}
        changed_paths=[]
        def lookup(xpath):
            ns=root.xpath(xpath,namespaces=NS)
            if len(ns)!=1:raise ValueError('Nonunique target: '+xpath)
            return ns[0]
        for edit in plan['paragraph_edits']:
            node=lookup(edit['xpath'])
            if xml_text(node)!=edit['before']:raise ValueError('Paragraph changed: '+edit['xpath'])
            replace_text(node,edit['after']);changed_paths.append(edit['xpath'])
        table=lookup(plan['table_xpath'])
        if sha(etree.tostring(table))!=plan['table_xml_sha256']:raise ValueError('Table changed')
        trs=table.findall(W+'tr')
        if len(trs)!=plan['old_row_count']+1:raise ValueError('Unexpected row count')
        template=copy.deepcopy(trs[1]);headers=trs[0].findall(W+'tc')
        if [cell_text(c) for c in headers]!=plan['old_headers']:raise ValueError('Header changed')
        for c,v in zip(headers,plan['headers']):replace_text(c,v)
        for tr in trs[1:]:table.remove(tr)
        for row in plan['rows']:
            if len(row['values'])!=len(headers):raise ValueError('Wrong replacement column count')
            if not row['source_url'].startswith('https://'):raise ValueError('Missing source provenance')
            tr=copy.deepcopy(template)
            for ci,(c,v) in enumerate(zip(tr.findall(W+'tc'),row['values'])):
                p,r=replace_text(c,v)
                url=row.get('links',{}).get(str(ci))
                if url:
                    if not url.startswith(('http://','https://')):raise ValueError('Invalid website target')
                    n=1
                    while 'rIdJurisdictionAudit'+str(n) in ids:n+=1
                    rid='rIdJurisdictionAudit'+str(n);ids.add(rid)
                    etree.SubElement(rels,'{'+REL_NS+'}Relationship',Id=rid,Type=HYPERLINK,Target=url,TargetMode='External')
                    h=etree.Element(W+'hyperlink');h.set(R+'id',rid);p.insert(p.index(r),h);h.append(r)
            table.append(tr)
        grid=plan.get('column_widths')
        if grid:
            if sum(grid)!=9360 or len(grid)!=len(headers):raise ValueError('Invalid table width')
            for c,width in zip(table.find(W+'tblGrid'),grid):c.set(W+'w',str(width))
            for tr in table.findall(W+'tr'):
                for c,width in zip(tr.findall(W+'tc'),grid):c.find('./w:tcPr/w:tcW',NS).set(W+'w',str(width))
        changed_paths.append(plan['table_xpath'])
        # Every XML node outside the explicit change locations must be identical.
        before_masked=copy.deepcopy(original);after_masked=copy.deepcopy(root)
        for doc in (before_masked,after_masked):
            nodes=[doc.xpath(xpath,namespaces=NS)[0] for xpath in changed_paths]
            for n in nodes:n.getparent().replace(n,etree.Element('AUDIT_CHANGED_NODE'))
        if etree.tostring(before_masked)!=etree.tostring(after_masked):raise ValueError('Unplanned document XML change')
        changes={'word/document.xml':etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True),relpath:etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)}
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as new:
            for info in old.infolist():new.writestr(copy.copy(info),changes.get(info.filename,old.read(info)))
        result=out.getvalue()
        with zipfile.ZipFile(io.BytesIO(result)) as check:
            for name in old.namelist():
                if name not in changes and check.read(name)!=old.read(name):raise ValueError('Unrelated package part changed')
    a=parse_docx(source,sha(source));b=parse_docx(result,sha(result))
    if a['resources']!=b['resources'] or a['resource_ids']!=b['resource_ids']:raise ValueError('Resource cards changed')
    if a['metadata_group_count']!=b['metadata_group_count']:raise ValueError('Metadata groups changed')
    if any(f['code']=='jurisdiction_heading_content_mismatch' for f in b['findings']):raise ValueError('Heading/content mismatch remains')
    return result

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--plan',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    plan=json.loads(pathlib.Path(a.plan).read_text());source=pathlib.Path(plan['source_path']).read_bytes()
    result=apply_plan(source,plan);out=pathlib.Path(a.out);out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(result)
    receipt={'source_sha256':sha(source),'sha256':sha(result),'local_path':str(out.resolve()),'rows':len(plan['rows']),'source_url':plan['source_url'],'checked_at':plan['checked_at'],'verification_scope':plan['verification_scope'],'status':'structurally_verified_render_pending','unrelated_package_parts_preserved':True,'resource_cards_and_metadata_preserved':True}
    out.with_suffix('.receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt,indent=2))
