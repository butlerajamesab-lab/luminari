/**
 * Resource Directory search-input hygiene.
 *
 * The directory's `category` filter has exactly nine canonical values —
 * the reviewed category taxonomy. The summary payload, however, derives
 * its category list from every distinct value stored in the corpus:
 * `get_unified_catalog_summary` unnests `resource_category` together
 * with `service_categories`, and both columns carry values that are not
 * categories at all — legacy labels (`organization`, `veterans`) and
 * free-text appendix section composites parsed in verbatim (e.g.
 * "Disability (SSDI/SSI), retirement, survivors | Federal prosecution /
 * civil rights — central Pennsylvania | …", verified in production
 * data 2026-11-11). The directory page rendered every summary value as
 * a filter chip and sent the clicked string verbatim as `category`;
 * composites fail the search input schema (max 64 chars,
 * /^[a-z0-9_]+$/) and the page then rendered the raw validation
 * payload to the reader.
 *
 * These helpers are the single choke point for the directory surfaces:
 * only a canonical key may travel in `category`, and error text shown
 * to a reader is always a human sentence, never a serialized payload.
 */

export const CANONICAL_DIRECTORY_CATEGORIES = [
  "housing",
  "healthcare",
  "legal_civil_rights",
  "cash_assistance",
  "food_nutrition",
  "tribal",
  "safety_crisis",
  "utilities",
  "employment_labor",
] as const;

export type DirectoryCategory =
  (typeof CANONICAL_DIRECTORY_CATEGORIES)[number];

const CANONICAL_CATEGORY_SET: ReadonlySet<string> = new Set(
  CANONICAL_DIRECTORY_CATEGORIES,
);

export function isCanonicalDirectoryCategory(
  value: unknown,
): value is DirectoryCategory {
  return typeof value === "string" && CANONICAL_CATEGORY_SET.has(value);
}

/**
 * Returns the value when it is a canonical category key, else
 * undefined. Non-canonical selections — legacy labels, data-derived
 * free text, anything arriving via a shared URL — are dropped: they
 * are not categories, and the search input has no other channel they
 * belong in.
 */
export function canonicalDirectoryCategory(
  value: string | null | undefined,
): DirectoryCategory | undefined {
  return isCanonicalDirectoryCategory(value) ? value : undefined;
}

/** Filters a summary category list down to canonical filter chips. */
export function visibleDirectoryCategories<T extends { id: string }>(
  options: readonly T[] | null | undefined,
): T[] {
  return (options ?? []).filter((option) =>
    isCanonicalDirectoryCategory(option.id),
  );
}

export type DirectorySearchInput = {
  query?: string;
  jurisdiction?: string;
  category?: DirectoryCategory;
  limit: number;
  offset: number;
};

/**
 * Builds the `resourceDirectory.search` input. `category` is present
 * only when it is a canonical key — never label text, never a
 * data-derived composite, never a legacy label.
 */
export function buildDirectorySearchInput(args: {
  query?: string;
  jurisdiction?: string;
  category?: string | null;
  limit: number;
  offset: number;
}): DirectorySearchInput {
  const input: DirectorySearchInput = {
    limit: args.limit,
    offset: args.offset,
  };
  if (args.query) input.query = args.query;
  if (args.jurisdiction) input.jurisdiction = args.jurisdiction;
  const category = canonicalDirectoryCategory(args.category);
  if (category) input.category = category;
  return input;
}

const DEFAULT_HUMAN_ERROR_MESSAGE = "Something went wrong. Please try again.";

function looksLikeSerializedPayload(message: string): boolean {
  if (message.startsWith("[") || message.startsWith("{")) return true;
  try {
    const parsed: unknown = JSON.parse(message);
    if (parsed !== null && typeof parsed === "object") return true;
  } catch {
    // Not JSON — fall through to the validation-marker check.
  }
  // Zod issue dumps embedded in a longer string.
  return (
    /"(code|path|issues)"\s*:/.test(message) &&
    /(too_big|too_small|invalid_string|invalid_type)/.test(message)
  );
}

/**
 * Maps any thrown / tRPC error to text that is safe to show a person.
 * Serialized payloads (Zod issue arrays, JSON objects) and over-long
 * dumps are replaced by the fallback sentence; short plain-language
 * messages ("Resource not found") pass through unchanged.
 */
export function humanErrorMessage(
  error: unknown,
  fallback: string = DEFAULT_HUMAN_ERROR_MESSAGE,
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error !== null &&
            typeof error === "object" &&
            "message" in error &&
            typeof (error as { message: unknown }).message === "string"
          ? (error as { message: string }).message
          : "";
  const message = raw.trim();
  if (!message) return fallback;
  if (looksLikeSerializedPayload(message)) return fallback;
  if (message.length > 300) return fallback;
  return message;
}
