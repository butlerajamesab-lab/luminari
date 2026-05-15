import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const u = new URL(url);
const conn = await mysql.createConnection({
  host: u.hostname, port: parseInt(u.port || '4000'),
  user: u.username, password: u.password,
  database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: false }
});

const now = Date.now();

const agencies = [
  // Federal — Employment
  { id: 'ag_dol_whd', name: 'U.S. Department of Labor — Wage and Hour Division', jurisdiction: 'federal', domain: 'employment', type: 'federal', website: 'https://www.dol.gov/agencies/whd', contact: { phone: '1-866-487-9243', email: 'WHD@dol.gov', address: '200 Constitution Ave NW, Washington, DC 20210' } },
  { id: 'ag_eeoc', name: 'Equal Employment Opportunity Commission', jurisdiction: 'federal', domain: 'employment', type: 'federal', website: 'https://www.eeoc.gov', contact: { phone: '1-800-669-4000', email: 'info@eeoc.gov', address: '131 M Street NE, Washington, DC 20507' } },
  { id: 'ag_nlrb', name: 'National Labor Relations Board', jurisdiction: 'federal', domain: 'employment', type: 'federal', website: 'https://www.nlrb.gov', contact: { phone: '1-844-762-6572', email: 'publicaffairs@nlrb.gov', address: '1015 Half Street SE, Washington, DC 20570' } },
  { id: 'ag_osha', name: 'Occupational Safety and Health Administration', jurisdiction: 'federal', domain: 'employment', type: 'federal', website: 'https://www.osha.gov', contact: { phone: '1-800-321-6742', email: 'osha.publications@dol.gov', address: '200 Constitution Ave NW, Washington, DC 20210' } },
  // Federal — Housing
  { id: 'ag_hud_fheo', name: 'HUD Office of Fair Housing and Equal Opportunity', jurisdiction: 'federal', domain: 'housing', type: 'federal', website: 'https://www.hud.gov/program_offices/fair_housing_equal_opp', contact: { phone: '1-800-669-9777', email: 'FHEO@hud.gov', address: '451 7th Street SW, Washington, DC 20410' } },
  { id: 'ag_cfpb', name: 'Consumer Financial Protection Bureau', jurisdiction: 'federal', domain: 'consumer_protection', type: 'federal', website: 'https://www.consumerfinance.gov', contact: { phone: '1-855-411-2372', email: 'cfpb_ombudsman@cfpb.gov', address: '1700 G Street NW, Washington, DC 20552' } },
  // Federal — Benefits
  { id: 'ag_ssa', name: 'Social Security Administration', jurisdiction: 'federal', domain: 'benefits', type: 'federal', website: 'https://www.ssa.gov', contact: { phone: '1-800-772-1213', email: 'op.oig.hotline@ssa.gov', address: '6401 Security Blvd, Baltimore, MD 21235' } },
  { id: 'ag_cms', name: 'Centers for Medicare & Medicaid Services', jurisdiction: 'federal', domain: 'healthcare', type: 'federal', website: 'https://www.cms.gov', contact: { phone: '1-800-633-4227', email: 'cms_ombudsman@cms.hhs.gov', address: '7500 Security Blvd, Baltimore, MD 21244' } },
  // Federal — Civil Rights
  { id: 'ag_doj_crt', name: 'DOJ Civil Rights Division', jurisdiction: 'federal', domain: 'other', type: 'federal', website: 'https://www.justice.gov/crt', contact: { phone: '1-800-514-0301', email: 'AskDOJ@usdoj.gov', address: '950 Pennsylvania Ave NW, Washington, DC 20530' } },
  { id: 'ag_doj_ovw', name: 'DOJ Office on Violence Against Women', jurisdiction: 'federal', domain: 'other', type: 'federal', website: 'https://www.justice.gov/ovw', contact: { phone: '202-307-6026', email: 'ovw.info@usdoj.gov', address: '145 N Street NE, Washington, DC 20530' } },
  // State — California
  { id: 'ag_ca_dfeh', name: 'California Civil Rights Department', jurisdiction: 'CA', domain: 'employment', type: 'state', website: 'https://calcivilrights.ca.gov', contact: { phone: '800-884-1684', email: 'contact.center@dfeh.ca.gov', address: '2218 Kausen Drive, Suite 100, Elk Grove, CA 95758' } },
  { id: 'ag_ca_labor', name: 'California Labor Commissioner\'s Office', jurisdiction: 'CA', domain: 'employment', type: 'state', website: 'https://www.dir.ca.gov/dlse/', contact: { phone: '844-522-6734', email: 'dlse@dir.ca.gov', address: '1515 Clay Street, Room 801, Oakland, CA 94612' } },
  { id: 'ag_ca_dfpi', name: 'California Department of Financial Protection and Innovation', jurisdiction: 'CA', domain: 'consumer_protection', type: 'state', website: 'https://dfpi.ca.gov', contact: { phone: '866-275-2677', email: 'consumer@dfpi.ca.gov', address: '2101 Arena Blvd, Sacramento, CA 95834' } },
  // State — New York
  { id: 'ag_ny_dhr', name: 'New York State Division of Human Rights', jurisdiction: 'NY', domain: 'employment', type: 'state', website: 'https://dhr.ny.gov', contact: { phone: '888-392-3644', email: 'infodhr@dhr.ny.gov', address: 'One Fordham Plaza, 4th Floor, Bronx, NY 10458' } },
  { id: 'ag_ny_dol', name: 'New York State Department of Labor', jurisdiction: 'NY', domain: 'employment', type: 'state', website: 'https://dol.ny.gov', contact: { phone: '888-469-7365', email: 'labor.sm.dol.laborstandards@labor.ny.gov', address: 'W.A. Harriman Campus, Albany, NY 12240' } },
  // State — Texas
  { id: 'ag_tx_twc', name: 'Texas Workforce Commission — Civil Rights Division', jurisdiction: 'TX', domain: 'employment', type: 'state', website: 'https://www.twc.texas.gov/civilrights', contact: { phone: '888-452-4778', email: 'civil.rights@twc.texas.gov', address: '101 E 15th Street, Austin, TX 78778' } },
  // State — Florida
  { id: 'ag_fl_fchr', name: 'Florida Commission on Human Relations', jurisdiction: 'FL', domain: 'employment', type: 'state', website: 'https://fchr.myflorida.com', contact: { phone: '850-488-7082', email: 'fchrinfo@fchr.myflorida.com', address: '4075 Esplanade Way, Suite 110, Tallahassee, FL 32399' } },
  // State — Illinois
  { id: 'ag_il_dhr', name: 'Illinois Department of Human Rights', jurisdiction: 'IL', domain: 'employment', type: 'state', website: 'https://dhr.illinois.gov', contact: { phone: '312-814-6200', email: 'dhr.info@illinois.gov', address: '100 W. Randolph Street, Suite 10-100, Chicago, IL 60601' } },
  // Nonprofit / Legal Aid
  { id: 'ag_nlada', name: 'National Legal Aid & Defender Association', jurisdiction: 'federal', domain: 'other', type: 'nonprofit', website: 'https://www.nlada.org', contact: { phone: '202-452-0620', email: 'info@nlada.org', address: '1901 Pennsylvania Ave NW, Suite 500, Washington, DC 20006' } },
  { id: 'ag_lsc', name: 'Legal Services Corporation', jurisdiction: 'federal', domain: 'other', type: 'nonprofit', website: 'https://www.lsc.gov', contact: { phone: '202-295-1500', email: 'info@lsc.gov', address: '3333 K Street NW, Washington, DC 20007' } },
];

let seeded = 0;
for (const a of agencies) {
  try {
    await conn.query(`
      INSERT INTO agencies_registry (id, agencyName, jurisdiction, domain, agencyType, website, contactMethods, officialStatus, notes, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', '', ?, ?)
      ON DUPLICATE KEY UPDATE agencyName=VALUES(agencyName), updatedAt=VALUES(updatedAt)
    `, [a.id, a.name, a.jurisdiction, a.domain, a.type, a.website, JSON.stringify(a.contact), now, now]);
    seeded++;
    console.log('  ✓', a.id);
  } catch(e) {
    console.error('  ✗', a.id, e.message.slice(0, 80));
  }
}

// Also seed canonical_reform_packages from reform_packages
const [reformRows] = await conn.query('SELECT * FROM reform_packages');
console.log('\nSeeding canonical_reform_packages from reform_packages...');
for (const r of reformRows) {
  try {
    const [cols] = await conn.query('DESCRIBE canonical_reform_packages');
    const colNames = cols.map(c => c.Field);
    // Only insert if canonical_reform_packages has compatible columns
    if (colNames.includes('package_id') || colNames.includes('id')) {
      await conn.query(`
        INSERT INTO canonical_reform_packages (id, title, domain, status, priority_score, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE title=VALUES(title), updated_at=VALUES(updated_at)
      `, [r.id || r.package_id, r.title || r.package_name, r.domain, r.status || 'active', r.priority_score || 5, now, now]);
      console.log('  ✓ canonical reform:', r.id || r.package_id);
    }
  } catch(e) {
    // canonical_reform_packages may have different schema — skip
    console.log('  canonical_reform_packages schema mismatch, skipping:', e.message.slice(0,60));
    break;
  }
}

const [r1] = await conn.query('SELECT COUNT(*) as cnt FROM agencies_registry');
const [r2] = await conn.query('SELECT COUNT(*) as cnt FROM canonical_reform_packages');
console.log('\n=== FINAL ===');
console.log('agencies_registry:', r1[0].cnt);
console.log('canonical_reform_packages:', r2[0].cnt);

await conn.end();
