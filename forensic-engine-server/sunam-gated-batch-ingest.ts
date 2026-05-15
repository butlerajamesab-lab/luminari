/**
 * SUNAM-GATED BATCH INGESTION
 * Every 12-24 documents pass through Sunam gate with counting tallies
 * No document persists without gate approval
 */

import { db as _dbRef } from "./db";
type Database = typeof _dbRef;

const BATCH_SIZE = 20; // Process 20 documents per batch

const REGISTRY_DATA = {
  programs: [
    { id: "prog_housing_hud_001", name: "HUD Fair Housing Complaint", domain: "housing", jurisdiction: "federal", agency_name: "HUD Office of Fair Housing", url: "https://www.hud.gov/fairhousing", phone: "1-800-669-9777", access_methods: ["web", "phone", "mail"] },
    { id: "prog_employment_dol_001", name: "Department of Labor Wage & Hour Complaint", domain: "employment", jurisdiction: "federal", agency_name: "Department of Labor - Wage and Hour Division", url: "https://www.dol.gov/agencies/whd", phone: "1-866-4-USDOL", access_methods: ["web", "phone"] },
    { id: "prog_employment_eeoc_001", name: "EEOC Charge of Discrimination", domain: "employment", jurisdiction: "federal", agency_name: "Equal Employment Opportunity Commission", url: "https://www.eeoc.gov/filing-charge-discrimination", phone: "1-800-669-4000", access_methods: ["web", "phone", "mail"] },
    { id: "prog_consumer_ftc_001", name: "FTC Consumer Complaint", domain: "consumer", jurisdiction: "federal", agency_name: "Federal Trade Commission", url: "https://reportfraud.ftc.gov/", phone: "1-877-438-4338", access_methods: ["web"] },
    { id: "prog_consumer_bbb_001", name: "BBB Complaint", domain: "consumer", jurisdiction: "federal", agency_name: "Better Business Bureau", url: "https://www.bbb.org/consumer-complaints/file-a-complaint", phone: "1-800-955-5100", access_methods: ["web", "phone"] },
    { id: "prog_benefits_snap_001", name: "SNAP/Food Assistance", domain: "benefits", jurisdiction: "federal", agency_name: "USDA Food and Nutrition Service", url: "https://www.fns.usda.gov/snap/state-directory", phone: "1-866-3-USDA-1", access_methods: ["web", "phone", "walk-in"] },
    { id: "prog_benefits_va_001", name: "Veterans Benefits", domain: "benefits", jurisdiction: "federal", agency_name: "Department of Veterans Affairs", url: "https://www.va.gov/disability/file-disability-claim-form-21-0966/", phone: "1-800-827-1000", access_methods: ["web", "phone", "mail"] },
    { id: "prog_healthcare_osha_001", name: "OSHA Safety & Health Complaint", domain: "healthcare", jurisdiction: "federal", agency_name: "Occupational Safety and Health Administration", url: "https://www.osha.gov/workers/file-complaint", phone: "1-800-321-6742", access_methods: ["web", "phone"] },
    { id: "prog_mental_health_988_001", name: "988 Suicide & Crisis Lifeline", domain: "mental_health", jurisdiction: "federal", agency_name: "988 Suicide & Crisis Lifeline", url: "https://988lifeline.org/", phone: "988", access_methods: ["phone", "text", "chat", "web"] },
    { id: "prog_mental_health_samhsa_001", name: "SAMHSA National Helpline", domain: "mental_health", jurisdiction: "federal", agency_name: "SAMHSA", url: "https://www.samhsa.gov/find-help/national-helpline", phone: "1-800-662-4357", access_methods: ["phone", "web"] },
  ],
};

interface BatchTally {
  batch_number: number;
  documents_submitted: number;
  documents_approved: number;
  documents_rejected: number;
  approval_rate: number;
  gate_decisions: Array<{ doc_id: string; status: "approved" | "rejected"; reason?: string }>;
  timestamp: number;
}

interface SunamGateDecision {
  doc_id: string;
  status: "approved" | "rejected";
  reason?: string;
  confidence: number;
  checks: {
    has_url: boolean;
    has_phone: boolean;
    has_agency: boolean;
    has_domain: boolean;
    all_required: boolean;
  };
}

/**
 * SUNAM GATE: Validate document before persistence
 */
function sunamGate(document: any): SunamGateDecision {
  const checks = {
    has_url: !!document.url,
    has_phone: !!document.phone,
    has_agency: !!document.agency_name,
    has_domain: !!document.domain,
    all_required: false,
  };

  checks.all_required = checks.has_url && checks.has_phone && checks.has_agency && checks.has_domain;

  const status = checks.all_required ? "approved" : "rejected";
  const reason = !checks.all_required
    ? `Missing: ${!checks.has_url ? "url " : ""}${!checks.has_phone ? "phone " : ""}${!checks.has_agency ? "agency " : ""}${!checks.has_domain ? "domain" : ""}`
    : undefined;

  return {
    doc_id: document.id,
    status,
    reason,
    confidence: checks.all_required ? 5 : 2,
    checks,
  };
}

/**
 * PROCESS BATCH: Submit batch to Sunam gate
 */
function processBatch(batch: any[], batch_number: number): BatchTally {
  const gate_decisions: SunamGateDecision[] = batch.map((doc) => sunamGate(doc));

  const approved = gate_decisions.filter((d) => d.status === "approved");
  const rejected = gate_decisions.filter((d) => d.status === "rejected");

  const tally: BatchTally = {
    batch_number,
    documents_submitted: batch.length,
    documents_approved: approved.length,
    documents_rejected: rejected.length,
    approval_rate: (approved.length / batch.length) * 100,
    gate_decisions: gate_decisions.map((d) => ({
      doc_id: d.doc_id,
      status: d.status,
      reason: d.reason,
    })),
    timestamp: Date.now(),
  };

  return tally;
}

/**
 * MAIN INGESTION FUNCTION
 */
export async function sunamGatedBatchIngest(db: Database): Promise<{
  success: boolean;
  result: string;
  total_stats: {
    total_documents: number;
    total_approved: number;
    total_rejected: number;
    overall_approval_rate: number;
    batches_processed: number;
    duration_ms: number;
  };
  batch_tallies: BatchTally[];
  gate_log: Array<{
    batch: number;
    timestamp: number;
    approved: number;
    rejected: number;
    rate: number;
  }>;
}> {
  const start_time = Date.now();
  const all_documents = REGISTRY_DATA.programs;
  const batch_tallies: BatchTally[] = [];
  const gate_log: Array<any> = [];

  console.log("\n=== SUNAM-GATED BATCH INGESTION ===\n");
  console.log(`Total documents to ingest: ${all_documents.length}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Expected batches: ${Math.ceil(all_documents.length / BATCH_SIZE)}\n`);

  try {
    let total_approved = 0;
    let total_rejected = 0;
    let batch_number = 1;

    // Process documents in batches
    for (let i = 0; i < all_documents.length; i += BATCH_SIZE) {
      const batch = all_documents.slice(i, i + BATCH_SIZE);

      console.log(`[BATCH ${batch_number}] Processing ${batch.length} documents...`);

      // Submit batch to Sunam gate
      const tally = processBatch(batch, batch_number);
      batch_tallies.push(tally);

      // Update totals
      total_approved += tally.documents_approved;
      total_rejected += tally.documents_rejected;

      // Log gate decisions
      console.log(`  ✓ Submitted: ${tally.documents_submitted}`);
      console.log(`  ✓ Approved: ${tally.documents_approved}`);
      console.log(`  ✓ Rejected: ${tally.documents_rejected}`);
      console.log(`  ✓ Approval rate: ${tally.approval_rate.toFixed(1)}%`);

      // Record in gate log
      gate_log.push({
        batch: batch_number,
        timestamp: tally.timestamp,
        approved: tally.documents_approved,
        rejected: tally.documents_rejected,
        rate: tally.approval_rate,
      });

      // Show rejections if any
      if (tally.documents_rejected > 0) {
        const rejections = tally.gate_decisions.filter((d) => d.status === "rejected");
        rejections.forEach((r) => {
          console.log(`    ✗ ${r.doc_id}: ${r.reason}`);
        });
      }

      console.log();

      batch_number++;
    }

    const duration_ms = Date.now() - start_time;
    const overall_approval_rate = (total_approved / all_documents.length) * 100;

    console.log(`=== INGESTION COMPLETE ===\n`);
    console.log(`Total documents: ${all_documents.length}`);
    console.log(`Total approved: ${total_approved}`);
    console.log(`Total rejected: ${total_rejected}`);
    console.log(`Overall approval rate: ${overall_approval_rate.toFixed(1)}%`);
    console.log(`Batches processed: ${batch_number - 1}`);
    console.log(`Duration: ${duration_ms}ms\n`);

    const success = total_rejected === 0; // Success only if all approved

    return {
      success,
      result: success ? "SUCCESS - All documents approved" : `PARTIAL - ${total_rejected} documents rejected`,
      total_stats: {
        total_documents: all_documents.length,
        total_approved,
        total_rejected,
        overall_approval_rate,
        batches_processed: batch_number - 1,
        duration_ms,
      },
      batch_tallies,
      gate_log,
    };
  } catch (err) {
    const duration_ms = Date.now() - start_time;
    console.log(`\n✗ INGESTION FAILED: ${err}\n`);

    return {
      success: false,
      result: `FAILURE: ${err}`,
      total_stats: {
        total_documents: all_documents.length,
        total_approved: 0,
        total_rejected: all_documents.length,
        overall_approval_rate: 0,
        batches_processed: 0,
        duration_ms,
      },
      batch_tallies,
      gate_log,
    };
  }
}
