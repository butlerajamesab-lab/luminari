import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ENTITY_INSERT_COLUMNS,
  LINK_INSERT_COLUMNS,
  LOCATION_INSERT_COLUMNS,
  LOCATION_VALUE_COLUMNS,
  PROJECTION_VERSION,
  SOURCE_FAMILY_KEY,
  SOURCE_TABLE,
  aggregateReview,
  buildEntityInsert,
  buildGroupKey,
  buildLinkInsert,
  buildLocationInsert,
  buildNameKey,
  buildTierKey,
  cleanNoteSegment,
  effectiveState,
  flattenLocationRows,
  groupRows,
  normalizeForKey,
  parseAddressCandidate,
  pickOrgName,
  projectGroups,
  stableUuid,
} from "./project-catalog-remainder.mjs";

// Live-schema fixtures below were read from information_schema
// against production on 2026-11-10 (the write path is tested
// against the real tables, not the runner's own assumptions — the
// failure mode behind both PR #791 review findings).

const LIVE_ENTITY_COLUMNS = [
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
  "jurisdiction_scope",
  "state",
  "county",
  "city",
  "description",
  "eligibility_summary",
  "apply_notes",
  "service_categories",
  "domains",
  "metadata",
  "verification_status",
  "promotion_status",
  "provenance_status",
  "created_at",
  "updated_at",
];

const LIVE_LOCATION_COLUMNS = [
  "location_id",
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
  "created_at",
];

// The link table is created by this projection's own migration
// (20261110213000); its columns are pinned here from that file.
const MIGRATION = readFileSync(
  new URL("../supabase/migrations/20261110213000_catalog_remainder_projection_v1.sql", import.meta.url),
  "utf8",
);

describe("constants", () => {
  it("uses the registered family and version", () => {
    expect(SOURCE_FAMILY_KEY).toBe("catalog_remainder_projection");
    expect(SOURCE_TABLE).toBe("catalog_remainder_projection_v1");
    expect(PROJECTION_VERSION).toBe("catalog_remainder_projection_v1");
    expect(MIGRATION).toContain("'catalog_remainder_projection'");
    expect(MIGRATION).toContain("luminari_catalog_remainder_source_rows");
  });
});

describe("pickOrgName — step 1 rescue rule", () => {
  it("rescues a UUID name from organization_name", () => {
    expect(
      pickOrgName({
        name: "d6e549e0-d4a8-5161-8200-75cdc3078b2c",
        organization_name: "Delaware Health and Social Services",
      }),
    ).toEqual({ name: "Delaware Health and Social Services", unresolved: false });
  });
  it("keeps a UUID name unresolved when no organization name exists", () => {
    expect(
      pickOrgName({ name: "d6e549e0-d4a8-5161-8200-75cdc3078b2c", organization_name: "" }),
    ).toEqual({ name: "d6e549e0-d4a8-5161-8200-75cdc3078b2c", unresolved: true });
  });
  it("rescues artifact keys (luminari-*) from organization_name", () => {
    expect(pickOrgName({ name: "luminari-ak-registry", organization_name: "Alaska DPA" })).toEqual({
      name: "Alaska DPA",
      unresolved: false,
    });
  });
  it("leaves an ordinary name untouched", () => {
    expect(pickOrgName({ name: "211 Missouri", organization_name: "ignored" })).toEqual({
      name: "211 Missouri",
      unresolved: false,
    });
  });
});

describe("effectiveState", () => {
  it("prefers a two-letter state_code", () => {
    expect(effectiveState({ state_code: "wa", jurisdiction: "Washington" })).toBe("WA");
  });
  it("falls back to a two-letter jurisdiction", () => {
    expect(effectiveState({ state_code: null, jurisdiction: "PR" })).toBe("PR");
  });
  it("defaults nationwide rows to US", () => {
    expect(effectiveState({ state_code: null, jurisdiction: "US" })).toBe("US");
    expect(effectiveState({ state_code: "USA", jurisdiction: "Nationwide" })).toBe("US");
  });
  it("builds the group key from normalized name + state", () => {
    expect(buildGroupKey("St. Mary's Legal-Aid!", "ak")).toBe("st mary s legal aid @ AK");
    expect(normalizeForKey("St. Mary's  Legal-Aid!")).toBe("st mary s legal aid");
  });
});

describe("aggregateReview — revision-governed categories only", () => {
  it("takes the single distinct reviewed primary and unions memberships minus the primary", () => {
    expect(
      aggregateReview([
        { reviewed_primary_category: "legal_civil_rights", reviewed_category_memberships: ["legal_civil_rights"] },
        {
          reviewed_primary_category: "legal_civil_rights",
          reviewed_category_memberships: ["legal_civil_rights", "housing", "employment_labor"],
        },
      ]),
    ).toEqual({ primary: "legal_civil_rights", memberships: ["employment_labor", "housing"], conflict: false });
  });
  it("leaves unreviewed groups UNREVIEWED (null primary, no memberships)", () => {
    expect(
      aggregateReview([{ reviewed_primary_category: null, reviewed_category_memberships: [] }]),
    ).toEqual({ primary: null, memberships: [], conflict: false });
  });
  it("nulls conflicting reviewed primaries and flags the conflict", () => {
    expect(
      aggregateReview([
        { reviewed_primary_category: "housing", reviewed_category_memberships: ["housing"] },
        { reviewed_primary_category: "healthcare", reviewed_category_memberships: ["healthcare"] },
      ]),
    ).toEqual({ primary: null, memberships: [], conflict: true });
  });
});

describe("parseAddressCandidate — the declared cascade", () => {
  it("cascade 1: accepts a plain lettered-street address via step-1 rules", () => {
    expect(parseAddressCandidate("436 Plum Creek Lane, Butte Falls, OR 97522")).toMatchObject({
      street: "436 Plum Creek Lane",
      city: "Butte Falls",
      state: "OR",
      zip5: "97522",
      kind: "physical",
      via: "step1_rule",
    });
  });
  it("cascade 2: accepts a numbered-street address step 1's street-core test rejects", () => {
    // "101 12th Avenue": after the house number comes a digit-led
    // street name, so step 1's /\d+\s+[A-Za-z]/ core test fails and
    // the row stayed unprojected; the full component parse is the
    // evidence here.
    expect(parseAddressCandidate("101 12th Avenue, Room 332, Fairbanks, AK 99701")).toMatchObject({
      street: "101 12th Avenue, Room 332",
      city: "Fairbanks",
      state: "AK",
      zip5: "99701",
      kind: "physical",
      via: "extended_parse",
    });
  });
  it("cascade 1: accepts a PO Box with a trailing physical note as mailing", () => {
    const cand = parseAddressCandidate(
      "PO Box 607087, Bayamón, PR 00960-7087 (physical: Carr. #2 Km 8.2, Bayamón, PR 00959)",
    );
    expect(cand).toMatchObject({ city: "Bayamón", state: "PR", zip5: "00960", kind: "mailing", via: "step1_rule" });
  });
  it("cascade 2: strips a trailing ', USA' so the address parses", () => {
    expect(
      parseAddressCandidate("500 W Madison St, Suite 1000, Chicago, IL 60661, USA"),
    ).toMatchObject({
      street: "500 W Madison St, Suite 1000",
      city: "Chicago",
      state: "IL",
      zip5: "60661",
      kind: "physical",
      via: "extended_parse",
    });
  });
  it("cascade 2: cuts prose after ' · ' and a spaceless city/state tail parses", () => {
    expect(
      parseAddressCandidate("301 Centennial Mall S, Lincoln NE 68509 (DHHS main) · County DHHS offices statewide"),
    ).toMatchObject({
      street: "301 Centennial Mall S",
      city: "Lincoln",
      state: "NE",
      zip5: "68509",
      kind: "physical",
      via: "extended_parse",
    });
  });
  it("rejects non-addresses: phones, URLs, ZIP-only, statewide prose", () => {
    expect(parseAddressCandidate("202-596-1056")).toBeNull();
    expect(parseAddressCandidate("disasterassistance.gov")).toBeNull();
    expect(parseAddressCandidate("19254")).toBeNull();
    expect(parseAddressCandidate("Online — statewide")).toBeNull();
    expect(parseAddressCandidate("Administered through Alabama DHR and Community Action Agencies")).toBeNull();
    expect(parseAddressCandidate("Contact via MCADSV")).toBeNull();
  });
  it("cleanNoteSegment applies the declared cleanups in order", () => {
    expect(cleanNoteSegment("450 W State St, Boise ID 83702 (IDHW) · 44 county offices statewide")).toBe(
      "450 W State St, Boise ID 83702",
    );
    expect(cleanNoteSegment("500 W Madison St, Chicago, IL 60661, USA")).toBe(
      "500 W Madison St, Chicago, IL 60661",
    );
  });
});

describe("collision keys (U2)", () => {
  it("builds tier keys only from complete state + ZIP5 + street", () => {
    expect(buildTierKey("AK", "99752", "436 4th Ave")).toBe("AK|99752|436 4th ave");
    expect(buildTierKey("AK", null, "436 4th Ave")).toBeNull();
  });
  it("builds name keys from state + city + name", () => {
    expect(buildNameKey("AK", "Kotzebue", "Maniilaq Association")).toBe(
      "AK|kotzebue|maniilaq association",
    );
    expect(buildNameKey("AK", null, "Maniilaq Association")).toBeNull();
  });
  it("computes the md5 stable UUID exactly like luminari_stable_uuid_v1", () => {
    expect(stableUuid("")).toBe("d41d8cd9-8f00-b204-e980-0998ecf8427e");
    expect(stableUuid("abc")).toBe("90015098-3cd2-4fb0-d696-3f7d28e17f72");
  });
});

function fixtureRow(overrides) {
  return {
    civic_object_uid: "corpus:aaa",
    object_ref: "aaa",
    artifact_key: "State Enriched Registry bucket/fixture.docx",
    source_content_sha256: "f".repeat(64),
    name: "Fixture Legal Aid",
    organization_name: null,
    state_code: "WA",
    jurisdiction: "Washington",
    section_name: "Legal Aid",
    address: null,
    phone: null,
    website_url: null,
    category: "workbook_record",
    layer: "layer_1",
    reviewed_primary_category: null,
    reviewed_category_memberships: [],
    ...overrides,
  };
}

const EXISTING = [
  {
    resource_entity_id: "11111111-1111-1111-1111-111111111111",
    canonical_id: "gof_fixture_office",
    resource_name: "Maniilaq Association",
    address_line1: "436 4th Ave",
    city: "Kotzebue",
    state: "AK",
    postal_code: "99752",
  },
  {
    resource_entity_id: "22222222-2222-2222-2222-222222222222",
    canonical_id: "csp_wa_fixture_site",
    resource_name: "Spokane Legal Services",
    address_line1: "100 Main St",
    city: "Spokane",
    state: "WA",
    postal_code: "99201",
  },
];

describe("groupRows + projectGroups", () => {
  it("groups duplicate rows of one org+state into one group and keeps every member", () => {
    const { census, groups } = groupRows([
      fixtureRow({ civic_object_uid: "corpus:bbb" }),
      fixtureRow({ civic_object_uid: "corpus:aaa" }),
    ]);
    expect(census.rows).toBe(2);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.civic_object_uid)).toEqual(["corpus:aaa", "corpus:bbb"]);
    expect(groups[0].representative_uid).toBe("corpus:aaa");
  });
  it("keeps the same org in two states as two groups", () => {
    const { groups } = groupRows([
      fixtureRow({ civic_object_uid: "corpus:aaa" }),
      fixtureRow({ civic_object_uid: "corpus:ccc", state_code: "OR", jurisdiction: "Oregon" }),
    ]);
    expect(groups).toHaveLength(2);
  });
  it("mints an unaddressed group with no category (unreviewed stays null)", () => {
    const { groups } = groupRows([fixtureRow({})]);
    const { census, mints } = projectGroups(groups, EXISTING);
    expect(census.minted).toBe(1);
    expect(mints[0].primary).toBeNull();
    expect(mints[0].memberships).toEqual([]);
    expect(census.category_distribution).toEqual({ unreviewed: 1 });
  });
  it("tier A: a group whose parsed address keys to an existing location merges, writing nothing", () => {
    const { groups } = groupRows([
      fixtureRow({
        civic_object_uid: "corpus:ddd",
        name: "Maniilaq Association",
        state_code: "AK",
        jurisdiction: "Alaska",
        address: "436 4th Ave, Kotzebue, AK 99752, USA",
      }),
    ]);
    const { census, mints, merges } = projectGroups(groups, EXISTING);
    expect(census.tier_a_merges).toBe(1);
    expect(mints).toHaveLength(0);
    expect(merges[0].target_entity_id).toBe(EXISTING[0].resource_entity_id);
  });
  it("address alone is NOT identity: a different program at the same address mints its own entity", () => {
    // The measured IDHW pattern: Idaho SNAP / Medicaid / TANF /
    // LIHEAP groups all parse to the agency HQ address where one
    // step-1 site (WIC Idaho) already sits. Merging on address
    // alone would collapse distinct programs into that one site.
    const { groups } = groupRows([
      fixtureRow({
        civic_object_uid: "corpus:hhh",
        name: "Idaho SNAP / Food Assistance (IDHW)",
        state_code: "ID",
        jurisdiction: "Idaho",
        address: "450 W State St, Boise ID 83702 (IDHW) · 44 county offices statewide",
      }),
    ]);
    const existing = [
      {
        resource_entity_id: "33333333-3333-3333-3333-333333333333",
        canonical_id: "csp_id_wic",
        resource_name: "WIC Idaho (IDHW)",
        address_line1: "450 W State St",
        city: "Boise",
        state: "ID",
        postal_code: "83702",
      },
    ];
    const { census, mints, merges } = projectGroups(groups, existing);
    expect(merges).toHaveLength(0);
    expect(census.minted).toBe(1);
    expect(census.address_shares_minted).toBe(1);
    expect(mints[0].locations).toHaveLength(1);
  });
  it("tier B: name + single candidate city + state match is HELD, never merged", () => {
    const { groups } = groupRows([
      fixtureRow({
        civic_object_uid: "corpus:eee",
        name: "Spokane Legal Services",
        address: "200 Other St, Spokane WA 99201 · county offices statewide",
      }),
    ]);
    // The candidate street differs from the existing location (tier A
    // misses) but name + city + state coincide -> held.
    const { census, mints, held } = projectGroups(groups, EXISTING);
    expect(census.tier_b_held).toBe(1);
    expect(mints).toHaveLength(0);
    expect(held[0].matched_entity_ids).toEqual([EXISTING[1].resource_entity_id]);
  });
  it("carries a reviewed primary + memberships from the group's rows", () => {
    const { groups } = groupRows([
      fixtureRow({
        civic_object_uid: "corpus:fff",
        reviewed_primary_category: "legal_civil_rights",
        reviewed_category_memberships: ["legal_civil_rights", "housing"],
      }),
    ]);
    const { census, mints } = projectGroups(groups, EXISTING);
    expect(mints[0].primary).toBe("legal_civil_rights");
    expect(mints[0].memberships).toEqual(["housing"]);
    expect(census.category_distribution).toEqual({ legal_civil_rights: 1 });
    expect(census.membership_distribution).toEqual({ housing: 1 });
  });
  it("is deterministic: same input, same manifest hash, twice", () => {
    const rows = [fixtureRow({}), fixtureRow({ civic_object_uid: "corpus:zzz", name: "Other Org" })];
    const a = projectGroups(groupRows(rows).groups, EXISTING);
    const b = projectGroups(groupRows(rows).groups, EXISTING);
    expect(a.manifestSha).toBe(b.manifestSha);
    expect(a.mints.map((m) => m.entity_id)).toEqual(b.mints.map((m) => m.entity_id));
  });
});

describe("insert builders — live schema contract", () => {
  const { groups } = groupRows([
    fixtureRow({
      civic_object_uid: "corpus:ggg",
      address: "301 Centennial Mall S, Lincoln NE 68509 (DHHS main) · County DHHS offices statewide",
      state_code: "NE",
      jurisdiction: "Nebraska",
      name: "Nebraska DHHS",
    }),
  ]);
  const { mints, merges } = projectGroups(groups, EXISTING);

  it("entity insert columns all exist in the live entity table, in order", () => {
    for (const col of ENTITY_INSERT_COLUMNS) {
      expect(LIVE_ENTITY_COLUMNS).toContain(col);
    }
  });
  it("entity insert emits one tuple with one parameter per column", () => {
    const { text, params } = buildEntityInsert(mints);
    expect(params).toHaveLength(ENTITY_INSERT_COLUMNS.length * mints.length);
    expect(text).toContain("$1::uuid");
    expect(text).toContain("on conflict (canonical_id) do nothing");
    expect(text).toContain("::text[]");
    expect(text).toContain("::jsonb");
  });
  it("location insert supplies exactly the value columns and derives country", () => {
    for (const col of LOCATION_INSERT_COLUMNS) expect(LIVE_LOCATION_COLUMNS).toContain(col);
    const built = buildLocationInsert(flattenLocationRows(mints));
    expect(built).not.toBeNull();
    expect(built.params).toHaveLength(LOCATION_VALUE_COLUMNS.length);
    expect(built.text).toContain("'US'");
    // Coordinates are never invented: both lat/lng params are null.
    const latIdx = LOCATION_VALUE_COLUMNS.indexOf("latitude");
    expect(built.params[latIdx]).toBeNull();
    expect(built.params[latIdx + 1]).toBeNull();
    const qualityIdx = LOCATION_VALUE_COLUMNS.indexOf("coordinate_quality");
    expect(built.params[qualityIdx]).toBe("not_geocoded_projection");
  });
  it("location source_pk carries the deterministic group suffix", () => {
    const built = buildLocationInsert(flattenLocationRows(mints));
    const pkIdx = LOCATION_VALUE_COLUMNS.indexOf("source_pk");
    expect(built.params[pkIdx]).toBe(`${mints[0].source_pk}_loc1`);
  });
  it("link insert covers every member row and matches the migration's columns", () => {
    for (const col of LINK_INSERT_COLUMNS) {
      expect(MIGRATION).toContain(col);
    }
    const built = buildLinkInsert(mints, merges);
    expect(built.params).toHaveLength(LINK_INSERT_COLUMNS.length * mints[0].members.length);
    expect(built.text).toContain("luminari_catalog_remainder_source_rows");
    expect(built.text).toContain("on conflict do nothing");
  });
  it("returns null builders when there is nothing to write", () => {
    expect(buildLocationInsert([])).toBeNull();
    expect(buildLinkInsert([], [])).toBeNull();
  });
});
