/**
 * Reform Pipeline — Zero-Drift Orchestration Layer
 *
 * Spec: Lumina MANUS PROMPT — REFORM PIPELINE (ZERO-DRIFT)
 * Purpose: Given a detected pattern or domain, surface the complete reform action:
 *   reform_packages → advocacy_targets → coalition (legislators + agencies + orgs)
 *   → media_outlets → active_campaigns → priority_score
 *
 * Rules:
 * - DETERMINISTIC only. No LLM inference, no fuzzy matching beyond domain mapping.
 * - All data comes from luminari_registry tables.
 * - If a table is empty, return empty arrays — never synthesize.
 * - Priority score is computed from fixed formula, not AI judgment.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Domain Normalization Map ─────────────────────────────────────────────────
// Maps raw pattern domains to canonical reform pipeline domains

const DOMAIN_MAP: Record<string, string[]> = {
  employment: ["employment", "wage_theft", "labor", "retaliation", "workplace_safety"],
  civil_rights: ["civil_rights", "police_accountability", "discrimination", "oversight", "judicial"],
  benefits: ["benefits", "ssdi", "snap", "medicaid", "disability", "food_security"],
  healthcare: ["healthcare", "mental_health", "insurance", "medical"],
  housing: ["housing", "eviction", "rental", "homelessness"],
  consumer_protection: ["consumer_protection", "debt_collection", "predatory_lending", "fdcpa", "tila"],
  oversight: ["oversight", "foia", "transparency", "regulatory_capture"],
};

function normalizeDomain(rawDomain: string): string {
  const lower = rawDomain.toLowerCase().replace(/[_\s-]+/g, "_");
  for (const [canonical, aliases] of Object.entries(DOMAIN_MAP)) {
    if (aliases.some((a) => lower.includes(a) || a.includes(lower))) {
      return canonical;
    }
  }
  return lower; // passthrough if no match
}

// ─── Priority Score Formula ───────────────────────────────────────────────────
// From Lumina spec: score = (signal_count * 0.4) + (failure_rate * 30) + (geographic_spread * 0.2) + (recurrence * 10)
// Normalized to 0-100

function computePriorityScore(params: {
  signalCount: number;
  failureRate: number; // 0.0 - 1.0
  geographicSpread: number; // 0-57 jurisdictions
  recurrenceCount: number;
}): number {
  const { signalCount, failureRate, geographicSpread, recurrenceCount } = params;
  const raw =
    Math.min(signalCount, 500) * 0.04 + // max 20 pts
    failureRate * 30 + // max 30 pts
    Math.min(geographicSpread, 57) * 0.35 + // max ~20 pts
    Math.min(recurrenceCount, 30) * 1.0; // max 30 pts
  return Math.min(Math.round(raw), 100);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReformActionResult {
  patternId: string | null;
  domain: string;
  canonicalDomain: string;
  reformPackages: ReformPackageSummary[];
  advocacyTargets: AdvocacyTargetSummary[];
  legislators: LegislatorSummary[];
  agencies: AgencySummary[];
  advocacyOrgs: AdvocacyOrgSummary[];
  mediaOutlets: MediaOutletSummary[];
  activeCampaigns: CampaignSummary[];
  priorityScore: number;
  priorityLevel: "critical" | "high" | "medium" | "low";
  generatedAt: number;
}

export interface ReformPackageSummary {
  packageId: string;
  title: string;
  status: string;
  reformType: string | null;
  executiveSummary: string;
  recommendedReforms: any;
  implementationRoadmap: any;
  coalitionPartners: string[];
  estimatedImpact: any;
}

export interface AdvocacyTargetSummary {
  targetId: string;
  name: string;
  organization: string | null;
  role: string | null;
  issueDomains: string[];
  influenceScore: number;
  pressurePoints: string[];
  desiredChange: string;
}

export interface LegislatorSummary {
  id: string;
  name: string;
  title: string | null;
  chamber: string | null;
  state: string | null;
  party: string | null;
  committees: string[];
  issueAlignment: any;
  influenceScore: number;
  accessibilityScore: number;
  contactOffice: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface AgencySummary {
  id: string;
  name: string;
  acronym: string | null;
  agencyType: string | null;
  domains: string[];
  complaintUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  effectivenessScore: number;
  filingMethods: string[];
  responseTimeDays: number | null;
}

export interface AdvocacyOrgSummary {
  id: string;
  name: string;
  orgType: string | null;
  domains: string[];
  servicesOffered: string[];
  contactEmail: string | null;
  website: string | null;
  coalitionWillingness: string;
  influenceScore: number;
  description: string | null;
}

export interface MediaOutletSummary {
  outletId: string;
  outletName: string;
  outletType: string | null;
  coverage: string | null;
  audience: string | null;
  contactEmail: string | null;
  website: string | null;
  partnershipPotential: string;
  investigative: boolean;
}

export interface CampaignSummary {
  campaignId: string;
  campaignName: string;
  domain: string | null;
  statusStage: string | null;
  primarySponsor: string | null;
  coalitionLeads: string[];
  demand: string | null;
  legislativeVehicle: string | null;
  targetPassage: string | null;
  currentStage: string | null;
  nextMilestone: string | null;
}

// ─── Core: generateReformAction ───────────────────────────────────────────────

export async function generateReformAction(params: {
  patternId?: string;
  domain: string;
  signalCount?: number;
  failureRate?: number;
  geographicSpread?: number;
  recurrenceCount?: number;
}): Promise<ReformActionResult> {
  const {
    patternId = null,
    domain,
    signalCount = 0,
    failureRate = 0,
    geographicSpread = 1,
    recurrenceCount = 0,
  } = params;

  const canonicalDomain = normalizeDomain(domain);

  // ── 1. Reform Packages ────────────────────────────────────────────────────
  const [pkgRows] = await db.execute(
    sql`SELECT package_id, title, status, reform_type, executive_summary,
               recommended_reforms_section, implementation_roadmap_section, supporting_data_section
        FROM reform_packages
        WHERE status = 'published'
          AND (reform_type = ${canonicalDomain}
            OR reform_type LIKE ${`%${canonicalDomain}%`}
            OR executive_summary LIKE ${`%${domain}%`})
        ORDER BY updated_at DESC
        LIMIT 5`
  );

  const reformPackages: ReformPackageSummary[] = (pkgRows as any[]).map((r) => {
    const parse = (s: string | null) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
    const supporting = parse(r.supporting_data_section);
    const reforms = parse(r.recommended_reforms_section);
    return {
      packageId: r.package_id,
      title: r.title,
      status: r.status,
      reformType: r.reform_type,
      executiveSummary: r.executive_summary || "",
      recommendedReforms: reforms,
      implementationRoadmap: parse(r.implementation_roadmap_section),
      coalitionPartners: Array.isArray(supporting.coalition_partners) ? supporting.coalition_partners : [],
      estimatedImpact: supporting.estimated_impact || {},
    };
  });

  // ── 2. Advocacy Targets ───────────────────────────────────────────────────
  const [targetRows] = await db.execute(
    sql`SELECT target_id, name, organization, role, issue_domains, influence_score, notes
        FROM advocacy_targets
        WHERE is_active = 1
          AND (JSON_SEARCH(issue_domains, 'one', ${canonicalDomain}) IS NOT NULL
            OR JSON_SEARCH(issue_domains, 'one', ${domain}) IS NOT NULL
            OR notes LIKE ${`%${domain}%`})
        ORDER BY influence_score DESC
        LIMIT 5`
  );

  const advocacyTargets: AdvocacyTargetSummary[] = (targetRows as any[]).map((r) => {
    const domains = (() => { try { return JSON.parse(r.issue_domains || "[]"); } catch { return []; } })();
    // Extract desired_change and pressure_points from notes field
    const notes = r.notes || "";
    const desiredChange = notes.includes("Desired:") ? notes.split("Desired:")[1]?.split(".")[0]?.trim() || notes : notes;
    const pressurePoints: string[] = [];
    if (notes.includes("Decision-maker:")) {
      const dm = notes.split("Decision-maker:")[1]?.split(".")[0]?.trim();
      if (dm) pressurePoints.push(dm);
    }
    return {
      targetId: r.target_id,
      name: r.name,
      organization: r.organization,
      role: r.role,
      issueDomains: domains,
      influenceScore: r.influence_score,
      pressurePoints,
      desiredChange,
    };
  });

  // ── 3. Coalition Legislators ──────────────────────────────────────────────
  const [legRows] = await db.execute(
    sql`SELECT id, name, title, chamber, state, party, committees, issue_alignment,
               influence_score, accessibility_score, contact_office, contact_email, contact_phone
        FROM coalition_legislators
        WHERE is_active = 1
          AND (JSON_SEARCH(issue_alignment, 'one', ${canonicalDomain}) IS NOT NULL
            OR JSON_SEARCH(committees, 'one', ${domain}) IS NOT NULL
            OR notes LIKE ${`%${domain}%`}
            OR issue_alignment LIKE ${`%${canonicalDomain}%`})
        ORDER BY influence_score DESC
        LIMIT 8`
  );

  const legislators: LegislatorSummary[] = (legRows as any[]).map((r) => {
    const parse = (s: string | null) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
    return {
      id: r.id,
      name: r.name,
      title: r.title,
      chamber: r.chamber,
      state: r.state,
      party: r.party,
      committees: parse(r.committees),
      issueAlignment: (() => { try { return JSON.parse(r.issue_alignment || "{}"); } catch { return {}; } })(),
      influenceScore: r.influence_score,
      accessibilityScore: r.accessibility_score,
      contactOffice: r.contact_office,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
    };
  });

  // ── 4. Coalition Agencies ─────────────────────────────────────────────────
  const [agencyRows] = await db.execute(
    sql`SELECT id, name, acronym, agency_type, domains, complaint_url, contact_phone,
               contact_email, website, effectiveness_score, filing_methods, response_time_days
        FROM coalition_agencies
        WHERE is_active = 1
          AND (JSON_SEARCH(domains, 'one', ${canonicalDomain}) IS NOT NULL
            OR JSON_SEARCH(domains, 'one', ${domain}) IS NOT NULL
            OR name LIKE ${`%${domain}%`})
        ORDER BY effectiveness_score DESC
        LIMIT 6`
  );

  const agencies: AgencySummary[] = (agencyRows as any[]).map((r) => {
    const parse = (s: string | null) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
    return {
      id: r.id,
      name: r.name,
      acronym: r.acronym,
      agencyType: r.agency_type,
      domains: parse(r.domains),
      complaintUrl: r.complaint_url,
      contactPhone: r.contact_phone,
      contactEmail: r.contact_email,
      website: r.website,
      effectivenessScore: r.effectiveness_score,
      filingMethods: parse(r.filing_methods),
      responseTimeDays: r.response_time_days ? Number(r.response_time_days) : null,
    };
  });

  // ── 5. Advocacy Orgs ──────────────────────────────────────────────────────
  const [orgRows] = await db.execute(
    sql`SELECT id, name, org_type, domains, services_offered, contact_email, website,
               coalition_willingness, influence_score, description
        FROM coalition_advocacy_orgs
        WHERE (JSON_SEARCH(domains, 'one', ${canonicalDomain}) IS NOT NULL
            OR JSON_SEARCH(domains, 'one', ${domain}) IS NOT NULL
            OR description LIKE ${`%${domain}%`})
        ORDER BY influence_score DESC
        LIMIT 6`
  );

  const advocacyOrgs: AdvocacyOrgSummary[] = (orgRows as any[]).map((r) => {
    const parse = (s: string | null) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
    return {
      id: r.id,
      name: r.name,
      orgType: r.org_type,
      domains: parse(r.domains),
      servicesOffered: parse(r.services_offered),
      contactEmail: r.contact_email,
      website: r.website,
      coalitionWillingness: r.coalition_willingness,
      influenceScore: r.influence_score,
      description: r.description,
    };
  });

  // ── 6. Media Outlets ──────────────────────────────────────────────────────
  // Media outlets are domain-agnostic (national reach) — return all HIGH/MEDIUM-HIGH
  const [mediaRows] = await db.execute(
    sql`SELECT outlet_id, outlet_name, outlet_type, coverage, audience, contact_email,
               website, partnership_potential, investigative
        FROM media_outlets
        WHERE is_active = 1
          AND partnership_potential IN ('HIGH', 'MEDIUM-HIGH')
        ORDER BY investigative DESC, outlet_name ASC
        LIMIT 5`
  );

  const mediaOutlets: MediaOutletSummary[] = (mediaRows as any[]).map((r) => ({
    outletId: r.outlet_id,
    outletName: r.outlet_name,
    outletType: r.outlet_type,
    coverage: r.coverage,
    audience: r.audience,
    contactEmail: r.contact_email,
    website: r.website,
    partnershipPotential: r.partnership_potential,
    investigative: Boolean(r.investigative),
  }));

  // ── 7. Active Campaigns ───────────────────────────────────────────────────
  const [campaignRows] = await db.execute(
    sql`SELECT campaign_id, campaign_name, domain, status_stage, primary_sponsor,
               coalition_leads, demand, legislative_vehicle, target_passage,
               current_stage, next_milestone
        FROM active_campaigns
        WHERE is_active = 1
          AND (domain = ${canonicalDomain}
            OR domain LIKE ${`%${canonicalDomain}%`}
            OR campaign_name LIKE ${`%${domain}%`})
        ORDER BY created_at DESC
        LIMIT 3`
  );

  const activeCampaigns: CampaignSummary[] = (campaignRows as any[]).map((r) => {
    const parse = (s: string | null) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
    return {
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      domain: r.domain,
      statusStage: r.status_stage,
      primarySponsor: r.primary_sponsor,
      coalitionLeads: parse(r.coalition_leads),
      demand: r.demand,
      legislativeVehicle: r.legislative_vehicle,
      targetPassage: r.target_passage,
      currentStage: r.current_stage,
      nextMilestone: r.next_milestone,
    };
  });

  // ── 8. Priority Score ─────────────────────────────────────────────────────
  const priorityScore = computePriorityScore({
    signalCount,
    failureRate,
    geographicSpread,
    recurrenceCount,
  });

  const priorityLevel: ReformActionResult["priorityLevel"] =
    priorityScore >= 75 ? "critical" :
    priorityScore >= 50 ? "high" :
    priorityScore >= 25 ? "medium" : "low";

  return {
    patternId,
    domain,
    canonicalDomain,
    reformPackages,
    advocacyTargets,
    legislators,
    agencies,
    advocacyOrgs,
    mediaOutlets,
    activeCampaigns,
    priorityScore,
    priorityLevel,
    generatedAt: Date.now(),
  };
}

// ─── Convenience: getReformActionByPatternId ──────────────────────────────────
// Looks up a pattern and calls generateReformAction with its metadata

export async function getReformActionByPatternId(patternId: string): Promise<ReformActionResult | null> {
  const [rows] = await db.execute(
    sql`SELECT pattern_type, harm_domains, jurisdiction_scope, confidence_score
        FROM pattern_registry
        WHERE pattern_id = ${patternId}
        LIMIT 1`
  );
  const pattern = (rows as any[])[0];
  if (!pattern) return null;

  const harmDomains = (() => {
    try { return JSON.parse(pattern.harm_domains || "[]"); } catch { return []; }
  })();
  const domain = Array.isArray(harmDomains) && harmDomains.length > 0 ? harmDomains[0] : pattern.pattern_type;

  return generateReformAction({
    patternId,
    domain,
    signalCount: 0,
    failureRate: 0,
    geographicSpread: 1,
    recurrenceCount: 0,
  });
}

// ─── List: getAllReformPackagesSummary ────────────────────────────────────────
// Returns all published reform packages for the reform dashboard

export async function getAllReformPackagesSummary() {
  const [rows] = await db.execute(
    sql`SELECT package_id, title, status, reform_type, jurisdiction,
               executive_summary, supporting_data_section, created_at, updated_at
        FROM reform_packages
        WHERE status = 'published'
        ORDER BY updated_at DESC`
  );
  return (rows as any[]).map((r) => {
    const supporting = (() => { try { return JSON.parse(r.supporting_data_section || "{}"); } catch { return {}; } })();
    return {
      packageId: r.package_id,
      title: r.title,
      status: r.status,
      reformType: r.reform_type,
      jurisdiction: r.jurisdiction,
      executiveSummary: r.executive_summary || "",
      coalitionPartners: Array.isArray(supporting.coalition_partners) ? supporting.coalition_partners : [],
      estimatedImpact: supporting.estimated_impact || {},
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  });
}

// ─── List: getCoalitionIntelligence ──────────────────────────────────────────
// Returns full coalition snapshot for a domain

export async function getCoalitionIntelligence(domain: string) {
  const canonicalDomain = normalizeDomain(domain);

  const [legRows] = await db.execute(
    sql`SELECT * FROM coalition_legislators WHERE is_active = 1 ORDER BY influence_score DESC LIMIT 20`
  );
  const [agencyRows] = await db.execute(
    sql`SELECT * FROM coalition_agencies WHERE is_active = 1 ORDER BY effectiveness_score DESC LIMIT 20`
  );
  const [orgRows] = await db.execute(
    sql`SELECT * FROM coalition_advocacy_orgs ORDER BY influence_score DESC LIMIT 20`
  );
  const [mediaRows] = await db.execute(
    sql`SELECT * FROM media_outlets WHERE is_active = 1 ORDER BY partnership_potential DESC LIMIT 10`
  );
  const [campaignRows] = await db.execute(
    sql`SELECT * FROM active_campaigns WHERE is_active = 1 ORDER BY created_at DESC`
  );
  const [targetRows] = await db.execute(
    sql`SELECT * FROM advocacy_targets WHERE is_active = 1 ORDER BY influence_score DESC LIMIT 20`
  );

  return {
    domain: canonicalDomain,
    legislators: legRows as any[],
    agencies: agencyRows as any[],
    advocacyOrgs: orgRows as any[],
    mediaOutlets: mediaRows as any[],
    activeCampaigns: campaignRows as any[],
    advocacyTargets: targetRows as any[],
    generatedAt: Date.now(),
  };
}
