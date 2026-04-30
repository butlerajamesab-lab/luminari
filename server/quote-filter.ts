/**
 * Quote Overcapture Filter
 * 
 * Deterministic rules to reject non-substantive quotes at extraction time.
 * No LLM changes — pure string validation.
 */

export interface QuoteFilterResult {
  accepted: boolean;
  reason?: string;
}

// Common document header/footer patterns
const HEADER_FOOTER_PATTERNS = [
  /^page\s+\d+\s*(of\s+\d+)?$/i,
  /^-\s*\d+\s*-$/,                          // "- 3 -" page numbers
  /^\d+\s*of\s*\d+$/i,                      // "3 of 10"
  /^case\s+no\.\s*/i,                        // "Case No. ..."
  /^filed\s+\d{1,2}\/\d{1,2}\/\d{2,4}$/i,  // "Filed 01/15/2024"
  /^exhibit\s+[a-z0-9]+$/i,                  // "Exhibit A"
  /^confidential$/i,
  /^privileged\s*(and\s*confidential)?$/i,
  /^draft$/i,
  /^for\s+official\s+use\s+only$/i,
  /^not\s+for\s+public\s+release$/i,
  /^attorney[- ]client\s+privilege$/i,
  /^work\s+product$/i,
];

// Section label patterns (not substantive quotes)
const SECTION_LABEL_PATTERNS = [
  /^witness[-\s]*\d*\s*name:?\s*$/i,
  /^respondent\s*name:?\s*$/i,
  /^complainant\s*name:?\s*$/i,
  /^date:?\s*$/i,
  /^signature:?\s*$/i,
  /^table\s+of\s+contents$/i,
  /^index$/i,
  /^appendix\s*[a-z]?$/i,
  /^attachment\s*\d*$/i,
];

/**
 * Validate whether a quote should be persisted.
 * Returns { accepted: true } if valid, { accepted: false, reason } if rejected.
 */
export function filterQuote(text: string): QuoteFilterResult {
  if (!text || typeof text !== "string") {
    return { accepted: false, reason: "empty_or_null" };
  }

  const trimmed = text.trim();

  // Reject empty after trim
  if (trimmed.length === 0) {
    return { accepted: false, reason: "empty_after_trim" };
  }

  // Reject quotes shorter than 15 characters
  if (trimmed.length < 15) {
    return { accepted: false, reason: "too_short" };
  }

  // Reject URL-only quotes
  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    return { accepted: false, reason: "url_only" };
  }

  // Reject quotes that are predominantly URLs (URL takes >80% of content)
  const urlMatch = trimmed.match(/https?:\/\/\S+/gi);
  if (urlMatch) {
    const urlLength = urlMatch.reduce((sum, u) => sum + u.length, 0);
    if (urlLength / trimmed.length > 0.8) {
      return { accepted: false, reason: "predominantly_url" };
    }
  }

  // Reject header/footer patterns
  for (const pattern of HEADER_FOOTER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { accepted: false, reason: "header_footer" };
    }
  }

  // Reject section label patterns
  for (const pattern of SECTION_LABEL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { accepted: false, reason: "section_label" };
    }
  }

  // Reject strings with no alphabetic characters
  if (!/[a-zA-Z]/.test(trimmed)) {
    return { accepted: false, reason: "no_letters" };
  }

  return { accepted: true };
}
