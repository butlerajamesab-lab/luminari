/**
 * R6c — Relationship Type Validator
 *
 * Deterministic guardrail that prevents semantic inflation in the
 * "supervised" relationship type. The LLM may still emit "supervised"
 * or "supervises" — this module reclassifies it into one of five
 * granular types based on the backing quote text.
 *
 * Rules are applied in precedence order:
 *   1. exercised_authority_over  — explicit authority / command verbs
 *   2. held_role_of              — titles, org-chart indicators
 *   3. custodial_responsibility_for — watch, shift, custody phrases
 *   4. task_assigned_to          — transport, escort, errand phrases
 *   5. associated_with           — neutral fallback (no deterministic match)
 *
 * Called at ingestion time (analysis-pipeline.ts) and was used for the
 * one-time migration of 183 legacy rows.
 */

// ─── Allowed Relationship Types ───
// The canonical set after R6c. "supervised" and "supervises" are NOT allowed.
export const VALID_RELATIONSHIP_TYPES = [
  "exercised_authority_over",
  "held_role_of",
  "custodial_responsibility_for",
  "task_assigned_to",
  "associated_with",
  "employed_by",
  "testified_against",
  "filed_on_behalf_of",
  "represented",
  "related_to",
  "communicated_with",
] as const;

export type ValidRelationshipType = typeof VALID_RELATIONSHIP_TYPES[number];

// ─── Marker Phrase Lists ───

/**
 * Bucket 1: exercised_authority_over
 * Explicit authority verbs — the quote describes one entity directing,
 * ordering, or controlling another.
 */
const AUTHORITY_MARKERS: RegExp[] = [
  /\bdirect(?:ed|ing|s)?\b/i,
  /\border(?:ed|ing|s)?\b/i,
  /\bcommand(?:ed|ing|s)?\b/i,
  /\binstruct(?:ed|ing|s)?\b/i,
  /\bauthori[sz](?:ed|ing|es)?\b/i,
  /\bcontrol(?:led|ling|s)?\b/i,
  /\bmandat(?:ed|ing|es)?\b/i,
  /\benforc(?:ed|ing|es)?\b/i,
  /\boversaw\b/i,
  /\boverse(?:e|en|eing|es)\b/i,
  /\bapproved?\b/i,
  /\bsanction(?:ed|ing|s)?\b/i,
  /\bexercis(?:ed|ing|es)?\s+authority\b/i,
  /\bhad\s+authority\b/i,
  /\bin\s+charge\s+of\b/i,
];

/**
 * Bucket 2: held_role_of
 * Titles, organizational indicators, and role-based language.
 */
const ROLE_MARKERS: RegExp[] = [
  /\b(?:CEO|CFO|COO|CTO|CIO|CMO|VP|SVP|EVP|AVP)\b/,
  /\bdirector\b/i,
  /\bmanager\b/i,
  /\bsupervisor\b/i,
  /\bchief\b/i,
  /\bpresident\b/i,
  /\bchairman\b/i,
  /\bchairperson\b/i,
  /\bchairwoman\b/i,
  /\bhead\s+of\b/i,
  /\bserved\s+as\b/i,
  /\bappointed\s+(?:as|to)\b/i,
  /\bheld\s+(?:the\s+)?(?:position|role|title)\b/i,
  /\bwas\s+(?:the\s+)?(?:head|chief|lead|principal)\b/i,
  /\bemployed\s+as\b/i,
  /\btitled\b/i,
  /\bdesignated\s+as\b/i,
  /\brank(?:ed|ing|s)?\b/i,
  /\bofficer\b/i,
  /\blieutenant\b/i,
  /\bsergeant\b/i,
  /\bcaptain\b/i,
  /\bwarden\b/i,
  /\bdeputy\b/i,
  /\bassistant\s+(?:director|manager|warden|chief)\b/i,
  /\bcounsel(?:or|lor)?\b/i,
  /\battorney\b/i,
  /\bjudge\b/i,
  /\bprosecutor\b/i,
  /\binvestigator\b/i,
  /\bagent\b/i,
];

/**
 * Bucket 3: custodial_responsibility_for
 * Watch, shift, custody, monitoring, and confinement-related phrases.
 */
const CUSTODIAL_MARKERS: RegExp[] = [
  /\bwatch\b/i,
  /\bshift\b/i,
  /\bcustod(?:y|ial)\b/i,
  /\bmonitor(?:ed|ing|s)?\b/i,
  /\bguard(?:ed|ing|s)?\b/i,
  /\bdetain(?:ed|ing|s)?\b/i,
  /\bconfin(?:ed|ing|es|ement)?\b/i,
  /\bincarcerat(?:ed|ing|ion)?\b/i,
  /\bimprison(?:ed|ing|ment)?\b/i,
  /\bsurveill(?:ance|ed|ing)?\b/i,
  /\bobserv(?:ed|ing|ation|es)?\b/i,
  /\bcheck(?:ed|ing|s)?\s+on\b/i,
  /\bbed\s+check\b/i,
  /\bcell\s+(?:check|inspection|round)\b/i,
  /\bround(?:s)?\b/i,
  /\bduty\b/i,
  /\bpost(?:ed)?\s+(?:at|to|near)\b/i,
  /\bassign(?:ed|ing)?\s+to\s+(?:the\s+)?(?:unit|tier|block|wing|floor|pod)\b/i,
  /\bhousing\s+unit\b/i,
  /\bspecial\s+housing\b/i,
  /\bSHU\b/,
  /\bsegregation\b/i,
  /\bpsych\s+observation\b/i,
  /\bsuicide\s+watch\b/i,
  /\bmedical\s+watch\b/i,
];

/**
 * Bucket 4: task_assigned_to
 * Transport, escort, errand, and specific task-delegation phrases.
 */
const TASK_MARKERS: RegExp[] = [
  /\btransport(?:ed|ing|s|ation)?\b/i,
  /\bescort(?:ed|ing|s)?\b/i,
  /\berrand\b/i,
  /\bdeliver(?:ed|ing|s|y)?\b/i,
  /\bfetch(?:ed|ing|es)?\b/i,
  /\bcarr(?:ied|ying|ies|y)\b/i,
  /\bconvey(?:ed|ing|s|ance)?\b/i,
  /\bmov(?:ed|ing|es)?\s+(?:to|from|between)\b/i,
  /\btransfer(?:red|ring|s)?\b/i,
  /\brelocat(?:ed|ing|es|ion)?\b/i,
  /\btask(?:ed|ing|s)?\s+(?:with|to)\b/i,
  /\bassign(?:ed|ing)?\s+(?:to\s+)?(?:pick\s+up|drop\s+off|bring|take|collect|retrieve)\b/i,
  /\bsent\s+(?:to|for)\b/i,
  /\bdispatch(?:ed|ing|es)?\b/i,
  /\bcouri(?:er|ered|ering)\b/i,
  /\bchauffeured?\b/i,
  /\bdrove\b/i,
  /\bdrive\s+(?:to|from)\b/i,
  /\bpilot(?:ed|ing|s)?\b/i,
  /\bfl(?:ew|own|ying)\b/i,
];

// ─── Core Classification Function ───

/**
 * Reclassify a "supervised" or "supervises" relationship type into one of
 * the five granular R6c types based on the backing quote text.
 *
 * Rules are applied in strict precedence order. First match wins.
 * If no deterministic match is found, falls back to "associated_with".
 *
 * @param quoteText - The verbatim quote backing this relationship (may be empty/null)
 * @returns One of the 5 R6c replacement types
 */
export function reclassifySupervised(quoteText: string | null | undefined): ValidRelationshipType {
  const text = (quoteText || "").trim();

  // Empty or missing quote → neutral fallback
  if (!text) return "associated_with";

  // Bucket 1: exercised_authority_over (highest precedence)
  if (AUTHORITY_MARKERS.some(re => re.test(text))) {
    return "exercised_authority_over";
  }

  // Bucket 2: held_role_of
  if (ROLE_MARKERS.some(re => re.test(text))) {
    return "held_role_of";
  }

  // Bucket 3: custodial_responsibility_for
  if (CUSTODIAL_MARKERS.some(re => re.test(text))) {
    return "custodial_responsibility_for";
  }

  // Bucket 4: task_assigned_to
  if (TASK_MARKERS.some(re => re.test(text))) {
    return "task_assigned_to";
  }

  // Bucket 5: associated_with (neutral fallback)
  return "associated_with";
}

/**
 * Validate and potentially reclassify a relationship type at ingestion time.
 *
 * If the LLM emits "supervised" or "supervises", this function intercepts
 * and reclassifies using the deterministic rules above.
 *
 * All other types pass through unchanged (they are part of the canonical set).
 *
 * @param llmType - The relationship type string emitted by the LLM
 * @param quoteText - The backing quote text for this relationship
 * @returns A valid relationship type string
 */
export function validateRelationshipType(
  llmType: string,
  quoteText: string | null | undefined
): string {
  const normalized = (llmType || "").trim().toLowerCase();

  // Intercept legacy "supervised" / "supervises" types
  if (normalized === "supervised" || normalized === "supervises") {
    return reclassifySupervised(quoteText);
  }

  // All other types pass through — the LLM may emit types from the
  // canonical set (employed_by, testified_against, etc.)
  return normalized || "associated_with";
}

/**
 * Check if a relationship type is in the banned legacy set.
 * Useful for audit queries and migration verification.
 */
export function isLegacyType(type: string): boolean {
  const normalized = (type || "").trim().toLowerCase();
  return normalized === "supervised" || normalized === "supervises";
}
