import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { inspect_selected_output_integrity as inspect } from '../server/rosetta-selected-output-integrity.js';
const docs=JSON.parse(readFileSync(new URL('./fixtures/selected-output-six-source-integrity.json',import.meta.url))).documents;
const source=readFileSync(new URL('../server/current-law-rosetta-live.ts',import.meta.url),'utf8');
async function reader(payload) {
 let requests=0;
 const context=vm.createContext({URL,AbortController,setTimeout,clearTimeout,
  fetch:async()=>{requests++;return Response.json(payload);}});
 const module=new vm.SourceTextModule(stripTypeScriptTypes(source),{context});
 await module.link(async specifier=>{
  const exports=specifier==='./rosetta-review-url'
   ? {get_rosetta_review_base_url:()=> 'https://rosetta.example.test'}
   : specifier==='./rosetta-selected-output-integrity.js'
    ? {inspect_selected_output_integrity:inspect} : null;
  if(!exports) throw new Error('Unexpected dependency: '+specifier);
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});
 });
 await module.evaluate();
 return {read:module.namespace.get_current_rosetta_live_detail,count:()=>requests};
}
test('real consumer reads each exact source once and reproduces producer integrity without legacy certification calls',async()=>{
 for(const original of docs){
  const payload=structuredClone(original);
  payload.output_integrity=inspect(payload,payload.source);
  const client=await reader(payload);
  const result=await client.read(payload.source);
  assert.equal(client.count(),1);
  assert.deepEqual(result.output_integrity,payload.output_integrity);
  assert.equal(result.output_integrity.publication_authorized,false);
 }
});
test('consumer rejects a producer receipt that contradicts the received data',async()=>{
 const payload=structuredClone(docs[0]);
 payload.output_integrity={...inspect(payload,payload.source),output_sha256:'f'.repeat(64)};
 const client=await reader(payload);
 await assert.rejects(client.read(payload.source),/producer_receipt_mismatch/);
});
test('consumer checks real unit hash evidence rather than trusting normalized text',async()=>{
 const payload=structuredClone(docs[0]);payload.units[0].text_sha256='f'.repeat(64);
 const client=await reader(payload);
 await assert.rejects(client.read(payload.source),/unit_hash/);
});
