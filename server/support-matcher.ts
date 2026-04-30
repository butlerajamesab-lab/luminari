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

import { db, pool } from "./db";
import { sql } from "drizzle-orm";

// ─── Types ───

export interface MatchInput {
  pipelineType: string;        // from intake autodetect
  jurisdiction?: string;       // state code (e.g., "WA") or null for federal
  urgency?: "crisis" | "urgent" | "standard" | "informational";
  needKeywords?: string[];     // free-text need signals from intake
  domain?: string;             // domain hint from pipeline
  limit?: number;              // max results (default 5)
}

export interface ScoredResource {
  id: number;
  name: string;
  description: string | null;
  resourceType: string;
  domain: string;
  needTypes: string[];
  urgencyLevel: string;
  stateCode: string | null;
  jurisdictionType: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  agency: string | null;
  category: string | null;
  eligibilityNotes: string | null;
  applyNotes: string | null;
  sourceTable: string;
  sourceId: string;
  // Verification
  verificationStatus: string;
  // Scoring
  score: number;
  matchReasons: string[];
  scoreBreakdown: {
    urgencyScore: number;
    locationScore: number;
    pipelineScore: number;
    domainScore: number;
    freshnessScore: number;
    needOverlapScore: number;
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
  resourceType: string;
  domain: string;
  needTypes: string;      // JSON string
  urgencyLevel: string;
  stateCode: string | null;
  jurisdictionType: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  agency: string | null;
  category: string | null;
  eligibilityNotes: string | null;
  applyNotes: string | null;
  sourceTable: string;
  sourceId: string;
  matchingPipelineTypes: string; // JSON string
  lastVerifiedAt: number | null;
  softSignals: string | null;    // JSON string
  matchExplanationTemplate: string | null;
  verificationStatus: string;    // verified | unverified | flagged
}

async function phase1HardFilter(input: MatchInput): Promise<Phase1Result[]> {
  const { pipelineType, jurisdiction } = input;
  
  // Build the query — filter by active + pipeline type match
  // We use JSON_CONTAINS to check if the pipelineType is in matchingPipelineTypes array
  let query: string;
  let params: any[];
  
  if (jurisdiction) {
    // If jurisdiction provided: return resources that match the state OR are federal
    query = `
      SELECT id, name, description, resourceType, domain, needTypes, urgencyLevel,
             stateCode, jurisdictionType, phone, website, email, agency, category,
             eligibilityNotes, applyNotes, sourceTable, sourceId,
             matchingPipelineTypes, lastVerifiedAt, softSignals, matchExplanationTemplate,
             verificationStatus
      FROM unified_resources
      WHERE isActive = true
        AND verificationStatus != 'flagged'
        AND JSON_CONTAINS(matchingPipelineTypes, ?)
        AND (stateCode = ? OR stateCode IS NULL OR jurisdictionType = 'federal')
      ORDER BY urgencyLevel DESC
      LIMIT 100
    `;
    params = [JSON.stringify(pipelineType), jurisdiction];
  } else {
    // No jurisdiction: return all matching resources (federal + all states)
    query = `
      SELECT id, name, description, resourceType, domain, needTypes, urgencyLevel,
             stateCode, jurisdictionType, phone, website, email, agency, category,
             eligibilityNotes, applyNotes, sourceTable, sourceId,
             matchingPipelineTypes, lastVerifiedAt, softSignals, matchExplanationTemplate,
             verificationStatus
      FROM unified_resources
      WHERE isActive = true
        AND verificationStatus != 'flagged'
        AND JSON_CONTAINS(matchingPipelineTypes, ?)
      ORDER BY urgencyLevel DESC
      LIMIT 100
    `;
    params = [JSON.stringify(pipelineType)];
  }
  
  const [rows] = await pool.query(query, params);
  return rows as Phase1Result[];
}

// ─── Phase 2: Weighted Scoring ───

function phase2Score(resources: Phase1Result[], input: MatchInput): ScoredResource[] {
  const inputDomain = input.domain || PIPELINE_DOMAIN_MAP[input.pipelineType] || "general";
  const inputUrgency = URGENCY_RANK[input.urgency || "standard"] || 2;
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const SIX_MONTHS = 180 * 24 * 60 * 60 * 1000;
  
  return resources.map(r => {
    const needTypes = safeParseJson<string[]>(r.needTypes, []);
    const matchReasons: string[] = [];
    
    // ─── Score Components (each 0.0 - 1.0) ───
    
    // 1. Urgency alignment (weight: 0.25)
    const resourceUrgency = URGENCY_RANK[r.urgencyLevel] || 2;
    let urgencyScore = 0;
    if (resourceUrgency >= inputUrgency) {
      urgencyScore = 1.0; // Resource meets or exceeds urgency need
      if (resourceUrgency === 4) matchReasons.push("Crisis-level support available");
      else if (resourceUrgency >= inputUrgency) matchReasons.push("Urgency level matches your need");
    } else {
      urgencyScore = resourceUrgency / inputUrgency; // Partial credit
    }
    
    // 2. Location match (weight: 0.20)
    let locationScore = 0;
    if (input.jurisdiction && r.stateCode === input.jurisdiction) {
      locationScore = 1.0;
      matchReasons.push(`Located in your state (${r.stateCode})`);
    } else if (!r.stateCode || r.jurisdictionType === "federal") {
      locationScore = 0.7; // Federal resources are broadly available
      matchReasons.push("Federal program — available nationwide");
    } else {
      locationScore = 0.1; // Wrong state
    }
    
    // 3. Pipeline type match (weight: 0.20)
    const matchingPipelines = safeParseJson<string[]>(r.matchingPipelineTypes, []);
    let pipelineScore = 0;
    if (matchingPipelines.includes(input.pipelineType)) {
      pipelineScore = 1.0;
      matchReasons.push(`Directly handles ${input.pipelineType.replace(/_/g, " ")} cases`);
    }
    
    // 4. Domain match (weight: 0.15)
    let domainScore = 0;
    if (r.domain === inputDomain) {
      domainScore = 1.0;
      matchReasons.push(`${r.domain} domain match`);
    } else if (r.domain === "legal") {
      domainScore = 0.6; // Legal aid is broadly useful
      matchReasons.push("Legal aid — applicable across domains");
    } else {
      domainScore = 0.1;
    }
    
    // 5. Freshness decay (weight: 0.10)
    let freshnessScore = 0.5; // Default for unknown
    if (r.lastVerifiedAt) {
      const age = now - r.lastVerifiedAt;
      if (age < THIRTY_DAYS) {
        freshnessScore = 1.0;
      } else if (age < SIX_MONTHS) {
        freshnessScore = 0.7;
      } else {
        freshnessScore = 0.3;
        matchReasons.push("Note: resource data may be outdated — verify before acting");
      }
    }
    
    // 5b. Verification bonus/penalty
    let verificationModifier = 0;
    if (r.verificationStatus === "verified") {
      verificationModifier = 0.05; // Small boost for verified resources
      matchReasons.push("✓ Verified resource");
    } else if (r.verificationStatus === "unverified") {
      verificationModifier = 0; // Neutral
    }
    // flagged resources are already excluded in Phase 1
    
    // 6. Need keyword overlap (weight: 0.10)
    let needOverlapScore = 0;
    if (input.needKeywords && input.needKeywords.length > 0) {
      const overlap = input.needKeywords.filter(k => 
        needTypes.some(n => n.includes(k) || k.includes(n))
      );
      needOverlapScore = Math.min(overlap.length / input.needKeywords.length, 1.0);
      if (overlap.length > 0) matchReasons.push(`Covers: ${overlap.join(", ")}`);
    } else {
      needOverlapScore = 0.5; // No keywords to match against
    }
    
    // ─── Weighted Total ───
    const score = (
      urgencyScore * 0.25 +
      locationScore * 0.20 +
      pipelineScore * 0.20 +
      domainScore * 0.15 +
      freshnessScore * 0.10 +
      needOverlapScore * 0.10
    );
    
    // ─── Bonus: enforcement paths get a boost (they're directly actionable) ───
    const actionBonus = r.resourceType === "enforcement_path" ? 0.10 : 0;
    
    // ─── Verification modifier ───
    const totalScore = Math.min(score + actionBonus + verificationModifier, 1.0);
    
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      resourceType: r.resourceType,
      domain: r.domain,
      needTypes,
      urgencyLevel: r.urgencyLevel,
      stateCode: r.stateCode,
      jurisdictionType: r.jurisdictionType,
      phone: r.phone,
      website: r.website,
      email: r.email,
      agency: r.agency,
      category: r.category,
      eligibilityNotes: r.eligibilityNotes,
      applyNotes: r.applyNotes,
      sourceTable: r.sourceTable,
      sourceId: r.sourceId,
      score: totalScore,
      verificationStatus: r.verificationStatus,
      matchReasons,
      scoreBreakdown: {
        urgencyScore,
        locationScore,
        pipelineScore,
        domainScore,
        freshnessScore,
        needOverlapScore,
      },
    };
  });
}

// ─── Diversity Constraint ───

function enforceDiversity(scored: ScoredResource[], limit: number): ScoredResource[] {
  if (scored.length <= limit) return scored;
  
  // Sort by score descending
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  
  const result: ScoredResource[] = [];
  const typeCounts: Record<string, number> = {};
  const MAX_PER_TYPE = Math.ceil(limit * 0.6); // No more than 60% from one type
  
  // First pass: pick top items respecting diversity
  for (const item of sorted) {
    if (result.length >= limit) break;
    const count = typeCounts[item.resourceType] || 0;
    if (count < MAX_PER_TYPE) {
      result.push(item);
      typeCounts[item.resourceType] = count + 1;
    }
  }
  
  // Second pass: if we don't have enough, fill from remaining
  if (result.length < limit) {
    const usedIds = new Set(result.map(r => r.id));
    for (const item of sorted) {
      if (result.length >= limit) break;
      if (!usedIds.has(item.id)) {
        result.push(item);
      }
    }
  }
  
  // Check diversity: ensure at least 2 different resource types if possible
  const uniqueTypes = new Set(result.map(r => r.resourceType));
  if (uniqueTypes.size < 2 && scored.length > limit) {
    // Find the lowest-scored item in result and swap with highest-scored different-type item
    const resultTypes = result.map(r => r.resourceType);
    const dominantType = resultTypes.sort((a, b) => 
      resultTypes.filter(t => t === b).length - resultTypes.filter(t => t === a).length
    )[0];
    
    const differentTypeItem = sorted.find(s => 
      s.resourceType !== dominantType && !result.some(r => r.id === s.id)
    );
    
    if (differentTypeItem) {
      // Replace the lowest-scored item of the dominant type
      const lowestIdx = result.reduce((minIdx, item, idx) => 
        item.resourceType === dominantType && item.score < result[minIdx].score ? idx : minIdx
      , 0);
      result[lowestIdx] = differentTypeItem;
    }
  }
  
  // Re-sort by score
  return result.sort((a, b) => b.score - a.score);
}

// ─── Main Entry Point ───

export async function matchResources(input: MatchInput): Promise<ScoredResource[]> {
  const limit = input.limit || 5;
  
  // Phase 1: Hard filter
  const filtered = await phase1HardFilter(input);
  
  if (filtered.length === 0) {
    // Fallback: try without pipeline type restriction, just domain
    return [];
  }
  
  // Phase 2: Score
  const scored = phase2Score(filtered, input);
  
  // Phase 3: Diversity constraint + limit
  const diversified = enforceDiversity(scored, limit);
  
  return diversified;
}

// ─── Helpers ───

function safeParseJson<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  if (typeof val === "object") return val as T;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// ─── Exported for testing ───
export { phase1HardFilter, phase2Score, enforceDiversity, PIPELINE_DOMAIN_MAP, URGENCY_RANK };
