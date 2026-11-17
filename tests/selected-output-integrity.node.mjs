import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspect_selected_output_integrity as inspect } from '../server/rosetta-selected-output-integrity.js';
const capture=JSON.parse(readFileSync(new URL('./fixtures/selected-output-six-source-integrity.json',import.meta.url)));
const docs=capture.documents;
const clone=x=>JSON.parse(JSON.stringify(x));
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const selector=d=>({source_content_id:d.source.source_content_id,source_content_hash:d.source.source_content_hash});
function synthetic(text='The agency shall act.') {
 const id='11111111-1111-4111-8111-111111111111',h=sha(text),rs='a'.repeat(64),read='b'.repeat(64),end=Array.from(text).length;
 return {contract:'rosetta-rule-live-detail-v1',target:{
  ruleset_version:'fixture-current',ruleset_sha256:rs,installed_ruleset_sha256:rs,
  read_contract_sha256:read,installed_read_contract_sha256:read,
  read_contract_configured:true,identity_valid:true,engine_identity_valid:true,read_identity_valid:true},
 source:{source_content_id:id,source_document_id:42,source_content_hash:h,source_text:text},
 decomposition:{outcome:'decomposed',source_content_id:id,source_content_hash:h,ruleset_version:'fixture-current',ruleset_sha256:rs,unit_count:1,section_count:1,layer_counts:{W:1}},
 sections:[{section_ord:1,source_content_id:id,ruleset_version:'fixture-current',raw_start:0,raw_end:end,unit_count:1}],
 units:[{unit_ord:1,section_ord:1,source_content_id:id,ruleset_version:'fixture-current',raw_start:0,raw_end:end,raw_text:text,text_sha256:h,layers:['W']}],
 hold_receipt:null,failure_receipts:[]};
}
test('six real preserved sources / 72 units pass only the declared integrity invariants',()=>{
 assert.equal(docs.length,6); assert.equal(docs.reduce((n,d)=>n+d.units.length,0),72);
 for(const d of docs){const r=inspect(d,selector(d));
  assert.equal(r.status,'verified');assert.equal(r.semantic_certification,false);
  assert.equal(r.publication_authorized,false);assert.match(r.output_sha256,/^[a-f0-9]{64}$/);
 }
});
test('summary leakage remains visible; integrity cannot silently repair or certify it',()=>{
 const d=docs.find(x=>x.source.source_content_id==='15b466fb-bfb6-462b-8ede-e0aeb2b24794');
 const before=JSON.stringify(d),r=inspect(d,selector(d));
 assert.match(d.units[13].raw_text,/SUMMARY/);assert.equal(r.semantic_certification,false);
 assert.equal(JSON.stringify(d),before);
});
test('PostgreSQL character offsets work with astral Unicode',()=>{
 const d=synthetic('😀 The agency shall act.');assert.equal(inspect(d,selector(d)).status,'verified');
 d.units[0].raw_end=d.source.source_text.length;
 assert.throws(()=>inspect(d,selector(d)),/unit_span/);
});
test('source text tampering and wrong selectors reject',()=>{
 const d=synthetic(); d.source.source_text+='!';
 assert.throws(()=>inspect(d,selector(d)),/source_hash/);
 const good=synthetic();
 assert.throws(()=>inspect(good,{...selector(good),source_content_hash:'c'.repeat(64)}),/source_identity/);
});
test('malformed JSON identity fields produce the declared integrity error',()=>{
 for(const field of ['source_content_id','source_content_hash']){
  const d=synthetic(),expected=selector(d);d.source[field]=[d.source[field]];
  assert.throws(()=>inspect(d,expected),error=>
   error.message==='selected_output_integrity_source_identity'&&error.status===502);
 }
});
test('every advertised selected/read identity flag is required',()=>{
 for(const key of ['identity_valid','engine_identity_valid','read_identity_valid','read_contract_configured']){
  for(const value of [false,undefined]){const d=synthetic();d.target[key]=value;
   assert.throws(()=>inspect(d,selector(d)),/target_identity/);}
 }
 for(const key of ['installed_ruleset_sha256','installed_read_contract_sha256']) {
  const d=synthetic();d.target[key]='c'.repeat(64);assert.throws(()=>inspect(d,selector(d)),/target_identity/);
 }
});
test('other source/generation output or per-row identity cannot bind',()=>{
 for(const field of ['source_content_id','source_content_hash','ruleset_version','ruleset_sha256']){
  const d=synthetic();d.decomposition[field]='different';assert.throws(()=>inspect(d,selector(d)),/output_identity/);
 }
 for(const collection of ['units','sections']){
  const d=synthetic();d[collection][0].source_content_id='different';
  assert.throws(()=>inspect(d,selector(d)),/(unit|section)_span/);
 }
});
test('wrong raw slices, stored hashes and illegal offsets reject',()=>{
 for(const patch of [{raw_text:'other'},{text_sha256:'c'.repeat(64)},{raw_start:-1},{raw_start:2,raw_end:1},{unit_ord:2}]){
  const d=synthetic();Object.assign(d.units[0],patch);assert.throws(()=>inspect(d,selector(d)),/(unit_hash|unit_span)/);
 }
});
test('missing or contradictory source/unit/section counts reject',()=>{
 for(const patch of [{unit_count:2},{section_count:2},{layer_counts:{W:2}}]){
  const d=synthetic();Object.assign(d.decomposition,patch);assert.throws(()=>inspect(d,selector(d)),/(counts|layer_counts)/);
 }
 const d=synthetic();d.sections[0].unit_count=2;assert.throws(()=>inspect(d,selector(d)),/section_count/);
});
test('unknown and duplicate layer assignments reject; R is not silently stripped',()=>{
 for(const layers of [['X'],['W','W']]){
  const d=synthetic();d.units[0].layers=layers;assert.throws(()=>inspect(d,selector(d)),/unit_layers/);
 }
 const d=synthetic();d.units[0].layers=['R'];d.decomposition.layer_counts={R:1};
 assert.equal(inspect(d,selector(d)).status,'verified');assert.deepEqual(d.units[0].layers,['R']);
});
test('held, failed and absent decompositions never produce verified output',()=>{
 for(const outcome of ['held','failed',null]){const d=synthetic();d.decomposition=outcome?{outcome}:null;
  const r=inspect(d,selector(d));assert.equal(r.status,'not_ready');assert.equal(r.output_sha256,null);}
 for(const field of ['hold_receipt','failure_receipts']){
  const d=synthetic();d[field]=field==='hold_receipt'?{gate:'fixture'}:[{error:'fixture'}];
  assert.equal(inspect(d,selector(d)).status,'not_ready');
 }
});
test('absence of failure receipts is explicitly unexposed, never attested as absence',()=>{
 const d=synthetic();delete d.failure_receipts;const r=inspect(d,selector(d));
 assert.equal(r.failure_receipts_exposed,false);
 assert.equal('failure_receipts_absent' in r.verified_invariants,false);
});
test('output hash is stable across JSON object-key order and sensitive to changed output',()=>{
 const d=synthetic(),r=inspect(d,selector(d));
 const reversed=x=>Array.isArray(x)?x.map(reversed):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reversed(v)])):x;
 assert.equal(inspect(reversed(d),selector(d)).output_sha256,r.output_sha256);
 d.units[0].layers=['H'];d.decomposition.layer_counts={H:1};
 assert.notEqual(inspect(d,selector(d)).output_sha256,r.output_sha256);
});
test('matching producer receipt is reproducible; a contradictory one rejects',()=>{
 const d=synthetic();d.output_integrity=inspect(d,selector(d));
 assert.deepEqual(inspect(d,selector(d)),d.output_integrity);
 d.output_integrity.publication_authorized=true;
 assert.throws(()=>inspect(d,selector(d)),/producer_receipt_mismatch/);
});
