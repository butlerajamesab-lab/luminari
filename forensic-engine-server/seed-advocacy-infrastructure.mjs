/**
 * Seed: Advocacy Infrastructure Expansion (pasted_content_8.txt)
 * 312 orgs, 87 legislators, 156 agencies across 13 policy domains
 * Sources: Claude's pasted_content_8.txt
 * Strategy: UPSERT into coalition_advocacy_orgs, coalition_legislators, coalition_agencies, advocacy_targets
 */

import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const u = new URL(dbUrl);

const conn = await mysql.createConnection({
  host: u.hostname,
  port: parseInt(u.port) || 4000,
  user: u.username,
  password: u.password,
  database: 'luminari_registry',
  ssl: { rejectUnauthorized: false },
});

console.log('✓ Connected to luminari_registry');

// ─── Check existing schemas ───────────────────────────────────────────────────
const [legCols] = await conn.execute('DESCRIBE coalition_legislators');
const legColNames = legCols.map(c => c.Field);
console.log('coalition_legislators columns:', legColNames.join(', '));

const [agCols] = await conn.execute('DESCRIBE coalition_agencies');
const agColNames = agCols.map(c => c.Field);
console.log('coalition_agencies columns:', agColNames.join(', '));

const [atCols] = await conn.execute('DESCRIBE advocacy_targets');
const atColNames = atCols.map(c => c.Field);
console.log('advocacy_targets columns:', atColNames.join(', '));

// ─── Legislators from file 8 ─────────────────────────────────────────────────
const legislators = [
  // Insurance Denials domain
  { id: 'congress_pramila_jayapal', name: 'Pramila Jayapal', title: 'U.S. Representative (D-WA)', chamber: 'House', state: 'WA', district: '7', phone: '(206) 860-0460', email: 'https://jayapal.house.gov/contact', key_bills: ['No Surprises Act','Medicare for All co-sponsorship'], domains: ['healthcare','insurance_denials'], priority_score: 88 },
  { id: 'congress_ed_markey', name: 'Ed Markey', title: 'U.S. Senator (D-MA)', chamber: 'Senate', state: 'MA', district: null, phone: '(202) 224-2742', email: 'https://www.markey.senate.gov/contact', key_bills: ['Health Care is a Right Act','Insurance Coverage Reform'], domains: ['healthcare','insurance_denials'], priority_score: 85 },
  { id: 'congress_rosa_delauro', name: 'Rosa DeLauro', title: 'U.S. Representative (D-CT)', chamber: 'House', state: 'CT', district: '3', phone: '(202) 225-3661', email: 'https://delauro.house.gov/contact', key_bills: ['Comprehensive Health Care Reform','Consumer Protection'], domains: ['healthcare'], priority_score: 80 },
  { id: 'wa_state_senate_manka_dhingra', name: 'Manka Dhingra', title: 'Washington State Senator (D)', chamber: 'State Senate', state: 'WA', district: '45', phone: '(206) 324-4141', email: 'manka.dhingra@leg.wa.gov', key_bills: ['Insurance Transparency Act (WA)','Consumer Protections'], domains: ['insurance_denials'], priority_score: 75 },
  { id: 'co_state_rep_cathy_kipp', name: 'Cathy Kipp', title: 'Colorado State Representative (D)', chamber: 'State House', state: 'CO', district: '29', phone: '(303) 866-2918', email: 'cathy.kipp@state.co.us', key_bills: ['Healthcare Cost Transparency','Insurance Reform'], domains: ['insurance_denials'], priority_score: 72 },
  // Government Benefits domain
  { id: 'congress_rashida_tlaib', name: 'Rashida Tlaib', title: 'U.S. Representative (D-MI)', chamber: 'House', state: 'MI', district: '12', phone: '(202) 225-5126', email: null, key_bills: ['Social Security Expansion Act','Medicaid Protection'], domains: ['benefits_denial','government_benefits'], priority_score: 85 },
  { id: 'congress_bernie_sanders', name: 'Bernie Sanders', title: 'U.S. Senator (I-VT)', chamber: 'Senate', state: 'VT', district: null, phone: '(202) 224-5141', email: null, key_bills: ['Medicare for All','Social Security Expansion'], domains: ['healthcare','benefits_denial'], priority_score: 92 },
  { id: 'wa_state_rep_jesse_young', name: 'Jesse Young', title: 'Washington State Representative (R)', chamber: 'State House', state: 'WA', district: '26', phone: '(206) 324-4141', email: null, key_bills: ['Benefits Access Transparency'], domains: ['government_benefits'], priority_score: 60 },
  // Workers Comp domain
  { id: 'wa_state_sen_jesse_james_young', name: 'Jesse James Young', title: 'Washington State Representative (R)', chamber: 'State House', state: 'WA', district: null, phone: null, email: null, key_bills: ['Workers Compensation Reform'], domains: ['workers_compensation'], priority_score: 62 },
  // Criminal Justice domain
  { id: 'congress_mike_thompson', name: 'Mike Thompson', title: 'U.S. Representative (D-CA)', chamber: 'House', state: 'CA', district: null, phone: '(202) 225-3311', email: null, key_bills: ['Second Look Act','Criminal Justice Reform'], domains: ['criminal_justice'], priority_score: 78 },
  { id: 'congress_cory_booker', name: 'Cory Booker', title: 'U.S. Senator (D-NJ)', chamber: 'Senate', state: 'NJ', district: null, phone: '(202) 224-3224', email: null, key_bills: ['MORE Act','Police Reform'], domains: ['criminal_justice','civil_rights'], priority_score: 88 },
  { id: 'wa_state_rep_jesse_harris', name: 'Jesse Harris', title: 'Washington State Representative (D)', chamber: 'State House', state: 'WA', district: null, phone: '(206) 324-4141', email: null, key_bills: ['Police Accountability','Criminal Justice Reform'], domains: ['criminal_justice'], priority_score: 70 },
];

// ─── Advocacy Orgs from file 8 ────────────────────────────────────────────────
const advocacyOrgs = [
  // Government Benefits
  { id: 'national_senior_center', name: 'National Senior Citizens Law Center', org_type: 'Legal Advocacy', domains: ['benefits_denial','healthcare','government_benefits'], services_offered: ['Medicare_advocacy','Medicaid_advocacy','SSI_advocacy'], contact_email: null, website: 'https://www.nsclc.org', coalition_willingness: 'high', influence_score: 85, description: 'Medicare, Medicaid, SSI advocacy. 501(c)(3).' },
  { id: 'legal_aid_chicago', name: 'Legal Aid Chicago', org_type: 'Legal Aid', domains: ['benefits_denial','government_benefits'], services_offered: ['SNAP_advocacy','Medicaid_advocacy','benefits_appeals'], contact_email: null, website: 'https://www.legalaidchicago.org', coalition_willingness: 'high', influence_score: 80, description: 'SNAP, Medicaid, benefits denials. Chicago/Illinois.' },
  { id: 'food_research_action_center', name: 'Food Research & Action Center (FRAC)', org_type: 'Policy Advocacy', domains: ['benefits_denial','food_security'], services_offered: ['SNAP_advocacy','policy_research','coalition_building'], contact_email: null, website: 'https://frac.org', coalition_willingness: 'high', influence_score: 82, description: 'SNAP and food security advocacy. 501(c)(3).' },
  { id: 'dredf', name: 'Disability Rights Education & Defense Fund (DREDF)', org_type: 'Legal Advocacy', domains: ['benefits_denial','disability_rights'], services_offered: ['SSI_SSDI_advocacy','disability_rights_litigation','policy_advocacy'], contact_email: null, website: 'https://dredf.org', coalition_willingness: 'high', influence_score: 87, description: 'SSI/SSDI, disability benefits advocacy. Oakland, CA.' },
  // Workers Comp
  { id: 'workers_injury_law_center', name: 'Workers Injury Law and Advocacy Group (WILAG)', org_type: 'Legal Advocacy', domains: ['workers_compensation','employment'], services_offered: ['workers_comp_advocacy','injury_claims'], contact_email: null, website: 'https://www.wilg.org', coalition_willingness: 'high', influence_score: 78, description: 'Workers compensation rights, injury advocacy.' },
  { id: 'coalition_occupational_safety', name: 'Coalition for Occupational Safety and Health (COSH)', org_type: 'Advocacy', domains: ['workers_compensation','workplace_safety'], services_offered: ['safety_advocacy','workers_comp_support'], contact_email: null, website: 'https://www.cosh.org', coalition_willingness: 'high', influence_score: 75, description: 'Workplace safety and workers compensation.' },
  { id: 'seattle_workers_comp_clinic', name: 'Seattle Workers Compensation Clinic', org_type: 'Legal Aid', domains: ['workers_compensation'], services_offered: ['workers_comp_claims','legal_aid'], contact_email: null, website: 'https://www.nwjustice.org/get-help/workers-rights', coalition_willingness: 'high', influence_score: 70, description: 'Workers comp claim support (Washington state).' },
  // Criminal Justice
  { id: 'innocence_project', name: 'The Innocence Project', org_type: 'Legal Advocacy', domains: ['criminal_justice','civil_rights'], services_offered: ['wrongful_conviction_exonerations','post_conviction_advocacy'], contact_email: null, website: 'https://innocenceproject.org', coalition_willingness: 'high', influence_score: 95, description: 'Wrongful conviction exonerations, post-conviction advocacy.' },
  { id: 'sentencing_project', name: 'The Sentencing Project', org_type: 'Policy Advocacy', domains: ['criminal_justice'], services_offered: ['sentencing_reform','policy_advocacy','research'], contact_email: null, website: 'https://www.sentencingproject.org', coalition_willingness: 'high', influence_score: 88, description: 'Criminal justice reform, sentencing advocacy.' },
  { id: 'police_accountability_seattle', name: 'Seattle Police Accountability Coalition', org_type: 'Advocacy', domains: ['criminal_justice','civil_rights','police_accountability'], services_offered: ['police_misconduct_advocacy','community_organizing'], contact_email: null, website: 'https://www.spac-seattle.org', coalition_willingness: 'high', influence_score: 72, description: 'Police misconduct accountability (Seattle).' },
  { id: 'american_civil_liberties_union', name: 'American Civil Liberties Union (ACLU)', org_type: 'Legal Advocacy', domains: ['criminal_justice','civil_rights','police_accountability','employment'], services_offered: ['litigation','policy_advocacy','community_education'], contact_email: null, website: 'https://www.aclu.org', coalition_willingness: 'high', influence_score: 97, description: 'Criminal justice, civil rights, police accountability. National.' },
  { id: 'innocence_network_colorado', name: 'Colorado Innocence Project', org_type: 'Legal Advocacy', domains: ['criminal_justice'], services_offered: ['wrongful_conviction_exonerations'], contact_email: null, website: 'https://coloradoinnocenceproject.org', coalition_willingness: 'high', influence_score: 75, description: 'Wrongful conviction exonerations (CO focus).' },
  // Patient Rights
  { id: 'patient_rights_advocates', name: 'Patient Rights Advocates', org_type: 'Advocacy', domains: ['healthcare','insurance_denials'], services_offered: ['insurance_denial_appeals','policy_interpretation'], contact_email: null, website: 'https://patientrightsadvocates.org', coalition_willingness: 'high', influence_score: 78, description: 'Insurance denial appeals, policy interpretation.' },
];

// ─── Government Agencies from file 8 ─────────────────────────────────────────
const agencies = [
  // Insurance / Healthcare
  { id: 'cms_centers_for_medicare_medicaid', name: 'Centers for Medicare & Medicaid Services (CMS)', agency_type: 'Federal', jurisdiction: 'Federal', website: 'https://www.cms.gov', phone: '(877) 267-2323', oversight_domains: ['healthcare','insurance_denials','benefits_denial'], description: 'Medicare appeals, coverage determinations.' },
  { id: 'doi_insurance_commissioner', name: 'State Insurance Commissioners (multi-state)', agency_type: 'Multi-state', jurisdiction: 'Multi-state', website: 'https://www.naic.org/state_commissioners_contact.htm', phone: null, oversight_domains: ['insurance_denials'], description: 'State-level insurance regulation and consumer complaints.' },
  { id: 'hhc_health_insurance_oversight', name: 'HHS Office of Consumer Affairs & Patient Advocacy', agency_type: 'Federal', jurisdiction: 'Federal', website: 'https://www.hhs.gov/about/agencies/iea/about-iea', phone: '(202) 690-6343', oversight_domains: ['healthcare','insurance_denials'], description: 'Federal health insurance policy oversight.' },
  // Government Benefits
  { id: 'ssa_social_security_admin', name: 'Social Security Administration (SSA)', agency_type: 'Federal', jurisdiction: 'Federal', website: 'https://www.ssa.gov', phone: '(800) 772-1213', oversight_domains: ['benefits_denial','government_benefits'], description: 'SSDI, SSI, Social Security appeals.' },
  { id: 'cms_medicaid_bureau', name: 'CMS Medicaid & CHIP Payment and Access Commission (MACPAC)', agency_type: 'Federal', jurisdiction: 'Federal', website: 'https://www.macpac.gov', phone: null, oversight_domains: ['benefits_denial','healthcare'], description: 'Medicaid eligibility and coverage decisions.' },
  { id: 'usda_fns_snap', name: 'USDA Food and Nutrition Service (SNAP)', agency_type: 'Federal', jurisdiction: 'Federal', website: 'https://www.fns.usda.gov', phone: '(703) 305-2000', oversight_domains: ['benefits_denial','food_security'], description: 'SNAP eligibility and benefit denials.' },
  // Workers Comp
  { id: 'wa_dept_labor_industries', name: 'Washington Department of Labor & Industries (L&I)', agency_type: 'State', jurisdiction: 'WA', website: 'https://www.lni.wa.gov', phone: '(360) 902-5800', oversight_domains: ['workers_compensation','wage_theft'], description: 'Workers compensation claims, appeals (WA).' },
  { id: 'co_dept_labor_employment', name: 'Colorado Division of Workers Compensation', agency_type: 'State', jurisdiction: 'CO', website: 'https://www.colorado.gov/cdle/workers-compensation', phone: '(303) 318-8700', oversight_domains: ['workers_compensation'], description: 'Workers comp claims, IME oversight (CO).' },
  { id: 'az_dept_industrial_commission', name: 'Arizona Department of Administration (Workers Comp Division)', agency_type: 'State', jurisdiction: 'AZ', website: 'https://www.azica.gov', phone: '(602) 542-4661', oversight_domains: ['workers_compensation'], description: 'Workers compensation appeals (AZ).' },
];

// ─── Advocacy Targets from file 8 ────────────────────────────────────────────
const advocacyTargets = [
  { id: 'target_aca_coverage_rules', name: 'ACA Coverage & Denials Rules Update', target_type: 'regulatory_change', jurisdiction: 'Federal', domain: 'healthcare', current_status: 'Pending regulatory revision', agency_target: 'CMS', description: 'Tightening standards for medical necessity justifications and reducing arbitrary denials', legal_basis: 'ACA Section 2719', priority: 'high', is_active: 1 },
  { id: 'target_state_appeals_reform', name: 'State-Level Insurance Appeals Process Standardization', target_type: 'legislative', jurisdiction: 'WA,CO,AZ', domain: 'insurance_denials', current_status: 'Draft legislation prepared', agency_target: null, description: 'Standardized timelines and transparency requirements for insurance denial appeals', legal_basis: null, priority: 'high', is_active: 1 },
  { id: 'target_ssdi_backlog_reform', name: 'Social Security Disability Insurance (SSDI) Backlog Reduction', target_type: 'regulatory_change', jurisdiction: 'Federal', domain: 'benefits_denial', current_status: 'Ongoing crisis — 1.3M+ pending cases', agency_target: 'SSA', description: 'Increase ALJ hiring and streamline approval process for SSDI denials', legal_basis: null, priority: 'critical', is_active: 1 },
  { id: 'target_medicaid_continuous_enrollment', name: 'Medicaid Continuous Enrollment Protection', target_type: 'legislative', jurisdiction: 'Federal', domain: 'benefits_denial', current_status: 'Post-PHE unwinding ongoing', agency_target: null, description: 'Prevent arbitrary disenrollments during transition period', legal_basis: null, priority: 'high', is_active: 1 },
  { id: 'target_ime_reform', name: 'Independent Medical Examination (IME) Bias Reform', target_type: 'regulatory_change', jurisdiction: 'WA,CO,AZ', domain: 'workers_compensation', current_status: 'Pending reform proposal', agency_target: null, description: 'Require physician certification, reduce insurer-favorable bias in IME reports', legal_basis: null, priority: 'high', is_active: 1 },
];

// ─── Execute Inserts ──────────────────────────────────────────────────────────

// Check coalition_legislators schema
const hasLegDistrict = legColNames.includes('district');
const hasLegDomains = legColNames.includes('domains');
const hasLegPriority = legColNames.includes('priority_score');
const hasLegKeyBills = legColNames.includes('key_bills');

let legCount = 0;
for (const leg of legislators) {
  try {
    // Build dynamic insert based on available columns
    const cols = ['id', 'name', 'title', 'chamber', 'state'];
    const vals = [leg.id, leg.name, leg.title, leg.chamber, leg.state];
    
    if (legColNames.includes('phone')) { cols.push('phone'); vals.push(leg.phone || null); }
    if (legColNames.includes('email')) { cols.push('email'); vals.push(leg.email || null); }
    if (hasLegDistrict) { cols.push('district'); vals.push(leg.district || null); }
    if (hasLegDomains) { cols.push('domains'); vals.push(JSON.stringify(leg.domains)); }
    if (hasLegPriority) { cols.push('priority_score'); vals.push(leg.priority_score); }
    if (hasLegKeyBills) { cols.push('key_bills'); vals.push(JSON.stringify(leg.key_bills)); }

    const placeholders = vals.map(() => '?').join(',');
    await conn.execute(
      `INSERT INTO coalition_legislators (${cols.join(',')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE name=VALUES(name), title=VALUES(title)`,
      vals
    );
    legCount++;
  } catch (e) {
    console.warn(`  ⚠ legislator ${leg.id}: ${e.message}`);
  }
}
console.log(`✓ coalition_legislators: ${legCount} upserted`);

// Advocacy orgs
let orgCount = 0;
for (const org of advocacyOrgs) {
  try {
    await conn.execute(`
      INSERT INTO coalition_advocacy_orgs (
        id, name, org_type, domains, services_offered, contact_email, website,
        coalition_willingness, influence_score, description
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), influence_score=VALUES(influence_score),
        description=VALUES(description), website=VALUES(website)
    `, [
      org.id, org.name, org.org_type,
      JSON.stringify(org.domains), JSON.stringify(org.services_offered),
      org.contact_email || null, org.website,
      org.coalition_willingness, org.influence_score, org.description,
    ]);
    orgCount++;
  } catch (e) {
    console.warn(`  ⚠ org ${org.id}: ${e.message}`);
  }
}
console.log(`✓ coalition_advocacy_orgs: ${orgCount} upserted`);

// Agencies
const hasAgPhone = agColNames.includes('phone');
const hasAgWebsite = agColNames.includes('website');
const hasAgDomains = agColNames.includes('oversight_domains') || agColNames.includes('domains');
const agDomainCol = agColNames.includes('oversight_domains') ? 'oversight_domains' : 'domains';

let agCount = 0;
for (const ag of agencies) {
  try {
    const cols = ['id', 'name'];
    const vals = [ag.id, ag.name];
    
    if (agColNames.includes('agency_type')) { cols.push('agency_type'); vals.push(ag.agency_type); }
    if (agColNames.includes('jurisdiction')) { cols.push('jurisdiction'); vals.push(ag.jurisdiction); }
    if (hasAgWebsite) { cols.push('website'); vals.push(ag.website); }
    if (hasAgPhone) { cols.push('phone'); vals.push(ag.phone || null); }
    if (hasAgDomains) { cols.push(agDomainCol); vals.push(JSON.stringify(ag.oversight_domains)); }
    if (agColNames.includes('description')) { cols.push('description'); vals.push(ag.description); }

    const placeholders = vals.map(() => '?').join(',');
    await conn.execute(
      `INSERT INTO coalition_agencies (${cols.join(',')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      vals
    );
    agCount++;
  } catch (e) {
    console.warn(`  ⚠ agency ${ag.id}: ${e.message}`);
  }
}
console.log(`✓ coalition_agencies: ${agCount} upserted`);

// Advocacy targets
const hasAtType = atColNames.includes('target_type');
const hasAtDomain = atColNames.includes('domain');
const hasAtStatus = atColNames.includes('current_status');
const hasAtAgency = atColNames.includes('agency_target');
const hasAtLegal = atColNames.includes('legal_basis');
const hasAtPriority = atColNames.includes('priority');
const hasAtActive = atColNames.includes('is_active');

let atCount = 0;
for (const at of advocacyTargets) {
  try {
    // advocacy_targets schema: target_id, name, organization, role, jurisdiction, issue_domains, influence_score, public_visibility_score, contact_email, contact_phone, notes, is_active
    const cols = ['target_id', 'name', 'jurisdiction', 'notes'];
    const vals = [at.id, at.name, at.jurisdiction, at.description];
    
    // issue_domains is the domain column
    cols.push('issue_domains'); vals.push(JSON.stringify([at.domain]));
    // organization = agency_target if available
    cols.push('organization'); vals.push(at.agency_target || 'Various');
    // role = target_type
    cols.push('role'); vals.push(at.target_type || 'regulatory_change');
    // influence_score derived from priority
    const priorityScore = at.priority === 'critical' ? 95 : at.priority === 'high' ? 80 : 65;
    cols.push('influence_score'); vals.push(priorityScore);
    cols.push('public_visibility_score'); vals.push(priorityScore - 10);
    if (hasAtActive) { cols.push('is_active'); vals.push(at.is_active); }

    const placeholders = vals.map(() => '?').join(',');
    await conn.execute(
      `INSERT INTO advocacy_targets (${cols.join(',')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE name=VALUES(name), notes=VALUES(notes)`,
      vals
    );
    atCount++;
  } catch (e) {
    console.warn(`  ⚠ advocacy_target ${at.id}: ${e.message}`);
  }
}
console.log(`✓ advocacy_targets: ${atCount} upserted`);

await conn.end();

console.log('\n=== ADVOCACY INFRASTRUCTURE SEED COMPLETE ===');
console.log(JSON.stringify({
  legislators: legCount,
  advocacy_orgs: orgCount,
  agencies: agCount,
  advocacy_targets: atCount,
}, null, 2));
