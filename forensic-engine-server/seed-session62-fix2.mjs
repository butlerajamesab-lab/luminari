// Session 62 Fix 2: Insert remaining courts and templates with corrected enum values
import mysql2 from 'mysql2/promise';

const conn = await mysql2.createConnection(process.env.DATABASE_URL);
const now = Date.now();

async function safeInsert(table, columns, values, label) {
  let inserted = 0;
  for (const row of values) {
    try {
      const placeholders = columns.map(() => '?').join(',');
      await conn.query(
        `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`,
        row
      );
      inserted++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') continue;
      console.error(`  Error: ${e.message}`);
    }
  }
  console.log(`  ${label}: ${inserted}/${values.length} inserted`);
}

console.log('=== Session 62 Fix 2 ===\n');

// Court Directory with correct enum values
console.log('1. Seeding Court Directory...');
const courts = [];
let ctid = 600;

const courtData = [
  { courtId: 'WAWD', courtName: 'U.S. District Court - Western District of Washington', jurisdiction: 'WA', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '206-370-8400', address: '700 Stewart St, Seattle, WA 98101', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'wawd.uscourts.gov/local-rules', proSe: 'wawd.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Seattle division' },
  { courtId: 'WAED', courtName: 'U.S. District Court - Eastern District of Washington', jurisdiction: 'WA', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '509-458-3400', address: '920 W Riverside Ave, Spokane, WA 99201', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'waed.uscourts.gov/local-rules', proSe: 'waed.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Spokane division' },
  { courtId: 'CACD', courtName: 'U.S. District Court - Central District of California', jurisdiction: 'CA', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '213-894-1565', address: '350 W 1st St, Los Angeles, CA 90012', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'cacd.uscourts.gov/local-rules', proSe: 'cacd.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Los Angeles division' },
  { courtId: 'CAND', courtName: 'U.S. District Court - Northern District of California', jurisdiction: 'CA', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '415-522-2000', address: '450 Golden Gate Ave, San Francisco, CA 94102', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'cand.uscourts.gov/local-rules', proSe: 'cand.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'San Francisco division' },
  { courtId: 'NYSD', courtName: 'U.S. District Court - Southern District of New York', jurisdiction: 'NY', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '212-805-0136', address: '500 Pearl St, New York, NY 10007', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'nysd.uscourts.gov/local-rules', proSe: 'nysd.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Manhattan division' },
  { courtId: 'NYED', courtName: 'U.S. District Court - Eastern District of New York', jurisdiction: 'NY', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '718-613-2600', address: '225 Cadman Plaza E, Brooklyn, NY 11201', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'nyed.uscourts.gov/local-rules', proSe: 'nyed.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Brooklyn division' },
  { courtId: 'TXND', courtName: 'U.S. District Court - Northern District of Texas', jurisdiction: 'TX', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '214-753-2200', address: '1100 Commerce St, Dallas, TX 75242', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'txnd.uscourts.gov/local-rules', proSe: 'txnd.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Dallas division' },
  { courtId: 'ILND', courtName: 'U.S. District Court - Northern District of Illinois', jurisdiction: 'IL', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '312-435-5670', address: '219 S Dearborn St, Chicago, IL 60604', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'ilnd.uscourts.gov/local-rules', proSe: 'ilnd.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Chicago division' },
  { courtId: 'MND', courtName: 'U.S. District Court - District of Minnesota', jurisdiction: 'MN', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '612-664-5000', address: '300 S 4th St, Minneapolis, MN 55415', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'mnd.uscourts.gov/local-rules', proSe: 'mnd.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Minneapolis division' },
  { courtId: 'MIED', courtName: 'U.S. District Court - Eastern District of Michigan', jurisdiction: 'MI', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '313-234-5005', address: '231 W Lafayette Blvd, Detroit, MI 48226', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'mied.uscourts.gov/local-rules', proSe: 'mied.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Detroit division' },
  { courtId: 'CA9', courtName: 'U.S. Court of Appeals - Ninth Circuit', jurisdiction: 'federal', courtType: 'Appellate', portal: 'pacer.uscourts.gov', phone: '415-355-8000', address: '95 7th St, San Francisco, CA 94103', fee: 605.00, deadlines: JSON.stringify(['Notice of Appeal: 30 days']), rulesUrl: 'ca9.uscourts.gov/rules', proSe: 'ca9.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['appellate']), notes: 'Covers AK, AZ, CA, HI, ID, MT, NV, OR, WA' },
  { courtId: 'CA2', courtName: 'U.S. Court of Appeals - Second Circuit', jurisdiction: 'federal', courtType: 'Appellate', portal: 'pacer.uscourts.gov', phone: '212-857-8500', address: '40 Foley Square, New York, NY 10007', fee: 605.00, deadlines: JSON.stringify(['Notice of Appeal: 30 days']), rulesUrl: 'ca2.uscourts.gov/rules', proSe: 'ca2.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['appellate']), notes: 'Covers CT, NY, VT' },
  { courtId: 'CA5', courtName: 'U.S. Court of Appeals - Fifth Circuit', jurisdiction: 'federal', courtType: 'Appellate', portal: 'pacer.uscourts.gov', phone: '504-310-7700', address: '600 S Maestri Pl, New Orleans, LA 70130', fee: 605.00, deadlines: JSON.stringify(['Notice of Appeal: 30 days']), rulesUrl: 'ca5.uscourts.gov/rules', proSe: 'ca5.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['appellate']), notes: 'Covers LA, MS, TX' },
  { courtId: 'CA7', courtName: 'U.S. Court of Appeals - Seventh Circuit', jurisdiction: 'federal', courtType: 'Appellate', portal: 'pacer.uscourts.gov', phone: '312-435-5850', address: '219 S Dearborn St, Chicago, IL 60604', fee: 605.00, deadlines: JSON.stringify(['Notice of Appeal: 30 days']), rulesUrl: 'ca7.uscourts.gov/rules', proSe: 'ca7.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['appellate']), notes: 'Covers IL, IN, WI' },
  { courtId: 'KING-SC', courtName: 'King County Superior Court', jurisdiction: 'WA', courtType: 'State Trial', portal: 'linxonline.co.king.wa.us', phone: '206-477-1400', address: '516 3rd Ave, Seattle, WA 98104', fee: 240.00, deadlines: JSON.stringify(['Answer: 20 days']), rulesUrl: 'kingcounty.gov/courts/rules', proSe: 'kingcounty.gov/courts/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'family', 'criminal']), notes: 'WA general jurisdiction trial court' },
  { courtId: 'LA-SC', courtName: 'LA County Superior Court', jurisdiction: 'CA', courtType: 'State Trial', portal: 'my.lacourt.org', phone: '213-830-0803', address: '111 N Hill St, Los Angeles, CA 90012', fee: 435.00, deadlines: JSON.stringify(['Answer: 30 days']), rulesUrl: 'lacourt.org/rules', proSe: 'lacourt.org/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'family', 'criminal']), notes: 'CA general jurisdiction trial court' },
  { courtId: 'NY-SC', courtName: 'New York Supreme Court - Manhattan', jurisdiction: 'NY', courtType: 'State Trial', portal: 'nycourts.gov/efile', phone: '646-386-3600', address: '60 Centre St, New York, NY 10007', fee: 210.00, deadlines: JSON.stringify(['Answer: 20/30 days']), rulesUrl: 'nycourts.gov/rules', proSe: 'nycourts.gov/courthelp', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'NY general jurisdiction trial court' },
  { courtId: 'COOK-CC', courtName: 'Cook County Circuit Court', jurisdiction: 'IL', courtType: 'State Trial', portal: 'cookcountyclerkofcourt.org', phone: '312-603-5030', address: '50 W Washington St, Chicago, IL 60602', fee: 337.00, deadlines: JSON.stringify(['Answer: 30 days']), rulesUrl: 'cookcountycourt.org/rules', proSe: 'cookcountycourt.org/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'IL trial court - Chicago' },
  { courtId: 'HARRIS-DC', courtName: 'Harris County District Court', jurisdiction: 'TX', courtType: 'State Trial', portal: 'efiletexas.gov', phone: '832-927-5800', address: '201 Caroline St, Houston, TX 77002', fee: 302.00, deadlines: JSON.stringify(['Answer: 20 days']), rulesUrl: 'justex.net/rules', proSe: 'justex.net/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'TX trial court - Houston' },
  { courtId: 'HENN-DC', courtName: 'Hennepin County District Court', jurisdiction: 'MN', courtType: 'State Trial', portal: 'mncourts.gov/efile', phone: '612-348-2040', address: '300 S 6th St, Minneapolis, MN 55487', fee: 320.00, deadlines: JSON.stringify(['Answer: 20 days']), rulesUrl: 'mncourts.gov/rules', proSe: 'mncourts.gov/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal', 'family']), notes: 'MN trial court - Minneapolis' },
  { courtId: 'WAYNE-CC', courtName: 'Wayne County Circuit Court', jurisdiction: 'MI', courtType: 'State Trial', portal: 'courts.michigan.gov', phone: '313-224-5261', address: '2 Woodward Ave, Detroit, MI 48226', fee: 175.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'courts.michigan.gov/rules', proSe: 'courts.michigan.gov/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'MI trial court - Detroit' },
  { courtId: 'WA-BIIA', courtName: 'WA Board of Industrial Insurance Appeals', jurisdiction: 'WA', courtType: 'Administrative Tribunal', portal: 'biia.wa.gov', phone: '360-753-9646', address: '2430 Chandler Ct SW, Olympia, WA 98504', fee: 0.00, deadlines: JSON.stringify(['Appeal: 60 days']), rulesUrl: 'biia.wa.gov/rules', proSe: 'biia.wa.gov', efiling: false, caseTypes: JSON.stringify(['workers_comp']), notes: 'WA workers comp appeals' },
  { courtId: 'EEOC-AH', courtName: 'EEOC Administrative Hearing', jurisdiction: 'federal', courtType: 'Administrative Tribunal', portal: 'eeoc.gov/filing-charge', phone: '800-669-4000', address: '131 M St NE, Washington, DC 20507', fee: 0.00, deadlines: JSON.stringify(['Charge: 180/300 days']), rulesUrl: 'eeoc.gov/rules', proSe: 'eeoc.gov/filing-charge', efiling: true, caseTypes: JSON.stringify(['employment_discrimination']), notes: 'Federal employment discrimination' },
  { courtId: 'SSA-ODAR', courtName: 'Social Security ODAR', jurisdiction: 'federal', courtType: 'Administrative Tribunal', portal: 'ssa.gov/appeals', phone: '800-772-1213', address: 'Various locations', fee: 0.00, deadlines: JSON.stringify(['Appeal: 60 days']), rulesUrl: 'ssa.gov/appeals', proSe: 'ssa.gov/appeals', efiling: true, caseTypes: JSON.stringify(['disability']), notes: 'SSA disability hearings' },
  { courtId: 'FLSD', courtName: 'U.S. District Court - Southern District of Florida', jurisdiction: 'FL', courtType: 'Federal District', portal: 'pacer.uscourts.gov', phone: '305-523-5100', address: '400 N Miami Ave, Miami, FL 33128', fee: 405.00, deadlines: JSON.stringify(['Answer: 21 days']), rulesUrl: 'flsd.uscourts.gov/local-rules', proSe: 'flsd.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal']), notes: 'Miami division' },
  { courtId: 'CA11', courtName: 'U.S. Court of Appeals - Eleventh Circuit', jurisdiction: 'federal', courtType: 'Appellate', portal: 'pacer.uscourts.gov', phone: '404-335-6100', address: '56 Forsyth St NW, Atlanta, GA 30303', fee: 605.00, deadlines: JSON.stringify(['Notice of Appeal: 30 days']), rulesUrl: 'ca11.uscourts.gov/rules', proSe: 'ca11.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['appellate']), notes: 'Covers AL, FL, GA' },
  { courtId: 'CA6', courtName: 'U.S. Court of Appeals - Sixth Circuit', jurisdiction: 'federal', courtType: 'Appellate', portal: 'pacer.uscourts.gov', phone: '513-564-7000', address: '540 Potter Stewart US Courthouse, Cincinnati, OH 45202', fee: 605.00, deadlines: JSON.stringify(['Notice of Appeal: 30 days']), rulesUrl: 'ca6.uscourts.gov/rules', proSe: 'ca6.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['appellate']), notes: 'Covers KY, MI, OH, TN' },
  { courtId: 'CA8', courtName: 'U.S. Court of Appeals - Eighth Circuit', jurisdiction: 'federal', courtType: 'Appellate', portal: 'pacer.uscourts.gov', phone: '314-244-2400', address: '111 S 10th St, St. Louis, MO 63102', fee: 605.00, deadlines: JSON.stringify(['Notice of Appeal: 30 days']), rulesUrl: 'ca8.uscourts.gov/rules', proSe: 'ca8.uscourts.gov/pro-se', efiling: true, caseTypes: JSON.stringify(['appellate']), notes: 'Covers AR, IA, MN, MO, NE, ND, SD' },
  { courtId: 'PIERCE-SC', courtName: 'Pierce County Superior Court', jurisdiction: 'WA', courtType: 'State Trial', portal: 'linxonline.co.pierce.wa.us', phone: '253-798-7455', address: '930 Tacoma Ave S, Tacoma, WA 98402', fee: 240.00, deadlines: JSON.stringify(['Answer: 20 days']), rulesUrl: 'piercecountywa.gov/courts/rules', proSe: 'piercecountywa.gov/courts/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'family', 'criminal']), notes: 'WA trial court - Tacoma' },
  { courtId: 'SD-SC', courtName: 'San Diego Superior Court', jurisdiction: 'CA', courtType: 'State Trial', portal: 'sdcourt.ca.gov', phone: '619-450-7072', address: '1100 Union St, San Diego, CA 92101', fee: 435.00, deadlines: JSON.stringify(['Answer: 30 days']), rulesUrl: 'sdcourt.ca.gov/rules', proSe: 'sdcourt.ca.gov/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'family', 'criminal']), notes: 'CA trial court - San Diego' },
  { courtId: 'MIAMI-CC', courtName: 'FL Circuit Court - Miami-Dade', jurisdiction: 'FL', courtType: 'State Trial', portal: 'myflcourtaccess.com', phone: '305-349-7001', address: '73 W Flagler St, Miami, FL 33130', fee: 401.00, deadlines: JSON.stringify(['Answer: 20 days']), rulesUrl: 'jud11.flcourts.org/rules', proSe: 'jud11.flcourts.org/self-help', efiling: true, caseTypes: JSON.stringify(['civil', 'criminal', 'family']), notes: 'FL trial court - Miami' },
];

for (const c of courtData) {
  ctid++;
  courts.push([ctid, c.courtId, c.courtName, c.jurisdiction, c.courtType, c.portal, c.phone, c.address, c.fee, c.deadlines, c.rulesUrl, c.proSe, c.efiling, c.caseTypes, c.notes, now, now]);
}

await safeInsert('court_directory',
  ['id', 'court_id', 'court_name', 'jurisdiction', 'court_type', 'filing_portal', 'clerk_phone', 'address', 'filing_fee', 'key_deadlines', 'local_rules_url', 'pro_se_resources', 'efiling', 'case_types', 'notes', 'createdAt', 'updatedAt'],
  courts, 'Court Directory');

// Remaining LumenSend templates (motion, report types)
console.log('\n2. Seeding remaining LumenSend Templates...');
const templates = [];
let tid = 200;

const templateData = [
  { type: 'motion', name: 'Motion for Protective Order', desc: 'Protective order in DV cases', subject: 'Motion for Order of Protection - {{petitioner_name}}', body: 'COMES NOW {{petitioner_name}}, and moves for an Order of Protection against {{respondent_name}}.\\n\\nActs: {{description}}.\\n\\nRelief: {{relief_requested}}.' },
  { type: 'motion', name: 'Motion for Fee Waiver', desc: 'Motion to waive court filing fees', subject: 'Motion to Proceed IFP - {{party_name}}', body: 'COMES NOW {{party_name}}, and moves to proceed in forma pauperis.\\n\\nIncome: ${{income}}. Expenses: ${{expenses}}.\\n\\nRequest waiver of all fees.' },
  { type: 'motion', name: 'Motion for Continuance', desc: 'Motion to continue hearing date', subject: 'Motion for Continuance - Case {{case_number}}', body: 'COMES NOW {{party_name}}, and moves for a continuance of hearing on {{hearing_date}}.\\n\\nCause: {{reason}}.\\n\\nProposed date: {{proposed_date}}.' },
  { type: 'report', name: 'Workplace Safety Incident Report', desc: 'Internal safety incident documentation', subject: 'Safety Incident Report - {{date}}', body: 'INCIDENT REPORT\\n\\nDate: {{date}}\\nLocation: {{location}}\\nInjured: {{injured_party}}\\nDescription: {{description}}\\nAction: {{action_taken}}' },
  { type: 'report', name: 'Discrimination Incident Report', desc: 'Internal discrimination incident log', subject: 'Discrimination Incident - {{date}}', body: 'INCIDENT REPORT\\n\\nDate: {{date}}\\nReporter: {{reporter}}\\nType: {{discrimination_type}}\\nDescription: {{description}}' },
];

for (const t of templateData) {
  tid++;
  templates.push([tid, t.type, t.name, t.desc, t.subject, t.body, now]);
}

await safeInsert('lumensend_templates',
  ['id', 'documentType', 'name', 'description', 'subjectTemplate', 'bodyTemplate', 'createdAt'],
  templates, 'LumenSend Templates');

// Final counts
console.log('\n=== Final Counts ===');
const tables = [
  'legal_statutes', 'legal_case_law', 'agency_authority_map', 'lumensend_templates',
  'assembly_section_library', 'legislator_contacts', 'advocacy_organizations',
  'advocacy_targets', 'doctrine_registry', 'court_directory', 'workflow_master',
  'evidence_profiles', 'deadline_rules', 'escalation_routes', 'weak_joint_registry',
  'proof_frameworks', 'signal_registry', 'pattern_registry', 'settlement_formulas',
  'evidence_confidence_rules', 'claim_validation_rules', 'remedy_feasibility_rules',
  'procedural_paths', 'coalition_legislators', 'coalition_agencies',
  'coalition_advocacy_orgs', 'coalition_media'
];

let total = 0;
for (const t of tables) {
  try {
    const [rows] = await conn.query(`SELECT COUNT(*) as cnt FROM ${t}`);
    const cnt = rows[0].cnt;
    total += cnt;
    console.log(`  ${t}: ${cnt}`);
  } catch (e) {
    console.log(`  ${t}: ERROR`);
  }
}
console.log(`\n  TOTAL: ${total}`);

await conn.end();
