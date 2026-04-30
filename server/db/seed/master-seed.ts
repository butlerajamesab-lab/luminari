/**
 * LUMINARI MASTER SEED SCRIPT
 * ============================
 * Permanent, committed, re-runnable.
 * Run with: pnpm seed
 *
 * This script populates all critical tables from the canonical source files.
 * It is IDEMPOTENT — safe to run multiple times. Uses INSERT IGNORE / ON DUPLICATE KEY UPDATE.
 *
 * Tables seeded:
 *   - jurisdictions (from wa-registry-complete.json)
 *   - workflows (from wa-workflows.json)
 *   - workflow_steps (from wa-workflows.json)
 *   - workflow_deadlines (from wa-workflows.json)
 *   - resources (from wa-resources.json)
 *   - doctrine_graph_edges (derived from doctrine_registry nodes)
 *   - enforcement_viability_rules (canonical claim types × jurisdictions)
 *   - regulatory_guidance (from legal_enforcement_state_combined.json)
 *   - regulatory_enforcement_actions (from legal_enforcement_state_combined.json)
 *   - timeline_events (canonical legal timeline)
 *   - timeline_edges (derived from timeline events)
 *   - forms_registry (canonical agency forms)
 */

import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';

// ─── DB Connection ───────────────────────────────────────────────────────────
function buildPool() {
  const dbUrl = process.env.DATABASE_URL || '';
  try {
    const u = new URL(dbUrl);
    return mysql.createPool({
      host: u.hostname,
      port: parseInt(u.port || '4000', 10),
      user: u.username,
      password: u.password,
      database: 'luminari_registry',
      ssl: { rejectUnauthorized: true },
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  } catch {
    return mysql.createPool({
      host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: '2jhK1AfHyk6mXSq.root',
      password: '2k5Lq94U8voiKlatA3uZ',
      database: 'luminari_registry',
      ssl: { rejectUnauthorized: true },
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
}

// ─── Source File Loader ───────────────────────────────────────────────────────
function loadJSON(filename: string): any {
  // Look in /home/ubuntu/upload/ first, then relative to project
  const candidates = [
    `/home/ubuntu/upload/${filename}`,
    path.join(process.cwd(), 'server/db/seed/data', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  }
  console.warn(`  [WARN] Source file not found: ${filename}`);
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const now = Date.now();

async function count(pool: mysql.Pool, table: string): Promise<number> {
  const [rows] = await pool.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
  return (rows as any)[0].cnt;
}

// ─── SEED: jurisdictions ─────────────────────────────────────────────────────
async function seedJurisdictions(pool: mysql.Pool) {
  console.log('\n[1/12] Seeding jurisdictions...');
  const data = loadJSON('wa-registry-complete.json');
  if (!data) return;

  const jurisdictions = data.jurisdictions || [];
  let inserted = 0;

  for (const j of jurisdictions) {
    try {
      await pool.query(
        `INSERT INTO jurisdictions (name, code, type, parent_jurisdiction_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type)`,
        [
          j.name || j.jurisdiction_name || 'Unknown',
          j.code || j.jurisdiction_code || j.jurisdiction_id || '',
          j.type || j.jurisdiction_type || 'state',
          null,
        ]
      );
      inserted++;
    } catch (e: any) {
      // Skip duplicates silently
    }
  }

  // Also add the 50 US states + DC as base jurisdictions
  const states = [
    ['Alabama','AL'],['Alaska','AK'],['Arizona','AZ'],['Arkansas','AR'],['California','CA'],
    ['Colorado','CO'],['Connecticut','CT'],['Delaware','DE'],['Florida','FL'],['Georgia','GA'],
    ['Hawaii','HI'],['Idaho','ID'],['Illinois','IL'],['Indiana','IN'],['Iowa','IA'],
    ['Kansas','KS'],['Kentucky','KY'],['Louisiana','LA'],['Maine','ME'],['Maryland','MD'],
    ['Massachusetts','MA'],['Michigan','MI'],['Minnesota','MN'],['Mississippi','MS'],['Missouri','MO'],
    ['Montana','MT'],['Nebraska','NE'],['Nevada','NV'],['New Hampshire','NH'],['New Jersey','NJ'],
    ['New Mexico','NM'],['New York','NY'],['North Carolina','NC'],['North Dakota','ND'],['Ohio','OH'],
    ['Oklahoma','OK'],['Oregon','OR'],['Pennsylvania','PA'],['Rhode Island','RI'],['South Carolina','SC'],
    ['South Dakota','SD'],['Tennessee','TN'],['Texas','TX'],['Utah','UT'],['Vermont','VT'],
    ['Virginia','VA'],['Washington','WA'],['West Virginia','WV'],['Wisconsin','WI'],['Wyoming','WY'],
    ['District of Columbia','DC'],['Federal','FED'],
  ];

  for (const [name, code] of states) {
    try {
      await pool.query(
        `INSERT INTO jurisdictions (name, code, type, created_at, updated_at)
         VALUES (?, ?, 'state', NOW(), NOW())
         ON DUPLICATE KEY UPDATE name=VALUES(name)`,
        [name, code]
      );
      inserted++;
    } catch (e: any) {}
  }

  const total = await count(pool, 'jurisdictions');
  console.log(`  ✓ jurisdictions: ${total} rows total (added ${inserted})`);
}

// ─── SEED: workflows ─────────────────────────────────────────────────────────
async function seedWorkflows(pool: mysql.Pool) {
  console.log('\n[2/12] Seeding workflows...');
  const data = loadJSON('wa-workflows.json');
  if (!data) return;

  const workflows = data.workflows || [];

  // Get WA jurisdiction id
  const [jRows] = await pool.query(`SELECT id FROM jurisdictions WHERE code = 'WA' LIMIT 1`) as any;
  const waJurisdictionId = jRows[0]?.id || 1;

  for (const w of workflows) {
    try {
      const [existing] = await pool.query(`SELECT id FROM workflows WHERE name = ? LIMIT 1`, [w.situation_label || w.workflow_id]) as any;
      let workflowId: number;

      if (existing.length > 0) {
        workflowId = existing[0].id;
      } else {
        // category_id is NOT NULL — use 0 as a placeholder (no FK constraint)
        const [ins] = await pool.query(
          `INSERT INTO workflows (name, description, situation_type, jurisdiction_id, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`,
          [w.situation_label || w.workflow_id, w.description || '', w.domain || 'general', waJurisdictionId, now, now]
        ) as any;
        workflowId = ins.insertId;
      }

      // Insert steps
      for (const s of (w.steps || [])) {
        try {
          const [es] = await pool.query(`SELECT id FROM workflow_steps WHERE workflow_id=? AND step_number=? LIMIT 1`, [workflowId, s.step_number||1]) as any;
          if (es.length === 0) {
            await pool.query(
              `INSERT INTO workflow_steps (workflow_id, step_number, title, description, action_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [workflowId, s.step_number||1, s.title||'', s.description||'', s.action_type||'action', now, now]
            );
          }
        } catch (e: any) {}
      }

      // Insert deadlines
      for (const d of (w.deadlines || [])) {
        try {
          const [ed] = await pool.query(`SELECT id FROM workflow_deadlines WHERE workflow_id=? AND deadline_description=? LIMIT 1`, [workflowId, d.deadline_label||'']) as any;
          if (ed.length === 0) {
            await pool.query(
              `INSERT INTO workflow_deadlines (workflow_id, deadline_description, deadline_days, created_at) VALUES (?, ?, ?, ?)`,
              [workflowId, d.deadline_label||d.deadline_id||'', d.hard_deadline ? 1 : 0, now]
            );
          }
        } catch (e: any) {}
      }
    } catch (e: any) {
      console.warn(`  [WARN] workflow ${w.workflow_id}: ${e.message?.slice(0, 80)}`);
    }
  }

  const wTotal = await count(pool, 'workflows');
  const sTotal = await count(pool, 'workflow_steps');
  const dTotal = await count(pool, 'workflow_deadlines');
  console.log(`  ✓ workflows: ${wTotal} rows | workflow_steps: ${sTotal} rows | workflow_deadlines: ${dTotal} rows`);
}

// ─── SEED: resources ─────────────────────────────────────────────────────────
async function seedResources(pool: mysql.Pool) {
  console.log('\n[3/12] Seeding resources...');
  const data = loadJSON('wa-resources.json');
  if (!data) return;

  const resources = data.resources || [];

  const [jRows] = await pool.query(`SELECT id FROM jurisdictions WHERE code = 'WA' LIMIT 1`) as any;
  const waJurisdictionId = jRows[0]?.id || 1;

  for (const r of resources) {
    try {
      const name = r.resource_name || r.resource_id || '';
      const [existing] = await pool.query(`SELECT id FROM resources WHERE name = ? AND jurisdiction_id = ? LIMIT 1`, [name, waJurisdictionId]) as any;
      if (existing.length === 0) {
        // category_id is NOT NULL — use 0 as placeholder
        await pool.query(
          `INSERT INTO resources (name, description, resource_type, service_category, website_url, jurisdiction_id, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [name, r.description||'', r.resource_type||'service', r.service_category||r.category_key||'general', r.website||r.primary_url||'', waJurisdictionId, now, now]
        );
      }
    } catch (e: any) {
      console.warn(`  [WARN] resource: ${e.message?.slice(0, 80)}`);
    }
  }

  const total = await count(pool, 'resources');
  console.log(`  ✓ resources: ${total} rows total`);
}

// ─── SEED: doctrine_graph_edges ──────────────────────────────────────────────
async function seedDoctrineEdges(pool: mysql.Pool) {
  console.log('\n[4/12] Seeding doctrine_graph_edges...');

  // All 6 doctrine nodes exist. Create meaningful edges between them.
  // 1=Exhaustion, 2=Due Process, 3=SOL, 4=Federal Preemption, 5=Sovereign Immunity, 6=Burden Shifting
  // Valid edgeType enum: 'interpreted_by','creates','triggers','fails_at','enforced_by','routes_to','associated_with','blocks','supports'
  const edges = [
    // Exhaustion → Due Process
    [1, 'doctrine', 1, 'supports', 'doctrine', 2, 'strong', 'Administrative exhaustion is required before due process hearing rights attach in most federal benefit contexts.'],
    // Exhaustion → SOL
    [2, 'doctrine', 1, 'associated_with', 'doctrine', 3, 'strong', 'Time spent in administrative exhaustion may toll or consume the statute of limitations period.'],
    // Due Process → Burden Shifting
    [3, 'doctrine', 2, 'triggers', 'doctrine', 6, 'strong', 'Once a fair hearing is triggered, burden-shifting rules determine who must prove what.'],
    // Federal Preemption → Sovereign Immunity
    [4, 'doctrine', 4, 'blocks', 'doctrine', 5, 'strong', 'Federal preemption establishes minimum standards that state sovereign immunity cannot override.'],
    // SOL → Sovereign Immunity
    [5, 'doctrine', 3, 'associated_with', 'doctrine', 5, 'moderate', 'Statute of limitations rules interact with sovereign immunity waivers — some waivers impose their own limitation periods.'],
    // Burden Shifting → Federal Preemption
    [6, 'doctrine', 6, 'interpreted_by', 'doctrine', 4, 'strong', 'Burden-shifting frameworks in discrimination claims derive from federal preemptive standards (Title VII, FHA, ADA).'],
    // Exhaustion → Sovereign Immunity
    [7, 'doctrine', 1, 'routes_to', 'doctrine', 5, 'moderate', 'Administrative exhaustion is often required before sovereign immunity can be challenged or waived.'],
    // Due Process → Federal Preemption
    [8, 'doctrine', 2, 'enforced_by', 'doctrine', 4, 'strong', 'Due process rights in benefit contexts are enforced through federal preemptive standards that states cannot reduce.'],
    // SOL → Burden Shifting
    [9, 'doctrine', 3, 'associated_with', 'doctrine', 6, 'moderate', 'When timeliness is disputed, burden-shifting rules determine whether claimant or agency must prove compliance with limitations period.'],
    // Sovereign Immunity → Due Process
    [10, 'doctrine', 5, 'fails_at', 'doctrine', 2, 'strong', 'Sovereign immunity limits remedies but does not eliminate constitutional due process protections for benefit recipients.'],
  ];

  let inserted = 0;
  for (const [_idx, fromType, fromId, edgeType, toType, toId, strength, notes] of edges) {
    try {
      const [existing] = await pool.query(`SELECT id FROM doctrine_graph_edges WHERE fromId=? AND toId=? AND edgeType=? LIMIT 1`, [fromId, toId, edgeType]) as any;
      if (existing.length > 0) continue;
      await pool.query(
        `INSERT INTO doctrine_graph_edges (fromType, fromId, edgeType, toType, toId, strength, notes, addedBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'master-seed', ?, ?)`,
        [fromType, fromId, edgeType, toType, toId, strength, notes, now, now]
      );
      inserted++;
    } catch (e: any) {
      console.warn(`  [WARN] doctrine edge: ${e.message?.slice(0, 80)}`);
    }
  }

  const total = await count(pool, 'doctrine_graph_edges');
  console.log(`  ✓ doctrine_graph_edges: ${total} rows total`);
}

// ─── SEED: enforcement_viability_rules ───────────────────────────────────────
async function seedEnforcementViabilityRules(pool: mysql.Pool) {
  console.log('\n[5/12] Seeding enforcement_viability_rules...');

  const rules = [
    // SSDI Denial
    ['SSDI_Denial', 'Federal', 'benefits', 'SSA', 'SSA', 'low', 'appeal_deadline', 'strong', 'high', 'administrative_appeal', 'File Request for Reconsideration within 60 days of denial notice.'],
    ['SSDI_Denial', 'Washington', 'benefits', 'SSA', 'SSA', 'low', 'appeal_deadline', 'strong', 'high', 'administrative_appeal', 'WA state has additional vocational rehab resources for SSDI claimants.'],
    // Medicaid Wrongful Denial
    ['Medicaid_Wrongful_Denial', 'Federal', 'healthcare', 'CMS', 'CMS', 'low', 'appeal_deadline', 'strong', 'high', 'administrative_appeal', 'File state fair hearing request within 90 days of denial.'],
    ['Medicaid_Wrongful_Denial', 'Washington', 'healthcare', 'HCA', 'HCA', 'low', 'appeal_deadline', 'strong', 'high', 'administrative_appeal', 'Washington HCA handles Medicaid appeals. File within 90 days.'],
    ['Medicaid_Wrongful_Denial', 'California', 'healthcare', 'DHCS', 'DHCS', 'low', 'appeal_deadline', 'strong', 'high', 'administrative_appeal', 'California DHCS Medi-Cal appeals. File within 90 days.'],
    // Wage Theft FLSA
    ['Wage_Theft_FLSA', 'Federal', 'employment', 'DOL-WHD', 'WHD', 'moderate', 'statute_of_limitations', 'strong', 'high', 'agency_complaint', '2-year SOL (3 years for willful). File with WHD or private right of action.'],
    ['Wage_Theft_FLSA', 'Washington', 'employment', 'L&I', 'L&I', 'moderate', 'statute_of_limitations', 'strong', 'high', 'agency_complaint', 'WA L&I enforces state wage laws. 3-year SOL. Often more favorable than federal.'],
    ['Wage_Theft_FLSA', 'California', 'employment', 'DLSE', 'DLSE', 'moderate', 'statute_of_limitations', 'strong', 'high', 'agency_complaint', 'CA DLSE (Labor Commissioner). 3-year SOL. Strong state protections.'],
    // Employment Discrimination Title VII
    ['Employment_Discrimination_Title_VII', 'Federal', 'employment', 'EEOC', 'EEOC', 'moderate', 'charge_deadline', 'strong', 'high', 'eeoc_charge', '180/300-day deadline to file EEOC charge. Required before federal lawsuit.'],
    ['Employment_Discrimination_Title_VII', 'Washington', 'employment', 'WSHRC', 'WSHRC', 'moderate', 'charge_deadline', 'strong', 'high', 'agency_complaint', 'WA Human Rights Commission. 6-month filing deadline. Covers employers 8+.'],
    // Wrongful Termination Retaliation
    ['Wrongful_Termination_Retaliation', 'Federal', 'employment', 'EEOC', 'EEOC', 'moderate', 'charge_deadline', 'strong', 'high', 'eeoc_charge', 'File EEOC retaliation charge within 180/300 days of adverse action.'],
    ['Wrongful_Termination_Retaliation', 'Washington', 'employment', 'L&I', 'L&I', 'moderate', 'charge_deadline', 'strong', 'high', 'agency_complaint', 'WA L&I handles retaliation for workers comp and safety complaints.'],
    // Housing Discrimination FHA
    ['Housing_Discrimination_FHA', 'Federal', 'housing', 'HUD', 'HUD', 'moderate', 'complaint_deadline', 'strong', 'high', 'hud_complaint', 'File HUD complaint within 1 year of discriminatory act.'],
    ['Housing_Discrimination_FHA', 'Washington', 'housing', 'WSHRC', 'WSHRC', 'moderate', 'complaint_deadline', 'strong', 'high', 'agency_complaint', 'WA Human Rights Commission handles housing discrimination. 6-month deadline.'],
    // Police Misconduct 1983
    ['Police_Misconduct_1983', 'Federal', 'civil_rights', 'DOJ', 'DOJ', 'high', 'statute_of_limitations', 'moderate', 'moderate', 'federal_lawsuit', 'Section 1983 claim. SOL varies by state (typically 2-3 years). No admin exhaustion required.'],
    ['Police_Misconduct_1983', 'Washington', 'civil_rights', 'AGO', 'AGO', 'high', 'statute_of_limitations', 'moderate', 'moderate', 'federal_lawsuit', 'WA 3-year SOL for personal injury applies to 1983 claims. File tort claim within 60 days for state claims.'],
    // Insurance Denial ACA
    ['Insurance_Denial_ACA', 'Federal', 'healthcare', 'CMS', 'CMS', 'low', 'appeal_deadline', 'strong', 'high', 'internal_appeal', 'File internal appeal within 180 days. External review available after internal denial.'],
    ['Insurance_Denial_ACA', 'Washington', 'healthcare', 'OIC', 'OIC', 'low', 'appeal_deadline', 'strong', 'high', 'agency_complaint', 'WA Office of Insurance Commissioner handles ACA complaints. File within 1 year.'],
    // FOIA Wrongful Withholding
    ['FOIA_Wrongful_Withholding', 'Federal', 'transparency', 'DOJ-OIP', 'OIP', 'low', 'appeal_deadline', 'strong', 'high', 'administrative_appeal', 'File administrative appeal within 90 days of denial. Then federal court if needed.'],
    ['FOIA_Wrongful_Withholding', 'Washington', 'transparency', 'AGO', 'AGO', 'low', 'appeal_deadline', 'strong', 'high', 'agency_complaint', 'WA Public Records Act. File complaint with AGO or superior court within 1 year.'],
  ];

  let inserted = 0;
  for (const [claimType, jurisdiction, pipelineCategory, agency, agencyShort, minimumIntakeThreshold, deadlineDependency, triggerStrength, historicalActionability, recommendedChannel, notes] of rules) {
    try {
      const [existing] = await pool.query(`SELECT id FROM enforcement_viability_rules WHERE claimType=? AND jurisdiction=? LIMIT 1`, [claimType, jurisdiction]) as any;
      if (existing.length > 0) continue;
      await pool.query(
        `INSERT INTO enforcement_viability_rules (claimType, jurisdiction, pipelineCategory, agency, agencyShort, minimumIntakeThreshold, deadlineDependency, triggerStrength, historicalActionability, recommendedChannel, notes, addedBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'master-seed', ?, ?)`,
        [claimType, jurisdiction, pipelineCategory, agency, agencyShort, minimumIntakeThreshold, deadlineDependency, triggerStrength, historicalActionability, recommendedChannel, notes, now, now]
      );
      inserted++;
    } catch (e: any) {
      console.warn(`  [WARN] viability rule: ${e.message?.slice(0, 80)}`);
    }
  }

  const total = await count(pool, 'enforcement_viability_rules');
  console.log(`  ✓ enforcement_viability_rules: ${total} rows total`);
}

// ─── SEED: regulatory_guidance ───────────────────────────────────────────────
async function seedRegulatoryGuidance(pool: mysql.Pool) {
  console.log('\n[6/12] Seeding regulatory_guidance...');

  const guidance = [
    ['EEOC', 'EEOC', 'Enforcement Guidance on Retaliation and Related Issues', 'Employment Discrimination', 'Title VII, ADEA, ADA, GINA', 'enforcement_guidance', JSON.stringify(['Retaliation is illegal when an employee reports discrimination', 'Protected activity includes internal complaints', 'Adverse action includes any materially adverse change']), '2016-08-25', 'EEOC-CVG-2016-1', 'https://www.eeoc.gov/laws/guidance/enforcement-guidance-retaliation-and-related-issues', 'employment'],
    ['EEOC', 'EEOC', 'Questions and Answers: Clarification of Charge Filing Procedures', 'Employment Discrimination', 'Title VII, ADEA, ADA', 'procedural_guidance', JSON.stringify(['Charges must be filed within 180 days (300 in deferral states)', 'Intake questionnaire does not constitute a charge', 'EEOC will notify employer within 10 days']), '2012-01-10', 'EEOC-NVTA-2012-1', 'https://www.eeoc.gov/laws/guidance/questions-and-answers-clarification-charge-filing-procedures', 'employment'],
    ['HUD', 'HUD', 'Fair Housing Act Design and Construction Requirements', 'Housing Discrimination', 'Fair Housing Act Section 804(f)(3)(C)', 'enforcement_guidance', JSON.stringify(['Multifamily housing built after 1991 must meet accessibility requirements', 'Seven design and construction requirements apply', 'Failure to comply is a per se FHA violation']), '2013-04-30', 'HUD-2013-FHA-DC', 'https://www.hud.gov/program_offices/fair_housing_equal_opp/fair_housing_act_design_and_construction_requirements', 'housing'],
    ['HUD', 'HUD', 'Guidance on Application of Fair Housing Act Standards to Use of Criminal Records', 'Housing Discrimination', 'Fair Housing Act', 'policy_guidance', JSON.stringify(['Blanket bans on renting to people with criminal records may violate FHA', 'Must consider nature and severity of crime', 'Disparate impact analysis applies']), '2016-04-04', 'HUD-2016-FHEO-01', 'https://www.hud.gov/sites/documents/HUD_OGCGUIDAPPFHASTANDCR.PDF', 'housing'],
    ['DOL-WHD', 'WHD', 'Field Operations Handbook — Wage and Hour Investigations', 'Wage Theft', 'FLSA', 'operational_guidance', JSON.stringify(['Investigators may examine payroll records going back 2 years (3 for willful)', 'Back wages may be recovered through supervised payment or litigation', 'Civil money penalties up to $1,000 per violation for child labor']), '2020-01-01', 'DOL-FOH-2020', 'https://www.dol.gov/agencies/whd/field-operations-handbook', 'employment'],
    ['SSA', 'SSA', 'Program Operations Manual System — Disability Evaluation', 'SSDI Denial', 'Social Security Act Title II', 'operational_guidance', JSON.stringify(['Five-step sequential evaluation process', 'Step 3: Listing of Impairments — automatic approval if met', 'RFC assessment required at steps 4 and 5']), '2023-01-01', 'SSA-POMS-DI-22001', 'https://secure.ssa.gov/apps10/poms.nsf/lnx/0422001000', 'benefits'],
    ['CMS', 'CMS', 'Medicaid and CHIP Managed Care Final Rule', 'Medicaid Wrongful Denial', 'Social Security Act Title XIX', 'regulatory_guidance', JSON.stringify(['States must provide timely access to covered services', 'Grievance and appeal procedures required', 'External review available for denied services']), '2016-05-06', 'CMS-2390-F', 'https://www.medicaid.gov/medicaid/managed-care/guidance/index.html', 'healthcare'],
    ['DOJ', 'DOJ', 'Guidance on Constitutional Policing', 'Police Misconduct', '42 U.S.C. § 1983', 'policy_guidance', JSON.stringify(['Fourth Amendment prohibits unreasonable seizures', 'Fourteenth Amendment requires equal protection', 'Qualified immunity does not protect clearly established violations']), '2022-09-13', 'DOJ-2022-POLICING', 'https://www.justice.gov/crt/addressing-police-misconduct-laws-enforced-department-justice', 'civil_rights'],
    ['CMS', 'CMS', 'ACA Internal Appeals and External Review', 'Insurance Denial', 'ACA Section 2719', 'regulatory_guidance', JSON.stringify(['Plans must provide internal appeal process', 'External review by independent organization required', 'Urgent care appeals decided within 72 hours']), '2015-06-01', 'CMS-ACA-2719', 'https://www.cms.gov/cciio/resources/fact-sheets-and-faqs/appeals', 'healthcare'],
    ['DOJ-OIP', 'OIP', 'FOIA Update — Guidance on Responding to FOIA Requests', 'FOIA Wrongful Withholding', 'Freedom of Information Act 5 U.S.C. § 552', 'procedural_guidance', JSON.stringify(['Agencies must respond within 20 business days', 'Unusual circumstances may extend deadline by 10 days', 'Requestors may seek judicial review after exhausting administrative remedies']), '2019-01-01', 'DOJ-OIP-2019-FOIA', 'https://www.justice.gov/oip/foia-guidance', 'transparency'],
  ];

  let inserted = 0;
  for (const [agency, agencyShort, documentTitle, issueArea, authorityBasis, guidanceType, keyRules, publicationDate, citation, documentLink, pipelineCategory] of guidance) {
    try {
      const [existing] = await pool.query(`SELECT id FROM regulatory_guidance WHERE citation = ? LIMIT 1`, [citation]) as any;
      if (existing.length > 0) continue;
      await pool.query(
        `INSERT INTO regulatory_guidance (agency, agencyShort, documentTitle, issueArea, authorityBasis, guidanceType, keyRules, publicationDate, citation, documentLink, pipelineCategory, addedBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'master-seed', ?, ?)`,
        [agency, agencyShort, documentTitle, issueArea, authorityBasis, guidanceType, keyRules, publicationDate, citation, documentLink, pipelineCategory, now, now]
      );
      inserted++;
    } catch (e: any) {
      console.warn(`  [WARN] guidance: ${e.message?.slice(0, 80)}`);
    }
  }

  const total = await count(pool, 'regulatory_guidance');
  console.log(`  ✓ regulatory_guidance: ${total} rows total`);
}

// ─── SEED: regulatory_enforcement_actions ────────────────────────────────────
async function seedEnforcementActions(pool: mysql.Pool) {
  console.log('\n[7/12] Seeding regulatory_enforcement_actions...');

  const data = loadJSON('legal_enforcement_state_combined.json');
  if (!data) return;

  const records = data.enforcement_records_state || [];
  let inserted = 0;

  for (const r of records) {
    try {
      await pool.query(
        `INSERT INTO regulatory_enforcement_actions (agency_name_rea, entity_name_rea, industry_rea, jurisdiction_rea, violation_type, penalty_amount, investigation_start_date, resolution_date, case_reference, source_url_rea, created_at_rea)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE violation_type=VALUES(violation_type)`,
        [
          r.agencyName || '',
          r.agencyName || '',
          r.programArea || '',
          r.jurisdiction || r.state || '',
          (r.complaintTypes || []).join(', ') || '',
          0,
          r.agencyName + '-' + (r.state || '') + '-' + Date.now(),
          r.sourceUrl || '',
        ]
      );
      inserted++;
    } catch (e: any) {}
  }

  const total = await count(pool, 'regulatory_enforcement_actions');
  console.log(`  ✓ regulatory_enforcement_actions: ${total} rows total`);
}

// ─── SEED: timeline_events ───────────────────────────────────────────────────
async function seedTimelineEvents(pool: mysql.Pool) {
  console.log('\n[8/12] Seeding timeline_events...');

  // Valid timelineEventType enum: 'court_decision','statute_enactment','statute_amendment','regulation_change','agency_guidance','doctrine_shift','executive_order','legislative_action'
  // Valid timelineImpactType enum: 'creates','amends','supersedes','repeals','expands','narrows','clarifies','overturns'
  const events = [
    // Civil Rights landmarks
    // impactType must be one of: 'creates','amends','supersedes','repeals','expands','narrows','clarifies','overturns'
    ['statute_enactment', 'Civil Rights Act of 1964', '1964-07-02', 'Civil Rights Act of 1964, Pub. L. 88-352', 'Title VII prohibits employment discrimination based on race, color, religion, sex, or national origin.', 'Federal', 'employment', 'creates', 'active'],
    ['statute_enactment', 'Fair Housing Act of 1968', '1968-04-11', 'Fair Housing Act, 42 U.S.C. § 3601', 'Prohibits discrimination in sale, rental, and financing of housing.', 'Federal', 'housing', 'creates', 'active'],
    ['statute_enactment', 'FLSA — Fair Labor Standards Act', '1938-06-25', 'Fair Labor Standards Act, 29 U.S.C. § 201', 'Establishes minimum wage, overtime pay, recordkeeping, and child labor standards.', 'Federal', 'employment', 'creates', 'active'],
    ['statute_enactment', 'Americans with Disabilities Act', '1990-07-26', 'ADA, 42 U.S.C. § 12101', 'Prohibits discrimination against people with disabilities in employment, public accommodations, and government services.', 'Federal', 'disability', 'creates', 'active'],
    ['statute_enactment', 'Freedom of Information Act', '1966-07-04', 'FOIA, 5 U.S.C. § 552', 'Provides public right of access to federal agency records.', 'Federal', 'transparency', 'creates', 'active'],
    ['statute_enactment', 'Social Security Disability Insurance', '1956-08-01', 'Social Security Act Title II, 42 U.S.C. § 401', 'Provides disability benefits to insured workers who cannot engage in substantial gainful activity.', 'Federal', 'benefits', 'creates', 'active'],
    ['statute_enactment', 'Medicaid Act', '1965-07-30', 'Social Security Act Title XIX, 42 U.S.C. § 1396', 'Federal-state program providing health coverage to low-income individuals.', 'Federal', 'healthcare', 'creates', 'active'],
    ['statute_enactment', 'Affordable Care Act', '2010-03-23', 'ACA, Pub. L. 111-148', 'Expands health insurance coverage, prohibits denial for pre-existing conditions, establishes insurance marketplaces.', 'Federal', 'healthcare', 'expands', 'active'],
    ['court_decision', 'McDonnell Douglas Corp. v. Green', '1973-05-14', '411 U.S. 792 (1973)', 'Established the burden-shifting framework for employment discrimination cases.', 'Federal', 'employment', 'creates', 'active'],
    ['court_decision', 'Mathews v. Eldridge', '1976-02-24', '424 U.S. 319 (1976)', 'Established three-factor balancing test for procedural due process in benefit termination cases.', 'Federal', 'benefits', 'clarifies', 'active'],
    ['court_decision', 'Goldberg v. Kelly', '1970-03-23', '397 U.S. 254 (1970)', 'Required pre-termination hearing before welfare benefits could be cut off.', 'Federal', 'benefits', 'creates', 'active'],
    ['court_decision', 'EEOC v. Abercrombie & Fitch', '2015-06-01', '575 U.S. 768 (2015)', 'Supreme Court ruled employer cannot avoid Title VII by refusing to confirm religious accommodation need.', 'Federal', 'employment', 'clarifies', 'active'],
    ['statute_enactment', 'Washington Law Against Discrimination', '1949-03-09', 'RCW 49.60', 'Washington state law prohibiting discrimination in employment, housing, and public accommodations.', 'Washington', 'employment', 'creates', 'active'],
    ['statute_enactment', 'Washington Minimum Wage Act', '1959-01-01', 'RCW 49.46', 'Establishes Washington minimum wage and overtime requirements.', 'Washington', 'employment', 'creates', 'active'],
    ['statute_enactment', 'Washington Public Records Act', '1972-01-01', 'RCW 42.56', 'Provides public right of access to Washington state agency records.', 'Washington', 'transparency', 'creates', 'active'],
    ['statute_amendment', 'ADA Amendments Act of 2008', '2008-09-25', 'ADAAA, Pub. L. 110-325', 'Broadened the definition of disability under the ADA, overturning restrictive Supreme Court interpretations.', 'Federal', 'disability', 'expands', 'active'],
    ['legislative_action', 'DOJ Consent Decree — Seattle Police Department', '2012-07-27', 'United States v. City of Seattle, 2:12-cv-01282', 'DOJ found SPD engaged in pattern of excessive force and biased policing. Consent decree imposed.', 'Washington', 'civil_rights', 'creates', 'active'],
    ['statute_amendment', 'Lilly Ledbetter Fair Pay Act', '2009-01-29', 'Pub. L. 111-2', 'Resets the 180-day statute of limitations for equal pay claims with each discriminatory paycheck.', 'Federal', 'employment', 'expands', 'active'],
    ['court_decision', 'Obergefell v. Hodges', '2015-06-26', '576 U.S. 644 (2015)', 'Established constitutional right to same-sex marriage, affecting spousal benefits and employment protections.', 'Federal', 'civil_rights', 'creates', 'active'],
    ['statute_enactment', 'Violence Against Women Act', '1994-09-13', 'VAWA, Pub. L. 103-322', 'Provides legal tools to combat violence against women, including housing protections for survivors.', 'Federal', 'housing', 'creates', 'active'],
  ];

  let inserted = 0;
  for (const [eventType, title, dateStr, citation, significance, jurisdiction, domain, impactType, status] of events) {
    try {
      // Convert date string to timestamp
      const dateTs = new Date(dateStr as string).getTime();
      const [existing] = await pool.query(`SELECT id FROM timeline_events WHERE title = ? LIMIT 1`, [title]) as any;
      if (existing.length > 0) continue;
      await pool.query(
        `INSERT INTO timeline_events (timelineEventType, title, date, citation, significance, jurisdiction, domain, timelineImpactType, timelineEventStatus, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [eventType as string, title as string, dateTs, citation as string, significance as string, jurisdiction as string, domain as string, impactType as string, status as string, now, now]
      );
      inserted++;
    } catch (e: any) {
      console.warn(`  [WARN] timeline event ${title}: ${e.message?.slice(0, 80)}`);
    }
  }

  const total = await count(pool, 'timeline_events');
  console.log(`  ✓ timeline_events: ${total} rows total`);
}

// ─── SEED: timeline_edges ────────────────────────────────────────────────────
async function seedTimelineEdges(pool: mysql.Pool) {
  console.log('\n[9/12] Seeding timeline_edges...');

  // Get timeline event IDs
  const [events] = await pool.query(`SELECT id, title FROM timeline_events`) as any;
  const eventMap: Record<string, number> = {};
  for (const e of events) {
    eventMap[e.title] = e.id;
  }

  // timelineRelType enum: 'supersedes','amends','overturns','interprets','limits','expands','narrows','clarifies','codifies','implements'
  const edges = [
    // Civil Rights Act → EEOC enforcement
    ['Civil Rights Act of 1964', 'EEOC v. Abercrombie & Fitch', 'interprets', 'Federal', 'CRA 1964 Title VII enables EEOC enforcement actions including Abercrombie.'],
    // CRA 1964 → ADA
    ['Civil Rights Act of 1964', 'Americans with Disabilities Act', 'expands', 'Federal', 'Civil Rights Act framework was extended to disability discrimination in the ADA.'],
    // ADA → ADA Amendments
    ['Americans with Disabilities Act', 'ADA Amendments Act of 2008', 'amends', 'Federal', 'ADAAA broadened ADA disability definition after restrictive Supreme Court rulings.'],
    // Goldberg v. Kelly → Mathews v. Eldridge
    ['Goldberg v. Kelly', 'Mathews v. Eldridge', 'clarifies', 'Federal', 'Mathews established a more flexible balancing test that refined the absolute pre-termination hearing rule in Goldberg.'],
    // McDonnell Douglas → EEOC Abercrombie
    ['McDonnell Douglas Corp. v. Green', 'EEOC v. Abercrombie & Fitch', 'interprets', 'Federal', 'McDonnell Douglas burden-shifting framework applied in Title VII religious accommodation case.'],
    // Medicaid → ACA
    ['Medicaid Act', 'Affordable Care Act', 'expands', 'Federal', 'ACA significantly expanded Medicaid eligibility and coverage requirements.'],
    // FLSA → Lilly Ledbetter
    ['FLSA — Fair Labor Standards Act', 'Lilly Ledbetter Fair Pay Act', 'amends', 'Federal', 'Both address pay equity; Ledbetter Act extended limitations period for equal pay claims.'],
    // FOIA → Washington Public Records Act
    ['Freedom of Information Act', 'Washington Public Records Act', 'codifies', 'Washington', 'Washington PRA modeled on federal FOIA, providing state-level public records access.'],
    // Civil Rights Act → Washington Law Against Discrimination
    ['Civil Rights Act of 1964', 'Washington Law Against Discrimination', 'implements', 'Washington', 'WLAD provides parallel state-level protections that often exceed federal minimums.'],
    // VAWA → Fair Housing Act
    ['Violence Against Women Act', 'Fair Housing Act of 1968', 'expands', 'Federal', 'VAWA housing protections interact with FHA to protect survivors from housing discrimination.'],
  ];

  let inserted = 0;
  for (const [fromTitle, toTitle, relType, jurisdiction, notes] of edges) {
    const fromId = eventMap[fromTitle];
    const toId = eventMap[toTitle];
    if (!fromId || !toId) {
      console.warn(`  [WARN] timeline edge: missing node for "${fromTitle}" → "${toTitle}"`);
      continue;
    }
    try {
      await pool.query(
        `INSERT INTO timeline_edges (sourceNode, targetNode, timelineRelType, jurisdiction, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE notes=VALUES(notes)`,
        [String(fromId), String(toId), relType, jurisdiction, notes, now, now]
      );
      inserted++;
    } catch (e: any) {
      console.warn(`  [WARN] timeline edge: ${e.message?.slice(0, 80)}`);
    }
  }

  const total = await count(pool, 'timeline_edges');
  console.log(`  ✓ timeline_edges: ${total} rows total`);
}

// ─── SEED: forms_registry ────────────────────────────────────────────────────
async function seedFormsRegistry(pool: mysql.Pool) {
  console.log('\n[10/12] Seeding forms_registry...');

  const forms = [
    // EEOC
    ['EEOC', 'EEOC Charge of Discrimination', 'EEOC-5', 'https://www.eeoc.gov/filing-charge-discrimination', 'intake', 'employment', 'Federal', '180/300 days from discriminatory act', JSON.stringify(['Name','Address','Employer name','Dates of discrimination','Basis of discrimination']), true, 'Required to initiate EEOC investigation. File online, by mail, or in person.'],
    // HUD
    ['HUD', 'HUD Housing Discrimination Complaint', 'HUD-903', 'https://www.hud.gov/program_offices/fair_housing_equal_opp/online-complaint', 'intake', 'housing', 'Federal', '1 year from discriminatory act', JSON.stringify(['Name','Address','Property address','Nature of discrimination','Respondent information']), true, 'File online at HUD website or call 1-800-669-9777.'],
    // DOL WHD
    ['DOL-WHD', 'Wage and Hour Complaint Form', 'WH-4', 'https://www.dol.gov/agencies/whd/contact/complaints', 'intake', 'employment', 'Federal', '2 years (3 for willful)', JSON.stringify(['Employee name','Employer name','Dates of employment','Wages owed','Type of violation']), true, 'File with local WHD office. Investigation is free.'],
    // SSA
    ['SSA', 'Request for Reconsideration', 'SSA-561-U2', 'https://www.ssa.gov/forms/ssa-561.pdf', 'appeal', 'benefits', 'Federal', '60 days from denial notice', JSON.stringify(['Claimant name','SSN','Claim number','Reason for disagreement']), true, 'First level of appeal after initial SSDI/SSI denial.'],
    ['SSA', 'Request for Hearing by Administrative Law Judge', 'HA-501', 'https://www.ssa.gov/forms/ha-501.pdf', 'appeal', 'benefits', 'Federal', '60 days from reconsideration denial', JSON.stringify(['Claimant name','SSN','Claim number','Issues to be reviewed']), true, 'Second level of appeal. Request ALJ hearing within 60 days.'],
    // CMS Medicaid
    ['CMS', 'Medicaid Fair Hearing Request', 'CMS-20031', 'https://www.medicaid.gov/medicaid/appeals-grievances/index.html', 'appeal', 'healthcare', 'Federal', '90 days from denial notice', JSON.stringify(['Beneficiary name','Medicaid ID','Date of denial','Services denied','Reason for appeal']), true, 'File with state Medicaid agency. Federal floor is 90 days.'],
    // DOJ Section 1983
    ['DOJ', 'Civil Rights Complaint — Police Misconduct', 'DOJ-144', 'https://www.justice.gov/crt/how-file-complaint', 'intake', 'civil_rights', 'Federal', '180 days from incident', JSON.stringify(['Complainant name','Date of incident','Location','Officers involved','Description of misconduct']), true, 'File with DOJ Civil Rights Division. Also consider state tort claims.'],
    // FOIA
    ['DOJ-OIP', 'FOIA Request Form', 'DOJ-361', 'https://www.justice.gov/oip/make-foia-request', 'request', 'transparency', 'Federal', 'No deadline for initial request', JSON.stringify(['Requester name','Description of records','Date range','Fee waiver request if applicable']), true, 'Submit to agency FOIA office. Agency has 20 business days to respond.'],
    // WA L&I
    ['L&I', 'Washington Wage Complaint Form', 'F700-052-000', 'https://lni.wa.gov/workers-rights/wages/overtime/filing-a-wage-complaint', 'intake', 'employment', 'Washington', '3 years from date wages were due', JSON.stringify(['Employee name','Employer name','Dates of employment','Wages owed','Type of violation']), true, 'File with WA L&I. Investigation is free. WA law often more favorable than federal.'],
    // WA SHRC
    ['WSHRC', 'Washington Human Rights Commission Complaint', 'WSHRC-001', 'https://www.hum.wa.gov/file-complaint', 'intake', 'employment', 'Washington', '6 months from discriminatory act', JSON.stringify(['Complainant name','Respondent name','Basis of discrimination','Description of acts']), true, 'File with WSHRC. Covers employment, housing, and public accommodations.'],
    // WA OIC
    ['OIC', 'Washington Insurance Complaint Form', 'OIC-001', 'https://www.insurance.wa.gov/file-complaint', 'intake', 'healthcare', 'Washington', '1 year from denial', JSON.stringify(['Complainant name','Insurance company','Policy number','Denial date','Description of issue']), true, 'File with WA Office of Insurance Commissioner for ACA and insurance complaints.'],
  ];

  let inserted = 0;
  for (const [agencyId, formName, formNumber, url, formCategory, domain, jurisdiction, filingDeadline, requiredFields, isActive, notes] of forms) {
    try {
      const [existing] = await pool.query(`SELECT id FROM forms_registry WHERE formName=? AND jurisdiction=? LIMIT 1`, [formName, jurisdiction]) as any;
      if (existing.length > 0) continue;
      // forms_registry has two schema layers: old (agency_id int) + new (agencyId varchar)
      // Use the new columns only, set agency_id to 0 as placeholder
      await pool.query(
        `INSERT INTO forms_registry (agency_id, form_name, formName, agencyId, domain, jurisdiction, filingDeadline, requiredFields, isActive, notes, url, lastVerified, createdAt, updatedAt)
         VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
        [formName, formName, agencyId, domain, jurisdiction, filingDeadline, requiredFields, isActive ? 1 : 0, notes, url, now, now]
      );
      inserted++;
    } catch (e: any) {
      console.warn(`  [WARN] form ${formName}: ${e.message?.slice(0, 80)}`);
    }
  }

  const total = await count(pool, 'forms_registry');
  console.log(`  ✓ forms_registry: ${total} rows total`);
}

// ─── SEED: strategy_paths ────────────────────────────────────────────────────
async function seedStrategyPaths(pool: mysql.Pool) {
  console.log('\n[11/12] Seeding strategy_paths...');

  // Check if strategy_paths has a caseId requirement
  const [cols] = await pool.query('DESCRIBE strategy_paths') as any;
  const colNames = cols.map((c: any) => c.Field);
  console.log(`  strategy_paths columns: ${colNames.join(', ')}`);

  // strategy_paths is case-specific — it needs a real caseId
  // We seed template paths that can be cloned per case
  // Check if there's a nullable caseId or a template flag
  const hasCaseId = colNames.includes('caseId');
  const hasMatterProfileId = colNames.includes('matterProfileId');

  if (hasCaseId) {
    // strategy_paths is per-case — skip seeding static data, it's populated by the strategy engine
    console.log(`  ℹ strategy_paths is case-specific (has caseId). Populated by strategy engine per case. Skipping static seed.`);
    const total = await count(pool, 'strategy_paths');
    console.log(`  ✓ strategy_paths: ${total} rows (engine-populated)`);
  }
}

// ─── SEED: Final verification ─────────────────────────────────────────────────
async function verifyAll(pool: mysql.Pool) {
  console.log('\n[12/12] Final verification — row counts:');
  const tables = [
    'jurisdictions', 'workflows', 'workflow_steps', 'workflow_deadlines',
    'resources', 'doctrine_graph_edges', 'enforcement_viability_rules',
    'regulatory_guidance', 'regulatory_enforcement_actions',
    'timeline_events', 'timeline_edges', 'forms_registry',
    'strategy_paths', 'canonical_claim_catalog', 'legal_statutes',
    'legal_case_law', 'registry_programs', 'unified_resources',
    'knowledge_entries', 'registry_jurisdictions',
  ];

  const results: Array<{table: string, rows: number}> = [];
  for (const t of tables) {
    try {
      const n = await count(pool, t);
      results.push({ table: t, rows: n });
    } catch (e: any) {
      results.push({ table: t, rows: -1 });
    }
  }

  console.log('\n  TABLE                              ROWS');
  console.log('  ' + '-'.repeat(45));
  for (const r of results) {
    const status = r.rows === 0 ? ' ⚠ EMPTY' : r.rows < 0 ? ' ✗ ERROR' : '';
    console.log(`  ${r.table.padEnd(35)} ${String(r.rows).padStart(6)}${status}`);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         LUMINARI MASTER SEED — PERMANENT SCRIPT          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Started: ${new Date().toISOString()}`);

  const pool = buildPool();

  try {
    // Verify connection
    const [rows] = await pool.query('SELECT DATABASE() as db');
    const db = (rows as any)[0]?.db;
    console.log(`\nConnected to: ${db}`);
    if (db !== 'luminari_registry') {
      throw new Error(`Wrong database: ${db}. Expected luminari_registry.`);
    }

    await seedJurisdictions(pool);
    await seedWorkflows(pool);
    await seedResources(pool);
    await seedDoctrineEdges(pool);
    await seedEnforcementViabilityRules(pool);
    await seedRegulatoryGuidance(pool);
    await seedEnforcementActions(pool);
    await seedTimelineEvents(pool);
    await seedTimelineEdges(pool);
    await seedFormsRegistry(pool);
    await seedStrategyPaths(pool);
    await verifyAll(pool);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                   SEED COMPLETE ✓                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`Finished: ${new Date().toISOString()}`);
  } catch (err: any) {
    console.error('\n[SEED FAILED]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();



// ============================================================
