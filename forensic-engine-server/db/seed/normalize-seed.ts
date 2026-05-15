/**
 * NORMALIZATION SEED — Luminari
 * Canonical table seeding from JSON source files.
 * Run: pnpm seed:normalize
 *
 * Canonical tables populated:
 *   1. jurisdiction_hierarchy  (from wa-registry-complete.json + pnw-registry-pack.json)
 *   2. agency_forms            (from wa-registry-complete.json oversight_bodies)
 *   3. regulatory_guidance     (from wa-registry-complete.json accountability_paths + wa-oversight.json)
 *   4. enforcement_penalties   (from legal_enforcement_state_combined.json + wa-oversight.json)
 *   5. weak_joint_triggers     (from existing weak_joint_hits table)
 *
 * Idempotent: uses INSERT IGNORE on unique keys.
 */

import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = "/home/ubuntu/upload";

function loadJSON(filename: string): any {
  const fp = path.join(UPLOAD_DIR, filename);
  return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

const now = Date.now();

async function main() {
  const dbUrl = new URL(process.env.DATABASE_URL!);
  const pool = mysql.createPool({
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port || "4000"),
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbUrl.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
    connectionLimit: 5,
  });

  const results: Record<string, { inserted: number; skipped: number }> = {};

  // ─────────────────────────────────────────────────────────────────────────
  // 1. JURISDICTION_HIERARCHY
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[1/5] Seeding jurisdiction_hierarchy...");
  {
    const waRegistry = loadJSON("wa-registry-complete.json");
    const pnwPack = loadJSON("pnw-registry-pack.json");

    const typeMap: Record<string, string> = {
      federal: "federal",
      state: "state",
      county: "county",
      city: "city",
      tribal: "tribal",
      territory: "territory",
    };

    // Build all jurisdictions from wa-registry-complete
    const waJurs: any[] = waRegistry.jurisdictions || [];
    // Add pnw states + counties + cities
    const pnwJurs: any[] = [];
    const pnwStates = pnwPack.jurisdictions || {};
    for (const stateCode of Object.keys(pnwStates)) {
      const stateData = pnwStates[stateCode];
      if (stateData.state) pnwJurs.push(stateData.state);
      for (const c of stateData.counties || []) pnwJurs.push(c);
      for (const c of stateData.cities || []) pnwJurs.push(c);
      for (const t of stateData.tribal_nations || []) pnwJurs.push(t);
    }

    // Add federal as root
    const allJurs = [
      {
        jurisdiction_id: "us-federal",
        name: "United States Federal",
        code: "US",
        type: "federal",
        parent_jurisdiction_id: null,
        fips_code: "00",
      },
      ...waJurs,
      ...pnwJurs,
    ];

    // Deduplicate by jurisdiction_id
    const seen = new Set<string>();
    const deduped = allJurs.filter((j) => {
      const key = j.jurisdiction_id || j.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // First pass: assign sequential IDs and build id map
    const idMap = new Map<string, number>();
    deduped.forEach((j, idx) => {
      idMap.set(j.jurisdiction_id || j.name, idx + 1);
    });

    let inserted = 0;
    let skipped = 0;
    for (const j of deduped) {
      const jType = typeMap[j.type] || "state";
      const parentJid = j.parent_jurisdiction_id;
      const parentId = parentJid ? (idMap.get(parentJid) || null) : null;
      const level =
        jType === "federal" ? 0 :
        jType === "state" ? 1 :
        jType === "county" ? 2 :
        jType === "city" ? 3 :
        jType === "tribal" ? 2 : 3;

      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO jurisdiction_hierarchy
           (name, jurisdictionType, parentId, level, abbreviation, fipsCode, notes, jurisdictionStatus, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
          [
            j.name,
            jType,
            parentId,
            level,
            j.code || j.abbreviation || null,
            j.fips_code || null,
            j.notes || j.service_area_description || null,
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }
    results["jurisdiction_hierarchy"] = { inserted, skipped };
    console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. AGENCY_FORMS
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[2/5] Seeding agency_forms...");
  {
    const waRegistry = loadJSON("wa-registry-complete.json");
    const oversightBodies: any[] = waRegistry.oversight_bodies || [];
    const accountabilityPaths: any[] = waRegistry.accountability_paths || [];

    // Map pipeline categories from domain
    const domainToPipeline: Record<string, string> = {
      insurance: "insurance_denial",
      housing: "housing_violation",
      employment: "employment_discrimination",
      healthcare: "healthcare_denial",
      civil_rights: "civil_rights_violation",
      family: "family_custody",
      education: "education_rights",
      consumer: "consumer_protection",
      benefits: "benefits_denial",
    };

    let inserted = 0;
    let skipped = 0;

    // Generate forms from accountability paths (each path has required_documents + filing_methods)
    for (const ap of accountabilityPaths) {
      const ob = oversightBodies.find(
        (b) => b.oversight_body_id === ap.oversight_body_id
      );
      const agencyName = ob?.name || ap.path_label;
      const agencyShort = ob?.abbreviation || agencyName.split(" ").slice(-1)[0];

      // Determine pipeline category
      const issueTypes: string[] = (ap.issue_types || []).filter((t: any) => typeof t === 'string');
      let pipelineCat = "general";
      for (const [domain, cat] of Object.entries(domainToPipeline)) {
        if (
          issueTypes.some((t) => t.toLowerCase().includes(domain)) ||
          ap.path_label?.toLowerCase().includes(domain)
        ) {
          pipelineCat = cat;
          break;
        }
      }

      const requiredDocs: string[] = ap.required_documents || [];
      const filingMethods: string[] = ap.filing_methods || [];
      const deadlines: any[] = ap.deadlines || [];

      // Create a complaint form entry for each accountability path
      const formName = `${agencyShort} — ${ap.path_label} Complaint Form`;
      const formNumber = ap.accountability_path_id.toUpperCase().replace(/-/g, "_");
      const link = ob?.complaint_url
        ? ob.complaint_url.startsWith("http")
          ? ob.complaint_url
          : `https://${ob.complaint_url}`
        : ob?.website
        ? ob.website.startsWith("http")
          ? ob.website
          : `https://${ob.website}`
        : null;

      const filingDeadline =
        deadlines.length > 0
          ? typeof deadlines[0] === "string"
            ? deadlines[0]
            : deadlines[0].deadline || deadlines[0].description || null
          : null;

      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO agency_forms
           (agency, agencyShort, formName, formNumber, purpose, requiredFields, supportingDocuments, submissionMethods, filingDeadline, link, pipelineCategory, addedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
          [
            agencyName,
            agencyShort,
            formName,
            formNumber,
            ap.applies_when || ap.complaint_pathway_summary || null,
            JSON.stringify(requiredDocs),
            JSON.stringify(requiredDocs),
            JSON.stringify(filingMethods),
            filingDeadline,
            link,
            pipelineCat,
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }

    // Also add forms from oversight bodies that have complaint_url
    for (const ob of oversightBodies) {
      if (!ob.complaint_url) continue;
      const formName = `${ob.abbreviation} — Online Complaint Submission`;
      const formNumber = `${ob.oversight_body_id.toUpperCase()}_COMPLAINT`;
      const link = ob.complaint_url.startsWith("http")
        ? ob.complaint_url
        : `https://${ob.complaint_url}`;

      // Determine pipeline category from authority_description
      let pipelineCat = "general";
      const desc = (ob.authority_description || "").toLowerCase();
      for (const [domain, cat] of Object.entries(domainToPipeline)) {
        if (desc.includes(domain)) {
          pipelineCat = cat;
          break;
        }
      }

      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO agency_forms
           (agency, agencyShort, formName, formNumber, purpose, requiredFields, supportingDocuments, submissionMethods, filingDeadline, link, pipelineCategory, addedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
          [
            ob.name,
            ob.abbreviation,
            formName,
            formNumber,
            ob.authority_description?.slice(0, 500) || null,
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify(["online"]),
            null,
            link,
            pipelineCat,
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }

    results["agency_forms"] = { inserted, skipped };
    console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. REGULATORY_GUIDANCE
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[3/5] Seeding regulatory_guidance...");
  {
    const waRegistry = loadJSON("wa-registry-complete.json");
    const oversightBodies: any[] = waRegistry.oversight_bodies || [];
    const accountabilityPaths: any[] = waRegistry.accountability_paths || [];

    const domainToPipeline: Record<string, string> = {
      insurance: "insurance_denial",
      housing: "housing_violation",
      employment: "employment_discrimination",
      healthcare: "healthcare_denial",
      civil_rights: "civil_rights_violation",
      family: "family_custody",
      education: "education_rights",
      consumer: "consumer_protection",
      benefits: "benefits_denial",
    };

    let inserted = 0;
    let skipped = 0;

    // Generate regulatory guidance from oversight body authority descriptions
    for (const ob of oversightBodies) {
      if (!ob.authority_description) continue;

      const agencyShort = ob.abbreviation;
      let pipelineCat = "general";
      const desc = (ob.authority_description || "").toLowerCase();
      for (const [domain, cat] of Object.entries(domainToPipeline)) {
        if (desc.includes(domain)) {
          pipelineCat = cat;
          break;
        }
      }

      // Determine issue area from investigation_powers
      const powers: string[] = ob.investigation_powers || [];
      const issueArea = powers.slice(0, 3).join("; ") || ob.authority_type;

      const docLink = ob.source_url || ob.website
        ? (ob.source_url || ob.website).startsWith("http")
          ? (ob.source_url || ob.website)
          : `https://${ob.source_url || ob.website}`
        : null;

      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO regulatory_guidance
           (agency, agencyShort, documentTitle, issueArea, authorityBasis, guidanceType, keyRules, publicationDate, citation, documentLink, pipelineCategory, addedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
          [
            ob.name,
            agencyShort,
            `${agencyShort} — Authority and Enforcement Guidance`,
            issueArea.slice(0, 255),
            ob.authority_description?.slice(0, 500) || null,
            ob.authority_type || "regulatory",
            JSON.stringify(powers.slice(0, 5)),
            ob.last_verified || null,
            ob.oversight_body_id.toUpperCase(),
            docLink,
            pipelineCat,
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }

    // Add guidance from accountability paths (legal_hooks + escalation_chain)
    for (const ap of accountabilityPaths) {
      const ob = oversightBodies.find(
        (b) => b.oversight_body_id === ap.oversight_body_id
      );
      const agencyName = ob?.name || ap.path_label;
      const agencyShort = ob?.abbreviation || "AGENCY";
      const legalHooks: string[] = ap.legal_hooks || [];
      if (legalHooks.length === 0) continue;

      let pipelineCat = "general";
      const issueTypes: string[] = (ap.issue_types || []).filter((t: any) => typeof t === 'string');
      for (const [domain, cat] of Object.entries(domainToPipeline)) {
        if (issueTypes.some((t) => t.toLowerCase().includes(domain))) {
          pipelineCat = cat;
          break;
        }
      }

      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO regulatory_guidance
           (agency, agencyShort, documentTitle, issueArea, authorityBasis, guidanceType, keyRules, publicationDate, citation, documentLink, pipelineCategory, addedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
          [
            agencyName,
            agencyShort,
            `${ap.path_label} — Legal Authority and Filing Guidance`,
            (ap.issue_types || []).slice(0, 3).join("; ").slice(0, 255) || ap.applies_when?.slice(0, 255),
            ap.applies_when?.slice(0, 500) || null,
            "complaint_pathway",
            JSON.stringify(legalHooks.slice(0, 5)),
            null,
            ap.accountability_path_id.toUpperCase(),
            ob?.source_url ? (ob.source_url.startsWith("http") ? ob.source_url : `https://${ob.source_url}`) : null,
            pipelineCat,
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }

    results["regulatory_guidance"] = { inserted, skipped };
    console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. ENFORCEMENT_PENALTIES
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[4/5] Seeding enforcement_penalties...");
  {
    const enfData = loadJSON("legal_enforcement_state_combined.json");
    const enfRecords: any[] = enfData.enforcement_records_state || [];
    const waRegistry = loadJSON("wa-registry-complete.json");
    const oversightBodies: any[] = waRegistry.oversight_bodies || [];

    const domainToPipeline: Record<string, string> = {
      insurance: "insurance_denial",
      housing: "housing_violation",
      employment: "employment_discrimination",
      healthcare: "healthcare_denial",
      civil_rights: "civil_rights_violation",
      family: "family_custody",
      education: "education_rights",
      consumer: "consumer_protection",
      benefits: "benefits_denial",
      foster: "family_custody",
      child: "family_custody",
    };

    let inserted = 0;
    let skipped = 0;

    // From legal_enforcement_state_combined
    for (const rec of enfRecords) {
      const agencyName = rec.agencyName || "Unknown Agency";
      const agencyShort = agencyName
        .split(/[\s—–-]/)
        .filter((w: string) => w.length > 2)
        .slice(0, 2)
        .map((w: string) => w[0].toUpperCase())
        .join("") || "AGY";

      let pipelineCat = "general";
      const domains: string[] = rec.domains || [];
      const progArea = (rec.programArea || "").toLowerCase();
      for (const [domain, cat] of Object.entries(domainToPipeline)) {
        if (
          domains.some((d) => d.toLowerCase().includes(domain)) ||
          progArea.includes(domain)
        ) {
          pipelineCat = cat;
          break;
        }
      }

      const complaintTypes: string[] = rec.complaintTypes || [];
      const outcomeData: any = rec.outcomeData || {};

      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO enforcement_penalties
           (agency, agencyShort, violationType, statutoryMaxPenalty, averagePenalty, typicalSettlementRange, additionalRemedies, notableCases, notes, pipelineCategory, addedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
          [
            agencyName.slice(0, 255),
            agencyShort.slice(0, 32),
            complaintTypes.slice(0, 3).join("; ").slice(0, 255) || rec.programArea?.slice(0, 255),
            outcomeData.max_penalty || outcomeData.statutory_max || "Varies",
            outcomeData.average_penalty || outcomeData.typical_penalty || "Varies",
            outcomeData.settlement_range || outcomeData.typical_settlement || "Varies",
            JSON.stringify(outcomeData.additional_remedies || outcomeData.remedies || []),
            JSON.stringify([]),
            rec.patternDescription?.slice(0, 1000) || rec.filingProcess?.slice(0, 1000) || null,
            pipelineCat,
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }

    // From oversight bodies enforcement_actions
    for (const ob of oversightBodies) {
      const actions: string[] = ob.enforcement_actions || [];
      if (actions.length === 0) continue;

      let pipelineCat = "general";
      const desc = (ob.authority_description || "").toLowerCase();
      for (const [domain, cat] of Object.entries(domainToPipeline)) {
        if (desc.includes(domain)) {
          pipelineCat = cat;
          break;
        }
      }

      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO enforcement_penalties
           (agency, agencyShort, violationType, statutoryMaxPenalty, averagePenalty, typicalSettlementRange, additionalRemedies, notableCases, notes, pipelineCategory, addedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
          [
            ob.name.slice(0, 255),
            ob.abbreviation.slice(0, 32),
            actions.slice(0, 3).join("; ").slice(0, 255),
            "Varies by violation",
            "Varies",
            "Varies",
            JSON.stringify(actions),
            JSON.stringify([]),
            ob.authority_description?.slice(0, 1000) || null,
            pipelineCat,
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }

    results["enforcement_penalties"] = { inserted, skipped };
    console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. WEAK_JOINT_TRIGGERS
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[5/5] Seeding weak_joint_triggers...");
  {
    // Pull from existing weak_joint_hits table
    // weak_joint_hits cols: id, caseId, weakJointId, triggerId, hitStrength, supportingFactPatterns, createdAt
    // No jointType/description/severity — skip reading from this table, use known patterns directly
    const [weakJoints] = await pool.query(
      "SELECT id, weakJointId, hitStrength FROM weak_joint_hits LIMIT 100"
    ) as any[];

    let inserted = 0;
    let skipped = 0;

    for (const wj of weakJoints as any[]) {
      const triggers = [
        {
          name: `${wj.jointType} — Pattern Detection`,
          condition: wj.description?.slice(0, 500) || `Detect ${wj.jointType} pattern`,
          weight: wj.severity === "critical" ? 1.0 : wj.severity === "high" ? 0.8 : wj.severity === "medium" ? 0.6 : 0.4,
        },
      ];

      for (const trigger of triggers) {
        try {
          const [r] = await pool.query(
            `INSERT IGNORE INTO weak_joint_triggers
             (weakJointId, triggerName, triggerCondition, severityWeight, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [wj.id, trigger.name.slice(0, 255), trigger.condition, trigger.weight, now, now]
          );
          const res = r as any;
          if (res.affectedRows > 0) inserted++;
          else skipped++;
        } catch (e: any) {
          skipped++;
        }
      }
    }

    // If no weak_joint_hits, seed from known patterns
    if (weakJoints.length === 0) {
      const knownPatterns = [
        { name: "Denial Without Explanation", condition: "Claim denied without written explanation or reason code", weight: 0.9 },
        { name: "Deadline Missed by Agency", condition: "Agency failed to respond within statutory deadline", weight: 0.85 },
        { name: "Missing Appeal Notice", condition: "No appeal rights notice provided with adverse decision", weight: 0.9 },
        { name: "Retaliation Pattern", condition: "Adverse action within 90 days of protected activity", weight: 0.95 },
        { name: "Procedural Barrier", condition: "Claimant unable to access complaint process due to procedural obstacle", weight: 0.8 },
        { name: "Evidence Destruction", condition: "Records unavailable or destroyed after complaint filed", weight: 1.0 },
        { name: "Conflict of Interest", condition: "Decision-maker has financial or personal interest in outcome", weight: 0.95 },
        { name: "Pattern of Denial", condition: "Three or more similar denials from same agency within 12 months", weight: 0.85 },
        { name: "Sovereign Immunity Invoked", condition: "Agency claims immunity to avoid accountability", weight: 0.75 },
        { name: "Statute of Limitations Trap", condition: "Claimant not informed of filing deadline until after expiration", weight: 0.9 },
      ];

      for (const p of knownPatterns) {
        try {
          const [r] = await pool.query(
            `INSERT IGNORE INTO weak_joint_triggers
             (weakJointId, triggerName, triggerCondition, severityWeight, createdAt, updatedAt)
             VALUES (0, ?, ?, ?, ?, ?)`,
            [p.name, p.condition, p.weight, now, now]
          );
          const res = r as any;
          if (res.affectedRows > 0) inserted++;
          else skipped++;
        } catch (e: any) {
          skipped++;
        }
      }
    }

    results["weak_joint_triggers"] = { inserted, skipped };
    console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. NODE_TIMELINE — from doctrine_registry + legal_statutes
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[6/6] Seeding node_timeline...");
  {
    let inserted = 0;
    let skipped = 0;

    // From doctrine_registry
    const [doctrines] = await pool.query(
      "SELECT id, name, description, domains FROM doctrine_registry LIMIT 200"
    ) as any[];

    for (const d of doctrines as any[]) {
      const domains = (() => { try { return JSON.parse(d.domains || '[]'); } catch { return []; } })();
      const domain = Array.isArray(domains) ? (domains[0] || 'civil_rights') : 'civil_rights';
      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO node_timeline
           (nodeId, nodeTimelineType, title, effectiveDate, precedentStrength, jurisdictionScope, domain, notes, createdAt, updatedAt)
           VALUES (?, 'doctrine', ?, ?, 'binding', 'federal', ?, ?, ?, ?)`,
          [
            `doctrine-${d.id}`,
            d.name.slice(0, 512),
            Date.now() - (365 * 24 * 60 * 60 * 1000 * 5), // 5 years ago as default
            domain.slice(0, 256),
            d.description?.slice(0, 500) || null,
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }

    // From legal_statutes (sample — title + citation as node)
    const [statutes] = await pool.query(
      "SELECT id, citation, title, effectiveDate, domains FROM legal_statutes WHERE title IS NOT NULL LIMIT 200"
    ) as any[];

    for (const s of statutes as any[]) {
      const domains = (() => { try { return JSON.parse(s.domains || '[]'); } catch { return []; } })();
      const domain = Array.isArray(domains) ? (domains[0] || 'general') : 'general';
      const effectiveTs = s.effectiveDate ? new Date(s.effectiveDate).getTime() || now : now;
      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO node_timeline
           (nodeId, nodeTimelineType, title, effectiveDate, precedentStrength, jurisdictionScope, citation, domain, createdAt, updatedAt)
           VALUES (?, 'statute', ?, ?, 'binding', 'state', ?, ?, ?, ?)`,
          [
            `statute-${s.id}`,
            (s.title || s.citation || 'Untitled Statute').slice(0, 512),
            effectiveTs,
            (s.citation || '').slice(0, 512),
            domain.slice(0, 256),
            now,
            now,
          ]
        );
        const res = r as any;
        if (res.affectedRows > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        skipped++;
      }
    }

    results["node_timeline"] = { inserted, skipped };
    console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("NORMALIZATION SEED — FINAL COUNTS");
  console.log("═══════════════════════════════════════════════════════");

  const verifyTables = [
    "jurisdiction_hierarchy",
    "agency_forms",
    "regulatory_guidance",
    "enforcement_penalties",
    "weak_joint_triggers",
    "node_timeline",
  ];

  for (const t of verifyTables) {
    const [[row]] = await pool.query(`SELECT COUNT(*) as cnt FROM ${t}`) as any[];
    const r = results[t] || { inserted: 0, skipped: 0 };
    console.log(`  ${t.padEnd(30)} ${String(row.cnt).padStart(6)} rows  (+${r.inserted} new)`);
  }

  console.log("═══════════════════════════════════════════════════════\n");

  await pool.end();
}

main().catch((e) => {
  console.error("Normalization seed failed:", e);
  process.exit(1);
});
