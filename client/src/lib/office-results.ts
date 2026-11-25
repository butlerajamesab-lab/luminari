import {
  OFFICE_FAMILY_KEYS,
  OFFICE_FAMILY_META,
} from "@shared/office-families";

/**
 * Pure presentation logic for the Find-an-Office page: payload types
 * for POST /api/offices/nearest, distance ordering, family grouping,
 * and the card field rule — a card renders exactly the fields the
 * record carries (phone, hours, website), each absent when the
 * record does not carry it. Kept free of React so the rules are
 * contract-tested directly.
 */

export interface OfficeSearchResult {
  resource_entity_id: string;
  canonical_id: string | null;
  family: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  distance_mi: number;
  phone?: string;
  hours?: string;
  url?: string;
}

/** An office found by place browse: same record, no distance (no address was given). */
export type PlaceOffice = Omit<OfficeSearchResult, "distance_mi">;

export interface MatchedOfficesResponse {
  ok: true;
  status: "matched";
  geocoded_address: string;
  radius_used_mi: number;
  initial_radius_mi: number;
  families_not_found: string[];
  results: OfficeSearchResult[];
  coverage: {
    anchored_office_sites: number;
    verified_physical_sites: number;
    exact_mappable_resources: number;
    total_resources: number;
  };
}

export type NearestOfficesResponse =
  | MatchedOfficesResponse
  | {
      ok: true;
      status: "no_match";
      results: [];
      families_not_found: string[];
    }
  | {
      ok: false;
      status?: "unavailable";
      error: string;
      message?: string;
    };

/** Distance order: nearest first; name breaks ties deterministically. */
export function sort_by_distance(
  results: OfficeSearchResult[],
): OfficeSearchResult[] {
  return [...results].sort(
    (a, b) =>
      a.distance_mi - b.distance_mi ||
      a.name.localeCompare(b.name) ||
      a.resource_entity_id.localeCompare(b.resource_entity_id),
  );
}

export interface OfficeFamilyGroup {
  family: string;
  results: OfficeSearchResult[];
}

/**
 * Group results by family for the unfiltered view: groups follow the
 * family legend order, results inside a group are distance-sorted.
 * Families with no results produce no group.
 */
export function group_office_results(
  results: OfficeSearchResult[],
): OfficeFamilyGroup[] {
  const by_family = new Map<string, OfficeSearchResult[]>();
  for (const result of results) {
    const list = by_family.get(result.family) ?? [];
    list.push(result);
    by_family.set(result.family, list);
  }
  const ordered_keys = [
    ...OFFICE_FAMILY_KEYS.filter((key) => by_family.has(key)),
    ...[...by_family.keys()].filter(
      (key) => !OFFICE_FAMILY_KEYS.includes(key),
    ),
  ];
  return ordered_keys.map((family) => ({
    family,
    results: sort_by_distance(by_family.get(family) ?? []),
  }));
}

export type OfficeCardField =
  | { kind: "phone"; label: "Phone"; value: string }
  | { kind: "hours"; label: "Hours"; value: string }
  | { kind: "url"; label: "Website"; value: string };

/**
 * The fields a card renders for one result, in card order. A field
 * appears only when the record carries a non-blank value — a VA
 * facility card without a phone renders no phone row at all, rather
 * than a placeholder.
 */
export function office_card_fields(
  result: PlaceOffice | OfficeSearchResult,
): OfficeCardField[] {
  const fields: OfficeCardField[] = [];
  if (result.phone && result.phone.trim()) {
    fields.push({ kind: "phone", label: "Phone", value: result.phone });
  }
  if (result.hours && result.hours.trim()) {
    fields.push({ kind: "hours", label: "Hours", value: result.hours });
  }
  if (result.url && result.url.trim()) {
    fields.push({ kind: "url", label: "Website", value: result.url });
  }
  return fields;
}

/** "1.0 mile" / "12.3 miles" — distance as a person reads it. */
export function format_distance(distance_mi: number): string {
  const rounded = Math.round(distance_mi * 10) / 10;
  return `${rounded.toFixed(1)} ${rounded === 1 ? "mile" : "miles"}`;
}

export interface OfficeRadiusNoteInput {
  /** True when the person picked specific office families. */
  filtered: boolean;
  radius_used_mi: number;
  initial_radius_mi: number;
  families_not_found: string[];
  results: OfficeSearchResult[];
}

/**
 * The sentence explaining why the search radius widened beyond the
 * initial radius, or null when it did not widen.
 *
 * Precision matters here: a filtered search widens until EVERY
 * requested family has an office in reach, so some requested offices
 * may already sit inside the initial radius while others forced the
 * expansion. The note names the families that were not in reach at
 * the initial radius (with their nearest distance when found farther
 * out) and never claims the initial radius was empty when results
 * exist inside it. The unfiltered wording — no offices at all within
 * the initial radius — is used only when that is genuinely what
 * happened, and the filtered all-missing case says so in its own
 * words ("None of the kinds of offices you picked…").
 */
export function office_radius_note(
  input: OfficeRadiusNoteInput,
): string | null {
  const {
    filtered,
    radius_used_mi,
    initial_radius_mi,
    families_not_found,
    results,
  } = input;
  if (radius_used_mi <= initial_radius_mi) return null;
  if (!filtered) {
    return `No offices were within ${initial_radius_mi} miles, so the search widened to ${radius_used_mi} miles.`;
  }

  const label = (family: string): string =>
    OFFICE_FAMILY_META[family]?.label ?? family;

  // Nearest distance per family actually found.
  const nearest_by_family = new Map<string, number>();
  for (const result of results) {
    const current = nearest_by_family.get(result.family);
    if (current === undefined || result.distance_mi < current) {
      nearest_by_family.set(result.family, result.distance_mi);
    }
  }
  const any_within_initial = [...nearest_by_family.values()].some(
    (distance) => distance <= initial_radius_mi,
  );
  if (!any_within_initial) {
    return `None of the kinds of offices you picked were within ${initial_radius_mi} miles, so the search widened to ${radius_used_mi} miles.`;
  }

  // Partial coverage: name what forced the widening — families found
  // only beyond the initial radius, and families not found at all.
  const late: string[] = [];
  for (const [family, nearest] of nearest_by_family) {
    if (nearest > initial_radius_mi) {
      late.push(
        `the nearest ${label(family)} site is ${format_distance(nearest)} away`,
      );
    }
  }
  for (const family of families_not_found) {
    late.push(
      `${label(family)} was not found within ${radius_used_mi} miles`,
    );
  }
  if (late.length === 0) {
    return `Not all the kinds of offices you picked were within ${initial_radius_mi} miles, so the search widened to ${radius_used_mi} miles.`;
  }
  return `Not all the kinds of offices you picked were within ${initial_radius_mi} miles — ${late.join("; ")} — so the search widened to ${radius_used_mi} miles.`;
}

/** Website values render as links; bare domains get an https href. */
export function website_href(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export interface OfficeSearchPresentation {
  /**
   * True when the SEARCH (not the current chip state) was filtered
   * to specific families. Grouping and the radius note follow this.
   */
  filtered: boolean;
  /** Why the radius widened, per office_radius_note; null if it didn't. */
  radius_note: string | null;
  /**
   * True when the live chip selection no longer matches the
   * families the displayed search was submitted with — the page
   * flags the results as belonging to the earlier selection.
   */
  selection_changed: boolean;
}

/**
 * How a completed search is presented. EVERYTHING here is driven
 * by the snapshot stored with the response — the families the
 * search was SUBMITTED with — never by the live chip state.
 *
 * The chips stay editable after (and during) a search, so live
 * state can diverge from the search on screen: deselecting the
 * last chip after a filtered search must not flip the stored
 * response into the unfiltered presentation (whose radius note
 * can claim no offices were within the initial radius while a
 * result inside it is displayed), and a response that arrives
 * after a mid-flight chip change is still the answer to the
 * selection it was submitted with. A selection change leaves the
 * displayed results untouched under their own snapshot — the page
 * says the selection changed and a new search will update them.
 */
export function office_search_presentation(input: {
  response: MatchedOfficesResponse;
  submitted_families: string[];
  live_families: string[];
}): OfficeSearchPresentation {
  const { response, submitted_families, live_families } = input;
  const filtered = submitted_families.length > 0;
  const submitted = new Set(submitted_families);
  const live = new Set(live_families);
  const selection_changed =
    submitted.size !== live.size ||
    [...submitted].some((family) => !live.has(family));
  return {
    filtered,
    radius_note: office_radius_note({
      filtered,
      radius_used_mi: response.radius_used_mi,
      initial_radius_mi: response.initial_radius_mi,
      families_not_found: response.families_not_found,
      results: response.results,
    }),
    selection_changed,
  };
}
