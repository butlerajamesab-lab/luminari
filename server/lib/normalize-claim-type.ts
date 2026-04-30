/**
 * Normalize claim type for deterministic mapping
 * - trim
 * - lowercase
 * - replace whitespace with underscores
 * - preserve deterministic mapping
 * - no fuzzy AI behavior
 */

export function normalizeClaimType(claimType: string | null | undefined): string {
  if (!claimType) return "unknown";
  
  return claimType
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Reverse mapping: get human-readable label from normalized type
 */
export const CLAIM_TYPE_LABELS: Record<string, string> = {
  employment_discrimination: "Employment Discrimination",
  housing_discrimination: "Housing Discrimination",
  wage_violation: "Wage & Hour Violation",
  disability_benefits: "Disability Benefits",
  social_security: "Social Security",
  medicaid_denial: "Medicaid Denial",
  medicare_denial: "Medicare Denial",
  consumer_credit: "Consumer Credit",
  debt_collection: "Debt Collection",
  civil_rights: "Civil Rights",
  police_misconduct: "Police Misconduct",
  food_assistance: "Food Assistance",
  education_discrimination: "Education Discrimination",
  title_ix: "Title IX",
  icwa_violation: "ICWA Violation",
  tribal_sovereignty: "Tribal Sovereignty",
};

export function getClaimTypeLabel(normalizedType: string): string {
  return CLAIM_TYPE_LABELS[normalizedType] || normalizedType.replace(/_/g, " ");
}
