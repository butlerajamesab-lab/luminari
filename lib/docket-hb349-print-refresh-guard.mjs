// Candidate, non-runtime Docket refresh guard. Do not treat provider text metadata
// as official source bytes or as Rosetta/canonical semantic certification.
import { createHash } from 'node:crypto';

export const CONTRACT = 'docket-exact-print-metadata-refresh-candidate-v1';
export const TARGET = Object.freeze({
  state: 'PA',
  sessionId: 2192,
  billId: 1940853,
  billNumber: 'HB349',
  officialPrintUrl: 'https://www.palegis.us/legislation/bills/text/PDF/2025/0/HB0349/PN4024',
  expectedPrior: Object.freeze([
    Object.freeze({docId: 3084350, officialPrintUrl: 'https://www.palegis.us/legislation/bills/text/PDF/2025/0/HB0349/PN0304'}),
    Object.freeze({docId: 3460740, officialPrintUrl: 'https://www.palegis.us/legislation/bills/text/PDF/2025/0/HB0349/PN3943'}),
  ]),
});

const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
export const exactPlan = () => ({contract: CONTRACT, target: TARGET, mode:'one-getBill-then-existing-Docket-acceptance', maxProviderRequests:1, retry:false, downstreamEnqueue:false});
export const exactPlanSha256 = () => hash(JSON.stringify(exactPlan()));

const fail = (code, reason='') => { const error = new Error(code); error.code=code; error.reason=reason; throw error; };
const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const number = value => Number(value);
const official = value => typeof value === 'string' && /^https:\/\/www\.palegis\.us\//.test(value);
const docArray = bill => Array.isArray(bill?.texts) ? bill.texts : fail('docket_print_refresh_text_array_missing');

export function verifyCachedIdentity(row) {
  if (!row || !record(row.bill)) fail('docket_print_refresh_existing_cache_missing');
  const b = row.bill;
  if (number(b.bill_id)!==TARGET.billId || b.state!==TARGET.state ||
      number(b.session_id)!==TARGET.sessionId || b.bill_number!==TARGET.billNumber)
    fail('docket_print_refresh_cache_identity_conflict');
  const docs=docArray(b);
  if(docs.some(d=>!record(d))) fail('docket_print_refresh_invalid_cached_document');
  for (const prior of TARGET.expectedPrior) {
    if(!docs.some(d => number(d.doc_id)===prior.docId && d.state_link===prior.officialPrintUrl))
      fail('docket_print_refresh_prior_document_missing',String(prior.docId));
  }
  const present = docs.filter(d=>d.state_link===TARGET.officialPrintUrl);
  if (present.length > 1) fail('docket_print_refresh_duplicate_target_print');
  if (present.length===1) {
    if (!Number.isSafeInteger(number(present[0].doc_id)) || number(present[0].doc_id)<1)
      fail('docket_print_refresh_target_provider_id_invalid');
    return {alreadyRegisteredInCache:true, providerDocId:number(present[0].doc_id), cachedDocumentCount:docs.length};
  }
  return {alreadyRegisteredInCache:false,providerDocId:null,cachedDocumentCount:docs.length};
}

export function verifyProviderRefresh(response) {
  if(!record(response) || number(response.bill_id)!==TARGET.billId ||
    response.state!==TARGET.state || number(response.session_id)!==TARGET.sessionId ||
    response.bill_number!==TARGET.billNumber)
    fail('docket_print_refresh_provider_bill_identity_mismatch');
  const docs=docArray(response);
  if(docs.length<3 || docs.some(d=>!record(d) || !Number.isSafeInteger(number(d.doc_id)) || number(d.doc_id)<1 || !official(d.state_link)))
    fail('docket_print_refresh_provider_document_invalid');
  const ids=new Set();const urls=new Set();
  for(const d of docs) {
    if(ids.has(number(d.doc_id)) || urls.has(d.state_link)) fail('docket_print_refresh_duplicate_provider_documents');
    ids.add(number(d.doc_id)); urls.add(d.state_link);
  }
  let prevIndex=-1;
  for(const prior of TARGET.expectedPrior){
    const i=docs.findIndex(d=>number(d.doc_id)===prior.docId && d.state_link===prior.officialPrintUrl);
    if (i<=prevIndex) fail('docket_print_refresh_predecessor_changed',String(prior.docId));
    prevIndex=i;
  }
  const index=docs.findIndex(d=>d.state_link===TARGET.officialPrintUrl);
  if(index<0) fail('docket_print_refresh_print_not_in_provider_result');
  if(index<=prevIndex || index!==docs.length-1) fail('docket_print_refresh_provider_print_order_invalid');
  if(index!==prevIndex+1) fail('docket_print_refresh_immediate_predecessor_changed');
  const providerDocId=number(docs[index].doc_id);
  if(TARGET.expectedPrior.some(p=>p.docId===providerDocId)) fail('docket_print_refresh_provider_doc_id_reused');
  return {providerDocId, providerSequence:index+1, sourceDocumentKey:`text:${TARGET.billId}:${providerDocId}`,
    providerDocType:docs[index].type??null, officialPrintUrl:TARGET.officialPrintUrl,
    sourceBytesAuthenticated:false, typographyAuthenticated:false,
    rosettaCertified:false, genomeAssemblyAuthorized:false, publicationAuthorized:false};
}

export function verifyReadBack(input) {
  if(!input || !input.docketDocument || !input.genomeVersion || input.matchingRowCount!==1) fail('docket_print_refresh_registration_missing');
  const {docketDocument:d,genomeVersion:g,expected}=input;
  if(d.source_document_key!==expected.sourceDocumentKey || number(d.source_bill_id)!==TARGET.billId ||
    number(d.provider_document_id)!==expected.providerDocId || d.source_url!==TARGET.officialPrintUrl ||
    g.source_document_key!==expected.sourceDocumentKey || number(g.source_bill_id)!==TARGET.billId ||
    g.predecessor_source_document_key!==`text:${TARGET.billId}:${TARGET.expectedPrior.at(-1).docId}` ||
    d.predecessor_source_document_key!==`text:${TARGET.billId}:${TARGET.expectedPrior.at(-1).docId}`)
    fail('docket_print_refresh_registration_identity_mismatch');
  return {sourceDocumentKey:expected.sourceDocumentKey,sourceMetadataRegistered:true,
    downstreamEnqueueAuthorized:false,sourceBytesAuthenticated:false,publicationAuthorized:false};
}

export async function performExactCandidate({cachedRow,fetchOneBill,canonicalAccept,readBack,environment,apply=false}) {
  const cache=verifyCachedIdentity(cachedRow);
  const planned={contract:CONTRACT,planSha256:exactPlanSha256(), target:TARGET, cache, applyEligible:!cache.alreadyRegisteredInCache};
  if(!apply || cache.alreadyRegisteredInCache) return {...planned,executed:false,providerRequests:0};
  if(environment?.LIGHTHOUSE_RUNTIME_ROLE!=='worker') fail('docket_print_refresh_requires_worker_role');
  if(environment?.DOCKET_EXACT_PRINT_REFRESH_APPROVED_SHA256!==exactPlanSha256())
    fail('docket_print_refresh_exact_plan_approval_missing');
  if(typeof fetchOneBill!=='function'||typeof canonicalAccept!=='function'||typeof readBack!=='function')
    fail('docket_print_refresh_required_canonical_dependencies_missing');
  // Exactly one paid-provider request. No retries, fallback, or write on failed proof.
  const providerBill=await fetchOneBill(TARGET.billId);
  const matched=verifyProviderRefresh(providerBill);
  await canonicalAccept({bill_id:TARGET.billId,bill:providerBill,source:'legiscan_get_bill_exact_print_refresh',label:'docket_exact_print_refresh_canonical_accept'});
  const fresh=await readBack(matched);
  const verified=verifyReadBack({...fresh,expected:matched});
  return {...planned,executed:true,providerRequests:1,matched,verified};
}
