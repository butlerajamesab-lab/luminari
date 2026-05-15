/**
 * CDA v1.0-PATCH3 — Deterministic Pattern Registry
 *
 * Single source of truth for all regex/keyword patterns used by T1–T9.
 * No inline regex anywhere else in the codebase.
 * No dynamic pattern construction.
 * Version-locked to spec_version 1.0-PATCH3.
 *
 * If spec bumps → this registry must bump.
 */

export const SPEC_VERSION = "1.0-PATCH3";

// ═══════════════════════════════════════════════════════════════════════
// 1. CLASSIFICATION_PATTERNS — T1 Document Classification
// ═══════════════════════════════════════════════════════════════════════

export const CLASSIFICATION_PATTERNS: Record<string, RegExp[]> = {
  policy: [
    /\b(?:policy\s+(?:number|no\.?|#))\b/i,
    /\b(?:declarations?\s+page)\b/i,
    /\b(?:coverage\s+(?:a|b|c|d))\b/i,
    /\b(?:insuring\s+agreement)\b/i,
    /\b(?:conditions?\s+of\s+coverage)\b/i,
    /\b(?:exclusions?)\b/i,
    /\b(?:endorsement)\b/i,
    /\b(?:covered\s+perils?)\b/i,
    /\b(?:deductible)\b/i,
    /\b(?:premium)\b/i,
  ],
  denial: [
    /\b(?:claim\s+(?:has\s+been|is)\s+denied)\b/i,
    /\b(?:denial\s+(?:of|letter))\b/i,
    /\b(?:not\s+covered)\b/i,
    /\b(?:no\s+payment\s+will\s+be\s+issued)\b/i,
    /\b(?:we\s+have\s+determined)\b/i,
    /\b(?:does\s+not\s+(?:apply|cover))\b/i,
    /\b(?:claim\s+(?:number|no\.?|#))\b/i,
    /\b(?:we\s+regret\s+to\s+inform)\b/i,
  ],
  claim_summary: [
    /\b(?:claim\s+summary)\b/i,
    /\b(?:loss\s+(?:date|description))\b/i,
    /\b(?:date\s+of\s+loss)\b/i,
    /\b(?:claimed?\s+amount)\b/i,
    /\b(?:incident\s+(?:report|description))\b/i,
    /\b(?:claimant)\b/i,
    /\b(?:insured\s+(?:name|party))\b/i,
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// 2. QUOTE_CATEGORY_PATTERNS — T2 Quote Extraction category triggers
// ═══════════════════════════════════════════════════════════════════════

export const QUOTE_CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  policy_clause: [
    /\b(?:coverage\s+(?:a|b|c|d))\b/i,
    /\b(?:section\s+\d+)/i,
    /\b(?:exclusion)\b/i,
    /\b(?:condition)\b/i,
    /\b(?:covered\s+perils?)\b/i,
    /\b(?:we\s+(?:will|shall)\s+(?:pay|cover))\b/i,
    /\b(?:this\s+policy\s+(?:does|covers?))\b/i,
    /\b(?:insuring\s+agreement)\b/i,
  ],
  denial_reason: [
    /\b(?:not\s+covered)\b/i,
    /\b(?:claim\s+is\s+denied)\b/i,
    /\b(?:denied\s+pursuant\s+to)\b/i,
    /\b(?:does\s+not\s+(?:apply|cover|qualify|constitute|meet))\b/i,
    /\b(?:excluded?\s+(?:from|under))\b/i,
    /\b(?:failed?\s+to\s+(?:comply|meet|provide|obtain))\b/i,
    /\b(?:per\s+(?:section|policy|exclusion))\b/i,
    /\b(?:not\s+a\s+covered\s+peril)\b/i,
    // Health denial patterns
    /\b(?:not\s+medically\s+necessary)\b/i,
    /\b(?:does\s+not\s+meet\s+(?:medical\s+necessity|the\s+criteria|clinical))\b/i,
    /\b(?:pre-?authorization\s+(?:was\s+)?not\s+(?:obtained|approved))\b/i,
    /\b(?:(?:request|procedure)\s+(?:is|has\s+been)\s+denied)\b/i,
    // Coverage period patterns
    /\b(?:(?:falls?|occurred?)\s+outside\s+(?:the\s+|your\s+)?(?:policy|coverage)\s+period)\b/i,
    /\b(?:outside\s+(?:the\s+|your\s+)?(?:policy|coverage)\s+period)\b/i,
    /\b(?:not\s+(?:within|during)\s+(?:the\s+)?(?:policy|coverage)\s+period)\b/i,
    /\b(?:no\s+coverage\s+is\s+(?:available|provided|afforded))\b/i,
    // Business interruption / physical loss patterns
    /\b(?:no\s+direct\s+physical\s+(?:loss|damage))\b/i,
    /\b(?:does\s+not\s+constitute\s+(?:a\s+)?(?:covered|physical|direct))\b/i,
    // Soft denial language
    /\b(?:we\s+(?:are\s+)?unable\s+to\s+(?:provide|extend|approve)\s+coverage)\b/i,
    /\b(?:coverage\s+(?:is|has\s+been)\s+denied)\b/i,
    /\b(?:not\s+covered\s+under\s+(?:the\s+)?terms)\b/i,
    /\b(?:your\s+claim\s+(?:is\s+not|does\s+not)\s+(?:covered|qualify))\b/i,
    /\b(?:we\s+(?:must|have\s+to)\s+deny)\b/i,
  ],
  denial_supporting_fact: [
    /\b(?:our\s+(?:investigation|review|inspection))\b/i,
    /\b(?:(?:evidence|records?)\s+(?:show|indicate))\b/i,
    /\b(?:we\s+(?:found|determined|concluded))\b/i,
  ],
  claim_fact: [
    /\b(?:the\s+(?:insured|claimant)\s+(?:reported|stated|claims?))\b/i,
    /\b(?:loss\s+(?:occurred|happened|you\s+reported))\b/i,
    /\b(?:damage\s+(?:to|was|occurred))\b/i,
    /\b(?:the\s+loss\s+you\s+reported)\b/i,
    /\b(?:caused\s+by\s+(?:the\s+)?(?:freezing|flooding|fire|storm))\b/i,
    /\b(?:resulted\s+from)\b/i,
  ],
  date_reference: [
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/,
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/,
  ],
  amount_reference: [
    /\$[\d,]+(?:\.\d{2})?/,
    /\b\d+[\d,]*\.\d{2}\b/,
  ],
  party_reference: [
    /\b(?:insured|claimant|policyholder|beneficiary|adjuster)\b/i,
  ],
  declarations_field: [
    /\b(?:declarations?\s+page)\b/i,
    /\b(?:named\s+insured)\b/i,
    /\b(?:policy\s+period)\b/i,
    /\b(?:effective\s+date)\b/i,
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// 3. REASON_CODE_PATTERNS — T4 Denial Reason normalized_reason_code
// ═══════════════════════════════════════════════════════════════════════

/**
 * Priority-ordered. If a sentence matches multiple keyword sets,
 * the first matching code in this array wins.
 */
export const REASON_CODE_PRECEDENCE = [
  "exclusion_applies",
  "condition_not_met",
  "coverage_not_in_effect",
  "medical_necessity_denied",
  "policy_lapsed",
  "late_filing",
  "insufficient_documentation",
  "pre_existing_condition",
  "not_covered_peril",
  "liability_disputed",
  "amount_disputed",
  "duplicate_claim",
  "misrepresentation_alleged",
  "cooperation_clause",
  "other",
] as const;

export const REASON_CODE_PATTERNS: Record<string, RegExp[]> = {
  exclusion_applies: [
    /\b(?:exclusions?)\b/i,
    /\b(?:excluded?\s+(?:from|under|by))\b/i,
    /\b(?:section\s+[IVX\d]+\s*[—–\-]\s*exclusions?)\b/i,
    /\b(?:not\s+covered\s+(?:under|per)\s+exclusions?)\b/i,
    /\b(?:denied\s+pursuant\s+to)\b/i,
    /\b(?:paragraph\s+\d+\([a-z]\))\b/i,
  ],
  condition_not_met: [
    /\b(?:condition\s+(?:not\s+met|was\s+not\s+(?:met|satisfied)))\b/i,
    /\b(?:failed?\s+to\s+(?:comply|meet|satisfy|provide|notify))\b/i,
    /\b(?:(?:reasonable|prompt)\s+(?:care|notice|steps?))\b/i,
    /\b(?:duty\s+(?:to|of))\b/i,
  ],
  coverage_not_in_effect: [
    /\b(?:coverage\s+(?:was\s+)?not\s+in\s+effect)\b/i,
    /\b(?:outside\s+(?:the\s+|your\s+)?(?:policy|coverage)\s+period)\b/i,
    /\b(?:(?:falls?|occurred?)\s+outside\s+(?:the\s+|your\s+)?(?:policy|coverage)\s+period)\b/i,
    /\b(?:(?:before|after)\s+(?:the\s+)?(?:effective|expiration|inception)\s+date)\b/i,
    /\b(?:not\s+(?:within|during)\s+(?:the\s+)?(?:policy|coverage)\s+period)\b/i,
  ],
  policy_lapsed: [
    /\b(?:policy\s+(?:has\s+)?lapsed)\b/i,
    /\b(?:non-?payment\s+of\s+premium)\b/i,
    /\b(?:policy\s+(?:was\s+)?cancelled)\b/i,
  ],
  late_filing: [
    /\b(?:late\s+(?:filing|notice|notification|reporting))\b/i,
    /\b(?:untimely)\b/i,
    /\b(?:(?:not\s+)?(?:filed|reported|notified)\s+(?:within|timely))\b/i,
  ],
  insufficient_documentation: [
    /\b(?:insufficient\s+(?:documentation|evidence|proof))\b/i,
    /\b(?:failed?\s+to\s+(?:provide|submit|furnish)\s+(?:sufficient|adequate|required))\b/i,
    /\b(?:lack\s+of\s+(?:documentation|evidence|proof))\b/i,
  ],
  pre_existing_condition: [
    /\b(?:pre-?existing\s+(?:condition|damage|defect))\b/i,
    /\b(?:prior\s+(?:damage|condition|defect))\b/i,
    /\b(?:existed?\s+(?:before|prior\s+to))\b/i,
  ],
  not_covered_peril: [
    /\b(?:not\s+(?:a\s+)?covered\s+(?:peril|cause|event|loss))\b/i,
    /\b(?:peril\s+(?:is\s+)?not\s+covered)\b/i,
    /\b(?:(?:flood|earthquake|mold|wear|deterioration|seepage|gradual)\b)/i,
    /\b(?:does\s+not\s+(?:constitute|qualify\s+as)\s+(?:a\s+)?(?:covered|direct\s+physical))\b/i,
    /does\s+not\s+constitute\s+["\u201C]?(?:a\s+)?(?:covered|direct\s+physical)/i,
    /does\s+not\s+meet\s+(?:the\s+)?(?:policy\s+)?requirement/i,
    /\b(?:no\s+direct\s+physical\s+(?:loss|damage))\b/i,
  ],
  liability_disputed: [
    /\b(?:liability\s+(?:is\s+)?(?:disputed|denied|not\s+(?:established|accepted)))\b/i,
    /\b(?:not\s+(?:liable|responsible))\b/i,
  ],
  amount_disputed: [
    /\b(?:amount\s+(?:is\s+)?(?:disputed|excessive|not\s+supported))\b/i,
    /\b(?:exceeds?\s+(?:the\s+)?(?:limit|coverage|maximum))\b/i,
    /\b(?:depreciation)\b/i,
  ],
  duplicate_claim: [
    /\b(?:duplicate\s+claim)\b/i,
    /\b(?:already\s+(?:paid|settled|resolved))\b/i,
    /\b(?:previously\s+(?:submitted|filed))\b/i,
  ],
  misrepresentation_alleged: [
    /\b(?:misrepresentation)\b/i,
    /\b(?:material\s+(?:misstatement|omission|concealment))\b/i,
    /\b(?:fraud)\b/i,
  ],
  cooperation_clause: [
    /\b(?:cooperation\s+clause)\b/i,
    /\b(?:failed?\s+to\s+cooperate)\b/i,
    /\b(?:refused?\s+(?:to\s+)?(?:cooperate|provide\s+access))\b/i,
  ],
  medical_necessity_denied: [
    /\b(?:does\s+not\s+meet\s+(?:the\s+)?criteria\s+for\s+medical\s+necessity)\b/i,
    /\b(?:not\s+medically\s+necessary)\b/i,
    /\b(?:fails?\s+to\s+satisfy\s+clinical\s+criteria)\b/i,
    /\b(?:medical\s+necessity\s+(?:has\s+)?not\s+been\s+(?:established|demonstrated|met))\b/i,
    /\b(?:does\s+not\s+meet\s+(?:the\s+)?(?:medical|clinical)\s+(?:necessity|criteria))\b/i,
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// 4. CONFLICT_PATTERNS — T8 Contradiction Detection
// ═══════════════════════════════════════════════════════════════════════

export const CONFLICT_PATTERNS = {
  date_conflict: {
    extractors: [
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,
      /\b(\d{4}-\d{2}-\d{2})\b/g,
      /\b((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4})\b/gi,
    ],
  },
  amount_conflict: {
    extractors: [
      /(\$[\d,]+(?:\.\d{2})?)/g,
    ],
  },
  fact_conflict: {
    claimIndicators: [
      /\b(?:(?:pipe|plumbing)\s+burst)\b/i,
      /\b(?:had\s+burst)\b/i,
      /\b(?:burst\s+due\s+to)\b/i,
      /\b(?:sudden\s+(?:and\s+accidental|discharge|release))\b/i,
      /\b(?:storm\s+damage)\b/i,
      /\b(?:fire\s+(?:damage|loss))\b/i,
      /\b(?:theft|vandalism|break-?in)\b/i,
    ],
    denialIndicators: [
      /\b(?:seepage|gradual\s+(?:deterioration|damage|leak))\b/i,
      /\b(?:wear\s+and\s+tear)\b/i,
      /\b(?:maintenance\s+(?:issue|failure|neglect))\b/i,
      /\b(?:long-?term\s+(?:damage|deterioration|leak))\b/i,
      /\b(?:pre-?existing)\b/i,
    ],
  },
  party_identity_conflict: {
    extractors: [
      /\b(?:named\s+insured|policyholder|claimant)\s*[:=]?\s*([A-Z][a-zA-Z\s.'-]+)/g,
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════
// 5. BOILERPLATE_STOPLIST — T6 verbatim_language_overlap filter
// ═══════════════════════════════════════════════════════════════════════

/**
 * If a ≥N consecutive word match consists entirely of tokens that
 * appear in this stoplist → reject the overlap.
 * No fuzzy scoring. No stemming. Exact string comparison only.
 */
export const BOILERPLATE_STOPLIST = [
  "in accordance with the",
  "subject to the terms",
  "as described herein",
  "to the extent permitted",
  "pursuant to",
  "in the event of",
  "as set forth in",
  "with respect to",
  "in connection with",
  "as provided in",
  "under the terms of",
  "shall not be liable",
  "to the extent that",
  "as defined in",
  "in accordance with",
  "subject to the provisions",
  "notwithstanding the foregoing",
  "for the purposes of",
  "in the event that",
  "as applicable",
  "per policy terms",
  "per the terms of",
  "as stated in the",
  "in compliance with",
  "as required by",
] as const;

/**
 * Minimum consecutive word count for verbatim_language_overlap.
 * Matches below this threshold are rejected.
 */
export const VERBATIM_OVERLAP_MIN_WORDS = 5;

// ═══════════════════════════════════════════════════════════════════════
// 6. CLAUSE_TYPE_PATTERNS — T5 Policy Clause classification
// ═══════════════════════════════════════════════════════════════════════

export const CLAUSE_TYPE_PATTERNS: Record<string, RegExp[]> = {
  coverage_grant: [
    /\b(?:we\s+(?:will|shall)\s+(?:pay|cover|insure))\b/i,
    /\b(?:coverage\s+(?:a|b|c|d))\b/i,
    /\b(?:insuring\s+agreement)\b/i,
    /\b(?:covered\s+(?:perils?|causes?\s+of\s+loss))\b/i,
    /\b(?:this\s+policy\s+covers?)\b/i,
  ],
  exclusion: [
    /\b(?:we\s+(?:do\s+not|will\s+not|shall\s+not)\s+(?:pay|cover|insure))\b/i,
    /\b(?:exclusions?)\b/i,
    /\b(?:this\s+policy\s+does\s+not\s+(?:cover|apply|insure))\b/i,
    /\b(?:(?:loss|damage)\s+(?:caused\s+by|resulting\s+from).*(?:excluded|not\s+covered))\b/i,
    /\b(?:we\s+do\s+not\s+insure\s+for)\b/i,
  ],
  condition: [
    /\b(?:condition)\b/i,
    /\b(?:duties?\s+(?:after|in\s+the\s+event))\b/i,
    /\b(?:(?:you|the\s+insured)\s+(?:must|shall|should))\b/i,
    /\b(?:reasonable\s+(?:care|steps?|measures?))\b/i,
    /\b(?:notice\s+(?:of\s+loss|requirement))\b/i,
    /\b(?:proof\s+of\s+loss)\b/i,
  ],
  definition: [
    /\b(?:(?:means?|refers?\s+to|is\s+defined\s+as))\b/i,
    /\b(?:definition)\b/i,
    /[""\u201C]([^""\u201D]+)[""\u201D]\s+(?:means?|refers?)/i,
  ],
  limitation: [
    /\b(?:limit(?:ation|ed)\s+(?:to|of))\b/i,
    /\b(?:maximum\s+(?:amount|limit|payment))\b/i,
    /\b(?:(?:sub-?limit|aggregate))\b/i,
  ],
  endorsement: [
    /\b(?:endorsement)\b/i,
    /\b(?:rider)\b/i,
    /\b(?:amendment\s+to\s+(?:the\s+)?policy)\b/i,
  ],
};

/**
 * Clause type precedence for deterministic ordering in T5/T6.
 * When sorting clauses, use this order.
 */
export const CLAUSE_TYPE_PRECEDENCE = [
  "coverage_grant",
  "exclusion",
  "condition",
  "definition",
  "limitation",
  "endorsement",
  "rider",
  "other",
] as const;

// ═══════════════════════════════════════════════════════════════════════
// 7. CONSEQUENCE_STATEMENT_PATTERNS — T4 PATCH2 exclusion rule
// ═══════════════════════════════════════════════════════════════════════

/**
 * PATCH2 rule: Statements restating the denial outcome without asserting
 * a policy basis, factual finding, or condition are not atomic reasons
 * and are not indexed in S4.
 */
export const CONSEQUENCE_STATEMENT_PATTERNS: RegExp[] = [
  /\b(?:accordingly,?\s+no\s+payment\s+will\s+be\s+(?:issued|made))\b/i,
  /\b(?:no\s+(?:payment|benefits?|coverage)\s+(?:will|shall)\s+be\s+(?:issued|provided|made|available))\b/i,
  /\b(?:your\s+claim\s+(?:has\s+been|is(?:\s+hereby)?)\s+denied)\b/i,
  /\b(?:we\s+(?:are\s+)?(?:unable|not\s+able)\s+to\s+(?:pay|cover|honor))\b/i,
  /\b(?:this\s+(?:claim|request)\s+(?:is|has\s+been)\s+(?:closed|denied|rejected))\b/i,
  // Boilerplate opening sentences that are not denial reasons
  /\b(?:we\s+have\s+completed\s+our\s+(?:review|investigation|examination))\b/i,
  /\b(?:we\s+are\s+writing\s+to\s+(?:inform|advise|notify))\b/i,
  /\b(?:thank\s+you\s+for\s+(?:submitting|filing|your))\b/i,
  /\b(?:is\s+therefore\s+denied)\b/i,
  /\b(?:is\s+hereby\s+denied)\b/i,
  /\b(?:claim\s+number\s+[A-Z0-9-]+\s+is\s+(?:therefore|hereby)\s+denied)\b/i,
];

// ═══════════════════════════════════════════════════════════════════════
// 8. VAGUE_DENIAL_INDICATORS — T4 F2 detection
// ═══════════════════════════════════════════════════════════════════════

/**
 * F2 triggers when the denial is a single paragraph with no specific
 * policy basis, factual finding, or condition. These patterns detect
 * vague denials that should trigger F2.
 */
export const VAGUE_DENIAL_INDICATORS: RegExp[] = [
  /\b(?:per\s+policy\s+terms)\b/i,
  /\b(?:(?:based\s+on|per)\s+(?:the|our)\s+(?:review|determination|findings?))\b/i,
  /\b(?:(?:in\s+accordance|consistent)\s+with\s+(?:the\s+)?(?:policy|terms|provisions?))\b/i,
  /\b(?:per\s+(?:the\s+)?applicable\s+terms)\b/i,
  /\b(?:not\s+covered\s+under\s+the\s+terms\s+of\s+your\s+policy)\b/i,
  /\b(?:under\s+the\s+terms\s+(?:and\s+conditions\s+)?of\s+your\s+policy)\b/i,
];

// ═══════════════════════════════════════════════════════════════════════
// Heading Overlap Map re-export from schema
// ═══════════════════════════════════════════════════════════════════════

export { HEADING_OVERLAP_MAP } from "../drizzle/cda-schema";
