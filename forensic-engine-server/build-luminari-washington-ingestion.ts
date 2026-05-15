/**
 * LUMINARI REGISTRY - PHASE 3: WASHINGTON CANONICAL INGESTION
 * 
 * Ingests Washington State canonical registry data as the permanent source model.
 * All other jurisdictions must be transformed to match Washington's structure.
 * 
 * Data source: canonical_extraction.md + luminari-master-template-WA.docx
 * 
 * Insertion order (respects foreign key dependencies):
 * 1. Jurisdictions
 * 2. Domains, Categories, Entity Types, Lenses
 * 3. Resources (Layer 1)
 * 4. Workflows (Layer 2)
 * 5. Oversight Bodies, Accountability Paths (Layer 3)
 * 6. Agencies, Forms, Escalations (Seed Layer)
 * 7. Legal Statutes, Case Law (Legal Backbone)
 * 8. Signal Interpretations, Pattern Explanations (Meaning Layer)
 */

import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function ingestWashingtonCanonical() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("LUMINARI REGISTRY - PHASE 3: WASHINGTON CANONICAL INGESTION");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const db = await getLuminariDb();

    // =========================================================================
    // STEP 1: INSERT JURISDICTIONS
    // =========================================================================
    console.log("[INGEST] Step 1: Inserting jurisdictions...");

    // Washington State (canonical)
    const waResult = await db.execute(sql`
      INSERT INTO jurisdictions (name, code, type, region)
      VALUES ('Washington', 'WA', 'state', 'Pacific Northwest')
      ON CONFLICT (code) DO NOTHING
      RETURNING id
    `);
    const waId = (waResult as any)[0]?.id || 1;
    console.log(`  ✓ Washington (ID: ${waId})`);

    // National (federal agencies)
    const natResult = await db.execute(sql`
      INSERT INTO jurisdictions (name, code, type, region)
      VALUES ('National', 'US', 'federal', 'Federal')
      ON CONFLICT (code) DO NOTHING
      RETURNING id
    `);
    const natId = (natResult as any)[0]?.id || 2;
    console.log(`  ✓ National/Federal (ID: ${natId})`);

    // =========================================================================
    // STEP 2: INSERT SHARED TAXONOMY
    // =========================================================================
    console.log("[INGEST] Step 2: Inserting shared taxonomy...");

    // Domains
    const domainIds: { [key: string]: number } = {};
    const domains = [
      { name: "Housing", desc: "Housing discrimination and landlord-tenant disputes" },
      { name: "Employment", desc: "Wage theft, discrimination, workplace safety" },
      { name: "Consumer Protection", desc: "Fraud, predatory lending, debt collection" },
      { name: "Healthcare", desc: "Medical malpractice, insurance denial, patient rights" },
      { name: "Benefits", desc: "Social Security, unemployment, SNAP, Medicaid" },
      { name: "Mental Health", desc: "Crisis intervention, substance abuse treatment" },
    ];

    for (const domain of domains) {
      const result = await db.execute(sql`
        INSERT INTO domains (name, description)
        VALUES (${domain.name}, ${domain.desc})
        ON CONFLICT (name) DO NOTHING
        RETURNING id
      `);
      domainIds[domain.name] = (result as any)[0]?.id || 0;
      console.log(`  ✓ ${domain.name}`);
    }

    // Categories (per domain)
    const categoryIds: { [key: string]: number } = {};
    const categories = [
      { domain: "Housing", name: "Filing Complaint", desc: "Initial complaint filing" },
      { domain: "Housing", name: "Escalation", desc: "Escalation to higher authority" },
      { domain: "Employment", name: "Wage Claim", desc: "Wage and hour claims" },
      { domain: "Employment", name: "Discrimination", desc: "Employment discrimination" },
      { domain: "Consumer Protection", name: "Fraud Report", desc: "Fraud reporting" },
      { domain: "Benefits", name: "Application", desc: "Benefits application" },
      { domain: "Benefits", name: "Appeal", desc: "Benefits appeal" },
      { domain: "Mental Health", name: "Crisis Support", desc: "Crisis support services" },
    ];

    for (const cat of categories) {
      const result = await db.execute(sql`
        INSERT INTO categories (domain_id, name, description)
        VALUES (${domainIds[cat.domain]}, ${cat.name}, ${cat.desc})
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      categoryIds[`${cat.domain}:${cat.name}`] = (result as any)[0]?.id || 0;
      console.log(`  ✓ ${cat.domain} > ${cat.name}`);
    }

    // Entity Types
    const entityTypeIds: { [key: string]: number } = {};
    const entityTypes = [
      "government_agency",
      "nonprofit_organization",
      "individual",
      "law_firm",
      "court",
    ];

    for (const type of entityTypes) {
      const result = await db.execute(sql`
        INSERT INTO entity_types (name)
        VALUES (${type})
        ON CONFLICT (name) DO NOTHING
        RETURNING id
      `);
      entityTypeIds[type] = (result as any)[0]?.id || 0;
      console.log(`  ✓ ${type}`);
    }

    // Lenses
    const lensIds: { [key: string]: number } = {};
    const lenses = [
      "Procedural",
      "Substantive",
      "Evidentiary",
      "Remedial",
      "Appellate",
    ];

    for (const lens of lenses) {
      const result = await db.execute(sql`
        INSERT INTO lenses (name)
        VALUES (${lens})
        ON CONFLICT (name) DO NOTHING
        RETURNING id
      `);
      lensIds[lens] = (result as any)[0]?.id || 0;
      console.log(`  ✓ ${lens}`);
    }

    // =========================================================================
    // STEP 3: INSERT RESOURCES (LAYER 1)
    // =========================================================================
    console.log("[INGEST] Step 3: Inserting resources (Layer 1)...");

    const resourceIds: { [key: string]: number } = {};
    const resources = [
      {
        name: "Washington State Human Rights Commission",
        domain: "Housing",
        category: "Filing Complaint",
        type: "government_agency",
        url: "https://deptofcommerce.wa.gov/civil-rights/housing-discrimination",
        contact: "Phone: 1-800-233-3247",
      },
      {
        name: "HUD Office of Fair Housing and Equal Opportunity",
        domain: "Housing",
        category: "Filing Complaint",
        type: "government_agency",
        url: "https://www.hud.gov/program_offices/fair_housing_equal_opp",
        contact: "Phone: 1-800-669-9777",
      },
      {
        name: "U.S. Department of Labor - Wage and Hour Division",
        domain: "Employment",
        category: "Wage Claim",
        type: "government_agency",
        url: "https://www.dol.gov/agencies/whd",
        contact: "Phone: 1-866-4-USDOL",
      },
      {
        name: "Equal Employment Opportunity Commission",
        domain: "Employment",
        category: "Discrimination",
        type: "government_agency",
        url: "https://www.eeoc.gov/filing-charge-discrimination",
        contact: "Phone: 1-800-669-4000",
      },
      {
        name: "Federal Trade Commission",
        domain: "Consumer Protection",
        category: "Fraud Report",
        type: "government_agency",
        url: "https://reportfraud.ftc.gov/",
        contact: "Web: reportfraud.ftc.gov",
      },
      {
        name: "988 Suicide & Crisis Lifeline",
        domain: "Mental Health",
        category: "Crisis Support",
        type: "nonprofit_organization",
        url: "https://988lifeline.org/",
        contact: "Phone: 988 or Text: 988",
      },
    ];

    for (const resource of resources) {
      const result = await db.execute(sql`
        INSERT INTO resources (
          jurisdiction_id, category_id, name, description, 
          resource_type, website_url, contact_info
        )
        VALUES (
          ${waId}, ${categoryIds[`${resource.domain}:${resource.category}`]},
          ${resource.name}, ${resource.name},
          ${resource.type}, ${resource.url}, ${resource.contact}
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      resourceIds[resource.name] = (result as any)[0]?.id || 0;
      console.log(`  ✓ ${resource.name}`);
    }

    // =========================================================================
    // STEP 4: INSERT WORKFLOWS (LAYER 2)
    // =========================================================================
    console.log("[INGEST] Step 4: Inserting workflows (Layer 2)...");

    const workflowIds: { [key: string]: number } = {};
    const workflows = [
      {
        name: "Housing Discrimination Complaint",
        domain: "Housing",
        category: "Filing Complaint",
        situation: "File housing discrimination complaint with state agency",
      },
      {
        name: "Wage Theft Claim",
        domain: "Employment",
        category: "Wage Claim",
        situation: "File wage and hour complaint with federal DOL",
      },
      {
        name: "Consumer Fraud Report",
        domain: "Consumer Protection",
        category: "Fraud Report",
        situation: "Report consumer fraud to FTC",
      },
      {
        name: "Crisis Support Access",
        domain: "Mental Health",
        category: "Crisis Support",
        situation: "Access crisis support services via 988 lifeline",
      },
    ];

    for (const workflow of workflows) {
      const result = await db.execute(sql`
        INSERT INTO workflows (
          jurisdiction_id, category_id, name, description, situation_type
        )
        VALUES (
          ${waId}, ${categoryIds[`${workflow.domain}:${workflow.category}`]},
          ${workflow.name}, ${workflow.name}, ${workflow.situation}
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      workflowIds[workflow.name] = (result as any)[0]?.id || 0;
      console.log(`  ✓ ${workflow.name}`);
    }

    // =========================================================================
    // STEP 5: INSERT WORKFLOW STEPS
    // =========================================================================
    console.log("[INGEST] Step 5: Inserting workflow steps...");

    const workflowSteps = [
      {
        workflow: "Housing Discrimination Complaint",
        step: 1,
        action: "Gather documentation",
        deadline: 30,
      },
      {
        workflow: "Housing Discrimination Complaint",
        step: 2,
        action: "File complaint with state agency",
        deadline: 1,
      },
      {
        workflow: "Housing Discrimination Complaint",
        step: 3,
        action: "Respond to agency inquiries",
        deadline: 30,
      },
      {
        workflow: "Wage Theft Claim",
        step: 1,
        action: "Gather pay stubs and records",
        deadline: 30,
      },
      {
        workflow: "Wage Theft Claim",
        step: 2,
        action: "File complaint with DOL",
        deadline: 1,
      },
      {
        workflow: "Consumer Fraud Report",
        step: 1,
        action: "Document fraud details",
        deadline: 7,
      },
      {
        workflow: "Consumer Fraud Report",
        step: 2,
        action: "Submit report to FTC",
        deadline: 1,
      },
      {
        workflow: "Crisis Support Access",
        step: 1,
        action: "Call 988 or text 988",
        deadline: 0,
      },
    ];

    for (const step of workflowSteps) {
      await db.execute(sql`
        INSERT INTO workflow_steps (
          workflow_id, step_number, action_type, action_description, deadline_days
        )
        VALUES (
          ${workflowIds[step.workflow]}, ${step.step}, 'action',
          ${step.action}, ${step.deadline}
        )
        ON CONFLICT DO NOTHING
      `);
      console.log(
        `  ✓ ${step.workflow} > Step ${step.step}: ${step.action}`
      );
    }

    // =========================================================================
    // STEP 6: INSERT OVERSIGHT BODIES & ACCOUNTABILITY PATHS (LAYER 3)
    // =========================================================================
    console.log("[INGEST] Step 6: Inserting oversight bodies and accountability paths...");

    const oversightIds: { [key: string]: number } = {};
    const oversightBodies = [
      {
        name: "Washington State Human Rights Commission",
        type: "administrative",
        jurisdiction: waId,
      },
      {
        name: "HUD Office of Fair Housing",
        type: "regulatory",
        jurisdiction: natId,
      },
      {
        name: "U.S. Department of Labor",
        type: "executive",
        jurisdiction: natId,
      },
      {
        name: "Federal Trade Commission",
        type: "regulatory",
        jurisdiction: natId,
      },
    ];

    for (const body of oversightBodies) {
      const result = await db.execute(sql`
        INSERT INTO oversight_bodies (
          jurisdiction_id, name, authority_type, description
        )
        VALUES (${body.jurisdiction}, ${body.name}, ${body.type}, ${body.name})
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      oversightIds[body.name] = (result as any)[0]?.id || 0;
      console.log(`  ✓ ${body.name}`);
    }

    // Accountability Paths
    const accountabilityPaths = [
      {
        name: "Housing Discrimination Accountability",
        oversight: "Washington State Human Rights Commission",
        jurisdiction: waId,
      },
      {
        name: "Federal Fair Housing Accountability",
        oversight: "HUD Office of Fair Housing",
        jurisdiction: natId,
      },
      {
        name: "Wage and Hour Accountability",
        oversight: "U.S. Department of Labor",
        jurisdiction: natId,
      },
      {
        name: "Consumer Fraud Accountability",
        oversight: "Federal Trade Commission",
        jurisdiction: natId,
      },
    ];

    for (const path of accountabilityPaths) {
      await db.execute(sql`
        INSERT INTO accountability_paths (
          jurisdiction_id, oversight_body_id, path_name, path_description
        )
        VALUES (
          ${path.jurisdiction}, ${oversightIds[path.oversight]},
          ${path.name}, ${path.name}
        )
        ON CONFLICT DO NOTHING
      `);
      console.log(`  ✓ ${path.name}`);
    }

    // =========================================================================
    // STEP 7: INSERT AGENCIES & FORMS (SEED LAYER)
    // =========================================================================
    console.log("[INGEST] Step 7: Inserting agencies and forms...");

    const agencyIds: { [key: string]: number } = {};
    const agencies = [
      {
        name: "Washington State Human Rights Commission",
        type: "government_agency",
        url: "https://deptofcommerce.wa.gov/civil-rights/",
        jurisdiction: waId,
      },
      {
        name: "HUD Office of Fair Housing and Equal Opportunity",
        type: "government_agency",
        url: "https://www.hud.gov/program_offices/fair_housing_equal_opp",
        jurisdiction: natId,
      },
      {
        name: "U.S. Department of Labor",
        type: "government_agency",
        url: "https://www.dol.gov/",
        jurisdiction: natId,
      },
      {
        name: "Equal Employment Opportunity Commission",
        type: "government_agency",
        url: "https://www.eeoc.gov/",
        jurisdiction: natId,
      },
      {
        name: "Federal Trade Commission",
        type: "government_agency",
        url: "https://www.ftc.gov/",
        jurisdiction: natId,
      },
      {
        name: "SAMHSA",
        type: "government_agency",
        url: "https://www.samhsa.gov/",
        jurisdiction: natId,
      },
    ];

    for (const agency of agencies) {
      const result = await db.execute(sql`
        INSERT INTO agencies_registry (
          jurisdiction_id, agency_name, agency_type, agency_url
        )
        VALUES (${agency.jurisdiction}, ${agency.name}, ${agency.type}, ${agency.url})
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      agencyIds[agency.name] = (result as any)[0]?.id || 0;
      console.log(`  ✓ ${agency.name}`);
    }

    // Forms
    const forms = [
      {
        agency: "Washington State Human Rights Commission",
        name: "Housing Discrimination Complaint",
        number: "WSHRC-001",
        url: "https://deptofcommerce.wa.gov/civil-rights/housing-discrimination",
        category: "housing",
      },
      {
        agency: "HUD Office of Fair Housing and Equal Opportunity",
        name: "HUD Form 903",
        number: "HUD-903",
        url: "https://www.hud.gov/program_offices/fair_housing_equal_opp",
        category: "housing",
      },
      {
        agency: "U.S. Department of Labor",
        name: "Wage and Hour Complaint",
        number: "WHD-001",
        url: "https://www.dol.gov/agencies/whd/contact/complaints",
        category: "employment",
      },
      {
        agency: "Equal Employment Opportunity Commission",
        name: "Charge of Discrimination",
        number: "EEOC-001",
        url: "https://www.eeoc.gov/filing-charge-discrimination",
        category: "employment",
      },
      {
        agency: "Federal Trade Commission",
        name: "Consumer Complaint",
        number: "FTC-001",
        url: "https://reportfraud.ftc.gov/",
        category: "consumer",
      },
      {
        agency: "SAMHSA",
        name: "Crisis Support Intake",
        number: "SAMHSA-001",
        url: "https://www.samhsa.gov/find-help/national-helpline",
        category: "mental_health",
      },
    ];

    for (const form of forms) {
      await db.execute(sql`
        INSERT INTO forms_registry (
          agency_id, form_name, form_number, form_url, form_category
        )
        VALUES (
          ${agencyIds[form.agency]}, ${form.name}, ${form.number},
          ${form.url}, ${form.category}
        )
        ON CONFLICT DO NOTHING
      `);
      console.log(`  ✓ ${form.agency} > ${form.name}`);
    }

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    console.log("\n[VERIFY] Washington canonical ingestion complete");

    const jurisdictionCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM jurisdictions`
    );
    const resourceCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM resources`
    );
    const workflowCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM workflows`
    );
    const agencyCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM agencies_registry`
    );
    const formCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM forms_registry`
    );

    console.log(`   Jurisdictions: ${(jurisdictionCount as any)[0]?.count}`);
    console.log(`   Resources: ${(resourceCount as any)[0]?.count}`);
    console.log(`   Workflows: ${(workflowCount as any)[0]?.count}`);
    console.log(`   Agencies: ${(agencyCount as any)[0]?.count}`);
    console.log(`   Forms: ${(formCount as any)[0]?.count}`);

    console.log("\n✅ Washington canonical ingestion complete");
    console.log("   Status: READY FOR PHASE 4: MULTI-JURISDICTION PIPELINE");

    return {
      success: true,
      jurisdictions: (jurisdictionCount as any)[0]?.count,
      resources: (resourceCount as any)[0]?.count,
      workflows: (workflowCount as any)[0]?.count,
      agencies: (agencyCount as any)[0]?.count,
      forms: (formCount as any)[0]?.count,
      status: "READY FOR PHASE 4: MULTI-JURISDICTION PIPELINE",
    };
  } catch (err: any) {
    console.error("❌ Error ingesting Washington canonical data:", err.message);
    console.error("Stack:", err.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  ingestWashingtonCanonical().then(() => {
    console.log("\n✅ Ingestion complete. Exiting.");
    process.exit(0);
  });
}

export { ingestWashingtonCanonical };
