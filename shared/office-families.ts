/**
 * Office family presentation for the anchored government-office
 * population (public.gov_offices.agency_key, retained on catalog
 * entities through luminari_anchor_office_source_rows).
 *
 * Labels and colors are the FAMILY_META values the Civic Map carried
 * for these ten families (F1, 2026-11-10): family hues are distinct
 * from the directory category colors on purpose, so an office family
 * never borrows a category's identity. The map's later unified-catalog
 * rewrite dropped FAMILY_META from civicmap.html; this module is now
 * the single definition, shared by the Find-an-Office server filter
 * validation and the page's family chips so the two can never drift.
 */
export interface OfficeFamilyMeta {
  /** Plain-language family name a person can read. */
  label: string;
  /** Family hue (hex), as rendered on the Civic Map's family legend. */
  color: string;
}

export const OFFICE_FAMILY_META: Record<string, OfficeFamilyMeta> = {
  veterans_affairs: { label: "Veterans Affairs", color: "#6d28d9" },
  ssa: { label: "Social Security", color: "#65a30d" },
  hud: { label: "HUD Field Offices", color: "#92400e" },
  public_housing_authority: {
    label: "Housing Authorities",
    color: "#db2777",
  },
  american_job_center: {
    label: "American Job Centers",
    color: "#1d4ed8",
  },
  apprenticeship: { label: "Apprenticeship Offices", color: "#c026d3" },
  native_american: {
    label: "Native American Services",
    color: "#9a3412",
  },
  // Tribal office of each federally recognized nation, from the BIA Tribal
  // Leaders Directory (migration 20261125120000_tribal_government_offices_v1).
  tribal_government: {
    label: "Tribal Governments",
    color: "#7c2d12",
  },
  hospital: { label: "Hospitals", color: "#047857" },
  health_center: { label: "Health Centers", color: "#0f766e" },
  law_enforcement: { label: "Law Enforcement", color: "#dc2626" },
};

/** The anchored office families, in legend order. */
export const OFFICE_FAMILY_KEYS = Object.keys(OFFICE_FAMILY_META);

export function is_office_family_key(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(OFFICE_FAMILY_META, value)
  );
}

/**
 * Keep only recognized family keys from untrusted input, preserving
 * request order and dropping duplicates. Unknown keys are dropped,
 * never passed through to SQL.
 */
export function sanitize_office_families(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const families: string[] = [];
  for (const value of values) {
    if (is_office_family_key(value) && !seen.has(value)) {
      seen.add(value);
      families.push(value);
    }
  }
  return families;
}
