import { getPool } from "../db";

// ============================================================================
// Unified Resource Directory catalog (U3 cutover, 2026-11-10).
//
// Alexander's unification ruling (2026-11-10): every resource lives in the
// Resource Directory catalog, and the directory + Civic Map read ONE system.
// This service is that single read path. Directory summary, directory
// search, directory detail, Civic Map coverage, and Civic Map points all
// derive from the same person-facing corpus defined below — the entity
// catalog (public.luminari_resource_entities + public.luminari_resource_
// locations) across every source family: document-projected rows, step-1
// catalog sites, and the U2 government-office projections. Because every
// number on the map panel and every directory count comes from this one
// corpus CTE, the numbers on a screen reconcile by construction: an
// unfiltered directory search total equals the summary total, category
// counts are membership counts over the same corpus, and map pins are the
// corpus entities that carry genuine stored coordinates.
//
// This replaces the two-lane era in which directory search read the
// classified document view (v_lighthouse_resource_program_classified_v1)
// while map pins came from a reviewed-locations lane UNIONed with the
// gov_offices locator table. gov_offices is now a loading dock only: its
// offices reach people exclusively as catalog entities (U2 projection),
// and this service reads gov_offices solely to fetch contact details for
// those entities through the anchor link table — never as a map lane.
//
// Human-surface rules (Alexander, 2026-11-10): a person-facing record must
// carry a real place name. A UUID, a bare hash, or a pipeline artifact
// label is never a title — records whose only "name" is one of those are
// held out of person-facing results entirely (held for naming; counted in
// the summary as held_for_naming_count). Contact values render only when
// they are actually that kind of contact: an email must be email-shaped,
// a website must be URL-shaped (the legacy corpus carries values like
// "25170" in email fields; 15 of 160 email contact points and 47
// gov-office emails fail the shape check in the live data). Provenance
// machinery (document hashes, source rows, stored-category jargon) is not
// part of this payload; it remains in the governed tables for inspector
// surfaces.
// ============================================================================

export const UNIFIED_CATALOG_CONTRACT = "luminari_unified_catalog_v1";

/**
 * 'workbook_record' is a storage class in the legacy corpus, not a need a
 * person has — Alexander's words: "people don't know what the workbook
 * is." It is therefore never displayed as a category and never appears in
 * the category counts or filter. The stored value is untouched in the
 * catalog; records carrying only this label present as uncategorized
 * (their service memberships, if any, still count and filter normally).
 */
export const NON_DISPLAY_CATEGORY = "workbook_record";

export function display_primary_category(value: unknown): string | null {
  if (value == null) return null;
  const category = String(value).trim();
  if (!category || category === NON_DISPLAY_CATEGORY) return null;
  return category;
}

export function display_memberships(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value).trim())
    .filter((value) => value !== "" && value !== NON_DISPLAY_CATEGORY);
}

const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

const UUID_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARE_HEX_NAME_PATTERN = /^[0-9a-f]{24,}$/i;
const ARTIFACT_PREFIX_PATTERN = /^luminari[-_]/i;
// The artifact shape is 'enriched' as a hyphen/underscore-delimited
// token in a pipeline pass label (luminari-oregon-ENRICHED-PASS3-2026,
// something_ENRICHED_v2) — not the bare word. The original blanket
// clause rejected ANY name containing "enriched", including the
// genuine Westchester Enriched Sciences Magnets (a real LAUSD school
// in the gov-office projection, held out of the catalog by its own
// real name). Narrowed 2026-11-10 to the delimited-token shape; the
// census verified exactly one catalog entity changes state under the
// narrowed rule (Westchester itself).
const ARTIFACT_ENRICHED_PATTERN = /(^|[-_])enriched([-_]|$)/i;

// Title-hygiene clauses (content census 2026-11-11, repair wave C1
// 2026-11-12): the census measured person-facing titles that are not
// names at all — ZIP-prefixed agency names, serialized-object blobs,
// workbook bracket codes ([ACLU-GU], [D.NH]), editorial process text
// (PARTIAL — verify…, CRITICAL:…, WARNING:…), street addresses, and
// phone-leading contact lines. The deterministic repair wave renames
// every title a mechanical rule can restore; these clauses hold the
// unrepaired residue (and any future recurrence) out of person-facing
// results. The street-word list uses letter-boundary guards so real
// names containing the substring survive ("Statewide Centralized
// Intake Gateway", "800 West Broadway"); the phone clause is
// LEADING-only because a number can legitimately sit inside a name
// ("National Network of Tobacco Cessation Quitlines (1-800-QUIT-NOW)").
const ZIP_PREFIX_NAME_PATTERN = /^\s*\d{5}(-\d{4})?\s*(—|–|\||-|[A-Z])/;
const SERIALIZED_NAME_PATTERN = /^\s*\{|'[a-z_]+':\s*'/;
const BRACKET_CODE_NAME_PATTERN = /\[[A-Za-z0-9][A-Za-z0-9.-]*\]/;
const PROCESS_TEXT_NAME_PATTERN =
  /(verify remaining fields|—\s*verify|\(verify\)|not confirmed from|not published for|no dedicated hotline|shortest in|critical:|warning:)/i;
const ADDRESS_LEADING_PATTERN = /^[0-9]{1,6}\s/;
const STREET_WORD_PATTERN =
  /(^|[^a-z])(street|avenue|road|boulevard|drive|lane|court|plaza|highway|parkway|circle|terrace|place|trail|square|way)([^a-z]|$)/i;
const CITY_STATE_ZIP_PATTERN = /,\s*[A-Za-z][A-Za-z ]+\s+[A-Z]{2}\s+\d{5}/;
const PHONE_LEADING_NAME_PATTERN =
  /^\s*(1-\d{3}-[A-Z0-9-]+|\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4})/;

/**
 * The person-facing name test, mirrored in SQL by person_facing_name_sql.
 * A name a person could read as the name of a place or organization.
 */
export function is_human_display_name(value: unknown): boolean {
  if (value == null) return false;
  const name = String(value).trim();
  if (!name) return false;
  if (UUID_NAME_PATTERN.test(name)) return false;
  if (BARE_HEX_NAME_PATTERN.test(name)) return false;
  if (ARTIFACT_PREFIX_PATTERN.test(name)) return false;
  if (ARTIFACT_ENRICHED_PATTERN.test(name)) return false;
  if (ZIP_PREFIX_NAME_PATTERN.test(name)) return false;
  if (SERIALIZED_NAME_PATTERN.test(name)) return false;
  if (BRACKET_CODE_NAME_PATTERN.test(name)) return false;
  if (PROCESS_TEXT_NAME_PATTERN.test(name)) return false;
  if (
    (ADDRESS_LEADING_PATTERN.test(name) && STREET_WORD_PATTERN.test(name)) ||
    CITY_STATE_ZIP_PATTERN.test(name)
  )
    return false;
  if (PHONE_LEADING_NAME_PATTERN.test(name)) return false;
  return true;
}

/** SQL twin of is_human_display_name for a text column/expression. */
export function person_facing_name_sql(expression: string): string {
  return `(
    ${expression} is not null
    and btrim(${expression}) <> ''
    and ${expression} !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and ${expression} !~* '^[0-9a-f]{24,}$'
    and ${expression} !~* '^luminari[-_]'
    and ${expression} !~* '(^|[-_])enriched([-_]|$)'
    and ${expression} !~ '^[[:space:]]*[0-9]{5}(-[0-9]{4})?[[:space:]]*(—|–|\\||-|[A-Z])'
    and ${expression} !~ '^[[:space:]]*\\{'
    and ${expression} !~ '\\[[A-Za-z0-9][A-Za-z0-9.-]*\\]'
    and ${expression} !~* '(verify remaining fields|—[[:space:]]*verify|\\(verify\\)|not confirmed from|not published for|no dedicated hotline|shortest in|critical:|warning:)'
    and not ( (${expression} ~ '^[0-9]{1,6}[[:space:]]' and ${expression} ~* '(^|[^a-z])(street|avenue|road|boulevard|drive|lane|court|plaza|highway|parkway|circle|terrace|place|trail|square|way)([^a-z]|$)')
              or ${expression} ~ ',[[:space:]][A-Za-z][A-Za-z ]+[[:space:]][A-Z]{2}[[:space:]][0-9]{5}' )
    and ${expression} !~ '^[[:space:]]*(1-[0-9]{3}-[A-Z0-9-]+|\\(?[0-9]{3}\\)?[-. ][0-9]{3}[-. ][0-9]{4})'
  )`;
}

export function is_email_shaped(value: unknown): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value ?? "").trim());
}

export function is_url_shaped(value: unknown): boolean {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || /\s/.test(cleaned)) return false;
  return /^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i.test(
    cleaned,
  );
}

export function is_phone_shaped(value: unknown): boolean {
  return String(value ?? "").replace(/\D/g, "").length >= 3;
}

export type catalog_contact = {
  contact_point_id: string;
  contact_type: string;
  contact_value: string;
  label: string | null;
  is_primary: boolean;
  contact_quality: string;
  manually_reviewed: boolean;
  manual_source_reference: string | null;
};

/**
 * Type-fidelity guard for person-facing contacts: a value is shown as an
 * email only if it is email-shaped, as a website only if URL-shaped, as a
 * phone only if it carries dialable digits. Unguarded legacy values are
 * dropped here rather than mislabeled in front of a person.
 */
export function sanitize_contacts(
  contacts: catalog_contact[],
): catalog_contact[] {
  return contacts.filter((contact) => {
    const type = contact.contact_type.toLowerCase();
    if (type === "email") return is_email_shaped(contact.contact_value);
    if (
      type === "website" ||
      type === "portal" ||
      type === "filing_portal" ||
      type === "application"
    ) {
      return is_url_shaped(contact.contact_value);
    }
    if (type === "phone" || type === "hotline") {
      return is_phone_shaped(contact.contact_value);
    }
    return true;
  });
}

function unique_strings(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function finite_number(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * THE person-facing corpus. Every read in this module starts from this
 * CTE: catalog entities that are not publication-retired and whose name a
 * person can read. Summary counts, search results, detail, coverage, and
 * map pins are all projections of this one set — that is the invariant
 * that makes the on-screen numbers reconcile.
 */
export function unified_corpus_cte_sql(): string {
  return `
    corpus as (
      select e.*,
             case
               when upper(btrim(e.state)) = 'USVI' then 'VI'
               -- 'XX' is a source placeholder for an unrecorded state
               -- (388 HRSA rows); those records are nationwide-scope
               -- until step-2 review assigns them a real jurisdiction.
               when upper(btrim(e.state)) = 'XX' then 'US'
               when e.state ~ '^[A-Za-z]{2}$' then upper(e.state)
               else 'US'
             end as jurisdiction_code
      from public.luminari_resource_entities e
      left join public.luminari_resource_publication_resolutions p
        on p.resource_entity_id = e.resource_entity_id
      where coalesce(p.publication_status, 'active') <> 'inactive'
        and ${person_facing_name_sql("e.resource_name")}
    )`;
}

export function build_unified_summary_sql(): string {
  return `
    with ${unified_corpus_cte_sql()},
    corpus_categories as (
      select distinct c.resource_entity_id, m.category_key
      from corpus c
      cross join lateral unnest(
        array[c.resource_category] || coalesce(c.service_categories, array[]::text[])
      ) m(category_key)
      where m.category_key is not null and m.category_key <> ''
        and m.category_key <> '${NON_DISPLAY_CATEGORY}'
    ),
    category_rows as (
      select category_key as id, count(*)::int as item_count
      from corpus_categories group by category_key
    ),
    jurisdiction_category_rows as (
      select c.jurisdiction_code as code, cc.category_key,
             count(distinct cc.resource_entity_id)::int as category_count
      from corpus_categories cc
      join corpus c on c.resource_entity_id = cc.resource_entity_id
      group by c.jurisdiction_code, cc.category_key
    ),
    jurisdiction_category_json as (
      select code,
             jsonb_object_agg(category_key, category_count order by category_key) as categories
      from jurisdiction_category_rows group by code
    ),
    jurisdiction_rows as (
      select g.code, g.item_count, g.program_count,
             coalesce(jc.categories, '{}'::jsonb) as categories
      from (
        select c.jurisdiction_code as code,
               count(*)::int as item_count,
               count(*) filter (where c.resource_type = 'program')::int as program_count
        from corpus c group by c.jurisdiction_code
      ) g
      left join jurisdiction_category_json jc on jc.code = g.code
    ),
    contact_stats as (
      select count(*)::int as contact_count,
             count(distinct resource_entity_id)::int as resources_with_contacts
      from (
        select cp.resource_entity_id
        from public.v_luminari_resource_contact_points_current_v3_13 cp
        join corpus x on x.resource_entity_id = cp.resource_entity_id
        union all
        select l.resource_entity_id
        from public.luminari_anchor_office_source_rows l
        join public.gov_offices g on g.office_id = l.office_id
        join corpus x on x.resource_entity_id = l.resource_entity_id
        where g.superseded_by is null
          and (nullif(g.phone_raw, '') is not null
            or nullif(g.email, '') is not null
            or nullif(g.url, '') is not null)
      ) all_contacts
    ),
    location_stats as (
      select count(*)::int as location_count,
             count(distinct l.resource_entity_id)::int as resources_with_locations,
             count(*) filter (where l.latitude is not null and l.longitude is not null)::int
               as verified_physical_sites,
             count(distinct l.resource_entity_id) filter (
               where l.latitude is not null and l.longitude is not null
             )::int as exact_mappable_resources
      from public.luminari_resource_locations l
      join corpus x on x.resource_entity_id = l.resource_entity_id
    ),
    totals as (
      select
        (select count(*)::int from corpus) as total_resources,
        (select count(*)::int from public.luminari_resource_entities e
          join public.luminari_resource_publication_resolutions p
            on p.resource_entity_id = e.resource_entity_id
          where p.publication_status = 'inactive'
            and ${person_facing_name_sql("e.resource_name")}) as inactive_resources,
        -- Held for naming counts the same population the corpus rule
        -- defines, minus its name clause: entities whose name fails the
        -- person-facing test AND that are not publication-retired. The
        -- resolution exclusion mirrors the corpus CTE — without it the
        -- count also tallied retired records (bundle wave 1's 40 shells,
        -- 2026-11-11), which are neither in the corpus nor substantively
        -- held, and the panel's numbers stopped reconciling.
        (select count(*)::int from public.luminari_resource_entities e
          left join public.luminari_resource_publication_resolutions p
            on p.resource_entity_id = e.resource_entity_id
          where coalesce(p.publication_status, 'active') <> 'inactive'
            and not ${person_facing_name_sql("e.resource_name")}) as held_for_naming_count,
        (select count(distinct jurisdiction_code)::int from corpus) as jurisdiction_count,
        (select count(*)::int from category_rows) as category_count,
        (select count(*)::int from corpus where resource_type = 'program') as program_count
    )
    select to_jsonb(totals) as totals,
           coalesce((select jsonb_agg(jsonb_build_object('id', id, 'count', item_count)
             order by item_count desc, id) from category_rows), '[]'::jsonb) as categories,
           coalesce((select jsonb_agg(jsonb_build_object(
             'code', code, 'count', item_count,
             'direct_resource_count', item_count - program_count,
             'program_count', program_count,
             'categories', categories) order by code) from jurisdiction_rows), '[]'::jsonb) as jurisdictions,
           (select to_jsonb(cs) from contact_stats cs) as contact_stats,
           (select to_jsonb(ls) from location_stats ls) as location_stats
    from totals
  `;
}

let summary_cache: { expires_at: number; value: Record<string, unknown> } | null =
  null;
let summary_in_flight: Promise<Record<string, unknown>> | null = null;

async function load_unified_catalog_summary(): Promise<Record<string, unknown>> {
  const pool = getPool();
  const result = await pool.query(build_unified_summary_sql(), []);
  const row = result.rows[0];
  if (!row || !row.totals || typeof row.totals.total_resources !== "number") {
    throw new Error("unified_catalog_summary_incomplete");
  }
  const totals = row.totals;
  const contact_stats = row.contact_stats ?? {};
  const location_stats = row.location_stats ?? {};
  const total = finite_number(totals.total_resources);
  const program_count = finite_number(totals.program_count);
  return {
    // One catalog, one set of names. total_directory_records remains as
    // the Civic Map's explicit directory-record label; it is the same
    // number as total_resources because both count this corpus.
    total_directory_records: total,
    active_directory_records: total,
    total_resources: total,
    active_resources: total,
    inactive_resources: finite_number(totals.inactive_resources),
    held_for_naming_count: finite_number(totals.held_for_naming_count),
    jurisdiction_count: finite_number(totals.jurisdiction_count),
    category_count: finite_number(totals.category_count),
    category_counts_overlap: true,
    contact_count: finite_number(contact_stats.contact_count),
    resources_with_contacts: finite_number(contact_stats.resources_with_contacts),
    location_count: finite_number(location_stats.location_count),
    resources_with_locations: finite_number(location_stats.resources_with_locations),
    // Coordinate-bearing catalog locations and the entities that carry
    // them — both read from luminari_resource_locations for THIS corpus,
    // so the map panel's site numbers are the directory's own numbers.
    verified_physical_sites: finite_number(location_stats.verified_physical_sites),
    exact_mappable_resources: finite_number(location_stats.exact_mappable_resources),
    direct_resource_count: total - program_count,
    program_count,
    person_facing_ready_count: total,
    category_reviewed_count: total,
    category_review_pending_count: 0,
    source_preserved_pending_count: 0,
    categories: (Array.isArray(row.categories) ? row.categories : []).map(
      (entry: Record<string, unknown>) => ({
        id: String(entry.id),
        count: finite_number(entry.count),
      }),
    ),
    jurisdictions: (Array.isArray(row.jurisdictions) ? row.jurisdictions : []).map(
      (entry: Record<string, unknown>) => ({
        code: String(entry.code),
        count: finite_number(entry.count),
        direct_resource_count: finite_number(entry.direct_resource_count),
        program_count: finite_number(entry.program_count),
        categories: entry.categories ?? {},
      }),
    ),
    source_lanes: [{ id: "unified_catalog", count: total }],
    current_snapshot: {
      snapshot_id: "unified-catalog-v1",
      snapshot_version: UNIFIED_CATALOG_CONTRACT,
      receipt_hash: null,
      activated_at: null,
      source_quality_lanes: ["unified_catalog"],
      held_identity_conflicts: null,
    },
    whole_corpus_state: null,
    projection_contract: UNIFIED_CATALOG_CONTRACT,
    availability: total > 0 ? "available" : "unavailable",
  };
}

export async function get_unified_catalog_summary() {
  const now = Date.now();
  if (summary_cache && summary_cache.expires_at > now) return summary_cache.value;
  if (summary_in_flight) return summary_in_flight;
  const active_request = load_unified_catalog_summary();
  summary_in_flight = active_request;
  try {
    const value = await active_request;
    summary_cache = { value, expires_at: Date.now() + SUMMARY_CACHE_TTL_MS };
    return value;
  } finally {
    if (summary_in_flight === active_request) summary_in_flight = null;
  }
}

export type unified_catalog_search_input = {
  query?: string;
  jurisdiction?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

function normalized_jurisdiction_code(value: unknown): string | null {
  if (value == null || !String(value).trim()) return null;
  const code = String(value).trim().toUpperCase();
  return code === "USVI" ? "VI" : code;
}

function clamp_integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value as number)));
}

export function build_unified_search_sql(): string {
  return `
    with ${unified_corpus_cte_sql()},
    filtered as (
      select c.*
      from corpus c
      where ($1::text is null or c.jurisdiction_code = $1)
        and ($2::text is null
          or c.resource_category = $2
          or $2 = any(coalesce(c.service_categories, array[]::text[])))
        and (
          $3::text is null
          or c.resource_name ilike '%' || $3 || '%'
          or coalesce(c.description, '') ilike '%' || $3 || '%'
          or coalesce(c.eligibility_summary, '') ilike '%' || $3 || '%'
          or coalesce(c.apply_notes, '') ilike '%' || $3 || '%'
          or coalesce(c.city, '') ilike '%' || $3 || '%'
          or coalesce(c.county, '') ilike '%' || $3 || '%'
          or array_to_string(coalesce(c.service_categories, array[]::text[]), ' ')
              ilike '%' || $3 || '%'
          or exists (
            select 1
            from public.v_luminari_resource_contact_points_current_v3_13 cp
            where cp.resource_entity_id = c.resource_entity_id
              and cp.contact_value ilike '%' || $3 || '%'
          )
        )
    )
    select
      (select count(*)::int from filtered) as total,
      coalesce((
        select jsonb_agg(page_row order by page_row.resource_name, page_row.resource_entity_id)
        from (
          select * from filtered
          order by resource_name asc, resource_entity_id asc
          limit $4 offset $5
        ) page_row
      ), '[]'::jsonb) as items
  `;
}

async function load_contacts_for(
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

  // Government-office entities carry their contacts on the locator row
  // the U2 projection linked — read them through the link table only for
  // entities that have no reviewed contact points.
  const missing = entity_ids.filter((id) => !by_entity.has(id));
  if (missing.length > 0) {
    const offices = await pool.query(
      `select l.resource_entity_id::text as resource_entity_id,
              nullif(g.phone_raw, '') as phone,
              nullif(g.email, '') as email,
              nullif(g.url, '') as url
         from public.luminari_anchor_office_source_rows l
         join public.gov_offices g on g.office_id = l.office_id
        where l.resource_entity_id = any($1::uuid[])
          and g.superseded_by is null`,
      [missing],
    );
    for (const row of offices.rows) {
      const contacts: catalog_contact[] = [];
      const push = (
        type: string,
        value: unknown,
        label: string,
        primary: boolean,
      ) => {
        if (value == null || String(value).trim() === "") return;
        contacts.push({
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
      push("phone", row.phone, "Phone", true);
      push("email", row.email, "Email", !row.phone);
      push("website", row.url, "Website", !row.phone && !row.email);
      if (contacts.length > 0) by_entity.set(row.resource_entity_id, contacts);
    }
  }

  for (const [id, contacts] of by_entity) {
    by_entity.set(id, sanitize_contacts(contacts));
  }
  return by_entity;
}

type catalog_location = {
  location_id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinate_quality: string | null;
  manual_location_kind: string | null;
  manual_map_eligible: boolean;
  manual_source_reference: string | null;
  manual_review_version: string | null;
};

async function load_locations_for(
  entity_ids: string[],
): Promise<Map<string, catalog_location[]>> {
  const by_entity = new Map<string, catalog_location[]>();
  if (entity_ids.length === 0) return by_entity;
  const pool = getPool();
  const result = await pool.query(
    `select location_id::text as location_id, resource_entity_id::text as resource_entity_id,
            address_line1, address_line2, city, county, state, postal_code, country,
            latitude::float8 as latitude, longitude::float8 as longitude, coordinate_quality
       from public.luminari_resource_locations
      where resource_entity_id = any($1::uuid[])
      order by (latitude is null), location_id`,
    [entity_ids],
  );
  for (const row of result.rows) {
    const list = by_entity.get(row.resource_entity_id) ?? [];
    list.push({
      location_id: String(row.location_id),
      address_line1: row.address_line1 ?? null,
      address_line2: row.address_line2 ?? null,
      city: row.city ?? null,
      county: row.county ?? null,
      state: row.state ?? null,
      postal_code: row.postal_code ?? null,
      country: row.country ?? "US",
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      coordinate_quality: row.coordinate_quality ?? null,
      manual_location_kind: null,
      manual_map_eligible: row.latitude != null && row.longitude != null,
      manual_source_reference: null,
      manual_review_version: null,
    });
    by_entity.set(row.resource_entity_id, list);
  }
  return by_entity;
}

function map_catalog_row(
  row: any,
  contacts: catalog_contact[],
  locations: catalog_location[],
) {
  const memberships = display_memberships(row.service_categories);
  const primary_category = display_primary_category(row.resource_category);
  const state = row.state ? String(row.state).toUpperCase() : null;
  const first_location = locations[0];
  return {
    resource_entity_id: String(row.resource_entity_id),
    canonical_id: String(row.canonical_id ?? row.resource_entity_id),
    source_family_key: row.source_family_key ?? null,
    source_table: row.source_table ?? null,
    source_pk: row.source_pk ?? null,
    resource_name: String(row.resource_name),
    source_resource_name: String(row.resource_name),
    resource_type: row.resource_type ?? null,
    resource_category: primary_category,
    directory_categories: memberships,
    category_review: null,
    source_resource_category: primary_category,
    jurisdiction: state ?? "US",
    source_state: row.state ?? null,
    source_jurisdiction: row.jurisdiction ?? null,
    jurisdiction_scope:
      row.jurisdiction_scope ?? (state ? "state" : "federal"),
    state,
    county: row.county ?? null,
    city: row.city ?? null,
    description: row.description ?? null,
    eligibility_summary: row.eligibility_summary ?? null,
    apply_notes: row.apply_notes ?? null,
    service_categories: unique_strings([primary_category, ...memberships]),
    verification_status: null,
    promotion_status: null,
    provenance_status: null,
    publication_status: "active" as const,
    publication_source_reference: null,
    publication_review_note: null,
    projection_contract: UNIFIED_CATALOG_CONTRACT,
    catalog_kind: row.source_table ?? null,
    object_class: row.resource_type ?? null,
    has_access_point: contacts.length > 0,
    person_facing_ready: true,
    contacts,
    locations,
    location_resolution: first_location
      ? {
          disposition: first_location.manual_map_eligible
            ? "catalog_site_with_coordinates"
            : "catalog_site_without_coordinates",
          location_kind: first_location.manual_map_eligible
            ? "public_site"
            : "source_address",
          map_eligible: first_location.manual_map_eligible,
          source_reference: null,
          review_note: null,
          review_version: UNIFIED_CATALOG_CONTRACT,
        }
      : {
          disposition: "jurisdiction_only",
          location_kind: "jurisdiction_coverage",
          map_eligible: false,
          source_reference: null,
          review_note: null,
          review_version: UNIFIED_CATALOG_CONTRACT,
        },
  };
}

export async function search_unified_catalog(
  input: unified_catalog_search_input = {},
) {
  const limit = clamp_integer(input.limit, 24, 1, 60);
  const offset = clamp_integer(input.offset, 0, 0, 20_000);
  const jurisdiction = normalized_jurisdiction_code(input.jurisdiction);
  const raw_category = input.category
    ? String(input.category).trim().toLowerCase()
    : null;
  const category =
    raw_category && /^[a-z0-9_]+$/.test(raw_category)
      ? raw_category === NON_DISPLAY_CATEGORY
        ? "__non_display__"
        : raw_category
      : null;
  const query = input.query?.trim() ? input.query.trim().slice(0, 160) : null;

  const pool = getPool();
  const result = await pool.query(build_unified_search_sql(), [
    jurisdiction,
    category,
    query,
    limit,
    offset,
  ]);
  const row = result.rows[0] ?? { total: 0, items: [] };
  const total = finite_number(row.total);
  const page_rows: any[] = Array.isArray(row.items) ? row.items : [];
  const entity_ids = page_rows.map((entry) => String(entry.resource_entity_id));
  const [contacts_by_entity, locations_by_entity] = await Promise.all([
    load_contacts_for(entity_ids),
    load_locations_for(entity_ids),
  ]);

  return {
    // The entity catalog is an indexed table read, so the filtered total
    // is exact — unlike the classified-view era, an unfiltered search
    // total IS the summary total, by construction.
    total,
    total_is_exact: true,
    has_more: offset + page_rows.length < total,
    limit,
    offset,
    items: page_rows.map((entry) =>
      map_catalog_row(
        entry,
        contacts_by_entity.get(String(entry.resource_entity_id)) ?? [],
        locations_by_entity.get(String(entry.resource_entity_id)) ?? [],
      ),
    ),
    current_snapshot: {
      snapshot_id: "unified-catalog-v1",
      snapshot_version: UNIFIED_CATALOG_CONTRACT,
      receipt_hash: null,
    },
    projection_contract: UNIFIED_CATALOG_CONTRACT,
    availability: "available",
  };
}

export function build_unified_detail_sql(): string {
  return `
    with ${unified_corpus_cte_sql()}
    select * from corpus
    where ($1::text is not null and canonical_id = $1)
       or ($2::uuid is not null and resource_entity_id = $2)
    limit 1
  `;
}

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function get_unified_catalog_detail(identifier: string) {
  const cleaned = String(identifier ?? "").trim();
  if (!cleaned) return null;
  // Government-office deep links carry the office key (gof_ + hash); the
  // U2 projection kept it as the entity canonical_id, so both identity
  // shapes resolve against the same catalog row.
  const canonical = /^gof_/i.test(cleaned) ? cleaned : null;
  const uuid = !canonical && UUID_SHAPE.test(cleaned) ? cleaned : null;
  if (!canonical && !uuid) return null;

  const pool = getPool();
  const result = await pool.query(build_unified_detail_sql(), [
    canonical,
    uuid,
  ]);
  const row = result.rows[0];
  if (!row) return null;
  const entity_id = String(row.resource_entity_id);
  const [contacts_by_entity, locations_by_entity] = await Promise.all([
    load_contacts_for([entity_id]),
    load_locations_for([entity_id]),
  ]);
  return map_catalog_row(
    row,
    contacts_by_entity.get(entity_id) ?? [],
    locations_by_entity.get(entity_id) ?? [],
  );
}

export type unified_catalog_bounds_input = {
  north: number;
  south: number;
  east: number;
  west: number;
  limit?: number;
  category?: string;
};

export function build_unified_map_points_sql(): string {
  return `
    with ${unified_corpus_cte_sql()}
    select
      e.resource_entity_id::text as resource_entity_id,
      e.resource_name as resource_name,
      case when e.resource_category = '${NON_DISPLAY_CATEGORY}' then null
           else e.resource_category end as resource_category,
      e.state,
      l.location_id::text as location_id,
      l.address_line1,
      l.address_line2,
      l.city,
      l.county,
      l.state as location_state,
      l.postal_code,
      l.latitude::float8 as latitude,
      l.longitude::float8 as longitude,
      l.coordinate_quality as coordinate_quality,
      'catalog_site'::text as manual_location_kind,
      null::text as manual_source_reference
    from corpus e
    join public.luminari_resource_locations l
      on l.resource_entity_id = e.resource_entity_id
    where l.latitude is not null
      and l.longitude is not null
      and l.latitude between $1 and $2
      and l.longitude between $3 and $4
      and ($5::text is null
        or e.resource_category = $5
        or $5 = any(coalesce(e.service_categories, array[]::text[])))
    order by e.resource_name, l.location_id
    limit $6
  `;
}

export async function get_unified_catalog_map_points(
  input: unified_catalog_bounds_input,
) {
  const limit = clamp_integer(input.limit, 1200, 1, 2000);
  const raw_category = input.category
    ? String(input.category).trim().toLowerCase()
    : null;
  const category =
    raw_category && /^[a-z0-9_]+$/.test(raw_category)
      ? raw_category === NON_DISPLAY_CATEGORY
        ? "__non_display__"
        : raw_category
      : null;
  const pool = getPool();
  const { rows } = await pool.query(build_unified_map_points_sql(), [
    input.south,
    input.north,
    input.west,
    input.east,
    category,
    limit,
  ]);
  return rows;
}

export function clear_unified_catalog_summary_cache() {
  summary_cache = null;
}
