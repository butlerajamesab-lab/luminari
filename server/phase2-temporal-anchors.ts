/**
 * Phase-2 Temporal Anchoring — Date Extraction for Structured Notes
 *
 * Deterministic extraction of temporal anchors from sealed snapshot data.
 * No inference. No synthetic timestamps. No guessing.
 *
 * Data flow:
 * T1. Accept SnapshotData (read-only).
 * T2. Extract dates from events.dateOccurred.
 * T3. Extract dates from claims.dateReferenced.
 * T4. Extract dates from documents.aiMetadata.date_filed.
 * T5. Normalize all dates to ISO 8601 (YYYY-MM-DD).
 * T6. Deduplicate.
 * T7. Sort ascending.
 * T8. Return string[].
 *
 * Rules:
 * - Only use dates already present in structured extraction.
 * - No guessing.
 * - No inference.
 * - No synthetic ordering.
 */

import { normalizeDate, type SnapshotData } from "./phase2-structured-notes-detection";

/**
 * Extract temporal anchors from snapshot data.
 *
 * Sources (in extraction order):
 * 1. events.dateOccurred — event timeline dates
 * 2. claims.dateReferenced — claim-level date references
 * 3. documents.aiMetadata.date_filed — document filing dates
 *
 * Returns: sorted ascending, deduplicated ISO 8601 date strings (YYYY-MM-DD).
 */
export function extractTemporalAnchors(data: SnapshotData): string[] {
  const rawDates: string[] = [];

  // T2. Extract from events.dateOccurred
  for (const event of data.events) {
    if (event.dateOccurred) {
      rawDates.push(event.dateOccurred);
    }
  }

  // T3. Extract from claims.dateReferenced
  for (const claim of data.claims) {
    if (claim.dateReferenced) {
      rawDates.push(claim.dateReferenced);
    }
  }

  // T4. Extract from documents.aiMetadata.date_filed
  for (const doc of data.documents) {
    const aiMeta = (doc as any).aiMetadata;
    if (aiMeta && typeof aiMeta === "object" && aiMeta.date_filed) {
      rawDates.push(String(aiMeta.date_filed));
    }
  }

  // T5. Normalize all to ISO 8601 (YYYY-MM-DD)
  const normalized: string[] = [];
  for (const raw of rawDates) {
    const norm = normalizeDate(raw);
    if (norm) {
      normalized.push(norm);
    }
  }

  // T6. Deduplicate
  const unique = Array.from(new Set(normalized));

  // T7. Sort ascending
  unique.sort();

  // T8. Return
  return unique;
}

/**
 * Extract temporal anchors for a specific structured note.
 *
 * Narrows the full snapshot anchors to only those dates referenced
 * in the note's sourceReferences or description.
 *
 * If the note references specific dates (e.g., "date '2024-01-15'"),
 * only those dates are included. Otherwise, all snapshot anchors
 * are returned (the note is a structural observation across the full corpus).
 */
export function extractAnchorsForNote(
  note: { type: string; description: string; sourceReferences: string[] },
  allAnchors: string[],
): string[] {
  // Check if the note description contains specific date references
  const datePattern = /\b(\d{4}-\d{2}-\d{2})\b/g;
  const referencedDates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = datePattern.exec(note.description)) !== null) {
    referencedDates.push(match[1]);
  }

  if (referencedDates.length > 0) {
    // Return only dates that appear in both the note and the snapshot anchors
    const anchorSet = new Set(allAnchors);
    const filtered = referencedDates.filter(d => anchorSet.has(d));
    // Deduplicate and sort
    return Array.from(new Set(filtered)).sort();
  }

  // For notes without specific date references, return all snapshot anchors
  // (the note is a structural observation that spans the full temporal range)
  return allAnchors;
}
