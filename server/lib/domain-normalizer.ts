/**
 * Domain normalization for claims/resources/jurisdictions
 * Ensures consistent mapping across the system
 */

export type DomainType = "claim" | "resource" | "jurisdiction" | "statute" | "doctrine" | "workflow";

const JURISDICTION_ALIASES: Record<string, string> = {
  "washington": "WA",
  "california": "CA",
  "new_york": "NY",
  "florida": "FL",
  "texas": "TX",
  "illinois": "IL",
  "colorado": "CO",
  "arizona": "AZ",
  "federal": "FED",
};

const CLAIM_DOMAIN_MAPPING: Record<string, string> = {
  "employment": "employment_discrimination",
  "housing": "housing_discrimination",
  "wage": "wage_violation",
  "disability": "disability_benefits",
  "social_security": "social_security",
  "medicaid": "medicaid_denial",
  "medicare": "medicare_denial",
  "consumer": "consumer_credit",
  "debt": "debt_collection",
  "civil_rights": "civil_rights",
  "police": "police_misconduct",
  "food": "food_assistance",
  "education": "education_discrimination",
  "tribal": "tribal_sovereignty",
};

export function normalizeJurisdiction(jurisdiction: string): string {
  const normalized = jurisdiction
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  
  return JURISDICTION_ALIASES[normalized] || normalized;
}

export function normalizeClaimDomain(domain: string): string {
  const normalized = domain
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  
  return CLAIM_DOMAIN_MAPPING[normalized] || normalized;
}

export function normalizeResourceType(resourceType: string): string {
  return resourceType
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function normalizeDomain(
  domainType: DomainType,
  value: string
): string {
  switch (domainType) {
    case "jurisdiction":
      return normalizeJurisdiction(value);
    case "claim":
      return normalizeClaimDomain(value);
    case "resource":
      return normalizeResourceType(value);
    default:
      return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
  }
}

/**
 * Verify if a jurisdiction is valid
 */
export function isValidJurisdiction(jurisdiction: string): boolean {
  const normalized = normalizeJurisdiction(jurisdiction);
  return /^[A-Z]{2}$|^FED$/.test(normalized);
}

/**
 * Get full jurisdiction name from code
 */
export const JURISDICTION_NAMES: Record<string, string> = {
  "FED": "Federal",
  "WA": "Washington",
  "CA": "California",
  "NY": "New York",
  "FL": "Florida",
  "TX": "Texas",
  "IL": "Illinois",
  "CO": "Colorado",
  "AZ": "Arizona",
};

export function getJurisdictionName(code: string): string {
  return JURISDICTION_NAMES[code] || code;
}
