// Catalog site projection v1 — derive one site per (organization,
// street address) from the classified Resource Directory catalog.
//
// Why: the catalog's 21,647 rows repeat the same organization at the
// same address across source artifacts and sections (Alexander's
// duplication finding, 2026-11-09). The projection dedupes WITHOUT
// deleting anything: source rows stay in the catalog; each projected
// site is an entity in luminari_resource_entities
// (source_table='catalog_site_projection_v1') with one base location
// and a link row per contributing catalog row + address segment.
//
// Declared deterministic rules (mirrored 1:1 from the live SQL census
// of 2026-11-09, which is the acceptance test for this runner's dry
// run: 14,181 segments / 9,279 site / 1,459 mailing / 3,443 note /
// 5,164 distinct physical sites / 799 distinct mailing sites /
// 9,195 rows with any key):
//   - Org name: organization_name when the row name is a bare UUID or
//     an artifact key ('luminari-%') and organization_name is
//     non-empty; else the row name.
//   - Segments: split the address text on ' | ', trim each; strip one
//     leading "Label:" prefix when a colon appears within the first
//     60 characters.
//   - A segment is MAILING when it mentions a PO Box; a SITE when it
//     carries a street core (digits + a word) and ends in a ZIP5
//     (optional ZIP+4 and/or one trailing parenthetical); otherwise a
//     NOTE — not a site (phones, URLs, "statewide", ZIP-only text).
//   - Site key: normalized org name + ' @ ' + normalized segment
//     (trailing parenthetical and trailing ZIP removed) + ' @ ' +
//     ZIP5; normalization is lowercase, non [A-Za-z0-9 ] -> space,
//     whitespace collapsed.
//   - Identity: resource_entity_id = luminari_stable_uuid_v1(
//     'catalog_site:' || site_key) (md5-based; computed here in JS),
//     canonical_id 'csp_<state>_<sha256(site_key)[:20]>',
//     source_pk 'csp_<sha256(site_key)[:32]>'.
//
// Dry run by default; --apply writes entities + base locations +
// link rows in one transaction. Re-runnable: every insert is
// conflict-guarded.

import { createHash } from "node:crypto";
import process from "node:process";

function loadPg() {
  return import("pg").catch(() => {
    throw new Error(
      "The 'pg' package is unavailable. Run inside the luminari service environment (Render job) where pg is installed.",
    );
  });
}

export const PROJECTION_VERSION = "catalog_site_projection_v1";
export const SOURCE_TABLE = "catalog_site_projection_v1";
export const SOURCE_FAMILY_KEY = "catalog_site_projection";

const UUID_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PO_BOX_RE = /po box|p\.o\. box/i;
const STREET_CORE_RE = /\d+\s+[A-Za-z]/;
const ZIP_END_RE = /\d{5}(-\d{4})?\s*$|\d{5}(-\d{4})?\s*\([^)]*\)\s*$/;
const ZIP5_RE = /(\d{5})(-\d{4})?\s*(\([^)]*\)\s*)?$/;
const TRAILING_PAREN_RE = /\s*\([^)]*\)\s*$/;

/** Org-name selection, mirroring the census CASE expression. */
export function pickOrgName(row) {
  const name = row.name ?? "";
  const org = (row.organization_name ?? "").trim();
  const needsRescue = UUID_NAME_RE.test(name) || name.startsWith("luminari-");
  if (needsRescue && org !== "") {
    return { name: org, unresolved: false };
  }
  return { name, unresolved: needsRescue };
}

/** Split a catalog address text into trimmed segments. */
export function splitSegments(address) {
  if (!address) return [];
  return String(address)
    .split(" | ")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Strip one leading "Label:" prefix (colon within the first 60 chars). */
export function stripLabel(segment) {
  const idx = segment.indexOf(":");
  if (idx >= 0 && idx < 60) {
    return { label: segment.slice(0, idx).trim(), rest: segment.slice(idx + 1).trim() };
  }
  return { label: null, rest: segment };
}

/** Classify a label-stripped segment: 'mailing' | 'site' | 'note'. */
export function classifySegment(segment) {
  if (PO_BOX_RE.test(segment)) return "mailing";
  if (STREET_CORE_RE.test(segment) && ZIP_END_RE.test(segment)) return "site";
  return "note";
}

export function extractZip5(segment) {
  const m = ZIP5_RE.exec(segment);
  return m ? m[1] : null;
}

/** Census-identical text normalization for keys. */
export function normalizeForKey(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The deterministic site key for one classified segment. */
export function buildSiteKey(orgName, segment, zip5) {
  const nName = normalizeForKey(orgName);
  const withoutParen = segment.replace(TRAILING_PAREN_RE, "");
  const nSeg = normalizeForKey(withoutParen).replace(/\s*\d{5}( \d{4})?\s*$/, "");
  return `${nName} @ ${nSeg} @ ${zip5 ?? ""}`;
}

/** md5-based stable UUID, identical to luminari_stable_uuid_v1. */
export function stableUuid(value) {
  const h = createHash("md5").update(String(value)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const TAIL_COMMA_STATE_RE =
  /^(.*),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?$/;
const TAIL_SPACE_STATE_RE =
  /^(.*),\s*([^,]+?)\s+([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?$/;

/**
 * Best-effort component parse of a site/mailing segment. Purely
 * presentational (entity/location fields); the site KEY never depends
 * on it. Unparseable tails keep the street text and null city/state.
 */
export function parseComponents(segment) {
  const clean = segment.replace(TRAILING_PAREN_RE, "").trim();
  const zip5 = extractZip5(segment);
  let m = TAIL_COMMA_STATE_RE.exec(clean);
  if (m) {
    return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip5: m[4] };
  }
  m = TAIL_SPACE_STATE_RE.exec(clean);
  if (m) {
    return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip5: m[4] };
  }
  const street = clean.replace(/\s+\d{5}(-\d{4})?$/, "").trim();
  return { street, city: null, state: null, zip5 };
}

/**
 * Project catalog rows into sites. Pure and deterministic: members
 * are sorted by civic_object_uid and the representative is the first
 * member, so the same input rows always yield the same sites.
 */
export function projectRows(rows) {
  const census = {
    rows: rows.length,
    addressed_rows: 0,
    segments: 0,
    site_segments: 0,
    mailing_segments: 0,
    note_segments: 0,
    rows_with_key: 0,
    name_unresolved_rows: 0,
  };
  const sites = new Map(); // site_key -> { members: [], kind }
  for (const row of rows) {
    const picked = pickOrgName(row);
    if (picked.unresolved) census.name_unresolved_rows += 1;
    const segments = splitSegments(row.address);
    if (segments.length > 0) census.addressed_rows += 1;
    let rowHasKey = false;
    for (const rawSegment of segments) {
      census.segments += 1;
      const { label, rest } = stripLabel(rawSegment);
      const kind = classifySegment(rest);
      if (kind === "note") {
        census.note_segments += 1;
        continue;
      }
      if (kind === "mailing") census.mailing_segments += 1;
      else census.site_segments += 1;
      rowHasKey = true;
      const zip5 = extractZip5(rest);
      const key = buildSiteKey(picked.name, rest, zip5);
      if (!sites.has(key)) sites.set(key, { key, kind, members: [] });
      sites.get(key).members.push({
        civic_object_uid: row.civic_object_uid,
        object_ref: row.object_ref ?? null,
        artifact_key: row.artifact_key ?? null,
        source_content_sha256: row.source_content_sha256 ?? null,
        segment_text: rest,
        label,
        org_name: picked.name,
        name_unresolved: picked.unresolved,
        state_code: row.state_code ?? null,
        jurisdiction: row.jurisdiction ?? null,
        category: row.category ?? null,
        layer: row.layer ?? null,
        phone: row.phone ?? null,
        website_url: row.website_url ?? null,
      });
    }
    if (rowHasKey) census.rows_with_key += 1;
  }
  const siteList = [];
  for (const site of sites.values()) {
    site.members.sort((a, b) =>
      a.civic_object_uid < b.civic_object_uid ? -1 : a.civic_object_uid > b.civic_object_uid ? 1 : 0,
    );
    const rep = site.members[0];
    const components = parseComponents(rep.segment_text);
    const sha = createHash("sha256").update(site.key).digest("hex");
    const state = components.state || rep.state_code || "US";
    siteList.push({
      key: site.key,
      kind: site.kind,
      entity_id: stableUuid(`catalog_site:${site.key}`),
      canonical_id: `csp_${String(state).toLowerCase()}_${sha.slice(0, 20)}`,
      source_pk: `csp_${sha.slice(0, 32)}`,
      org_name: rep.org_name,
      name_unresolved: rep.name_unresolved,
      label: rep.label,
      components,
      state,
      jurisdiction: rep.jurisdiction,
      category: rep.category,
      layer: rep.layer,
      phone: rep.phone,
      website_url: rep.website_url,
      members: site.members,
    });
  }
  siteList.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  census.physical_sites = siteList.filter((s) => s.kind === "site").length;
  census.mailing_sites = siteList.filter((s) => s.kind === "mailing").length;
  census.sites_total = siteList.length;
  const manifestSha = createHash("sha256")
    .update(siteList.map((s) => s.key).join("\n"))
    .digest("hex");
  return { census, sites: siteList, manifestSha };
}

const FETCH_SQL = `
  select civic_object_uid, object_ref, artifact_key, source_content_sha256,
         name, organization_name, state_code, jurisdiction,
         address, phone, website_url, category, layer
    from public.v_lighthouse_resource_program_classified_v1
`;

async function fetchRows(client) {
  await client.query("set statement_timeout = '240s'");
  const { rows } = await client.query(FETCH_SQL);
  return rows;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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
  "layer",
  "jurisdiction",
  "state",
  "city",
  "verification_status",
  "promotion_status",
  "provenance_status",
  "metadata",
];

/** Build the entity insert for a batch of sites (pure; unit-tested). */
export function buildEntityInsert(sites) {
  const values = [];
  const params = [];
  sites.forEach((s, i) => {
    const b = i * ENTITY_INSERT_COLUMNS.length;
    const slots = ENTITY_INSERT_COLUMNS.map((_, j) => `$${b + j + 1}`);
    values.push(`(${slots.join(",")})`);
    params.push(
      s.entity_id,
      s.canonical_id,
      SOURCE_FAMILY_KEY,
      SOURCE_TABLE,
        s.source_pk,
        null, // source_hash: the site key hash lives in source_pk; no single source hash exists
        s.org_name,
        "projected_site",
        s.category,
        s.layer,
        s.jurisdiction,
        s.state,
        s.components.city,
        "source_attached",
        "review_ready",
        "staging_provenance_attached",
        JSON.stringify({
          projection_version: PROJECTION_VERSION,
          site_key: s.key,
          site_kind: s.kind,
          label: s.label,
          name_unresolved: s.name_unresolved,
          source_row_count: s.members.length,
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
  "city",
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
  "city",
  "state",
  "postal_code",
  "source_table",
  "source_pk",
  "metadata",
];

const LOCATION_DERIVED_EXPRESSIONS = {
  country: "'US'",
  latitude: "null",
  longitude: "null",
  coordinate_quality: "'not_geocoded_projection'",
  geocode_source: "null",
};

/**
 * Build the base-location insert for a batch of sites (pure;
 * unit-tested). Each VALUES tuple supplies exactly the eight
 * parameterized columns named by the derived-table alias list; the
 * remaining destination columns are derived literals in the SELECT
 * list. The UUID and JSONB parameters are cast explicitly — in a
 * standalone VALUES relation they otherwise resolve as text and the
 * insert fails (PR #791 review finding).
 */
export function buildLocationInsert(sites) {
  const values = [];
  const params = [];
  sites.forEach((s, i) => {
    const b = i * LOCATION_VALUE_COLUMNS.length;
    values.push(
      `($${b + 1}::uuid,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8}::jsonb)`,
    );
    params.push(
      s.entity_id,
      s.components.street,
      s.components.city,
      s.state,
      s.components.zip5,
      SOURCE_TABLE,
      s.source_pk,
      JSON.stringify({ projection_version: PROJECTION_VERSION, site_key: s.key, site_kind: s.kind }),
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

async function applySites(client, sites) {
  let entities = 0;
  let locations = 0;
  let links = 0;
  for (const batch of chunk(sites, 250)) {
    const { text, params } = buildEntityInsert(batch);
    const res = await client.query(text, params);
    entities += res.rowCount;
  }
  for (const batch of chunk(sites, 250)) {
    const { text, params } = buildLocationInsert(batch);
    const res = await client.query(text, params);
    locations += res.rowCount;
  }
  const linkRows = [];
  for (const s of sites) {
    for (const m of s.members) {
      linkRows.push({ site: s, member: m });
    }
  }
  for (const batch of chunk(linkRows, 500)) {
    const values = [];
    const params = [];
    batch.forEach((r, i) => {
      const b = i * 8;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`);
      params.push(
        r.site.entity_id,
        r.member.civic_object_uid,
        r.member.object_ref,
        r.member.artifact_key,
        r.member.source_content_sha256,
        r.member.segment_text,
        r.site.kind === "mailing" ? "mailing" : "physical",
        PROJECTION_VERSION,
      );
    });
    const res = await client.query(
      `insert into public.luminari_catalog_site_source_rows
         (site_entity_id, civic_object_uid, object_ref, artifact_key,
          source_content_sha256, segment_text, segment_kind, projection_version)
       values ${values.join(",")}
       on conflict do nothing`,
      params,
    );
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
    const rows = await fetchRows(client);
    const { census, sites, manifestSha } = projectRows(rows);
    console.log(JSON.stringify({ census, manifest_sha256: manifestSha }));
    if (!apply) {
      console.log("DRY RUN ONLY — pass --apply to write entities, base locations, and link rows.");
      return;
    }
    await client.query("begin");
    try {
      const written = await applySites(client, sites);
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
