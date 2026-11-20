// One-time candidate CLI. Default reads Docket only; --apply requires exact
// plan SHA approval, worker runtime, and one existing budget-controlled getBill.
// NEVER schedules itself, retries, invokes getBillText or starts downstream work.
import { exactPlanSha256, TARGET, performExactCandidate } from '../lib/docket-hb349-print-refresh-guard.mjs';
import { query_with_diagnostics } from '../server/queue-db-diagnostics.ts';
import { get_bill } from '../server/services/legiscan.ts';
import { accept_docket_bill_detail } from '../server/docket-bill-detail-acceptance.ts';

async function main() {
  if(process.argv.length > 3 || (process.argv[2] && !['--dry-run','--apply'].includes(process.argv[2])))
    throw new Error('usage: pnpm exec tsx scripts/docket-hb349-print-refresh.mjs [--dry-run|--apply]');
  const apply=process.argv[2]==='--apply';
  const current=await query_with_diagnostics(
    'select bill, fetched_at, source from public.docket_bill_detail_cache where bill_id = $1 limit 1',
    [TARGET.billId],{label:'docket_exact_print_refresh_preflight',query_timeout_ms:10000});
  const readBack=async expected=>{
    const result=await query_with_diagnostics(`
      select d.source_document_key as d_key,d.source_bill_id as d_bill,
             d.provider_document_id as d_doc,d.source_url as d_url,
             d.predecessor_source_document_key as d_predecessor,
             v.source_document_key as v_key,v.source_bill_id as v_bill,
             predecessor.source_document_key as v_predecessor
        from public.docket_bill_source_document d
        left join public.civic_genome_bill_version v
          on v.source_document_key=d.source_document_key and v.source_bill_id=d.source_bill_id
        left join public.civic_genome_bill_version predecessor
          on predecessor.bill_version_id=v.predecessor_bill_version_id
       where d.source_document_key=$1 and d.source_bill_id=$2`,
      [expected.sourceDocumentKey,TARGET.billId],
      {label:'docket_exact_print_refresh_readback',query_timeout_ms:10000});
    const row=result.rows[0];
    return { matchingRowCount:result.rows.length,
      docketDocument:row?{source_document_key:row.d_key,source_bill_id:row.d_bill,provider_document_id:row.d_doc,source_url:row.d_url,predecessor_source_document_key:row.d_predecessor}:null,
      genomeVersion:row && row.v_key?{source_document_key:row.v_key,source_bill_id:row.v_bill,predecessor_source_document_key:row.v_predecessor}:null,
    };
  };
  const result=await performExactCandidate({
    cachedRow:current.rows[0]??null,
    fetchOneBill:get_bill,
    canonicalAccept:accept_docket_bill_detail,
    readBack,
    environment:process.env,
    apply,
  });
  // No provider body or API credential is printed. These metadata fields are evidence only.
  console.log(JSON.stringify({contract:result.contract,planSha256:result.planSha256,
    billId:TARGET.billId,expectedOfficialUrl:TARGET.officialPrintUrl,
    cache:result.cache,executed:result.executed,providerRequests:result.providerRequests,
    matched:result.matched??null,verified:result.verified??null,
    sourceBytesAuthenticated:false,legalDecompositionAuthorized:false,publicationAuthorized:false},null,2));
  if(!apply) console.log('NO WRITE: --apply requires an exact plan SHA in DOCKET_EXACT_PRINT_REFRESH_APPROVED_SHA256 and LIGHTHOUSE_RUNTIME_ROLE=worker.');
}
main().catch(error=>{
  // Never print provider response/error contents or URLs containing credentials.
  const safeCode=/^docket_[a-z0-9_]+$/.test(error?.code)?error.code:'docket_exact_print_refresh_failed';
  console.error(safeCode);
  process.exitCode=1;
});
