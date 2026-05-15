/**
 * seed-app-db-gaps.mjs
 * Seeds dataset_registry with 6 real data streams and paperwork_templates
 * Uses correct column names from actual schema
 */

import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const u = new URL(url);
const APP_DB = u.pathname.slice(1);

const conn = await mysql.createConnection({
  host: u.hostname,
  port: parseInt(u.port || '4000'),
  user: u.username,
  password: u.password,
  database: APP_DB,
  ssl: { rejectUnauthorized: false },
});

console.log('Connected to app DB:', APP_DB);

// ─── 1. Seed dataset_registry ───
// Columns: id, datasetId, datasetName, source, apiUrl, updateFrequency, jurisdiction, domain_dr, description_dr, fieldMapping, enabled, lastIngestedAt, totalRecordsIngested, cronExpression, createdAt, updatedAt
const now = Date.now();
const datasets = [
  {
    datasetId: 'ds_dol_wage_hour',
    datasetName: 'DOL Wage & Hour Enforcement Actions',
    source: 'data_gov',
    apiUrl: 'https://data.dol.gov/api/views/qsqe-kbr4/rows.json',
    updateFrequency: 'daily',
    jurisdiction: 'federal',
    domain_dr: 'employment',
    description_dr: 'U.S. Department of Labor Wage and Hour Division enforcement actions, violations, and back wage findings.',
    fieldMapping: JSON.stringify({ trade_nm: 'normalizedEntity', st_cd: 'normalizedState', bw_atp_amt: 'normalizedAmount' }),
    enabled: 1,
    cronExpression: '0 0 6 * * *',
  },
  {
    datasetId: 'ds_eeoc_charges',
    datasetName: 'EEOC Charge Statistics by State',
    source: 'data_gov',
    apiUrl: 'https://data.eeoc.gov/api/views/eeoc-charges/rows.json',
    updateFrequency: 'weekly',
    jurisdiction: 'federal',
    domain_dr: 'civil_rights',
    description_dr: 'EEOC charge statistics including discrimination type, resolution, and monetary benefits by state and year.',
    fieldMapping: JSON.stringify({ state: 'normalizedState', year: 'normalizedDate', monetary_benefits: 'normalizedAmount' }),
    enabled: 1,
    cronExpression: '0 0 6 * * 1',
  },
  {
    datasetId: 'ds_hud_fheo',
    datasetName: 'HUD Fair Housing Enforcement Cases',
    source: 'data_gov',
    apiUrl: 'https://www.hud.gov/program_offices/fair_housing_equal_opp/fheo_data',
    updateFrequency: 'monthly',
    jurisdiction: 'federal',
    domain_dr: 'housing',
    description_dr: 'HUD Office of Fair Housing and Equal Opportunity enforcement cases, complaints, and resolutions.',
    fieldMapping: JSON.stringify({ state: 'normalizedState', basis: 'normalizedCategory', closure_reason: 'normalizedStatus' }),
    enabled: 1,
    cronExpression: '0 0 6 1 * *',
  },
  {
    datasetId: 'ds_ssa_disability',
    datasetName: 'SSA Disability Determination Statistics',
    source: 'data_gov',
    apiUrl: 'https://www.ssa.gov/disability/data/SSA-SA-MOWL.csv',
    updateFrequency: 'monthly',
    jurisdiction: 'federal',
    domain_dr: 'benefits',
    description_dr: 'Social Security Administration disability determination data including allowance and denial rates by state.',
    fieldMapping: JSON.stringify({ state: 'normalizedState', year: 'normalizedDate', allowance_rate: 'normalizedAmount' }),
    enabled: 1,
    cronExpression: '0 0 6 1 * *',
  },
  {
    datasetId: 'ds_courtlistener_opinions',
    datasetName: 'CourtListener Federal Court Opinions',
    source: 'courtlistener',
    apiUrl: 'https://www.courtlistener.com/api/rest/v3/opinions/',
    updateFrequency: 'daily',
    jurisdiction: 'federal',
    domain_dr: 'civil_rights',
    description_dr: 'Federal court opinions from CourtListener covering civil rights, employment, housing, and benefits cases.',
    fieldMapping: JSON.stringify({ court: 'normalizedJurisdiction', date_filed: 'normalizedDate', case_name: 'normalizedEntity' }),
    enabled: 1,
    cronExpression: '0 0 3 * * *',
  },
  {
    datasetId: 'ds_nlrb_cases',
    datasetName: 'NLRB Unfair Labor Practice Cases',
    source: 'data_gov',
    apiUrl: 'https://www.nlrb.gov/reports-guidance/graphs-data/recent-case-activity',
    updateFrequency: 'weekly',
    jurisdiction: 'federal',
    domain_dr: 'employment',
    description_dr: 'National Labor Relations Board unfair labor practice case filings, dispositions, and outcomes.',
    fieldMapping: JSON.stringify({ state: 'normalizedState', case_type: 'normalizedCategory', respondent: 'normalizedEntity' }),
    enabled: 1,
    cronExpression: '0 0 6 * * 1',
  },
];

for (const ds of datasets) {
  try {
    await conn.query(`
      INSERT INTO dataset_registry 
        (datasetId, datasetName, source, apiUrl, updateFrequency, jurisdiction, domain_dr, description_dr, fieldMapping, enabled, totalRecordsIngested, cronExpression, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        datasetName = VALUES(datasetName),
        description_dr = VALUES(description_dr),
        updatedAt = VALUES(updatedAt)
    `, [
      ds.datasetId, ds.datasetName, ds.source, ds.apiUrl, ds.updateFrequency,
      ds.jurisdiction, ds.domain_dr, ds.description_dr, ds.fieldMapping,
      ds.enabled, ds.cronExpression, now, now
    ]);
    console.log(`  ✓ dataset: ${ds.datasetId}`);
  } catch (e) {
    console.error(`  ✗ dataset ${ds.datasetId}: ${e.message.slice(0, 100)}`);
  }
}

// ─── 2. Seed paperwork_templates ───
// Columns: id, templateType, title, description, templateBody, requiredFields, applicableClaimTypes, jurisdiction, createdAt, updatedAt
const templates = [
  {
    templateType: 'ssdi_alj_appeal',
    title: 'SSDI ALJ Appeal Brief',
    description: 'Administrative Law Judge appeal brief for Social Security Disability Insurance denial. Covers medical evidence, RFC assessment, vocational expert cross-examination, and step 5 burden shift.',
    templateBody: 'IN THE MATTER OF: [CLAIMANT_NAME]\nSSN: [LAST_4_SSN]\nClaim No.: [CLAIM_NUMBER]\n\nPRE-HEARING BRIEF\n\nI. INTRODUCTION\nClaimant [CLAIMANT_NAME] respectfully submits this pre-hearing brief in support of their claim for Social Security Disability Insurance benefits.\n\nII. STATEMENT OF THE CASE\n[CASE_HISTORY]\n\nIII. MEDICAL EVIDENCE\n[MEDICAL_EVIDENCE_SUMMARY]\n\nIV. RESIDUAL FUNCTIONAL CAPACITY\n[RFC_ARGUMENT]\n\nV. VOCATIONAL CONSIDERATIONS\n[VOCATIONAL_ARGUMENT]\n\nVI. LEGAL ARGUMENT\n[LEGAL_ARGUMENT]\n\nVII. CONCLUSION\nFor the foregoing reasons, Claimant respectfully requests that the ALJ find Claimant disabled and award benefits.',
    requiredFields: JSON.stringify(['claimant_name', 'ssn_last4', 'claim_number', 'onset_date', 'medical_records', 'treating_physician']),
    applicableClaimTypes: JSON.stringify(['ssdi_denial', 'ssi_denial', 'benefits_termination']),
    jurisdiction: 'federal',
  },
  {
    templateType: 'medicaid_fair_hearing',
    title: 'Medicaid State Fair Hearing Request',
    description: 'State fair hearing request for Medicaid denial, termination, or reduction of services. Covers medical necessity, prior authorization, and EPSDT rights.',
    templateBody: 'REQUEST FOR STATE FAIR HEARING\n\nDate: [DATE]\nTo: [STATE_MEDICAID_AGENCY]\n\nRe: Request for Fair Hearing\nApplicant/Recipient: [CLAIMANT_NAME]\nMedicaid ID: [MEDICAID_ID]\nNotice of Action Date: [NOTICE_DATE]\n\nI, [CLAIMANT_NAME], hereby request a fair hearing regarding the following action:\n[ADVERSE_ACTION_DESCRIPTION]\n\nI believe this action is incorrect because:\n[REASON_FOR_APPEAL]\n\nI request continuation of benefits pending the outcome of this hearing.\n\nSignature: _______________\nDate: [DATE]',
    requiredFields: JSON.stringify(['claimant_name', 'medicaid_id', 'notice_date', 'adverse_action', 'reason_for_appeal']),
    applicableClaimTypes: JSON.stringify(['medicaid_denial', 'medicaid_termination', 'prior_auth_denial']),
    jurisdiction: 'federal',
  },
  {
    templateType: 'dol_wage_complaint',
    title: 'DOL Wage & Hour Complaint',
    description: 'Formal complaint to DOL Wage and Hour Division for minimum wage violations, overtime violations, tip theft, or off-the-clock work.',
    templateBody: 'U.S. DEPARTMENT OF LABOR\nWAGE AND HOUR DIVISION\nCOMPLAINT FORM\n\nComplainant: [COMPLAINANT_NAME]\nAddress: [ADDRESS]\nPhone: [PHONE]\nEmail: [EMAIL]\n\nEmployer: [EMPLOYER_NAME]\nEmployer Address: [EMPLOYER_ADDRESS]\n\nViolation Period: [START_DATE] to [END_DATE]\nEstimated Back Wages Owed: $[AMOUNT]\n\nDescription of Violation:\n[VIOLATION_DESCRIPTION]\n\nEvidence Available:\n[EVIDENCE_LIST]\n\nI declare under penalty of perjury that the foregoing is true and correct.',
    requiredFields: JSON.stringify(['complainant_name', 'employer_name', 'violation_dates', 'wages_owed', 'violation_description']),
    applicableClaimTypes: JSON.stringify(['wage_theft', 'overtime_violation', 'minimum_wage', 'tip_theft']),
    jurisdiction: 'federal',
  },
  {
    templateType: 'eeoc_charge',
    title: 'EEOC Charge of Discrimination',
    description: 'EEOC charge of discrimination under Title VII, ADA, ADEA, or EPA. Required prerequisite before filing federal lawsuit.',
    templateBody: 'CHARGE OF DISCRIMINATION\nEEOC Form 5\n\nCharge Presented To: EEOC\n\nChargingParty: [COMPLAINANT_NAME]\nAddress: [ADDRESS]\nPhone: [PHONE]\n\nRespondent: [EMPLOYER_NAME]\nAddress: [EMPLOYER_ADDRESS]\nNo. of Employees: [EMPLOYEE_COUNT]\n\nDiscrimination Based On: [BASIS]\nDate of Discrimination: [DATE]\n\nThe Particulars Are:\n[NARRATIVE]\n\nI want this charge filed with both the EEOC and the State or local Agency, if any.',
    requiredFields: JSON.stringify(['complainant_name', 'employer_name', 'discrimination_basis', 'adverse_action_date', 'narrative']),
    applicableClaimTypes: JSON.stringify(['employment_discrimination', 'hostile_work_environment', 'retaliation', 'wrongful_termination']),
    jurisdiction: 'federal',
  },
  {
    templateType: 'hud_fair_housing',
    title: 'HUD Fair Housing Complaint',
    description: 'Fair Housing Act complaint for discrimination in housing sale, rental, or financing based on protected class.',
    templateBody: 'HOUSING DISCRIMINATION COMPLAINT\nU.S. Department of Housing and Urban Development\n\nComplainant: [COMPLAINANT_NAME]\nAddress: [ADDRESS]\nPhone: [PHONE]\n\nRespondent: [RESPONDENT_NAME]\nAddress: [RESPONDENT_ADDRESS]\n\nDiscrimination Based On: [BASIS]\nDate of Incident: [DATE]\nAddress of Property: [PROPERTY_ADDRESS]\n\nDescription of Discriminatory Act:\n[DESCRIPTION]\n\nWitnesses:\n[WITNESSES]\n\nRelief Requested:\n[RELIEF]',
    requiredFields: JSON.stringify(['complainant_name', 'respondent_name', 'property_address', 'discrimination_basis', 'incident_date', 'description']),
    applicableClaimTypes: JSON.stringify(['housing_discrimination', 'rental_discrimination', 'mortgage_discrimination']),
    jurisdiction: 'federal',
  },
  {
    templateType: 'section_1983_complaint',
    title: '42 USC § 1983 Civil Rights Complaint',
    description: 'Federal civil rights complaint under 42 USC § 1983 for constitutional violations by state actors.',
    templateBody: 'IN THE UNITED STATES DISTRICT COURT\nFOR THE [DISTRICT] DISTRICT OF [STATE]\n\n[PLAINTIFF_NAME], Plaintiff,\nv.\n[DEFENDANT_NAME], et al., Defendants.\n\nCivil Action No. ___________\n\nCOMPLAINT FOR VIOLATION OF CIVIL RIGHTS\n(42 U.S.C. § 1983)\n\nI. JURISDICTION AND VENUE\nThis Court has jurisdiction pursuant to 28 U.S.C. §§ 1331 and 1343.\n\nII. PARTIES\n[PARTIES]\n\nIII. FACTUAL ALLEGATIONS\n[FACTS]\n\nIV. CAUSES OF ACTION\nCount I: Violation of [CONSTITUTIONAL_RIGHT] under 42 U.S.C. § 1983\n[LEGAL_ARGUMENT]\n\nV. RELIEF REQUESTED\n[RELIEF]',
    requiredFields: JSON.stringify(['plaintiff_name', 'defendant_name', 'incident_date', 'constitutional_violation', 'facts', 'damages']),
    applicableClaimTypes: JSON.stringify(['police_misconduct', 'excessive_force', 'unlawful_arrest', 'civil_rights_violation']),
    jurisdiction: 'federal',
  },
  {
    templateType: 'foia_request',
    title: 'FOIA Request Letter',
    description: 'Freedom of Information Act request for federal agency records with fee waiver and expedited processing request.',
    templateBody: '[DATE]\n\nFOIA Officer\n[AGENCY_NAME]\n[AGENCY_ADDRESS]\n\nRe: Freedom of Information Act Request\n\nDear FOIA Officer:\n\nPursuant to the Freedom of Information Act, 5 U.S.C. § 552, I hereby request the following records:\n\n[RECORDS_REQUESTED]\n\nFEE WAIVER REQUEST:\nI request a waiver of all fees associated with this request because disclosure is in the public interest and will contribute significantly to public understanding of government operations.\n\nEXPEDITED PROCESSING REQUEST:\n[EXPEDITED_JUSTIFICATION]\n\nIf you deny any portion of this request, please cite each specific exemption you think justifies the refusal to release the information.\n\nSincerely,\n[REQUESTER_NAME]\n[ADDRESS]\n[PHONE]\n[EMAIL]',
    requiredFields: JSON.stringify(['requester_name', 'agency_name', 'records_requested', 'fee_waiver_justification']),
    applicableClaimTypes: JSON.stringify(['foia_request', 'records_request', 'government_transparency']),
    jurisdiction: 'federal',
  },
];

for (const t of templates) {
  try {
    await conn.query(`
      INSERT INTO paperwork_templates 
        (templateType, title, description, templateBody, requiredFields, applicableClaimTypes, jurisdiction, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        updatedAt = VALUES(updatedAt)
    `, [
      t.templateType, t.title, t.description, t.templateBody,
      t.requiredFields, t.applicableClaimTypes, t.jurisdiction, now, now
    ]);
    console.log(`  ✓ template: ${t.templateType}`);
  } catch (e) {
    console.error(`  ✗ template ${t.templateType}: ${e.message.slice(0, 100)}`);
  }
}

// Final verification
const checks = [
  'dataset_registry', 'paperwork_templates', 'live_signals', 'reform_packages',
  'legal_case_law', 'coalition_legislators', 'remedy_templates', 'strategy_memory'
];
console.log('\n=== FINAL VERIFICATION ===');
for (const t of checks) {
  try {
    const [r] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${t}\``);
    console.log(`  ${t}: ${r[0].cnt} rows`);
  } catch (e) {
    console.log(`  ${t}: ERROR - ${e.message.slice(0, 50)}`);
  }
}

await conn.end();
console.log('\nDone.');
