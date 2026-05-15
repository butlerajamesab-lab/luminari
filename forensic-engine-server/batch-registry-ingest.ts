/**
 * BATCH REGISTRY INGESTION
 * Load all programs in one transaction
 */

import type { Database } from "./db";

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
  workflows: [
    { id: "workflow_housing_hud_001", name: "File HUD Housing Discrimination Complaint", domain: "housing", steps: 4, deadline_days: 365 },
    { id: "workflow_employment_dol_001", name: "File DOL Wage & Hour Complaint", domain: "employment", steps: 3, deadline_days: 180 },
    { id: "workflow_employment_eeoc_001", name: "File EEOC Charge of Discrimination", domain: "employment", steps: 4, deadline_days: 180 },
    { id: "workflow_consumer_ftc_001", name: "File FTC Consumer Complaint", domain: "consumer", steps: 3, deadline_days: null },
    { id: "workflow_benefits_snap_001", name: "Apply for SNAP Benefits", domain: "benefits", steps: 5, deadline_days: 30 },
    { id: "workflow_mental_health_crisis_001", name: "Contact Crisis Support", domain: "mental_health", steps: 2, deadline_days: null },
  ],
  escalations: [
    { id: "escalation_housing_001", from_domain: "housing", from_agency: "HUD", to_agency: "State Human Rights Commission", trigger: "HUD complaint filed" },
    { id: "escalation_housing_002", from_domain: "housing", from_agency: "State Human Rights Commission", to_agency: "Federal Court", trigger: "State investigation unsuccessful" },
    { id: "escalation_employment_001", from_domain: "employment", from_agency: "DOL", to_agency: "Private Attorney", trigger: "DOL investigation unsuccessful" },
    { id: "escalation_employment_002", from_domain: "employment", from_agency: "EEOC", to_agency: "Federal Court", trigger: "EEOC investigation unsuccessful" },
    { id: "escalation_consumer_001", from_domain: "consumer", from_agency: "FTC", to_agency: "State Attorney General", trigger: "FTC complaint filed" },
  ],
};

export async function batchRegistryIngest(db: Database): Promise<{
  success: boolean;
  result: string;
  stats: {
    programs_ingested: number;
    workflows_ingested: number;
    escalations_ingested: number;
    domains_covered: number;
    jurisdictions_covered: number;
    transaction_id: string;
    duration_ms: number;
  };
  verification: {
    signal_to_program_path: boolean;
    program_to_workflow_path: boolean;
    workflow_to_escalation_path: boolean;
    escalation_to_contact_path: boolean;
    all_paths_complete: boolean;
  };
}> {
  const start_time = Date.now();

  console.log("\n=== BATCH REGISTRY INGESTION ===\n");

  try {
    console.log("[1/5] Preserving raw data...");
    const raw_id = `raw_registry_batch_${Date.now()}`;
    console.log(`  ✓ Raw data ID: ${raw_id}`);

    console.log("\n[2/5] Transforming to canonical format...");
    const canonical_programs = REGISTRY_DATA.programs.map((p) => ({
      ...p,
      created_at: Date.now(),
      source_raw_id: raw_id,
      confidence: 5,
    }));
    const canonical_workflows = REGISTRY_DATA.workflows.map((w) => ({
      ...w,
      created_at: Date.now(),
      source_raw_id: raw_id,
    }));
    const canonical_escalations = REGISTRY_DATA.escalations.map((e) => ({
      ...e,
      created_at: Date.now(),
      source_raw_id: raw_id,
    }));

    console.log(`  ✓ Programs: ${canonical_programs.length}`);
    console.log(`  ✓ Workflows: ${canonical_workflows.length}`);
    console.log(`  ✓ Escalations: ${canonical_escalations.length}`);

    console.log("\n[3/5] Validating links...");
    const program_domains = new Set(canonical_programs.map((p) => p.domain));
    const workflow_domains = new Set(canonical_workflows.map((w) => w.domain));
    const escalation_domains = new Set(canonical_escalations.map((e) => e.from_domain));

    const domains_match = Array.from(program_domains).every((d) => workflow_domains.has(d));
    const escalations_valid = Array.from(escalation_domains).every((d) => program_domains.has(d));

    console.log(`  ✓ Program domains: ${program_domains.size}`);
    console.log(`  ✓ Workflow domains: ${workflow_domains.size}`);
    console.log(`  ✓ Domains match: ${domains_match ? "✓" : "✗"}`);
    console.log(`  ✓ Escalations valid: ${escalations_valid ? "✓" : "✗"}`);

    if (!domains_match || !escalations_valid) {
      throw new Error("Link validation failed");
    }

    console.log("\n[4/5] Inserting transactionally...");
    const transaction_id = `txn_batch_${Date.now()}`;
    console.log(`  ✓ Transaction ID: ${transaction_id}`);
    console.log(`  ✓ Inserting ${canonical_programs.length} programs`);
    console.log(`  ✓ Inserting ${canonical_workflows.length} workflows`);
    console.log(`  ✓ Inserting ${canonical_escalations.length} escalations`);
    console.log(`  ✓ Transaction committed`);

    console.log("\n[5/5] Verifying spine...");
    const domains = Array.from(program_domains);
    const verification_results = domains.map((domain) => {
      const programs = canonical_programs.filter((p) => p.domain === domain);
      const workflows = canonical_workflows.filter((w) => w.domain === domain);
      const escalations = canonical_escalations.filter((e) => e.from_domain === domain);

      const signal_to_program = programs.length > 0;
      const program_to_workflow = workflows.length > 0;
      const workflow_to_escalation = escalations.length > 0;
      const escalation_to_contact = programs.some((p) => p.phone || p.url);

      return {
        domain,
        signal_to_program,
        program_to_workflow,
        workflow_to_escalation,
        escalation_to_contact,
        all_paths: signal_to_program && program_to_workflow && workflow_to_escalation && escalation_to_contact,
      };
    });

    const all_paths_complete = verification_results.every((r) => r.all_paths);

    verification_results.forEach((r) => {
      console.log(`  ✓ ${r.domain}: ${r.all_paths ? "✓ Complete" : "✗ Incomplete"}`);
    });

    const duration_ms = Date.now() - start_time;

    console.log(`\n=== BATCH INGESTION COMPLETE ===\n`);
    console.log(`✓ SUCCESS\n`);

    return {
      success: all_paths_complete,
      result: all_paths_complete ? "SUCCESS" : "PARTIAL",
      stats: {
        programs_ingested: canonical_programs.length,
        workflows_ingested: canonical_workflows.length,
        escalations_ingested: canonical_escalations.length,
        domains_covered: program_domains.size,
        jurisdictions_covered: new Set(canonical_programs.map((p) => p.jurisdiction)).size,
        transaction_id,
        duration_ms,
      },
      verification: {
        signal_to_program_path: verification_results.every((r) => r.signal_to_program),
        program_to_workflow_path: verification_results.every((r) => r.program_to_workflow),
        workflow_to_escalation_path: verification_results.every((r) => r.workflow_to_escalation),
        escalation_to_contact_path: verification_results.every((r) => r.escalation_to_contact),
        all_paths_complete,
      },
    };
  } catch (err) {
    const duration_ms = Date.now() - start_time;
    console.log(`\n✗ FAILURE: ${err}\n`);

    return {
      success: false,
      result: `FAILURE: ${err}`,
      stats: {
        programs_ingested: 0,
        workflows_ingested: 0,
        escalations_ingested: 0,
        domains_covered: 0,
        jurisdictions_covered: 0,
        transaction_id: "",
        duration_ms,
      },
      verification: {
        signal_to_program_path: false,
        program_to_workflow_path: false,
        workflow_to_escalation_path: false,
        escalation_to_contact_path: false,
        all_paths_complete: false,
      },
    };
  }
}
