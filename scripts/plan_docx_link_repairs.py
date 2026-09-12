#!/usr/bin/env python3
"""Plan lossless hyperlink restoration using exact matching source table rows.

This writes a plan only. A matching name is never sufficient. Every donor cell
must have identical table headers and complete row text, with one unambiguous
external hyperlink target. The plan records source hashes and XML locations.
"""
import argparse
import collections
import json
import pathlib
import zipfile
from urllib.parse import urlsplit
from lxml import etree
from audit_docx_corpus import NS, W, R, cell_text, sha, canonical_json

def row_key(headers, row, column):
    return sha(canonical_json([headers, row, column]))

def plan_repairs(audit_dir):
    audit_dir=pathlib.Path(audit_dir)
    index=json.loads((audit_dir/'index.json').read_text())
    donors=collections.defaultdict(list)
    docs=[]
    for summary in index['documents']:
        d=json.loads((audit_dir/'documents'/(summary['sha256']+'.json')).read_text())
        docs.append(d)
        with zipfile.ZipFile(d['local_path']) as z:
            xml=etree.fromstring(z.read('word/document.xml'))
            rels={r['id']:r for r in d['relationships'] if r['part']=='word/_rels/document.xml.rels'}
            for t in d['tables']:
                if not t['rows']:continue
                tn=xml.xpath(t['location'].split(':',1)[1],namespaces=NS)[0]
                rows=tn.findall(W+'tr')
                for ri,row in enumerate(rows[1:],1):
                    for ci,cell in enumerate(row.findall(W+'tc')):
                        if cell_text(cell).strip().lower()!='website':continue
                        links=cell.xpath('.//w:hyperlink[@r:id]',namespaces=NS)
                        targets={rels[x.get(R+'id')]['target'] for x in links if x.get(R+'id') in rels and rels[x.get(R+'id')].get('mode')=='External'}
                        if len(targets)!=1:continue
                        url=next(iter(targets));parts=urlsplit(url)
                        if parts.scheme not in ('http','https') or not parts.netloc:continue
                        key=row_key(t['rows'][0],t['rows'][ri],ci)
                        donors[key].append({'source_sha256':d['sha256'],'source_path':d['local_path'],'cell_location':xml.getroottree().getpath(cell),'url':url})
    plans,held=[],[]
    for d in docs:
        for f in d['findings']:
            if f['code']!='literal_placeholder_cell' or f['source_text'].strip().lower()!='website':continue
            loc=f['location']; t=next((t for t in d['tables'] if loc.startswith(t['location']+'/')),None)
            if not t:continue
            base={'target_sha256':d['sha256'],'target_path':d['local_path'],'target_location':loc,'table_heading':t['heading'],'row':f['row'],'column':f['column']}
            # Wrong-domain routing needs a replacement table, not restored bad links.
            if any(x['code']=='jurisdiction_heading_content_mismatch' and x['location']==t['location'] for x in d['findings']):
                held.append({**base,'reason':'wrong_domain_table_requires_replacement'});continue
            candidates=donors.get(row_key(t['rows'][0],t['rows'][f['row']],f['column']),[])
            targets={x['url'] for x in candidates}
            if len(targets)!=1:
                held.append({**base,'reason':'conflicting_donor_urls' if targets else 'no_exact_source_row_with_link','candidate_urls':sorted(targets)});continue
            plans.append({**base,'url':next(iter(targets)),'donors':sorted(candidates,key=lambda x:x['source_sha256']),'verification_effect':'No verification status or factual claim is changed; source hyperlink is restored.'})
    return {'operation':'restore_source_hyperlinks','planned_cells':len(plans),'planned_documents':len({p['target_sha256'] for p in plans}),'plans':plans,'held':held}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--audit',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    result=plan_repairs(a.audit);pathlib.Path(a.out).write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({'planned_cells':result['planned_cells'],'planned_documents':result['planned_documents'],'held_cells':len(result['held']),'held_reasons':dict(collections.Counter(x['reason'] for x in result['held']))},indent=2))
