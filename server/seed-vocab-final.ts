import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function seed() {
  const db = await getLuminariDb();

  console.log("SEEDING VOCABULARIES...\n");

  // 1. Create jurisdictions first
  console.log("1. Creating jurisdictions...");
  await db.execute(sql`
    INSERT INTO jurisdictions (name, code, region)
    VALUES ('National', 'US', 'Federal')
    ON CONFLICT (code) DO NOTHING
  `);
  console.log("✓ Jurisdictions\n");

  // 2. Domains
  console.log("2. Seeding domains...");
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
  console.log(`✓ ${domains.length} domains\n`);

  // 3. Entity types
  console.log("3. Seeding entity types...");
  const entityTypes = [
    "individual", "government_agency", "nonprofit_organization", "for_profit_business",
    "educational_institution", "healthcare_provider", "law_firm", "court",
    "board_commission", "department", "office", "facility",
  ];
  for (const type of entityTypes) {
    await db.execute(sql`
      INSERT INTO entity_types (name)
      VALUES (${type})
      ON CONFLICT (name) DO NOTHING
    `);
  }
  console.log(`✓ ${entityTypes.length} entity types\n`);

  // 4. Lenses
  console.log("4. Seeding lenses...");
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
  console.log(`✓ ${lenses.length} lenses\n`);

  // 5. Categories
  console.log("5. Seeding categories...");
  const domainResult = await db.execute(sql`SELECT id, name FROM domains`);
  const domainMap: any = {};
  for (const row of (domainResult as any).rows) {
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
  for (const [domainName, catName, desc] of categories) {
    const domainId = domainMap[domainName];
    if (domainId) {
      await db.execute(sql`
        INSERT INTO categories (domain_id, name, description)
        VALUES (${domainId}, ${catName}, ${desc})
        ON CONFLICT DO NOTHING
      `);
    }
  }
  console.log(`✓ ${categories.length} categories\n`);

  // 6. Workflow steps with action_type
  console.log("6. Seeding workflow steps with action types...");
  const jurisdictionResult = await db.execute(sql`SELECT id FROM jurisdictions LIMIT 1`);
  const jurisdictionId = ((jurisdictionResult as any).rows[0] || {}).id || 1;
  const categoryResult = await db.execute(sql`SELECT id FROM categories LIMIT 1`);
  const categoryId = ((categoryResult as any).rows[0] || {}).id || 1;

  const wfResult = await db.execute(sql`
    INSERT INTO workflows (jurisdiction_id, category_id, name, description, situation_type)
    VALUES (${jurisdictionId}, ${categoryId}, 'Seed Workflow', 'Seed workflow', 'seed')
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  const workflowId = ((wfResult as any).rows[0] || {}).id || 1;

  const actionTypes = [
    "file_petition", "file_appeal", "file_complaint", "file_report", "submit_application",
    "attend_hearing", "attend_meeting", "provide_testimony", "submit_evidence", "respond_to_notice",
    "pay_fee", "obtain_document", "obtain_certification", "notify_party", "serve_notice",
    "request_extension", "request_accommodation", "request_waiver", "amend_filing", "withdraw_filing",
  ];
  for (let i = 0; i < actionTypes.length; i++) {
    await db.execute(sql`
      INSERT INTO workflow_steps (workflow_id, step_number, action_type, action_description, deadline_days)
      VALUES (${workflowId}, ${i + 1}, ${actionTypes[i]}, ${actionTypes[i]}, 30)
      ON CONFLICT DO NOTHING
    `);
  }
  console.log(`✓ ${actionTypes.length} workflow steps with action types\n`);

  // 7. Oversight bodies with authority_type
  console.log("7. Seeding oversight bodies with authority types...");
  const authorityTypes = [
    ["legislative", "Legislative body"], ["executive", "Executive branch"], ["judicial", "Judicial body"],
    ["administrative", "Administrative agency"], ["regulatory", "Regulatory agency"], ["ombudsman", "Ombudsman office"],
    ["inspector_general", "Inspector general"], ["attorney_general", "Attorney general"], ["bar_association", "Bar association"],
    ["licensing_board", "Licensing board"], ["civil_rights_commission", "Civil rights commission"], ["consumer_protection", "Consumer protection"],
    ["labor_department", "Labor department"], ["health_department", "Health department"], ["education_department", "Education department"],
    ["social_services", "Social services"], ["housing_authority", "Housing authority"], ["police_oversight", "Police oversight"],
    ["corrections_oversight", "Corrections oversight"], ["ethics_board", "Ethics board"],
  ];
  for (const [authorityType, name] of authorityTypes) {
    await db.execute(sql`
      INSERT INTO oversight_bodies (jurisdiction_id, name, authority_type, description)
      VALUES (${jurisdictionId}, ${name}, ${authorityType}, ${name})
      ON CONFLICT DO NOTHING
    `);
  }
  console.log(`✓ ${authorityTypes.length} oversight bodies with authority types\n`);

  // 8. Accountability filing methods
  console.log("8. Seeding accountability filing methods...");
  const pathResult = await db.execute(sql`SELECT id FROM accountability_paths LIMIT 1`);
  let accountabilityPathId = ((pathResult as any).rows[0] || {}).id;
  
  if (!accountabilityPathId) {
    const oversightResult = await db.execute(sql`SELECT id FROM oversight_bodies LIMIT 1`);
    const oversightId = ((oversightResult as any).rows[0] || {}).id || 1;
    const pathInsert = await db.execute(sql`
      INSERT INTO accountability_paths (jurisdiction_id, oversight_body_id, path_name, path_description)
      VALUES (${jurisdictionId}, ${oversightId}, 'Seed Path', 'Seed path')
      RETURNING id
    `);
    accountabilityPathId = ((pathInsert as any).rows[0] || {}).id || 1;
  }

  const filingMethods = [
    ["in_person", "In-person filing"], ["mail", "Mail filing"], ["email", "Email filing"],
    ["phone", "Phone filing"], ["online_portal", "Online portal"], ["fax", "Fax filing"],
    ["certified_mail", "Certified mail"], ["hand_delivery", "Hand delivery"], ["attorney_filing", "Attorney filing"],
    ["representative_filing", "Representative filing"],
  ];
  for (const [method, description] of filingMethods) {
    await db.execute(sql`
      INSERT INTO accountability_filing_methods (accountability_path_id, filing_method, filing_instructions)
      VALUES (${accountabilityPathId}, ${method}, ${description})
      ON CONFLICT DO NOTHING
    `);
  }
  console.log(`✓ ${filingMethods.length} accountability filing methods\n`);

  console.log("DONE\n");
}

seed().catch(console.error).finally(() => process.exit(0));
