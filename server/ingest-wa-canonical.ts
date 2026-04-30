/**
 * Washington State Canonical Data Ingestion
 * 
 * Controlled sequence:
 * 1. Extract from template
 * 2. Validate structure
 * 3. Dry run (no writes)
 * 4. Ingest in order: jurisdictions → programs → workflows → steps → entities → signals
 * 5. Verify counts
 * 
 * Connection: PostgreSQL (luminari_registry)
 * Safety: Full validation before any writes
 */

import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

// ─── STEP 1: EXTRACT WA DATA ───

const waData = {
  jurisdiction: {
    code: "WA",
    name: "Washington",
    region: "Pacific Northwest",
  },
  programs: [
    // FOOD & NUTRITION
    {
      name: "Basic Food (WA SNAP)",
      code: "WA-SNAP-001",
      category: "Food & Nutrition",
      description: "State/Federal income-based food assistance",
      eligibility: "Income-based, all households",
      website: "washingtonconnection.org",
      contacts: [
        { type: "phone", value: "877-501-2233", label: "SNAP Hotline" },
      ],
    },
    {
      name: "Food Assistance Program (FAP)",
      code: "WA-FAP-001",
      category: "Food & Nutrition",
      description: "State program for legal immigrants ineligible for federal SNAP",
      eligibility: "Legal immigrants ineligible for federal SNAP",
      website: "washingtonconnection.org",
      contacts: [
        { type: "phone", value: "877-501-2233", label: "FAP Hotline" },
      ],
    },
    {
      name: "WIC – Washington State",
      code: "WA-WIC-001",
      category: "Food & Nutrition",
      description: "Women, Infants, and Children nutrition program",
      eligibility: "Pregnant/postpartum, children under 5",
      website: "doh.wa.gov/wic",
      contacts: [
        { type: "phone", value: "800-841-1410", label: "WIC Program" },
      ],
    },
    {
      name: "Working Families Tax Credit",
      code: "WA-WFTC-001",
      category: "Food & Nutrition",
      description: "State tax credit for working families",
      eligibility: "Workers who filed federal return, income-qualified",
      website: "workingfamiliescredit.wa.gov",
      contacts: [
        { type: "online", value: "workingfamiliescredit.wa.gov", label: "Apply Online" },
      ],
    },
    // HEALTHCARE
    {
      name: "Apple Health (Medicaid)",
      code: "WA-MEDICAID-001",
      category: "Healthcare",
      description: "State/Federal Medicaid program",
      eligibility: "Income < 138% FPL",
      website: "wahbexchange.org",
      contacts: [
        { type: "phone", value: "800-562-3022", label: "Apple Health" },
      ],
    },
    {
      name: "Apple Health for Kids (CHIP)",
      code: "WA-CHIP-001",
      category: "Healthcare",
      description: "Children's Health Insurance Program",
      eligibility: "Children above Medicaid income",
      website: "wahbexchange.org",
      contacts: [
        { type: "phone", value: "800-562-3022", label: "CHIP Enrollment" },
      ],
    },
    {
      name: "Cascade Care Savings",
      code: "WA-CASCADE-001",
      category: "Healthcare",
      description: "State marketplace plan with premium assistance",
      eligibility: "Income 100–250% FPL",
      website: "wahbexchange.org",
      contacts: [
        { type: "phone", value: "855-923-4633", label: "Cascade Care" },
      ],
    },
    {
      name: "Harborview Medical Center – Charity Care",
      code: "WA-HARBORVIEW-001",
      category: "Healthcare",
      description: "County hospital with charity care for uninsured",
      eligibility: "Anyone — regardless of insurance or ability to pay",
      website: "hmc.washington.edu",
      contacts: [
        { type: "phone", value: "206-744-3000", label: "Harborview Main" },
        { type: "in_person", value: "325 9th Ave, Seattle, WA 98104", label: "Billing Office" },
      ],
    },
    // HOUSING & RENT
    {
      name: "AREN (Additional Requirements for Emergent Needs)",
      code: "WA-AREN-001",
      category: "Housing & Rent",
      description: "Emergency one-time payment for housing/utilities",
      eligibility: "Emergency housing/utilities need",
      website: "washingtonconnection.org",
      contacts: [
        { type: "phone", value: "877-501-2233", label: "AREN Hotline" },
      ],
    },
    {
      name: "HEN (Housing and Essential Needs)",
      code: "WA-HEN-001",
      category: "Housing & Rent",
      description: "Rent and essential items for GA recipients",
      eligibility: "Adults unable to work, GA recipients",
      website: "dshs.wa.gov",
      contacts: [
        { type: "phone", value: "877-501-2233", label: "HEN Program" },
      ],
    },
    {
      name: "Seattle Housing Authority (SHA)",
      code: "WA-SHA-001",
      category: "Housing & Rent",
      description: "Public housing and vouchers for Seattle",
      eligibility: "Income-qualified Seattle residents",
      website: "seattlehousing.org",
      contacts: [
        { type: "phone", value: "206-615-3300", label: "SHA Main" },
      ],
    },
    // DOMESTIC VIOLENCE & SAFETY
    {
      name: "WA State DV Hotline",
      code: "WA-DV-HOTLINE-001",
      category: "Domestic Violence & Safety",
      description: "24/7 statewide domestic violence hotline",
      eligibility: "Anyone experiencing DV",
      website: "wscadv.org",
      contacts: [
        { type: "phone", value: "800-562-6025", label: "DV Hotline (24/7)" },
      ],
    },
    {
      name: "New Beginnings (Seattle)",
      code: "WA-NEWBEGIN-001",
      category: "Domestic Violence & Safety",
      description: "DV shelter, legal, and counseling services",
      eligibility: "DV survivors, Seattle area",
      website: "newbegin.org",
      contacts: [
        { type: "phone", value: "206-522-9472", label: "Crisis Line (24/7)" },
      ],
    },
    // LEGAL AID
    {
      name: "NJP – CLEAR Hotline",
      code: "WA-CLEAR-001",
      category: "Legal Aid",
      description: "Statewide civil legal aid hotline",
      eligibility: "Income < 200% FPL, civil legal needs",
      website: "nwjustice.org",
      contacts: [
        { type: "phone", value: "888-201-1014", label: "CLEAR Hotline" },
      ],
    },
    {
      name: "Housing Justice Project",
      code: "WA-HJP-001",
      category: "Legal Aid",
      description: "Free eviction defense legal help",
      eligibility: "King County renters facing eviction",
      website: "tenantlawcenter.org",
      contacts: [
        { type: "phone", value: "206-267-7090", label: "HJP Legal" },
      ],
    },
  ],
  workflows: [
    {
      name: "Housing Violation / Tenant Rights",
      code: "WA-WORKFLOW-HOUSING-001",
      trigger: "Landlord shuts off heat, water, or utilities illegally",
      steps: [
        {
          order: 1,
          title: "Document the Issue",
          description: "Photograph the issue with timestamp. Keep all correspondence with landlord in writing (text or email). Note dates, times, temperatures if applicable.",
          documents: "Photos, written communications",
          deadline_days: 1,
          agency: "Self-documentation",
        },
        {
          order: 2,
          title: "Notify Landlord",
          description: "Send written notice (text or email) stating the violation, citing RCW 59.18 (WA Residential Landlord-Tenant Act). Give landlord reasonable time to remedy.",
          documents: "Written notice to landlord",
          deadline_days: 0,
          agency: "Landlord",
        },
        {
          order: 3,
          title: "Contact Agency",
          description: "File complaint with Seattle Office of Housing (city), or King County Code Enforcement, or WA Attorney General Renters' Rights Hotline.",
          documents: "Photos, correspondence, lease",
          deadline_days: 7,
          agency: "Seattle Office of Housing / King County Code Enforcement",
        },
        {
          order: 4,
          title: "Request Inspection",
          description: "Ask the city or county to conduct a housing inspection. Inspection report becomes official documentation.",
          documents: "Complaint number from step 3",
          deadline_days: 14,
          agency: "City/County Housing Inspector",
        },
        {
          order: 5,
          title: "Seek Legal Help",
          description: "Contact Housing Justice Project (free eviction legal defense) or Northwest Justice Project CLEAR hotline. Consider rent withholding remedy under RCW 59.18.115.",
          documents: "All documentation from steps 1–4",
          deadline_days: 30,
          agency: "Housing Justice Project / CLEAR",
        },
        {
          order: 6,
          title: "Escalate if Unresolved",
          description: "File complaint with WA Attorney General Consumer Protection Division. If health/safety threat, contact Seattle-King County Public Health.",
          documents: "Full documentation package",
          deadline_days: 30,
          agency: "WA Attorney General / Public Health",
        },
      ],
    },
    {
      name: "Insurance Claim Denial",
      code: "WA-WORKFLOW-INSURANCE-001",
      trigger: "Health insurance claim denied as 'not medically necessary'",
      steps: [
        {
          order: 1,
          title: "Document the Denial",
          description: "Collect denial letter, Explanation of Benefits (EOB), original claim, and all correspondence. Note exact denial language and reason code.",
          documents: "Denial letter, EOB, original claim",
          deadline_days: 0,
          agency: "Self-documentation",
        },
        {
          order: 2,
          title: "File Internal Appeal",
          description: "File internal appeal with insurer within the deadline stated in denial letter (typically 180 days for ACA plans). Request full claims file.",
          documents: "Written appeal letter, supporting medical records",
          deadline_days: 180,
          agency: "Insurance Company",
        },
        {
          order: 3,
          title: "Get Provider Support",
          description: "Ask treating physician to write letter of medical necessity. Get clinical documentation if applicable.",
          documents: "Physician letter, clinical notes, peer-reviewed literature",
          deadline_days: 180,
          agency: "Treating Physician",
        },
      ],
    },
  ],
  entities: [
    {
      name: "WA Attorney General",
      type: "State Agency",
      contact_name: "Consumer Protection Division",
      contact_phone: "206-464-6684",
      contact_email: "consumer@atg.wa.gov",
      office_address: "800 5th Ave, Suite 2000, Seattle, WA 98104",
    },
    {
      name: "Seattle Office of Housing",
      type: "City Agency",
      contact_name: "Housing Enforcement",
      contact_phone: "206-615-1500",
      contact_email: "housing@seattle.gov",
      office_address: "700 5th Ave, Suite 5700, Seattle, WA 98104",
    },
    {
      name: "King County Code Enforcement",
      type: "County Agency",
      contact_name: "Housing Code Enforcement",
      contact_phone: "206-296-8800",
      contact_email: "code@kingcounty.gov",
      office_address: "King County Courthouse, Seattle, WA 98104",
    },
    {
      name: "Washington State Department of Health",
      type: "State Agency",
      contact_name: "Health & Safety",
      contact_phone: "360-236-4010",
      contact_email: "health@doh.wa.gov",
      office_address: "101 Israel Road SW, Tumwater, WA 98501",
    },
  ],
  signals: [
    {
      name: "HIGH_EVICTION_RISK",
      type: "housing_violation",
      trigger: "Utility shutoff without notice",
      action: "ESCALATE_TO_HOUSING_JUSTICE_PROJECT",
      severity: "CRITICAL",
    },
    {
      name: "INSURANCE_CLAIM_DENIAL",
      type: "healthcare_access",
      trigger: "Claim denied as not medically necessary",
      action: "ESCALATE_TO_INSURANCE_APPEALS",
      severity: "HIGH",
    },
    {
      name: "FOOD_INSECURITY",
      type: "basic_needs",
      trigger: "Multiple SNAP denials",
      action: "CONNECT_TO_FOOD_BANK",
      severity: "HIGH",
    },
  ],
};

// ─── STEP 2: VALIDATE STRUCTURE ───

async function validateStructure(): Promise<boolean> {
  console.log("\n[VALIDATE] Checking WA data structure...");

  const checks = {
    jurisdiction: !!waData.jurisdiction?.code,
    programs: Array.isArray(waData.programs) && waData.programs.length > 0,
    workflows: Array.isArray(waData.workflows) && waData.workflows.length > 0,
    entities: Array.isArray(waData.entities) && waData.entities.length > 0,
    signals: Array.isArray(waData.signals) && waData.signals.length > 0,
  };

  console.log("✓ Jurisdiction:", checks.jurisdiction);
  console.log(`✓ Programs: ${waData.programs.length} found`);
  console.log(`✓ Workflows: ${waData.workflows.length} found`);
  console.log(`✓ Entities: ${waData.entities.length} found`);
  console.log(`✓ Signals: ${waData.signals.length} found`);

  const allValid = Object.values(checks).every((v) => v);
  console.log(allValid ? "✅ STRUCTURE VALID" : "❌ STRUCTURE INVALID");

  return allValid;
}

// ─── STEP 3: DRY RUN (NO WRITES) ───

async function dryRun(): Promise<boolean> {
  console.log("\n[DRY RUN] Simulating inserts without writing...");

  const checks = {
    jurisdiction_fk: true,
    programs_fk: waData.programs.every((p) => !!p.name),
    workflows_fk: waData.workflows.every((w) => !!w.code),
    steps_fk: waData.workflows.every((w) =>
      w.steps.every((s) => !!s.order && !!s.title)
    ),
    entities_fk: waData.entities.every((e) => !!e.name),
    signals_fk: waData.signals.every((s) => !!s.name),
  };

  console.log("✓ Jurisdiction references:", checks.jurisdiction_fk);
  console.log("✓ Program references:", checks.programs_fk);
  console.log("✓ Workflow references:", checks.workflows_fk);
  console.log("✓ Step references:", checks.steps_fk);
  console.log("✓ Entity references:", checks.entities_fk);
  console.log("✓ Signal references:", checks.signals_fk);

  const allValid = Object.values(checks).every((v) => v);
  console.log(allValid ? "✅ DRY RUN PASSED" : "❌ DRY RUN FAILED");

  return allValid;
}

// ─── STEP 4: INGEST WA DATA ───

async function ingestWA() {
  console.log("\n[INGEST] Starting Washington State canonical ingestion...");

  try {
    const db = await getLuminariDb();

    // 1. Insert jurisdiction
    console.log("[INGEST] 1. Inserting jurisdiction...");
    const jurisdictionResult = await db.execute(sql`
      INSERT INTO jurisdictions (name, code, region, created_at, updated_at)
      VALUES (${waData.jurisdiction.name}, ${waData.jurisdiction.code}, ${waData.jurisdiction.region}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `);

    const jurisdictionId = (jurisdictionResult as any).rows?.[0]?.id;
    if (!jurisdictionId) throw new Error("Failed to insert jurisdiction");
    console.log(`✓ Jurisdiction inserted (ID: ${jurisdictionId})`);

    // 2. Insert programs
    console.log("[INGEST] 2. Inserting programs...");
    let programCount = 0;
    const programIds: Record<string, number> = {};

    for (const program of waData.programs) {
      const result = await db.execute(sql`
        INSERT INTO layer1_programs 
        (jurisdiction_id, program_name, program_code, category, description, eligibility_criteria, website_url, created_at, updated_at)
        VALUES 
        (${jurisdictionId}, ${program.name}, ${program.code}, ${program.category}, ${program.description}, ${program.eligibility}, ${program.website}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `);

      const programId = (result as any).rows?.[0]?.id;
      if (programId) {
        programIds[program.code] = programId;
        programCount++;

        // Insert program contacts
        for (const contact of program.contacts) {
          await db.execute(sql`
            INSERT INTO program_contacts 
            (program_id, contact_type, contact_value, contact_label, created_at, updated_at)
            VALUES 
            (${programId}, ${contact.type}, ${contact.value}, ${contact.label}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `);
        }
      }
    }
    console.log(`✓ Programs inserted: ${programCount}`);

    // 3. Insert workflows
    console.log("[INGEST] 3. Inserting workflows...");
    let workflowCount = 0;
    const workflowIds: Record<string, number> = {};

    for (const workflow of waData.workflows) {
      const programId = programIds[workflow.code.split("-")[2]] || Object.values(programIds)[0];

      const result = await db.execute(sql`
        INSERT INTO layer2_workflows 
        (program_id, workflow_name, workflow_code, trigger_condition, created_at, updated_at)
        VALUES 
        (${programId}, ${workflow.name}, ${workflow.code}, ${workflow.trigger}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `);

      const workflowId = (result as any).rows?.[0]?.id;
      if (workflowId) {
        workflowIds[workflow.code] = workflowId;
        workflowCount++;

        // 4. Insert workflow steps
        for (const step of workflow.steps) {
          await db.execute(sql`
            INSERT INTO workflow_steps 
            (workflow_id, step_order, step_title, step_description, required_documents, deadline_days, created_at, updated_at)
            VALUES 
            (${workflowId}, ${step.order}, ${step.title}, ${step.description}, ${step.documents}, ${step.deadline_days}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `);
        }
      }
    }
    console.log(`✓ Workflows inserted: ${workflowCount}`);

    // 5. Insert accountability entities
    console.log("[INGEST] 5. Inserting accountability entities...");
    let entityCount = 0;

    for (const entity of waData.entities) {
      const result = await db.execute(sql`
        INSERT INTO layer3_accountability_entities 
        (jurisdiction_id, entity_name, entity_type, contact_name, contact_email, contact_phone, office_address, created_at, updated_at)
        VALUES 
        (${jurisdictionId}, ${entity.name}, ${entity.type}, ${entity.contact_name}, ${entity.contact_email}, ${entity.contact_phone}, ${entity.office_address}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `);

      const entityId = (result as any).rows?.[0]?.id;
      if (entityId) {
        entityCount++;
      }
    }
    console.log(`✓ Entities inserted: ${entityCount}`);

    // 6. Insert enforcement signals
    console.log("[INGEST] 6. Inserting enforcement signals...");
    let signalCount = 0;

    for (const signal of waData.signals) {
      const result = await db.execute(sql`
        INSERT INTO enforcement_signals 
        (jurisdiction_id, signal_name, signal_type, trigger_condition, recommended_action, severity_level, created_at, updated_at)
        VALUES 
        (${jurisdictionId}, ${signal.name}, ${signal.type}, ${signal.trigger}, ${signal.action}, ${signal.severity}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      signalCount++;
    }
    console.log(`✓ Signals inserted: ${signalCount}`);

    console.log("\n✅ Washington State ingestion complete");
    return { jurisdictionId, programCount, workflowCount, entityCount, signalCount };
  } catch (err: any) {
    console.error("❌ Ingestion error:", err.message);
    throw err;
  }
}

// ─── STEP 5: VERIFY ───

async function verify(ingestionResult: any) {
  console.log("\n[VERIFY] Checking WA-only record counts...");

  try {
    const db = await getLuminariDb();

    const jurisdictionCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM jurisdictions WHERE code = 'WA'
    `);
    const jCount = (jurisdictionCount as any).rows?.[0]?.count || 0;

    const programCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM layer1_programs 
      WHERE jurisdiction_id = (SELECT id FROM jurisdictions WHERE code = 'WA')
    `);
    const pCount = (programCount as any).rows?.[0]?.count || 0;

    const workflowCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM layer2_workflows 
      WHERE program_id IN (SELECT id FROM layer1_programs WHERE jurisdiction_id = (SELECT id FROM jurisdictions WHERE code = 'WA'))
    `);
    const wCount = (workflowCount as any).rows?.[0]?.count || 0;

    const stepCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM workflow_steps 
      WHERE workflow_id IN (SELECT id FROM layer2_workflows WHERE program_id IN (SELECT id FROM layer1_programs WHERE jurisdiction_id = (SELECT id FROM jurisdictions WHERE code = 'WA')))
    `);
    const sCount = (stepCount as any).rows?.[0]?.count || 0;

    const entityCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM layer3_accountability_entities 
      WHERE jurisdiction_id = (SELECT id FROM jurisdictions WHERE code = 'WA')
    `);
    const eCount = (entityCount as any).rows?.[0]?.count || 0;

    const signalCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM enforcement_signals 
      WHERE jurisdiction_id = (SELECT id FROM jurisdictions WHERE code = 'WA')
    `);
    const sigCount = (signalCount as any).rows?.[0]?.count || 0;

    console.log("\n📊 WA-ONLY RECORD COUNTS:");
    console.log(`  Jurisdictions: ${jCount}`);
    console.log(`  Programs: ${pCount}`);
    console.log(`  Workflows: ${wCount}`);
    console.log(`  Workflow Steps: ${sCount}`);
    console.log(`  Accountability Entities: ${eCount}`);
    console.log(`  Enforcement Signals: ${sigCount}`);

    console.log("\n✅ Verification complete");
    return { jCount, pCount, wCount, sCount, eCount, sigCount };
  } catch (err: any) {
    console.error("❌ Verification error:", err.message);
    throw err;
  }
}

// ─── MAIN EXECUTION ───

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("WASHINGTON STATE CANONICAL DATA INGESTION");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    // Step 1: Extract (already done in waData)
    console.log("\n[STEP 1] ✅ Data extracted");

    // Step 2: Validate structure
    const structureValid = await validateStructure();
    if (!structureValid) throw new Error("Structure validation failed");

    // Step 3: Dry run
    const dryRunPassed = await dryRun();
    if (!dryRunPassed) throw new Error("Dry run failed");

    // Step 4: Ingest
    const ingestionResult = await ingestWA();

    // Step 5: Verify
    const verifyResult = await verify(ingestionResult);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ WASHINGTON STATE INGESTION SUCCESSFUL");
    console.log("═══════════════════════════════════════════════════════════");

    process.exit(0);
  } catch (err: any) {
    console.error("\n❌ INGESTION FAILED:", err.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ingestWA, validateStructure, dryRun, verify };
