// Bundle decomposition v1 — split catalog bundle entities into one
// catalog entity per constituent program name.
//
// Why: step 1 / step 4 grouped classified rows by the registry
// document's artifact name, so one entity swallowed every program on
// the document. The naming-repair census counted 122 such bundle
// entities (conflict_identity); the bundle census
// (luminari-recovery/bundle-decomposition/REPORT.md, measured
// read-only 2026-11-11) attributed all 1,298 of their linked rows
// to 641 constituent program names and classified each bundle's
// decomposition shape. Wave 1 is the mechanical universe: 40
// bundles (2 clean splits, 38 shared-site splits) carrying 95
// names and 190 fully attributed rows. The other 82 bundles need
// recorded judgments and are NOT in this wave; the WA 217-name
// bundle is its own wave.
//
// The approved set is embedded in this repository as
// scripts/bundle-decomposition-proposals-v1.json so the run is
// reproducible from the repo alone. The derivation that produced it
// lives in luminari-recovery/bundle-apply/derivation/
// (derive_proposals.py, run twice, byte-identical).
//
// Declared deterministic rules:
//   - Identity: one minted entity per constituent name (post pair
//     decisions): canonical_id
//     'bdp_<state>_<sha256(bundle_canonical_id | norm_name)[:20]>',
//     resource_entity_id =
//     luminari_stable_uuid_v1('bundle_decomposition:' ||
//     bundle_canonical_id || ':' || norm_name), source_table
//     'bundle_decomposition_v1', source_pk = the canonical_id.
//     resource_category stays NULL (UNREVIEWED) — categorization is
//     the category pass's job, not smuggled into a decomposition —
//     and service_categories is empty, exactly the step-4 shape for
//     an unreviewed projected record.
//   - Variant pairs (recomputed here from the embedded names and
//     their rows' contacts, and cross-checked against the embedded
//     pair decisions — a mismatch is a build failure, never a
//     silent divergence): a same-core pair (parentheticals and dash
//     qualifiers stripped, cores equal) merges into ONE minted
//     entity — the fuller phrasing kept, the other recorded as
//     merged_into in the ledger evidence — ONLY when the two names'
//     rows carry the same phone AND the same website. A same-core
//     pair whose contacts disagree is HELD (both names), as is any
//     stem-shared pair: merge-vs-split for those is a content
//     judgment about real organizations, decided pair by pair in a
//     later wave. Inside wave 1's 40 bundles the census found no
//     variant pairs at all (re-derived here), so wave 1 mints 95.
//   - Locations per shape (NEVER a sibling bundle's pin):
//     shared_site_split — the bundle's location rows are cloned to
//     EVERY minted entity (same address/coordinates, new
//     location_id per entity); clean_split — a name gets clones of
//     the bundle location rows whose site key matches the name's
//     own site keys, and a name whose workbook address matches no
//     bundle location gets a fresh base location built from its own
//     row's address (coordinates NULL until the geocode wave). A
//     bundle with no location rows at all mints fresh base
//     locations from each name's own parseable address; a name
//     with no parseable address mints location-less.
//   - Shell retirement: after a bundle's mints, locations, links,
//     and ledger rows verify inside its transaction, a
//     luminari_resource_publication_resolutions row retires the
//     shell with publication_status 'inactive' and a review_note
//     naming the minted successors. The unified corpus already
//     excludes inactive resolutions, so the shell leaves
//     person-facing surfaces while the entity row, its original
//     link rows, and its history remain — retirement is a
//     resolution, not a deletion, reversible by flipping it back.
//   - Drift guards (per bundle, checked at plan time and re-
//     checked by the writes' row counts): the bundle entity still
//     exists with the census current_name; its link-row uid set
//     still equals the census set; its location rows still match
//     the census descriptors (ids + site keys); no publication
//     resolution exists for it; no minted canonical already
//     exists. A bundle whose current state is the fully decomposed
//     one (ledger rows + inactive resolution + all minted
//     canonicals present) counts as already_applied (re-runnable);
//     any other deviation is drift — skipped, never forced.
//   - Write order per bundle, one transaction per bundle: ledger
//     mint rows FIRST, then entity inserts, location inserts, link
//     inserts, the ledger shell row, then the publication
//     resolution. Any short row count rolls the bundle back and
//     aborts the run.
//   - Manifest: sha256 over the sorted
//     "bundle_entity_id|norm_name" lines of the minted entities
//     (post-merge; the kept name's norm). The dry run prints it;
//     the staged wave-1 set expects
//     2e5e96fd4187fd82da0ee641e8f664eaf7469b370fa7d496965c029c4d84de95
//     for the embedded v1 set (40 bundles / 95 minted entities).
//
// Dry run by default; --apply writes. Re-runnable: every insert is
// conflict-guarded and already-decomposed bundles classify as
// already_applied instead of drift.
//
// Contacts note (honest limitation): person-facing contacts come
// from luminari_resource_contact_points keyed by resource_entity_id
// — the 40 bundle entities carry ZERO contact points today, so the
// split loses nothing on that surface. A minted entity's phone /
// website evidence is preserved in its re-pointed link rows and in
// the ledger's attribution evidence; contact-point creation for
// minted entities is a separate, later step, exactly as it was for
// the step-1 / step-4 projections (whose entities also carry no
// contact points of their own).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

function loadPg() {
  return import("pg").catch(() => {
    throw new Error(
      "The 'pg' package is unavailable. Run inside the luminari service environment (Render job) where pg is installed.",
    );
  });
}

export const DECOMPOSITION_VERSION = "bundle_decomposition_v1";
export const SOURCE_TABLE = "bundle_decomposition_v1";
export const SOURCE_FAMILY_KEY = "bundle_decomposition";
export const BATCH_ID = "bundle_decomposition_v1:wave1";

/** Shapes the wave-1 filter approves. */
export const APPROVED_SHAPES = ["clean_split", "shared_site_split"];

// ---------------------------------------------------------------------------
// Census semantics — mirrored verbatim from
// bundle-decomposition/build_census.py so the runner re-derives what
// the derivation pinned, instead of trusting it blind.
// ---------------------------------------------------------------------------

export function normName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function coreName(value) {
  const stripped = String(value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+[—–]\s+/)[0];
  return normName(stripped);
}

const NAME_STOP = new Set(
  "the of and for a an in at to program programs service services inc llc".split(" "),
);

export function nameTokens(value) {
  const lowered = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ");
  return new Set(
    lowered.split(/\s+/).filter((t) => t !== "" && !NAME_STOP.has(t)),
  );
}

/** The census's variant-pair test: token Jaccard >= 0.6 or subset. */
export function isVariantPair(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  const subset = [...ta].every((t) => tb.has(t)) || [...tb].every((t) => ta.has(t));
  return jaccard >= 0.6 || subset;
}

/** 'same_core' | 'stem_shared' | null (not a variant pair). */
export function classifyPair(a, b) {
  if (!isVariantPair(a, b)) return null;
  return coreName(a) === coreName(b) ? "same_core" : "stem_shared";
}

export function phone10(value) {
  if (value == null) return null;
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

export function domainOf(value) {
  if (value == null) return null;
  let url = String(value).trim().toLowerCase();
  url = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const domain = url.split("/")[0].split("?")[0].trim();
  return domain === "" ? null : domain;
}

/** Contact agreement for a merge: same phone set (non-empty) AND same website-domain set. */
export function contactsAgree(rowsA, rowsB) {
  const phones = (rows) =>
    new Set(rows.map((r) => phone10(r.phone)).filter((v) => v !== null));
  const domains = (rows) =>
    new Set(rows.map((r) => domainOf(r.website)).filter((v) => v !== null));
  const pa = phones(rowsA);
  const pb = phones(rowsB);
  const da = domains(rowsA);
  const db = domains(rowsB);
  const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
  return pa.size > 0 && sameSet(pa, pb) && sameSet(da, db);
}

export function normAddrKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SITE_SUFFIX = new Set([
  "st", "street", "ave", "avenue", "blvd", "rd", "road", "dr", "drive",
  "ln", "lane", "ct", "court", "way", "hwy", "highway", "cir", "pl",
  "sq", "ter", "trl", "box", "pkwy", "aly",
]);

/** Site identity from a normalized address string (census rule). */
export function siteKey(normkey) {
  if (!normkey) return null;
  const toks = normkey.split(" ");
  const hasDigit = toks.some((t) => /^\d+$/.test(t));
  const hasSuffix = toks.some((t) => SITE_SUFFIX.has(t));
  if (!hasDigit && !hasSuffix) return null;
  for (let i = 0; i < toks.length; i += 1) {
    if (SITE_SUFFIX.has(toks[i])) {
      const end = toks[i] === "box" && i + 1 < toks.length ? i + 2 : i + 1;
      return toks.slice(0, end).join(" ");
    }
  }
  return toks.slice(0, 3).join(" ");
}

/** md5-based stable UUID, identical to luminari_stable_uuid_v1 (verified live). */
export function stableUuid(value) {
  const h = createHash("md5").update(String(value)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function mintedCanonicalFor(bundleCanonicalId, state, norm) {
  const sha = createHash("sha256")
    .update(`${bundleCanonicalId}|${norm}`)
    .digest("hex");
  return `bdp_${String(state).toLowerCase()}_${sha.slice(0, 20)}`;
}

export function mintedEntityIdFor(bundleCanonicalId, norm) {
  return stableUuid(`bundle_decomposition:${bundleCanonicalId}:${norm}`);
}

// ---------------------------------------------------------------------------
// Person-facing name test — mirrored from
// server/services/resource-directory-unified.ts (is_human_display_name),
// current main rule: the 'enriched' clause is the delimited-token
// shape (PR #798), not the blanket word.
// ---------------------------------------------------------------------------

const UUID_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARE_HEX_NAME_PATTERN = /^[0-9a-f]{24,}$/i;
const ARTIFACT_PREFIX_PATTERN = /^luminari[-_]/i;
const ARTIFACT_ENRICHED_PATTERN = /(^|[-_])enriched([-_]|$)/i;

export function passesPersonFacingNameTest(value) {
  if (value == null) return false;
  const name = String(value).trim();
  if (!name) return false;
  if (UUID_NAME_PATTERN.test(name)) return false;
  if (BARE_HEX_NAME_PATTERN.test(name)) return false;
  if (ARTIFACT_PREFIX_PATTERN.test(name)) return false;
  if (ARTIFACT_ENRICHED_PATTERN.test(name)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Fresh-address parse (mirror of the derivation's parse_address).
// The street gate accepts a leading house number or any street-suffix
// token; the census suffix set is widened by 'plaza'/'hill' because
// "One Cooper Plaza" / "One Capitol Hill" are real street addresses
// in the clean-split bundles with no leading house number.
// ---------------------------------------------------------------------------

const PARSE_SUFFIX = new Set([...SITE_SUFFIX, "plaza", "hill"]);
const ADDRESS_RE = /^(.*?),\s*([^,]+?)\s+([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?(?!\d)/;

export function parseAddressComponents(text) {
  if (text == null) return null;
  const m = ADDRESS_RE.exec(String(text).trim());
  if (!m) return null;
  const street = m[1].trim();
  const city = m[2].trim();
  const state = m[3].toUpperCase();
  const zip5 = m[4];
  if (!street || !city) return null;
  const toks = street
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t !== "");
  if (toks.length === 0) return null;
  if (!/^\d+$/.test(toks[0]) && !toks.some((t) => PARSE_SUFFIX.has(t))) return null;
  return { street, city, state, zip5 };
}

// ---------------------------------------------------------------------------
// Pure planning (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Plan the variant-pair disposition for one bundle's names.
 * nameRecords: [{ program_name, rows: [{uid, phone, website}] }].
 * A same-core pair merges ONLY when the contacts agree; a name in
 * any non-mergeable pair (same-core with disagreeing contacts, or
 * stem-shared) is HELD with its reasons. Merge groups form only
 * among names with no held pair. The kept name is the fuller
 * phrasing (longer trimmed length; tie -> lexicographically
 * smaller). Output mints carry the union of the members' rows,
 * sorted by uid, so the apply is deterministic.
 */
export function planVariantPairs(nameRecords) {
  const records = (nameRecords ?? []).map((r) => ({
    program_name: r.program_name,
    rows: (r.rows ?? []).map((row) => ({
      uid: row.uid,
      phone: row.phone ?? "",
      website: row.website ?? "",
    })),
  }));
  const byName = new Map(records.map((r) => [r.program_name, r]));
  const heldReasons = new Map(); // name -> Set<reason>
  const mergePairs = [];
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const a = records[i];
      const b = records[j];
      const kind = classifyPair(a.program_name, b.program_name);
      if (kind === null) continue;
      if (kind === "stem_shared") {
        for (const n of [a.program_name, b.program_name]) {
          if (!heldReasons.has(n)) heldReasons.set(n, new Set());
          heldReasons.get(n).add("variant_pair_stem_shared");
        }
        continue;
      }
      if (contactsAgree(a.rows, b.rows)) {
        mergePairs.push([a.program_name, b.program_name]);
      } else {
        for (const n of [a.program_name, b.program_name]) {
          if (!heldReasons.has(n)) heldReasons.set(n, new Set());
          heldReasons.get(n).add("variant_pair_contacts_disagree");
        }
      }
    }
  }
  // Union-find over mergeable pairs, excluding any held name.
  const parent = new Map(records.map((r) => [r.program_name, r.program_name]));
  const find = (x) => {
    let p = parent.get(x);
    while (parent.get(p) !== p) p = parent.get(p);
    return p;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const [a, b] of mergePairs) {
    if (!heldReasons.has(a) && !heldReasons.has(b)) union(a, b);
  }
  const groups = new Map();
  for (const r of records) {
    if (heldReasons.has(r.program_name)) continue;
    const root = find(r.program_name);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(r.program_name);
  }
  const fuller = (a, b) => {
    const la = a.trim().length;
    const lb = b.trim().length;
    if (la !== lb) return la > lb ? a : b;
    return a < b ? a : b;
  };
  const mints = [];
  for (const members of groups.values()) {
    const kept = members.reduce((best, n) => (best === null ? n : fuller(best, n)), null);
    const absorbed = members.filter((n) => n !== kept).sort();
    const rows = members
      .flatMap((n) => byName.get(n).rows)
      .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
    mints.push({ program_name: kept, absorbed_names: absorbed, rows });
  }
  mints.sort((a, b) => (normName(a.program_name) < normName(b.program_name) ? -1 : 1));
  const held = [...heldReasons.entries()]
    .map(([program_name, reasons]) => ({
      program_name,
      reasons: [...reasons].sort(),
      reason: [...reasons].sort()[0],
    }))
    .sort((a, b) => (normName(a.program_name) < normName(b.program_name) ? -1 : 1));
  return { mints, held };
}

/**
 * Filter raw proposal bundles to the wave-1 apply set. A bundle is
 * approved only when its shape is mechanical, every name has at
 * least one attributed row, attributed == total rows, and it
 * carries no held (unattributable) rows. Everything else is
 * returned with its exclusion reason — the wave boundary, enforced
 * again at runtime.
 */
export function filterWave1Bundles(proposals) {
  const approved = [];
  const excluded = [];
  for (const bundle of proposals ?? []) {
    const id = bundle?.bundle_entity_id ?? null;
    if (!id || !bundle.bundle_canonical_id || !bundle.state || !bundle.current_name) {
      excluded.push({ bundle_entity_id: id, reason: "missing_fields" });
      continue;
    }
    if (!APPROVED_SHAPES.includes(bundle.shape)) {
      excluded.push({ bundle_entity_id: id, reason: "shape_not_mechanical" });
      continue;
    }
    if (Array.isArray(bundle.held_rows) && bundle.held_rows.length > 0) {
      excluded.push({ bundle_entity_id: id, reason: "unattributable_rows_present" });
      continue;
    }
    const names = bundle.names ?? [];
    if (names.length === 0) {
      excluded.push({ bundle_entity_id: id, reason: "no_names" });
      continue;
    }
    const nameless = names.some((n) => !n.program_name || !Array.isArray(n.rows) || n.rows.length === 0);
    if (nameless) {
      excluded.push({ bundle_entity_id: id, reason: "name_without_rows" });
      continue;
    }
    if (bundle.n_attributed !== bundle.n_rows_total) {
      excluded.push({ bundle_entity_id: id, reason: "attribution_incomplete" });
      continue;
    }
    approved.push(bundle);
  }
  return { approved, excluded };
}

/**
 * Assign locations for one minted entity, given the bundle's
 * location descriptors (each {location_id, site_key, has_coords,
 * city}) and the mint's site keys + own address text.
 * Returns { clone_indices, fresh } where fresh is a parsed address
 * object or null. Shared-site bundles clone every location; clean
 * splits clone only site-key matches and build a fresh base
 * location when nothing matches; a bundle with no locations mints
 * fresh base locations from each name's own parseable address.
 */
export function assignLocations(bundle, mint) {
  const descriptors = bundle.location_descriptors ?? [];
  const sites = new Set(mint.site_keys ?? []);
  if (bundle.shape === "shared_site_split") {
    if (descriptors.length > 0) {
      return { clone_indices: descriptors.map((_, i) => i), fresh: null };
    }
    return { clone_indices: [], fresh: parseAddressComponents(mint.own_address_text) };
  }
  // clean_split
  const matched = [];
  descriptors.forEach((d, i) => {
    if (d.site_key !== null && sites.has(d.site_key)) matched.push(i);
  });
  if (matched.length > 0) return { clone_indices: matched, fresh: null };
  return { clone_indices: [], fresh: parseAddressComponents(mint.own_address_text) };
}

/** sha256 over the sorted "bundle_entity_id|norm_name" lines of the minted entities. */
export function manifestFor(mintRecords) {
  const lines = (mintRecords ?? [])
    .map((r) => `${r.bundle_entity_id}|${r.norm_name}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/**
 * Cross-check the recomputed variant plan against the embedded
 * records: for every planned mint, the embedded record for the kept
 * name must carry exactly the recomputed minted identity and the
 * recorded merged_from list. A mismatch throws — the runner never
 * applies a plan the census did not pin.
 */
export function verifyEmbeddedMints(bundle, mints) {
  const byNorm = new Map(
    (bundle.names ?? []).map((n) => [normName(n.program_name), n]),
  );
  for (const mint of mints) {
    const rec = byNorm.get(normName(mint.program_name));
    if (!rec) {
      throw new Error(
        `bundle ${bundle.bundle_entity_id}: planned mint '${mint.program_name}' has no embedded record`,
      );
    }
    const expectId = mintedEntityIdFor(bundle.bundle_canonical_id, normName(mint.program_name));
    const expectCanonical = mintedCanonicalFor(
      bundle.bundle_canonical_id,
      bundle.state,
      normName(mint.program_name),
    );
    if (rec.minted_entity_id !== expectId || rec.minted_canonical_id !== expectCanonical) {
      throw new Error(
        `bundle ${bundle.bundle_entity_id}: embedded identity for '${mint.program_name}' does not match the recomputed identity`,
      );
    }
    const embeddedFrom = [...(rec.merged_from ?? [])].sort();
    if (JSON.stringify(embeddedFrom) !== JSON.stringify([...mint.absorbed_names].sort())) {
      throw new Error(
        `bundle ${bundle.bundle_entity_id}: embedded merged_from for '${mint.program_name}' does not match the recomputed variant plan`,
      );
    }
  }
  return true;
}

/**
 * Plan the wave against CURRENT production state (the drift
 * guards). live: {
 *   entitiesById: Map(id -> entity row),
 *   linksByBundle: Map(bundle_id -> Map(uid -> link row)),
 *   locationsByBundle: Map(bundle_id -> [location row]),
 *   resolutionsById: Map(bundle_id -> publication_status),
 *   ledgerBundleIds: Set(bundle_id),
 *   entitiesByCanonical: Map(canonical_id -> entity row),
 * }
 * mintsByBundle: Map(bundle_id -> {mints, held}) from
 * planVariantPairs + verifyEmbeddedMints. Pure and deterministic.
 */
export function planDecomposition(approved, live, mintsByBundle) {
  const planned = [];
  const alreadyApplied = [];
  const drift = [];
  const missing = [];
  for (const bundle of approved) {
    const id = bundle.bundle_entity_id;
    const { mints, held } = mintsByBundle.get(id);
    if (held.length > 0) {
      drift.push({ bundle_entity_id: id, reason: "variant_names_held", held });
      continue;
    }
    const attributionByUid = new Map();
    for (const n of bundle.names ?? []) {
      for (const r of n.rows ?? []) attributionByUid.set(r.uid, r);
    }
    const mintRecords = mints.map((mint) => {
      const norm = normName(mint.program_name);
      const rec = (bundle.names ?? []).find(
        (n) => normName(n.program_name) === norm,
      );
      return {
        bundle_entity_id: id,
        program_name: mint.program_name,
        norm_name: norm,
        minted_entity_id: mintedEntityIdFor(bundle.bundle_canonical_id, norm),
        minted_canonical_id: mintedCanonicalFor(bundle.bundle_canonical_id, bundle.state, norm),
        absorbed_names: mint.absorbed_names,
        rows: mint.rows.map((row) => {
          const embedded = attributionByUid.get(row.uid);
          return {
            uid: row.uid,
            sheet: embedded?.sheet ?? null,
            row: embedded?.row ?? null,
            gen: embedded?.gen ?? null,
            via: embedded?.via ?? null,
          };
        }),
        site_keys: rec.site_keys ?? [],
        own_address_text: rec.own_address_text ?? null,
      };
    });
    const entity = live.entitiesById.get(id);
    if (!entity) {
      const decomposed =
        live.ledgerBundleIds.has(id) &&
        mintRecords.every((m) => live.entitiesByCanonical.has(m.minted_canonical_id));
      if (decomposed) alreadyApplied.push({ bundle_entity_id: id, mints: mintRecords });
      else missing.push(id);
      continue;
    }
    const allMintedExist = mintRecords.every((m) =>
      live.entitiesByCanonical.has(m.minted_canonical_id),
    );
    if (
      live.ledgerBundleIds.has(id) &&
      live.resolutionsById.get(id) === "inactive" &&
      allMintedExist
    ) {
      alreadyApplied.push({ bundle_entity_id: id, mints: mintRecords });
      continue;
    }
    if (entity.resource_name !== bundle.current_name) {
      drift.push({ bundle_entity_id: id, reason: "name_changed", found: entity.resource_name });
      continue;
    }
    if (live.resolutionsById.has(id)) {
      drift.push({ bundle_entity_id: id, reason: "resolution_present" });
      continue;
    }
    const liveLinks = live.linksByBundle.get(id) ?? new Map();
    const expectUids = new Set(
      mintRecords.flatMap((m) => m.rows.map((r) => r.uid)),
    );
    const uidsMatch =
      liveLinks.size === expectUids.size &&
      [...expectUids].every((uid) => liveLinks.has(uid));
    if (!uidsMatch) {
      drift.push({
        bundle_entity_id: id,
        reason: "link_set_changed",
        expected: expectUids.size,
        found: liveLinks.size,
      });
      continue;
    }
    const liveLocations = (live.locationsByBundle.get(id) ?? [])
      .map((loc) => ({
        location_id: loc.location_id,
        site_key: siteKey(normAddrKey(loc.address_line1)),
      }))
      .sort((a, b) => (a.location_id < b.location_id ? -1 : 1));
    const expectLocations = (bundle.location_descriptors ?? [])
      .map((d) => ({ location_id: d.location_id, site_key: d.site_key }))
      .sort((a, b) => (a.location_id < b.location_id ? -1 : 1));
    if (JSON.stringify(liveLocations) !== JSON.stringify(expectLocations)) {
      drift.push({ bundle_entity_id: id, reason: "locations_changed" });
      continue;
    }
    if (mintRecords.some((m) => live.entitiesByCanonical.has(m.minted_canonical_id))) {
      drift.push({ bundle_entity_id: id, reason: "canonical_collision" });
      continue;
    }
    planned.push({ bundle, mints: mintRecords });
  }
  return { planned, alreadyApplied, drift, missing };
}

// ---------------------------------------------------------------------------
// Write path (builders are pure and unit-tested against the live schema)
// ---------------------------------------------------------------------------

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

/** Build the minted-entity insert for one bundle's mints (pure). */
export function buildEntityInsert(bundle, mintRecords) {
  if (!mintRecords || mintRecords.length === 0) return null;
  const values = [];
  const params = [];
  mintRecords.forEach((mint, i) => {
    const b = i * ENTITY_INSERT_COLUMNS.length;
    const slots = ENTITY_INSERT_COLUMNS.map(
      (col, j) => `$${b + j + 1}${ENTITY_CASTS[col] ?? ""}`,
    );
    values.push(`(${slots.join(",")})`);
    params.push(
      mint.minted_entity_id,
      mint.minted_canonical_id,
      SOURCE_FAMILY_KEY,
      SOURCE_TABLE,
      mint.minted_canonical_id, // source_pk = the canonical_id (census design §4.2)
      null, // source_hash: no single source hash exists for a decomposition
      mint.program_name,
      "projected_record",
      null, // resource_category: UNREVIEWED — the category pass's job, never smuggled in
      [],
      bundle.layer ?? "backbone_workbook",
      bundle.jurisdiction ?? bundle.state,
      bundle.state,
      null, // county: bundle rows carry no entity-level county
      mint.city ?? bundle.city ?? null,
      "source_attached",
      "review_ready",
      "staging_provenance_attached",
      JSON.stringify({
        decomposition_version: DECOMPOSITION_VERSION,
        bundle_entity_id: bundle.bundle_entity_id,
        bundle_canonical_id: bundle.bundle_canonical_id,
        shape: bundle.shape,
        source_row_count: mint.rows.length,
        pair_decision: "split",
        merged_from: mint.absorbed_names,
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

const LOCATION_CASTS = {
  resource_entity_id: "::uuid",
  latitude: "::numeric",
  longitude: "::numeric",
  metadata: "::jsonb",
};

/**
 * Build location value objects for one mint: clones copy every
 * field of the bundle's live location row (location_id excluded —
 * the clone gets a fresh one), fresh rows carry the name's own
 * parsed address with coordinates NULL. source_pk suffixes follow
 * the mint's location order, so a location's source_pk is stable
 * no matter how the write is chunked.
 */
export function buildLocationValues(bundle, mint, liveLocationsById) {
  const assignment = assignLocations(bundle, mint);
  const rows = [];
  assignment.clone_indices.forEach((idx, n) => {
    const descriptor = bundle.location_descriptors[idx];
    const live = liveLocationsById.get(descriptor.location_id);
    if (!live) {
      throw new Error(
        `bundle ${bundle.bundle_entity_id}: location ${descriptor.location_id} missing at write time`,
      );
    }
    rows.push({
      resource_entity_id: mint.minted_entity_id,
      address_line1: live.address_line1 ?? null,
      address_line2: live.address_line2 ?? null,
      city: live.city ?? null,
      county: live.county ?? null,
      state: live.state ?? null,
      postal_code: live.postal_code ?? null,
      country: live.country ?? "US",
      latitude: live.latitude ?? null,
      longitude: live.longitude ?? null,
      coordinate_quality: live.coordinate_quality ?? "unknown",
      geocode_source: live.geocode_source ?? null,
      source_table: SOURCE_TABLE,
      source_pk: `${mint.minted_canonical_id}_loc${n + 1}`,
      metadata: {
        ...(live.metadata ?? {}),
        decomposition_version: DECOMPOSITION_VERSION,
        bundle_entity_id: bundle.bundle_entity_id,
        cloned_from_location_id: live.location_id,
      },
    });
  });
  if (assignment.fresh) {
    rows.push({
      resource_entity_id: mint.minted_entity_id,
      address_line1: assignment.fresh.street,
      address_line2: null,
      city: assignment.fresh.city,
      county: null,
      state: assignment.fresh.state,
      postal_code: assignment.fresh.zip5,
      country: "US",
      latitude: null,
      longitude: null,
      coordinate_quality: "not_geocoded_projection",
      geocode_source: null,
      source_table: SOURCE_TABLE,
      source_pk: `${mint.minted_canonical_id}_loc${rows.length + 1}`,
      metadata: {
        decomposition_version: DECOMPOSITION_VERSION,
        bundle_entity_id: bundle.bundle_entity_id,
        built_from: "own_row_address",
        address_text: mint.own_address_text,
      },
    });
  }
  return rows;
}

/** Build the location insert for flattened value rows (pure). */
export function buildLocationInsert(rows) {
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((row, i) => {
    const b = i * LOCATION_INSERT_COLUMNS.length;
    const slots = LOCATION_INSERT_COLUMNS.map(
      (col, j) => `$${b + j + 1}${LOCATION_CASTS[col] ?? ""}`,
    );
    values.push(`(${slots.join(",")})`);
    params.push(
      ...LOCATION_INSERT_COLUMNS.map((col) =>
        col === "metadata" ? JSON.stringify(row.metadata ?? {}) : row[col] ?? null,
      ),
    );
  });
  const text = `
    insert into public.luminari_resource_locations
       (${LOCATION_INSERT_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict do nothing`;
  return { text, params };
}

export const LINK_INSERT_COLUMNS = [
  "minted_entity_id",
  "bundle_entity_id",
  "civic_object_uid",
  "object_ref",
  "artifact_key",
  "source_content_sha256",
  "attribution_sheet",
  "attribution_row",
  "attribution_generation",
  "attribution_via",
  "projection_version",
];

/**
 * Build the re-pointed link rows for one bundle (pure). The
 * original link row (object_ref / artifact_key / source hash)
 * comes from the bundle's own family link table, fetched live;
 * the attribution comes from the embedded census record.
 */
export function buildLinkInsert(bundle, mintRecords, liveLinksByUid) {
  const rows = [];
  for (const mint of mintRecords) {
    for (const row of mint.rows) {
      const live = liveLinksByUid.get(row.uid);
      if (!live) {
        throw new Error(
          `bundle ${bundle.bundle_entity_id}: link row ${row.uid} missing at write time`,
        );
      }
      rows.push({ mint, row, live });
    }
  }
  if (rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * LINK_INSERT_COLUMNS.length;
    const slots = LINK_INSERT_COLUMNS.map(
      (col, j) =>
        `$${b + j + 1}${col.includes("entity_id") ? "::uuid" : ""}${col === "attribution_row" ? "::int" : ""}`,
    );
    values.push(`(${slots.join(",")})`);
    params.push(
      r.mint.minted_entity_id,
      bundle.bundle_entity_id,
      r.row.uid,
      r.live.object_ref ?? null,
      r.live.artifact_key ?? null,
      r.live.source_content_sha256 ?? null,
      r.row.sheet,
      r.row.row,
      r.row.gen,
      r.row.via,
      DECOMPOSITION_VERSION,
    );
  });
  const text = `
    insert into public.luminari_bundle_decomposition_source_rows
       (${LINK_INSERT_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict do nothing`;
  return { text, params };
}

export const LEDGER_COLUMNS = [
  "row_kind",
  "bundle_entity_id",
  "bundle_canonical_id",
  "minted_entity_id",
  "minted_canonical_id",
  "program_name",
  "shape",
  "attribution_evidence",
  "pair_decision",
  "pair_decider",
  "held_rows",
  "batch_id",
  "manifest_sha256",
  "decomposition_version",
];

const LEDGER_CASTS = {
  bundle_entity_id: "::uuid",
  minted_entity_id: "::uuid",
  attribution_evidence: "::jsonb",
  held_rows: "::jsonb",
};

/** Build the ledger mint rows for one bundle (pure). */
export function buildLedgerMintInsert(bundle, mintRecords, manifestSha) {
  if (!mintRecords || mintRecords.length === 0) return null;
  const values = [];
  const params = [];
  mintRecords.forEach((mint, i) => {
    const b = i * LEDGER_COLUMNS.length;
    const slots = LEDGER_COLUMNS.map(
      (col, j) => `$${b + j + 1}${LEDGER_CASTS[col] ?? ""}`,
    );
    values.push(`(${slots.join(",")})`);
    params.push(
      "mint",
      bundle.bundle_entity_id,
      bundle.bundle_canonical_id,
      mint.minted_entity_id,
      mint.minted_canonical_id,
      mint.program_name,
      bundle.shape,
      JSON.stringify({
        rows: mint.rows.map((r) => ({
          uid: r.uid,
          sheet: r.sheet,
          row: r.row,
          gen: r.gen,
          via: r.via,
        })),
        merged_from: mint.absorbed_names.map((name) => ({
          program_name: name,
          pair_decision: "merged_into",
          decided_by: "luminar_delegation_2026_11_10",
        })),
      }),
      "split",
      mint.absorbed_names.length > 0 ? "luminar_delegation_2026_11_10" : null,
      null,
      BATCH_ID,
      manifestSha,
      DECOMPOSITION_VERSION,
    );
  });
  const text = `
    insert into public.luminari_bundle_decompositions
       (${LEDGER_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict do nothing`;
  return { text, params };
}

/** Build the ledger shell-retirement row for one bundle (pure). */
export function buildLedgerShellInsert(bundle, mintRecords, manifestSha) {
  const params = [
    "shell_retirement",
    bundle.bundle_entity_id,
    bundle.bundle_canonical_id,
    null,
    null,
    null,
    bundle.shape,
    JSON.stringify({
      minted_canonical_ids: mintRecords.map((m) => m.minted_canonical_id),
    }),
    null,
    null,
    JSON.stringify(bundle.held_rows ?? []),
    BATCH_ID,
    manifestSha,
    DECOMPOSITION_VERSION,
  ];
  const slots = LEDGER_COLUMNS.map(
    (col, j) => `$${j + 1}${LEDGER_CASTS[col] ?? ""}`,
  );
  const text = `
    insert into public.luminari_bundle_decompositions
       (${LEDGER_COLUMNS.join(", ")})
     values (${slots.join(",")})
     on conflict do nothing`;
  return { text, params };
}

export const RESOLUTION_COLUMNS = [
  "resource_entity_id",
  "publication_status",
  "source_reference",
  "review_note",
  "review_version",
  "reviewed_at",
];

/**
 * Build the shell's publication resolution (pure). reviewed_at is
 * a SQL now() literal, not a parameter: the column is NOT NULL
 * with no default (caught by the migration dress rehearsal,
 * 2026-11-11).
 */
export function buildResolutionInsert(bundle, mintRecords) {
  const note = `Decomposed into ${mintRecords.length} minted entities: ${mintRecords
    .map((m) => m.minted_canonical_id)
    .join(", ")}`;
  const text = `
    insert into public.luminari_resource_publication_resolutions
       (${RESOLUTION_COLUMNS.join(", ")})
     values ($1::uuid, $2, $3, $4, $5, now())
     on conflict (resource_entity_id) do nothing`;
  const params = [
    bundle.bundle_entity_id,
    "inactive",
    `${DECOMPOSITION_VERSION}:${BATCH_ID}`,
    note,
    DECOMPOSITION_VERSION,
  ];
  return { text, params };
}

// ---------------------------------------------------------------------------
// Fetch + apply
// ---------------------------------------------------------------------------

const LINK_TABLE_BY_FAMILY = {
  catalog_site_projection_v1: {
    table: "luminari_catalog_site_source_rows",
    entityColumn: "site_entity_id",
  },
  catalog_remainder_projection_v1: {
    table: "luminari_catalog_remainder_source_rows",
    entityColumn: "resource_entity_id",
  },
};

async function fetchLiveState(client, approved, allCanonicals) {
  const bundleIds = approved.map((b) => b.bundle_entity_id);
  const entitiesById = new Map();
  for (const batch of chunk(bundleIds, 200)) {
    const res = await client.query(
      `select resource_entity_id, canonical_id, resource_name, source_table,
              state, city, jurisdiction, layer
         from public.luminari_resource_entities
        where resource_entity_id = any($1::uuid[])`,
      [batch],
    );
    for (const row of res.rows) entitiesById.set(row.resource_entity_id, row);
  }
  const entitiesByCanonical = new Map();
  for (const batch of chunk(allCanonicals, 200)) {
    const res = await client.query(
      `select resource_entity_id, canonical_id
         from public.luminari_resource_entities
        where canonical_id = any($1::text[])`,
      [batch],
    );
    for (const row of res.rows) entitiesByCanonical.set(row.canonical_id, row);
  }
  const linksByBundle = new Map();
  const locationsByBundle = new Map();
  for (const batch of chunk(bundleIds, 200)) {
    const locRes = await client.query(
      `select location_id, resource_entity_id, address_line1, address_line2,
              city, county, state, postal_code, country, latitude, longitude,
              coordinate_quality, geocode_source, source_table, source_pk, metadata
         from public.luminari_resource_locations
        where resource_entity_id = any($1::uuid[])`,
      [batch],
    );
    for (const row of locRes.rows) {
      if (!locationsByBundle.has(row.resource_entity_id)) {
        locationsByBundle.set(row.resource_entity_id, []);
      }
      locationsByBundle.get(row.resource_entity_id).push(row);
    }
  }
  for (const family of Object.keys(LINK_TABLE_BY_FAMILY)) {
    const ids = approved
      .filter((b) => b.family === family)
      .map((b) => b.bundle_entity_id);
    const { table, entityColumn } = LINK_TABLE_BY_FAMILY[family];
    for (const batch of chunk(ids, 200)) {
      if (batch.length === 0) continue;
      const res = await client.query(
        `select ${entityColumn} as bundle_entity_id, civic_object_uid,
                object_ref, artifact_key, source_content_sha256
           from public.${table}
          where ${entityColumn} = any($1::uuid[])`,
        [batch],
      );
      for (const row of res.rows) {
        if (!linksByBundle.has(row.bundle_entity_id)) {
          linksByBundle.set(row.bundle_entity_id, new Map());
        }
        linksByBundle.get(row.bundle_entity_id).set(row.civic_object_uid, row);
      }
    }
  }
  const resolutionsById = new Map();
  const ledgerBundleIds = new Set();
  for (const batch of chunk(bundleIds, 200)) {
    const res = await client.query(
      `select resource_entity_id, publication_status
         from public.luminari_resource_publication_resolutions
        where resource_entity_id = any($1::uuid[])`,
      [batch],
    );
    for (const row of res.rows) {
      resolutionsById.set(row.resource_entity_id, row.publication_status);
    }
    const led = await client.query(
      `select distinct bundle_entity_id
         from public.luminari_bundle_decompositions
        where bundle_entity_id = any($1::uuid[])`,
      [batch],
    ).catch(() => ({ rows: [] })); // ledger may not exist yet in a dry run
    for (const row of led.rows) ledgerBundleIds.add(row.bundle_entity_id);
  }
  return {
    entitiesById,
    entitiesByCanonical,
    linksByBundle,
    locationsByBundle,
    resolutionsById,
    ledgerBundleIds,
  };
}

/**
 * Apply one planned bundle in its own transaction. Exported for
 * the write-order test: the statement sequence inside the
 * transaction is part of the contract (see the comment in the
 * body).
 */
export async function applyBundle(client, plannedBundle, live, manifestSha) {
  const { bundle, mints } = plannedBundle;
  const liveLinks = live.linksByBundle.get(bundle.bundle_entity_id) ?? new Map();
  const liveLocationsById = new Map(
    (live.locationsByBundle.get(bundle.bundle_entity_id) ?? []).map((loc) => [
      loc.location_id,
      loc,
    ]),
  );
  let entities = 0;
  let locations = 0;
  let links = 0;
  let ledger = 0;
  await client.query("begin");
  try {
    // Write order follows the foreign keys, NOT the ledger-first
    // convention of the earlier passes: the ledger's mint rows and
    // the re-pointed link rows both carry minted_entity_id as an FK
    // into luminari_resource_entities, so the minted entities must
    // be inserted before either of those writes can satisfy the
    // constraint. Nothing flows the other way — the minted ids are
    // deterministic plan-time values verified against the census,
    // never generated by the ledger — so entity-first loses
    // nothing: inside the per-bundle transaction the bundle still
    // commits whole or not at all. (Production, 2026-11-11: the
    // ledger-first order violated
    // luminari_bundle_decompositions_minted_entity_id_fkey, 23503,
    // on the first bundle of the wave-1 apply; the transaction
    // rolled back clean and the run stopped.)
    const entityInsert = buildEntityInsert(bundle, mints);
    entities += (await client.query(entityInsert.text, entityInsert.params)).rowCount;
    const locationRows = mints.flatMap((mint) =>
      buildLocationValues(bundle, mint, liveLocationsById),
    );
    const locationInsert = buildLocationInsert(locationRows);
    if (locationInsert) {
      locations += (await client.query(locationInsert.text, locationInsert.params)).rowCount;
    }
    const linkInsert = buildLinkInsert(bundle, mints, liveLinks);
    if (linkInsert) {
      links += (await client.query(linkInsert.text, linkInsert.params)).rowCount;
    }
    const ledgerMint = buildLedgerMintInsert(bundle, mints, manifestSha);
    ledger += (await client.query(ledgerMint.text, ledgerMint.params)).rowCount;
    const shell = buildLedgerShellInsert(bundle, mints, manifestSha);
    ledger += (await client.query(shell.text, shell.params)).rowCount;
    const resolution = buildResolutionInsert(bundle, mints);
    const resRow = await client.query(resolution.text, resolution.params);
    const expectLinks = mints.reduce((n, m) => n + m.rows.length, 0);
    if (
      entities !== mints.length ||
      locations !== locationRows.length ||
      links !== expectLinks ||
      ledger !== mints.length + 1 ||
      resRow.rowCount !== 1
    ) {
      throw new Error(
        `bundle ${bundle.bundle_entity_id}: wrote entities ${entities}/${mints.length}, ` +
          `locations ${locations}/${locationRows.length}, links ${links}/${expectLinks}, ` +
          `ledger ${ledger}/${mints.length + 1}, resolution ${resRow.rowCount}/1 — rolled back`,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { bundle_entity_id: bundle.bundle_entity_id, entities, locations, links, ledger };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function loadEmbeddedProposals() {
  const url = new URL("./bundle-decomposition-proposals-v1.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf-8"));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { approved, excluded } = filterWave1Bundles(loadEmbeddedProposals());
  const mintsByBundle = new Map();
  const allMintRecords = [];
  for (const bundle of approved) {
    // The variant plan is recomputed from the embedded row-level
    // phone/website evidence, then cross-checked against the
    // identities and pair decisions the derivation pinned.
    const plan = planVariantPairs(
      (bundle.names ?? []).map((n) => ({
        program_name: n.program_name,
        rows: (n.rows ?? []).map((r) => ({
          uid: r.uid,
          phone: r.phone ?? "",
          website: r.website ?? "",
        })),
      })),
    );
    verifyEmbeddedMints(bundle, plan.mints);
    mintsByBundle.set(bundle.bundle_entity_id, plan);
    for (const mint of plan.mints) {
      allMintRecords.push({
        bundle_entity_id: bundle.bundle_entity_id,
        norm_name: normName(mint.program_name),
      });
    }
  }
  const censusManifest = manifestFor(allMintRecords);

  const { default: pgDefault } = await loadPg();
  const Pool = pgDefault?.Pool ?? (await loadPg()).Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("set statement_timeout = '240s'");
    const allCanonicals = [];
    for (const bundle of approved) {
      for (const rec of bundle.names ?? []) allCanonicals.push(rec.minted_canonical_id);
    }
    const live = await fetchLiveState(client, approved, allCanonicals);
    // Attach assignment-derived city + coordinate flags to the plan.
    const { planned, alreadyApplied, drift, missing } = planDecomposition(
      approved,
      live,
      mintsByBundle,
    );
    let plannedLocations = 0;
    let plannedWithCoords = 0;
    for (const pb of planned) {
      const liveLocationsById = new Map(
        (live.locationsByBundle.get(pb.bundle.bundle_entity_id) ?? []).map(
          (loc) => [loc.location_id, loc],
        ),
      );
      for (const mint of pb.mints) {
        const rows = buildLocationValues(pb.bundle, mint, liveLocationsById);
        mint.city = (() => {
          const cities = new Set(rows.map((r) => r.city).filter(Boolean));
          return cities.size === 1 ? [...cities][0] : (pb.bundle.city ?? null);
        })();
        mint.locations_planned = rows.length;
        mint.has_coords = rows.some((r) => r.latitude !== null && r.longitude !== null);
        plannedLocations += rows.length;
        if (mint.has_coords) plannedWithCoords += 1;
      }
    }
    const plannedMints = planned.reduce((n, pb) => n + pb.mints.length, 0);
    const plannedLinks = planned.reduce(
      (n, pb) => n + pb.mints.reduce((m, mint) => m + mint.rows.length, 0),
      0,
    );
    console.log(
      JSON.stringify({
        decomposition_version: DECOMPOSITION_VERSION,
        batch_id: BATCH_ID,
        approved_bundles: approved.length,
        excluded_by_filter: excluded.length,
        planned_bundles: planned.length,
        planned_mints: plannedMints,
        planned_mints_with_coords: plannedWithCoords,
        planned_locations: plannedLocations,
        planned_links: plannedLinks,
        already_applied_bundles: alreadyApplied.length,
        drift: drift.length,
        missing: missing.length,
        census_manifest_sha256: censusManifest,
        plan_manifest_sha256: manifestFor(
          planned.flatMap((pb) =>
            pb.mints.map((m) => ({
              bundle_entity_id: pb.bundle.bundle_entity_id,
              norm_name: m.norm_name,
            })),
          ),
        ),
      }),
    );
    if (drift.length > 0 || missing.length > 0) {
      console.log(JSON.stringify({ drift, missing }));
    }
    if (!apply) {
      console.log(
        "DRY RUN ONLY — pass --apply to mint entities, clone locations, re-point link rows, and retire shells.",
      );
      return;
    }
    const ledgerCheck = await client.query(
      "select to_regclass('public.luminari_bundle_decompositions') as t",
    );
    if (!ledgerCheck.rows[0].t) {
      throw new Error(
        "luminari_bundle_decompositions does not exist — install migration 20261110240000 before --apply.",
      );
    }
    const applied = [];
    for (const pb of planned) {
      applied.push(await applyBundle(client, pb, live, censusManifest));
    }
    console.log(
      JSON.stringify({ applied, census_manifest_sha256: censusManifest }),
    );
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
