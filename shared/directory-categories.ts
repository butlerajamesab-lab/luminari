/**
 * The nine reviewed Resource Directory categories. The single list shared by
 * the directory search (client/src/lib/directory-search.ts) and the
 * Find-an-Office place browse (server/services/office-place.ts).
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
