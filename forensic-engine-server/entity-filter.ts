/**
 * Entity Overcapture Filter
 * 
 * Deterministic rules to reject non-entity strings at ingestion time.
 * No LLM changes — pure string validation.
 * 
 * Rules (in order):
 *  1. empty_or_null — falsy or non-string input
 *  2. empty_after_trim — whitespace-only
 *  3. purely_numeric — digits only (e.g., "000000", "29273")
 *  4. insufficient_alpha_chars — fewer than 3 alphabetic characters
 *  5. no_letters — zero letters (redundant safety net)
 *  6. date_reference_type — type="date_reference" (raw dates are not entities)
 *  7. author_placeholder — "Author", "Unknown Author", etc.
 *  8. entity_reference_artifact — "Entity #NNN"
 *  9. placeholder_artifact — N/A, None, Unknown, [Name], Witness-1, etc.
 * 10. file_attachment — file names (.jpg, .pdf, .docx, etc.)
 * 11. url_entity — HTTP/HTTPS URLs stored as entity names
 * 12. email_prefix — "Re:", "Fwd:", "FW:", etc.
 * 13. symbols_only — only punctuation/symbols, no alphanumerics
 */

export interface EntityFilterResult {
  accepted: boolean;
  reason?: string;
}

// File extension patterns that indicate attachment names, not entities
const FILE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|bmp|tiff|svg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|html|htm|xml|json|zip|rar|mp3|mp4|wav|avi|mov)$/i;

// Email subject line prefixes — not entity names
const EMAIL_PREFIX_PATTERN = /^(re|fwd|fw)\s*:\s*/i;

/**
 * Validate whether an entity name should be persisted.
 * Returns { accepted: true } if valid, { accepted: false, reason } if rejected.
 */
export function filterEntity(name: string, type?: string, role?: string): EntityFilterResult {
  if (!name || typeof name !== "string") {
    return { accepted: false, reason: "empty_or_null" };
  }

  const trimmed = name.trim();

  // Rule 2: Reject empty after trim
  if (trimmed.length === 0) {
    return { accepted: false, reason: "empty_after_trim" };
  }

  // Rule 3: Reject purely numeric strings (e.g., "000000", "0043811863")
  if (/^\d+$/.test(trimmed)) {
    return { accepted: false, reason: "purely_numeric" };
  }

  // Rule 4: Reject strings with fewer than 3 alphabetic characters
  const alphaChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (alphaChars < 3) {
    return { accepted: false, reason: "insufficient_alpha_chars" };
  }

  // Rule 5: Reject strings containing no letters at all (redundant with above, but explicit)
  if (!/[a-zA-Z]/.test(trimmed)) {
    return { accepted: false, reason: "no_letters" };
  }

  // Rule 6: Reject date_reference type entities — raw dates are not graph-worthy entities
  // They belong in the events/timeline layer, not the entity graph
  if (type === "date_reference") {
    return { accepted: false, reason: "date_reference_type" };
  }

  // Rule 7: Reject "Author" with no actual name (role-only nodes)
  const authorOnlyPatterns = [
    /^author$/i,
    /^author\s*#?\d*$/i,
    /^unknown\s*author$/i,
    /^unnamed\s*author$/i,
  ];
  for (const pattern of authorOnlyPatterns) {
    if (pattern.test(trimmed)) {
      return { accepted: false, reason: "author_placeholder" };
    }
  }

  // Rule 8: Reject "Entity #NNN" artifacts (fragmented references)
  if (/^entity\s*#?\s*\d+$/i.test(trimmed)) {
    return { accepted: false, reason: "entity_reference_artifact" };
  }

  // Rule 9: Reject placeholder/artifact patterns
  const placeholderPatterns = [
    /^n\/a$/i,
    /^none$/i,
    /^unknown$/i,
    /^undefined$/i,
    /^null$/i,
    /^placeholder$/i,
    /^test$/i,
    /^tbd$/i,
    /^xxx+$/i,
    /^\[.*\]$/,          // Bracketed placeholders like [Name]
    /^witness[-\s]*\d*$/i, // "Witness-1" without a name
  ];
  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmed)) {
      return { accepted: false, reason: "placeholder_artifact" };
    }
  }

  // Rule 10: Reject file attachment names (e.g., "image3.JPG", "2016 January.docx")
  if (FILE_EXTENSION_PATTERN.test(trimmed)) {
    return { accepted: false, reason: "file_attachment" };
  }

  // Rule 11: Reject URLs stored as entity names
  if (/^https?:\/\//i.test(trimmed)) {
    return { accepted: false, reason: "url_entity" };
  }

  // Rule 12: Reject email subject prefixes that aren't entity names
  // Only reject if the ENTIRE string is just the prefix (e.g., "Re:" alone)
  if (/^(re|fwd|fw)\s*:?\s*$/i.test(trimmed)) {
    return { accepted: false, reason: "email_prefix" };
  }

  // Rule 13: Reject strings that are only punctuation/symbols
  if (/^[^a-zA-Z0-9]+$/.test(trimmed)) {
    return { accepted: false, reason: "symbols_only" };
  }

  return { accepted: true };
}

/**
 * Normalize entity name for dedup purposes.
 * Collapses whitespace, trims, normalizes case for comparison.
 */
export function normalizeEntityName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
