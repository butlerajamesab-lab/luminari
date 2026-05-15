import { db } from "../db";
import { eq, desc, sql, and, gte, like, or } from "drizzle-orm";
import {
  investigativeQueries,
  investigativeResults,
  detectedSignals,
  patternRegistry,
  patternEntitySummary,
  entityEvidenceScores,
  regulatoryEnforcementActions,
  litigationCases,
  federalLitigationCases,
  advocacyReports,
  verifiedReports,
  administrativeDecisions,
  lobbyingActivity,
  crossStreamCorrelations,
  type InvestigativeQueryRow,
  type InvestigativeResultRow,
} from "../../drizzle/schema";
import { renderSafeLanguage } from "./entity-evidence-threshold";

// ─── Query Parser ─────────────────────────────────────────────────────
// Converts natural language investigative queries into structured filters.

export interface ParsedQuery {
  entityType?: string;
  entityName?: string;
  industry?: string;
  jurisdiction?: string;
  claimType?: string;
  complaintThreshold?: number;
  lawsuitThreshold?: number;
  enforcementThreshold?: number;
  signalThreshold?: number;
  timeWindowDays?: number;
  sortBy?: "signal_count" | "complaint_count" | "lawsuit_count" | "confidence" | "stream_count";
  limit?: number;
}

// Keyword patterns for structured parsing
const ENTITY_TYPE_KEYWORDS: Record<string, string> = {
  company: "corporation",
  companies: "corporation",
  corporation: "corporation",
  corporations: "corporation",
  business: "corporation",
  businesses: "corporation",
  agency: "government_agency",
  agencies: "government_agency",
  government: "government_agency",
  telecom: "telecom_company",
  telecoms: "telecom_company",
  nonprofit: "nonprofit",
  nonprofits: "nonprofit",
  landlord: "landlord_entity",
  landlords: "landlord_entity",
  bank: "financial_institution",
  banks: "financial_institution",
  financial: "financial_institution",
  contractor: "contractor_business",
  contractors: "contractor_business",
  organization: "organization",
  organizations: "organization",
};

const SORT_KEYWORDS: Record<string, ParsedQuery["sortBy"]> = {
  complaints: "complaint_count",
  signals: "signal_count",
  lawsuits: "lawsuit_count",
  enforcement: "complaint_count",
  confidence: "confidence",
  streams: "stream_count",
};

const INDUSTRY_KEYWORDS = [
  "telecom", "telecommunications", "banking", "finance", "financial",
  "healthcare", "health", "insurance", "housing", "real estate",
  "energy", "utilities", "education", "technology", "tech",
  "retail", "automotive", "transportation", "media", "food",
  "pharmaceutical", "construction", "agriculture",
];

const JURISDICTION_PATTERNS = [
  /\b(WA|OR|CA|NY|TX|FL|IL|MI|MN|OH|PA|GA|NC|NJ|VA|AZ|CO|MA|MD|WI|MO|TN|IN|SC|AL|LA|KY|OK|CT|IA|MS|AR|KS|NV|NM|NE|WV|ID|HI|ME|NH|RI|MT|DE|SD|ND|AK|VT|WY|DC)\b/,
  /\b(washington|oregon|california|new york|texas|florida|illinois|michigan|minnesota|ohio|pennsylvania|georgia|north carolina|new jersey|virginia|arizona|colorado|massachusetts|maryland|wisconsin)\b/i,
  /\b(federal|national|state|county|city|local)\b/i,
];

export function parseInvestigativeQuery(queryText: string): ParsedQuery {
  const lower = queryText.toLowerCase().trim();
  const parsed: ParsedQuery = {};

  // Extract entity type
  for (const [keyword, entityType] of Object.entries(ENTITY_TYPE_KEYWORDS)) {
    if (lower.includes(keyword)) {
      parsed.entityType = entityType;
      break;
    }
  }

  // Extract numeric thresholds
  const complaintMatch = lower.match(/(?:more than|over|above|>=?|at least)\s*(\d+)\s*complaint/);
  if (complaintMatch) parsed.complaintThreshold = parseInt(complaintMatch[1]);

  const lawsuitMatch = lower.match(/(?:more than|over|above|>=?|at least)\s*(\d+)\s*(?:lawsuit|litigation|case)/);
  if (lawsuitMatch) parsed.lawsuitThreshold = parseInt(lawsuitMatch[1]);

  const enforcementMatch = lower.match(/(?:more than|over|above|>=?|at least)\s*(\d+)\s*(?:enforcement|action|penalty|penaltie)/);
  if (enforcementMatch) parsed.enforcementThreshold = parseInt(enforcementMatch[1]);

  const signalMatch = lower.match(/(?:more than|over|above|>=?|at least)\s*(\d+)\s*signal/);
  if (signalMatch) parsed.signalThreshold = parseInt(signalMatch[1]);

  // If just a number with "complaints" but no comparison word
  if (!parsed.complaintThreshold) {
    const simpleComplaint = lower.match(/(\d+)\+?\s*complaint/);
    if (simpleComplaint) parsed.complaintThreshold = parseInt(simpleComplaint[1]);
  }

  // Extract time window
  const timeMatch = lower.match(/(?:in the (?:last|past)|within)\s*(\d+)\s*(day|week|month|year)/);
  if (timeMatch) {
    const value = parseInt(timeMatch[1]);
    const unit = timeMatch[2];
    const multipliers: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
    parsed.timeWindowDays = value * (multipliers[unit] || 30);
  }

  // Extract industry
  for (const industry of INDUSTRY_KEYWORDS) {
    if (lower.includes(industry)) {
      parsed.industry = industry;
      break;
    }
  }

  // Extract jurisdiction
  for (const pattern of JURISDICTION_PATTERNS) {
    const match = queryText.match(pattern);
    if (match) {
      parsed.jurisdiction = match[1];
      break;
    }
  }

  // Extract sort preference
  if (lower.includes("most") || lower.includes("highest") || lower.includes("top")) {
    for (const [keyword, sortBy] of Object.entries(SORT_KEYWORDS)) {
      if (lower.includes(keyword)) {
        parsed.sortBy = sortBy;
        break;
      }
    }
  }

  // Extract limit
  const limitMatch = lower.match(/(?:top|first|show)\s*(\d+)/);
  if (limitMatch) parsed.limit = parseInt(limitMatch[1]);

  // Check for specific query patterns
  if (lower.includes("enforcement gap") || lower.includes("enforcement silence")) {
    parsed.sortBy = "complaint_count";
    parsed.enforcementThreshold = 0; // looking for entities with complaints but no enforcement
  }

  if (lower.includes("rising") || lower.includes("increasing") || lower.includes("growing")) {
    parsed.timeWindowDays = parsed.timeWindowDays || 90;
    parsed.sortBy = parsed.sortBy || "signal_count";
  }

  if (lower.includes("appeal reversal") || lower.includes("high appeal")) {
    parsed.claimType = "appeal_reversal";
  }

  // Default sort and limit
  if (!parsed.sortBy) parsed.sortBy = "signal_count";
  if (!parsed.limit) parsed.limit = 25;

  return parsed;
}

// ─── Suggested Query Examples ─────────────────────────────────────────

export const SUGGESTED_QUERIES = [
  { text: "Companies with more than 25 complaints", category: "Entity Search" },
  { text: "Industries with enforcement gaps", category: "Enforcement Analysis" },
  { text: "Top 10 entities by signal count", category: "Entity Ranking" },
  { text: "Telecoms with rising complaints in the last 90 days", category: "Trend Analysis" },
  { text: "Agencies with high appeal reversals", category: "Institutional Analysis" },
  { text: "Entities with lawsuits in WA", category: "Jurisdiction Search" },
  { text: "Companies with enforcement actions in healthcare", category: "Industry Search" },
  { text: "Organizations appearing in more than 3 data streams", category: "Cross-Stream" },
  { text: "Top entities by confidence score", category: "Evidence Quality" },
  { text: "Landlords with more than 10 complaints in housing", category: "Sector Focus" },
];

// ─── Cross-Dataset Query Engine ───────────────────────────────────────
// Searches across all data streams and aggregates results by entity.

interface EntityAggregation {
  entityName: string;
  entityType: string;
  signalCount: number;
  complaintCount: number;
  lawsuitCount: number;
  enforcementCount: number;
  streamCount: number;
  confidenceScore: number;
  jurisdictions: Set<string>;
  sourceStreams: Set<string>;
}

export async function executeInvestigativeQuery(
  queryText: string,
  userId?: string
): Promise<{
  queryId: number;
  parsedQuery: ParsedQuery;
  results: InvestigativeResultRow[];
  totalResults: number;
}> {
  const parsedQuery = parseInvestigativeQuery(queryText);

  // Save query to database
  const [inserted] = await db.insert(investigativeQueries).values({
    queryText,
    parsedQuery: parsedQuery as Record<string, unknown>,
    userId: userId || null,
    status: "processing",
    createdAt: Date.now(),
  });
  const queryId = inserted.insertId;

  // Aggregate results across all data streams
  const aggregations = new Map<string, EntityAggregation>();

  // 1. Search live signals
  await searchLiveSignals(parsedQuery, aggregations);

  // 2. Search entity evidence scores (pre-computed)
  await searchEntityEvidenceScores(parsedQuery, aggregations);

  // 3. Search pattern entity summaries
  await searchPatternEntitySummaries(parsedQuery, aggregations);

  // 4. Search regulatory enforcement actions
  await searchEnforcementActions(parsedQuery, aggregations);

  // 5. Search litigation cases
  await searchLitigationCases(parsedQuery, aggregations);

  // 6. Search advocacy reports
  await searchAdvocacyReports(parsedQuery, aggregations);

  // 7. Search cross-stream correlations
  await searchCrossStreamCorrelations(parsedQuery, aggregations);

  // Apply filters and rank results
  let results = Array.from(aggregations.values());

  // Apply thresholds
  if (parsedQuery.complaintThreshold) {
    results = results.filter(r => r.complaintCount >= parsedQuery.complaintThreshold!);
  }
  if (parsedQuery.lawsuitThreshold) {
    results = results.filter(r => r.lawsuitCount >= parsedQuery.lawsuitThreshold!);
  }
  if (parsedQuery.enforcementThreshold !== undefined) {
    if (parsedQuery.enforcementThreshold === 0) {
      // Enforcement gap: entities with complaints but no enforcement
      results = results.filter(r => r.enforcementCount === 0 && r.complaintCount > 0);
    } else {
      results = results.filter(r => r.enforcementCount >= parsedQuery.enforcementThreshold!);
    }
  }
  if (parsedQuery.signalThreshold) {
    results = results.filter(r => r.signalCount >= parsedQuery.signalThreshold!);
  }

  // Filter by entity type
  if (parsedQuery.entityType) {
    results = results.filter(r => r.entityType === parsedQuery.entityType);
  }

  // Filter by jurisdiction
  if (parsedQuery.jurisdiction) {
    const jur = parsedQuery.jurisdiction.toLowerCase();
    results = results.filter(r => {
      for (const j of r.jurisdictions) {
        if (j.toLowerCase().includes(jur)) return true;
      }
      return false;
    });
  }

  // Sort results
  results = rankResults(results, parsedQuery.sortBy || "signal_count");

  // Apply limit
  const totalResults = results.length;
  results = results.slice(0, parsedQuery.limit || 25);

  // Save results to database
  const savedResults: InvestigativeResultRow[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const safeLanguageSummary = renderSafeLanguage(r.entityName, {
      complaintCount: r.complaintCount,
      lawsuitCount: r.lawsuitCount,
      enforcementCount: r.enforcementCount,
      streamCount: r.streamCount,
    });

    const [ins] = await db.insert(investigativeResults).values({
      queryId,
      entityName: r.entityName,
      entityType: r.entityType,
      signalCount: r.signalCount,
      complaintCount: r.complaintCount,
      lawsuitCount: r.lawsuitCount,
      enforcementCount: r.enforcementCount,
      streamCount: r.streamCount,
      confidenceScore: r.confidenceScore,
      jurisdictions: Array.from(r.jurisdictions),
      sourceStreams: Array.from(r.sourceStreams),
      rank: i + 1,
      safeLanguageSummary,
    });

    savedResults.push({
      id: ins.insertId,
      queryId,
      entityName: r.entityName,
      entityType: r.entityType,
      signalCount: r.signalCount,
      complaintCount: r.complaintCount,
      lawsuitCount: r.lawsuitCount,
      enforcementCount: r.enforcementCount,
      streamCount: r.streamCount,
      confidenceScore: r.confidenceScore,
      jurisdictions: Array.from(r.jurisdictions),
      sourceStreams: Array.from(r.sourceStreams),
      rank: i + 1,
      safeLanguageSummary,
    });
  }

  // Update query status
  await db.update(investigativeQueries)
    .set({ status: "completed", resultCount: totalResults })
    .where(eq(investigativeQueries.id, queryId));

  return { queryId, parsedQuery, results: savedResults, totalResults };
}

// ─── Data Stream Search Functions ─────────────────────────────────────

function getOrCreate(map: Map<string, EntityAggregation>, entityName: string, entityType?: string): EntityAggregation {
  const key = entityName.toLowerCase().trim();
  if (!map.has(key)) {
    map.set(key, {
      entityName,
      entityType: entityType || "unknown",
      signalCount: 0,
      complaintCount: 0,
      lawsuitCount: 0,
      enforcementCount: 0,
      streamCount: 0,
      confidenceScore: 0,
      jurisdictions: new Set(),
      sourceStreams: new Set(),
    });
  }
  const agg = map.get(key)!;
  if (entityType && entityType !== "unknown" && agg.entityType === "unknown") {
    agg.entityType = entityType;
  }
  return agg;
}

async function searchLiveSignals(parsed: ParsedQuery, agg: Map<string, EntityAggregation>): Promise<void> {
  try {
    const conditions: any[] = [];
    if (parsed.entityType) {
      conditions.push(sql`${detectedSignals.entityRole} = ${parsed.entityType}` as any);
    }
    if (parsed.jurisdiction) {
      conditions.push(like(detectedSignals.jurisdictionScope, `%${parsed.jurisdiction}%`));
    }

    const signals = await db.select().from(detectedSignals)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(500);

    for (const sig of signals) {
      const entityName = sig.entityId || sig.plainLanguageExplanation;
      if (!entityName || entityName.length < 2) continue;

      const entry = getOrCreate(agg, entityName, sig.entityRole || undefined);
      entry.signalCount++;
      if (sig.signalType === "frequency_spike" || sig.signalType === "repeat_entity") {
        entry.complaintCount += 1;
      }
      if (sig.jurisdictionScope) entry.jurisdictions.add(sig.jurisdictionScope);
      entry.sourceStreams.add("detected_signals");
    }
  } catch { /* table may not exist yet */ }
}

async function searchEntityEvidenceScores(parsed: ParsedQuery, agg: Map<string, EntityAggregation>): Promise<void> {
  try {
    const scores = await db.select().from(entityEvidenceScores).limit(500);

    for (const score of scores) {
      const entry = getOrCreate(agg, score.entityName);
      entry.signalCount = Math.max(entry.signalCount, score.signalCount || 0);
      entry.complaintCount = Math.max(entry.complaintCount, score.complaintCount || 0);
      entry.lawsuitCount = Math.max(entry.lawsuitCount, score.lawsuitCount || 0);
      entry.enforcementCount = Math.max(entry.enforcementCount, score.enforcementCount || 0);
      entry.streamCount = Math.max(entry.streamCount, score.streamCount || 0);
      entry.confidenceScore = Math.max(entry.confidenceScore, score.confidenceScore || 0);
      entry.sourceStreams.add("entity_evidence");
    }
  } catch { /* table may not exist yet */ }
}

async function searchPatternEntitySummaries(parsed: ParsedQuery, agg: Map<string, EntityAggregation>): Promise<void> {
  try {
    const summaries = await db.select().from(patternEntitySummary).limit(500);

    for (const s of summaries) {
      const entry = getOrCreate(agg, s.entityName, s.entityType || undefined);
      entry.complaintCount = Math.max(entry.complaintCount, s.complaintCount || 0);
      entry.lawsuitCount = Math.max(entry.lawsuitCount, s.lawsuitCount || 0);
      entry.enforcementCount = Math.max(entry.enforcementCount, s.enforcementActions || 0);
      entry.confidenceScore = Math.max(entry.confidenceScore, s.confidenceScore || 0);
      entry.sourceStreams.add("pattern_entity_summary");
    }
  } catch { /* table may not exist yet */ }
}

async function searchEnforcementActions(parsed: ParsedQuery, agg: Map<string, EntityAggregation>): Promise<void> {
  try {
    const conditions: any[] = [];
    if (parsed.jurisdiction) {
      conditions.push(like(regulatoryEnforcementActions.jurisdiction, `%${parsed.jurisdiction}%`));
    }
    if (parsed.industry) {
      conditions.push(like(regulatoryEnforcementActions.industry, `%${parsed.industry}%`));
    }

    const actions = conditions.length > 0
      ? await db.select().from(regulatoryEnforcementActions).where(and(...conditions)).limit(500)
      : await db.select().from(regulatoryEnforcementActions).limit(500);

    for (const action of actions) {
      const entry = getOrCreate(agg, action.entityName);
      entry.enforcementCount++;
      if (action.jurisdiction) entry.jurisdictions.add(action.jurisdiction);
      if (action.industry) entry.entityType = "corporation";
      entry.sourceStreams.add("regulatory_enforcement");
    }
  } catch { /* table may not exist yet */ }
}

async function searchLitigationCases(parsed: ParsedQuery, agg: Map<string, EntityAggregation>): Promise<void> {
  try {
    const conditions: any[] = [];
    if (parsed.jurisdiction) {
      conditions.push(like(litigationCases.jurisdiction, `%${parsed.jurisdiction}%`));
    }
    if (parsed.industry) {
      conditions.push(like(litigationCases.industry, `%${parsed.industry}%`));
    }

    const cases = conditions.length > 0
      ? await db.select().from(litigationCases).where(and(...conditions)).limit(500)
      : await db.select().from(litigationCases).limit(500);

    for (const c of cases) {
      if (c.defendantName) {
        const entry = getOrCreate(agg, c.defendantName);
        entry.lawsuitCount++;
        if (c.jurisdiction) entry.jurisdictions.add(c.jurisdiction);
        entry.sourceStreams.add("litigation");
      }
    }
  } catch { /* table may not exist yet */ }

  // Also search federal litigation
  try {
    const fedCases = await db.select().from(federalLitigationCases).limit(500);
    for (const c of fedCases) {
      if (c.defendantName) {
        const entry = getOrCreate(agg, c.defendantName);
        entry.lawsuitCount++;
        if (c.jurisdiction) entry.jurisdictions.add(c.jurisdiction);
        entry.sourceStreams.add("federal_litigation");
      }
    }
  } catch { /* table may not exist yet */ }
}

async function searchAdvocacyReports(parsed: ParsedQuery, agg: Map<string, EntityAggregation>): Promise<void> {
  try {
    const conditions: any[] = [];
    if (parsed.jurisdiction) {
      conditions.push(like(advocacyReports.jurisdiction, `%${parsed.jurisdiction}%`));
    }
    if (parsed.industry) {
      conditions.push(like(advocacyReports.industry, `%${parsed.industry}%`));
    }

    const reports = conditions.length > 0
      ? await db.select().from(advocacyReports).where(and(...conditions)).limit(500)
      : await db.select().from(advocacyReports).limit(500);

    for (const r of reports) {
      if (r.entityNamed) {
        const entry = getOrCreate(agg, r.entityNamed);
        entry.signalCount++;
        if (r.jurisdiction) entry.jurisdictions.add(r.jurisdiction);
        entry.sourceStreams.add("advocacy");
      }
    }
  } catch { /* table may not exist yet */ }
}

async function searchCrossStreamCorrelations(parsed: ParsedQuery, agg: Map<string, EntityAggregation>): Promise<void> {
  try {
    const correlations = await db.select().from(crossStreamCorrelations).limit(500);

    for (const c of correlations) {
      if (c.entity) {
        const entry = getOrCreate(agg, c.entity);
        entry.streamCount = Math.max(entry.streamCount, c.streamCount || 0);
        const boost = parseFloat(String(c.confidenceBoost || "0"));
        entry.confidenceScore = Math.max(entry.confidenceScore, Math.round(boost * 100));
        entry.sourceStreams.add("cross_stream_correlation");
      }
    }
  } catch { /* table may not exist yet */ }
}

// ─── Result Ranking ───────────────────────────────────────────────────

export function rankResults(
  results: EntityAggregation[],
  sortBy: string
): EntityAggregation[] {
  // Compute stream count from sourceStreams set
  for (const r of results) {
    r.streamCount = Math.max(r.streamCount, r.sourceStreams.size);
  }

  // Compute confidence if not already set
  for (const r of results) {
    if (r.confidenceScore === 0) {
      r.confidenceScore = computeConfidence(r);
    }
  }

  // Sort
  const sortFn: Record<string, (a: EntityAggregation, b: EntityAggregation) => number> = {
    signal_count: (a, b) => b.signalCount - a.signalCount,
    complaint_count: (a, b) => b.complaintCount - a.complaintCount,
    lawsuit_count: (a, b) => b.lawsuitCount - a.lawsuitCount,
    confidence: (a, b) => b.confidenceScore - a.confidenceScore,
    stream_count: (a, b) => b.streamCount - a.streamCount,
  };

  return results.sort(sortFn[sortBy] || sortFn.signal_count);
}

function computeConfidence(r: EntityAggregation): number {
  let score = 0;
  // Signal volume (max 30)
  score += Math.min(30, r.signalCount * 3);
  // Multi-stream bonus (max 25)
  score += Math.min(25, r.streamCount * 5);
  // Geographic spread (max 20)
  score += Math.min(20, r.jurisdictions.size * 4);
  // Evidence strength (max 25)
  score += Math.min(10, r.lawsuitCount * 5);
  score += Math.min(10, r.enforcementCount * 10);
  score += Math.min(5, r.complaintCount > 10 ? 5 : r.complaintCount > 5 ? 3 : 0);
  return Math.min(100, Math.round(score));
}

// ─── Query History ────────────────────────────────────────────────────

export async function getQueryHistory(userId?: string, limit = 20): Promise<InvestigativeQueryRow[]> {
  if (userId) {
    return db.select().from(investigativeQueries)
      .where(eq(investigativeQueries.userId, userId))
      .orderBy(desc(investigativeQueries.createdAt))
      .limit(limit);
  }
  return db.select().from(investigativeQueries)
    .orderBy(desc(investigativeQueries.createdAt))
    .limit(limit);
}

export async function getQueryResults(queryId: number): Promise<InvestigativeResultRow[]> {
  return db.select().from(investigativeResults)
    .where(eq(investigativeResults.queryId, queryId))
    .orderBy(investigativeResults.rank)
    .limit(100);
}

// ─── Stats ────────────────────────────────────────────────────────────

export async function getInvestigativeQueryStats(): Promise<{
  totalQueries: number;
  completedQueries: number;
  totalResults: number;
  avgResultsPerQuery: number;
}> {
  const [queryStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    completed: sql<number>`SUM(CASE WHEN ${investigativeQueries.status} = 'completed' THEN 1 ELSE 0 END)`,
  }).from(investigativeQueries);

  const [resultStats] = await db.select({
    total: sql<number>`COUNT(*)`,
  }).from(investigativeResults);

  const totalQueries = Number(queryStats?.total || 0);
  const completedQueries = Number(queryStats?.completed || 0);
  const totalResults = Number(resultStats?.total || 0);

  return {
    totalQueries,
    completedQueries,
    totalResults,
    avgResultsPerQuery: completedQueries > 0 ? Math.round(totalResults / completedQueries) : 0,
  };
}
