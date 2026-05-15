/**
 * Unified Resource Normalization Pipeline
 * 
 * Pulls from:
 * 1. registry_programs (547 rows) → government_program / nonprofit / legal_aid
 * 2. registry_contacts (305 rows) → enriches phone numbers
 * 3. enforcement_action_paths (5 rows) → enforcement_path
 * 4. legal_enforcement_records (68 rows) → enforcement_record
 * 5. agency_authority_map (38 rows) → agency_authority
 */
import mysql from "mysql2/promise";

// Force connection to luminari_registry (the app's actual database)
const dbUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || '4000'),
  user: dbUrl.username,
  password: decodeURIComponent(dbUrl.password),
  database: 'luminari_registry',
  ssl: { rejectUnauthorized: true }
});
const now = Date.now();

// ─── Category → Domain + NeedTypes + Pipeline Mapping ───
const CATEGORY_MAP = {
  housing: {
    domain: "housing",
    needTypes: ["rent_assistance", "housing_search", "shelter", "utility_help"],
    resourceType: "government_program",
    urgency: "urgent",
    pipelines: [
      "tenant_rights", "housing_discrimination", "eviction_defense", "section8_disputes",
      "hoa_disputes", "landlord_harassment", "foreclosure_dispute", "property_rights",
      "mobile_home_park_dispute", "utility_shutoff_abuse", "code_enforcement_retaliation",
      "benefits_denial", "voucher_termination", "tribal_housing", "lgbtq_housing_discrimination",
      "short_term_rental_dispute"
    ],
    explanationTemplate: "Housing program in your jurisdiction — covers {needTypes}"
  },
  healthcare: {
    domain: "healthcare",
    needTypes: ["medical_coverage", "prescription_help", "mental_health", "dental"],
    resourceType: "government_program",
    urgency: "standard",
    pipelines: [
      "insurance_claim_denial", "health_insurance_denial", "medical_malpractice",
      "medicaid_denial", "medicare_denial", "hospital_billing_abuse", "medical_record_access",
      "disability_claim_denial", "prior_authorization_abuse", "surprise_billing",
      "pharmacy_benefit_manager_dispute", "medical_device_injury", "lgbtq_healthcare_denial"
    ],
    explanationTemplate: "Healthcare program in your jurisdiction — covers {needTypes}"
  },
  food_nutrition: {
    domain: "benefits",
    needTypes: ["food_assistance", "nutrition_program", "emergency_food"],
    resourceType: "government_program",
    urgency: "urgent",
    pipelines: [
      "snap_denial", "benefits_denial", "public_assistance_dispute",
      "benefits_overpayment_recoupment"
    ],
    explanationTemplate: "Food/nutrition assistance in your jurisdiction"
  },
  legal_aid: {
    domain: "legal",
    needTypes: ["legal_representation", "legal_advice", "court_help", "pro_se_support"],
    resourceType: "legal_aid",
    urgency: "standard",
    pipelines: [
      // Legal aid matches broadly — almost any pipeline type
      "police_misconduct", "prosecutorial_misconduct", "wrongful_conviction",
      "civil_rights_violation", "wrongful_arrest", "domestic_violence",
      "custody", "custody_dispute", "family_law", "child_welfare",
      "eviction_defense", "housing_discrimination", "wage_theft",
      "wrongful_termination", "debt_collection_abuse", "consumer_fraud",
      "immigration_case", "asylum_claim", "general_legal_question",
      "pro_se_assistance", "complaint_filing", "document_review",
      "legal_research", "records_request"
    ],
    explanationTemplate: "Legal aid organization in your jurisdiction — free/low-cost legal help"
  },
  unemployment: {
    domain: "employment",
    needTypes: ["unemployment_benefits", "job_search", "retraining", "career_services"],
    resourceType: "government_program",
    urgency: "urgent",
    pipelines: [
      "workplace_discrimination", "wrongful_termination", "workers_compensation",
      "wage_theft", "labor_violation", "workplace_harassment", "unemployment_benefits",
      "gig_worker_misclassification", "non_compete_dispute", "wage_garnishment_error",
      "workplace_surveillance", "lgbtq_workplace_harassment"
    ],
    explanationTemplate: "Employment/unemployment program in your jurisdiction"
  },
  utilities: {
    domain: "housing",
    needTypes: ["utility_assistance", "energy_assistance", "water_assistance"],
    resourceType: "government_program",
    urgency: "urgent",
    pipelines: [
      "utility_shutoff_abuse", "benefits_denial", "public_assistance_dispute"
    ],
    explanationTemplate: "Utility assistance program — help with energy/water bills"
  },
  cash_assistance: {
    domain: "benefits",
    needTypes: ["cash_aid", "emergency_funds", "tanf", "general_assistance"],
    resourceType: "government_program",
    urgency: "urgent",
    pipelines: [
      "benefits_denial", "public_assistance_dispute", "snap_denial",
      "benefits_overpayment_recoupment", "social_security_disability"
    ],
    explanationTemplate: "Cash assistance program in your jurisdiction — direct financial aid"
  },
  domestic_violence: {
    domain: "safety",
    needTypes: ["dv_shelter", "safety_planning", "protective_order", "crisis_support"],
    resourceType: "nonprofit",
    urgency: "crisis",
    pipelines: [
      "domestic_violence", "domestic_violence_emergency", "child_abuse",
      "child_endangerment", "emergency_safety", "immediate_threat",
      "human_trafficking", "family_separation_case", "custody",
      "elder_abuse", "vulnerable_adult_protection"
    ],
    explanationTemplate: "Domestic violence support — crisis services available"
  },
  disability_vocational: {
    domain: "disability",
    needTypes: ["disability_services", "vocational_rehab", "ada_accommodation", "assistive_tech"],
    resourceType: "government_program",
    urgency: "standard",
    pipelines: [
      "disability_rights", "disability_claim_denial", "ada_accommodation_dispute",
      "social_security_disability", "guardianship", "guardianship_abuse",
      "medicaid_ltc_eligibility"
    ],
    explanationTemplate: "Disability/vocational services in your jurisdiction"
  },
  mental_behavioral_health: {
    domain: "healthcare",
    needTypes: ["mental_health", "crisis_counseling", "substance_abuse", "behavioral_health"],
    resourceType: "nonprofit",
    urgency: "urgent",
    pipelines: [
      "involuntary_hold", "polypharmacy_harm", "discharge_failure",
      "family_exclusion", "restraint_seclusion", "record_correction",
      "medical_malpractice", "lgbtq_healthcare_denial"
    ],
    explanationTemplate: "Mental/behavioral health support in your jurisdiction"
  },
  childcare: {
    domain: "family",
    needTypes: ["childcare_assistance", "early_education", "after_school"],
    resourceType: "government_program",
    urgency: "standard",
    pipelines: [
      "child_welfare", "foster_care", "child_abuse", "child_support_modification",
      "parental_rights_termination", "kinship_placement_dispute",
      "supervised_visitation_dispute", "adoption_disruption"
    ],
    explanationTemplate: "Childcare assistance program in your jurisdiction"
  },
  senior_services: {
    domain: "elder",
    needTypes: ["senior_services", "elder_care", "meals_on_wheels", "transportation"],
    resourceType: "government_program",
    urgency: "standard",
    pipelines: [
      "elder_abuse", "eldercare", "nursing_home_abuse", "guardianship_abuse",
      "long_term_care_neglect", "elder_financial_exploitation",
      "vulnerable_adult_protection", "medicare_elder_fraud"
    ],
    explanationTemplate: "Senior services in your jurisdiction"
  },
  other: {
    domain: "general",
    needTypes: ["general_assistance", "navigation", "referral"],
    resourceType: "government_program",
    urgency: "standard",
    pipelines: [
      "general_investigation", "personal_case", "community_case", "other"
    ],
    explanationTemplate: "General assistance resource in your jurisdiction"
  }
};

// ─── Jurisdiction ID → State Code mapping ───
function extractStateCode(jurisdictionId) {
  if (!jurisdictionId) return null;
  const stateMap = {
    j_alabama: "AL", j_alaska: "AK", j_arizona: "AZ", j_arkansas: "AR",
    j_california: "CA", j_colorado: "CO", j_connecticut: "CT", j_delaware: "DE",
    j_florida: "FL", j_georgia: "GA", j_hawaii: "HI", j_idaho: "ID",
    j_illinois: "IL", j_indiana: "IN", j_iowa: "IA", j_kansas: "KS",
    j_kentucky: "KY", j_louisiana: "LA", j_maine: "ME", j_maryland: "MD",
    j_massachusetts: "MA", j_michigan: "MI", j_minnesota: "MN", j_mississippi: "MS",
    j_missouri: "MO", j_montana: "MT", j_nebraska: "NE", j_nevada: "NV",
    j_new_hampshire: "NH", j_new_jersey: "NJ", j_new_mexico: "NM", j_new_york: "NY",
    j_north_carolina: "NC", j_north_dakota: "ND", j_ohio: "OH", j_oklahoma: "OK",
    j_oregon: "OR", j_pennsylvania: "PA", j_rhode_island: "RI", j_south_carolina: "SC",
    j_south_dakota: "SD", j_tennessee: "TN", j_texas: "TX", j_utah: "UT",
    j_vermont: "VT", j_virginia: "VA", j_washington: "WA", j_west_virginia: "WV",
    j_wisconsin: "WI", j_wyoming: "WY", j_district_of_columbia: "DC",
    j_american_samoa: "AS", j_guam: "GU", j_northern_mariana_islands: "MP",
    j_puerto_rico: "PR", j_us_virgin_islands: "VI",
    j_federal: null
  };
  return stateMap[jurisdictionId] || null;
}

function buildHardEligibility(jurisdictionId, stateCode) {
  const gates = [];
  if (stateCode) {
    gates.push({
      gate: "jurisdiction",
      operator: "eq",
      value: stateCode,
      description: `Available in ${stateCode}`
    });
  }
  return gates.length > 0 ? gates : null;
}

function buildSoftSignals(category, domain) {
  const mapping = CATEGORY_MAP[category] || CATEGORY_MAP.other;
  return [
    {
      signal: "domain_match",
      weight: 0.4,
      matchValues: [mapping.domain],
      description: `Matches ${mapping.domain} domain`
    },
    {
      signal: "need_overlap",
      weight: 0.35,
      matchValues: mapping.needTypes,
      description: `Covers: ${mapping.needTypes.join(", ")}`
    },
    {
      signal: "program_type",
      weight: 0.25,
      matchValues: [mapping.resourceType],
      description: `Resource type: ${mapping.resourceType}`
    }
  ];
}

async function seedFromRegistryPrograms() {
  console.log("\n=== Seeding from registry_programs ===");
  const [programs] = await pool.query("SELECT * FROM registry_programs");
  
  // Get contacts for enrichment
  const [contacts] = await pool.query("SELECT * FROM registry_contacts");
  const contactMap = {};
  for (const c of contacts) {
    const key = c.source_id || c.entity_name;
    if (!contactMap[key]) contactMap[key] = [];
    contactMap[key].push(c);
  }
  
  let inserted = 0;
  for (const prog of programs) {
    const category = prog.category_rp || "other";
    const mapping = CATEGORY_MAP[category] || CATEGORY_MAP.other;
    const stateCode = extractStateCode(prog.jurisdiction_id_rp);
    
    // Find phone from contacts
    const progContacts = contactMap[prog.id] || [];
    const phone = progContacts.find(c => c.contact_type === "general" || c.contact_type === "phone")?.contact_value || prog.contact_rp;
    
    await pool.query(
      `INSERT INTO unified_resources (
        sourceTable, sourceId, name, description, resourceType,
        domain, needTypes, urgencyLevel,
        jurisdictionId, jurisdictionType, stateCode,
        phone, website, email, address,
        hardEligibility, softSignals, matchingPipelineTypes,
        lastVerifiedAt, isActive, matchExplanationTemplate,
        category, agency, eligibilityNotes, applyNotes,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "registry_programs", prog.id,
        prog.name_rp,
        prog.eligibility_rp ? `Eligibility: ${prog.eligibility_rp}` : null,
        mapping.resourceType,
        mapping.domain,
        JSON.stringify(mapping.needTypes),
        mapping.urgency,
        prog.jurisdiction_id_rp,
        stateCode ? "state" : "federal",
        stateCode,
        phone || null,
        prog.website_rp || null,
        null, // email
        null, // address
        JSON.stringify(buildHardEligibility(prog.jurisdiction_id_rp, stateCode)),
        JSON.stringify(buildSoftSignals(category, mapping.domain)),
        JSON.stringify(mapping.pipelines),
        prog.created_at_rp || now,
        true,
        mapping.explanationTemplate,
        category,
        prog.agency_rp || null,
        prog.eligibility_rp || null,
        prog.apply_notes_rp || null,
        now, now
      ]
    );
    inserted++;
  }
  console.log(`  Inserted ${inserted} programs`);
  return inserted;
}

async function seedFromEnforcementActionPaths() {
  console.log("\n=== Seeding from enforcement_action_paths ===");
  const [paths] = await pool.query("SELECT * FROM enforcement_action_paths WHERE isActive = true");
  
  let inserted = 0;
  for (const p of paths) {
    const stateCode = p.jurisdiction === "federal" ? null : p.jurisdiction;
    
    await pool.query(
      `INSERT INTO unified_resources (
        sourceTable, sourceId, name, description, resourceType,
        domain, needTypes, urgencyLevel,
        jurisdictionId, jurisdictionType, stateCode,
        phone, website, email, address,
        hardEligibility, softSignals, matchingPipelineTypes,
        lastVerifiedAt, isActive, matchExplanationTemplate,
        category, agency, eligibilityNotes, applyNotes,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "enforcement_action_paths", String(p.id),
        `FILE: ${p.claimLabel}`,
        p.formDescription || `Filing path: ${p.claimLabel} via ${p.agencyName}`,
        "enforcement_path",
        "housing", // all current paths are housing
        JSON.stringify(["filing_help", "complaint_filing", "legal_action", "appeal"]),
        "urgent",
        null,
        stateCode ? "state" : "federal",
        stateCode,
        p.agencyPhone || null,
        p.agencyWebsite || null,
        p.agencyEmail || null,
        p.agencyAddress || null,
        null, // enforcement paths are broadly available
        JSON.stringify([
          { signal: "domain_match", weight: 0.5, matchValues: ["housing"], description: "Housing enforcement path" },
          { signal: "action_readiness", weight: 0.5, matchValues: ["filing", "complaint", "appeal"], description: "Direct filing action" }
        ]),
        JSON.stringify([p.pipelineType]),
        p.lastVerifiedAt || now,
        true,
        `Direct filing path: ${p.claimLabel} — file with ${p.agencyAcronym || p.agencyName}`,
        "enforcement",
        p.agencyName,
        null,
        null,
        now, now
      ]
    );
    inserted++;
  }
  console.log(`  Inserted ${inserted} enforcement paths`);
  return inserted;
}

async function seedFromLegalEnforcementRecords() {
  console.log("\n=== Seeding from legal_enforcement_records ===");
  const [records] = await pool.query("SELECT * FROM legal_enforcement_records");
  
  let inserted = 0;
  for (const r of records) {
    const domains = r.domains || ["employment"];
    const primaryDomain = Array.isArray(domains) ? domains[0] : "employment";
    const stateCode = r.jurisdiction && r.jurisdiction.length === 2 ? r.jurisdiction : null;
    
    // Map employment enforcement records to employment pipelines
    const pipelines = primaryDomain === "employment" 
      ? ["wage_theft", "wrongful_termination", "labor_violation", "workplace_discrimination", "workers_compensation", "workplace_harassment"]
      : ["general_investigation"];
    
    await pool.query(
      `INSERT INTO unified_resources (
        sourceTable, sourceId, name, description, resourceType,
        domain, needTypes, urgencyLevel,
        jurisdictionId, jurisdictionType, stateCode,
        phone, website, email, address,
        hardEligibility, softSignals, matchingPipelineTypes,
        lastVerifiedAt, isActive, matchExplanationTemplate,
        category, agency, eligibilityNotes, applyNotes,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "legal_enforcement_records", String(r.id),
        r.agencyName,
        r.patternDescription || `Enforcement: ${r.complaintType} — ${r.statutoryRequirement || ""}`,
        "enforcement_record",
        primaryDomain,
        JSON.stringify(["enforcement_action", "complaint_filing", "investigation"]),
        "standard",
        null,
        stateCode ? "state" : "federal",
        stateCode,
        null, null, null, null,
        JSON.stringify(stateCode ? [{ gate: "jurisdiction", operator: "eq", value: stateCode, description: `Enforcement in ${stateCode}` }] : []),
        JSON.stringify([
          { signal: "domain_match", weight: 0.4, matchValues: [primaryDomain], description: `${primaryDomain} enforcement` },
          { signal: "enforcement_type", weight: 0.3, matchValues: [r.complaintType || "enforcement"], description: "Enforcement record" }
        ]),
        JSON.stringify(pipelines),
        r.updatedAt || now,
        true,
        `Enforcement agency: ${r.agencyName} — handles ${r.complaintType || "enforcement"} in ${stateCode || "federal"}`,
        "enforcement",
        r.agencyName,
        r.statutoryRequirement || null,
        null,
        now, now
      ]
    );
    inserted++;
  }
  console.log(`  Inserted ${inserted} enforcement records`);
  return inserted;
}

async function seedFromAgencyAuthorityMap() {
  console.log("\n=== Seeding from agency_authority_map ===");
  const [records] = await pool.query("SELECT * FROM agency_authority_map");
  
  let inserted = 0;
  for (const r of records) {
    const domain = r.domain || "employment";
    const pipelines = domain === "employment"
      ? ["wage_theft", "wrongful_termination", "labor_violation", "workplace_discrimination"]
      : ["general_investigation"];
    
    await pool.query(
      `INSERT INTO unified_resources (
        sourceTable, sourceId, name, description, resourceType,
        domain, needTypes, urgencyLevel,
        jurisdictionId, jurisdictionType, stateCode,
        phone, website, email, address,
        hardEligibility, softSignals, matchingPipelineTypes,
        lastVerifiedAt, isActive, matchExplanationTemplate,
        category, agency, eligibilityNotes, applyNotes,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "agency_authority_map", String(r.id),
        `${r.agencyShort || r.agency} — ${r.statute || "Authority"}`,
        r.complaintPathway || `Agency authority: ${r.agency}`,
        "agency_authority",
        domain,
        JSON.stringify(["complaint_filing", "enforcement_action", "regulatory_oversight"]),
        "standard",
        null, "federal", null,
        null, null, null, null,
        null,
        JSON.stringify([
          { signal: "domain_match", weight: 0.4, matchValues: [domain], description: `${domain} authority` },
          { signal: "authority_type", weight: 0.3, matchValues: r.complaintTypes || ["enforcement"], description: "Regulatory authority" }
        ]),
        JSON.stringify(pipelines),
        r.updatedAt || now,
        true,
        `Regulatory authority: ${r.agencyShort || r.agency} — statutory basis: ${r.statute || "N/A"}`,
        "authority",
        r.agency,
        null, null,
        now, now
      ]
    );
    inserted++;
  }
  console.log(`  Inserted ${inserted} agency authority records`);
  return inserted;
}

async function main() {
  console.log("=== Unified Resource Normalization Pipeline ===");
  console.log(`Timestamp: ${new Date(now).toISOString()}`);
  
  // Clear existing data
  await pool.query("DELETE FROM unified_resources");
  console.log("Cleared existing unified_resources");
  
  const counts = {
    programs: await seedFromRegistryPrograms(),
    enforcementPaths: await seedFromEnforcementActionPaths(),
    enforcementRecords: await seedFromLegalEnforcementRecords(),
    agencyAuthority: await seedFromAgencyAuthorityMap(),
  };
  
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n=== COMPLETE ===`);
  console.log(`Total unified resources: ${total}`);
  console.log(JSON.stringify(counts, null, 2));
  
  // Verify
  const [verify] = await pool.query("SELECT resourceType, COUNT(*) as cnt FROM unified_resources GROUP BY resourceType ORDER BY cnt DESC");
  console.log("\n=== By Resource Type ===");
  verify.forEach(v => console.log(`  ${v.resourceType}: ${v.cnt}`));
  
  const [byDomain] = await pool.query("SELECT domain, COUNT(*) as cnt FROM unified_resources GROUP BY domain ORDER BY cnt DESC");
  console.log("\n=== By Domain ===");
  byDomain.forEach(v => console.log(`  ${v.domain}: ${v.cnt}`));
  
  const [byUrgency] = await pool.query("SELECT urgencyLevel, COUNT(*) as cnt FROM unified_resources GROUP BY urgencyLevel ORDER BY cnt DESC");
  console.log("\n=== By Urgency ===");
  byUrgency.forEach(v => console.log(`  ${v.urgencyLevel}: ${v.cnt}`));
  
  await pool.end();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
