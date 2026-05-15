/**
 * Phase-2 Domain Logic v2 — Structured Notes Detection Engine
 *
 * Deterministic rule-based structural checks against sealed snapshot data.
 * No LLM. No narrative. No scoring. No legal conclusions.
 *
 * Five structural checks:
 * C1. Timeline gap — denial references event not found in extracted timeline.
 * C2. Policy reference mismatch — clause cited in denial but clause text absent.
 * C3. Missing cross-reference — denial reason present but no supporting claim extracted.
 * C4. Internal contradiction — same entity appears in conflicting roles.
 * C5. Required artifact absence — evidence requirement exists but no supporting document found.
 *
 * Data flow:
 * T1. Accept snapshot extraction data (documents, quotes, entities, claims, events, entityRoles, signalFlags, evidenceRequirements).
 * T2. Run each check independently against the data.
 * T3. Collect structured notes with type, description, sourceReferences, confidence.
 * T4. Return aggregated notes array.
 */

import { ENGINE_VERSION } from "../shared/const";

// ─── Types ───

export interface StructuredNote {
  /** Check type identifier */
  type: string;
  /** Factual, structural description of the inconsistency. No opinions. */
  description: string;
  /** Data sources referenced by this note */
  sourceReferences: string[];
  /** Confidence classification: "structural" = deterministic rule match */
  confidence: "structural";
}

/** Snapshot extraction data passed to the detection engine (read-only). */
export interface SnapshotData {
  snapshotId: number;
  documents: Array<{
    id: number;
    filename: string;
    textContent: string | null;
    documentType: string | null;
  }>;
  quotes: Array<{
    id: number;
    documentId: number;
    text: string;
    pageNumber: number | null;
  }>;
  entities: Array<{
    id: number;
    name: string;
    type: string;
    description: string | null;
  }>;
  entityRoles: Array<{
    id: number;
    entityId: number;
    documentId: number;
    role: string;
  }>;
  claims: Array<{
    id: number;
    documentId: number;
    quoteId: number;
    claimText: string;
    claimType: string;
    dateReferenced: string | null;
    entitiesInvolved: number[] | null;
  }>;
  events: Array<{
    id: number;
    eventType: string;
    title: string;
    description: string | null;
    dateOccurred: string | null;
    entitiesInvolved: number[] | null;
    quoteIds: number[] | null;
  }>;
  signalFlags: Array<{
    id: number;
    documentId: number;
    flagType: string;
    description: string | null;
    quoteId: number | null;
  }>;
  /** Phase-2 v1 evidence requirements (optional reference) */
  evidenceRequirements: Array<{
    id: number;
    runId: number;
    payload: Record<string, unknown>;
  }>;
}

// ─── Denial Phrase Patterns (for cross-referencing with timeline/claims) ───

/** Event types that prior authorization references should match against */
const PRIOR_AUTH_EVENT_TYPES = ["authorization", "pre-authorization", "pre-certification", "approval"];
const PRIOR_AUTH_KEYWORDS = /\b(?:prior\s+authorization|pre-?authorization|pre-?certification)\b/i;

/** Medical necessity keywords */
const MEDICAL_NECESSITY_KEYWORDS = /\b(?:not\s+medically\s+necessary|medical\s+necessity|medically\s+unnecessary|lack(?:s|ing)?\s+(?:of\s+)?medical\s+necessity)\b/i;

/** Policy section citation pattern */
const POLICY_SECTION_PATTERN = /\b(?:(?:policy|plan)\s+(?:section|provision|clause|article)\s+([\w.]+))\b/i;
const POLICY_SECTION_GENERAL = /\b(?:section\s+\d+[\w.]*|provision\s+[\w.]+|clause\s+[\w.]+|article\s+[\w.]+)\b/i;

/** Timely filing keywords */
const TIMELY_FILING_KEYWORDS = /\b(?:timely\s+filing|filing\s+deadline|late\s+(?:claim\s+)?(?:filing|submission))\b/i;

/** Experimental/investigational keywords */
const EXPERIMENTAL_KEYWORDS = /\b(?:experimental|investigational)\b/i;

/** Out-of-network keywords */
const OUT_OF_NETWORK_KEYWORDS = /\b(?:out[\s-]of[\s-]network|non[\s-]?participating\s+provider)\b/i;

/** Benefit exhaustion keywords */
const BENEFIT_EXHAUSTED_KEYWORDS = /\b(?:benefit(?:s)?\s+(?:have\s+been\s+)?(?:exhausted|exceeded)|maximum\s+benefit|no\s+remaining\s+benefits?)\b/i;

/** Insufficient documentation keywords */
const INSUFFICIENT_DOC_KEYWORDS = /\b(?:insufficient\s+documentation|inadequate\s+documentation|incomplete\s+(?:medical\s+)?records?|documentation\s+(?:does\s+)?not\s+support)\b/i;

// ─── Check C1: Timeline Gap Detection ───

/**
 * C1. Detect when denial text references events not found in the extracted timeline.
 *
 * Rule: If denial text mentions "prior authorization" but no authorization-type event
 * exists in the events table, emit a timeline_gap note.
 * Similarly for other event-referencing denial phrases.
 */
export function checkTimelineGaps(data: SnapshotData): StructuredNote[] {
  const notes: StructuredNote[] = [];

  // Collect all text from denial-type documents and quotes
  const denialTexts = collectDenialTexts(data);
  if (denialTexts.length === 0) return notes;

  const combinedDenialText = denialTexts.map(t => t.text).join(" ");

  // Check: denial mentions prior authorization but no authorization event exists
  if (PRIOR_AUTH_KEYWORDS.test(combinedDenialText)) {
    const hasAuthEvent = data.events.some(e =>
      PRIOR_AUTH_EVENT_TYPES.some(t =>
        e.eventType.toLowerCase().includes(t) ||
        (e.title && e.title.toLowerCase().includes("authorization"))
      )
    );
    if (!hasAuthEvent) {
      notes.push({
        type: "timeline_inconsistency",
        description:
          "Denial references prior authorization, but no prior authorization event exists in extracted timeline.",
        sourceReferences: ["denial_letter", "events"],
        confidence: "structural",
      });
    }
  }

  // Check: denial mentions timely filing but no filing-related event with date exists
  if (TIMELY_FILING_KEYWORDS.test(combinedDenialText)) {
    const hasFilingEvent = data.events.some(e =>
      e.eventType.toLowerCase().includes("filing") ||
      (e.title && e.title.toLowerCase().includes("filing")) ||
      (e.title && e.title.toLowerCase().includes("submission"))
    );
    if (!hasFilingEvent) {
      notes.push({
        type: "timeline_inconsistency",
        description:
          "Denial references timely filing deadline, but no filing or submission event exists in extracted timeline.",
        sourceReferences: ["denial_letter", "events"],
        confidence: "structural",
      });
    }
  }

  // Check: denial mentions specific dates but those dates don't appear in any event
  // (Structural check: if denial text contains a date pattern that doesn't match any event dateOccurred)
  const denialDates = extractDateReferences(combinedDenialText);
  const eventDates = new Set(
    data.events
      .filter(e => e.dateOccurred)
      .map(e => normalizeDate(e.dateOccurred!))
      .filter(Boolean)
  );

  for (const denialDate of denialDates) {
    const normalized = normalizeDate(denialDate);
    if (normalized && !eventDates.has(normalized)) {
      notes.push({
        type: "timeline_inconsistency",
        description:
          `Denial references date "${denialDate}" but no event with this date exists in extracted timeline.`,
        sourceReferences: ["denial_letter", "events"],
        confidence: "structural",
      });
    }
  }

  return notes;
}

// ─── Check C2: Policy Reference Mismatch ───

/**
 * C2. Detect when denial cites a policy section but the cited clause text is absent.
 *
 * Rule: If denial text references "section X.Y" or "provision Z" but no document
 * of type policy/contract contains that section text, emit a policy_definition_mismatch note.
 */
export function checkPolicyReferenceMismatch(data: SnapshotData): StructuredNote[] {
  const notes: StructuredNote[] = [];

  const denialTexts = collectDenialTexts(data);
  if (denialTexts.length === 0) return notes;

  const combinedDenialText = denialTexts.map(t => t.text).join(" ");

  // Check if any policy/contract document contains the cited sections
  const policyDocs = data.documents.filter(d =>
    d.documentType &&
    (d.documentType.toLowerCase().includes("policy") ||
     d.documentType.toLowerCase().includes("contract") ||
     d.documentType.toLowerCase().includes("plan") ||
     d.documentType.toLowerCase().includes("benefit"))
  );

  const policyText = policyDocs
    .map(d => d.textContent ?? "")
    .join(" ")
    .toLowerCase();

  // Check: denial cites "not medically necessary" but no medical necessity definition in policy
  if (MEDICAL_NECESSITY_KEYWORDS.test(combinedDenialText)) {
    const hasMedNecDef = policyText.includes("medical necessity") ||
      policyText.includes("medically necessary") ||
      policyText.includes("definition of medical necessity");

    if (!hasMedNecDef) {
      notes.push({
        type: "policy_definition_mismatch",
        description:
          "Denial cites 'not medically necessary' but extracted policy definition of medical necessity is not present in snapshot.",
        sourceReferences: ["denial_letter", "policy_contract"],
        confidence: "structural",
      });
    }
  }

  // Extract policy section references from denial text
  const sectionRefs = extractPolicySectionReferences(combinedDenialText);
  if (sectionRefs.length === 0) return notes;

  for (const ref of sectionRefs) {
    // Check if the cited section appears in any policy document
    const refLower = ref.toLowerCase();
    const found = policyText.includes(refLower) ||
      policyText.includes(`section ${refLower}`) ||
      policyText.includes(`provision ${refLower}`) ||
      policyText.includes(`clause ${refLower}`);

    if (!found) {
      // Also check if there are NO policy documents at all
      if (policyDocs.length === 0) {
        notes.push({
          type: "policy_definition_mismatch",
          description:
            `Denial cites "${ref}" but no policy or contract document exists in snapshot.`,
          sourceReferences: ["denial_letter", "policy_contract"],
          confidence: "structural",
        });
      } else {
        notes.push({
          type: "policy_definition_mismatch",
          description:
            `Denial cites "${ref}" but the cited clause text is not found in extracted policy documents.`,
          sourceReferences: ["denial_letter", "policy_contract"],
          confidence: "structural",
        });
      }
    }
  }

  return notes;
}

// ─── Check C3: Missing Cross-Reference ───

/**
 * C3. Detect when a denial reason is present but no supporting claim was extracted.
 *
 * Rule: If denial text asserts a specific reason (e.g., "experimental treatment",
 * "out of network") but no claim in the claims table references that reason category,
 * emit a missing_cross_reference note.
 */
export function checkMissingCrossReference(data: SnapshotData): StructuredNote[] {
  const notes: StructuredNote[] = [];

  const denialTexts = collectDenialTexts(data);
  if (denialTexts.length === 0) return notes;

  const combinedDenialText = denialTexts.map(t => t.text).join(" ");
  const claimTexts = data.claims.map(c => c.claimText.toLowerCase()).join(" ");

  // Check each denial reason category against claims
  const reasonChecks: Array<{
    keyword: RegExp;
    label: string;
    claimKeywords: string[];
  }> = [
    {
      keyword: EXPERIMENTAL_KEYWORDS,
      label: "experimental/investigational treatment",
      claimKeywords: ["experimental", "investigational"],
    },
    {
      keyword: OUT_OF_NETWORK_KEYWORDS,
      label: "out-of-network provider",
      claimKeywords: ["out-of-network", "out of network", "non-participating"],
    },
    {
      keyword: BENEFIT_EXHAUSTED_KEYWORDS,
      label: "benefit exhaustion",
      claimKeywords: ["benefit exhausted", "benefit exceeded", "maximum benefit", "no remaining benefit"],
    },
    {
      keyword: INSUFFICIENT_DOC_KEYWORDS,
      label: "insufficient documentation",
      claimKeywords: ["insufficient documentation", "inadequate documentation", "incomplete records"],
    },
    {
      keyword: TIMELY_FILING_KEYWORDS,
      label: "timely filing violation",
      claimKeywords: ["timely filing", "filing deadline", "late filing", "late submission"],
    },
  ];

  for (const check of reasonChecks) {
    if (check.keyword.test(combinedDenialText)) {
      const hasSupportingClaim = check.claimKeywords.some(kw => claimTexts.includes(kw));
      if (!hasSupportingClaim) {
        notes.push({
          type: "missing_cross_reference",
          description:
            `Denial asserts "${check.label}" but no supporting claim referencing this reason was extracted.`,
          sourceReferences: ["denial_letter", "claims"],
          confidence: "structural",
        });
      }
    }
  }

  return notes;
}

// ─── Check C4: Internal Contradiction ───

/**
 * C4. Detect when the same entity appears in conflicting roles across documents.
 *
 * Rule: If entity X has role A in document 1 and a conflicting role B in document 2,
 * emit an internal_contradiction note. Conflicting role pairs are predefined.
 */
export function checkInternalContradiction(data: SnapshotData): StructuredNote[] {
  const notes: StructuredNote[] = [];

  // Define conflicting role pairs (structural detection only)
  const CONFLICTING_ROLES: Array<[string[], string[]]> = [
    // Provider vs. reviewer — same entity should not be both
    [["provider", "treating_physician", "attending_physician", "referring_physician"],
     ["reviewer", "peer_reviewer", "medical_reviewer", "utilization_reviewer"]],
    // Claimant vs. insurer
    [["claimant", "patient", "member", "subscriber", "beneficiary"],
     ["insurer", "payer", "plan_administrator", "claims_adjuster"]],
    // Approver vs. denier
    [["approver", "authorizer"],
     ["denier", "denial_authority"]],
  ];

  // Group entity roles by entity ID
  const rolesByEntity = new Map<number, Array<{ role: string; documentId: number }>>();
  for (const er of data.entityRoles) {
    const existing = rolesByEntity.get(er.entityId) ?? [];
    existing.push({ role: er.role.toLowerCase(), documentId: er.documentId });
    rolesByEntity.set(er.entityId, existing);
  }

  // Check each entity for conflicting roles
  for (const [entityId, roles] of Array.from(rolesByEntity.entries())) {
    const entity = data.entities.find(e => e.id === entityId);
    if (!entity) continue;

    const uniqueRoles = Array.from(new Set(roles.map(r => r.role)));
    if (uniqueRoles.length < 2) continue;

    for (const [groupA, groupB] of CONFLICTING_ROLES) {
      const hasRoleA = uniqueRoles.some(r => groupA.some(g => r.includes(g)));
      const hasRoleB = uniqueRoles.some(r => groupB.some(g => r.includes(g)));

      if (hasRoleA && hasRoleB) {
        const roleAMatch = uniqueRoles.find(r => groupA.some(g => r.includes(g)))!;
        const roleBMatch = uniqueRoles.find(r => groupB.some(g => r.includes(g)))!;

        notes.push({
          type: "internal_contradiction",
          description:
            `Entity "${entity.name}" appears as "${roleAMatch}" and "${roleBMatch}" across documents. These roles are structurally conflicting.`,
          sourceReferences: ["entities", "entity_roles"],
          confidence: "structural",
        });
      }
    }
  }

  return notes;
}

// ─── Check C5: Required Artifact Absence ───

/**
 * C5. Detect when a Phase-2 v1 evidence requirement exists but no supporting
 * document was found in the snapshot.
 *
 * Rule: For each evidence requirement of type "missing_document", check if any
 * document in the snapshot could satisfy it. If not, emit a required_artifact_absence note.
 */
export function checkRequiredArtifactAbsence(data: SnapshotData): StructuredNote[] {
  const notes: StructuredNote[] = [];

  if (data.evidenceRequirements.length === 0) return notes;

  // Map requirement types to document types that would satisfy them
  const REQUIREMENT_TO_DOC_TYPE: Record<string, string[]> = {
    missing_document: [
      "medical_record", "treatment_note", "diagnostic_report", "lab_result",
      "clinical_documentation", "medical_records",
    ],
    medical_necessity_justification: [
      "medical_necessity_determination", "peer_review", "clinical_criteria",
      "clinical_guideline", "utilization_review",
    ],
    authorization_record: [
      "prior_authorization", "authorization", "pre-certification",
      "authorization_request", "authorization_approval", "authorization_denial",
    ],
    policy_clause_text: [
      "policy", "contract", "plan_document", "benefit_document",
      "certificate_of_coverage", "summary_of_benefits",
    ],
    clinical_evidence: [
      "clinical_study", "peer_reviewed_study", "clinical_trial",
      "fda_approval", "clinical_guideline",
    ],
    network_exception: [
      "network_adequacy", "provider_directory", "network_exception",
    ],
    filing_timeline: [
      "filing_record", "submission_receipt", "claim_submission",
    ],
    benefit_accounting: [
      "benefit_statement", "explanation_of_benefits", "eob",
      "benefit_utilization", "benefit_summary",
    ],
  };

  const docTypes = new Set(
    data.documents
      .filter(d => d.documentType)
      .map(d => d.documentType!.toLowerCase())
  );

  for (const req of data.evidenceRequirements) {
    const payload = req.payload as Record<string, unknown>;
    const reqType = (payload.type as string) ?? "";

    const satisfyingTypes = REQUIREMENT_TO_DOC_TYPE[reqType];
    if (!satisfyingTypes) continue;

    const hasSatisfyingDoc = satisfyingTypes.some(st => {
      // Check exact match or partial match
      for (const dt of Array.from(docTypes)) {
        if (dt.includes(st) || st.includes(dt)) return true;
      }
      return false;
    });

    if (!hasSatisfyingDoc) {
      const action = (payload.action as string) ?? reqType;
      notes.push({
        type: "required_artifact_absence",
        description:
          `Evidence requirement "${action}" exists but no supporting document of the required type was found in snapshot.`,
        sourceReferences: ["evidence_requirements", "documents"],
        confidence: "structural",
      });
    }
  }

  return notes;
}

// ─── Aggregation ───

/**
 * Run all 5 structural checks and return aggregated notes.
 */
export function runAllChecks(data: SnapshotData): StructuredNote[] {
  const notes: StructuredNote[] = [];

  notes.push(...checkTimelineGaps(data));
  notes.push(...checkPolicyReferenceMismatch(data));
  notes.push(...checkMissingCrossReference(data));
  notes.push(...checkInternalContradiction(data));
  notes.push(...checkRequiredArtifactAbsence(data));

  return notes;
}

/**
 * Build the structured notes payload for insertion into phase2_structured_notes.
 */
export function buildStructuredNotesPayload(
  snapshotId: number,
  notes: StructuredNote[],
): Record<string, unknown> {
  return {
    snapshotId,
    engineVersionReference: `READ ${ENGINE_VERSION}`,
    notes,
  };
}

// ─── Utility Functions ───

interface TextSource {
  text: string;
  documentId: number;
  source: "document" | "quote";
}

/**
 * Collect text from denial-type documents and quotes.
 * Denial documents are identified by documentType containing "denial".
 */
function collectDenialTexts(data: SnapshotData): TextSource[] {
  const texts: TextSource[] = [];

  // Collect from denial-type documents
  for (const doc of data.documents) {
    const isDenial = doc.documentType &&
      (doc.documentType.toLowerCase().includes("denial") ||
       doc.documentType.toLowerCase().includes("adverse") ||
       doc.documentType.toLowerCase().includes("determination"));

    if (isDenial && doc.textContent) {
      texts.push({
        text: doc.textContent,
        documentId: doc.id,
        source: "document",
      });
    }
  }

  // If no denial documents found, scan all documents
  // (some cases may not have typed documents yet)
  if (texts.length === 0) {
    for (const doc of data.documents) {
      if (doc.textContent) {
        texts.push({
          text: doc.textContent,
          documentId: doc.id,
          source: "document",
        });
      }
    }
  }

  // Also include quotes from denial documents
  const denialDocIds = new Set(texts.map(t => t.documentId));
  for (const q of data.quotes) {
    if (denialDocIds.has(q.documentId) && q.text) {
      texts.push({
        text: q.text,
        documentId: q.documentId,
        source: "quote",
      });
    }
  }

  return texts;
}

/**
 * Extract policy section references from text.
 * Returns the section identifiers (e.g., "4.2", "III.B").
 */
function extractPolicySectionReferences(text: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();

  // Match "section X.Y", "provision Z", "clause A.B"
  const patterns = [
    /(?:section|provision|clause|article)\s+([\w.]+(?:\.\w+)*)/gi,
    /(?:policy|plan)\s+(?:section|provision|clause)\s+([\w.]+(?:\.\w+)*)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const ref = match[1];
      // Filter out very short or numeric-only refs that are likely false positives
      if (ref && ref.length >= 2 && !seen.has(ref.toLowerCase())) {
        seen.add(ref.toLowerCase());
        refs.push(ref);
      }
    }
  }

  return refs;
}

/**
 * Extract date references from text.
 * Matches common date formats: MM/DD/YYYY, Month DD YYYY, YYYY-MM-DD.
 */
function extractDateReferences(text: string): string[] {
  const dates: string[] = [];
  const seen = new Set<string>();

  const patterns = [
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g,
    /\b(\d{4}-\d{2}-\d{2})\b/g,
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const dateStr = match[1];
      if (!seen.has(dateStr)) {
        seen.add(dateStr);
        dates.push(dateStr);
      }
    }
  }

  return dates;
}

/**
 * Normalize a date string to YYYY-MM-DD for comparison.
 * Returns null if the date cannot be parsed.
 */
export function normalizeDate(dateStr: string): string | null {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // Try MM/DD/YYYY
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Try "Month DD, YYYY" or "Month DD YYYY"
  const monthNames: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const longMatch = /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i.exec(dateStr);
  if (longMatch) {
    const [, month, day, year] = longMatch;
    const mm = monthNames[month.toLowerCase()];
    if (mm) return `${year}-${mm}-${day.padStart(2, "0")}`;
  }

  return null;
}
