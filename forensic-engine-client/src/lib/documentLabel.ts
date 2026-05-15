/**
 * Derive EFTA display label from filename.
 * If EFTA pattern found → return normalized EFTA label (e.g., "EFTA-00123").
 * Otherwise → return original filename.
 * If null/undefined → return "Unknown Document".
 */
export function deriveDocumentDisplayLabel(filename: string | null | undefined): string {
  if (!filename) return "Unknown Document";
  const match = filename.match(/EFTA[- _]?\d+/i);
  return match ? match[0].toUpperCase().replace(/[_ ]/g, "-") : filename;
}
