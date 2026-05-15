/**
 * Forensic Read-Aloud Formatting Layer
 *
 * Transforms structured evidence data into attribution-first spoken text
 * following the Forensic Read-Aloud Mode system prompt.
 *
 * Rules enforced:
 * I.   Neutral, procedural tone (no dramatization, commentary, or opinion)
 * II.  Attribution-first: document type → ID → page → verbatim quote
 * III. Quote handling: "quote" before, "end quote" after quoted text
 * IV.  Structural announcements: case, document, section transitions
 * V.   Sensitive content: neutral tone maintained, no softening/intensifying
 * VI.  Prohibited: no synthesis verbs, evaluative adjectives, explanatory transitions
 * VII. Plain language mode: translate legal terms, preserve attribution
 * VIII.Completion: "End of readout." then stop
 */

// ─── Types ───

export interface ForensicReadAloudContext {
  caseName?: string;
  documentName?: string;
  documentType?: string;
  sectionName?: string;
  pageNumber?: number | string;
  plainLanguageMode?: boolean;
}

export type ReadAloudContentType =
  | "quote"
  | "finding"
  | "signal"
  | "claim"
  | "entity_description"
  | "relationship"
  | "event"
  | "document_purpose"
  | "correlation"
  | "raw_text";

// ─── Formatting Functions ───

/**
 * Format a verbatim quote for read-aloud with proper attribution.
 */
export function formatQuoteForReadAloud(
  quoteText: string,
  ctx: ForensicReadAloudContext
): string {
  const parts: string[] = [];

  // Structural announcement if context provided
  if (ctx.documentType || ctx.documentName) {
    const docType = ctx.documentType || "document";
    const docId = ctx.documentName || "unidentified";
    parts.push(`The ${docType} identified as ${docId}`);

    if (ctx.pageNumber) {
      parts.push(`states, on page ${ctx.pageNumber},`);
    } else {
      parts.push("states,");
    }
  }

  // Handle redactions
  const processedText = quoteText.replace(/\[redacted\]/gi, "redacted");

  // Quote markers
  parts.push(`quote, ${processedText}, end quote.`);

  // Page reference at end if not already included
  if (ctx.pageNumber && !parts[0]?.includes("page")) {
    parts.push(`Page ${ctx.pageNumber}.`);
  }

  return parts.join(" ");
}

/**
 * Format a Finding for read-aloud with attribution-first delivery.
 */
export function formatFindingForReadAloud(
  finding: {
    title: string;
    description: string;
    significance?: string;
    evidentiaryWeight?: string;
    findingType?: string;
    confidence?: string;
  },
  ctx: ForensicReadAloudContext
): string {
  const parts: string[] = [];

  // Weight announcement
  const weight = finding.evidentiaryWeight === "finding" ? "Finding" : "Note";
  parts.push(`${weight}.`);

  // Title
  parts.push(finding.title + ".");

  // Description (already attribution-first from the pipeline)
  parts.push(finding.description);

  // Procedural context from significance (if present)
  if (finding.significance) {
    parts.push(`Procedural context: ${finding.significance}.`);
  }

  // End of readout
  parts.push("End of readout.");

  return parts.join(" ");
}

/**
 * Format a Signal Flag for read-aloud.
 */
export function formatSignalForReadAloud(
  signal: {
    flagType: string;
    description: string;
    severity?: string;
  },
  ctx: ForensicReadAloudContext
): string {
  const parts: string[] = [];

  // Type announcement
  const flagLabel = signal.flagType.replace(/_/g, " ");
  parts.push(`Signal flag: ${flagLabel}.`);

  if (signal.severity) {
    parts.push(`Severity: ${signal.severity}.`);
  }

  // Description (already attribution-first)
  parts.push(signal.description);

  parts.push("End of readout.");

  return parts.join(" ");
}

/**
 * Format a Claim for read-aloud.
 */
export function formatClaimForReadAloud(
  claimText: string,
  ctx: ForensicReadAloudContext
): string {
  const parts: string[] = [];

  if (ctx.documentName) {
    parts.push(`From ${ctx.documentType || "document"} ${ctx.documentName}.`);
  }

  // Claims contain quoted text — wrap with markers
  if (claimText.includes("'") || claimText.includes('"')) {
    parts.push(claimText);
  } else {
    parts.push(`Quote, ${claimText}, end quote.`);
  }

  parts.push("End of readout.");

  return parts.join(" ");
}

/**
 * Format an Event for read-aloud.
 */
export function formatEventForReadAloud(
  event: {
    title: string;
    description?: string;
    dateOccurred?: string;
    location?: string;
  },
  ctx: ForensicReadAloudContext
): string {
  const parts: string[] = [];

  parts.push(`Event: ${event.title}.`);

  if (event.dateOccurred) {
    parts.push(`Date: ${event.dateOccurred}.`);
  }

  if (event.location) {
    parts.push(`Location: ${event.location}.`);
  }

  if (event.description) {
    parts.push(event.description);
  }

  parts.push("End of readout.");

  return parts.join(" ");
}

/**
 * Format a Relationship description for read-aloud.
 */
export function formatRelationshipForReadAloud(
  description: string,
  entities: { source?: string; target?: string } = {},
  ctx: ForensicReadAloudContext
): string {
  const parts: string[] = [];

  if (entities.source && entities.target) {
    parts.push(`Relationship: ${entities.source} and ${entities.target}.`);
  }

  parts.push(description);

  parts.push("End of readout.");

  return parts.join(" ");
}

/**
 * Format a Correlation for read-aloud.
 */
export function formatCorrelationForReadAloud(
  correlation: {
    correlationType: string;
    description?: string;
  },
  ctx: ForensicReadAloudContext
): string {
  const parts: string[] = [];

  parts.push(`Correlation: ${correlation.correlationType.replace(/_/g, " ")}.`);

  if (correlation.description) {
    parts.push(correlation.description);
  }

  parts.push("End of readout.");

  return parts.join(" ");
}

/**
 * Format a Document Purpose for read-aloud.
 */
export function formatDocumentPurposeForReadAloud(
  purpose: string,
  ctx: ForensicReadAloudContext
): string {
  const parts: string[] = [];

  if (ctx.documentName) {
    parts.push(`Document: ${ctx.documentName}.`);
  }

  if (ctx.documentType) {
    parts.push(`Type: ${ctx.documentType}.`);
  }

  parts.push(purpose);

  parts.push("End of readout.");

  return parts.join(" ");
}

/**
 * Build a structural announcement for section transitions.
 */
export function buildStructuralAnnouncement(ctx: ForensicReadAloudContext): string {
  const parts: string[] = [];

  if (ctx.caseName) {
    parts.push(`Case: ${ctx.caseName}.`);
  }

  if (ctx.documentName) {
    parts.push(`Document: ${ctx.documentName}.`);
  }

  if (ctx.sectionName) {
    parts.push(`Section: ${ctx.sectionName}.`);
  }

  return parts.join(" ");
}

/**
 * Wrap any raw text with "End of readout." completion marker.
 * Used for text that has already been formatted by the pipeline.
 */
export function wrapWithCompletion(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.endsWith("End of readout.")) return trimmed;
  return `${trimmed} End of readout.`;
}

/**
 * Add plain language mode announcement prefix.
 */
export function withPlainLanguageAnnouncement(text: string, isActive: boolean): string {
  if (!isActive) return text;
  return `Plain language mode active. ${text}`;
}
