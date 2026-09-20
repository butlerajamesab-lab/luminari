#!/usr/bin/env python3
"""Apply a reviewed hyperlink repair plan while preserving every source text node."""
import argparse
import collections
import copy
import io
import json
import pathlib
import zipfile
from lxml import etree
from audit_docx_corpus import NS, W, R, sha, parse_docx, xml_text

REL_NS=NS['p']
HYPERLINK_TYPE='http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'

def restore_links(source_bytes, plans):
    expected_hash=sha(source_bytes)
    if not plans or any(p['target_sha256']!=expected_hash for p in plans):raise ValueError('Source bytes do not match repair plan')
    with zipfile.ZipFile(io.BytesIO(source_bytes)) as z:
        root=etree.fromstring(z.read('word/document.xml'))
        rel_path='word/_rels/document.xml.rels'
        rels=etree.fromstring(z.read(rel_path)) if rel_path in z.namelist() else etree.Element('{'+REL_NS+'}Relationships',nsmap={None:REL_NS})
        ids={r.get('Id') for r in rels};used=set()
        for p in plans:
            if p['target_location'] in used:raise ValueError('Repeated repair location')
            used.add(p['target_location'])
            nodes=root.xpath(p['target_location'].split(':',1)[1],namespaces=NS)
            if len(nodes)!=1:raise ValueError('Repair location is not unique')
            cell=nodes[0]
            if xml_text(cell).strip().lower()!='website' or cell.xpath('.//w:hyperlink',namespaces=NS):raise ValueError('Target is no longer a literal Website cell')
            # Recheck the donor's complete bytes and exact row text at apply time.
            donor=p['donors'][0];db=pathlib.Path(donor['source_path']).read_bytes()
            if sha(db)!=donor['source_sha256']:raise ValueError('Donor hash changed')
            with zipfile.ZipFile(io.BytesIO(db)) as dz:
                dr=etree.fromstring(dz.read('word/document.xml'));dc=dr.xpath(donor['cell_location'],namespaces=NS)[0]
                if [xml_text(c) for c in dc.getparent().findall(W+'tc')]!=[xml_text(c) for c in cell.getparent().findall(W+'tc')]:raise ValueError('Donor row differs from target')
                drel={r.get('Id'):r for r in etree.fromstring(dz.read(rel_path))}
                urls={drel[h.get(R+'id')].get('Target') for h in dc.xpath('.//w:hyperlink[@r:id]',namespaces=NS)}
                if urls!={p['url']}:raise ValueError('Donor hyperlink is not the planned URL')
            rid=next((r.get('Id') for r in rels if r.get('Type')==HYPERLINK_TYPE and r.get('Target')==p['url'] and r.get('TargetMode')=='External'),None)
            if rid is None:
                n=1
                while 'rIdAudit'+str(n) in ids:n+=1
                rid='rIdAudit'+str(n);ids.add(rid)
                etree.SubElement(rels,'{'+REL_NS+'}Relationship',Id=rid,Type=HYPERLINK_TYPE,Target=p['url'],TargetMode='External')
            text_paragraphs=[x for x in cell.findall(W+'p') if xml_text(x).strip()]
            if len(text_paragraphs)!=1:raise ValueError('Website label spans multiple paragraphs')
            para=text_paragraphs[0];runs=para.findall(W+'r')
            if not runs:raise ValueError('Missing Website text runs')
            hyperlink=etree.Element(W+'hyperlink');hyperlink.set(R+'id',rid)
            pos=para.index(runs[0]);para.insert(pos,hyperlink)
            for run in runs:hyperlink.append(run)
        changes={'word/document.xml':etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True),rel_path:etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)}
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w') as nz:
            for info in z.infolist():nz.writestr(copy.copy(info),changes.get(info.filename,z.read(info)))
            if rel_path not in z.namelist():nz.writestr(rel_path,changes[rel_path])
        result=output.getvalue()
        with zipfile.ZipFile(io.BytesIO(result)) as check:
            for name in z.namelist():
                if name not in changes and z.read(name)!=check.read(name):raise ValueError('Unrelated package part changed')
    before=parse_docx(source_bytes,expected_hash);after=parse_docx(result,sha(result))
    if before['text_sha256']!=after['text_sha256']:raise ValueError('Visible text changed during hyperlink restoration')
    if [t['rows'] for t in before['tables']]!=[t['rows'] for t in after['tables']]:raise ValueError('A table value changed')
    if before['resource_ids']!=after['resource_ids']:raise ValueError('Resource identity changed')
    target_findings={f['location'] for f in after['findings'] if f['code']=='literal_placeholder_cell'}
    if target_findings.intersection(used):raise ValueError('A planned placeholder remains')
    return result

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--plan',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    plan=json.loads(pathlib.Path(a.plan).read_text());groups=collections.defaultdict(list)
    for p in plan['plans']:groups[p['target_sha256']].append(p)
    out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True);receipts=[]
    for h,ps in groups.items():
        src=pathlib.Path(ps[0]['target_path']);b=restore_links(src.read_bytes(),ps);dest=out/(h+'.links-restored.docx');dest.write_bytes(b)
        receipts.append({'source_sha256':h,'sha256':sha(b),'local_path':str(dest.resolve()),'source_path':str(src.resolve()),'restored_links':len(ps),'status':'structurally_verified_render_pending','visible_text_preserved':True,'unrelated_package_parts_preserved':True})
    (out/'repair_receipts.json').write_text(json.dumps(receipts,indent=2));print(json.dumps({'documents':len(receipts),'restored_links':sum(r['restored_links'] for r in receipts)},indent=2))
