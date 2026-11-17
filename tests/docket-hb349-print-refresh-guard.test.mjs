import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGET,exactPlanSha256,verifyCachedIdentity,verifyProviderRefresh,verifyReadBack,performExactCandidate} from '../lib/docket-hb349-print-refresh-guard.mjs';
const prior=TARGET.expectedPrior.map(x=>({doc_id:x.docId,state_link:x.officialPrintUrl,type:'Amended'}));
const found={doc_id:3702400,state_link:TARGET.officialPrintUrl,type:'Amended'}; // synthetic ID ONLY, not actual LegiScan identity
const bill=(texts=prior)=>({bill_id:TARGET.billId,state:TARGET.state,session_id:TARGET.sessionId,bill_number:TARGET.billNumber,texts});
const row={bill:bill()};
const expectCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
test('plan SHA is stable and consent is target-specific',()=>assert.match(exactPlanSha256(),/^[0-9a-f]{64}$/));
test('two historical docs imply refresh required, never current',()=>assert.equal(verifyCachedIdentity(row).alreadyRegisteredInCache,false));
test('already present requires valid provider doc ID',()=>assert.equal(verifyCachedIdentity({bill:bill([...prior,found])}).alreadyRegisteredInCache,true));
test('no cached bill is held',()=>expectCode(()=>verifyCachedIdentity(null),'docket_print_refresh_existing_cache_missing'));
test('wrong state fails closed',()=>expectCode(()=>verifyCachedIdentity({bill:{...bill(),state:'WA'}}),'docket_print_refresh_cache_identity_conflict'));
test('one prior missing fails closed',()=>expectCode(()=>verifyCachedIdentity({bill:bill(prior.slice(0,1))}),'docket_print_refresh_prior_document_missing'));
test('malformed target ID is held',()=>expectCode(()=>verifyCachedIdentity({bill:bill([...prior,{...found,doc_id:null}])}),'docket_print_refresh_target_provider_id_invalid'));
test('provider third print is an evidence candidate only',()=>{const d=verifyProviderRefresh(bill([...prior,found]));assert.equal(d.providerDocId,3702400);assert.equal(d.publicationAuthorized,false);assert.equal(d.sourceBytesAuthenticated,false)});
test('provider without PN4024 is held',()=>expectCode(()=>verifyProviderRefresh(bill([...prior,{...found,state_link:'https://www.palegis.us/other'}])),'docket_print_refresh_print_not_in_provider_result'));
test('provider missing historic doc is held',()=>expectCode(()=>verifyProviderRefresh(bill([prior[0],found,{...found,doc_id:3702401,state_link:'https://www.palegis.us/other'}])),'docket_print_refresh_predecessor_changed'));
test('provider missing session identity is held',()=>expectCode(()=>verifyProviderRefresh({...bill([...prior,found]),session_id:4}),'docket_print_refresh_provider_bill_identity_mismatch'));
test('provider duplicate official link held',()=>expectCode(()=>verifyProviderRefresh(bill([...prior,found,{...found,doc_id:3702401}])),'docket_print_refresh_duplicate_provider_documents'));
test('provider sequence regression held',()=>expectCode(()=>verifyProviderRefresh(bill([found,...prior])),'docket_print_refresh_provider_print_order_invalid'));
test('readback requires both canonical identities',()=>expectCode(()=>verifyReadBack({}), 'docket_print_refresh_registration_missing'));
test('readback rejects invented predecessor',()=>{const expected=verifyProviderRefresh(bill([...prior,found]));expectCode(()=>verifyReadBack({expected,docketDocument:{source_document_key:expected.sourceDocumentKey,source_bill_id:TARGET.billId,provider_document_id:3702400,source_url:TARGET.officialPrintUrl,predecessor_source_document_key:'fake'},genomeVersion:{source_document_key:expected.sourceDocumentKey,source_bill_id:TARGET.billId,predecessor_source_document_key:'fake'}}),'docket_print_refresh_registration_identity_mismatch')});
test('dry-run invokes no paid request or canonical write',async()=>{let calls=0;const d=await performExactCandidate({cachedRow:row,fetchOneBill:async()=>calls++,canonicalAccept:async()=>calls++,readBack:async()=>calls++,environment:{},apply:false});assert.equal(d.executed,false);assert.equal(calls,0)});
test('worker flag insufficient without exact plan consent',async()=>{await assert.rejects(performExactCandidate({cachedRow:row,apply:true,environment:{LIGHTHOUSE_RUNTIME_ROLE:'worker'}}),e=>e.code==='docket_print_refresh_exact_plan_approval_missing')});
test('web role cannot apply even with correct hash',async()=>{await assert.rejects(performExactCandidate({cachedRow:row,apply:true,environment:{LIGHTHOUSE_RUNTIME_ROLE:'web',DOCKET_EXACT_PRINT_REFRESH_APPROVED_SHA256:exactPlanSha256()}}),e=>e.code==='docket_print_refresh_requires_worker_role')});
test('provider failure produces no Docket write',async()=>{let wrote=false;await assert.rejects(performExactCandidate({cachedRow:row,apply:true,environment:{LIGHTHOUSE_RUNTIME_ROLE:'worker',DOCKET_EXACT_PRINT_REFRESH_APPROVED_SHA256:exactPlanSha256()},fetchOneBill:async()=>bill(prior),canonicalAccept:async()=>{wrote=true},readBack:async()=>({})}),e=>e.code==='docket_print_refresh_provider_document_invalid');assert.equal(wrote,false)});
test('successful candidate calls provider once, writes only via canonical accept, requires DB readback',async()=>{let provider=0,accept=0,read=0;const d=await performExactCandidate({cachedRow:row,apply:true,environment:{LIGHTHOUSE_RUNTIME_ROLE:'worker',DOCKET_EXACT_PRINT_REFRESH_APPROVED_SHA256:exactPlanSha256()},fetchOneBill:async()=>{provider++;return bill([...prior,found])},canonicalAccept:async input=>{accept++;assert.equal(input.source,'legiscan_get_bill_exact_print_refresh')},readBack:async m=>{read++;return{docketDocument:{source_document_key:m.sourceDocumentKey,source_bill_id:TARGET.billId,provider_document_id:m.providerDocId,source_url:TARGET.officialPrintUrl,predecessor_source_document_key:`text:${TARGET.billId}:${TARGET.expectedPrior.at(-1).docId}`},genomeVersion:{source_document_key:m.sourceDocumentKey,source_bill_id:TARGET.billId,predecessor_source_document_key:`text:${TARGET.billId}:${TARGET.expectedPrior.at(-1).docId}`}}}});assert.deepEqual([provider,accept,read],[1,1,1]);assert.equal(d.verified.publicationAuthorized,false)});
test('already registered is no-op, never recontacts provider',async()=>{let calls=0;const d=await performExactCandidate({cachedRow:{bill:bill([...prior,found])},apply:true,fetchOneBill:async()=>{calls++},environment:{LIGHTHOUSE_RUNTIME_ROLE:'worker',DOCKET_EXACT_PRINT_REFRESH_APPROVED_SHA256:exactPlanSha256()}});assert.equal(d.executed,false);assert.equal(calls,0)});
test('readback lacking Genome predecessor is held, not certified',()=>{
  const expected=verifyProviderRefresh(bill([...prior,found]));
  expectCode(()=>verifyReadBack({expected,
    docketDocument:{source_document_key:expected.sourceDocumentKey,source_bill_id:TARGET.billId,provider_document_id:expected.providerDocId,source_url:TARGET.officialPrintUrl,predecessor_source_document_key:`text:${TARGET.billId}:${TARGET.expectedPrior.at(-1).docId}`},
    genomeVersion:{source_document_key:expected.sourceDocumentKey,source_bill_id:TARGET.billId,predecessor_source_document_key:null}
  }),'docket_print_refresh_registration_identity_mismatch');
});
test('post-write readback failure never fabricates a successful receipt',async()=>{
  let paid=0,accepted=0;
  await assert.rejects(performExactCandidate({cachedRow:row,apply:true,
    environment:{LIGHTHOUSE_RUNTIME_ROLE:'worker',DOCKET_EXACT_PRINT_REFRESH_APPROVED_SHA256:exactPlanSha256()},
    fetchOneBill:async()=>{paid++;return bill([...prior,found])},
    canonicalAccept:async()=>{accepted++},readBack:async()=>({docketDocument:null,genomeVersion:null})
  }),e=>e.code==='docket_print_refresh_registration_missing');
  assert.deepEqual([paid,accepted],[1,1]); // Caller must reconcile the committed cache before any retry.
});
