/**
 * LUMINARI REGISTRY - PHASE 2: ACTUAL VOCABULARY SEEDING
 * 
 * This script ACTUALLY INSERTS controlled vocabulary values into the database.
 * Unlike the reference script, this one executes real INSERT statements.
 */

import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function seedVocabularies() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("LUMINARI REGISTRY - PHASE 2: ACTUAL VOCABULARY SEEDING");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const db = await getLuminariDb();

    // =========================================================================
    // DOMAINS
    // =========================================================================
    console.log("[SEED] Inserting domains...");
    const domains = [
      ["Family Law", "Divorce, custody, child support, adoption, guardianship"],
      ["Housing", "Eviction, housing discrimination, landlord-tenant disputes, homelessness"],
      ["Employment", "Wrongful termination, discrimination, wage disputes, workplace safety"],
      ["Benefits", "Social Security, unemployment, SNAP, Medicaid, veterans benefits"],
      ["Education", "Special education, school discipline, IEP disputes, access"],
      ["Healthcare", "Medical malpractice, insurance denial, patient rights"],
      ["Immigration", "Asylum, deportation, visa issues, family separation, DACA"],
      ["Criminal Defense", "Criminal charges, sentencing, appeals, post-conviction relief"],
      ["Disability Rights", "ADA accommodations, discrimination, accessibility, benefits"],
      ["Consumer Protection", "Fraud, predatory lending, debt collection, product liability"],
      ["Elder Law", "Nursing home abuse, guardianship, elder fraud, estate"],
      ["Juvenile Justice", "Delinquency, dependency, status offenses, detention"],
    ];

    for (const [name, desc] of domains) {
      await db.execute(sql`
        INSERT INTO domains (name, description)
        VALUES (${name}, ${desc})
        ON CONFLICT (name) DO NOTHING
      `);
      console.log(`  ✓ ${name}`);
    }

    // =========================================================================
    // ENTITY TYPES
    // =========================================================================
    console.log("[SEED] Inserting entity types...");
    const entityTypes = [
      "individual",
      "government_agency",
      "nonprofit_organization",
      "for_profit_business",
      "educational_institution",
      "healthcare_provider",
      "law_firm",
      "court",
      "board_commission",
      "department",
      "office",
      "facility",
    ];

    for (const type of entityTypes) {
      await db.execute(sql`
        INSERT INTO entity_types (name)
        VALUES (${type})
        ON CONFLICT (name) DO NOTHING
      `);
      console.log(`  ✓ ${type}`);
    }

    // =========================================================================
    // LENSES
    // =========================================================================
    console.log("[SEED] Inserting lenses...");
    const lenses = [
      ["Procedural", "Process, deadlines, filing requirements, jurisdiction"],
      ["Substantive", "Legal rights, obligations, remedies, standards"],
      ["Evidentiary", "Burden of proof, evidence rules, witness credibility"],
      ["Remedial", "Available remedies, damages, injunctive relief, restitution"],
      ["Appellate", "Appeal standards, preservation of error, scope of review"],
      ["Equitable", "Fairness, equity, discretion, judicial discretion"],
      ["Statutory", "Statute interpretation, legislative intent, plain language"],
      ["Constitutional", "Constitutional rights, due process, equal protection, fundamental rights"],
    ];

    for (const [name, desc] of lenses) {
      await db.execute(sql`
        INSERT INTO lenses (name, description)
        VALUES (${name}, ${desc})
        ON CONFLICT (name) DO NOTHING
      `);
      console.log(`  ✓ ${name}`);
    }

    // =========================================================================
    // CATEGORIES (per domain)
    // =========================================================================
    console.log("[SEED] Inserting categories...");

    // Get domain IDs
    const domainRows = await db.execute(
      sql`SELECT id, name FROM domains ORDER BY name`
    );
    const domainMap: { [key: string]: number } = {};
    if (Array.isArray(domainRows)) {
      for (const row of domainRows) {
        domainMap[(row as any).name] = (row as any).id;
      }
    }

    const categories = [
      ["Family Law", "Initial Filing", "First filing in family law matter"],
      ["Family Law", "Modification", "Modification of existing order"],
      ["Housing", "Filing Complaint", "Initial complaint filing"],
      ["Housing", "Escalation", "Escalation to higher authority"],
      ["Employment", "Wage Claim", "Wage and hour claims"],
      ["Employment", "Discrimination", "Employment discrimination"],
      ["Benefits", "Application", "Benefits application"],
      ["Benefits", "Appeal", "Benefits appeal"],
      ["Education", "IEP Request", "IEP meeting request"],
      ["Education", "Due Process", "Due process hearing"],
      ["Healthcare", "Complaint", "Healthcare provider complaint"],
      ["Healthcare", "Insurance Appeal", "Insurance denial appeal"],
      ["Immigration", "Application", "Immigration application"],
      ["Immigration", "Appeal", "Immigration appeal"],
      ["Criminal Defense", "Arraignment", "Initial court appearance"],
      ["Criminal Defense", "Sentencing", "Sentencing hearing"],
      ["Disability Rights", "Accommodation Request", "ADA accommodation request"],
      ["Disability Rights", "Complaint", "Disability discrimination complaint"],
      ["Consumer Protection", "Fraud Report", "Fraud reporting"],
      ["Consumer Protection", "Chargeback", "Credit card chargeback"],
      ["Elder Law", "Guardianship", "Guardianship proceedings"],
      ["Elder Law", "Abuse Report", "Elder abuse reporting"],
      ["Juvenile Justice", "Detention", "Detention hearing"],
      ["Juvenile Justice", "Delinquency", "Delinquency proceedings"],
    ];

    for (const [domainName, catName, desc] of categories) {
      const domainId = domainMap[domainName];
      if (domainId) {
        await db.execute(sql`
          INSERT INTO categories (domain_id, name, description)
          VALUES (${domainId}, ${catName}, ${desc})
          ON CONFLICT DO NOTHING
        `);
        console.log(`  ✓ ${domainName} > ${catName}`);
      }
    }

    // =========================================================================
    // WORKFLOW ACTION TYPES (stored as action_type values in workflow_steps)
    // =========================================================================
    console.log("[SEED] Documenting workflow action types (reference)...");
    const actionTypes = [
      "file_petition",
      "file_appeal",
      "file_complaint",
      "file_report",
      "submit_application",
      "attend_hearing",
      "attend_meeting",
      "provide_testimony",
      "submit_evidence",
      "respond_to_notice",
      "pay_fee",
      "obtain_document",
      "obtain_certification",
      "notify_party",
      "serve_notice",
      "request_extension",
      "request_accommodation",
      "request_waiver",
      "amend_filing",
      "withdraw_filing",
    ];

    for (const action of actionTypes) {
      console.log(`  ✓ ${action}`);
    }

    // =========================================================================
    // OVERSIGHT BODY AUTHORITY TYPES (stored as authority_type values)
    // =========================================================================
    console.log("[SEED] Documenting oversight body authority types (reference)...");
    const authorityTypes = [
      "legislative",
      "executive",
      "judicial",
      "administrative",
      "regulatory",
      "ombudsman",
      "inspector_general",
      "attorney_general",
      "bar_association",
      "licensing_board",
      "civil_rights_commission",
      "consumer_protection",
      "labor_department",
      "health_department",
      "education_department",
      "social_services",
      "housing_authority",
      "police_oversight",
      "corrections_oversight",
      "ethics_board",
    ];

    for (const type of authorityTypes) {
      console.log(`  ✓ ${type}`);
    }

    // =========================================================================
    // ACCOUNTABILITY FILING METHODS
    // =========================================================================
    console.log("[SEED] Documenting accountability filing methods (reference)...");
    const filingMethods = [
      "in_person",
      "mail",
      "email",
      "phone",
      "online_portal",
      "fax",
      "certified_mail",
      "hand_delivery",
      "attorney_filing",
      "representative_filing",
    ];

    for (const method of filingMethods) {
      console.log(`  ✓ ${method}`);
    }

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    console.log("\n[VERIFY] Checking seeded data...");

    const domainCount = await db.execute(sql`SELECT COUNT(*) as count FROM domains`);
    const entityTypeCount = await db.execute(sql`SELECT COUNT(*) as count FROM entity_types`);
    const lensCount = await db.execute(sql`SELECT COUNT(*) as count FROM lenses`);
    const categoryCount = await db.execute(sql`SELECT COUNT(*) as count FROM categories`);

    console.log(`   Domains: ${(domainCount as any)[0]?.count}`);
    console.log(`   Entity Types: ${(entityTypeCount as any)[0]?.count}`);
    console.log(`   Lenses: ${(lensCount as any)[0]?.count}`);
    console.log(`   Categories: ${(categoryCount as any)[0]?.count}`);

    console.log("\n✅ Vocabulary seeding complete");
    console.log("   Status: READY FOR WASHINGTON CANONICAL INGESTION");

    return {
      success: true,
      domains_seeded: (domainCount as any)[0]?.count,
      entity_types_seeded: (entityTypeCount as any)[0]?.count,
      lenses_seeded: (lensCount as any)[0]?.count,
      categories_seeded: (categoryCount as any)[0]?.count,
    };
  } catch (err: any) {
    console.error("❌ Error seeding vocabularies:", err.message);
    console.error("Stack:", err.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedVocabularies().then(() => {
    console.log("\n✅ Seeding complete. Exiting.");
    process.exit(0);
  });
}

export { seedVocabularies };
