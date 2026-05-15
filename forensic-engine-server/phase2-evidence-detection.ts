/**
 * Phase-2 Domain Logic v1 — Evidence Requirement Detection Engine
 *
 * Deterministic phrase-matching engine for medical denial lane.
 * Consumes sealed snapshot data (read-only). Produces structured
 * evidence requirement checklist entries.
 *
 * Data flow:
 * T1. Accept sealed snapshotId, verify preconditions (sealed, tenant, lane).
 * T2. Read denial letter text from snapshot documents (read-only).
 * T3. Scan text for target phrases using deterministic regex patterns.
 * T4. For each detected phrase, map to a structured evidence requirement.
 * T5. Insert requirements into phase2_evidence_requirements via open run.
 * T6. Mark run complete.
 *
 * Scope constraints:
 * - No mutation of Phase-1 tables.
 * - No narrative generation.
 * - No legal conclusions.
 * - No scoring.
 * - Structured checklist entries only.
 */

// ─── Phrase Detection Patterns ───

export interface DetectionPattern {
  /** Unique identifier for this pattern */
  id: string;
  /** Human-readable label for the detected phrase category */
  category: string;
  /** Regex patterns to match against document text (case-insensitive) */
  patterns: RegExp[];
  /** Structured requirement to insert when pattern is detected */
  requirement: {
    type: string;
    action: string;
    description: string;
    priority: "critical" | "important" | "supplementary";
  };
}

/**
 * Medical denial lane detection patterns.
 * Each pattern maps a denial phrase to a structured evidence requirement.
 */
export const MEDICAL_DENIAL_PATTERNS: DetectionPattern[] = [
  {
    id: "insufficient_documentation",
    category: "Insufficient Documentation",
    patterns: [
      /\b(?:insufficient\s+documentation)\b/i,
      /\b(?:insufficient\s+(?:medical\s+)?records?)\b/i,
      /\b(?:documentation\s+(?:is\s+)?insufficient)\b/i,
      /\b(?:lack(?:s|ing)?\s+(?:of\s+)?(?:sufficient\s+)?documentation)\b/i,
      /\b(?:inadequate\s+documentation)\b/i,
      /\b(?:incomplete\s+(?:medical\s+)?records?)\b/i,
      /\b(?:records?\s+(?:are\s+)?incomplete)\b/i,
      /\b(?:documentation\s+(?:does\s+)?not\s+support)\b/i,
      /\b(?:documentation\s+(?:submitted\s+)?(?:is\s+)?insufficient)\b/i,
      /\b(?:no\s+(?:supporting\s+)?documentation\s+(?:was\s+)?(?:provided|submitted|received))\b/i,
    ],
    requirement: {
      type: "missing_document",
      action: "Request supporting medical records",
      description: "Denial cites insufficient documentation. Request complete medical records including treatment notes, diagnostic reports, lab results, and any supporting clinical documentation.",
      priority: "critical",
    },
  },
  {
    id: "not_medically_necessary",
    category: "Medical Necessity Denial",
    patterns: [
      /\b(?:not\s+medically\s+necessary)\b/i,
      /\b(?:does\s+not\s+meet\s+(?:the\s+)?(?:criteria\s+for\s+)?medical\s+necessity)\b/i,
      /\b(?:medical\s+necessity\s+(?:has\s+)?not\s+been\s+(?:established|demonstrated|met))\b/i,
      /\b(?:fails?\s+to\s+(?:satisfy|meet|demonstrate)\s+(?:the\s+)?(?:clinical\s+)?criteria)\b/i,
      /\b(?:does\s+not\s+meet\s+(?:the\s+)?clinical\s+(?:criteria|guidelines))\b/i,
      /\b(?:medically\s+(?:un)?necessary)\b/i,
      /\b(?:lack(?:s|ing)?\s+(?:of\s+)?medical\s+necessity)\b/i,
    ],
    requirement: {
      type: "medical_necessity_justification",
      action: "Request medical necessity determination criteria",
      description: "Denial cites lack of medical necessity. Request the specific clinical criteria or guidelines used to make this determination, along with the peer reviewer's credentials and rationale.",
      priority: "critical",
    },
  },
  {
    id: "prior_authorization_required",
    category: "Prior Authorization",
    patterns: [
      /\b(?:prior\s+authorization\s+(?:was\s+)?(?:required|not\s+(?:obtained|approved|received)))\b/i,
      /\b(?:pre-?authorization\s+(?:was\s+)?(?:required|not\s+(?:obtained|approved|received)))\b/i,
      /\b(?:(?:no|without)\s+(?:prior|pre-?)\s*authorization)\b/i,
      /\b(?:authorization\s+(?:was\s+)?not\s+(?:obtained|secured|received)\s+(?:prior|before))\b/i,
      /\b(?:failed\s+to\s+(?:obtain|secure)\s+(?:prior\s+)?authorization)\b/i,
      /\b(?:pre-?certification\s+(?:was\s+)?(?:required|not\s+(?:obtained|completed)))\b/i,
    ],
    requirement: {
      type: "authorization_record",
      action: "Request prior authorization record",
      description: "Denial cites missing prior authorization. Request the authorization request record, any approval/denial correspondence, and documentation of any emergency or urgent care exceptions that may apply.",
      priority: "critical",
    },
  },
  {
    id: "policy_section_citation",
    category: "Policy Section Citation",
    patterns: [
      /\b(?:(?:policy|plan)\s+(?:section|provision|clause|article|paragraph)\s+[\w.]+)\b/i,
      /\b(?:section\s+\d+[\w.]*\s+of\s+(?:the|your)\s+(?:policy|plan|contract))\b/i,
      /\b(?:pursuant\s+to\s+(?:section|provision|clause)\s+[\w.]+)\b/i,
      /\b(?:under\s+(?:section|provision|clause|article)\s+[\w.]+)\b/i,
      /\b(?:per\s+(?:section|provision|clause)\s+[\w.]+)\b/i,
      /\b(?:exclusion\s+[\w.]+)\b/i,
      /\b(?:limitation\s+[\w.]+)\b/i,
    ],
    requirement: {
      type: "policy_clause_text",
      action: "Request full cited policy clause text",
      description: "Denial references a specific policy section or exclusion. Request the full verbatim text of the cited clause, including any exceptions, conditions, or definitions referenced therein.",
      priority: "important",
    },
  },
  {
    id: "experimental_investigational",
    category: "Experimental/Investigational Treatment",
    patterns: [
      /\b(?:experimental\s+(?:or\s+)?investigational)\b/i,
      /\b(?:investigational\s+(?:or\s+)?experimental)\b/i,
      /\b(?:(?:considered|classified\s+as)\s+(?:experimental|investigational))\b/i,
      /\b(?:not\s+(?:an?\s+)?(?:established|proven|accepted)\s+(?:treatment|procedure|therapy))\b/i,
      /\b(?:(?:treatment|procedure|therapy)\s+(?:is\s+)?(?:considered\s+)?(?:experimental|investigational))\b/i,
    ],
    requirement: {
      type: "clinical_evidence",
      action: "Request clinical evidence and peer-reviewed studies",
      description: "Denial classifies treatment as experimental or investigational. Request the specific criteria used for this classification, peer-reviewed literature supporting the treatment's efficacy, and any applicable clinical guidelines or FDA approvals.",
      priority: "important",
    },
  },
  {
    id: "out_of_network",
    category: "Out-of-Network Provider",
    patterns: [
      /\b(?:out[\s-]of[\s-]network)\b/i,
      /\b(?:non[\s-]?participating\s+provider)\b/i,
      /\b(?:not\s+(?:a\s+)?(?:participating|in[\s-]network)\s+provider)\b/i,
      /\b(?:provider\s+(?:is\s+)?not\s+(?:in\s+)?(?:our\s+)?network)\b/i,
    ],
    requirement: {
      type: "network_exception",
      action: "Request network adequacy documentation",
      description: "Denial cites out-of-network provider. Request documentation of network adequacy for the required specialty, any applicable out-of-network exception processes, and evidence of whether in-network alternatives were reasonably available.",
      priority: "supplementary",
    },
  },
  {
    id: "timely_filing",
    category: "Timely Filing Deadline",
    patterns: [
      /\b(?:timely\s+filing\s+(?:deadline|limit|requirement))\b/i,
      /\b(?:filed?\s+(?:after|beyond|past)\s+(?:the\s+)?(?:timely\s+filing|filing\s+deadline))\b/i,
      /\b(?:claim\s+(?:was\s+)?(?:submitted|filed|received)\s+(?:after|beyond)\s+(?:the\s+)?(?:deadline|time\s+limit|filing\s+deadline))\b/i,
      /\b(?:(?:submitted|filed|received)\s+(?:after|beyond|past)\s+(?:the\s+)?(?:filing\s+deadline|deadline|time\s+limit))\b/i,
      /\b(?:late\s+(?:claim\s+)?(?:filing|submission))\b/i,
      /\b(?:(?:exceeded|past)\s+(?:the\s+)?filing\s+(?:deadline|limit))\b/i,
    ],
    requirement: {
      type: "filing_timeline",
      action: "Request filing timeline documentation",
      description: "Denial cites timely filing violation. Request the specific filing deadline cited, proof of original submission date, and documentation of any circumstances that may warrant a filing deadline exception.",
      priority: "important",
    },
  },
  {
    id: "benefit_exhausted",
    category: "Benefit Exhaustion",
    patterns: [
      /\b(?:benefit(?:s)?\s+(?:have\s+been\s+)?(?:exhausted|exceeded|reached\s+(?:the\s+)?(?:maximum|limit)))\b/i,
      /\b(?:(?:maximum|annual|lifetime)\s+benefit\s+(?:has\s+been\s+)?(?:reached|exceeded|exhausted))\b/i,
      /\b(?:exceeded\s+(?:the\s+)?(?:maximum|annual|lifetime)\s+(?:benefit|allowance|limit))\b/i,
      /\b(?:no\s+(?:remaining|additional)\s+benefits?\s+(?:available|remaining))\b/i,
    ],
    requirement: {
      type: "benefit_accounting",
      action: "Request benefit utilization accounting",
      description: "Denial cites benefit exhaustion. Request a complete accounting of benefits used to date, the applicable benefit maximum, and documentation of all claims applied against this benefit limit.",
      priority: "important",
    },
  },
];

// ─── Detection Result Types ───

export interface PhraseMatch {
  /** Pattern ID that matched */
  patternId: string;
  /** Category label */
  category: string;
  /** The matched text fragment */
  matchedText: string;
  /** Document ID where the match was found */
  documentId: number;
  /** Quote ID where the match was found (if applicable) */
  quoteId?: number;
  /** Page number (if available) */
  pageNumber?: number;
}

export interface DetectionResult {
  /** Snapshot ID that was analyzed */
  snapshotId: number;
  /** Total documents scanned */
  documentsScanned: number;
  /** Total quotes scanned */
  quotesScanned: number;
  /** All phrase matches found */
  matches: PhraseMatch[];
  /** Deduplicated requirement payloads to insert */
  requirements: Array<{
    patternId: string;
    category: string;
    type: string;
    action: string;
    description: string;
    priority: string;
    matchCount: number;
    sourceDocumentIds: number[];
    sourceQuoteIds: number[];
    sampleMatchedText: string;
  }>;
}

// ─── Detection Engine ───

/**
 * Scan text against all medical denial patterns.
 * Returns all matches found.
 */
export function scanTextForPatterns(
  text: string,
  documentId: number,
  quoteId?: number,
  pageNumber?: number,
): PhraseMatch[] {
  const matches: PhraseMatch[] = [];

  for (const pattern of MEDICAL_DENIAL_PATTERNS) {
    for (const regex of pattern.patterns) {
      const match = regex.exec(text);
      if (match) {
        matches.push({
          patternId: pattern.id,
          category: pattern.category,
          matchedText: match[0],
          documentId,
          quoteId,
          pageNumber,
        });
        // One match per pattern per text block is sufficient
        break;
      }
    }
  }

  return matches;
}

/**
 * Aggregate matches into deduplicated requirement payloads.
 * One requirement per unique patternId, with all source references collected.
 */
export function aggregateRequirements(matches: PhraseMatch[]): DetectionResult["requirements"] {
  const byPattern = new Map<string, {
    pattern: DetectionPattern;
    matches: PhraseMatch[];
  }>();

  for (const match of matches) {
    const existing = byPattern.get(match.patternId);
    if (existing) {
      existing.matches.push(match);
    } else {
      const pattern = MEDICAL_DENIAL_PATTERNS.find(p => p.id === match.patternId);
      if (pattern) {
        byPattern.set(match.patternId, { pattern, matches: [match] });
      }
    }
  }

  const requirements: DetectionResult["requirements"] = [];

  for (const [patternId, { pattern, matches: patternMatches }] of Array.from(byPattern.entries())) {
    const sourceDocumentIds = Array.from(new Set<number>(patternMatches.map((m: PhraseMatch) => m.documentId)));
    const sourceQuoteIds = Array.from(new Set<number>(patternMatches.filter((m: PhraseMatch) => m.quoteId != null).map((m: PhraseMatch) => m.quoteId!)));

    requirements.push({
      patternId,
      category: pattern.category,
      type: pattern.requirement.type,
      action: pattern.requirement.action,
      description: pattern.requirement.description,
      priority: pattern.requirement.priority,
      matchCount: patternMatches.length,
      sourceDocumentIds,
      sourceQuoteIds,
      sampleMatchedText: patternMatches[0].matchedText,
    });
  }

  // Sort by priority: critical > important > supplementary
  const priorityOrder = { critical: 0, important: 1, supplementary: 2 };
  requirements.sort((a, b) =>
    (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
    (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
  );

  return requirements;
}
