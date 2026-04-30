/**
 * Phase-2 Temporal Ordering Resolver — Deterministic Anchor Contract
 *
 * Pure deterministic logic. No DB calls. No writes. No side effects.
 *
 * Data flow:
 * T1. Accept temporalAnchors: string[] (ISO 8601 normalized, sorted ascending).
 * T2. Determine hasTemporalData from array length.
 * T3. Extract primaryAnchor (earliest = index 0).
 * T4. Extract latestAnchor (latest = last index).
 * T5. Compute anchorCount.
 * T6. Compute anchorSpanDays (absolute day difference between first and last).
 * T7. Return TemporalOrderingResult.
 *
 * Rules:
 * - No inference.
 * - No synthetic timestamps.
 * - No timezone mutation.
 * - Input array is not mutated.
 * - Output is deterministic for identical input.
 */

// ─── Output Contract ───

export interface TemporalOrderingResult {
  /** Whether the artifact has any temporal anchor data. */
  hasTemporalData: boolean;
  /** Earliest anchor (first in sorted array). Null if no anchors. */
  primaryAnchor: string | null;
  /** Latest anchor (last in sorted array). Null if no anchors. */
  latestAnchor: string | null;
  /** Total number of anchors. */
  anchorCount: number;
  /** Absolute day difference between primaryAnchor and latestAnchor. Null if fewer than 2 anchors. */
  anchorSpanDays: number | null;
}

// ─── Resolver ───

/**
 * Resolve temporal ordering metadata from a sorted array of ISO 8601 date strings.
 *
 * Input contract: temporalAnchors must be ISO 8601 YYYY-MM-DD strings, sorted ascending, deduplicated.
 * This function does not re-sort or deduplicate — it trusts the upstream contract.
 *
 * @param temporalAnchors - Sorted ascending ISO 8601 date strings (YYYY-MM-DD).
 * @returns Deterministic TemporalOrderingResult.
 */
export function resolveTemporalOrder(temporalAnchors: string[]): TemporalOrderingResult {
  // T2. Determine hasTemporalData
  const anchorCount = temporalAnchors.length;
  const hasTemporalData = anchorCount > 0;

  if (!hasTemporalData) {
    return {
      hasTemporalData: false,
      primaryAnchor: null,
      latestAnchor: null,
      anchorCount: 0,
      anchorSpanDays: null,
    };
  }

  // T3. Extract primaryAnchor (earliest = index 0)
  const primaryAnchor = temporalAnchors[0];

  // T4. Extract latestAnchor (latest = last index)
  const latestAnchor = temporalAnchors[anchorCount - 1];

  // T6. Compute anchorSpanDays
  let anchorSpanDays: number | null = null;
  if (anchorCount >= 2) {
    anchorSpanDays = computeDaySpan(primaryAnchor, latestAnchor);
  }

  // T7. Return
  return {
    hasTemporalData,
    primaryAnchor,
    latestAnchor,
    anchorCount,
    anchorSpanDays,
  };
}

// ─── Internal Helpers ───

/**
 * Compute the absolute day difference between two ISO 8601 date strings.
 *
 * Uses UTC-only arithmetic to avoid timezone drift.
 * Rounds to nearest integer.
 *
 * @param dateA - ISO 8601 YYYY-MM-DD string.
 * @param dateB - ISO 8601 YYYY-MM-DD string.
 * @returns Absolute day difference as integer.
 */
function computeDaySpan(dateA: string, dateB: string): number {
  const msPerDay = 86_400_000;
  const a = Date.UTC(
    parseInt(dateA.substring(0, 4), 10),
    parseInt(dateA.substring(5, 7), 10) - 1,
    parseInt(dateA.substring(8, 10), 10),
  );
  const b = Date.UTC(
    parseInt(dateB.substring(0, 4), 10),
    parseInt(dateB.substring(5, 7), 10) - 1,
    parseInt(dateB.substring(8, 10), 10),
  );
  return Math.round(Math.abs(b - a) / msPerDay);
}
