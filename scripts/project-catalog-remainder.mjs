// Catalog remainder projection v1 — project the classified Resource
// Directory rows step 1 never projected into the unified catalog.
//
// Why: step 1 (PR #791) projected the 9,195 classified rows that carry
// a site or mailing address segment into 5,963 site entities. The
// remaining 12,452 rows — no address text, or address text that is
// notes (phones, URLs, "statewide", ZIP-only) — have no entity and no
// step-1 link, so U3's unified catalog (which reads entities) cannot
// surface them at all. The cross-correlation re-run measured 476 of
// Alexander's audited document records sitting in exactly this gap.
//
// This is the SAME projection extended to the remainder, not a new
// invention: step 1's helpers are reused verbatim (org-name rescue,
// segment split/label-strip/classification, site-key normalization,
// stable-uuid identity, insert builders), and U2's tier discipline
// governs collisions with the existing catalog.
//
// Declared deterministic rules (design:
// luminari-recovery/step4-work/STEP4-DESIGN-2026-11-10.md):
//   - Population: classified-view rows whose civic_object_uid appears
//     in NO row of luminari_catalog_site_source_rows.
//   - Group key: normalized org name + ' @ ' + effective state, where
//     org name is step 1's pickOrgName and effective state is
//     state_code (uppercased) when it is a 2-letter code, else
//     jurisdiction when it is a 2-letter code, else 'US'.
//   - Categories: ONLY the revision table's reviewed output as carried
//     by the classified view (reviewed_primary_category /
//     reviewed_category_memberships). One distinct reviewed primary
//     across the group becomes the entity's primary; memberships are
//     the union minus the primary. No reviewed evidence => primary
//     NULL (UNREVIEWED) and empty memberships. Conflicting reviewed
//     primaries in one group => primary NULL, flagged.
//   - Names: the representative member's picked org name (members
//     sorted by civic_object_uid, first wins). UUID/artifact names
//     are NOT repaired; flagged name_unresolved in metadata and
//     counted in the census.
//   - Locations: one base location per distinct parsed address across
//     the group's rows. Parse cascade per segment (after step-1 split
//     + label-strip): (1) step-1's own site/mailing classification;
//     (2) note segments: cut at the first ' · ', strip one trailing
//     parenthetical and a trailing ', USA', then require step-1's
//     site test and a full component parse (street, city, state,
//     ZIP5). PO-Box text parses as a MAILING candidate. Coordinates
//     are always NULL (coordinate_quality
//     'not_geocoded_projection'); the geocoding wave follows.
//   - Tiers (U2 discipline, indexes from all existing catalog
//     locations), with ONE measured correction: U2's tier A merged
//     on address alone because its incoming unit was an OFFICE —
//     one building, one office. Step 4's unit is a program GROUP;
//     the dry-run census showed 118 address hits of which only 9
//     were name-equal — the other 109 are distinct programs sharing
//     an agency HQ address (Idaho SNAP / Medicaid / TANF / LIHEAP
//     all sit at IDHW's Boise address) or even different agencies
//     in one federal building. Address alone is not identity here.
//     Tier A therefore requires EXACT IDENTITY: a group location key
//     (state, ZIP5, normalized street) hits an existing location
//     AND the existing entity's normalized name equals the group's
//     normalized name => the whole group links to that entity
//     (smallest entity id); no entity, no locations. Address hits
//     without name equality neither merge nor hold: the group mints
//     its own entity and location rows (step 1's site key included
//     the name for exactly this reason), and the census reports the
//     count as address_shares_minted. Tier B — group name key
//     (state, the group's single distinct candidate city, normalized
//     name) hits an existing entity => HELD, listed, never
//     projected. Else mint.
//   - Identity: resource_entity_id =
//     luminari_stable_uuid_v1('catalog_remainder:' || group_key),
//     canonical_id 'crp_<state>_<sha256(group_key)[:20]>',
//     source_pk 'crp_<sha256(group_key)[:32]>', location source_pk
//     '<entity source_pk>_loc<n>' (n = candidate order).
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

export const PROJECTION_VERSION = "catalog_remainder_projection_v1";
export const SOURCE_TABLE = "catalog_remainder_projection_v1";
export const SOURCE_FAMILY_KEY = "catalog_remainder_projection";

const UUID_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PO_BOX_RE = /po box|p\.o\. box/i;
const STREET_CORE_RE = /\d+\s+[A-Za-z]/;
const ZIP_END_RE = /\d{5}(-\d{4})?\s*$|\d{5}(-\d{4})?\s*\([^)]*\)\s*$/;
const ZIP5_RE = /(\d{5})(-\d{4})?\s*(\([^)]*\)\s*)?$/;
const TRAILING_PAREN_RE = /\s*\([^)]*\)\s*$/;
const TRAILING_USA_RE = /,\s*USA\s*$/i;
const MIDDOT_RE = /\s+·\s+/;
const TWO_LETTER_RE = /^[A-Za-z]{2}$/;

/** Org-name selection, step 1's rule verbatim. */
export function pickOrgName(row) {
  const name = row.name ?? "";
  const org = (row.organization_name ?? "").trim();
  const needsRescue = UUID_NAME_RE.test(name) || name.startsWith("luminari-");
  if (needsRescue && org !== "") {
    return { name: org, unresolved: false };
  }
  return { name, unresolved: needsRescue };
}

/** Split a catalog address text into trimmed segments (step 1). */
export function splitSegments(address) {
  if (!address) return [];
  return String(address)
    .split(" | ")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Strip one leading "Label:" prefix (step 1). */
export function stripLabel(segment) {
  const idx = segment.indexOf(":");
  if (idx >= 0 && idx < 60) {
    return { label: segment.slice(0, idx).trim(), rest: segment.slice(idx + 1).trim() };
  }
  return { label: null, rest: segment };
}

/** Classify a label-stripped segment: 'mailing' | 'site' | 'note' (step 1). */
export function classifySegment(segment) {
  if (PO_BOX_RE.test(segment)) return "mailing";
  if (STREET_CORE_RE.test(segment) && ZIP_END_RE.test(segment)) return "site";
  return "note";
}

export function extractZip5(segment) {
  const m = ZIP5_RE.exec(segment);
  return m ? m[1] : null;
}

/** Census-identical text normalization for keys (step 1 / U2). */
export function normalizeForKey(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TAIL_COMMA_STATE_RE =
  /^(.*),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?$/;
const TAIL_SPACE_STATE_RE =
  /^(.*),\s*([^,]+?)\s+([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?$/;

/**
 * Best-effort component parse of a site/mailing segment (step 1).
 * Purely presentational; the group KEY never depends on it.
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

/** md5-based stable UUID, identical to luminari_stable_uuid_v1. */
export function stableUuid(value) {
  const h = createHash("md5").update(String(value)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Effective state for a remainder row: state_code when it is a
 * two-letter code, else jurisdiction when it is one, else 'US'.
 * (Rows with no state_code all carry jurisdiction 'US', measured
 * live 2026-11-10.)
 */
export function effectiveState(row) {
  const code = (row.state_code ?? "").trim().toUpperCase();
  if (TWO_LETTER_RE.test(code)) return code;
  const jur = (row.jurisdiction ?? "").trim().toUpperCase();
  if (TWO_LETTER_RE.test(jur)) return jur;
  return "US";
}

/** The deterministic group key for one remainder row. */
export function buildGroupKey(orgName, state) {
  return `${normalizeForKey(orgName)} @ ${String(state).toUpperCase()}`;
}

/**
 * Cleanup for cascade-2 note segments: cut trailing prose at the
 * first ' · ', strip one trailing parenthetical, strip a trailing
 * ', USA'. Declared and deterministic; mirrors the SQL census.
 */
export function cleanNoteSegment(segment) {
  let s = String(segment);
  const dot = s.search(MIDDOT_RE);
  if (dot >= 0) s = s.slice(0, dot);
  s = s.replace(TRAILING_PAREN_RE, "").trim();
  s = s.replace(TRAILING_USA_RE, "").trim();
  return s;
}

/**
 * Parse one label-stripped segment into an address candidate, or
 * null. Cascade 1 is step 1's own classification; cascade 2 is the
 * note-segment cleanup above. Both require a FULL component parse
 * (street, city, state, ZIP5); a PO-Box candidate is mailing, a
 * street candidate physical. Pure.
 */
export function parseAddressCandidate(segment) {
  const kind0 = classifySegment(segment);
  if (kind0 === "site" || kind0 === "mailing") {
    const c = parseComponents(segment);
    if (c.street && c.city && c.state && c.zip5) {
      return { ...c, kind: kind0 === "mailing" ? "mailing" : "physical", via: "step1_rule" };
    }
    return null;
  }
  const cleaned = cleanNoteSegment(segment);
  if (!cleaned) return null;
  const isMailing = PO_BOX_RE.test(cleaned);
  if (!isMailing && !ZIP_END_RE.test(cleaned)) return null;
  const c = parseComponents(cleaned);
  if (!c.street || !c.city || !c.state || !c.zip5) return null;
  // A physical candidate's street must open with a house number.
  // (Step 1's street-core test — digits, space, letter — is NOT
  // reused as this gate: it rejects numbered streets outright,
  // e.g. "101 12th Avenue" and "436 4th Ave", which are a measured
  // share of why these rows are in the remainder at all.)
  if (!isMailing && !/^\d/.test(c.street)) return null;
  return { ...c, kind: isMailing ? "mailing" : "physical", via: "extended_parse" };
}

/** Tier A key: state + ZIP5 + normalized street (U2). Null unless complete. */
export function buildTierKey(state, zip5, street) {
  if (!state || !zip5 || !street) return null;
  const nStreet = normalizeForKey(street);
  if (nStreet === "") return null;
  return `${String(state).toUpperCase()}|${zip5}|${nStreet}`;
}

/** Tier B key: state + normalized city + normalized name (U2). */
export function buildNameKey(state, city, name) {
  if (!state || !city || !name) return null;
  const nCity = normalizeForKey(city);
  const nName = normalizeForKey(name);
  if (nCity === "" || nName === "") return null;
  return `${String(state).toUpperCase()}|${nCity}|${nName}`;
}

/** Review aggregation for one group: single distinct reviewed primary wins. */
export function aggregateReview(members) {
  const primaries = [...new Set(members.map((m) => m.reviewed_primary_category).filter(Boolean))];
  const membershipSet = new Set();
  for (const m of members) {
    for (const c of m.reviewed_category_memberships ?? []) {
      if (typeof c === "string" && c !== "") membershipSet.add(c);
    }
  }
  if (primaries.length === 1) {
    const primary = primaries[0];
    membershipSet.delete(primary);
    return { primary, memberships: [...membershipSet].sort(), conflict: false };
  }
  return { primary: null, memberships: [], conflict: primaries.length > 1 };
}

/**
 * Group remainder rows by (normalized org name, effective state).
 * Pure and deterministic: members are sorted by civic_object_uid and
 * the representative is the first member, so the same input rows
 * always yield the same groups.
 */
export function groupRows(rows) {
  const census = {
    rows: rows.length,
    rows_with_address_text: 0,
    segments: 0,
    step1_rule_segments: 0,
    extended_parse_candidates: 0,
    name_unresolved_rows: 0,
    reviewed_rows: 0,
  };
  const groups = new Map(); // group_key -> group
  for (const row of rows) {
    const picked = pickOrgName(row);
    if (picked.unresolved) census.name_unresolved_rows += 1;
    if (row.reviewed_primary_category) census.reviewed_rows += 1;
    const state = effectiveState(row);
    const key = buildGroupKey(picked.name, state);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        state,
        org_name: picked.name,
        members: [],
        candidates: new Map(), // (norm street, zip5) -> candidate
      });
    }
    const group = groups.get(key);
    const segments = splitSegments(row.address);
    if (segments.length > 0) census.rows_with_address_text += 1;
    for (const rawSegment of segments) {
      census.segments += 1;
      const { rest } = stripLabel(rawSegment);
      const cand = parseAddressCandidate(rest);
      if (!cand) continue;
      if (cand.via === "step1_rule") census.step1_rule_segments += 1;
      else census.extended_parse_candidates += 1;
      const candKey = `${normalizeForKey(cand.street)}|${cand.zip5}`;
      if (!group.candidates.has(candKey)) {
        group.candidates.set(candKey, { ...cand, segment_text: rest });
      }
    }
    group.members.push({
      civic_object_uid: row.civic_object_uid,
      object_ref: row.object_ref ?? null,
      artifact_key: row.artifact_key ?? null,
      source_content_sha256: row.source_content_sha256 ?? null,
      address: row.address ?? null,
      phone: row.phone ?? null,
      website_url: row.website_url ?? null,
      org_name: picked.name,
      name_unresolved: picked.unresolved,
      state_code: row.state_code ?? null,
      jurisdiction: row.jurisdiction ?? null,
      section_name: row.section_name ?? null,
      category: row.category ?? null,
      layer: row.layer ?? null,
      reviewed_primary_category: row.reviewed_primary_category ?? null,
      reviewed_category_memberships: Array.isArray(row.reviewed_category_memberships)
        ? row.reviewed_category_memberships
        : [],
    });
  }
  const groupList = [];
  for (const group of groups.values()) {
    group.members.sort((a, b) =>
      a.civic_object_uid < b.civic_object_uid ? -1 : a.civic_object_uid > b.civic_object_uid ? 1 : 0,
    );
    const rep = group.members[0];
    const review = aggregateReview(group.members);
    const sha = createHash("sha256").update(group.key).digest("hex");
    const locations = [...group.candidates.values()].sort((a, b) =>
      a.zip5 < b.zip5 ? -1 : a.zip5 > b.zip5 ? 1 : normalizeForKey(a.street) < normalizeForKey(b.street) ? -1 : 1,
    );
    const cities = [...new Set(locations.map((l) => l.city))];
    groupList.push({
      key: group.key,
      state: group.state,
      org_name: rep.org_name,
      name_unresolved: group.members.some((m) => m.name_unresolved),
      entity_id: stableUuid(`catalog_remainder:${group.key}`),
      canonical_id: `crp_${group.state.toLowerCase()}_${sha.slice(0, 20)}`,
      source_pk: `crp_${sha.slice(0, 32)}`,
      primary: review.primary,
      memberships: review.memberships,
      category_conflict: review.conflict,
      label: rep.section_name,
      jurisdiction: rep.jurisdiction,
      layer: rep.layer,
      phone: rep.phone,
      website_url: rep.website_url,
      members: group.members,
      locations,
      cities,
      representative_uid: rep.civic_object_uid,
    });
  }
  groupList.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  census.groups = groupList.length;
  census.groups_with_locations = groupList.filter((g) => g.locations.length > 0).length;
  census.locations_total = groupList.reduce((n, g) => n + g.locations.length, 0);
  census.locations_physical = groupList.reduce(
    (n, g) => n + g.locations.filter((l) => l.kind === "physical").length, 0,
  );
  census.locations_mailing = census.locations_total - census.locations_physical;
  census.name_unresolved_groups = groupList.filter((g) => g.name_unresolved).length;
  census.reviewed_groups = groupList.filter((g) => g.primary !== null).length;
  census.category_conflicts = groupList.filter((g) => g.category_conflict).length;
  return { census, groups: groupList };
}

/**
 * Project groups against the existing catalog locations (U2's tier
 * discipline). existingLocations: rows of { resource_entity_id,
 * canonical_id, resource_name, address_line1, city, state,
 * postal_code } for every catalog location that carries a street
 * address. Deterministic: groups are processed in group-key order
 * and every tie is broken by the smallest entity id.
 */
export function projectGroups(groups, existingLocations) {
  const tierIndex = new Map(); // tierKey -> Set<entity_id>
  const nameIndex = new Map(); // nameKey -> Set<entity_id>
  const canonicalByEntity = new Map();
  const nameByEntity = new Map();
  for (const loc of existingLocations) {
    canonicalByEntity.set(loc.resource_entity_id, loc.canonical_id ?? null);
    nameByEntity.set(loc.resource_entity_id, loc.resource_name ?? null);
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

  const census = {
    groups: groups.length,
    minted: 0,
    tier_a_merges: 0,
    tier_b_held: 0,
    address_shares_minted: 0,
    locations_written: 0,
    locations_physical_written: 0,
    locations_mailing_written: 0,
    category_distribution: {},
    membership_distribution: {},
  };
  const mints = [];
  const merges = [];
  const held = [];
  const manifestLines = [];

  for (const group of groups) {
    // Tier A: EXACT IDENTITY — a candidate location keys to an
    // existing location AND that entity's normalized name equals
    // the group's normalized name. Address hits without name
    // equality are counted (address_shares) but never merge.
    const groupNameKey = normalizeForKey(group.org_name);
    let target = null;
    let addressHit = false;
    for (const loc of group.locations) {
      const tk = buildTierKey(loc.state, loc.zip5, loc.street);
      if (tk && tierIndex.has(tk)) {
        addressHit = true;
        for (const entityId of tierIndex.get(tk)) {
          if (normalizeForKey(nameByEntity.get(entityId) ?? "") === groupNameKey) {
            if (target === null || entityId < target) target = entityId;
          }
        }
      }
    }
    if (target !== null) {
      census.tier_a_merges += 1;
      merges.push({
        group_key: group.key,
        org_name: group.org_name,
        state: group.state,
        target_entity_id: target,
        target_canonical_id: canonicalByEntity.get(target) ?? null,
        group,
      });
      manifestLines.push(`${group.key}|tier_a_merge|${target}`);
      continue;
    }
    // Tier B: one distinct candidate city + name + state.
    if (group.cities.length === 1) {
      const nk = buildNameKey(group.state, group.cities[0], group.org_name);
      if (nk && nameIndex.has(nk)) {
        census.tier_b_held += 1;
        held.push({
          group_key: group.key,
          org_name: group.org_name,
          state: group.state,
          city: group.cities[0],
          matched_entity_ids: [...nameIndex.get(nk)].sort(),
          name_key: nk,
        });
        manifestLines.push(`${group.key}|tier_b_held|`);
        continue;
      }
    }
    mints.push(group);
    census.minted += 1;
    if (addressHit) census.address_shares_minted += 1;
    census.locations_written += group.locations.length;
    census.locations_physical_written += group.locations.filter((l) => l.kind === "physical").length;
    census.locations_mailing_written += group.locations.filter((l) => l.kind === "mailing").length;
    const cat = group.primary ?? "unreviewed";
    census.category_distribution[cat] = (census.category_distribution[cat] ?? 0) + 1;
    for (const m of group.memberships) {
      census.membership_distribution[m] = (census.membership_distribution[m] ?? 0) + 1;
    }
    manifestLines.push(`${group.key}|minted|${group.entity_id}`);
  }
  census.tier_a_merge_list = merges;
  census.tier_b_held_list = held;
  const manifestSha = createHash("sha256").update(manifestLines.join("\n")).digest("hex");
  return { census, mints, merges, held, manifestSha };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const FETCH_REMAINDER_SQL = `
  select civic_object_uid, object_ref, artifact_key, source_content_sha256,
         name, organization_name, state_code, jurisdiction, section_name,
         address, phone, website_url, category, layer,
         reviewed_primary_category, reviewed_category_memberships
    from public.v_lighthouse_resource_program_classified_v1 v
   where not exists (
     select 1 from public.luminari_catalog_site_source_rows l
      where l.civic_object_uid = v.civic_object_uid)
   order by civic_object_uid
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
  const rows = (await client.query(FETCH_REMAINDER_SQL)).rows;
  const existing = (await client.query(FETCH_EXISTING_SQL)).rows;
  return { rows, existing };
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
  mints.forEach((g, i) => {
    const b = i * ENTITY_INSERT_COLUMNS.length;
    const slots = ENTITY_INSERT_COLUMNS.map(
      (col, j) => `$${b + j + 1}${ENTITY_CASTS[col] ?? ""}`,
    );
    values.push(`(${slots.join(",")})`);
    params.push(
      g.entity_id,
      g.canonical_id,
      SOURCE_FAMILY_KEY,
      SOURCE_TABLE,
      g.source_pk,
      null, // source_hash: the group key hash lives in source_pk; no single source hash exists
      g.org_name,
      "projected_record",
      g.primary,
      g.memberships,
      g.layer ?? null,
      g.jurisdiction ?? null,
      g.state,
      null, // county: remainder rows carry no county
      g.cities.length === 1 ? g.cities[0] : null,
      "source_attached",
      "review_ready",
      "staging_provenance_attached",
      JSON.stringify({
        projection_version: PROJECTION_VERSION,
        group_key: g.key,
        source_row_count: g.members.length,
        name_unresolved: g.name_unresolved,
        category_conflict: g.category_conflict,
        reviewed: g.primary !== null,
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
 * Flatten minted groups into (group, location, suffix) rows. The
 * suffix is the location's 1-based position in its group's sorted
 * candidate order, so a location's source_pk is identical no matter
 * how the write is chunked.
 */
export function flattenLocationRows(mints) {
  const rows = [];
  for (const g of mints) {
    g.locations.forEach((loc, n) => rows.push({ group: g, loc, suffix: n + 1 }));
  }
  return rows;
}

/**
 * Build the base-location insert for flattened location rows (pure;
 * unit-tested). Mirrors step 1/U2: each VALUES tuple supplies
 * exactly the parameterized columns named by the derived-table
 * alias list; the remaining destination column (country) is a
 * derived literal in the SELECT list. UUID, numeric, and JSONB
 * parameters are cast explicitly. Locations are never geocoded by
 * this runner: latitude/longitude are always null.
 */
export function buildLocationInsert(locRows) {
  const values = [];
  const params = [];
  locRows.forEach(({ group: g, loc, suffix }) => {
    const b = values.length * LOCATION_VALUE_COLUMNS.length;
    const slots = LOCATION_VALUE_COLUMNS.map(
      (col, j) => `$${b + j + 1}${LOCATION_CASTS[col] ?? ""}`,
    );
    values.push(`(${slots.join(",")})`);
    params.push(
      g.entity_id,
      loc.street,
      null, // address_line2
      loc.city,
      null, // county
      loc.state,
      loc.zip5,
      null, // latitude: never geocoded here
      null, // longitude: never geocoded here
      "not_geocoded_projection",
      null, // geocode_source
      SOURCE_TABLE,
      `${g.source_pk}_loc${suffix}`,
      JSON.stringify({
        projection_version: PROJECTION_VERSION,
        group_key: g.key,
        site_kind: loc.kind,
        parse_via: loc.via,
      }),
    );
  });
  if (values.length === 0) return null;
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
  "resource_entity_id",
  "civic_object_uid",
  "object_ref",
  "artifact_key",
  "source_content_sha256",
  "address_text",
  "match_kind",
  "projection_version",
];

/**
 * Build the link insert for mints + tier-A merges (pure; unit-tested).
 * One link row per member row of each projected group.
 */
export function buildLinkInsert(mints, merges) {
  const rows = [];
  for (const g of mints) {
    for (const m of g.members) {
      rows.push({ entity_id: g.entity_id, member: m, kind: "minted" });
    }
  }
  for (const mg of merges) {
    const group = mg.group;
    for (const m of group.members) {
      rows.push({ entity_id: mg.target_entity_id, member: m, kind: "tier_a_merge" });
    }
  }
  if (rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * LINK_INSERT_COLUMNS.length;
    values.push(`($${b + 1}::uuid,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`);
    params.push(
      r.entity_id,
      r.member.civic_object_uid,
      r.member.object_ref,
      r.member.artifact_key,
      r.member.source_content_sha256,
      r.member.address,
      r.kind,
      PROJECTION_VERSION,
    );
  });
  const text = `
    insert into public.luminari_catalog_remainder_source_rows
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
  // Locations: chunk the flattened rows so one batch never crosses
  // the parameter cap; suffixes come from flattenLocationRows, so
  // chunk boundaries cannot change a location's source_pk.
  for (const batch of chunk(flattenLocationRows(mints), 250)) {
    const built = buildLocationInsert(batch);
    if (!built) continue;
    const res = await client.query(built.text, built.params);
    locations += res.rowCount;
  }
  for (const batch of chunk(mints, 500)) {
    const built = buildLinkInsert(batch, []);
    if (!built) continue;
    const res = await client.query(built.text, built.params);
    links += res.rowCount;
  }
  for (const batch of chunk(merges, 500)) {
    const built = buildLinkInsert([], batch);
    if (!built) continue;
    const res = await client.query(built.text, built.params);
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
    const { rows, existing } = await fetchRows(client);
    const { census: groupCensus, groups } = groupRows(rows);
    const { census, mints, merges, manifestSha } = projectGroups(groups, existing);
    const fullCensus = { ...groupCensus, ...census };
    console.log(JSON.stringify({ census: fullCensus, manifest_sha256: manifestSha }));
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
