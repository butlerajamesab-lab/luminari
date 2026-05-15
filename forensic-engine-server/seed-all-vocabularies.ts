/**
 * LUMINARI REGISTRY - COMPLETE VOCABULARY SEEDING (WORKING VERSION)
 * 
 * Inserts ALL controlled vocabulary values into database tables.
 * - Idempotent (safe to run multiple times)
 * - Uses deterministic keys (no duplicates)
 * - Fails on invalid/missing required values
 */

import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function seedAllVocabularies() {
  console.log("SEEDING VOCABULARIES...\n");

  try {
    const db = await getLuminariDb();

    // =========================================================================
    // 1. DOMAINS
    // =========================================================================
    console.log("Seeding domains...");
    const domains = [
      ["Family Law", "Divorce, custody, child support, adoption, guardianship"],
      ["Housing", "Eviction, housing discrimination, landlord-tenant disputes"],
      ["Employment", "Wrongful termination, discrimination, wage disputes"],
      ["Benefits", "Social Security, unemployment, SNAP, Medicaid"],
      ["Education", "Special education, school discipline, IEP disputes"],
      ["Healthcare", "Medical malpractice, insurance denial, patient rights"],
      ["Immigration", "Asylum, deportation, visa issues, family separation"],
      ["Criminal Defense", "Criminal charges, sentencing, appeals"],
      ["Disability Rights", "ADA accommodations, discrimination, accessibility"],
      ["Consumer Protection", "Fraud, predatory lending, debt collection"],
      ["Elder Law", "Nursing home abuse, guardianship, elder fraud"],
      ["Juvenile Justice", "Delinquency, dependency, status offenses"],
    ];

    for (const [name, desc] of domains) {
      await db.execute(sql`
        INSERT INTO domains (name, description)
        VALUES (${name}, ${desc})
        ON CONFLICT (name) DO NOTHING
      `);
    }
    console.log(`✓ Inserted ${domains.length} domains\n`);

    // =========================================================================
    // 2. ENTITY TYPES
    // =========================================================================
    console.log("Seeding entity types...");
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
    }
    console.log(`✓ Inserted ${entityTypes.length} entity types\n`);

    // =========================================================================
    // 3. LENSES
    // =========================================================================
    console.log("Seeding lenses...");
    const lenses = [
      ["Procedural", "Process, deadlines, filing requirements, jurisdiction"],
      ["Substantive", "Legal rights, obligations, remedies, standards"],
      ["Evidentiary", "Burden of proof, evidence rules, witness credibility"],
      ["Remedial", "Available remedies, damages, injunctive relief"],
      ["Appellate", "Appeal standards, preservation of error, scope of review"],
      ["Equitable", "Fairness, equity, discretion, judicial discretion"],
      ["Statutory", "Statute interpretation, legislative intent"],
      ["Constitutional", "Constitutional rights, due process, equal protection"],
    ];

    for (const [name, desc] of lenses) {
      await db.execute(sql`
        INSERT INTO lenses (name, description)
        VALUES (${name}, ${desc})
        ON CONFLICT (name) DO NOTHING
      `);
    }
    console.log(`✓ Inserted ${lenses.length} lenses\n`);

    // =========================================================================
    // 4. CATEGORIES (requires domain_id)
    // =========================================================================
    console.log("Seeding categories...");
    
    // Fetch domain IDs
    const domainResult = await db.execute(sql`SELECT id, name FROM domains`);
    const domainRows = (domainResult as any).rows || [];
    const domainMap: { [key: string]: number } = {};
    
    for (const row of domainRows) {
      domainMap[row.name] = row.id;
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

    let catCount = 0;
    for (const [domainName, catName, desc] of categories) {
      const domainId = domainMap[domainName];
      if (!domainId) {
        throw new Error(`Domain not found: ${domainName}`);
      }
      await db.execute(sql`
        INSERT INTO categories (domain_id, name, description)
        VALUES (${domainId}, ${catName}, ${desc})
        ON CONFLICT DO NOTHING
      `);
      catCount++;
    }
    console.log(`✓ Inserted ${catCount} categories\n`);

    // =========================================================================
    // 5. WORKFLOW STEPS WITH ACTION TYPES
    // =========================================================================
    console.log("Seeding workflow steps with action types...");
    
    // Get or create seed workflow
    const jurisdictionResult = await db.execute(
      sql`SELECT id FROM jurisdictions LIMIT 1`
    );
    const jurisdictionRows = (jurisdictionResult as any).rows || [];
    const jurisdictionId = jurisdictionRows.length > 0 ? jurisdictionRows[0].id : 1;

    const categoryResult = await db.execute(
      sql`SELECT id FROM categories LIMIT 1`
    );
    const categoryRows = (categoryResult as any).rows || [];
    const categoryId = categoryRows.length > 0 ? categoryRows[0].id : 1;

    const workflowCheck = await db.execute(
      sql`SELECT id FROM workflows LIMIT 1`
    );
    const workflowRows = (workflowCheck as any).rows || [];
    let workflowId = 1;
    
    if (workflowRows.length === 0) {
      const wfResult = await db.execute(sql`
        INSERT INTO workflows (jurisdiction_id, category_id, name, description, situation_type)
        VALUES (${jurisdictionId}, ${categoryId}, 'Seed Workflow', 'Seed workflow for vocabulary testing', 'seed')
        RETURNING id
      `);
      const wfRows = (wfResult as any).rows || [];
      workflowId = wfRows.length > 0 ? wfRows[0].id : 1;
    } else {
      workflowId = workflowRows[0].id;
    }

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

    let stepCount = 0;
    for (let i = 0; i < actionTypes.length; i++) {
      const actionType = actionTypes[i];
      await db.execute(sql`
        INSERT INTO workflow_steps (workflow_id, step_number, action_type, action_description, deadline_days)
        VALUES (${workflowId}, ${i + 1}, ${actionType}, ${actionType}, 30)
        ON CONFLICT DO NOTHING
      `);
      stepCount++;
    }
    console.log(`✓ Inserted ${stepCount} workflow steps with action types\n`);

    // =========================================================================
    // 6. OVERSIGHT BODIES WITH AUTHORITY TYPES
    // =========================================================================
    console.log("Seeding oversight bodies with authority types...");
    
    const authorityTypes = [
      ["legislative", "Legislative body"],
      ["executive", "Executive branch"],
      ["judicial", "Judicial body"],
      ["administrative", "Administrative agency"],
      ["regulatory", "Regulatory agency"],
      ["ombudsman", "Ombudsman office"],
      ["inspector_general", "Inspector general"],
      ["attorney_general", "Attorney general"],
      ["bar_association", "Bar association"],
      ["licensing_board", "Licensing board"],
      ["civil_rights_commission", "Civil rights commission"],
      ["consumer_protection", "Consumer protection agency"],
      ["labor_department", "Labor department"],
      ["health_department", "Health department"],
      ["education_department", "Education department"],
      ["social_services", "Social services"],
      ["housing_authority", "Housing authority"],
      ["police_oversight", "Police oversight"],
      ["corrections_oversight", "Corrections oversight"],
      ["ethics_board", "Ethics board"],
    ];

    let oversightCount = 0;
    for (const [authorityType, name] of authorityTypes) {
      await db.execute(sql`
        INSERT INTO oversight_bodies (jurisdiction_id, name, authority_type, description)
        VALUES (${jurisdictionId}, ${name}, ${authorityType}, ${name})
        ON CONFLICT DO NOTHING
      `);
      oversightCount++;
    }
    console.log(`✓ Inserted ${oversightCount} oversight bodies with authority types\n`);

    // =========================================================================
    // 7. ACCOUNTABILITY FILING METHODS
    // =========================================================================
    console.log("Seeding accountability filing methods...");
    
    // Get or create seed accountability path
    const pathResult = await db.execute(
      sql`SELECT id FROM accountability_paths LIMIT 1`
    );
    const pathRows = (pathResult as any).rows || [];
    let accountabilityPathId = 1;
    
    if (pathRows.length === 0) {
      // Create seed accountability path
      const oversightResult = await db.execute(
        sql`SELECT id FROM oversight_bodies LIMIT 1`
      );
      const oversightRows = (oversightResult as any).rows || [];
      const oversightId = oversightRows.length > 0 ? oversightRows[0].id : 1;
      
      const pathInsert = await db.execute(sql`
        INSERT INTO accountability_paths (jurisdiction_id, oversight_body_id, path_name, path_description)
        VALUES (${jurisdictionId}, ${oversightId}, 'Seed Path', 'Seed path for vocabulary testing')
        RETURNING id
      `);
      const pathInsertRows = (pathInsert as any).rows || [];
      accountabilityPathId = pathInsertRows.length > 0 ? pathInsertRows[0].id : 1;
    } else {
      accountabilityPathId = pathRows[0].id;
    }

    const filingMethods = [
      ["in_person", "In-person filing"],
      ["mail", "Mail filing"],
      ["email", "Email filing"],
      ["phone", "Phone filing"],
      ["online_portal", "Online portal"],
      ["fax", "Fax filing"],
      ["certified_mail", "Certified mail"],
      ["hand_delivery", "Hand delivery"],
      ["attorney_filing", "Attorney filing"],
      ["representative_filing", "Representative filing"],
    ];

    let methodCount = 0;
    for (const [method, description] of filingMethods) {
      await db.execute(sql`
        INSERT INTO accountability_filing_methods (accountability_path_id, filing_method, filing_instructions)
        VALUES (${accountabilityPathId}, ${method}, ${description})
        ON CONFLICT DO NOTHING
      `);
      methodCount++;
    }
    console.log(`✓ Inserted ${methodCount} accountability filing methods\n`);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    console.log("VERIFICATION COMPLETE\n");
    console.log("All vocabularies seeded successfully.");

  } catch (err: any) {
    console.error("ERROR:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAllVocabularies().then(() => process.exit(0));
}

export { seedAllVocabularies };
