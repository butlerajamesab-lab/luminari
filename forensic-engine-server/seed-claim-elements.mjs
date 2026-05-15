/**
 * Seed: Claim Elements Matrix (pasted_content_4.txt)
 * Populates claim_element_matrix and canonical_claim_catalog
 * Source: Claude's pasted_content_4.txt — L3 Claim Elements layer
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

// ─── Claim Elements Data ──────────────────────────────────────────────────────
// Each entry: claimType, domain, elements[], win_probability, avg_timeline_months, appeal_pathway, statute

const claimTypes = [
  // ── BENEFITS ──
  {
    claimType: 'SSDI_Denial',
    domain: 'benefits',
    statute: '42 USC § 405',
    win_probability: 0.48,
    avg_timeline_months: 30,
    appeal_pathway: 'SSA → Administrative Law Judge (ALJ) → Appeals Council → Federal Court',
    remedies: ['Reinstatement of benefits', 'Back benefits payment', 'Attorney fees (25% capped at $6,000)'],
    elements: [
      { element_id: 'ssdi_001', element_name: 'Severe Medical Condition', description: 'Applicant has a medical condition severe enough to prevent substantial gainful activity (SGA > $1,550/month in 2024)', evidence_types: ['medical_records','physician_testimony','functional_capacity_evaluation','imaging_studies'], confidence_threshold: 0.75, proof_standard: 'Clear and convincing evidence of impairment severity' },
      { element_id: 'ssdi_002', element_name: 'Duration of Condition', description: 'Medical condition must last or be expected to last at least 12 months or result in death', evidence_types: ['medical_prognosis','physician_statement','treatment_duration'], confidence_threshold: 0.70, proof_standard: 'Physician opinion on prognosis with timeline' },
      { element_id: 'ssdi_003', element_name: 'Work History & Coverage', description: 'Applicant worked enough years and recently enough to qualify (typically 20 of last 40 quarters)', evidence_types: ['tax_returns','W2_forms','earnings_record','social_security_statement'], confidence_threshold: 0.95, proof_standard: 'SSA earnings record verification (automatic)' },
      { element_id: 'ssdi_004', element_name: 'Inability to Work at Substantial Gainful Level', description: 'Applicant cannot earn more than $1,550/month due to impairment', evidence_types: ['work_history','functional_limitations','medical_evidence','attempt_to_work_documentation'], confidence_threshold: 0.80, proof_standard: 'Functional capacity evidence showing inability to reach SGA' },
    ]
  },
  {
    claimType: 'Medicaid_Wrongful_Denial',
    domain: 'benefits',
    statute: '42 USC § 1396a',
    win_probability: 0.65,
    avg_timeline_months: 6,
    appeal_pathway: 'State Medicaid Agency → State ALJ → Federal Court (42 USC § 1983)',
    remedies: ['Retroactive Medicaid coverage', 'Medical bills reimbursement', 'Attorney fees (CA, NY)'],
    elements: [
      { element_id: 'mcaid_001', element_name: 'Categorical Eligibility', description: 'Applicant falls within a covered category: low-income parent, pregnant woman, child, elderly, or disabled', evidence_types: ['family_documents','medical_documentation','birth_certificate','age_verification'], confidence_threshold: 0.90, proof_standard: 'Documentary evidence of categorical status' },
      { element_id: 'mcaid_002', element_name: 'Income Limit Compliance', description: "Applicant's income is below state Medicaid income limit (typically 138% federal poverty line)", evidence_types: ['pay_stubs','tax_returns','unemployment_documents','bank_statements'], confidence_threshold: 0.92, proof_standard: '3-month average income documentation' },
      { element_id: 'mcaid_003', element_name: 'Wrongful Denial Basis', description: 'State agency denied coverage incorrectly — procedural error, income miscalculation, or wrongful categorical exclusion', evidence_types: ['denial_letter','agency_records','income_documentation','eligibility_determination'], confidence_threshold: 0.75, proof_standard: 'Denial letter + evidence contradicting stated reason' },
    ]
  },
  // ── EMPLOYMENT ──
  {
    claimType: 'Wage_Theft_FLSA',
    domain: 'employment',
    statute: '29 USC § 201 et seq (FLSA)',
    win_probability: 0.72,
    avg_timeline_months: 12,
    appeal_pathway: 'DOL WHD Complaint → Federal Court (29 USC § 216(b))',
    remedies: ['Back wages', 'Liquidated damages (equal to unpaid wages)', 'Attorney fees + costs'],
    elements: [
      { element_id: 'wt_001', element_name: 'Employment Relationship', description: 'Plaintiff was an employee (not independent contractor) of defendant employer', evidence_types: ['employment_contract','pay_stubs','W2','tax_records','work_schedule'], confidence_threshold: 0.90, proof_standard: 'Economic reality test: control, integration, permanence, investment, profit/loss, skill' },
      { element_id: 'wt_002', element_name: 'Hours Worked', description: 'Plaintiff worked hours for which they were not properly compensated (overtime, minimum wage, off-clock work)', evidence_types: ['time_records','work_schedule','text_messages','email_records','witness_statements'], confidence_threshold: 0.80, proof_standard: 'Records or reasonable estimate of hours worked' },
      { element_id: 'wt_003', element_name: 'Compensation Shortfall', description: 'Employer paid less than minimum wage or failed to pay overtime at 1.5x rate for hours over 40/week', evidence_types: ['pay_stubs','bank_records','payroll_records'], confidence_threshold: 0.85, proof_standard: 'Mathematical calculation of wages owed vs wages paid' },
      { element_id: 'wt_004', element_name: 'Employer Coverage', description: 'Employer is covered by FLSA (enterprise coverage: $500K+ annual revenue, or individual coverage)', evidence_types: ['employer_revenue_records','business_registration','interstate_commerce_evidence'], confidence_threshold: 0.70, proof_standard: 'Employer size or interstate commerce nexus' },
    ]
  },
  {
    claimType: 'Employment_Discrimination_Title_VII',
    domain: 'employment',
    statute: '42 USC § 2000e et seq (Title VII)',
    win_probability: 0.55,
    avg_timeline_months: 24,
    appeal_pathway: 'EEOC Charge → Right to Sue Letter → Federal Court',
    remedies: ['Back pay', 'Front pay', 'Compensatory damages', 'Punitive damages (up to $300K)', 'Reinstatement', 'Attorney fees'],
    elements: [
      { element_id: 'td7_001', element_name: 'Protected Class Membership', description: 'Plaintiff is a member of a protected class (race, color, religion, sex, national origin)', evidence_types: ['identity_documents','personal_statement','witness_statements'], confidence_threshold: 0.95, proof_standard: 'Plaintiff self-identification + documentation if needed' },
      { element_id: 'td7_002', element_name: 'Adverse Employment Action', description: 'Plaintiff suffered a materially adverse employment action (termination, demotion, pay cut, hostile environment)', evidence_types: ['termination_letter','performance_reviews','pay_records','HR_records','witness_statements'], confidence_threshold: 0.90, proof_standard: 'Documentation of adverse action with date and circumstances' },
      { element_id: 'td7_003', element_name: 'Causal Connection', description: 'Adverse action was motivated by discriminatory intent or disparate impact based on protected class', evidence_types: ['comparator_evidence','statistical_data','direct_statements','pattern_evidence','temporal_proximity'], confidence_threshold: 0.65, proof_standard: 'Circumstantial or direct evidence of discriminatory motive' },
      { element_id: 'td7_004', element_name: 'EEOC Exhaustion', description: 'Plaintiff filed EEOC charge within 180/300 days of discriminatory act and received right-to-sue letter', evidence_types: ['EEOC_charge','right_to_sue_letter','EEOC_filing_date'], confidence_threshold: 0.99, proof_standard: 'EEOC charge + right-to-sue letter (procedural prerequisite)' },
    ]
  },
  {
    claimType: 'Wrongful_Termination_Retaliation',
    domain: 'employment',
    statute: '29 USC § 215(a)(3) (FLSA retaliation); 42 USC § 2000e-3 (Title VII retaliation)',
    win_probability: 0.60,
    avg_timeline_months: 18,
    appeal_pathway: 'EEOC or DOL → Federal Court',
    remedies: ['Back pay', 'Reinstatement', 'Compensatory damages', 'Punitive damages', 'Attorney fees'],
    elements: [
      { element_id: 'ret_001', element_name: 'Protected Activity', description: 'Employee engaged in protected activity (filed complaint, reported violation, participated in investigation)', evidence_types: ['complaint_records','EEOC_charge','DOL_complaint','witness_statements','email_records'], confidence_threshold: 0.90, proof_standard: 'Documentation of protected activity with date' },
      { element_id: 'ret_002', element_name: 'Adverse Action', description: 'Employer took adverse action against employee (termination, demotion, reduced hours, hostile environment)', evidence_types: ['termination_letter','HR_records','pay_records','schedule_changes'], confidence_threshold: 0.90, proof_standard: 'Documentation of adverse action with date' },
      { element_id: 'ret_003', element_name: 'Causal Connection', description: 'Adverse action was caused by protected activity (temporal proximity, direct evidence, or pattern)', evidence_types: ['temporal_proximity','manager_statements','email_records','HR_notes','pattern_evidence'], confidence_threshold: 0.70, proof_standard: 'Temporal proximity (within 3 months) or direct evidence of retaliatory motive' },
    ]
  },
  // ── CIVIL RIGHTS ──
  {
    claimType: 'Housing_Discrimination_FHA',
    domain: 'civil_rights',
    statute: '42 USC § 3604 (Fair Housing Act)',
    win_probability: 0.58,
    avg_timeline_months: 18,
    appeal_pathway: 'HUD Complaint → HUD ALJ or Federal Court → 42 USC § 3612',
    remedies: ['Actual damages', 'Punitive damages (up to $16,000 first offense)', 'Injunctive relief', 'Attorney fees'],
    elements: [
      { element_id: 'fha_001', element_name: 'Protected Class Membership', description: 'Plaintiff is a member of a protected class (race, color, national origin, religion, sex, familial status, disability)', evidence_types: ['identity_documents','personal_statement'], confidence_threshold: 0.95, proof_standard: 'Self-identification' },
      { element_id: 'fha_002', element_name: 'Housing Transaction', description: 'Discriminatory act occurred in connection with sale, rental, financing, or terms of housing', evidence_types: ['rental_application','lease_agreement','denial_letter','loan_documents'], confidence_threshold: 0.90, proof_standard: 'Documentation of housing transaction or application' },
      { element_id: 'fha_003', element_name: 'Discriminatory Conduct', description: 'Defendant refused to rent/sell, set different terms, or made discriminatory statements based on protected class', evidence_types: ['denial_letter','recorded_statements','comparative_evidence','tester_evidence','witness_statements'], confidence_threshold: 0.70, proof_standard: 'Direct or circumstantial evidence of discriminatory conduct' },
    ]
  },
  {
    claimType: 'Police_Misconduct_1983',
    domain: 'civil_rights',
    statute: '42 USC § 1983',
    win_probability: 0.35,
    avg_timeline_months: 36,
    appeal_pathway: 'Federal Court (42 USC § 1983); DOJ Civil Rights Division complaint',
    remedies: ['Compensatory damages', 'Punitive damages', 'Injunctive relief', 'Attorney fees (42 USC § 1988)'],
    elements: [
      { element_id: 'p83_001', element_name: 'State Actor', description: 'Defendant was acting under color of state law (police officer, government official)', evidence_types: ['police_report','badge_number','department_records','witness_statements'], confidence_threshold: 0.95, proof_standard: 'Documentation of official capacity' },
      { element_id: 'p83_002', element_name: 'Constitutional Violation', description: 'Defendant violated a specific constitutional right (4th Amendment unreasonable search/seizure, 14th Amendment due process/equal protection)', evidence_types: ['incident_report','body_cam_footage','medical_records','witness_statements','photos'], confidence_threshold: 0.75, proof_standard: 'Evidence of specific constitutional violation' },
      { element_id: 'p83_003', element_name: 'Causation & Injury', description: 'Constitutional violation caused plaintiff specific injury (physical, emotional, economic)', evidence_types: ['medical_records','photos','economic_loss_documentation','psychological_evaluation'], confidence_threshold: 0.80, proof_standard: 'Documented injury causally linked to constitutional violation' },
      { element_id: 'p83_004', element_name: 'Qualified Immunity Rebuttal', description: 'Defendant is not protected by qualified immunity — constitutional right was clearly established at time of violation', evidence_types: ['case_law_research','prior_incidents','department_policy','training_records'], confidence_threshold: 0.50, proof_standard: 'Clearly established law at time of violation (highest barrier in § 1983 cases)' },
    ]
  },
  // ── HEALTHCARE ──
  {
    claimType: 'Insurance_Denial_ACA',
    domain: 'healthcare',
    statute: 'ACA Section 2719; 42 USC § 300gg-19',
    win_probability: 0.62,
    avg_timeline_months: 6,
    appeal_pathway: 'Internal Appeal → External Review (ERISA or state) → Federal Court',
    remedies: ['Coverage reinstatement', 'Retroactive coverage', 'Reimbursement of out-of-pocket costs', 'Attorney fees (ERISA)'],
    elements: [
      { element_id: 'ins_001', element_name: 'Coverage Existence', description: 'Plaintiff had active insurance coverage at time of denial', evidence_types: ['insurance_card','policy_documents','premium_payment_records'], confidence_threshold: 0.99, proof_standard: 'Insurance card + policy documents' },
      { element_id: 'ins_002', element_name: 'Medical Necessity', description: 'Treatment was medically necessary as defined by plan and supported by physician recommendation', evidence_types: ['physician_letter','medical_records','clinical_guidelines','specialist_referral'], confidence_threshold: 0.75, proof_standard: 'Physician letter of medical necessity + clinical guidelines support' },
      { element_id: 'ins_003', element_name: 'Wrongful Denial Basis', description: 'Insurer denied coverage without valid clinical justification or based on improper criteria', evidence_types: ['denial_letter','plan_documents','clinical_guidelines','independent_medical_opinion'], confidence_threshold: 0.70, proof_standard: 'Denial letter + evidence that denial criteria were improper or misapplied' },
    ]
  },
  // ── OVERSIGHT / FOIA ──
  {
    claimType: 'FOIA_Wrongful_Withholding',
    domain: 'oversight',
    statute: '5 USC § 552 (Freedom of Information Act)',
    win_probability: 0.70,
    avg_timeline_months: 12,
    appeal_pathway: 'Agency Administrative Appeal → Federal Court (5 USC § 552(a)(4)(B))',
    remedies: ['Document production', 'Attorney fees + costs (if substantially prevails)', 'Injunctive relief'],
    elements: [
      { element_id: 'foia_001', element_name: 'Proper FOIA Request', description: 'Plaintiff submitted a proper FOIA request identifying records sought with reasonable specificity', evidence_types: ['FOIA_request_copy','submission_confirmation','certified_mail_receipt'], confidence_threshold: 0.99, proof_standard: 'Copy of FOIA request + proof of submission' },
      { element_id: 'foia_002', element_name: 'Agency Failure to Respond', description: 'Agency failed to respond within 20 business days or improperly withheld records without valid exemption', evidence_types: ['response_letter','denial_letter','timeline_documentation'], confidence_threshold: 0.90, proof_standard: 'Timeline showing failure to respond or improper withholding' },
      { element_id: 'foia_003', element_name: 'No Valid Exemption', description: 'Records do not fall within a valid FOIA exemption (1-9) or agency improperly applied exemption', evidence_types: ['denial_letter','exemption_analysis','comparable_released_records'], confidence_threshold: 0.65, proof_standard: 'Analysis showing exemption does not apply or was improperly invoked' },
    ]
  },
];

// ─── Seed claim_element_matrix ────────────────────────────────────────────────
let elementCount = 0;
for (const ct of claimTypes) {
  for (let i = 0; i < ct.elements.length; i++) {
    const el = ct.elements[i];
    try {
      await conn.execute(`
        INSERT INTO claim_element_matrix (
          claimType, domain, elementName, elementDescription, elementOrder,
          evidenceTypes, strengthIndicators, commonWeaknesses, relatedAgency
        ) VALUES (?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          elementDescription=VALUES(elementDescription),
          evidenceTypes=VALUES(evidenceTypes)
      `, [
        ct.claimType, ct.domain, el.element_name, el.description, i + 1,
        JSON.stringify(el.evidence_types),
        JSON.stringify({ confidence_threshold: el.confidence_threshold, proof_standard: el.proof_standard }),
        JSON.stringify([]),
        null,
      ]);
      elementCount++;
    } catch (e) {
      console.warn(`  ⚠ element ${el.element_id}: ${e.message}`);
    }
  }
}
console.log(`✓ claim_element_matrix: ${elementCount} elements upserted`);

// ─── Seed canonical_claim_catalog ────────────────────────────────────────────
let catalogCount = 0;
for (const ct of claimTypes) {
  try {
    await conn.execute(`
      INSERT INTO canonical_claim_catalog (
        claimType, description, domains, statuteIds, elements, remedies, jurisdiction, addedBy
      ) VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        description=VALUES(description), elements=VALUES(elements), remedies=VALUES(remedies)
    `, [
      ct.claimType,
      `${ct.claimType} — ${ct.statute}. Win probability: ${Math.round(ct.win_probability * 100)}%. Avg timeline: ${ct.avg_timeline_months} months.`,
      JSON.stringify([ct.domain]),
      JSON.stringify([ct.statute]),
      JSON.stringify(ct.elements.map(e => ({ id: e.element_id, name: e.element_name, confidence: e.confidence_threshold }))),
      JSON.stringify(ct.remedies),
      'Federal + State',
      'seed-claim-elements',
    ]);
    catalogCount++;
  } catch (e) {
    console.warn(`  ⚠ catalog ${ct.claimType}: ${e.message}`);
  }
}
console.log(`✓ canonical_claim_catalog: ${catalogCount} claim types upserted`);

await conn.end();

console.log('\n=== CLAIM ELEMENTS SEED COMPLETE ===');
console.log(JSON.stringify({
  claim_element_matrix_rows: elementCount,
  canonical_claim_catalog_rows: catalogCount,
  claim_types_seeded: claimTypes.length,
}, null, 2));
