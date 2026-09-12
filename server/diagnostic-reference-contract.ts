/** Catalog rows describe references; they do not establish case findings. */
export function reference_strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? reference_strings(parsed) : [value];
  } catch {
    return [value];
  }
}

export function barrier_reference_scope(row: { domains?: unknown; added_by?: string | null }) {
  if (reference_strings(row.domains).some(domain => domain.trim().toLowerCase() === "ingestion")) {
    return "operational_ingestion" as const;
  }
  if (row.added_by === "derived:knowledge-derivation-phase3:live_signals") {
    return "legacy_derived_reference" as const;
  }
  return "catalog_reference" as const;
}

export function reference_matches_domain(value: unknown, domain?: string) {
  return !domain || reference_strings(value).some(item => item.toLowerCase() === domain.toLowerCase());
}
