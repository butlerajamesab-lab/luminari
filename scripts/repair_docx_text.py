#!/usr/bin/env python3
"""Apply exact, sourced text corrections without changing unrelated package parts."""
import argparse,copy,io,json,pathlib,zipfile
from lxml import etree
from audit_docx_corpus import NS,W,R,sha,xml_text,parse_docx
from repair_docx_jurisdiction_table import replace_text,HYPERLINK,REL_NS

def apply_text_plan(source,plan):
    if sha(source)!=plan['source_sha256']:raise ValueError('Source hash changed')
    if not plan['edits']:raise ValueError('Empty correction plan')
    with zipfile.ZipFile(io.BytesIO(source)) as old:
        root=etree.fromstring(old.read('word/document.xml'));before=copy.deepcopy(root)
        relpath='word/_rels/document.xml.rels';rels=etree.fromstring(old.read(relpath))
        ids={r.get('Id') for r in rels};locations=set()
        for edit in plan['edits']:
            xp=edit['xpath']
            if xp in locations:raise ValueError('Repeated correction location')
            locations.add(xp);ns=root.xpath(xp,namespaces=NS)
            if len(ns)!=1 or ns[0].tag!=W+'p':raise ValueError('Nonunique paragraph target')
            node=ns[0]
            if xml_text(node)!=edit['before']:raise ValueError('Target paragraph changed')
            if not edit.get('source_url','').startswith('https://'):raise ValueError('Missing correction evidence')
            p,r=replace_text(node,edit['after'])
            url=edit.get('hyperlink')
            if url:
                if not url.startswith('https://'):raise ValueError('Invalid correction link')
                n=1
                while 'rIdTextAudit'+str(n) in ids:n+=1
                rid='rIdTextAudit'+str(n);ids.add(rid)
                etree.SubElement(rels,'{'+REL_NS+'}Relationship',Id=rid,Type=HYPERLINK,Target=url,TargetMode='External')
                h=etree.Element(W+'hyperlink');h.set(R+'id',rid);p.insert(p.index(r),h);h.append(r)
        after=copy.deepcopy(root)
        for doc in (before,after):
            nodes=[doc.xpath(xp,namespaces=NS)[0] for xp in locations]
            for node in nodes:node.getparent().replace(node,etree.Element('AUDIT_CHANGED_NODE'))
        if etree.tostring(before)!=etree.tostring(after):raise ValueError('Unplanned XML change')
        changes={'word/document.xml':etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True),relpath:etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)}
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as new:
            for info in old.infolist():new.writestr(copy.copy(info),changes.get(info.filename,old.read(info)))
        result=buf.getvalue()
        with zipfile.ZipFile(io.BytesIO(result)) as new:
            for name in old.namelist():
                if name not in changes and new.read(name)!=old.read(name):raise ValueError('Unrelated package part changed')
    a=parse_docx(source,sha(source));b=parse_docx(result,sha(result))
    if a['resource_ids']!=b['resource_ids']:raise ValueError('Resource identities changed')
    if [len(t['rows']) for t in a['tables']]!=[len(t['rows']) for t in b['tables']]:raise ValueError('Table rows changed')
    if a['metadata_group_count']!=b['metadata_group_count']:raise ValueError('Metadata groups changed')
    return result

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--plan',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    plan=json.loads(pathlib.Path(a.plan).read_text());b=apply_text_plan(pathlib.Path(plan['source_path']).read_bytes(),plan);p=pathlib.Path(a.out);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
    p.with_suffix('.receipt.json').write_text(json.dumps({'source_sha256':plan['source_sha256'],'sha256':sha(b),'edits':len(plan['edits']),'local_path':str(p.resolve()),'status':'structurally_verified_render_pending'},indent=2))
