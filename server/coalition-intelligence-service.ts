/**
 * Coalition Intelligence Service
 *
 * T1. Search query + filters → unified search across legislators, agencies, advocacy orgs, media
 * T2. Entity type + domain filters → filtered entity lists with relevance scoring
 * T3. Entity ID + type → full entity detail with contact info and coalition history
 * T4. Jurisdiction + issue domains → coalition readiness assessment (who is available, aligned, willing)
 * T5. Campaign ID → recommended coalition composition (legislators, agencies, orgs, media)
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────

export type EntityType = "legislator" | "agency" | "advocacy_org" | "media";

export interface CoalitionEntity {
  id: string;
  entityType: EntityType;
  name: string;
  subtitle: string;
  jurisdiction: string;
  state: string | null;
  domains: string[];
  influenceScore: number;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
}

export interface LegislatorDetail {
  id: string; name: string; title: string; chamber: string; state: string;
  district: string; party: string; jurisdictionLevel: string;
  committees: string[]; issueAlignment: string[];
  contactOffice: string | null; contactPhone: string | null; contactEmail: string | null;
  website: string | null; socialMedia: Record<string, string>;
  votingRecordUrl: string | null; influenceScore: number; accessibilityScore: number;
  notes: string | null; isActive: boolean;
}

export interface AgencyDetail {
  id: string; name: string; acronym: string; agencyType: string;
  jurisdictionLevel: string; state: string | null; parentAgency: string | null;
  domains: string[]; enforcementPowers: string[];
  complaintUrl: string | null; contactPhone: string | null; contactEmail: string | null;
  website: string | null; address: string | null; filingMethods: string[];
  responseTimeDays: number | null; effectivenessScore: number;
  notes: string | null; isActive: boolean;
}

export interface AdvocacyOrgDetail {
  id: string; name: string; orgType: string; jurisdiction: string; state: string | null;
  domains: string[]; servicesOffered: string[];
  contactEmail: string | null; contactPhone: string | null; website: string | null;
  address: string | null; description: string | null; eligibilityCriteria: string | null;
  languages: string[]; intakeUrl: string | null;
  coalitionWillingness: string; influenceScore: number; isVerified: boolean; notes: string | null;
}

export interface MediaDetail {
  id: string; name: string; outlet: string; mediaType: string;
  beat: string[]; jurisdiction: string; state: string | null;
  contactEmail: string | null; contactPhone: string | null;
  socialMedia: Record<string, string>; website: string | null;
  reachScore: number; responsivenessScore: number;
  previousCoverage: any[]; notes: string | null; isActive: boolean;
}

export interface CoalitionReadiness {
  jurisdiction: string; domains: string[];
  legislators: { total: number; aligned: number; highInfluence: number };
  agencies: { total: number; relevant: number; highEffectiveness: number };
  advocacyOrgs: { total: number; willing: number; highInfluence: number };
  media: { total: number; relevant: number; highReach: number };
  overallReadinessScore: number; gaps: string[]; strengths: string[];
}

export interface CoalitionRecommendation {
  legislators: CoalitionEntity[]; agencies: CoalitionEntity[];
  advocacyOrgs: CoalitionEntity[]; media: CoalitionEntity[];
  totalEntities: number; coverageDomains: string[]; averageInfluence: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function safeJsonParse(val: any, fallback: any = []): any {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function domainMatch(entityDomains: string[], targetDomains: string[]): boolean {
  if (!targetDomains.length) return true;
  const eDomains = entityDomains.map(d => d.toLowerCase());
  return targetDomains.some(td => eDomains.some(ed => ed.includes(td.toLowerCase()) || td.toLowerCase().includes(ed)));
}

// ── Search ─────────────────────────────────────────────────────────────

async function searchLegislators(params: {
  query?: string; state?: string; jurisdiction?: string; minInfluence: number; limit: number;
}): Promise<any[]> {
  const { query, state, jurisdiction, minInfluence, limit } = params;
  if (query && state && jurisdiction) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND influence_score >= ${minInfluence} AND (name LIKE ${w} OR title LIKE ${w} OR state LIKE ${w}) AND state = ${state} AND jurisdiction_level = ${jurisdiction} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query && state) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND influence_score >= ${minInfluence} AND (name LIKE ${w} OR title LIKE ${w} OR state LIKE ${w}) AND state = ${state} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query && jurisdiction) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND influence_score >= ${minInfluence} AND (name LIKE ${w} OR title LIKE ${w} OR state LIKE ${w}) AND jurisdiction_level = ${jurisdiction} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (state && jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND influence_score >= ${minInfluence} AND state = ${state} AND jurisdiction_level = ${jurisdiction} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND influence_score >= ${minInfluence} AND (name LIKE ${w} OR title LIKE ${w} OR state LIKE ${w}) ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (state) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND influence_score >= ${minInfluence} AND state = ${state} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND influence_score >= ${minInfluence} AND jurisdiction_level = ${jurisdiction} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND influence_score >= ${minInfluence} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  }
}

async function searchAgencies(params: {
  query?: string; state?: string; jurisdiction?: string; minInfluence: number; limit: number;
}): Promise<any[]> {
  const { query, state, jurisdiction, minInfluence, limit } = params;
  if (query && state && jurisdiction) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND effectiveness_score >= ${minInfluence} AND (name LIKE ${w} OR acronym LIKE ${w}) AND state = ${state} AND jurisdiction_level = ${jurisdiction} ORDER BY effectiveness_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query && state) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND effectiveness_score >= ${minInfluence} AND (name LIKE ${w} OR acronym LIKE ${w}) AND state = ${state} ORDER BY effectiveness_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query && jurisdiction) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND effectiveness_score >= ${minInfluence} AND (name LIKE ${w} OR acronym LIKE ${w}) AND jurisdiction_level = ${jurisdiction} ORDER BY effectiveness_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (state && jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND effectiveness_score >= ${minInfluence} AND state = ${state} AND jurisdiction_level = ${jurisdiction} ORDER BY effectiveness_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND effectiveness_score >= ${minInfluence} AND (name LIKE ${w} OR acronym LIKE ${w}) ORDER BY effectiveness_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (state) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND effectiveness_score >= ${minInfluence} AND state = ${state} ORDER BY effectiveness_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND effectiveness_score >= ${minInfluence} AND jurisdiction_level = ${jurisdiction} ORDER BY effectiveness_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND effectiveness_score >= ${minInfluence} ORDER BY effectiveness_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  }
}

async function searchAdvocacyOrgs(params: {
  query?: string; state?: string; jurisdiction?: string; minInfluence: number; limit: number;
}): Promise<any[]> {
  const { query, state, jurisdiction, minInfluence, limit } = params;
  if (query && state && jurisdiction) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE influence_score >= ${minInfluence} AND (name LIKE ${w} OR org_type LIKE ${w}) AND state = ${state} AND jurisdiction = ${jurisdiction} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query && state) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE influence_score >= ${minInfluence} AND (name LIKE ${w} OR org_type LIKE ${w}) AND state = ${state} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query && jurisdiction) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE influence_score >= ${minInfluence} AND (name LIKE ${w} OR org_type LIKE ${w}) AND jurisdiction = ${jurisdiction} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (state && jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE influence_score >= ${minInfluence} AND state = ${state} AND jurisdiction = ${jurisdiction} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE influence_score >= ${minInfluence} AND (name LIKE ${w} OR org_type LIKE ${w}) ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (state) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE influence_score >= ${minInfluence} AND state = ${state} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE influence_score >= ${minInfluence} AND jurisdiction = ${jurisdiction} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE influence_score >= ${minInfluence} ORDER BY influence_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  }
}

async function searchMedia(params: {
  query?: string; state?: string; jurisdiction?: string; minInfluence: number; limit: number;
}): Promise<any[]> {
  const { query, state, jurisdiction, minInfluence, limit } = params;
  if (query && state && jurisdiction) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND reach_score >= ${minInfluence} AND (name LIKE ${w} OR outlet LIKE ${w}) AND state = ${state} AND jurisdiction = ${jurisdiction} ORDER BY reach_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query && state) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND reach_score >= ${minInfluence} AND (name LIKE ${w} OR outlet LIKE ${w}) AND state = ${state} ORDER BY reach_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query && jurisdiction) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND reach_score >= ${minInfluence} AND (name LIKE ${w} OR outlet LIKE ${w}) AND jurisdiction = ${jurisdiction} ORDER BY reach_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (state && jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND reach_score >= ${minInfluence} AND state = ${state} AND jurisdiction = ${jurisdiction} ORDER BY reach_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (query) {
    const w = `%${query}%`;
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND reach_score >= ${minInfluence} AND (name LIKE ${w} OR outlet LIKE ${w}) ORDER BY reach_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (state) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND reach_score >= ${minInfluence} AND state = ${state} ORDER BY reach_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else if (jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND reach_score >= ${minInfluence} AND jurisdiction = ${jurisdiction} ORDER BY reach_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND reach_score >= ${minInfluence} ORDER BY reach_score DESC LIMIT ${limit}`);
    return rows as unknown as any[];
  }
}

export async function searchCoalitionEntities(params: {
  query?: string;
  entityTypes?: EntityType[];
  domains?: string[];
  jurisdiction?: string;
  state?: string;
  minInfluence?: number;
  limit?: number;
}): Promise<CoalitionEntity[]> {
  const { query, entityTypes, domains, jurisdiction, state, minInfluence = 0, limit = 50 } = params;
  const types = entityTypes?.length ? entityTypes : ["legislator", "agency", "advocacy_org", "media"] as EntityType[];
  const results: CoalitionEntity[] = [];
  const searchParams = { query, state, jurisdiction, minInfluence, limit };

  if (types.includes("legislator")) {
    const rows = await searchLegislators(searchParams);
    for (const r of rows) {
      const iss = safeJsonParse(r.issue_alignment);
      if (domains?.length && !domainMatch(iss, domains)) continue;
      results.push({
        id: r.id, entityType: "legislator", name: r.name,
        subtitle: `${r.title} (${r.party}) - ${r.state}`,
        jurisdiction: r.jurisdiction_level, state: r.state,
        domains: iss, influenceScore: r.influence_score,
        contactEmail: r.contact_email, contactPhone: r.contact_phone, website: r.website,
      });
    }
  }

  if (types.includes("agency")) {
    const rows = await searchAgencies(searchParams);
    for (const r of rows) {
      const doms = safeJsonParse(r.domains);
      if (domains?.length && !domainMatch(doms, domains)) continue;
      results.push({
        id: r.id, entityType: "agency", name: r.name,
        subtitle: r.acronym || r.agency_type,
        jurisdiction: r.jurisdiction_level, state: r.state,
        domains: doms, influenceScore: r.effectiveness_score,
        contactEmail: r.contact_email, contactPhone: r.contact_phone, website: r.website,
      });
    }
  }

  if (types.includes("advocacy_org")) {
    const rows = await searchAdvocacyOrgs(searchParams);
    for (const r of rows) {
      const doms = safeJsonParse(r.domains);
      if (domains?.length && !domainMatch(doms, domains)) continue;
      results.push({
        id: r.id, entityType: "advocacy_org", name: r.name,
        subtitle: r.org_type || "Advocacy Organization",
        jurisdiction: r.jurisdiction || "National", state: r.state,
        domains: doms, influenceScore: r.influence_score,
        contactEmail: r.contact_email, contactPhone: r.contact_phone, website: r.website,
      });
    }
  }

  if (types.includes("media")) {
    const rows = await searchMedia(searchParams);
    for (const r of rows) {
      const beats = safeJsonParse(r.beat);
      if (domains?.length && !domainMatch(beats, domains)) continue;
      results.push({
        id: r.id, entityType: "media", name: r.name,
        subtitle: `${r.outlet} (${r.media_type})`,
        jurisdiction: r.jurisdiction, state: r.state,
        domains: beats, influenceScore: r.reach_score,
        contactEmail: r.contact_email, contactPhone: r.contact_phone, website: r.website,
      });
    }
  }

  results.sort((a, b) => b.influenceScore - a.influenceScore);
  return results.slice(0, limit);
}

// ── Entity Detail ──────────────────────────────────────────────────────

export async function getLegislatorDetail(id: string): Promise<LegislatorDetail | null> {
  const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE id = ${id}`);
  const r = (rows as unknown as any[])[0];
  if (!r) return null;
  return {
    id: r.id, name: r.name, title: r.title, chamber: r.chamber, state: r.state,
    district: r.district, party: r.party, jurisdictionLevel: r.jurisdiction_level,
    committees: safeJsonParse(r.committees), issueAlignment: safeJsonParse(r.issue_alignment),
    contactOffice: r.contact_office, contactPhone: r.contact_phone, contactEmail: r.contact_email,
    website: r.website, socialMedia: safeJsonParse(r.social_media, {}),
    votingRecordUrl: r.voting_record_url, influenceScore: r.influence_score,
    accessibilityScore: r.accessibility_score, notes: r.notes, isActive: !!r.is_active,
  };
}

export async function getAgencyDetail(id: string): Promise<AgencyDetail | null> {
  const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE id = ${id}`);
  const r = (rows as unknown as any[])[0];
  if (!r) return null;
  return {
    id: r.id, name: r.name, acronym: r.acronym, agencyType: r.agency_type,
    jurisdictionLevel: r.jurisdiction_level, state: r.state, parentAgency: r.parent_agency,
    domains: safeJsonParse(r.domains), enforcementPowers: safeJsonParse(r.enforcement_powers),
    complaintUrl: r.complaint_url, contactPhone: r.contact_phone, contactEmail: r.contact_email,
    website: r.website, address: r.address, filingMethods: safeJsonParse(r.filing_methods),
    responseTimeDays: r.response_time_days, effectivenessScore: r.effectiveness_score,
    notes: r.notes, isActive: !!r.is_active,
  };
}

export async function getAdvocacyOrgDetail(id: string): Promise<AdvocacyOrgDetail | null> {
  const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE id = ${id}`);
  const r = (rows as unknown as any[])[0];
  if (!r) return null;
  return {
    id: r.id, name: r.name, orgType: r.org_type, jurisdiction: r.jurisdiction, state: r.state,
    domains: safeJsonParse(r.domains), servicesOffered: safeJsonParse(r.services_offered),
    contactEmail: r.contact_email, contactPhone: r.contact_phone, website: r.website,
    address: r.address, description: r.description, eligibilityCriteria: r.eligibility_criteria,
    languages: safeJsonParse(r.languages), intakeUrl: r.intake_url,
    coalitionWillingness: r.coalition_willingness, influenceScore: r.influence_score,
    isVerified: !!r.is_verified, notes: r.notes,
  };
}

export async function getMediaDetail(id: string): Promise<MediaDetail | null> {
  const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE id = ${id}`);
  const r = (rows as unknown as any[])[0];
  if (!r) return null;
  return {
    id: r.id, name: r.name, outlet: r.outlet, mediaType: r.media_type,
    beat: safeJsonParse(r.beat), jurisdiction: r.jurisdiction, state: r.state,
    contactEmail: r.contact_email, contactPhone: r.contact_phone,
    socialMedia: safeJsonParse(r.social_media, {}), website: r.website,
    reachScore: r.reach_score, responsivenessScore: r.responsiveness_score,
    previousCoverage: safeJsonParse(r.previous_coverage), notes: r.notes,
    isActive: !!r.is_active,
  };
}

// ── Coalition Readiness Assessment ─────────────────────────────────────

export async function assessCoalitionReadiness(params: {
  jurisdiction: string;
  state?: string;
  domains: string[];
}): Promise<CoalitionReadiness> {
  const { jurisdiction, state, domains } = params;

  // Legislators
  let allLegs: any[];
  if (state) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND state = ${state}`);
    allLegs = rows as unknown as any[];
  } else if (jurisdiction === "federal") {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1 AND jurisdiction_level = 'federal'`);
    allLegs = rows as unknown as any[];
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_legislators WHERE is_active = 1`);
    allLegs = rows as unknown as any[];
  }
  const alignedLegs = allLegs.filter(l => domainMatch(safeJsonParse(l.issue_alignment), domains));
  const highInflLegs = alignedLegs.filter(l => l.influence_score >= 75);

  // Agencies
  let allAgs: any[];
  if (state) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND (state = ${state} OR jurisdiction_level = 'federal')`);
    allAgs = rows as unknown as any[];
  } else if (jurisdiction === "federal") {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1 AND jurisdiction_level = 'federal'`);
    allAgs = rows as unknown as any[];
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_agencies WHERE is_active = 1`);
    allAgs = rows as unknown as any[];
  }
  const relevantAgs = allAgs.filter(a => domainMatch(safeJsonParse(a.domains), domains));
  const highEffAgs = relevantAgs.filter(a => a.effectiveness_score >= 70);

  // Advocacy orgs
  let allOrgs: any[];
  if (state) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs WHERE state = ${state} OR jurisdiction = 'National'`);
    allOrgs = rows as unknown as any[];
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_advocacy_orgs`);
    allOrgs = rows as unknown as any[];
  }
  const willingOrgs = allOrgs.filter(o => domainMatch(safeJsonParse(o.domains), domains) && o.coalition_willingness === "high");
  const highInflOrgs = willingOrgs.filter(o => o.influence_score >= 75);

  // Media
  let allMeds: any[];
  if (state) {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1 AND (state = ${state} OR jurisdiction = 'National')`);
    allMeds = rows as unknown as any[];
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM coalition_media WHERE is_active = 1`);
    allMeds = rows as unknown as any[];
  }
  const relevantMeds = allMeds.filter(m => domainMatch(safeJsonParse(m.beat), domains));
  const highReachMeds = relevantMeds.filter(m => m.reach_score >= 75);

  // Score
  const legScore = alignedLegs.length > 0 ? Math.min(100, (alignedLegs.length / 5) * 25 + (highInflLegs.length / 3) * 25) : 0;
  const agScore = relevantAgs.length > 0 ? Math.min(100, (relevantAgs.length / 3) * 25 + (highEffAgs.length / 2) * 25) : 0;
  const orgScore = willingOrgs.length > 0 ? Math.min(100, (willingOrgs.length / 3) * 25 + (highInflOrgs.length / 2) * 25) : 0;
  const medScore = relevantMeds.length > 0 ? Math.min(100, (relevantMeds.length / 3) * 25 + (highReachMeds.length / 2) * 25) : 0;
  const overallReadinessScore = Math.round((legScore * 0.3 + agScore * 0.25 + orgScore * 0.25 + medScore * 0.2));

  const gaps: string[] = [];
  const strengths: string[] = [];
  if (alignedLegs.length === 0) gaps.push("No aligned legislators found for these domains");
  else if (highInflLegs.length >= 3) strengths.push(`${highInflLegs.length} high-influence legislators aligned`);
  if (relevantAgs.length === 0) gaps.push("No relevant enforcement agencies identified");
  else if (highEffAgs.length >= 2) strengths.push(`${highEffAgs.length} highly effective agencies available`);
  if (willingOrgs.length === 0) gaps.push("No willing advocacy organizations found");
  else if (highInflOrgs.length >= 2) strengths.push(`${highInflOrgs.length} high-influence orgs willing to join`);
  if (relevantMeds.length === 0) gaps.push("No media contacts covering these domains");
  else if (highReachMeds.length >= 2) strengths.push(`${highReachMeds.length} high-reach media contacts available`);

  return {
    jurisdiction, domains,
    legislators: { total: allLegs.length, aligned: alignedLegs.length, highInfluence: highInflLegs.length },
    agencies: { total: allAgs.length, relevant: relevantAgs.length, highEffectiveness: highEffAgs.length },
    advocacyOrgs: { total: allOrgs.length, willing: willingOrgs.length, highInfluence: highInflOrgs.length },
    media: { total: allMeds.length, relevant: relevantMeds.length, highReach: highReachMeds.length },
    overallReadinessScore, gaps, strengths,
  };
}

// ── Coalition Recommendation ───────────────────────────────────────────

export async function recommendCoalition(params: {
  jurisdiction: string;
  state?: string;
  domains: string[];
  maxPerType?: number;
}): Promise<CoalitionRecommendation> {
  const { domains, maxPerType = 5 } = params;
  const entities = await searchCoalitionEntities({ ...params, domains, limit: 100 });

  const legislators = entities.filter(e => e.entityType === "legislator").slice(0, maxPerType);
  const agencies = entities.filter(e => e.entityType === "agency").slice(0, maxPerType);
  const advocacyOrgs = entities.filter(e => e.entityType === "advocacy_org").slice(0, maxPerType);
  const media = entities.filter(e => e.entityType === "media").slice(0, maxPerType);

  const all = [...legislators, ...agencies, ...advocacyOrgs, ...media];
  const allDomains = new Set<string>();
  all.forEach(e => e.domains.forEach(d => allDomains.add(d)));
  const avgInfluence = all.length > 0 ? Math.round(all.reduce((s, e) => s + e.influenceScore, 0) / all.length) : 0;

  return {
    legislators, agencies, advocacyOrgs, media,
    totalEntities: all.length,
    coverageDomains: Array.from(allDomains),
    averageInfluence: avgInfluence,
  };
}

// ── Dashboard Stats ────────────────────────────────────────────────────

export async function getCoalitionIntelligenceDashboard(): Promise<{
  totalLegislators: number;
  totalAgencies: number;
  totalAdvocacyOrgs: number;
  totalMedia: number;
  byJurisdiction: Record<string, number>;
  topDomains: { domain: string; count: number }[];
}> {
  const [legCount] = await db.execute(sql`SELECT COUNT(*) as c FROM coalition_legislators WHERE is_active = 1`);
  const [agCount] = await db.execute(sql`SELECT COUNT(*) as c FROM coalition_agencies WHERE is_active = 1`);
  const [orgCount] = await db.execute(sql`SELECT COUNT(*) as c FROM coalition_advocacy_orgs`);
  const [medCount] = await db.execute(sql`SELECT COUNT(*) as c FROM coalition_media WHERE is_active = 1`);

  // Jurisdiction breakdown
  const [legJur] = await db.execute(sql`SELECT jurisdiction_level as j, COUNT(*) as c FROM coalition_legislators GROUP BY jurisdiction_level`);
  const [agJur] = await db.execute(sql`SELECT jurisdiction_level as j, COUNT(*) as c FROM coalition_agencies GROUP BY jurisdiction_level`);
  const byJurisdiction: Record<string, number> = {};
  for (const r of [...(legJur as unknown as any[]), ...(agJur as unknown as any[])]) {
    byJurisdiction[r.j] = (byJurisdiction[r.j] || 0) + Number(r.c);
  }

  // Top domains across all entities
  const domainCounts: Record<string, number> = {};
  const [allLegsData] = await db.execute(sql`SELECT issue_alignment FROM coalition_legislators`);
  for (const r of allLegsData as unknown as any[]) {
    for (const d of safeJsonParse(r.issue_alignment)) {
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    }
  }
  const [allAgsData] = await db.execute(sql`SELECT domains FROM coalition_agencies`);
  for (const r of allAgsData as unknown as any[]) {
    for (const d of safeJsonParse(r.domains)) {
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    }
  }
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([domain, count]) => ({ domain, count }));

  return {
    totalLegislators: Number((legCount as unknown as any[])[0].c),
    totalAgencies: Number((agCount as unknown as any[])[0].c),
    totalAdvocacyOrgs: Number((orgCount as unknown as any[])[0].c),
    totalMedia: Number((medCount as unknown as any[])[0].c),
    byJurisdiction,
    topDomains,
  };
}
