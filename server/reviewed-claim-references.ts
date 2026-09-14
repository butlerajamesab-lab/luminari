import catalog from "./config/reviewed-claim-barrier-catalog.json";

/** A manually reviewed source-placement artifact, never canonical legal truth. */
export const reviewed_claim_catalog = catalog;

export type claim_catalog_row = {
  id: number;
  claim_type_id: string;
  canonical_name: string;
  domain: string;
  description: string | null;
};

function normalized_words(value: string): string {
  return value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function get_reviewed_claim_reference(claim_type: string) {
  // Source labels are accepted explicitly; no fuzzy identity resolution.
  return catalog.claims.find(row => row.claim_type_id === claim_type || row.source_claim_id === claim_type) ?? null;
}

export function match_catalog_claims(rows: claim_catalog_row[], problem_description: string, category?: string) {
  const query = normalized_words(problem_description);
  const words = [...new Set(query.split(" ").filter(word => word.length > 3))];
  const normalized_category = category ? normalized_words(category) : null;
  return rows.flatMap(row => {
    const reference = get_reviewed_claim_reference(row.claim_type_id);
    const searchable = normalized_words([row.canonical_name, row.description, ...(reference?.search_terms ?? [])].filter(Boolean).join(" "));
    const matched_keywords = words.filter(word => (` ${searchable} `).includes(` ${word} `));
    const matched_phrases = (reference?.search_terms ?? []).filter(term => term.includes(" ") && (` ${query} `).includes(` ${normalized_words(term)} `));
    // Jurisdiction must never create a match or imply legal coverage.
    const relevance_score = matched_keywords.length + matched_phrases.length * 2;
    if (!relevance_score) return [];
    const category_matches = normalized_category === null ? null : normalized_words(row.domain) === normalized_category;
    return [{
      id: row.id, claim_type: row.claim_type_id, canonical_name: row.canonical_name, domain: row.domain,
      source_claim_id: reference?.source_claim_id ?? null,
      source_reference_available: reference !== null,
      relevance_score, matched_keywords, category_matches,
      case_applicability: "not_assessed" as const,
      legal_verification: "unverified" as const,
    }];
  }).sort((a,b) => b.relevance_score - a.relevance_score || Number(b.category_matches) - Number(a.category_matches) || a.claim_type.localeCompare(b.claim_type));
}

export function reviewed_barrier_references(claim_type?: string) {
  const claim = claim_type ? get_reviewed_claim_reference(claim_type) : null;
  const rows = claim_type ? catalog.barriers.filter(row => claim && row.related_source_claim_ids.includes(claim.source_claim_id)) : catalog.barriers;
  return rows.map(row => ({
    id: row.barrier_id, barrier_id: row.barrier_id, name: row.name,
    barrier_type: "source_catalog_reference", description: row.description.text,
    severity: row.source_severity, source_spans: row.source_spans,
    impact_reference: row.impact_reference, mitigation_reference: row.mitigation_reference,
    applicability_questions: row.applicability_questions,
    related_claims: catalog.claims.filter(claim => row.related_source_claim_ids.includes(claim.source_claim_id)).map(claim => ({
      source_claim_id: claim.source_claim_id, claim_type: claim.claim_type_id, canonical_name: claim.canonical_name,
    })),
    legal_verification: "unverified" as const, case_applicability: "not_assessed" as const,
    relationship_status: row.relationship_status,
    automatic_legal_actions_allowed: false,
  }));
}

export function reviewed_source_context() {
  return { source: catalog.source, review_issues: catalog.review_issues, legal_verification: "unverified" as const,
    case_applicability: "not_assessed" as const, automatic_legal_actions_allowed: false };
}

export function reviewed_proof_reference_issue(claim_type: string, domain: string | null) {
  const observed_issues: Record<string, string> = {
    "SSDI_Denial:unemployment": "The inspected source describes unemployment proceedings, not Social Security disability proof.",
    "Medicaid_Wrongful_Denial:food_nutrition": "The inspected source describes food-benefit proceedings, not Medicaid proof.",
    "Housing_Discrimination_FHA:housing": "The inspected source lists administrative eligibility and compliance rather than the asserted FHA discrimination elements.",
  };
  return observed_issues[`${claim_type}:${domain}`] ?? null;
}
