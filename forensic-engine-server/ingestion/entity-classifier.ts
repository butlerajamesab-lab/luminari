/**
 * Entity Classification Service
 *
 * Classifies entity names into organizational types AND entity roles using
 * deterministic heuristics. Roles determine whether an entity is a responsible
 * party (business, agency) or a non-responsible party (filer, complainant,
 * attorney, witness).
 *
 * Pipeline:
 * T1. Check entity_aliases table for cached classification.
 * T2. Apply corporate suffix heuristics (LLC, Inc, Corp, etc.).
 * T3. Apply government agency pattern matching.
 * T4. Apply financial institution patterns.
 * T5. Apply telecom/media company patterns.
 * T6. Apply landlord/property management patterns.
 * T7. Apply nonprofit patterns.
 * T8. Apply individual person name heuristics (first + last, ALL-CAPS legal format).
 * T9. Apply dataset-aware role inference (campaign finance → filer, complaints → respondent).
 * T10. Score confidence based on match strength.
 * T11. Cache result in entity_aliases table.
 */

import { db } from "../db";
import { entityAliases } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Entity Types ───

export type EntityType =
  | "corporation"
  | "organization"
  | "government_agency"
  | "nonprofit"
  | "landlord_entity"
  | "contractor_business"
  | "financial_institution"
  | "telecom_company"
  | "media_company"
  | "individual_person"
  | "unknown";

// ─── Entity Roles (Session 67) ───

export type EntityRole =
  | "respondent"      // business/entity being complained about
  | "business"        // business entity (from BBB/consumer datasets)
  | "agency"          // government agency
  | "organization"    // nonprofit, advocacy org
  | "filer"           // campaign finance filer / political candidate
  | "complainant"     // person who filed a complaint
  | "attorney"        // legal representative
  | "representative"  // other representative
  | "witness"         // witness in proceedings
  | "unknown";

/** Roles that should generate repeat_entity signals */
export const RESPONSIBLE_ENTITY_ROLES: EntityRole[] = [
  "respondent",
  "business",
  "agency",
  "organization",
];

/** Roles that should be suppressed from repeat_entity signals */
export const SUPPRESSED_ENTITY_ROLES: EntityRole[] = [
  "filer",
  "complainant",
  "attorney",
  "representative",
  "witness",
];

export interface EntityClassification {
  entityType: EntityType;
  entityRole: EntityRole;
  confidence: number; // 0.0 - 1.0
  roleConfidence: number; // 0.0 - 1.0
  canonicalName: string;
  aliases: string[];
  reasoning: string;
}

// ─── Signal Priority Categories ───

/** Entity types that generate high-priority repeat_entity signals */
export const HIGH_PRIORITY_ENTITY_TYPES: EntityType[] = [
  "corporation",
  "organization",
  "government_agency",
  "landlord_entity",
  "contractor_business",
  "financial_institution",
  "telecom_company",
  "media_company",
];

/** Entity types that are downgraded or suppressed in signal generation */
export const LOW_PRIORITY_ENTITY_TYPES: EntityType[] = [
  "individual_person",
  "unknown",
];

/** Minimum frequency for an individual_person to still generate a signal */
export const INDIVIDUAL_HIGH_FREQUENCY_THRESHOLD = 500;

// ─── T2. Corporate Suffix Patterns ───

const CORPORATE_SUFFIXES = [
  /\b(LLC|L\.L\.C\.?)\b/i,
  /\b(Inc\.?|Incorporated)\b/i,
  /\b(Corp\.?|Corporation)\b/i,
  /\b(Co\.?|Company)\b/i,
  /\b(Ltd\.?|Limited)\b/i,
  /\b(LP|L\.P\.?)\b/i,
  /\b(LLP|L\.L\.P\.?)\b/i,
  /\b(PLC|P\.L\.C\.?)\b/i,
  /\b(S\.A\.?|SA)\b/i,
  /\b(GmbH)\b/i,
  /\b(Group|Holdings|Enterprises|Industries|Solutions|Services|Partners|Associates|Ventures|Capital)\b/i,
  /\b(International|Global|Worldwide|National)\b/i,
];

// ─── T3. Government Agency Patterns ───

const GOVERNMENT_PATTERNS = [
  /\b(Department of|Dept\.? of)\b/i,
  /\b(Bureau of|Office of|Division of)\b/i,
  /\b(Agency|Commission|Authority|Administration|Board)\b/i,
  /\b(Federal|State|County|City|Municipal|Government)\b/i,
  /\b(U\.?S\.?|United States)\b/i,
  /\b(FTC|SEC|FCC|FDA|EPA|DOJ|DOL|HUD|CFPB|OSHA|EEOC|NLRB|IRS)\b/,
  /\b(Police|Sheriff|Fire Dept|Court|Judiciary)\b/i,
  /\b(Public Utilities|Regulatory)\b/i,
];

// ─── T4. Financial Institution Patterns ───

const FINANCIAL_PATTERNS = [
  /\b(Bank|Banking|Credit Union|Savings|Loan|Mortgage|Lending)\b/i,
  /\b(Financial|Finance|Investment|Securities|Brokerage)\b/i,
  /\b(Insurance|Underwriter|Insurer)\b/i,
  /\b(Capital One|Chase|Wells Fargo|Bank of America|Citibank|Citi|JPMorgan|Goldman Sachs)\b/i,
  /\b(American Express|Amex|Discover|Mastercard|Visa)\b/i,
  /\b(Equifax|Experian|TransUnion)\b/i,
  /\b(Navient|Sallie Mae|SoFi|LoanCare|Ocwen)\b/i,
];

// ─── T5. Telecom/Media Company Patterns ───

const TELECOM_PATTERNS = [
  /\b(Comcast|Xfinity|AT&T|ATT|Verizon|T-Mobile|TMobile|Sprint|CenturyLink|Lumen)\b/i,
  /\b(Spectrum|Charter|Cox|Frontier|Windstream|Mediacom|Altice|Optimum)\b/i,
  /\b(Telecommunications|Telecom|Wireless|Broadband|Cable|Internet|Communications)\b/i,
  /\b(DirecTV|Dish Network|Hulu|Netflix|Roku)\b/i,
];

const MEDIA_PATTERNS = [
  /\b(Facebook|Meta|Google|Alphabet|Amazon|Apple|Microsoft|Twitter|X Corp)\b/i,
  /\b(YouTube|Instagram|TikTok|Snapchat|Pinterest|LinkedIn)\b/i,
  /\b(Media|Broadcasting|Publishing|Entertainment|Studios)\b/i,
  /\b(News Corp|Disney|Warner|Paramount|Sony)\b/i,
];

// ─── T6. Landlord/Property Management Patterns ───

const LANDLORD_PATTERNS = [
  /\b(Property Management|Properties|Realty|Real Estate|Apartments)\b/i,
  /\b(Landlord|Housing|Residential|Rental|Leasing|Tenant)\b/i,
  /\b(Community|Estates|Manor|Village|Gardens|Terrace|Place|Court|Heights)\b/i,
  /\b(HOA|Homeowners Association|Condo Association|Condominium)\b/i,
  /\b(Development|Developers|Construction|Building|Builders)\b/i,
];

// ─── T7. Nonprofit Patterns ───

const NONPROFIT_PATTERNS = [
  /\b(Foundation|Charity|Charitable|Nonprofit|Non-profit|Not-for-profit)\b/i,
  /\b(Association|Society|Institute|Council|Alliance|Coalition|Federation)\b/i,
  /\b(Aid|Relief|Humanitarian|Advocacy|Legal Aid|Legal Services)\b/i,
  /\b(ACLU|NAACP|Red Cross|United Way|Habitat for Humanity)\b/i,
];

// ─── T8. Individual Person Name Heuristics ───

const COMMON_FIRST_NAMES = new Set([
  "james", "john", "robert", "michael", "david", "william", "richard", "joseph", "thomas", "charles",
  "christopher", "daniel", "matthew", "anthony", "mark", "donald", "steven", "paul", "andrew", "joshua",
  "kenneth", "kevin", "brian", "george", "timothy", "ronald", "edward", "jason", "jeffrey", "ryan",
  "mary", "patricia", "jennifer", "linda", "barbara", "elizabeth", "susan", "jessica", "sarah", "karen",
  "lisa", "nancy", "betty", "margaret", "sandra", "ashley", "dorothy", "kimberly", "emily", "donna",
  "michelle", "carol", "amanda", "melissa", "deborah", "stephanie", "rebecca", "sharon", "laura", "cynthia",
  "kathleen", "amy", "angela", "shirley", "anna", "brenda", "pamela", "emma", "nicole", "helen",
  "samantha", "katherine", "christine", "debra", "rachel", "carolyn", "janet", "catherine", "maria", "heather",
  "diane", "ruth", "julie", "olivia", "joyce", "virginia", "victoria", "kelly", "lauren", "christina",
  "joan", "evelyn", "judith", "megan", "andrea", "cheryl", "hannah", "jacqueline", "martha", "gloria",
  "teresa", "ann", "sara", "madison", "frances", "kathryn", "janice", "jean", "abigail", "alice",
  "jose", "juan", "carlos", "luis", "miguel", "jorge", "pedro", "francisco", "alejandro", "diego",
  // Additional names common in legal filings
  "sue", "lani", "troy", "calvin", "dino", "shawn", "valera", "margarita", "douglass", "lawrence",
  "sam", "jon", "christine", "margaret", "mary", "lisa", "thomas", "joseph", "robert",
]);

const PERSON_TITLE_PREFIXES = /^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?|Atty\.?|Attorney|Esq\.?|Judge|Hon\.?|Rev\.?)\s+/i;
const PERSON_SUFFIXES = /\s+(Jr\.?|Sr\.?|III|IV|II|Esq\.?|MD|PhD|JD|DDS|RN|CPA)$/i;

// ─── T8b. ALL-CAPS Legal Name Pattern ───
// Detects "LASTNAME FIRSTNAME MIDDLE_INITIAL" format common in legal/government filings
// Examples: "MADSEN SUE LANI W", "GREGOIRE CHRISTINE O", "MCKENNA ROBERT M"

/**
 * Detect if a name follows the ALL-CAPS legal filing format:
 * LASTNAME FIRSTNAME [MIDDLE] [INITIAL]
 * Returns a confidence score (0-1) for this pattern.
 */
function scoreAsLegalName(name: string): number {
  // Must be ALL-CAPS
  if (name !== name.toUpperCase()) return 0;
  
  const parts = name.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 2 || parts.length > 5) return 0;
  
  let score = 0;
  
  // All uppercase letters only (no numbers, no special chars except hyphens)
  const allAlpha = parts.every(p => /^[A-Z][-A-Z]*$/.test(p));
  if (!allAlpha) return 0;
  
  // Strong signal: ALL-CAPS + 2-4 words
  score += 0.35;
  
  // Has a single-letter part (middle initial): very strong person indicator
  const hasSingleLetter = parts.some(p => p.length === 1);
  if (hasSingleLetter) score += 0.35;
  
  // Second word (first name position in LAST FIRST format) is a common first name
  if (parts.length >= 2 && COMMON_FIRST_NAMES.has(parts[1].toLowerCase())) {
    score += 0.20;
  }
  
  // Third word is a common first name (middle name)
  if (parts.length >= 3 && COMMON_FIRST_NAMES.has(parts[2].toLowerCase())) {
    score += 0.10;
  }
  
  // No corporate keywords in ALL-CAPS name
  const hasCorpKeyword = CORPORATE_SUFFIXES.some(p => p.test(name)) ||
    GOVERNMENT_PATTERNS.some(p => p.test(name));
  if (hasCorpKeyword) return 0; // Definitely not a person
  
  return Math.min(1, score);
}

// ─── T8c. Attorney/Legal Representative Patterns ───

const ATTORNEY_PATTERNS = [
  /\bEsq\.?\b/i,
  /\bAtty\.?\b/i,
  /\bAttorney\b/i,
  /\bLaw Office/i,
  /\bLaw Firm/i,
  /\bLegal Services/i,
  /\bCounsel\b/i,
  /\b(P\.?S\.?|PLLC|P\.?C\.?)\b/, // Professional corporation suffixes
];

// ─── T9. Dataset-Aware Role Inference ───

/**
 * Dataset domain → default entity role mapping.
 * The entity field in each dataset has a different semantic meaning:
 * - Consumer complaints: entity = the business being complained about (respondent)
 * - Campaign finance: entity = the person filing documents (filer/candidate)
 * - Enforcement actions: entity = the entity being enforced against (respondent)
 */
const DATASET_ROLE_MAP: Record<string, { defaultRole: EntityRole; roleConfidence: number; description: string }> = {
  // Consumer complaint datasets → entity is the business/respondent
  "gpri-47xz": { defaultRole: "business", roleConfidence: 0.90, description: "WA AG Consumer Complaints — entity is the business" },
  "wa-ag-complaints": { defaultRole: "respondent", roleConfidence: 0.90, description: "WA AG Complaints — entity is the respondent" },
  "cfpb-complaints": { defaultRole: "respondent", roleConfidence: 0.92, description: "CFPB Complaints — entity is the company" },
  "hud-fheo-complaints": { defaultRole: "respondent", roleConfidence: 0.88, description: "HUD Fair Housing — entity is the respondent" },
  "ca-crd-complaints": { defaultRole: "respondent", roleConfidence: 0.88, description: "CA Civil Rights — entity is the respondent" },
  
  // Campaign finance datasets → entity is the filer/candidate (NOT a responsible party)
  "j78t-andi": { defaultRole: "filer", roleConfidence: 0.95, description: "WA PDC Documents — entity is the campaign filer" },
  "wa-pdc-finance": { defaultRole: "filer", roleConfidence: 0.95, description: "WA PDC Finance — entity is the campaign filer" },
  "fec-campaign-finance": { defaultRole: "filer", roleConfidence: 0.92, description: "FEC Finance — entity is the campaign filer" },
  
  // Enforcement datasets → entity is the respondent
  "eeoc-enforcement": { defaultRole: "respondent", roleConfidence: 0.90, description: "EEOC Enforcement — entity is the respondent" },
  "dol-whd-enforcement": { defaultRole: "respondent", roleConfidence: 0.90, description: "DOL WHD — entity is the respondent" },
  "osha-inspections": { defaultRole: "respondent", roleConfidence: 0.88, description: "OSHA Inspections — entity is the establishment" },
  "ftc-enforcement": { defaultRole: "respondent", roleConfidence: 0.92, description: "FTC Enforcement — entity is the respondent" },
  
  // Legislation/case law → entity role varies
  "congress-legislation": { defaultRole: "unknown", roleConfidence: 0.50, description: "Congressional legislation — entity role varies" },
  "scotus-decisions": { defaultRole: "unknown", roleConfidence: 0.50, description: "SCOTUS Decisions — entity role varies" },
};

// ─── Known Entity Registries (high-confidence matches) ───

const KNOWN_CORPORATIONS: Record<string, { canonical: string; type: EntityType; aliases: string[] }> = {
  "comcast": { canonical: "Comcast Corporation", type: "telecom_company", aliases: ["Comcast", "Comcast Cable", "Comcast/Xfinity", "Xfinity", "Comcast Xfinity"] },
  "xfinity": { canonical: "Comcast Corporation", type: "telecom_company", aliases: ["Xfinity", "Comcast/Xfinity"] },
  "at&t": { canonical: "AT&T Inc.", type: "telecom_company", aliases: ["AT&T", "ATT", "AT&T Inc", "AT&T Mobility"] },
  "att": { canonical: "AT&T Inc.", type: "telecom_company", aliases: ["ATT", "AT&T"] },
  "verizon": { canonical: "Verizon Communications", type: "telecom_company", aliases: ["Verizon", "Verizon Wireless", "Verizon Fios"] },
  "t-mobile": { canonical: "T-Mobile US", type: "telecom_company", aliases: ["T-Mobile", "TMobile", "T-Mobile US"] },
  "tmobile": { canonical: "T-Mobile US", type: "telecom_company", aliases: ["TMobile", "T-Mobile"] },
  "spectrum": { canonical: "Charter Communications", type: "telecom_company", aliases: ["Spectrum", "Charter", "Charter Communications", "Charter Spectrum"] },
  "charter": { canonical: "Charter Communications", type: "telecom_company", aliases: ["Charter", "Spectrum", "Charter Communications"] },
  "facebook": { canonical: "Meta Platforms", type: "media_company", aliases: ["Facebook", "Meta", "Meta Platforms", "FB"] },
  "meta": { canonical: "Meta Platforms", type: "media_company", aliases: ["Meta", "Facebook", "Meta Platforms"] },
  "facebook/meta": { canonical: "Meta Platforms", type: "media_company", aliases: ["Facebook", "Meta", "Facebook/Meta"] },
  "google": { canonical: "Alphabet Inc.", type: "media_company", aliases: ["Google", "Alphabet", "Google LLC"] },
  "amazon": { canonical: "Amazon.com Inc.", type: "corporation", aliases: ["Amazon", "Amazon.com", "Amazon Prime"] },
  "amazon.com": { canonical: "Amazon.com Inc.", type: "corporation", aliases: ["Amazon", "Amazon.com", "Amazon Prime"] },
  "apple": { canonical: "Apple Inc.", type: "corporation", aliases: ["Apple", "Apple Inc"] },
  "microsoft": { canonical: "Microsoft Corporation", type: "corporation", aliases: ["Microsoft", "Microsoft Corp"] },
  "wells fargo": { canonical: "Wells Fargo & Company", type: "financial_institution", aliases: ["Wells Fargo", "Wells Fargo Bank", "Wells Fargo & Co"] },
  "bank of america": { canonical: "Bank of America Corporation", type: "financial_institution", aliases: ["Bank of America", "BofA", "BoA"] },
  "chase": { canonical: "JPMorgan Chase & Co.", type: "financial_institution", aliases: ["Chase", "JPMorgan Chase", "JP Morgan", "Chase Bank"] },
  "jpmorgan": { canonical: "JPMorgan Chase & Co.", type: "financial_institution", aliases: ["JPMorgan", "JP Morgan", "Chase"] },
  "capital one": { canonical: "Capital One Financial", type: "financial_institution", aliases: ["Capital One", "Capital One Bank", "CapitalOne"] },
  "citibank": { canonical: "Citigroup Inc.", type: "financial_institution", aliases: ["Citibank", "Citi", "Citigroup"] },
  "equifax": { canonical: "Equifax Inc.", type: "financial_institution", aliases: ["Equifax"] },
  "experian": { canonical: "Experian plc", type: "financial_institution", aliases: ["Experian"] },
  "transunion": { canonical: "TransUnion LLC", type: "financial_institution", aliases: ["TransUnion", "Trans Union"] },
  "navient": { canonical: "Navient Corporation", type: "financial_institution", aliases: ["Navient", "Navient Solutions"] },
  "centurylink": { canonical: "Lumen Technologies", type: "telecom_company", aliases: ["CenturyLink", "Lumen", "Lumen Technologies"] },
  "rosewood community llc": { canonical: "Rosewood Community LLC", type: "landlord_entity", aliases: ["Rosewood Community", "Rosewood Community LLC"] },
};

// ─── Classification Engine ───

/**
 * Classify a single entity name.
 * Returns entity type, entity role, confidence, canonical name, and aliases.
 * 
 * @param rawName - The entity name to classify
 * @param datasetId - Optional dataset ID for role inference
 */
export function classifyEntity(rawName: string, datasetId?: string): EntityClassification {
  const name = rawName.trim();
  if (!name) {
    return { entityType: "unknown", entityRole: "unknown", confidence: 0, roleConfidence: 0, canonicalName: name, aliases: [], reasoning: "Empty entity name" };
  }

  const nameLower = name.toLowerCase();

  // T1. Check known entity registry (highest confidence)
  for (const [key, entry] of Object.entries(KNOWN_CORPORATIONS)) {
    if (nameLower === key || nameLower.includes(key) || entry.aliases.some(a => nameLower === a.toLowerCase())) {
      const role = inferRoleFromDataset(datasetId, entry.type);
      return {
        entityType: entry.type,
        entityRole: role.role,
        confidence: 0.95,
        roleConfidence: role.confidence,
        canonicalName: entry.canonical,
        aliases: entry.aliases.filter(a => a.toLowerCase() !== entry.canonical.toLowerCase()),
        reasoning: `Matched known entity registry: ${entry.canonical}`,
      };
    }
  }

  // T2. Corporate suffix patterns
  for (const pattern of CORPORATE_SUFFIXES) {
    if (pattern.test(name)) {
      const role = inferRoleFromDataset(datasetId, "corporation");
      return {
        entityType: "corporation",
        entityRole: role.role,
        confidence: 0.85,
        roleConfidence: role.confidence,
        canonicalName: name,
        aliases: [],
        reasoning: `Corporate suffix detected: ${pattern.source}`,
      };
    }
  }

  // T3. Government agency patterns
  for (const pattern of GOVERNMENT_PATTERNS) {
    if (pattern.test(name)) {
      return {
        entityType: "government_agency",
        entityRole: "agency",
        confidence: 0.88,
        roleConfidence: 0.90,
        canonicalName: name,
        aliases: [],
        reasoning: `Government agency pattern: ${pattern.source}`,
      };
    }
  }

  // T4. Financial institution patterns
  for (const pattern of FINANCIAL_PATTERNS) {
    if (pattern.test(name)) {
      const role = inferRoleFromDataset(datasetId, "financial_institution");
      return {
        entityType: "financial_institution",
        entityRole: role.role,
        confidence: 0.82,
        roleConfidence: role.confidence,
        canonicalName: name,
        aliases: [],
        reasoning: `Financial institution pattern: ${pattern.source}`,
      };
    }
  }

  // T5. Telecom patterns
  for (const pattern of TELECOM_PATTERNS) {
    if (pattern.test(name)) {
      const role = inferRoleFromDataset(datasetId, "telecom_company");
      return {
        entityType: "telecom_company",
        entityRole: role.role,
        confidence: 0.85,
        roleConfidence: role.confidence,
        canonicalName: name,
        aliases: [],
        reasoning: `Telecom company pattern: ${pattern.source}`,
      };
    }
  }

  // T5b. Media patterns
  for (const pattern of MEDIA_PATTERNS) {
    if (pattern.test(name)) {
      const role = inferRoleFromDataset(datasetId, "media_company");
      return {
        entityType: "media_company",
        entityRole: role.role,
        confidence: 0.82,
        roleConfidence: role.confidence,
        canonicalName: name,
        aliases: [],
        reasoning: `Media company pattern: ${pattern.source}`,
      };
    }
  }

  // T6. Landlord/property patterns
  for (const pattern of LANDLORD_PATTERNS) {
    if (pattern.test(name)) {
      const role = inferRoleFromDataset(datasetId, "landlord_entity");
      return {
        entityType: "landlord_entity",
        entityRole: role.role,
        confidence: 0.78,
        roleConfidence: role.confidence,
        canonicalName: name,
        aliases: [],
        reasoning: `Landlord/property pattern: ${pattern.source}`,
      };
    }
  }

  // T7. Nonprofit patterns
  for (const pattern of NONPROFIT_PATTERNS) {
    if (pattern.test(name)) {
      return {
        entityType: "nonprofit",
        entityRole: "organization",
        confidence: 0.80,
        roleConfidence: 0.85,
        canonicalName: name,
        aliases: [],
        reasoning: `Nonprofit pattern: ${pattern.source}`,
      };
    }
  }

  // T8. Attorney/legal representative patterns
  for (const pattern of ATTORNEY_PATTERNS) {
    if (pattern.test(name)) {
      return {
        entityType: "individual_person",
        entityRole: "attorney",
        confidence: 0.85,
        roleConfidence: 0.90,
        canonicalName: name,
        aliases: [],
        reasoning: `Attorney/legal representative pattern: ${pattern.source}`,
      };
    }
  }

  // T8b. ALL-CAPS legal filing name detection (LASTNAME FIRSTNAME MIDDLE)
  const legalNameScore = scoreAsLegalName(name);
  if (legalNameScore >= 0.6) {
    // This is almost certainly an individual person in legal filing format
    const role = inferRoleFromDataset(datasetId, "individual_person");
    return {
      entityType: "individual_person",
      entityRole: role.role,
      confidence: legalNameScore,
      roleConfidence: role.confidence,
      canonicalName: name,
      aliases: [],
      reasoning: `ALL-CAPS legal name pattern (score: ${legalNameScore.toFixed(2)})`,
    };
  }

  // T8c. Standard individual person name heuristics
  const personScore = scoreAsIndividual(name);
  if (personScore >= 0.6) {
    const role = inferRoleFromDataset(datasetId, "individual_person");
    return {
      entityType: "individual_person",
      entityRole: role.role,
      confidence: personScore,
      roleConfidence: role.confidence,
      canonicalName: name,
      aliases: [],
      reasoning: `Individual person heuristic (score: ${personScore.toFixed(2)})`,
    };
  }

  // T9. Fallback: use dataset context for role, unknown type
  const fallbackRole = inferRoleFromDataset(datasetId, "unknown");
  return {
    entityType: "unknown",
    entityRole: fallbackRole.role,
    confidence: 0.3,
    roleConfidence: fallbackRole.confidence,
    canonicalName: name,
    aliases: [],
    reasoning: "No pattern matched — classified as unknown",
  };
}

/**
 * Score how likely a name is an individual person (0.0 - 1.0).
 * Uses name structure, common first names, title prefixes, and suffixes.
 */
function scoreAsIndividual(name: string): number {
  let score = 0;
  const cleaned = name.replace(PERSON_TITLE_PREFIXES, "").replace(PERSON_SUFFIXES, "").trim();
  const parts = cleaned.split(/\s+/);

  // Title prefix present (Mr., Mrs., Dr., Atty., etc.)
  if (PERSON_TITLE_PREFIXES.test(name)) score += 0.3;

  // Person suffix present (Jr., Sr., Esq., etc.)
  if (PERSON_SUFFIXES.test(name)) score += 0.25;

  // 2-3 word name (typical person name structure)
  if (parts.length >= 2 && parts.length <= 3) score += 0.25;

  // First word is a common first name
  if (parts.length >= 2 && COMMON_FIRST_NAMES.has(parts[0].toLowerCase())) score += 0.25;

  // Last word looks like a surname (capitalized, no corporate keywords, 2+ chars)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (/^[A-Z][a-z]{1,}$/.test(last) && !CORPORATE_SUFFIXES.some(p => p.test(last))) {
      score += 0.1;
    }
  }

  // All parts are capitalized single words (no corporate keywords)
  const allCapitalized = parts.every(p => /^[A-Z][a-z]+$/.test(p));
  if (allCapitalized && parts.length >= 2 && parts.length <= 4) score += 0.1;

  // Negative signals: contains corporate/org keywords
  const hasCorpKeyword = CORPORATE_SUFFIXES.some(p => p.test(name)) ||
    GOVERNMENT_PATTERNS.some(p => p.test(name)) ||
    /\b(Bank|Insurance|Hospital|University|School|Church|Center|Clinic)\b/i.test(name);
  if (hasCorpKeyword) score -= 0.5;

  return Math.max(0, Math.min(1, score));
}

/**
 * Infer entity role from dataset context and entity type.
 */
function inferRoleFromDataset(
  datasetId: string | undefined,
  entityType: EntityType | "individual_person" | "unknown"
): { role: EntityRole; confidence: number } {
  // If we have dataset context, use it
  if (datasetId && DATASET_ROLE_MAP[datasetId]) {
    const mapping = DATASET_ROLE_MAP[datasetId];
    
    // For individual persons in campaign finance datasets → filer
    if (entityType === "individual_person" && mapping.defaultRole === "filer") {
      return { role: "filer", confidence: mapping.roleConfidence };
    }
    
    // For organizations/corporations in complaint datasets → respondent/business
    if (HIGH_PRIORITY_ENTITY_TYPES.includes(entityType as EntityType)) {
      if (["respondent", "business"].includes(mapping.defaultRole)) {
        return { role: mapping.defaultRole, confidence: mapping.roleConfidence };
      }
      // Corporations in campaign finance are still businesses
      if (mapping.defaultRole === "filer") {
        return { role: "business", confidence: 0.70 };
      }
    }
    
    return { role: mapping.defaultRole, confidence: mapping.roleConfidence };
  }

  // No dataset context — infer from entity type
  if (entityType === "government_agency") return { role: "agency", confidence: 0.80 };
  if (entityType === "nonprofit") return { role: "organization", confidence: 0.75 };
  if (HIGH_PRIORITY_ENTITY_TYPES.includes(entityType as EntityType)) return { role: "business", confidence: 0.70 };
  if (entityType === "individual_person") return { role: "unknown", confidence: 0.40 };
  
  return { role: "unknown", confidence: 0.30 };
}

/**
 * Classify an entity and cache the result in entity_aliases table.
 * Returns cached result if available.
 */
export async function classifyAndCacheEntity(rawName: string, datasetId?: string): Promise<EntityClassification> {
  const name = rawName.trim();
  if (!name) {
    return { entityType: "unknown", entityRole: "unknown", confidence: 0, roleConfidence: 0, canonicalName: name, aliases: [], reasoning: "Empty" };
  }

  // Check cache first
  const cached = await db
    .select()
    .from(entityAliases)
    .where(eq(entityAliases.aliasName, name))
    .limit(1);

  if (cached.length > 0) {
    const entry = cached[0];
    // Load all aliases for the same canonical name
    const allAliases = await db
      .select({ aliasName: entityAliases.aliasName })
      .from(entityAliases)
      .where(eq(entityAliases.canonicalName, entry.canonicalName));

    // Re-infer role from dataset context (cache may not have role)
    const role = inferRoleFromDataset(datasetId, entry.entityType as EntityType);

    return {
      entityType: entry.entityType as EntityType,
      entityRole: role.role,
      confidence: parseFloat(String(entry.confidence)),
      roleConfidence: role.confidence,
      canonicalName: entry.canonicalName,
      aliases: allAliases.map(a => a.aliasName).filter(a => a !== entry.canonicalName),
      reasoning: `Cached classification (source: ${entry.source})`,
    };
  }

  // Classify using heuristics
  const classification = classifyEntity(name, datasetId);

  // Cache the result
  try {
    await db.insert(entityAliases).values({
      canonicalName: classification.canonicalName,
      aliasName: name,
      entityType: classification.entityType,
      confidence: classification.confidence.toFixed(4),
      source: "heuristic",
      createdAt: Date.now(),
    }).onDuplicateKeyUpdate({
      set: {
        entityType: classification.entityType,
        confidence: classification.confidence.toFixed(4),
      },
    });

    // Also cache known aliases
    for (const alias of classification.aliases) {
      if (alias !== name) {
        try {
          await db.insert(entityAliases).values({
            canonicalName: classification.canonicalName,
            aliasName: alias,
            entityType: classification.entityType,
            confidence: classification.confidence.toFixed(4),
            source: "heuristic",
            createdAt: Date.now(),
          }).onDuplicateKeyUpdate({
            set: {
              canonicalName: classification.canonicalName,
              entityType: classification.entityType,
            },
          });
        } catch {
          // Ignore duplicate alias errors
        }
      }
    }
  } catch {
    // Cache write failure is non-fatal
  }

  return classification;
}

/**
 * Batch classify multiple entity names.
 * Returns a map of entity name → classification.
 */
export async function batchClassifyEntities(
  entities: string[],
  datasetId?: string
): Promise<Map<string, EntityClassification>> {
  const results = new Map<string, EntityClassification>();
  for (const entity of entities) {
    results.set(entity, classifyEntity(entity, datasetId));
  }
  return results;
}

/**
 * Determine if an entity should generate a high-priority signal.
 * 
 * Session 67 update: Now uses BOTH entity type AND entity role.
 * T1. Responsible roles (business, respondent, agency, organization) always generate signals.
 * T2. Suppressed roles (filer, complainant, attorney, witness) are blocked.
 * T3. Individuals only generate signals if frequency exceeds threshold OR they have a corporate role.
 */
export function shouldGenerateSignal(
  classification: EntityClassification,
  frequency: number,
  _hasCorporateRole: boolean = false
): { generate: boolean; priorityMultiplier: number; reason: string } {
  const { entityType, entityRole } = classification;

  // T1. ROLE-BASED FILTERING (Session 67 — highest priority)
  // If we have a confident role classification, use it
  if (classification.roleConfidence >= 0.70) {
    // Suppressed roles: filer, complainant, attorney, representative, witness
    if (SUPPRESSED_ENTITY_ROLES.includes(entityRole)) {
      // Exception: extremely high frequency individuals may still be notable
      if (entityType === "individual_person" && frequency >= INDIVIDUAL_HIGH_FREQUENCY_THRESHOLD) {
        return {
          generate: true,
          priorityMultiplier: 0.3,
          reason: `Suppressed role (${entityRole}) but extremely high frequency (${frequency} >= ${INDIVIDUAL_HIGH_FREQUENCY_THRESHOLD})`,
        };
      }
      return {
        generate: false,
        priorityMultiplier: 0,
        reason: `Suppressed entity role: ${entityRole} (role confidence: ${classification.roleConfidence.toFixed(2)})`,
      };
    }

    // Responsible roles: business, respondent, agency, organization
    if (RESPONSIBLE_ENTITY_ROLES.includes(entityRole)) {
      return {
        generate: true,
        priorityMultiplier: 1.0,
        reason: `Responsible entity role: ${entityRole}`,
      };
    }
  }

  // T2. TYPE-BASED FILTERING (fallback when role confidence is low)
  if (HIGH_PRIORITY_ENTITY_TYPES.includes(entityType)) {
    return {
      generate: true,
      priorityMultiplier: 1.0,
      reason: `High-priority entity type: ${entityType}`,
    };
  }

  if (entityType === "nonprofit") {
    return {
      generate: true,
      priorityMultiplier: 0.8,
      reason: "Nonprofit entity — moderate priority",
    };
  }

  // T3. Individual person handling
  if (entityType === "individual_person") {
    if (frequency >= INDIVIDUAL_HIGH_FREQUENCY_THRESHOLD) {
      return {
        generate: true,
        priorityMultiplier: 0.5,
        reason: `Individual with extremely high frequency (${frequency} >= ${INDIVIDUAL_HIGH_FREQUENCY_THRESHOLD})`,
      };
    }
    if (_hasCorporateRole) {
      return {
        generate: true,
        priorityMultiplier: 0.6,
        reason: "Individual associated with corporate role",
      };
    }
    return {
      generate: false,
      priorityMultiplier: 0,
      reason: `Individual person suppressed (frequency ${frequency} < ${INDIVIDUAL_HIGH_FREQUENCY_THRESHOLD})`,
    };
  }

  // unknown type — generate with reduced priority if frequency is high enough
  if (frequency >= INDIVIDUAL_HIGH_FREQUENCY_THRESHOLD / 2) {
    return {
      generate: true,
      priorityMultiplier: 0.4,
      reason: `Unknown entity type with moderate frequency (${frequency})`,
    };
  }

  return {
    generate: false,
    priorityMultiplier: 0,
    reason: `Unknown entity type with low frequency (${frequency}) — suppressed`,
  };
}

/**
 * Compute entity confidence score based on multiple factors.
 * T1. Entity type certainty (from classification confidence).
 * T2. Frequency in dataset (higher = more confident).
 * T3. Cross-dataset appearance (appears in multiple datasets = higher).
 * T4. Name quality (well-formed corporate name = higher).
 */
export function computeEntityConfidenceScore(
  classification: EntityClassification,
  frequency: number,
  totalRecords: number,
  crossDatasetCount: number = 1
): number {
  let score = 0;

  // Factor 1: Entity type certainty (40% weight)
  score += classification.confidence * 0.40;

  // Factor 2: Frequency significance (25% weight)
  const frequencyRatio = frequency / Math.max(totalRecords, 1);
  const frequencyScore = Math.min(1, frequencyRatio * 20); // 5% of records = max score
  score += frequencyScore * 0.25;

  // Factor 3: Cross-dataset appearance (20% weight)
  const crossDatasetScore = Math.min(1, (crossDatasetCount - 1) * 0.33); // 4+ datasets = max
  score += crossDatasetScore * 0.20;

  // Factor 4: Name quality (15% weight)
  const nameQuality = scoreNameQuality(classification.canonicalName);
  score += nameQuality * 0.15;

  return Math.min(0.99, Math.max(0.01, score));
}

/**
 * Score the quality/specificity of an entity name (0-1).
 * Well-formed corporate names score higher than vague names.
 */
function scoreNameQuality(name: string): number {
  let score = 0.5;

  // Has corporate suffix
  if (CORPORATE_SUFFIXES.some(p => p.test(name))) score += 0.2;

  // Reasonable length (not too short, not too long)
  if (name.length >= 5 && name.length <= 100) score += 0.1;

  // Not all caps (ALL CAPS names are often data quality issues)
  if (name !== name.toUpperCase()) score += 0.1;

  // Contains mixed case (proper capitalization)
  if (/[A-Z][a-z]/.test(name)) score += 0.1;

  return Math.min(1, score);
}
