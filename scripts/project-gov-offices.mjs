// Gov office projection v1 — bring the anchored agency-locator
// offices (public.gov_offices, 59,979 rows across 10 families) into
// the Resource Directory catalog as entities.
//
// Why: Alexander's unification ruling (2026-11-10) — every resource
// lives in the catalog, categorized; a side table with map pins is
// not integration ("if it's not running through the same system, it
// doesn't actually work"). The projection dedupes WITHOUT deleting
// anything: gov_offices rows stay; each office becomes an entity in
// luminari_resource_entities (source_table='gov_office_projection_v1')
// with one base location (source coordinates carried where the
// locator source supplied them) and a link row per office.
//
// Declared deterministic rules:
//   - Population: gov_offices where superseded_by is null, sorted by
//     office_id. Canonical id is the office_id AS-IS (already a
//     stable content hash — never re-hashed). resource_entity_id is
//     luminari_stable_uuid_v1('gov_office:' || office_id) (md5-based;
//     computed here in JS, identical to the step-1 helper).
//   - Categories from the U1 family->category map (decided
//     2026-11-10 under Alexander's delegation; canonical 9, no new
//     category): family-level primaries + memberships; VA assigned
//     at office_type grain (see categoriesForOffice). An office with
//     no map entry is UNMAPPED: held from the projection and named
//     in the census — nothing lands uncategorized.
//   - Tier A collision: same state + ZIP5 + normalized street as an
//     existing catalog location => attach to the existing entity
//     (link row, match_kind 'tier_a_merge'); no second entity and
//     no new location (the site location is what matched). When
//     several entities share the key, the smallest entity id wins.
//   - Tier B collision: same normalized name + state + city as an
//     existing entity, without a tier-A match => HELD, listed in
//     the census, not projected (name evidence is weaker than
//     street+ZIP; a human decides).
//   - Locations: street/city/state/ZIP parsed from the office's own
//     fields as the source gives them. Coordinates are copied ONLY
//     when the office carries them (coordinate_quality
//     'source_supplied', geocode_source = the office's locator
//     source id); otherwise the location has no coordinates and the
//     office is findable-but-unmapped (never invented).
//
// Dry run by default; --apply writes entities + base locations +
// link rows in one transaction. Re-runnable: every insert is
// conflict-guarded and the dry-run manifest hash equals the apply
// manifest hash.

import { createHash } from "node:crypto";
import process from "node:process";

function loadPg() {
  return import("pg").catch(() => {
    throw new Error(
      "The 'pg' package is unavailable. Run inside the luminari service environment (Render job) where pg is installed.",
    );
  });
}

export const PROJECTION_VERSION = "gov_office_projection_v1";
export const SOURCE_TABLE = "gov_office_projection_v1";
export const SOURCE_FAMILY_KEY = "gov_office_projection";
export const CATEGORY_RULE_VERSION = "u1_family_map_v1";

// ---------------------------------------------------------------------------
// U1 family -> category map (decided 2026-11-10; canonical 9 categories)
// ---------------------------------------------------------------------------

export const FAMILY_CATEGORY_MAP = {
  law_enforcement: { primary: "safety_crisis", memberships: [] },
  hospital: { primary: "healthcare", memberships: ["safety_crisis"] },
  health_center: { primary: "healthcare", memberships: [] },
  public_housing_authority: { primary: "housing", memberships: [] },
  hud: { primary: "housing", memberships: [] },
  american_job_center: { primary: "employment_labor", memberships: ["cash_assistance"] },
  apprenticeship: { primary: "employment_labor", memberships: [] },
  ssa: { primary: "cash_assistance", memberships: [] },
  native_american: { primary: "tribal", memberships: [] },
};

// VA clinical types -> healthcare (U1). va_vamc additionally carries
// the safety_crisis membership (medical centers are crisis doors,
// like hospital emergency departments).
export const VA_CLINICAL_TYPES = new Set([
  "va_vamc",
  "va_pccboc",
  "va_mscboc",
  "va_hcc",
  "va_clc",
  "va_drrtp",
  "va_mcs",
]);
// Vet centers (readjustment counseling) -> safety_crisis primary:
// U1 assigns them the safety_crisis membership alongside va_vamc and
// no other primary, so crisis counseling is their primary need.
export const VA_SAFETY_PRIMARY_TYPES = new Set(["va_vtcr", "va_mvctr"]);
// VA outreach / benefits offices -> cash_assistance primary.
export const VA_BENEFITS_TYPES = new Set(["va_oos"]);

/**
 * Category assignment for one office. Returns { primary,
 * memberships } or null when the office has no U1 map entry — the
 * caller holds unmapped offices out of the projection.
 */
export function categoriesForOffice(office) {
  if (office.agency_key === "veterans_affairs") {
    const t = office.office_type ?? "";
    if (VA_CLINICAL_TYPES.has(t)) {
      return {
        primary: "healthcare",
        memberships: t === "va_vamc" ? ["safety_crisis"] : [],
      };
    }
    if (VA_SAFETY_PRIMARY_TYPES.has(t)) {
      return { primary: "safety_crisis", memberships: [] };
    }
    if (VA_BENEFITS_TYPES.has(t)) {
      return { primary: "cash_assistance", memberships: [] };
    }
    return null;
  }
  const hit = FAMILY_CATEGORY_MAP[office.agency_key];
  if (!hit) return null;
  return { primary: hit.primary, memberships: [...hit.memberships] };
}

// ---------------------------------------------------------------------------
// Address parsing + keys (pure; normalization mirrors the 2026-11-10
// collision census: lowercase, non [A-Za-z0-9 ] -> space, collapsed)
// ---------------------------------------------------------------------------

export function normalizeForKey(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ZIP5_TAIL_RE = /(\d{5})(-\d{4})?\s*(\([^)]*\)\s*)?$/;

export function extractZip5(text) {
  if (!text) return null;
  const m = ZIP5_TAIL_RE.exec(String(text).trim());
  return m ? m[1] : null;
}

const EMBEDDED_TAIL_RE =
  /,?\s*(?:[^,]+,\s*)?[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\s*(?:\([^)]*\)\s*)?$/;
const EMBEDDED_CITY_STATE_RE =
  /,\s*([^,]+),\s*([A-Za-z]{2})\s+\d{5}(?:-\d{4})?\s*(?:\([^)]*\)\s*)?$/;

/**
 * Parse an office's address into location components, as the source
 * gives them: city/state come from the office's own columns (the
 * locator source's parse), the street from address_full with any
 * embedded ", City, ST ZIP" tail removed. address_full sometimes
 * carries only the organization name (no street known) — then the
 * street is null, never the name restated as an address. Purely
 * presentational; collision keys use the same fields.
 */
export function parseOfficeAddress(office) {
  const full = (office.address_full ?? "").trim();
  const zip5 = extractZip5(full);
  let city = (office.city ?? "").trim() || null;
  let state = (office.state ?? "").trim() || null;
  const tail = EMBEDDED_CITY_STATE_RE.exec(full);
  if (tail) {
    if (!city) city = tail[1].trim();
    if (!state) state = tail[2].toUpperCase();
  }
  let street = full.replace(EMBEDDED_TAIL_RE, "").replace(/[\s,]+$/, "").trim();
  if (street === "" || normalizeForKey(street) === normalizeForKey(office.office_name ?? "")) {
    street = null;
  }
  return { street, city, state, zip5 };
}

/** Tier A key: state + ZIP5 + normalized street. Null unless complete. */
export function buildTierKey(state, zip5, street) {
  if (!state || !zip5 || !street) return null;
  const nStreet = normalizeForKey(street);
  if (nStreet === "") return null;
  return `${String(state).toUpperCase()}|${zip5}|${nStreet}`;
}

/** Tier B key: state + normalized city + normalized name. */
export function buildNameKey(state, city, name) {
  if (!state || !city || !name) return null;
  const nCity = normalizeForKey(city);
  const nName = normalizeForKey(name);
  if (nCity === "" || nName === "") return null;
  return `${String(state).toUpperCase()}|${nCity}|${nName}`;
}

/** md5-based stable UUID, identical to luminari_stable_uuid_v1. */
export function stableUuid(value) {
  const h = createHash("md5").update(String(value)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Projection (pure and deterministic)
// ---------------------------------------------------------------------------

/**
 * Project office rows against the existing catalog locations.
 * existingLocations: rows of { resource_entity_id, canonical_id,
 * resource_name, address_line1, city, state, postal_code } for every
 * catalog location that carries a street address.
 * Deterministic: offices are processed in office_id order and every
 * tie is broken by the smallest entity id.
 */
export function projectOffices(offices, existingLocations) {
  const tierIndex = new Map(); // tierKey -> Set<entity_id>
  const nameIndex = new Map(); // nameKey -> Set<entity_id>
  const canonicalByEntity = new Map();
  for (const loc of existingLocations) {
    canonicalByEntity.set(loc.resource_entity_id, loc.canonical_id ?? null);
    const tk = buildTierKey(loc.state, extractZip5(loc.postal_code), loc.address_line1);
    if (tk) {
      if (!tierIndex.has(tk)) tierIndex.set(tk, new Set());
      tierIndex.get(tk).add(loc.resource_entity_id);
    }
    const nk = buildNameKey(loc.state, loc.city, loc.resource_name);
    if (nk) {
      if (!nameIndex.has(nk)) nameIndex.set(nk, new Set());
      nameIndex.get(nk).add(loc.resource_entity_id);
    }
  }
  const smallest = (set) => [...set].sort()[0];

  const sorted = [...offices].sort((a, b) =>
    a.office_id < b.office_id ? -1 : a.office_id > b.office_id ? 1 : 0,
  );
  const census = {
    offices: sorted.length,
    by_agency: {},
    minted: 0,
    tier_a_merges: 0,
    tier_b_held: 0,
    unmapped: 0,
    locations_with_coordinates: 0,
    locations_without_coordinates: 0,
    category_distribution: {},
    membership_distribution: {},
  };
  const mints = [];
  const merges = [];
  const held = [];
  const unmapped = [];
  const manifestLines = [];

  for (const office of sorted) {
    census.by_agency[office.agency_key] = (census.by_agency[office.agency_key] ?? 0) + 1;
    const cats = categoriesForOffice(office);
    if (!cats) {
      census.unmapped += 1;
      unmapped.push({
        office_id: office.office_id,
        office_name: office.office_name,
        agency_key: office.agency_key,
        office_type: office.office_type ?? null,
      });
      manifestLines.push(`${office.office_id}|unmapped|`);
      continue;
    }
    const parsed = parseOfficeAddress(office);
    const tierKey = buildTierKey(office.state ?? parsed.state, parsed.zip5, parsed.street);
    if (tierKey && tierIndex.has(tierKey)) {
      const target = smallest(tierIndex.get(tierKey));
      census.tier_a_merges += 1;
      merges.push({
        office_id: office.office_id,
        office_name: office.office_name,
        agency_key: office.agency_key,
        target_entity_id: target,
        target_canonical_id: canonicalByEntity.get(target) ?? null,
        tier_key: tierKey,
      });
      manifestLines.push(`${office.office_id}|tier_a_merge|${target}`);
      continue;
    }
    const nameKey = buildNameKey(office.state ?? parsed.state, office.city ?? parsed.city, office.office_name);
    if (nameKey && nameIndex.has(nameKey)) {
      census.tier_b_held += 1;
      held.push({
        office_id: office.office_id,
        office_name: office.office_name,
        agency_key: office.agency_key,
        matched_entity_ids: [...nameIndex.get(nameKey)].sort(),
        name_key: nameKey,
      });
      manifestLines.push(`${office.office_id}|tier_b_held|`);
      continue;
    }
    const hasCoords = office.lat != null && office.lng != null;
    const mint = {
      office,
      entity_id: stableUuid(`gov_office:${office.office_id}`),
      canonical_id: office.office_id,
      primary: cats.primary,
      memberships: cats.memberships,
      parsed,
      has_coordinates: hasCoords,
      latitude: hasCoords ? Number(office.lat) : null,
      longitude: hasCoords ? Number(office.lng) : null,
    };
    mints.push(mint);
    census.minted += 1;
    if (hasCoords) census.locations_with_coordinates += 1;
    else census.locations_without_coordinates += 1;
    census.category_distribution[cats.primary] =
      (census.category_distribution[cats.primary] ?? 0) + 1;
    for (const m of cats.memberships) {
      census.membership_distribution[m] = (census.membership_distribution[m] ?? 0) + 1;
    }
    manifestLines.push(`${office.office_id}|minted|${mint.entity_id}`);
  }
  census.tier_a_merge_list = merges;
  census.tier_b_held_list = held;
  census.unmapped_list = unmapped;
  const manifestSha = createHash("sha256").update(manifestLines.join("\n")).digest("hex");
  return { census, mints, merges, held, unmapped, manifestSha };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const FETCH_OFFICES_SQL = `
  select office_id, agency_key, office_name, office_type, state, county,
         city, address_full, phone_raw, hours, email, url, lat, lng,
         source_id, source_hash8, provenance
    from public.gov_offices
   where superseded_by is null
   order by office_id
`;

const FETCH_EXISTING_SQL = `
  select l.resource_entity_id, e.canonical_id, e.resource_name,
         l.address_line1, l.city, l.state, l.postal_code
    from public.luminari_resource_locations l
    join public.luminari_resource_entities e
      on e.resource_entity_id = l.resource_entity_id
   where l.address_line1 is not null
`;

async function fetchRows(client) {
  await client.query("set statement_timeout = '240s'");
  const offices = (await client.query(FETCH_OFFICES_SQL)).rows;
  const existing = (await client.query(FETCH_EXISTING_SQL)).rows;
  return { offices, existing };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Write path (builders are pure and unit-tested against the live schema)
// ---------------------------------------------------------------------------

export const ENTITY_INSERT_COLUMNS = [
  "resource_entity_id",
  "canonical_id",
  "source_family_key",
  "source_table",
  "source_pk",
  "source_hash",
  "resource_name",
  "resource_type",
  "resource_category",
  "service_categories",
  "layer",
  "jurisdiction",
  "state",
  "county",
  "city",
  "verification_status",
  "promotion_status",
  "provenance_status",
  "metadata",
];

const ENTITY_CASTS = {
  resource_entity_id: "::uuid",
  service_categories: "::text[]",
  metadata: "::jsonb",
};

/** Build the entity insert for a batch of mints (pure; unit-tested). */
export function buildEntityInsert(mints) {
  const values = [];
  const params = [];
  mints.forEach((mint, i) => {
    const b = i * ENTITY_INSERT_COLUMNS.length;
    const slots = ENTITY_INSERT_COLUMNS.map(
      (col, j) => `$${b + j + 1}${ENTITY_CASTS[col] ?? ""}`,
    );
    values.push(`(${slots.join(",")})`);
    const o = mint.office;
    params.push(
      mint.entity_id,
      mint.canonical_id,
      SOURCE_FAMILY_KEY,
      SOURCE_TABLE,
      o.office_id,
      o.source_hash8 ?? null,
      o.office_name,
      o.office_type ?? null,
      mint.primary,
      mint.memberships,
      null, // layer
      null, // jurisdiction
      o.state ?? null,
      o.county ?? null,
      o.city ?? null,
      "source_attached",
      "review_ready",
      "staging_provenance_attached",
      JSON.stringify({
        projection_version: PROJECTION_VERSION,
        category_rule: CATEGORY_RULE_VERSION,
        agency_key: o.agency_key,
        office_type: o.office_type ?? null,
        source_id: o.source_id ?? null,
        source_hash8: o.source_hash8 ?? null,
        source_provenance: o.provenance ?? null,
      }),
    );
  });
  const text = `
    insert into public.luminari_resource_entities
       (${ENTITY_INSERT_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict (canonical_id) do nothing`;
  return { text, params };
}

export const LOCATION_INSERT_COLUMNS = [
  "resource_entity_id",
  "address_line1",
  "address_line2",
  "city",
  "county",
  "state",
  "postal_code",
  "country",
  "latitude",
  "longitude",
  "coordinate_quality",
  "geocode_source",
  "source_table",
  "source_pk",
  "metadata",
];

export const LOCATION_VALUE_COLUMNS = [
  "resource_entity_id",
  "address_line1",
  "address_line2",
  "city",
  "county",
  "state",
  "postal_code",
  "latitude",
  "longitude",
  "coordinate_quality",
  "geocode_source",
  "source_table",
  "source_pk",
  "metadata",
];

const LOCATION_CASTS = {
  resource_entity_id: "::uuid",
  latitude: "::numeric",
  longitude: "::numeric",
  metadata: "::jsonb",
};

const LOCATION_DERIVED_EXPRESSIONS = {
  country: "'US'",
};

/**
 * Build the base-location insert for a batch of mints (pure;
 * unit-tested). Mirrors step 1: each VALUES tuple supplies exactly
 * the parameterized columns named by the derived-table alias list;
 * the remaining destination column (country) is a derived literal
 * in the SELECT list. UUID, numeric, and JSONB parameters are cast
 * explicitly — in a standalone VALUES relation they otherwise
 * resolve as text and the insert fails (PR #791 review finding).
 */
export function buildLocationInsert(mints) {
  const values = [];
  const params = [];
  mints.forEach((mint, i) => {
    const b = i * LOCATION_VALUE_COLUMNS.length;
    const slots = LOCATION_VALUE_COLUMNS.map(
      (col, j) => `$${b + j + 1}${LOCATION_CASTS[col] ?? ""}`,
    );
    values.push(`(${slots.join(",")})`);
    const o = mint.office;
    params.push(
      mint.entity_id,
      mint.parsed.street,
      null, // address_line2: the locator sources carry no line 2
      mint.parsed.city,
      o.county ?? null,
      mint.parsed.state ?? o.state ?? null,
      mint.parsed.zip5,
      mint.latitude,
      mint.longitude,
      mint.has_coordinates ? "source_supplied" : "not_geocoded_projection",
      mint.has_coordinates ? (o.source_id ?? null) : null,
      SOURCE_TABLE,
      o.office_id,
      JSON.stringify({
        projection_version: PROJECTION_VERSION,
        office_id: o.office_id,
        agency_key: o.agency_key,
      }),
    );
  });
  const selectList = LOCATION_INSERT_COLUMNS.map((col) =>
    LOCATION_VALUE_COLUMNS.includes(col) ? `v.${col}` : LOCATION_DERIVED_EXPRESSIONS[col],
  ).join(", ");
  const text = `
    insert into public.luminari_resource_locations
       (${LOCATION_INSERT_COLUMNS.join(", ")})
     select ${selectList}
       from (values ${values.join(",")})
         as v(${LOCATION_VALUE_COLUMNS.join(", ")})
      where not exists (
        select 1 from public.luminari_resource_locations existing
         where existing.source_table = v.source_table
           and existing.source_pk = v.source_pk)`;
  return { text, params };
}

export const LINK_INSERT_COLUMNS = [
  "office_id",
  "resource_entity_id",
  "match_kind",
  "projection_version",
];

/** Build the link insert for mints + tier-A merges (pure; unit-tested). */
export function buildLinkInsert(mints, merges) {
  const rows = [
    ...mints.map((m) => ({ office_id: m.office.office_id, entity_id: m.entity_id, kind: "minted" })),
    ...merges.map((m) => ({ office_id: m.office_id, entity_id: m.target_entity_id, kind: "tier_a_merge" })),
  ];
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * LINK_INSERT_COLUMNS.length;
    values.push(`($${b + 1},$${b + 2}::uuid,$${b + 3},$${b + 4})`);
    params.push(r.office_id, r.entity_id, r.kind, PROJECTION_VERSION);
  });
  const text = `
    insert into public.luminari_anchor_office_source_rows
       (${LINK_INSERT_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict do nothing`;
  return { text, params };
}

async function applyProjection(client, mints, merges) {
  let entities = 0;
  let locations = 0;
  let links = 0;
  for (const batch of chunk(mints, 250)) {
    const { text, params } = buildEntityInsert(batch);
    const res = await client.query(text, params);
    entities += res.rowCount;
  }
  for (const batch of chunk(mints, 250)) {
    const { text, params } = buildLocationInsert(batch);
    const res = await client.query(text, params);
    locations += res.rowCount;
  }
  for (const batch of chunk(mints, 500)) {
    const { text, params } = buildLinkInsert(batch, []);
    const res = await client.query(text, params);
    links += res.rowCount;
  }
  for (const batch of chunk(merges, 500)) {
    const { text, params } = buildLinkInsert([], batch);
    const res = await client.query(text, params);
    links += res.rowCount;
  }
  return { entities, locations, links };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { default: pgDefault } = await loadPg();
  const Pool = pgDefault?.Pool ?? (await loadPg()).Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const { offices, existing } = await fetchRows(client);
    const { census, mints, merges, manifestSha } = projectOffices(offices, existing);
    console.log(JSON.stringify({ census, manifest_sha256: manifestSha }));
    if (!apply) {
      console.log("DRY RUN ONLY — pass --apply to write entities, base locations, and link rows.");
      return;
    }
    await client.query("begin");
    try {
      const written = await applyProjection(client, mints, merges);
      await client.query("commit");
      console.log(JSON.stringify({ applied: written, manifest_sha256: manifestSha }));
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
