/**
 * Seed: Civil Gideon Legal Aid Orgs + State Labor Board Pathways + Advocacy Infrastructure
 * Sources: pasted_content_6.txt, pasted_content_7.txt, pasted_content_8.txt
 * Strategy: CREATE TABLE IF NOT EXISTS + UPSERT (INSERT ... ON DUPLICATE KEY UPDATE)
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
  multipleStatements: true,
});

console.log('✓ Connected to luminari_registry');

// ─── 1. Create Tables ─────────────────────────────────────────────────────────

await conn.execute(`
  CREATE TABLE IF NOT EXISTS legal_aid_orgs (
    org_id VARCHAR(100) PRIMARY KEY,
    organization VARCHAR(255) NOT NULL,
    org_type VARCHAR(100),
    jurisdiction_code CHAR(5) NOT NULL,
    jurisdiction_name VARCHAR(100),
    coverage VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(255),
    email VARCHAR(255),
    languages_intake JSON,
    languages_documentation JSON,
    translation_services VARCHAR(255),
    claim_types JSON,
    handles_admin_stage TINYINT(1) DEFAULT 0,
    handles_post_lawsuit TINYINT(1) DEFAULT 0,
    intake_method JSON,
    current_waitlist_months INT DEFAULT 0,
    capacity_status VARCHAR(50),
    capacity_last_updated DATE,
    last_verified DATE,
    verification_source TEXT,
    notes TEXT,
    success_rate_wage_theft DECIMAL(4,2),
    success_rate_employment DECIMAL(4,2),
    success_rate_housing DECIMAL(4,2),
    success_rate_benefits DECIMAL(4,2),
    immigrant_worker_support TINYINT(1) DEFAULT 0,
    indigenous_worker_support TINYINT(1) DEFAULT 0,
    agricultural_worker_support TINYINT(1) DEFAULT 0,
    multilingual_support TINYINT(1) DEFAULT 0,
    capacity_warning TINYINT(1) DEFAULT 0,
    federal_backup_recommended TINYINT(1) DEFAULT 0,
    created_at BIGINT DEFAULT 0,
    updated_at BIGINT DEFAULT 0
  )
`);
console.log('✓ legal_aid_orgs table ready');

await conn.execute(`
  CREATE TABLE IF NOT EXISTS state_labor_pathways (
    jurisdiction_code CHAR(5) PRIMARY KEY,
    jurisdiction_name VARCHAR(100) NOT NULL,
    labor_agency_name VARCHAR(255),
    labor_agency_contact VARCHAR(100),
    website VARCHAR(255),
    claim_types_handled JSON,
    primary_statute VARCHAR(255),
    filing_deadline TEXT,
    process_steps JSON,
    key_deadlines JSON,
    typical_outcomes JSON,
    recovery_base_estimate DECIMAL(10,2),
    recovery_margin_percent INT,
    recovery_margin_range VARCHAR(50),
    recovery_volatility_source TEXT,
    recovery_volatility_citation TEXT,
    success_rate DECIMAL(4,2),
    win_probability DECIMAL(4,2),
    enforcement_likelihood DECIMAL(4,2),
    recovery_timeline TEXT,
    contingency_wage_theft TEXT,
    legal_aid_notes TEXT,
    primary_pathway TEXT,
    secondary_pathway TEXT,
    backup_pathway TEXT,
    last_verified DATE,
    capacity_last_updated DATE,
    verification_source TEXT,
    created_at BIGINT DEFAULT 0,
    updated_at BIGINT DEFAULT 0
  )
`);
console.log('✓ state_labor_pathways table ready');

// ─── 2. Legal Aid Orgs Data ───────────────────────────────────────────────────

const legalAidOrgs = [
  // Alabama
  {
    org_id: 'al_poverty_law_001', organization: 'Alabama Poverty Law Unit', org_type: 'Legal Aid',
    jurisdiction_code: 'AL', jurisdiction_name: 'Alabama', coverage: 'Statewide',
    phone: '205-328-7260', website: 'alabamapovertylaw.org', email: 'intake@alabamapovertylaw.org',
    languages_intake: ['English','Spanish'], languages_documentation: ['English'],
    translation_services: 'client-provided only',
    claim_types: ['wage_theft','employment_discrimination','housing','benefits_denial'],
    handles_admin_stage: 1, handles_post_lawsuit: 1,
    intake_method: ['phone','mail','in-person'],
    current_waitlist_months: 2, capacity_status: 'open',
    capacity_last_updated: '2026-04-01', last_verified: '2026-04-12',
    verification_source: 'alabamapovertylaw.org/intake; direct phone interview Apr 2026',
    notes: 'Accepts all four core claim types. Spanish intake available but documents in English only. In-person offices in Birmingham, Montgomery, Huntsville.',
    success_rate_wage_theft: 0.65, success_rate_employment: 0.60, success_rate_housing: 0.62, success_rate_benefits: 0.58,
    capacity_warning: 0, federal_backup_recommended: 0
  },
  {
    org_id: 'al_lawyers_disabled_001', organization: 'Alabama Lawyers for the Disabled', org_type: 'Pro Bono Network',
    jurisdiction_code: 'AL', jurisdiction_name: 'Alabama', coverage: 'Statewide',
    phone: '205-328-7200', website: null, email: null,
    languages_intake: ['English'], languages_documentation: ['English'],
    translation_services: null,
    claim_types: ['employment_discrimination'],
    handles_admin_stage: 1, handles_post_lawsuit: 0,
    intake_method: ['phone','email'],
    current_waitlist_months: 3, capacity_status: 'waitlisted',
    capacity_last_updated: '2026-03-15', last_verified: '2026-04-12',
    verification_source: 'alabama.gov/disability-law-directory; phone intake Apr 2026',
    notes: 'Specializes in disability discrimination. Limited capacity; waitlist common. Takes contingency cases for strong discrimination claims.',
    success_rate_wage_theft: null, success_rate_employment: 0.72, success_rate_housing: null, success_rate_benefits: null,
    capacity_warning: 1, federal_backup_recommended: 0
  },
  // Alaska
  {
    org_id: 'ak_legal_services_001', organization: 'Alaska Legal Services Corporation', org_type: 'Legal Aid',
    jurisdiction_code: 'AK', jurisdiction_name: 'Alaska', coverage: 'Statewide (including remote villages)',
    phone: '1-888-529-5275', website: 'alsc.org', email: 'intake@alsc.org',
    languages_intake: ['English','limited indigenous languages in villages'], languages_documentation: ['English'],
    translation_services: 'in-house for intake; client-provided for documentation',
    claim_types: ['wage_theft','employment_discrimination','housing','benefits_denial'],
    handles_admin_stage: 1, handles_post_lawsuit: 1,
    intake_method: ['phone','online','mail'],
    current_waitlist_months: 1, capacity_status: 'open',
    capacity_last_updated: '2026-04-01', last_verified: '2026-04-12',
    verification_source: 'alsc.org/intake; direct call Apr 2026',
    notes: 'Excellent rural access via phone intake. Remote villages served by circuit intake. Indigenous language support in villages. Handles tribal jurisdiction cases.',
    success_rate_wage_theft: 0.75, success_rate_employment: 0.70, success_rate_housing: 0.68, success_rate_benefits: 0.72,
    indigenous_worker_support: 1, capacity_warning: 0, federal_backup_recommended: 0
  },
  {
    org_id: 'ak_native_law_center_001', organization: 'Alaska Native Law Center', org_type: 'Specialized Network',
    jurisdiction_code: 'AK', jurisdiction_name: 'Alaska', coverage: 'Statewide, focus on Alaska Native communities',
    phone: null, website: null, email: null,
    languages_intake: ['English','indigenous languages'], languages_documentation: ['English'],
    translation_services: null,
    claim_types: ['employment_discrimination','wage_theft'],
    handles_admin_stage: 1, handles_post_lawsuit: 0,
    intake_method: ['phone','in-person at villages'],
    current_waitlist_months: 2, capacity_status: 'open',
    capacity_last_updated: '2026-04-01', last_verified: '2026-04-12',
    verification_source: 'uaf.edu/anlc; phone intake Apr 2026',
    notes: 'Critical for Alaska Native workers. Understands tribal jurisdiction issues. Strong for employment discrimination cases in Native communities.',
    success_rate_wage_theft: null, success_rate_employment: 0.78, success_rate_housing: null, success_rate_benefits: null,
    indigenous_worker_support: 1, capacity_warning: 0, federal_backup_recommended: 0
  },
  // Arizona
  {
    org_id: 'az_community_legal_001', organization: 'Community Legal Services Arizona', org_type: 'Legal Aid',
    jurisdiction_code: 'AZ', jurisdiction_name: 'Arizona', coverage: 'Statewide (offices in Phoenix, Tucson, Flagstaff)',
    phone: '602-233-1236', website: 'clsaz.org', email: 'intake@clsaz.org',
    languages_intake: ['English','Spanish'], languages_documentation: ['English','Spanish'],
    translation_services: 'in-house',
    claim_types: ['wage_theft','employment_discrimination','housing','immigrant_worker_focus'],
    handles_admin_stage: 1, handles_post_lawsuit: 1,
    intake_method: ['phone','online','walk-in'],
    current_waitlist_months: 2, capacity_status: 'open',
    capacity_last_updated: '2026-04-01', last_verified: '2026-04-12',
    verification_source: 'clsaz.org/intake; phone Apr 2026',
    notes: 'Strong immigrant worker program. Full bilingual intake + documentation. Specializes in wage theft + employment discrimination. Regional offices have different specialties.',
    success_rate_wage_theft: 0.72, success_rate_employment: 0.70, success_rate_housing: 0.68, success_rate_benefits: null,
    immigrant_worker_support: 1, multilingual_support: 1, capacity_warning: 0, federal_backup_recommended: 0
  },
  {
    org_id: 'az_immigrant_advocacy_001', organization: 'Arizona Immigrant Advocacy Coalition', org_type: 'Pro Bono Network',
    jurisdiction_code: 'AZ', jurisdiction_name: 'Arizona', coverage: 'Statewide focus on immigrant workers',
    phone: null, website: 'azimmigrant.org', email: null,
    languages_intake: ['English','Spanish'], languages_documentation: ['English','Spanish'],
    translation_services: null,
    claim_types: ['wage_theft','employment_discrimination'],
    handles_admin_stage: 1, handles_post_lawsuit: 0,
    intake_method: ['phone','online'],
    current_waitlist_months: 1, capacity_status: 'open',
    capacity_last_updated: '2026-04-01', last_verified: '2026-04-12',
    verification_source: 'azimmigrant.org; phone intake Apr 2026',
    notes: 'Immigrant-focused advocacy. Takes contingency cases. Strong network for immigration-related employment issues.',
    success_rate_wage_theft: 0.70, success_rate_employment: null, success_rate_housing: null, success_rate_benefits: null,
    immigrant_worker_support: 1, multilingual_support: 1, capacity_warning: 0, federal_backup_recommended: 0
  },
  // Arkansas
  {
    org_id: 'ar_justice_center_001', organization: 'Arkansas Justice Center', org_type: 'Legal Aid',
    jurisdiction_code: 'AR', jurisdiction_name: 'Arkansas', coverage: 'Statewide',
    phone: '501-376-3130', website: 'arjusticecenter.org', email: 'intake@arjusticecenter.org',
    languages_intake: ['English'], languages_documentation: ['English'],
    translation_services: 'client-provided only',
    claim_types: ['wage_theft','employment_discrimination','housing'],
    handles_admin_stage: 1, handles_post_lawsuit: 0,
    intake_method: ['phone','mail'],
    current_waitlist_months: 4, capacity_status: 'waitlisted',
    capacity_last_updated: '2026-03-01', last_verified: '2026-04-12',
    verification_source: 'arjusticecenter.org; phone intake Mar 2026',
    notes: 'LIMITED CAPACITY. Long waitlist (4+ months). English-only intake. Admin stage only — no post-lawsuit representation. FEDERAL DOL BACKUP STRONGLY RECOMMENDED.',
    success_rate_wage_theft: 0.55, success_rate_employment: 0.50, success_rate_housing: null, success_rate_benefits: null,
    capacity_warning: 1, federal_backup_recommended: 1
  },
  // California
  {
    org_id: 'ca_crla_001', organization: 'California Rural Legal Assistance (CRLA)', org_type: 'Legal Aid',
    jurisdiction_code: 'CA', jurisdiction_name: 'California', coverage: 'Rural California (Central Valley, rural NorCal, Far North)',
    phone: '1-888-349-4848', website: 'crla.org', email: 'intake@crla.org',
    languages_intake: ['English','Spanish'], languages_documentation: ['English','Spanish'],
    translation_services: 'in-house',
    claim_types: ['wage_theft','employment_discrimination','housing','agricultural_worker_focus'],
    handles_admin_stage: 1, handles_post_lawsuit: 1,
    intake_method: ['phone','online','in-person'],
    current_waitlist_months: 1, capacity_status: 'open',
    capacity_last_updated: '2026-04-01', last_verified: '2026-04-12',
    verification_source: 'crla.org/intake; phone Apr 2026',
    notes: 'GOLD STANDARD for agricultural + rural wage theft. Bilingual intake + documentation. Strong track record with DLSE + private suit parallel strategy.',
    success_rate_wage_theft: 0.85, success_rate_employment: 0.80, success_rate_housing: 0.78, success_rate_benefits: null,
    agricultural_worker_support: 1, immigrant_worker_support: 1, multilingual_support: 1, capacity_warning: 0, federal_backup_recommended: 0
  },
  {
    org_id: 'ca_las_la_001', organization: 'Legal Aid Society - Los Angeles', org_type: 'Legal Aid',
    jurisdiction_code: 'CA', jurisdiction_name: 'California', coverage: 'Los Angeles County + Orange County',
    phone: '213-241-0131', website: 'lasocal.org', email: 'intake@lasocal.org',
    languages_intake: ['English','Spanish','Korean','Vietnamese'], languages_documentation: ['English','Spanish'],
    translation_services: 'in-house for intake; contracted for litigation',
    claim_types: ['wage_theft','employment_discrimination','housing','benefits_denial'],
    handles_admin_stage: 1, handles_post_lawsuit: 1,
    intake_method: ['phone','online','walk-in'],
    current_waitlist_months: 1, capacity_status: 'open',
    capacity_last_updated: '2026-04-01', last_verified: '2026-04-12',
    verification_source: 'lasocal.org/intake; phone Apr 2026',
    notes: 'Large urban org. Excellent capacity. Multilingual intake (Korean + Vietnamese). Handles DLSE + private suit parallel. Strong employment law team.',
    success_rate_wage_theft: 0.82, success_rate_employment: 0.80, success_rate_housing: null, success_rate_benefits: null,
    multilingual_support: 1, immigrant_worker_support: 1, capacity_warning: 0, federal_backup_recommended: 0
  },
  {
    org_id: 'ca_bay_legal_001', organization: 'Bay Area Legal Aid', org_type: 'Legal Aid',
    jurisdiction_code: 'CA', jurisdiction_name: 'California', coverage: 'San Francisco Bay Area (SF, Oakland, San Jose, Marin)',
    phone: '1-855-250-5200', website: 'baylegal.org', email: 'intake@baylegal.org',
    languages_intake: ['English','Spanish','Chinese','Vietnamese'], languages_documentation: ['English'],
    translation_services: 'in-house for intake; contracted for documentation',
    claim_types: ['wage_theft','employment_discrimination','housing','benefits_denial'],
    handles_admin_stage: 1, handles_post_lawsuit: 1,
    intake_method: ['phone','online','walk-in'],
    current_waitlist_months: 2, capacity_status: 'open',
    capacity_last_updated: '2026-04-01', last_verified: '2026-04-12',
    verification_source: 'baylegal.org/intake; phone Apr 2026',
    notes: 'Urban org with strong immigrant community presence. Chinese (Mandarin + Cantonese) + Vietnamese support. Excellent wage theft + employment discrimination track record.',
    success_rate_wage_theft: 0.80, success_rate_employment: 0.78, success_rate_housing: null, success_rate_benefits: null,
    multilingual_support: 1, immigrant_worker_support: 1, capacity_warning: 0, federal_backup_recommended: 0
  },
];

// ─── 3. State Labor Pathways Data ─────────────────────────────────────────────

const stateLaborPathways = [
  {
    jurisdiction_code: 'AL', jurisdiction_name: 'Alabama',
    labor_agency_name: 'Alabama Department of Labor',
    labor_agency_contact: '334-242-8990', website: 'alabamalabor.gov',
    claim_types_handled: ['wage_theft','employment_discrimination','retaliation'],
    primary_statute: 'Ala. Code § 34-7-2 (Wage and Hour Law)',
    filing_deadline: 'No statute of limitations specified; federal FLSA 3-year SOL applies as backup',
    process_steps: [
      {step:1,name:'File Wage Complaint',timeline:'Same day',description:'Submit complaint with AL Department of Labor (phone, mail, or in-person).'},
      {step:2,name:'Investigation',timeline:'30-90 days',description:'AL labor commissioner investigates: requests payroll records, interviews employee and employer.'},
      {step:3,name:'Determination and Recovery',timeline:'60 days after investigation',description:'Labor commissioner issues finding and orders employer to pay back wages + penalties.'}
    ],
    key_deadlines: [{deadline:'No state statute of limitations',description:'File anytime; federal FLSA 3-year SOL is safety net'}],
    typical_outcomes: ['Back wages ordered','Penalties imposed ($50/violation typical)','Civil suit referral if employer non-compliant'],
    recovery_base_estimate: 1500, recovery_margin_percent: 35, recovery_margin_range: '975-2025',
    recovery_volatility_source: 'Alabama has weak wage protections. Penalties minimal ($50/violation); no liquidated damages in state law.',
    recovery_volatility_citation: 'Ala. Code § 34-7-2; AL DOL enforcement capacity data 2023-2024',
    success_rate: 0.65, win_probability: 0.65, enforcement_likelihood: 0.70,
    recovery_timeline: '30-90 days investigation + 60 days determination; 6-18 months if civil suit follows',
    contingency_wage_theft: 'Low. AL at-will employment state; private right of action weak. Recommend federal DOL backup.',
    legal_aid_notes: 'Limited capacity in rural areas',
    primary_pathway: 'Federal DOL Wage & Hour complaint (stronger, nationwide enforcement)',
    secondary_pathway: 'Alabama Department of Labor wage complaint (state process, faster)',
    backup_pathway: 'Private lawsuit if employer refuses to pay determined wages',
    last_verified: '2026-04-12', capacity_last_updated: '2026-04-01',
    verification_source: 'Ala. Code § 34-7-2; alabamalabor.gov/wage-and-hour; DOL WHD enforcement cooperation agreement 2024'
  },
  {
    jurisdiction_code: 'AK', jurisdiction_name: 'Alaska',
    labor_agency_name: 'Alaska Department of Labor and Workforce Development',
    labor_agency_contact: '1-888-529-2677', website: 'labor.alaska.gov',
    claim_types_handled: ['wage_theft','employment_discrimination','retaliation'],
    primary_statute: 'Alaska Stat. § 34.07.020 (Payment of Wages)',
    filing_deadline: '2 years (3 years for willful violations)',
    process_steps: [
      {step:1,name:'File Wage Claim',timeline:'Same day',description:'File online or by phone with Alaska DOL Wage and Hour Division.'},
      {step:2,name:'Investigation',timeline:'30-60 days',description:'DOL investigates; employer required to respond within 10 days.'},
      {step:3,name:'Determination',timeline:'30 days after investigation',description:'DOL issues order; employer must pay or appeal within 15 days.'}
    ],
    key_deadlines: [{deadline:'2-year SOL (3 for willful)',description:'File within 2 years of last violation'}],
    typical_outcomes: ['Back wages + 2x liquidated damages','Civil penalty up to $1,000/violation','Private right of action available'],
    recovery_base_estimate: 3000, recovery_margin_percent: 20, recovery_margin_range: '2400-3600',
    recovery_volatility_source: 'Alaska has strong wage protections with liquidated damages. Rural enforcement can be slower.',
    recovery_volatility_citation: 'Alaska Stat. § 34.07.020; AK DOL enforcement data 2024',
    success_rate: 0.78, win_probability: 0.78, enforcement_likelihood: 0.82,
    recovery_timeline: '30-90 days for DOL process; 3-6 months for private suit',
    contingency_wage_theft: 'Moderate. Liquidated damages make cases more attractive to contingency attorneys.',
    legal_aid_notes: 'Alaska Legal Services Corporation covers statewide including remote villages',
    primary_pathway: 'Alaska DOL Wage and Hour Division complaint',
    secondary_pathway: 'Federal DOL WHD complaint (parallel filing recommended)',
    backup_pathway: 'Private lawsuit for liquidated damages',
    last_verified: '2026-04-12', capacity_last_updated: '2026-04-01',
    verification_source: 'Alaska Stat. § 34.07.020; labor.alaska.gov/labor_standards; DOL WHD 2024'
  },
  {
    jurisdiction_code: 'AZ', jurisdiction_name: 'Arizona',
    labor_agency_name: 'Arizona Industrial Commission',
    labor_agency_contact: '602-542-4515', website: 'azica.gov',
    claim_types_handled: ['wage_theft','employment_discrimination','retaliation'],
    primary_statute: 'A.R.S. § 23-350 et seq. (Arizona Wage Act)',
    filing_deadline: '1 year for state claim; 2 years federal FLSA (3 for willful)',
    process_steps: [
      {step:1,name:'File Wage Claim',timeline:'Same day',description:'File online at azica.gov or by mail. Provide employer info, wages owed, dates worked.'},
      {step:2,name:'Investigation',timeline:'60-90 days',description:'Industrial Commission investigates; employer must respond within 30 days.'},
      {step:3,name:'Determination',timeline:'30 days after investigation',description:'Commission issues order. Employer must pay or request hearing.'}
    ],
    key_deadlines: [{deadline:'1-year state SOL',description:'File within 1 year; use federal FLSA for older claims'}],
    typical_outcomes: ['Back wages ordered','Treble damages for willful violations','Private right of action available'],
    recovery_base_estimate: 2000, recovery_margin_percent: 25, recovery_margin_range: '1500-2500',
    recovery_volatility_source: 'Arizona has moderate wage protections. Treble damages for willful violations is a strong deterrent.',
    recovery_volatility_citation: 'A.R.S. § 23-355; AZ Industrial Commission data 2024',
    success_rate: 0.70, win_probability: 0.70, enforcement_likelihood: 0.75,
    recovery_timeline: '60-120 days for commission process; 6-12 months for private suit',
    contingency_wage_theft: 'Moderate-High. Treble damages make contingency cases viable.',
    legal_aid_notes: 'Community Legal Services AZ covers statewide; strong immigrant worker program',
    primary_pathway: 'Arizona Industrial Commission wage claim',
    secondary_pathway: 'Federal DOL WHD complaint (parallel filing)',
    backup_pathway: 'Private lawsuit for treble damages',
    last_verified: '2026-04-12', capacity_last_updated: '2026-04-01',
    verification_source: 'A.R.S. § 23-350; azica.gov/wage-claims; DOL WHD AZ enforcement 2024'
  },
  {
    jurisdiction_code: 'CA', jurisdiction_name: 'California',
    labor_agency_name: 'California Division of Labor Standards Enforcement (DLSE)',
    labor_agency_contact: '1-844-522-6734', website: 'dir.ca.gov/dlse',
    claim_types_handled: ['wage_theft','employment_discrimination','retaliation','workplace_safety'],
    primary_statute: 'California Labor Code § 1194 + § 98 (Berman Hearing Process)',
    filing_deadline: '3 years for wage claims; 1 year for Labor Code penalties',
    process_steps: [
      {step:1,name:'File Wage Claim (Berman Hearing)',timeline:'Same day',description:'File online or in-person at DLSE office. Berman Hearing is informal, free, and does not require an attorney.'},
      {step:2,name:'Conference',timeline:'30-60 days',description:'DLSE schedules conference with employee and employer to attempt resolution.'},
      {step:3,name:'Hearing',timeline:'60-90 days after conference',description:'If no resolution, formal Berman Hearing before hearing officer. Employee presents evidence.'},
      {step:4,name:'Order, Decision, Award (ODA)',timeline:'30 days after hearing',description:'DLSE issues ODA. If employer does not pay, DLSE can file judgment in court.'}
    ],
    key_deadlines: [{deadline:'3-year SOL for wages',description:'File within 3 years of last violation'},{deadline:'1-year for Labor Code penalties',description:'PAGA claims must be filed within 1 year'}],
    typical_outcomes: ['Back wages + mandatory liquidated damages (equal to unpaid wages)','Waiting time penalties (30 days wages if employer willfully fails to pay at termination)','PAGA penalties ($100-200/employee/pay period)','Private right of action with attorney fees'],
    recovery_base_estimate: 4500, recovery_margin_percent: 15, recovery_margin_range: '3825-5175',
    recovery_volatility_source: 'California has the strongest wage protections in the nation. Mandatory liquidated damages, PAGA, and waiting time penalties create high recovery potential.',
    recovery_volatility_citation: 'CA Labor Code § 1194, § 203, § 2698 (PAGA); DLSE enforcement data 2024',
    success_rate: 0.85, win_probability: 0.85, enforcement_likelihood: 0.90,
    recovery_timeline: '3-6 months for Berman Hearing; 6-18 months for private suit with PAGA',
    contingency_wage_theft: 'HIGH. Mandatory liquidated damages + PAGA + attorney fees make CA wage theft cases highly attractive to contingency attorneys.',
    legal_aid_notes: 'CRLA (rural), Legal Aid Society LA, Bay Area Legal Aid — all excellent capacity',
    primary_pathway: 'DLSE Berman Hearing (free, informal, no attorney required)',
    secondary_pathway: 'Private lawsuit with PAGA claim (higher recovery, attorney fees)',
    backup_pathway: 'Federal DOL WHD (parallel filing for FLSA claims)',
    last_verified: '2026-04-12', capacity_last_updated: '2026-04-01',
    verification_source: 'CA Labor Code § 1194, § 203, § 2698; dir.ca.gov/dlse; DLSE enforcement statistics 2024'
  },
];

// ─── 4. Advocacy Infrastructure (file 8 sample) ──────────────────────────────
// File 8 has 312 orgs, 87 legislators, 156 agencies across 13 domains.
// We seed the first domain (insurance_denials) fully + extend coalition_advocacy_orgs.

const additionalAdvocacyOrgs = [
  {
    id: 'natl_patient_advocate_foundation', name: 'National Patient Advocate Foundation',
    org_type: 'Advocacy', domains: ['healthcare','insurance_denials','benefits_denial'],
    services_offered: ['insurance_appeals','patient_advocacy','financial_hardship_assistance'],
    contact_email: null, website: 'https://www.patientadvocatefoundation.org',
    coalition_willingness: 'high', influence_score: 88,
    description: 'Health insurance coverage disputes and financial hardship. 501(c)(3).',
    is_active: 1, contact_phone: '(800) 532-5274', hq_location: 'Washington, DC',
    last_verified: '2026-04-12', verification_source: 'patientadvocatefoundation.org; IRS 990'
  },
  {
    id: 'american_patients_association', name: 'American Patients Association',
    org_type: 'Advocacy', domains: ['healthcare','insurance_denials'],
    services_offered: ['insurance_transparency','appeals_advocacy'],
    contact_email: null, website: 'https://www.americanpatients.org',
    coalition_willingness: 'high', influence_score: 75,
    description: 'Insurance coverage transparency and appeals processes.',
    is_active: 1, contact_phone: '(202) 293-0999', hq_location: 'Washington, DC',
    last_verified: '2026-04-12', verification_source: 'americanpatients.org; nonprofit public directory'
  },
  {
    id: 'naic_consumer_line', name: 'NAIC Consumer Assistance Program',
    org_type: 'Government', domains: ['insurance_denials','consumer_protection'],
    services_offered: ['state_insurance_complaints','consumer_assistance'],
    contact_email: null, website: 'https://www.naic.org/consumer_assistance.htm',
    coalition_willingness: 'medium', influence_score: 82,
    description: 'State-level insurance complaint resolution. NAIC official program.',
    is_active: 1, contact_phone: '(877) 227-5529', hq_location: 'Kansas City, MO',
    last_verified: '2026-04-12', verification_source: 'naic.org; state-coordinated program'
  },
  {
    id: 'nelp_national', name: 'National Employment Law Project (NELP)',
    org_type: 'Policy Advocacy', domains: ['employment','wage_theft','labor'],
    services_offered: ['policy_advocacy','litigation_support','research','coalition_building'],
    contact_email: 'info@nelp.org', website: 'https://www.nelp.org',
    coalition_willingness: 'high', influence_score: 92,
    description: 'National advocacy for employment rights. Wage theft enforcement, worker protections.',
    is_active: 1, contact_phone: '(212) 285-3025', hq_location: 'New York, NY',
    last_verified: '2026-04-12', verification_source: 'nelp.org; IRS 990; direct contact'
  },
  {
    id: 'national_housing_law_project', name: 'National Housing Law Project',
    org_type: 'Legal Advocacy', domains: ['housing','eviction','benefits_denial'],
    services_offered: ['litigation_support','policy_advocacy','technical_assistance'],
    contact_email: 'info@nhlp.org', website: 'https://www.nhlp.org',
    coalition_willingness: 'high', influence_score: 87,
    description: 'Advancing housing rights for low-income people. Eviction defense, HUD complaints.',
    is_active: 1, contact_phone: '(415) 546-7000', hq_location: 'San Francisco, CA',
    last_verified: '2026-04-12', verification_source: 'nhlp.org; IRS 990'
  },
  {
    id: 'national_consumer_law_center', name: 'National Consumer Law Center (NCLC)',
    org_type: 'Legal Advocacy', domains: ['consumer_protection','debt_collection','predatory_lending'],
    services_offered: ['litigation_support','policy_advocacy','research','training'],
    contact_email: 'consumerlaw@nclc.org', website: 'https://www.nclc.org',
    coalition_willingness: 'high', influence_score: 90,
    description: 'Consumer rights advocacy. Debt collection, predatory lending, FDCPA enforcement.',
    is_active: 1, contact_phone: '(617) 542-8010', hq_location: 'Boston, MA',
    last_verified: '2026-04-12', verification_source: 'nclc.org; IRS 990; direct contact'
  },
];

// ─── 5. Execute Inserts ───────────────────────────────────────────────────────

let legalAidCount = 0;
for (const org of legalAidOrgs) {
  await conn.execute(`
    INSERT INTO legal_aid_orgs (
      org_id, organization, org_type, jurisdiction_code, jurisdiction_name, coverage,
      phone, website, email, languages_intake, languages_documentation, translation_services,
      claim_types, handles_admin_stage, handles_post_lawsuit, intake_method,
      current_waitlist_months, capacity_status, capacity_last_updated, last_verified,
      verification_source, notes, success_rate_wage_theft, success_rate_employment,
      success_rate_housing, success_rate_benefits, immigrant_worker_support,
      indigenous_worker_support, agricultural_worker_support, multilingual_support,
      capacity_warning, federal_backup_recommended
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      organization=VALUES(organization), capacity_status=VALUES(capacity_status),
      current_waitlist_months=VALUES(current_waitlist_months),
      capacity_last_updated=VALUES(capacity_last_updated), notes=VALUES(notes)
  `, [
    org.org_id, org.organization, org.org_type, org.jurisdiction_code, org.jurisdiction_name,
    org.coverage, org.phone || null, org.website || null, org.email || null,
    JSON.stringify(org.languages_intake), JSON.stringify(org.languages_documentation),
    org.translation_services || null, JSON.stringify(org.claim_types),
    org.handles_admin_stage, org.handles_post_lawsuit, JSON.stringify(org.intake_method),
    org.current_waitlist_months, org.capacity_status, org.capacity_last_updated, org.last_verified,
    org.verification_source, org.notes || null,
    org.success_rate_wage_theft || null, org.success_rate_employment || null,
    org.success_rate_housing || null, org.success_rate_benefits || null,
    org.immigrant_worker_support || 0, org.indigenous_worker_support || 0,
    org.agricultural_worker_support || 0, org.multilingual_support || 0,
    org.capacity_warning || 0, org.federal_backup_recommended || 0,
  ]);
  legalAidCount++;
}
console.log(`✓ legal_aid_orgs: ${legalAidCount} upserted`);

let laborCount = 0;
for (const pathway of stateLaborPathways) {
  await conn.execute(`
    INSERT INTO state_labor_pathways (
      jurisdiction_code, jurisdiction_name, labor_agency_name, labor_agency_contact, website,
      claim_types_handled, primary_statute, filing_deadline, process_steps, key_deadlines,
      typical_outcomes, recovery_base_estimate, recovery_margin_percent, recovery_margin_range,
      recovery_volatility_source, recovery_volatility_citation, success_rate, win_probability,
      enforcement_likelihood, recovery_timeline, contingency_wage_theft, legal_aid_notes,
      primary_pathway, secondary_pathway, backup_pathway, last_verified, capacity_last_updated,
      verification_source
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      labor_agency_name=VALUES(labor_agency_name), success_rate=VALUES(success_rate),
      recovery_base_estimate=VALUES(recovery_base_estimate),
      primary_pathway=VALUES(primary_pathway), last_verified=VALUES(last_verified)
  `, [
    pathway.jurisdiction_code, pathway.jurisdiction_name, pathway.labor_agency_name,
    pathway.labor_agency_contact, pathway.website,
    JSON.stringify(pathway.claim_types_handled), pathway.primary_statute, pathway.filing_deadline,
    JSON.stringify(pathway.process_steps), JSON.stringify(pathway.key_deadlines),
    JSON.stringify(pathway.typical_outcomes),
    pathway.recovery_base_estimate, pathway.recovery_margin_percent, pathway.recovery_margin_range,
    pathway.recovery_volatility_source, pathway.recovery_volatility_citation,
    pathway.success_rate, pathway.win_probability, pathway.enforcement_likelihood,
    pathway.recovery_timeline, pathway.contingency_wage_theft, pathway.legal_aid_notes,
    pathway.primary_pathway, pathway.secondary_pathway, pathway.backup_pathway,
    pathway.last_verified, pathway.capacity_last_updated, pathway.verification_source,
  ]);
  laborCount++;
}
console.log(`✓ state_labor_pathways: ${laborCount} upserted`);

// Check if coalition_advocacy_orgs has the columns we need
let orgCount = 0;
for (const org of additionalAdvocacyOrgs) {
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
}
console.log(`✓ coalition_advocacy_orgs (file 8 additions): ${orgCount} upserted`);

await conn.end();

console.log('\n=== SEED COMPLETE ===');
console.log(JSON.stringify({
  legal_aid_orgs: legalAidCount,
  state_labor_pathways: laborCount,
  advocacy_orgs_added: orgCount,
}, null, 2));
