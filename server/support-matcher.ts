import { pool } from "./db";
import { getActiveSignalsByEffect } from "./live-signal-emitter";

export interface MatchInput {
  pipeline_type: string;
  jurisdiction?: string;
  urgency?: "crisis" | "urgent" | "standard" | "informational";
  need_keywords?: string[];
  domain?: string;
  limit?: number;
}

export interface LegacyMatchInput {
  pipelineType: string;
  jurisdiction?: string;
  urgency?: "crisis" | "urgent" | "standard" | "informational";
  needKeywords?: string[];
  domain?: string;
  limit?: number;
}

export interface ScoredResource {
  id: number;
  name: string;
  description: string | null;
  resource_type: string;
  domain: string;
  need_types: string[];
  urgency_level: string;
  state_code: string | null;
  jurisdiction_type: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  agency: string | null;
  category: string | null;
  eligibility_notes: string | null;
  apply_notes: string | null;
  source_table: string;
  source_id: string;
  verification_status: string;
  score: number;
  match_reasons: string[];
  score_breakdown: {
    urgency_score: number;
    location_score: number;
    pipeline_score: number;
    domain_score: number;
    freshness_score: number;
    need_overlap_score: number;
  };
}

export const PIPELINE_DOMAIN_MAP: Record<string, string> = {
  tenant_rights: "housing",
  housing_discrimination: "housing",
  eviction_defense: "housing",
  section8_disputes: "housing",
  voucher_termination: "housing",
  benefits_denial: "benefits",
  snap_denial: "benefits",
  public_assistance_dispute: "benefits",
  social_security_disability: "benefits",
  veterans_benefits: "benefits",
  workplace_discrimination: "employment",
  wrongful_termination: "employment",
  workers_compensation: "employment",
  wage_theft: "employment",
  unemployment_benefits: "employment",
  insurance_claim_denial: "healthcare",
  health_insurance_denial: "healthcare",
  medical_malpractice: "healthcare",
  medicaid_denial: "healthcare",
  medicare_denial: "healthcare",
  domestic_violence: "safety",
  emergency_safety: "safety",
  immediate_threat: "safety",
  human_trafficking: "safety",
  custody: "family",
  custody_dispute: "family",
  family_law: "family",
  child_welfare: "family",
  juvenile_case: "family",
  elder_abuse: "elder",
  eldercare: "elder",
  nursing_home_abuse: "elder",
  disability_rights: "disability",
  ada_accommodation_dispute: "disability",
  debt_collection_abuse: "consumer",
  predatory_lending: "consumer",
  consumer_fraud: "consumer",
  identity_theft: "consumer",
  general_legal_question: "legal",
  pro_se_assistance: "legal",
  complaint_filing: "legal",
  document_review: "legal",
  legal_research: "legal",
  records_request: "legal",
};

export const URGENCY_RANK: Record<string, number> = {
  crisis: 4,
  urgent: 3,
  standard: 2,
  informational: 1,
};

interface ResourceRow {
  id: number;
  name: string;
  description: string | null;
  resource_type: string;
  domain: string;
  need_types: unknown;
  urgency_level: string;
  state_code: string | null;
  jurisdiction_type: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  agency: string | null;
  category: string | null;
  eligibility_notes: string | null;
  apply_notes: string | null;
  source_table: string;
  source_id: string;
  matching_pipeline_types: unknown;
  last_verified_at: number | null;
  verification_status: string;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function scoreResource(row: ResourceRow, input: MatchInput): ScoredResource {
  const needTypes = parseJsonArray(row.need_types);
  const pipelines = parseJsonArray(row.matching_pipeline_types);
  const inputDomain = input.domain || PIPELINE_DOMAIN_MAP[input.pipeline_type] || "general";
  const inputUrgency = URGENCY_RANK[input.urgency || "standard"] || 2;
  const resourceUrgency = URGENCY_RANK[row.urgency_level] || 2;
  const match_reasons: string[] = [];

  const urgency_score = resourceUrgency >= inputUrgency ? 1 : resourceUrgency / inputUrgency;
  if (urgency_score >= 1) match_reasons.push("Urgency level matches your need");

  const location_score = input.jurisdiction && row.state_code === input.jurisdiction
    ? 1
    : (!row.state_code || row.jurisdiction_type === "federal" ? 0.7 : 0.1);
  if (input.jurisdiction && row.state_code === input.jurisdiction) match_reasons.push(`Located in your state (${row.state_code})`);
  else if (!row.state_code || row.jurisdiction_type === "federal") match_reasons.push("Federal program available nationwide");

  const pipeline_score = pipelines.includes(input.pipeline_type) ? 1 : 0.2;
  if (pipeline_score === 1) match_reasons.push(`Directly handles ${input.pipeline_type.replace(/_/g, " ")} cases`);

  const domain_score = row.domain === inputDomain ? 1 : (row.domain === "legal" ? 0.6 : 0.1);
  if (row.domain === inputDomain) match_reasons.push(`${row.domain} domain match`);

  const freshness_score = row.last_verified_at ? 0.7 : 0.5;
  const keywords = input.need_keywords || [];
  const overlap = keywords.filter((keyword) => needTypes.some((need) => need.includes(keyword) || keyword.includes(need)));
  const need_overlap_score = keywords.length ? Math.min(overlap.length / keywords.length, 1) : 0.5;
  if (overlap.length) match_reasons.push(`Covers: ${overlap.join(", ")}`);

  const score = Math.min(
    urgency_score * 0.25 +
      location_score * 0.20 +
      pipeline_score * 0.20 +
      domain_score * 0.15 +
      freshness_score * 0.10 +
      need_overlap_score * 0.10,
    1,
  );

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    resource_type: row.resource_type,
    domain: row.domain,
    need_types: needTypes,
    urgency_level: row.urgency_level,
    state_code: row.state_code,
    jurisdiction_type: row.jurisdiction_type,
    phone: row.phone,
    website: row.website,
    email: row.email,
    agency: row.agency,
    category: row.category,
    eligibility_notes: row.eligibility_notes,
    apply_notes: row.apply_notes,
    source_table: row.source_table,
    source_id: row.source_id,
    verification_status: row.verification_status,
    score,
    match_reasons,
    score_breakdown: { urgency_score, location_score, pipeline_score, domain_score, freshness_score, need_overlap_score },
  };
}

async function fetchCandidateResources(input: MatchInput): Promise<ResourceRow[]> {
  const limit = Math.min(Math.max(input.limit || 5, 1), 100);
  const params: unknown[] = [];
  const filters = ["is_active = true", "verification_status != 'flagged'"];

  if (input.jurisdiction) {
    params.push(input.jurisdiction);
    filters.push(`(state_code = $${params.length} OR state_code IS NULL OR jurisdiction_type = 'federal')`);
  }

  params.push(limit * 4);
  const query = `
    SELECT id, name, description, resource_type, domain, need_types, urgency_level,
           state_code, jurisdiction_type, phone, website, email, agency, category,
           eligibility_notes, apply_notes, source_table, source_id,
           matching_pipeline_types, last_verified_at, verification_status
    FROM unified_resources
    WHERE ${filters.join(" AND ")}
    ORDER BY id DESC
    LIMIT $${params.length}
  `;

  const result = await pool.query(query, params);
  return (Array.isArray(result) ? result[0] : result.rows) as ResourceRow[];
}

export async function match_resources(input: MatchInput): Promise<ScoredResource[]> {
  const limit = Math.min(Math.max(input.limit || 5, 1), 20);
  const rows = await fetchCandidateResources(input);
  const scored = rows
    .map((row) => scoreResource(row, input))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  try {
    const staleSignals = await getActiveSignalsByEffect("RESOURCE_STALE", 200);
    const staleIds = new Set(
      staleSignals
        .filter((signal) => signal.targetTable === "unified_resources" && signal.targetId !== null)
        .map((signal) => signal.targetId as number),
    );
    for (const resource of scored) {
      if (staleIds.has(resource.id)) {
        resource.score = Math.max(0, resource.score - 0.3);
        resource.match_reasons.push("Resource flagged as stale; verify before acting");
      }
    }
  } catch {
    // Signal lookup is advisory and must not block resource matching.
  }

  return scored.sort((a, b) => b.score - a.score);
}

export async function matchResources(input: LegacyMatchInput): Promise<ScoredResource[]> {
  return match_resources({
    pipeline_type: input.pipelineType,
    jurisdiction: input.jurisdiction,
    urgency: input.urgency,
    need_keywords: input.needKeywords,
    domain: input.domain,
    limit: input.limit,
  });
}
