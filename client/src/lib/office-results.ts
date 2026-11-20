import { OFFICE_FAMILY_KEYS } from "@shared/office-families";

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

export type NearestOfficesResponse =
  | {
      ok: true;
      status: "matched";
      geocoded_address: string;
      radius_used_mi: number;
      families_not_found: string[];
      results: OfficeSearchResult[];
      coverage: {
        anchored_office_sites: number;
        verified_physical_sites: number;
        exact_mappable_resources: number;
        total_resources: number;
      };
    }
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
  result: OfficeSearchResult,
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

/** Website values render as links; bare domains get an https href. */
export function website_href(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
