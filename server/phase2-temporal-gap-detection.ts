/**
 * Phase-2 Temporal Gap Detection — Structural Analysis Layer
 *
 * Deterministic gap detection using existing temporal anchors and ordering logic.
 * No LLM usage. No inference beyond anchor comparisons. No mutation of Phase-1 tables.
 *
 * Data flow:
 * T1. Collect all temporal anchors from Phase-1 findings and Phase-2 structured notes.
 * T2. Deduplicate and sort ascending.
 * T3. Compute day difference between consecutive anchors.
 * T4. If gapDays >= GAP_THRESHOLD_DAYS, produce a GapDetectionResult.
 * T5. Return array of detected gaps.
 *
 * Rules:
 * - No inference.
 * - No synthetic timestamps.
 * - No LLM enrichment.
 * - No mutation of Phase-1 tables.
 * - No resealing of snapshots.
 * - Idempotent: duplicate detection produces identical output.
 */

// ─── Configuration ───

export const GAP_THRESHOLD_DAYS = 90;

// ─── Output Contract ───

export interface TemporalGap {
  /** Type identifier for structured note payload. */
  type: "temporal_gap";
  /** Human-readable description of the gap. */
  description: string;
  /** ISO 8601 date string — start of the gap (last documented anchor before gap). */
  gapStart: string;
  /** ISO 8601 date string — end of the gap (first documented anchor after gap). */
  gapEnd: string;
  /** Number of days in the gap (integer, >= GAP_THRESHOLD_DAYS). */
  gapDays: number;
  /** Confidence level — always "structural" for deterministic gap detection. */
  confidence: "structural";
}

export interface GapDetectionResult {
  /** Total number of unique temporal anchors analyzed. */
  anchorsAnalyzed: number;
  /** Number of gaps detected (gapDays >= GAP_THRESHOLD_DAYS). */
  gapsDetected: number;
  /** The detected gaps. */
  gaps: TemporalGap[];
  /** The threshold used for detection. */
  thresholdDays: number;
}

// ─── Gap Detection Logic ───

/**
 * Detect temporal gaps in a sorted array of ISO 8601 date strings.
 *
 * T1. Accept anchors (already deduplicated and sorted ascending).
 * T2. Iterate consecutive pairs.
 * T3. Compute day difference for each pair.
 * T4. If difference >= threshold, record gap.
 * T5. Return GapDetectionResult.
 *
 * @param anchors - Sorted ascending, deduplicated ISO 8601 YYYY-MM-DD strings.
 * @param thresholdDays - Minimum gap size in days to flag. Defaults to GAP_THRESHOLD_DAYS.
 * @returns GapDetectionResult with all detected gaps.
 */
export function detectTemporalGaps(
  anchors: string[],
  thresholdDays: number = GAP_THRESHOLD_DAYS,
): GapDetectionResult {
  const gaps: TemporalGap[] = [];

  if (anchors.length < 2) {
    return {
      anchorsAnalyzed: anchors.length,
      gapsDetected: 0,
      gaps: [],
      thresholdDays,
    };
  }

  // T2–T4. Iterate consecutive pairs and compute day differences
  for (let i = 0; i < anchors.length - 1; i++) {
    const current = anchors[i];
    const next = anchors[i + 1];
    const dayDiff = computeDayDifference(current, next);

    if (dayDiff >= thresholdDays) {
      gaps.push({
        type: "temporal_gap",
        description: `No documented activity between ${current} and ${next}`,
        gapStart: current,
        gapEnd: next,
        gapDays: dayDiff,
        confidence: "structural",
      });
    }
  }

  return {
    anchorsAnalyzed: anchors.length,
    gapsDetected: gaps.length,
    gaps,
    thresholdDays,
  };
}

/**
 * Build structured note payloads from detected gaps.
 *
 * Each gap produces one structured note payload suitable for insertion
 * via phase2Db.createStructuredNote.
 *
 * @param snapshotId - The snapshot these gaps belong to.
 * @param gaps - Array of TemporalGap objects from detectTemporalGaps.
 * @returns Array of payload objects for createStructuredNote.
 */
export function buildGapNotePayloads(
  snapshotId: number,
  gaps: TemporalGap[],
): Array<{ payload: Record<string, unknown>; temporalAnchors: string[] }> {
  return gaps.map((gap) => ({
    payload: {
      snapshotId,
      type: gap.type,
      description: gap.description,
      gapStart: gap.gapStart,
      gapEnd: gap.gapEnd,
      gapDays: gap.gapDays,
      confidence: gap.confidence,
      engineStep: "temporal_gap_detection",
    },
    temporalAnchors: [gap.gapStart, gap.gapEnd],
  }));
}

/**
 * Check if a gap note already exists for a given span in existing structured notes.
 *
 * Used for idempotency: prevents duplicate gap notes for the same snapshot span on rerun.
 *
 * @param existingNotes - Array of existing structured note payloads.
 * @param gap - The gap to check for duplicates.
 * @returns true if a matching gap note already exists.
 */
export function gapNoteAlreadyExists(
  existingNotes: Array<{ payload: unknown }>,
  gap: TemporalGap,
): boolean {
  for (const note of existingNotes) {
    const p = note.payload as Record<string, unknown> | null;
    if (!p) continue;
    if (
      p.type === "temporal_gap" &&
      p.gapStart === gap.gapStart &&
      p.gapEnd === gap.gapEnd
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Merge all temporal anchors from multiple sources into a single sorted, deduplicated array.
 *
 * @param anchorSources - Arrays of ISO 8601 date strings from different artifact types.
 * @returns Sorted ascending, deduplicated ISO 8601 date strings.
 */
export function mergeAnchors(...anchorSources: string[][]): string[] {
  const all: string[] = [];
  for (const source of anchorSources) {
    for (const anchor of source) {
      all.push(anchor);
    }
  }
  const unique = Array.from(new Set(all));
  unique.sort();
  return unique;
}

// ─── Internal Helpers ───

/**
 * Compute the absolute day difference between two ISO 8601 YYYY-MM-DD date strings.
 * Uses UTC-only arithmetic to avoid timezone drift.
 */
function computeDayDifference(dateA: string, dateB: string): number {
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
