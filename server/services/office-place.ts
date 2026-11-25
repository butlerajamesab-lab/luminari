import { getPool } from "../db";
import { sanitize_office_families } from "@shared/office-families";
import { CANONICAL_DIRECTORY_CATEGORIES } from "@shared/directory-categories";
import {
  sanitize_contacts,
  unified_corpus_cte_sql,
  type catalog_contact,
} from "./resource-directory-unified";
import {
  assemble_office_results,
  load_reviewed_contacts_for,
  office_family_pick_sql,
  type nearest_row,
  type office_search_result,
} from "./office-nearest";

// ============================================================================
// Find-an-Office place browse: pick a state, optionally a city — no street
// address needed. Reads the same person-facing catalog (unified corpus CTE)
// the directory, the map and the nearest search read.
//
// Two lists come back:
//  - offices: anchored government offices whose catalog location is in the
//    place, placed with the same per-family site match the nearest search
//    uses (office_family_pick_sql), so an office never shows at another
//    office's address.
//  - other_resources: every other catalog record in the place (legal aid,
//    food, safety, disability, tribal programs, state agencies...), plus
//    records that serve the whole state and name no city. Each is labeled
//    "local" or "statewide"; nothing is guessed into a city it does not name.
// Contacts come only from what each record carries (sanitize_contacts).
// ============================================================================

export const PLACE_OFFICES_PER_FAMILY_CAP = 50;
export const PLACE_OFFICES_OVERALL_CAP = 300;
export const PLACE_OTHER_RESOURCES_CAP = 800;
const PLACES_CACHE_MS = 10 * 60 * 1000;

const STATE_CODE = /^[A-Z]{2}$/;

export function normalize_state_code(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return STATE_CODE.test(code) ? code : null;
}

/** City key: trimmed, lower-cased, single-spaced. Display keeps the record's own casing. */
export function normalize_city_key(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (!key || key.length > 80) return null;
  return key;
}

const CITY_KEY_SQL = (expr: string) =>
  `nullif(lower(regexp_replace(btrim(${expr}), '\\s+', ' ', 'g')), '')`;

/** Distinct (entity, state, city) placements from the catalog's own records. */
function placements_cte_sql(): string {
  return `
    placements as (
      select distinct
        c.resource_entity_id,
        coalesce(
          case when upper(btrim(l.state)) ~ '^[A-Z]{2}$' then upper(btrim(l.state)) end,
          c.jurisdiction_code
        ) as state_code,
        ${CITY_KEY_SQL("coalesce(l.city, c.city)")} as city_key,
        btrim(coalesce(l.city, c.city)) as city_label
      from corpus c
      left join public.luminari_resource_locations l
        on l.resource_entity_id = c.resource_entity_id
    )`;
}

export function build_place_states_sql(): string {
  return `
    with ${unified_corpus_cte_sql()},
    ${placements_cte_sql()}
    select state_code, count(distinct resource_entity_id)::int as record_count
    from placements
    where state_code ~ '^[A-Z]{2}$' and state_code <> 'US'
    group by state_code
    order by state_code`;
}

/** $1 state code. */
export function build_place_cities_sql(): string {
  return `
    with ${unified_corpus_cte_sql()},
    ${placements_cte_sql()}
    select city_key,
           mode() within group (order by city_label) as city_label,
           count(distinct resource_entity_id)::int as record_count
    from placements
    where state_code = $1 and city_key is not null
    group by city_key
    order by city_key`;
}

/**
 * Offices in a place. $1 state code, $2 city key (or null for the whole
 * state), $3 families (text[] or null), $4 per-family cap, $5 overall cap.
 */
export function build_office_place_sql(): string {
  return `
    with ${unified_corpus_cte_sql()},
    in_place as (
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
        office.email as office_email
      from corpus c
      join public.luminari_resource_locations l
        on l.resource_entity_id = c.resource_entity_id
      ${office_family_pick_sql()}
      where upper(btrim(l.state)) = $1
        and ($2::text is null or ${CITY_KEY_SQL("l.city")} = $2)
        and ($3::text[] is null or office.agency_key = any($3::text[]))
    ),
    family_ranked as (
      select *,
        row_number() over (partition by family order by resource_name, resource_entity_id) as family_rank,
        count(*) over (partition by family) as family_total
      from in_place
    ),
    -- The overall cap counts only rows the per-family cap kept, so one large
    -- family never pushes a smaller family out of the list.
    ranked as (
      select *,
        row_number() over (order by family, resource_name, resource_entity_id) as overall_rank,
        count(*) over () as kept_total
      from family_ranked
      where family_rank <= $4
    )
    select * from ranked
    where overall_rank <= $5
    order by family, resource_name, resource_entity_id`;
}

/**
 * Every other catalog record in a place. $1 state code, $2 city key (or
 * null), $3 canonical categories, $4 cap. A record placed in the city is
 * "local"; a record in the state that names no city at all is "statewide".
 */
export function build_place_other_resources_sql(): string {
  return `
    with ${unified_corpus_cte_sql()},
    candidates as (
      select
        c.resource_entity_id,
        c.canonical_id,
        c.resource_name,
        coalesce(
          (select k from unnest(array[c.resource_category] || coalesce(c.service_categories, array[]::text[])) k
            where k = any($3::text[]) limit 1),
          'other') as category,
        l.address_line1, l.address_line2,
        btrim(coalesce(l.city, c.city)) as city,
        coalesce(
          case when upper(btrim(l.state)) ~ '^[A-Z]{2}$' then upper(btrim(l.state)) end,
          c.jurisdiction_code) as state_code,
        l.postal_code,
        ${CITY_KEY_SQL("coalesce(l.city, c.city)")} as city_key,
        row_number() over (
          partition by c.resource_entity_id
          order by (${CITY_KEY_SQL("coalesce(l.city, c.city)")} = $2) desc nulls last,
                   (l.city is not null) desc, l.location_id
        ) as placement_rank
      from corpus c
      left join public.luminari_resource_locations l
        on l.resource_entity_id = c.resource_entity_id
      -- Only placements in the requested state compete for the shown location,
      -- so a resource with an Oregon location still shows in Washington.
      where coalesce(
              case when upper(btrim(l.state)) ~ '^[A-Z]{2}$' then upper(btrim(l.state)) end,
              c.jurisdiction_code) = $1
        and not exists (
        select 1 from public.luminari_anchor_office_source_rows a
        where a.resource_entity_id = c.resource_entity_id
      )
    ),
    placed as (
      select *,
        case when city_key is not null and city_key = $2 then 'local'
             when city_key is null then 'statewide'
             when $2::text is null then 'local'
        end as scope
      from candidates
      where placement_rank = 1
    ),
    -- The same name at the same address from two source families shows once.
    shown as (
      select distinct on (lower(btrim(resource_name)), lower(coalesce(btrim(address_line1), '')))
             *
      from placed
      where scope is not null
      order by lower(btrim(resource_name)), lower(coalesce(btrim(address_line1), '')),
               (category <> 'other') desc, resource_entity_id
    )
    select resource_entity_id::text as resource_entity_id, canonical_id, resource_name,
           category, address_line1, address_line2, city, state_code, postal_code, scope
    from shown
    order by (scope = 'local') desc, category, resource_name, resource_entity_id
    limit $4`;
}

export type place_option = { code: string; label: string; record_count: number };

export type place_resource = {
  resource_entity_id: string;
  canonical_id: string | null;
  name: string;
  category: string;
  scope: "local" | "statewide";
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone?: string;
  url?: string;
};

export type place_office = Omit<office_search_result, "distance_mi">;

export type place_browse_outcome = {
  state: string;
  city_key: string | null;
  offices: place_office[];
  offices_capped: boolean;
  families_not_found: string[];
  other_resources: place_resource[];
  other_resources_capped: boolean;
};

let states_cache: { at: number; value: place_option[] } | null = null;
const cities_cache = new Map<string, { at: number; value: place_option[] }>();

export async function list_place_states(): Promise<place_option[]> {
  if (states_cache && Date.now() - states_cache.at < PLACES_CACHE_MS) return states_cache.value;
  const result = await getPool().query(build_place_states_sql(), []);
  const value = result.rows.map(row => ({
    code: String(row.state_code),
    label: String(row.state_code),
    record_count: Number(row.record_count),
  }));
  states_cache = { at: Date.now(), value };
  return value;
}

export async function list_place_cities(state: string): Promise<place_option[]> {
  const cached = cities_cache.get(state);
  if (cached && Date.now() - cached.at < PLACES_CACHE_MS) return cached.value;
  const result = await getPool().query(build_place_cities_sql(), [state]);
  const value = result.rows.map(row => ({
    code: String(row.city_key),
    label: String(row.city_label ?? row.city_key),
    record_count: Number(row.record_count),
  }));
  cities_cache.set(state, { at: Date.now(), value });
  return value;
}

function first_contact(clean: catalog_contact[], types: string[]): string | undefined {
  return clean.find(contact => types.includes(contact.contact_type.toLowerCase()))?.contact_value;
}

export async function browse_place(input: {
  state: string;
  city_key: string | null;
  families?: string[];
}): Promise<place_browse_outcome> {
  const families = sanitize_office_families(input.families ?? []);
  const pool = getPool();
  const [office_result, other_result] = await Promise.all([
    pool.query(build_office_place_sql(), [
      input.state,
      input.city_key,
      families.length > 0 ? families : null,
      PLACE_OFFICES_PER_FAMILY_CAP,
      PLACE_OFFICES_OVERALL_CAP,
    ]),
    families.length > 0
      ? Promise.resolve({ rows: [] as any[] })
      : pool.query(build_place_other_resources_sql(), [
          input.state,
          input.city_key,
          [...CANONICAL_DIRECTORY_CATEGORIES],
          PLACE_OTHER_RESOURCES_CAP,
        ]),
  ]);

  const raw_office_rows = office_result.rows as Array<nearest_row & { family_total: string | number; kept_total: string | number }>;
  const offices_capped = raw_office_rows.some(
    row => Number(row.family_total) > PLACE_OFFICES_PER_FAMILY_CAP || Number(row.kept_total) > PLACE_OFFICES_OVERALL_CAP,
  );
  const office_rows = raw_office_rows.map(row => ({ ...row, distance_mi: 0 }));
  const other_rows = other_result.rows as any[];
  const entity_ids = [
    ...new Set([
      ...office_rows.map(row => String(row.resource_entity_id)),
      ...other_rows.map(row => String(row.resource_entity_id)),
    ]),
  ];
  const reviewed = await load_reviewed_contacts_for(entity_ids);

  const offices: place_office[] = assemble_office_results(office_rows, reviewed).map(
    ({ distance_mi: _distance, ...office }) => office,
  );
  const found = new Set(offices.map(office => office.family));

  const other_resources: place_resource[] = other_rows.map(row => {
    const clean = sanitize_contacts(reviewed.get(String(row.resource_entity_id)) ?? []);
    const resource: place_resource = {
      resource_entity_id: String(row.resource_entity_id),
      canonical_id: row.canonical_id ?? null,
      name: String(row.resource_name),
      category: String(row.category),
      scope: row.scope === "statewide" ? "statewide" : "local",
      address:
        [row.address_line1, row.address_line2]
          .map((part: string | null) => (part ?? "").trim())
          .filter(Boolean)
          .join(", ") || null,
      city: row.city ?? null,
      state: row.state_code ?? null,
      postal_code: row.postal_code ?? null,
    };
    const phone = first_contact(clean, ["phone", "hotline"]);
    if (phone) resource.phone = phone;
    const url = first_contact(clean, ["website", "portal", "filing_portal", "application"]);
    if (url) resource.url = url;
    return resource;
  });

  return {
    state: input.state,
    city_key: input.city_key,
    offices,
    offices_capped,
    families_not_found: families.filter(family => !found.has(family)),
    other_resources,
    other_resources_capped: other_rows.length >= PLACE_OTHER_RESOURCES_CAP,
  };
}
