/**
 * Timeline Date Normalizer
 *
 * Deterministic normalization of dateOccurred strings for sort purposes only.
 * The original dateOccurred value is never modified in the database.
 *
 * Rules:
 *   1. YYYY-MM-DD           → use as-is
 *   2. YYYY-MM              → normalize to YYYY-MM-01
 *   3. YYYY                 → normalize to YYYY-01-01
 *   4. MM/DD/YYYY           → normalize to YYYY-MM-DD
 *   5. MM/DD (no year)      → sort to bottom (unparseable)
 *   6. null / empty / other → sort to bottom
 *
 * "Sort to bottom" is represented by the sentinel string "9999-99-99".
 */

const SORT_BOTTOM = "9999-99-99";

// Pre-1800 threshold — dates before this year are likely artifacts
// unless explicitly sourced from document text
const PRE_MODERN_YEAR = 1800;

// YYYY-MM-DD (ISO)
const ISO_FULL = /^(\d{4})-(\d{2})-(\d{2})$/;
// YYYY-MM (partial ISO)
const ISO_MONTH = /^(\d{4})-(\d{2})$/;
// YYYY only
const YEAR_ONLY = /^(\d{4})$/;
// MM/DD/YYYY (US format)
const US_FULL = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
// MM/DD (no year — unparseable for chronological sort)
const US_NO_YEAR = /^(\d{1,2})\/(\d{1,2})$/;

/**
 * Normalize a dateOccurred string into an ISO-sortable string.
 * Used strictly for ORDER BY — never persisted.
 */
export function normalizeDateForSort(dateOccurred: string | null | undefined): string {
  if (!dateOccurred || dateOccurred.trim() === "") return SORT_BOTTOM;

  const trimmed = dateOccurred.trim();

  // Rule 1: YYYY-MM-DD → pass through
  const isoFull = trimmed.match(ISO_FULL);
  if (isoFull) return trimmed;

  // Rule 4: MM/DD/YYYY → YYYY-MM-DD
  const usFull = trimmed.match(US_FULL);
  if (usFull) {
    const mm = usFull[1].padStart(2, "0");
    const dd = usFull[2].padStart(2, "0");
    const yyyy = usFull[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Rule 2: YYYY-MM → YYYY-MM-01
  const isoMonth = trimmed.match(ISO_MONTH);
  if (isoMonth) return `${trimmed}-01`;

  // Rule 3: YYYY → YYYY-01-01
  const yearOnly = trimmed.match(YEAR_ONLY);
  if (yearOnly) return `${trimmed}-01-01`;

  // Rule 5: MM/DD (no year) → bottom
  if (US_NO_YEAR.test(trimmed)) return SORT_BOTTOM;

  // Rule 6: anything else → bottom
  return SORT_BOTTOM;
}

/**
 * Check if a normalized date is a pre-1800 artifact.
 * Returns true if the year component is before 1800.
 */
export function isPreModernDate(normalizedDate: string): boolean {
  if (normalizedDate === SORT_BOTTOM) return false;
  const year = parseInt(normalizedDate.substring(0, 4), 10);
  return !isNaN(year) && year < PRE_MODERN_YEAR;
}

/**
 * Comparator for sorting events by normalized date ASC.
 * Null/unparseable dates sort to the bottom.
 */
export function compareDateOccurred(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const na = normalizeDateForSort(a);
  const nb = normalizeDateForSort(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}
