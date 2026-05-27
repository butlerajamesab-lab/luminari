/**
 * Unified Support Matching Engine
 *
 * Two-phase pipeline:
 *   Phase 1: Hard Filter — jurisdiction, active status, pipeline type match
 *   Phase 2: Weighted Scoring — urgency alignment, domain match, need overlap, freshness decay, diversity
 *
 * Output: Top 5 scored resources with "why this matched" explanations
 * Constraint: At least 2 different resource types in the top 5
 */

import { pool } from "./db";
import { getActiveSignalsByEffect } from "./live-signal-emitter";

// ─── Types ───

export interface MatchInput {
  pipeline_type: string;        // from intake autodetect
  jurisdiction?: string;        // state code (e.g., "WA") or null for federal
  urgency?: "crisis" | "urgent" | "standard" | "informational";
  need_keywords?: string[];     // free-text need signals from intake
  domain?: string;              // domain hint from pipeline
  limit?: number;               // max results (default 5)
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

// ─── Domain Mapping: pipeline type → domain ───

const PIPELINE_DOMAIN_MAP: Record<string, string> = {
  // Housing
  tenant_rights: "housing", housing_discrimination: "housing", eviction_defense: "housing",
  section8_disputes: "housing", hoa_disputes: "housing", landlord_harassment: "housing",
  foreclosure_dispute: "housing", property_rights: "housing", mobile_home_park_dispute: "housing",
  utility_shutoff_abuse: "housing", code_enforcement_retaliation: "housing",
  voucher_termination: "housing", tribal_housing: "housing",
  lgbtq_housing_discrimination: "housing", short_term_rental_dispute: "housing",
  // Benefits
  benefits_denial: "benefits", snap_denial: "benefits", public_assistance_dispute: "benefits",
  benefits_overpayment_recoupment: "benefits", social_security_disability: "benefits",
  veterans_benefits: "benefits", medicaid_ltc_eligibility: "benefits",
  // Employment
  workplace_discrimination: "employment", wrongful_termination: "employment",
  workers_compensation: "employment", wage_theft: "employment", labor_violation: "employment",
  workplace_harassment: "employment", unemployment_benefits: "employment",
  gig_worker_misclassification: "employment", non_compete_dispute: "employment",
  wage_garnishment_error: "employment", workplace_surveillance: "employment",
  lgbtq_workplace_harassment: "employment",
  // Healthcare
  insurance_claim_denial: "healthcare", health_insurance_denial: "healthcare",
  medical_malpractice: "healthcare", medicaid_denial: "healthcare", medicare_denial: "healthcare",
  hospital_billing_abuse: "healthcare", medical_record_access: "healthcare",
  disability_claim_denial: "healthcare", prior_authorization_abuse: "healthcare",
  surprise_billing: "healthcare", pharmacy_benefit_manager_dispute: "healthcare",
  medical_device_injury: "healthcare", lgbtq_healthcare_denial: "healthcare",
  // Safety
  domestic_violence: "safety", domestic_violence_emergency: "safety",
  emergency_safety: "safety", immediate_threat: "safety", human_trafficking: "safety",
  child_endangerment: "safety", missing_person: "safety",
  // Family
  custody: "family", custody_dispute: "family", family_law: "family",
  child_abuse: "family", child_welfare: "family", foster_care: "family",
  juvenile_case: "family", guardianship: "family", parental_rights_termination: "family",
  family_services_failure: "family", child_support_modification: "family",
  adoption_disruption: "family", kinship_placement_dispute: "family",
  supervised_visitation_dispute: "family", family_separation_case: "family",
  // Elder
  elder_abuse: "elder", eldercare: "elder", nursing_home_abuse: "elder",
  guardianship_abuse: "elder", long_term_care_neglect: "elder",
  elder_financial_exploitation: "elder", vulnerable_adult_protection: "elder",
  medicare_elder_fraud: "elder",
  // Disability
  disability_rights: "disability", ada_accommodation_dispute: "disability",
  home_health_agency_misconduct: "disability",
  // Consumer/Finance
  debt_collection_abuse: "consumer", predatory_lending: "consumer",
  bankruptcy_dispute: "consumer", tax_dispute: "consumer", consumer_fraud: "consumer",
  identity_theft: "consumer", financial_exploitation: "consumer",
  securities_fraud: "consumer", crypto_fraud: "consumer",
  online_marketplace_fraud: "consumer", subscription_trap_billing: "consumer",
  bank_account_closure: "consumer",
  // Legal
  general_legal_question: "legal", pro_se_assistance: "legal",
  complaint_filing: "legal", document_review: "legal", legal_research: "legal",
  records_request: "legal",
  // Mental Health
  involuntary_hold: "healthcare", polypharmacy_harm: "healthcare",
  discharge_failure: "healthcare", restraint_seclusion: "healthcare",
  record_correction: "healthcare",
};

// ─── Urgency Weights ───

const URGENCY_RANK: Record<string, number> = {
  crisis: 4,
  urgent: 3,
  standard: 2,
  informational: 1,
};

// ─── Phase 1: Hard Filter ───

interface Phase1Result {
  id: number;
  name: string;
  description: string | null;
  resource_type: string;
  domain: string;
  need_types: string;      // JSON string
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
  matching_pipeline_types: string; // JSON string
  last_verified_at: number | null;
  soft_signals: string | null;    // JSON string
  match_explanation_template: string | null;
  verification_status: string;    // verified | unverified | flagged
}

async function phase1_hard_filter(input: MatchInput): Promise<Phase1Result[]> {
  const { pipeline_type, jurisdiction } = input;
  const selected_columns = `
    id,
    name,
    description,
    resource_type,
    domain,
    need_types,
    urgency_level,
    state_code,
    jurisdiction_type,
    phone,
    website,
    email,
    agency,
    category,
    eligibility_notes,
    apply_notes,
    source_table,
    source_id,
    matching_pipeline_types,
    last_verified_at,
    soft_signals,
    match_explanation_template,
    verification_status
  `;

  // Build the query — filter by active + pipeline type match.
  // The database contract and runtime payload are snake_case.
  let query: string;
  let params: any[];

  if (jurisdiction) {
    // If jurisdiction provided: return resources that match the state OR are federal
    query = `
      SELECT ${selected_columns}
      FROM unified_resources
      WHERE is_active = true
        AND verification_status != 'flagged'
        AND JSON_CONTAINS(matching_pipeline_types, ?)
        AND (state_code = ? OR state_code IS NULL OR jurisdiction_type = 'federal')
      ORDER BY urgency_level DESC
      LIMIT 100
    `;
    params = [JSON.stringify(pipeline_type), jurisdiction];
  } else {
    // No jurisdiction: return all matching resources (federal + all states)
    query = `
      SELECT ${selected_columns}
      FROM unified_resources
      WHERE is_active = true
        AND verification_status != 'flagged'
        AND JSON_CONTAINS(matching_pipeline_types, ?)
      ORDER BY urgency_level DESC
      LIMIT 100
    `;
    params = [JSON.stringify(pipeline_type)];
  }

  const [rows] = await pool.query(query, params);
  return rows as Phase1Result[];
}

// ─── Phase 2: Weighted Scoring ───

function phase2_score(resources: Phase1Result[], input: MatchInput): ScoredResource[] {
  const input_domain = input.domain || PIPELINE_DOMAIN_MAP[input.pipeline_type] || "general";
  const input_urgency = URGENCY_RANK[input.urgency || "standard"] || 2;
  const now = Date.now();
  const thirty_days = 30 * 24 * 60 * 60 * 1000;
  const six_months = 180 * 24 * 60 * 60 * 1000;

  return resources.map(r => {
    const need_types = safe_parse_json<string[]>(r.need_types, []);
    const match_reasons: string[] = [];

    // ─── Score Components (each 0.0 - 1.0) ───

    // 1. Urgency alignment (weight: 0.25)
    const resource_urgency = URGENCY_RANK[r.urgency_level] || 2;
    let urgency_score = 0;
    if (resource_urgency >= input_urgency) {
      urgency_score = 1.0; // Resource meets or exceeds urgency need
      if (resource_urgency === 4) match_reasons.push("Crisis-level support available");
      else if (resource_urgency >= input_urgency) match_reasons.push("Urgency level matches your need");
    } else {
      urgency_score = resource_urgency / input_urgency; // Partial credit
    }

    // 2. Location match (weight: 0.20)
    let location_score = 0;
    if (input.jurisdiction && r.state_code === input.jurisdiction) {
      location_score = 1.0;
      match_reasons.push(`Located in your state (${r.state_code})`);
    } else if (!r.state_code || r.jurisdiction_type === "federal") {
      location_score = 0.7; // Federal resources are broadly available
      match_reasons.push("Federal program — available nationwide");
    } else {
      location_score = 0.1; // Wrong state
    }

    // 3. Pipeline type match (weight: 0.20)
    const matching_pipelines = safe_parse_json<string[]>(r.matching_pipeline_types, []);
    let pipeline_score = 0;
    if (matching_pipelines.includes(input.pipeline_type)) {
      pipeline_score = 1.0;
      match_reasons.push(`Directly handles ${input.pipeline_type.replace(/_/g, " ")} cases`);
    }

    // 4. Domain match (weight: 0.15)
    let domain_score = 0;
    if (r.domain === input_domain) {
      domain_score = 1.0;
      match_reasons.push(`${r.domain} domain match`);
    } else if (r.domain === "legal") {
      domain_score = 0.6; // Legal aid is broadly useful
      match_reasons.push("Legal aid — applicable across domains");
    } else {
      domain_score = 0.1;
    }

    // 5. Freshness decay (weight: 0.10)
    let freshness_score = 0.5; // Default for unknown
    if (r.last_verified_at) {
      const age = now - r.last_verified_at;
      if (age < thirty_days) {
        freshness_score = 1.0;
      } else if (age < six_months) {
        freshness_score = 0.7;
      } else {
        freshness_score = 0.3;
        match_reasons.push("Note: resource data may be outdated — verify before acting");
      }
    }

    // 5b. Verification bonus/penalty
    let verification_modifier = 0;
    if (r.verification_status === "verified") {
      verification_modifier = 0.05; // Small boost for verified resources
      match_reasons.push("✓ Verified resource");
    } else if (r.verification_status === "unverified") {
      verification_modifier = 0; // Neutral
    }
    // flagged resources are already excluded in Phase 1

    // 6. Need keyword overlap (weight: 0.10)
    let need_overlap_score = 0;
    if (input.need_keywords && input.need_keywords.length > 0) {
      const overlap = input.need_keywords.filter(k =>
        need_types.some(n => n.includes(k) || k.includes(n))
      );
      need_overlap_score = Math.min(overlap.length / input.need_keywords.length, 1.0);
      if (overlap.length > 0) match_reasons.push(`Covers: ${overlap.join(", ")}`);
    } else {
      need_overlap_score = 0.5; // No keywords to match against
    }

    // ─── Weighted Total ───
    const score = (
      urgency_score * 0.25 +
      location_score * 0.20 +
      pipeline_score * 0.20 +
      domain_score * 0.15 +
      freshness_score * 0.10 +
      need_overlap_score * 0.10
    );

    // ─── Bonus: enforcement paths get a boost (they're directly actionable) ───
    const action_bonus = r.resource_type === "enforcement_path" ? 0.10 : 0;

    // ─── Verification modifier ───
    const total_score = Math.min(score + action_bonus + verification_modifier, 1.0);

    return {
      id: r.id,
      name: r.name,
      description: r.description,
      resource_type: r.resource_type,
      domain: r.domain,
      need_types,
      urgency_level: r.urgency_level,
      state_code: r.state_code,
      jurisdiction_type: r.jurisdiction_type,
      phone: r.phone,
      website: r.website,
      email: r.email,
      agency: r.agency,
      category: r.category,
      eligibility_notes: r.eligibility_notes,
      apply_notes: r.apply_notes,
      source_table: r.source_table,
      source_id: r.source_id,
      score: total_score,
      verification_status: r.verification_status,
      match_reasons,
      score_breakdown: {
        urgency_score,
        location_score,
        pipeline_score,
        domain_score,
        freshness_score,
        need_overlap_score,
      },
    };
  });
}

// ─── Diversity Constraint ───

function enforce_diversity(scored: ScoredResource[], limit: number): ScoredResource[] {
  if (scored.length <= limit) return scored;

  // Sort by score descending
  const sorted = [...scored].sort((a, b) => b.score - a.score);

  const result: ScoredResource[] = [];
  const type_counts: Record<string, number> = {};
  const max_per_type = Math.ceil(limit * 0.6); // No more than 60% from one type

  // First pass: pick top items respecting diversity
  for (const item of sorted) {
    if (result.length >= limit) break;
    const count = type_counts[item.resource_type] || 0;
    if (count < max_per_type) {
      result.push(item);
      type_counts[item.resource_type] = count + 1;
    }
  }

  // Second pass: if we don't have enough, fill from remaining
  if (result.length < limit) {
    const used_ids = new Set(result.map(r => r.id));
    for (const item of sorted) {
      if (result.length >= limit) break;
      if (!used_ids.has(item.id)) {
        result.push(item);
      }
    }
  }

  // Check diversity: ensure at least 2 different resource types if possible
  const unique_types = new Set(result.map(r => r.resource_type));
  if (unique_types.size < 2 && scored.length > limit) {
    // Find the lowest-scored item in result and swap with highest-scored different-type item
    const result_types = result.map(r => r.resource_type);
    const dominant_type = result_types.sort((a, b) =>
      result_types.filter(t => t === b).length - result_types.filter(t => t === a).length
    )[0];

    const different_type_item = sorted.find(s =>
      s.resource_type !== dominant_type && !result.some(r => r.id === s.id)
    );

    if (different_type_item) {
      // Replace the lowest-scored item of the dominant type
      const lowest_idx = result.reduce((min_idx, item, idx) =>
        item.resource_type === dominant_type && item.score < result[min_idx].score ? idx : min_idx
      , 0);
      result[lowest_idx] = different_type_item;
    }
  }

  // Re-sort by score
  return result.sort((a, b) => b.score - a.score);
}

// ─── Main Entry Point ───

export async function match_resources(input: MatchInput): Promise<ScoredResource[]> {
  const limit = input.limit || 5;

  // Phase 1: Hard filter
  const filtered = await phase1_hard_filter(input);

  if (filtered.length === 0) {
    // Fallback: try without pipeline type restriction, just domain
    return [];
  }

  // Phase 2: Score
  const scored = phase2_score(filtered, input);

  // Phase 2b: Signal-aware score adjustment
  // RESOURCE_STALE signals apply a 0.30 penalty to affected resources
  // POLICY_CHANGE signals apply a 0.10 boost (resource is newly relevant)
  try {
    const [stale_signals, policy_signals] = await Promise.all([
      getActiveSignalsByEffect("RESOURCE_STALE", 200),
      getActiveSignalsByEffect("POLICY_CHANGE", 200),
    ]);
    const stale_ids = new Set(
      stale_signals
        .filter(s => s.targetTable === "unified_resources" && s.targetId !== null)
        .map(s => s.targetId as number)
    );
    const policy_ids = new Set(
      policy_signals
        .filter(s => s.targetTable === "unified_resources" && s.targetId !== null)
        .map(s => s.targetId as number)
    );
    for (const r of scored) {
      if (stale_ids.has(r.id)) {
        r.score = Math.max(0, r.score - 0.30);
        r.match_reasons.push("⚠ Resource flagged as stale — verify before acting");
      }
      if (policy_ids.has(r.id)) {
        r.score = Math.min(1.0, r.score + 0.10);
        r.match_reasons.push("↑ Policy change detected — resource may have new eligibility");
      }
    }
  } catch { /* non-fatal: signal lookup failure should not block matching */ }

  // Phase 3: Diversity constraint + limit
  return enforce_diversity(scored, limit);
}

// ─── Helpers ───

function safe_parse_json<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  if (typeof val === "object") return val as T;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// ─── Exported for testing ───
export {
  phase1_hard_filter,
  phase2_score,
  enforce_diversity,
  PIPELINE_DOMAIN_MAP,
  URGENCY_RANK,
};

// Legacy named exports are intentionally not kept. Snake_case is the runtime contract.
