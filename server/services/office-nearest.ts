import { getPool } from "../db";
import { sanitize_office_families } from "@shared/office-families";
import {
  sanitize_contacts,
  unified_corpus_cte_sql,
  type catalog_contact,
} from "./resource-directory-unified";

// ============================================================================
// Find-an-Office nearest search (F3, 2026-11-20).
//
// Alexander's unification ruling binds this surface too: the locator
// reads the ONE catalog — public.luminari_resource_entities through
// the same person-facing corpus CTE the directory and the map read —
// never public.gov_offices as a search lane. The anchored-office
// population is the set of catalog entities linked to a live
// government-office row through luminari_anchor_office_source_rows;
// the office family (gov_offices.agency_key) and the office's hours
// are retained provenance on that link, read here the same way the
// unified service reads office contact details through it. Distances
// are computed from the catalog's own exact locations
// (luminari_resource_locations), so a place the directory cannot pin
// cannot appear here either.
//
// Cards carry only what the record carries: phone and website follow
// the unified service's contact precedence (reviewed contact points
// first, the linked office row only when the entity has none), shaped
// by the same sanitize_contacts guard; hours come from the office row
// (the only place hours live). A field the record does not carry is
// absent from the result — never null-filled, never faked.
// ============================================================================

/** Radius ladder, in miles: expand until the request is satisfied. */
export const OFFICE_SEARCH_RADII_MI = [10, 25, 50] as const;

/**
 * Result caps: the nearest 25 overall when no family filter is
 * requested (the spec's top-25 rule), or the nearest 25 per requested
 * family when filtered — beyond the nearest 25 of one family, a
 * person in crisis is better served by the directory's full search.
 */
export const OFFICE_RESULTS_OVERALL_CAP = 25;
export const OFFICE_RESULTS_PER_FAMILY_CAP = 25;

const EARTH_RADIUS_MI = 3959;

/**
 * How close an office's own coordinates must sit to a catalog
 * location's coordinates for the office to count as being AT that
 * site, when the office has no minted site key for the location
 * (the tier-A merge shape — see office_site_match_sql). Half a mile
 * is deliberately tight: geocodes of the SAME street address from
 * different sources (rooftop vs. street interpolation) agree well
 * within it, while distinct sites — let alone distinct cities,
 * which are tens of miles apart — never fall inside it. An office
 * whose coordinates sit farther than this from a location does not
 * attach to that location, ever.
 */
export const OFFICE_SITE_MATCH_TOLERANCE_MI = 0.5;

/**
 * Haversine distance in miles between two coordinate pairs
 * (decimal degrees). The acos argument is clamped to [-1, 1]: for
 * coincident points, floating-point error can push the expression
 * a hair past 1 and acos would return NaN instead of 0.
 */
function haversine_between_sql(
  lat_a: string,
  lng_a: string,
  lat_b: string,
  lng_b: string,
) {
  return `(${EARTH_RADIUS_MI} * acos(least(1, greatest(-1,
    cos(radians(${lat_a})) * cos(radians(${lat_b})) *
      cos(radians(${lng_b}) - radians(${lng_a}))
    + sin(radians(${lat_a})) * sin(radians(${lat_b}))))))`;
}

/**
 * Haversine distance in miles between the search point ($1 latitude,
 * $2 longitude, decimal degrees) and a row's coordinates.
 */
function haversine_mi_sql(latitude_expr: string, longitude_expr: string) {
  return haversine_between_sql("$1", "$2", latitude_expr, longitude_expr);
}

/**
 * Does linked office `g` (anchor row `a`) belong at catalog site
 * `l`? Candidates are per (location, family), and an office is a
 * candidate ONLY at its own site — an entity with offices at
 * several sites must never surface one site's office at another
 * site's address with the first office's hours and phone.
 *
 * Site association, strongest evidence first:
 *
 * 1. Minted site key (exact). The gov-office projection mints one
 *    base location per office and stamps it with
 *    source_table = 'gov_office_projection_v1' and
 *    source_pk = the office_id (scripts/project-gov-offices.mjs,
 *    buildLocationInsert). That pair is the office's true site
 *    key. It survives dedupe: the merge applier moves locations
 *    and anchor rows onto the surviving entity together, and the
 *    location keeps its source_pk.
 * 2. Coordinate agreement (tier-A merges mint no location: the
 *    office attached to a pre-existing entity by street + ZIP5 +
 *    state). The office's own coordinates must sit within
 *    OFFICE_SITE_MATCH_TOLERANCE_MI of the location's coordinates.
 * 3. Sole-site fallback. An office carrying NO coordinates and no
 *    minted location among the entity's locations belongs to the
 *    entity's only geocoded location when there is exactly one —
 *    the association is unambiguous. With several geocoded
 *    locations and neither a key nor coordinates, the office
 *    cannot be placed honestly and is a candidate nowhere: better
 *    to miss an office than to direct someone to the wrong city
 *    with another office's hours and phone.
 *
 * Aliases are the callers': `a` anchor row, `g` gov_offices row,
 * `l` catalog location.
 */
export function office_site_match_sql(): string {
  const office_distance = haversine_between_sql(
    "g.lat::float8",
    "g.lng::float8",
    "l.latitude::float8",
    "l.longitude::float8",
  );
  return `(
    (l.source_table = 'gov_office_projection_v1' and l.source_pk = a.office_id)
    or (g.lat is not null and g.lng is not null
        and (${office_distance}) <= ${OFFICE_SITE_MATCH_TOLERANCE_MI})
    or (g.lat is null
        and not exists (
          select 1
          from public.luminari_resource_locations site_key_loc
          where site_key_loc.resource_entity_id = l.resource_entity_id
            and site_key_loc.source_table = 'gov_office_projection_v1'
            and site_key_loc.source_pk = a.office_id
        )
        and not exists (
          select 1
          from public.luminari_resource_locations other_loc
          where other_loc.resource_entity_id = l.resource_entity_id
            and other_loc.location_id <> l.location_id
            and other_loc.latitude is not null
            and other_loc.longitude is not null
        ))
  )`;
}

/**
 * The nearest-office query. One candidate row per (catalog location,
 * office family): the location supplies the exact site and its
 * coordinates; a lateral pick chooses, PER FAMILY, the entity's
 * linked office row of that family that belongs to that site (see
 * office_site_match_sql for how an office is associated with a
 * site) and supplies that family's hours + fallback contact fields
 * from it.
 *
 * The pick must be per family, not one office per location: a site
 * can link offices of several families (the projection links offices
 * to entities by address regardless of family, and dedupe moves
 * office links onto surviving entities). Picking a single office
 * first and filtering by family afterwards would silently drop the
 * site's other families — the requested family would be reported
 * missing at every radius even though its office sits at that site.
 *
 * And the pick must be restricted to the office's own site first:
 * a multi-location entity (Seattle SSA, Tacoma VA after a dedupe
 * merge) would otherwise return every family at EVERY location —
 * the Tacoma office rendered at the Seattle address, distance 0,
 * carrying Tacoma hours and phone, falsely satisfying the family
 * filter at the smallest radius.
 *
 * Parameters: $1 latitude, $2 longitude, $3 radius miles,
 * $4 requested families (text[] or null), $5 per-family rank cap,
 * $6 overall rank cap (int or null).
 */
export function build_office_nearest_sql(): string {
  const distance = haversine_mi_sql("l.latitude::float8", "l.longitude::float8");
  return `
    with ${unified_corpus_cte_sql()},
    nearest as (
      select
        c.resource_entity_id::text as resource_entity_id,
        c.canonical_id as canonical_id,
        c.resource_name as resource_name,
        office.agency_key as family,
        l.address_line1 as address_line1,
        l.address_line2 as address_line2,
        l.city as city,
        l.state as state,
        l.postal_code as postal_code,
        office.hours as office_hours,
        office.phone_raw as office_phone,
        office.url as office_url,
        office.email as office_email,
        round((${distance})::numeric, 1)::float8 as distance_mi
      from corpus c
      join public.luminari_resource_locations l
        on l.resource_entity_id = c.resource_entity_id
        and l.latitude is not null
        and l.longitude is not null
      join lateral (
        select distinct on (g.agency_key)
          g.agency_key, g.hours, g.phone_raw, g.url, g.email
        from public.luminari_anchor_office_source_rows a
        join public.gov_offices g on g.office_id = a.office_id
        where a.resource_entity_id = c.resource_entity_id
          and g.superseded_by is null
          and ${office_site_match_sql()}
        order by
          g.agency_key,
          (case when l.source_table = 'gov_office_projection_v1'
                  and l.source_pk = a.office_id
                then 0 else 1 end),
          (case when g.lat is not null and g.lng is not null
                 and g.lat = l.latitude and g.lng = l.longitude
                then 0 else 1 end),
          (case when g.lat is not null and g.lng is not null
                then abs(g.lat::float8 - l.latitude::float8)
                   + abs(g.lng::float8 - l.longitude::float8)
                end) nulls last,
          g.office_id
      ) office on true
      where (${distance}) <= $3
        and ($4::text[] is null or office.agency_key = any($4::text[]))
    ),
    ranked as (
      select *,
        row_number() over (
          partition by family
          order by distance_mi asc, resource_name asc, resource_entity_id asc
        ) as family_rank,
        row_number() over (
          order by distance_mi asc, resource_name asc, resource_entity_id asc
        ) as overall_rank
      from nearest
    )
    select * from ranked
    where family_rank <= $5
      and ($6::int is null or overall_rank <= $6)
    order by distance_mi asc, resource_name asc, resource_entity_id asc
  `;
}

/**
 * Count of anchored-office catalog sites with exact coordinates —
 * the population this locator can return: a location counts only
 * when at least one linked office actually belongs at that site
 * (the same office_site_match_sql association the nearest query
 * applies), so the page's coverage note and its results always
 * describe the same set.
 */
export function build_office_coverage_sql(): string {
  return `
    with ${unified_corpus_cte_sql()}
    select count(distinct l.location_id)::int as anchored_office_sites
    from corpus c
    join public.luminari_resource_locations l
      on l.resource_entity_id = c.resource_entity_id
      and l.latitude is not null
      and l.longitude is not null
    join public.luminari_anchor_office_source_rows a
      on a.resource_entity_id = c.resource_entity_id
    join public.gov_offices g on g.office_id = a.office_id
      and g.superseded_by is null
    where ${office_site_match_sql()}
  `;
}

export type office_search_result = {
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
};

export type office_search_outcome = {
  results: office_search_result[];
  /** The radius that satisfied the request (the last tried, if none did). */
  radius_used_mi: number;
  /** The first radius tried; expansion is measured against it. */
  initial_radius_mi: number;
  /** Requested families with no office inside the widest radius. */
  families_not_found: string[];
};

type nearest_row = {
  resource_entity_id: string;
  canonical_id: string | null;
  resource_name: string;
  family: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  office_hours: string | null;
  office_phone: string | null;
  office_url: string | null;
  office_email: string | null;
  distance_mi: number | string;
};

function first_contact_value(
  contacts: catalog_contact[],
  types: string[],
): string | undefined {
  const hit = contacts.find((contact) =>
    types.includes(contact.contact_type.toLowerCase()),
  );
  return hit ? hit.contact_value : undefined;
}

/**
 * Shape nearest-query rows into person-facing results. Pure: the
 * caller supplies the rows (already distance-ordered by SQL) and the
 * reviewed contact points per entity. Contact precedence mirrors the
 * unified catalog's own: an entity with reviewed contact points
 * presents those; only an entity with none falls back to the linked
 * office row's phone/email/url. Either way the values pass through
 * sanitize_contacts, so a value renders only as the kind of contact
 * it actually is.
 */
export function assemble_office_results(
  rows: nearest_row[],
  reviewed_contacts_by_entity: Map<string, catalog_contact[]>,
): office_search_result[] {
  return rows.map((row) => {
    const reviewed = reviewed_contacts_by_entity.get(row.resource_entity_id);
    let contacts: catalog_contact[];
    if (reviewed && reviewed.length > 0) {
      contacts = reviewed;
    } else {
      const synthesized: catalog_contact[] = [];
      const push = (
        type: string,
        value: unknown,
        label: string,
        primary: boolean,
      ) => {
        if (value == null || String(value).trim() === "") return;
        synthesized.push({
          contact_point_id: `${row.resource_entity_id}:${type}`,
          contact_type: type,
          contact_value: String(value),
          label,
          is_primary: primary,
          contact_quality: "official_source_feed",
          manually_reviewed: false,
          manual_source_reference: null,
        });
      };
      push("phone", row.office_phone, "Phone", true);
      push("email", row.office_email, "Email", !row.office_phone);
      push(
        "website",
        row.office_url,
        "Website",
        !row.office_phone && !row.office_email,
      );
      contacts = synthesized;
    }
    const clean = sanitize_contacts(contacts);

    const result: office_search_result = {
      resource_entity_id: String(row.resource_entity_id),
      canonical_id: row.canonical_id ?? null,
      family: String(row.family),
      name: String(row.resource_name),
      address:
        [row.address_line1, row.address_line2]
          .map((part) => (part ?? "").trim())
          .filter(Boolean)
          .join(", ") || null,
      city: row.city ?? null,
      state: row.state ?? null,
      postal_code: row.postal_code ?? null,
      distance_mi: Number(row.distance_mi),
    };
    const phone = first_contact_value(clean, ["phone", "hotline"]);
    if (phone) result.phone = phone;
    const url = first_contact_value(clean, [
      "website",
      "portal",
      "filing_portal",
      "application",
    ]);
    if (url) result.url = url;
    const hours = (row.office_hours ?? "").trim();
    if (hours) result.hours = hours;
    return result;
  });
}

async function load_reviewed_contacts_for(
  entity_ids: string[],
): Promise<Map<string, catalog_contact[]>> {
  const by_entity = new Map<string, catalog_contact[]>();
  if (entity_ids.length === 0) return by_entity;
  const pool = getPool();
  const reviewed = await pool.query(
    `select resource_entity_id::text as resource_entity_id, contact_point_id::text as contact_point_id,
            contact_type, contact_value, label, is_primary, contact_quality, manually_reviewed,
            manual_source_reference
       from public.v_luminari_resource_contact_points_current_v3_13
      where resource_entity_id = any($1::uuid[])
      order by is_primary desc, contact_type, contact_value`,
    [entity_ids],
  );
  for (const row of reviewed.rows) {
    const list = by_entity.get(row.resource_entity_id) ?? [];
    list.push({
      contact_point_id: String(row.contact_point_id),
      contact_type: String(row.contact_type),
      contact_value: String(row.contact_value),
      label: row.label ?? null,
      is_primary: Boolean(row.is_primary),
      contact_quality: String(row.contact_quality ?? "reviewed"),
      manually_reviewed: Boolean(row.manually_reviewed),
      manual_source_reference: row.manual_source_reference ?? null,
    });
    by_entity.set(row.resource_entity_id, list);
  }
  return by_entity;
}

/**
 * Find the nearest anchored offices to a geocoded point. The radius
 * expands 10 → 25 → 50 miles: unfiltered, until at least one office
 * is in reach; filtered, until every requested family has at least
 * one office in reach. When the widest radius still cannot satisfy
 * the request, the widest results are returned with the missing
 * families named — never silently substituted with another family.
 */
export async function find_nearest_offices(input: {
  latitude: number;
  longitude: number;
  families?: string[];
}): Promise<office_search_outcome> {
  const families = sanitize_office_families(input.families ?? []);
  const filtered = families.length > 0;
  const pool = getPool();
  const sql = build_office_nearest_sql();

  let rows: nearest_row[] = [];
  let radius_used_mi: number = OFFICE_SEARCH_RADII_MI[OFFICE_SEARCH_RADII_MI.length - 1];
  for (const radius of OFFICE_SEARCH_RADII_MI) {
    const result = await pool.query(sql, [
      input.latitude,
      input.longitude,
      radius,
      filtered ? families : null,
      OFFICE_RESULTS_PER_FAMILY_CAP,
      filtered ? null : OFFICE_RESULTS_OVERALL_CAP,
    ]);
    rows = result.rows as nearest_row[];
    radius_used_mi = radius;
    if (!filtered) {
      if (rows.length > 0) break;
    } else {
      const found = new Set(rows.map((row) => String(row.family)));
      if (families.every((family) => found.has(family))) break;
    }
  }

  const found_families = new Set(rows.map((row) => String(row.family)));
  const families_not_found = filtered
    ? families.filter((family) => !found_families.has(family))
    : [];

  const entity_ids = [...new Set(rows.map((row) => String(row.resource_entity_id)))];
  const reviewed = await load_reviewed_contacts_for(entity_ids);
  return {
    results: assemble_office_results(rows, reviewed),
    radius_used_mi,
    initial_radius_mi: OFFICE_SEARCH_RADII_MI[0],
    families_not_found,
  };
}

/** Live count of the anchored-office sites this locator can return. */
export async function count_anchored_office_sites(): Promise<number> {
  const pool = getPool();
  const result = await pool.query(build_office_coverage_sql(), []);
  const value = Number(result.rows[0]?.anchored_office_sites ?? 0);
  return Number.isFinite(value) ? value : 0;
}
