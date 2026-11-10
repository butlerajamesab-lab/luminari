import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CATEGORY_RULE_VERSION,
  ENTITY_INSERT_COLUMNS,
  FAMILY_CATEGORY_MAP,
  LINK_INSERT_COLUMNS,
  LOCATION_INSERT_COLUMNS,
  LOCATION_VALUE_COLUMNS,
  PROJECTION_VERSION,
  SOURCE_FAMILY_KEY,
  SOURCE_TABLE,
  VA_BENEFITS_TYPES,
  VA_CLINICAL_TYPES,
  buildEntityInsert,
  buildLinkInsert,
  buildLocationInsert,
  buildNameKey,
  buildTierKey,
  categoriesForOffice,
  extractZip5,
  normalizeForKey,
  parseOfficeAddress,
  projectOffices,
  stableUuid,
} from "./project-gov-offices.mjs";

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
// Live NOT NULL entity columns — all carry defaults except
// resource_name, which the insert must supply.
const LIVE_ENTITY_NOT_NULL = [
  "resource_entity_id",
  "resource_name",
  "metadata",
  "verification_status",
  "promotion_status",
  "provenance_status",
  "created_at",
  "updated_at",
];
const LIVE_ENTITY_DEFAULTED = [
  "resource_entity_id",
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

describe("categoriesForOffice — U1 family map", () => {
  it("maps every non-VA family to its decided primary + memberships", () => {
    for (const [agency, want] of Object.entries(FAMILY_CATEGORY_MAP)) {
      expect(categoriesForOffice({ agency_key: agency, office_type: null })).toEqual(want);
    }
  });
  it("gives hospitals the safety_crisis membership (emergency departments)", () => {
    expect(categoriesForOffice({ agency_key: "hospital" })).toEqual({
      primary: "healthcare",
      memberships: ["safety_crisis"],
    });
  });
  it("gives job centers the cash_assistance membership", () => {
    expect(categoriesForOffice({ agency_key: "american_job_center" })).toEqual({
      primary: "employment_labor",
      memberships: ["cash_assistance"],
    });
  });
  it("returns null for an unknown agency (held as unmapped, never uncategorized)", () => {
    expect(categoriesForOffice({ agency_key: "nope" })).toBeNull();
  });
});

describe("categoriesForOffice — VA at office_type grain", () => {
  it("maps every clinical type to healthcare", () => {
    for (const t of VA_CLINICAL_TYPES) {
      expect(categoriesForOffice({ agency_key: "veterans_affairs", office_type: t }).primary).toBe(
        "healthcare",
      );
    }
  });
  it("adds the safety_crisis membership for va_vamc and vet centers among clinical types", () => {
    expect(
      categoriesForOffice({ agency_key: "veterans_affairs", office_type: "va_vamc" }),
    ).toEqual({ primary: "healthcare", memberships: ["safety_crisis"] });
    expect(
      categoriesForOffice({ agency_key: "veterans_affairs", office_type: "va_pccboc" }),
    ).toEqual({ primary: "healthcare", memberships: [] });
  });
  it("maps vet centers to healthcare primary with the safety_crisis membership (U1, corrected 2026-11-10)", () => {
    for (const t of ["va_vtcr", "va_mvctr"]) {
      expect(categoriesForOffice({ agency_key: "veterans_affairs", office_type: t })).toEqual({
        primary: "healthcare",
        memberships: ["safety_crisis"],
      });
    }
  });
  it("maps outreach/benefits offices to cash_assistance", () => {
    for (const t of VA_BENEFITS_TYPES) {
      expect(categoriesForOffice({ agency_key: "veterans_affairs", office_type: t })).toEqual({
        primary: "cash_assistance",
        memberships: [],
      });
    }
  });
  it("covers every VA office_type present in the live data (2026-11-10)", () => {
    const liveTypes = [
      "va_oos",
      "va_pccboc",
      "va_mscboc",
      "va_vtcr",
      "va_vamc",
      "va_mvctr",
      "va_drrtp",
      "va_hcc",
      "va_clc",
      "va_mcs",
    ];
    for (const t of liveTypes) {
      expect(
        categoriesForOffice({ agency_key: "veterans_affairs", office_type: t }),
        `live VA type ${t} must be mapped`,
      ).not.toBeNull();
    }
  });
  it("returns null for an unknown VA type", () => {
    expect(
      categoriesForOffice({ agency_key: "veterans_affairs", office_type: "va_cemetery" }),
    ).toBeNull();
  });
});

describe("parseOfficeAddress", () => {
  it("strips an embedded ', City, ST ZIP' tail from the street", () => {
    expect(
      parseOfficeAddress({
        office_name: "Butte Falls Police Department",
        address_full: "100 Plum Creek Lane, Butte Falls, OR 97522",
        city: "Butte Falls",
        state: "OR",
      }),
    ).toEqual({ street: "100 Plum Creek Lane", city: "Butte Falls", state: "OR", zip5: "97522" });
  });
  it("keeps a street-only address_full and takes city/state from the office columns", () => {
    expect(
      parseOfficeAddress({
        office_name: "Kansas City Regional Office",
        address_full: "400 State Avenue Room 200",
        city: "Kansas City",
        state: "KS",
      }),
    ).toEqual({ street: "400 State Avenue Room 200", city: "Kansas City", state: "KS", zip5: null });
  });
  it("treats a name-only address_full as no street (never restates the name as an address)", () => {
    expect(
      parseOfficeAddress({
        office_name: "NORWOOD HOSPITAL",
        address_full: "NORWOOD HOSPITAL",
        city: "NORWOOD",
        state: "MA",
      }).street,
    ).toBeNull();
  });
  it("extracts ZIP5 ahead of ZIP+4 and trailing parentheticals", () => {
    expect(extractZip5("436 4th Ave, Kotzebue, AK 99752-1234")).toBe("99752");
    expect(extractZip5("no zip here")).toBeNull();
    expect(extractZip5(null)).toBeNull();
  });
});

describe("collision keys", () => {
  it("normalizes case and punctuation identically to the census", () => {
    expect(normalizeForKey("St. Mary's  Legal-Aid!")).toBe("st mary s legal aid");
  });
  it("builds tier keys only from complete state + ZIP5 + street", () => {
    expect(buildTierKey("AK", "99752", "436 4th Ave")).toBe("AK|99752|436 4th ave");
    expect(buildTierKey("AK", null, "436 4th Ave")).toBeNull();
    expect(buildTierKey("AK", "99752", null)).toBeNull();
  });
  it("matches a punctuation variant of the same street", () => {
    expect(buildTierKey("AK", "99752", "436 4th Ave.")).toBe(
      buildTierKey("ak", "99752", "436  4th Ave"),
    );
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

const EXISTING = [
  {
    resource_entity_id: "11111111-1111-1111-1111-111111111111",
    canonical_id: "csp_ak_fixture",
    resource_name: "Maniilaq Association",
    address_line1: "436 4th Ave",
    city: "Kotzebue",
    state: "AK",
    postal_code: "99752",
  },
];

function fixtureOffices() {
  return [
    {
      // tier A: same street + ZIP as the existing Maniilaq site
      office_id: "gof_aaa",
      agency_key: "native_american",
      office_name: "Maniilaq Association",
      office_type: null,
      state: "AK",
      city: "Kotzebue",
      address_full: "436 4th Ave, Kotzebue, AK 99752",
      lat: "66.897",
      lng: "-162.597",
      source_id: "cos_native_american_finder_xlsx",
      source_hash8: "5991f551",
    },
    {
      // tier B: same name + city, different street evidence
      office_id: "gof_bbb",
      agency_key: "native_american",
      office_name: "Maniilaq Association",
      office_type: null,
      state: "AK",
      city: "Kotzebue",
      address_full: "PO Box 256, Kotzebue, AK 99752",
      lat: null,
      lng: null,
      source_id: "cos_native_american_finder_xlsx",
      source_hash8: "5991f551",
    },
    {
      // mint, pinned hospital
      office_id: "gof_ccc",
      agency_key: "hospital",
      office_name: "NORWOOD HOSPITAL",
      office_type: null,
      state: "MA",
      city: "NORWOOD",
      address_full: "800 Washington St, Norwood, MA 02062",
      lat: "42.198",
      lng: "-71.202",
      source_id: "hifld_hospitals_arcgis",
      source_hash8: "0c0751df",
    },
    {
      // mint, unpinned SSA office
      office_id: "gof_ddd",
      agency_key: "ssa",
      office_name: "Social Security Office",
      office_type: null,
      state: "WA",
      city: "Everett",
      address_full: "123 Main St, Everett, WA 98201",
      lat: null,
      lng: null,
      source_id: "ssa_fo_csv",
      source_hash8: "ac14075f",
    },
    {
      // unmapped agency
      office_id: "gof_eee",
      agency_key: "mystery_agency",
      office_name: "Mystery Office",
      office_type: null,
      state: "WA",
      city: "Seattle",
      address_full: "1 Pine St, Seattle, WA 98101",
      lat: "47.6",
      lng: "-122.3",
      source_id: "unknown_src",
      source_hash8: null,
    },
  ];
}

describe("projectOffices", () => {
  it("classifies mint / tier-A merge / tier-B hold / unmapped and counts the census", () => {
    const { census, mints, merges, held, unmapped } = projectOffices(fixtureOffices(), EXISTING);
    expect(census.offices).toBe(5);
    expect(census.minted).toBe(2);
    expect(census.tier_a_merges).toBe(1);
    expect(census.tier_b_held).toBe(1);
    expect(census.unmapped).toBe(1);
    expect(merges[0].target_entity_id).toBe(EXISTING[0].resource_entity_id);
    expect(merges[0].target_canonical_id).toBe("csp_ak_fixture");
    expect(held[0].office_id).toBe("gof_bbb");
    expect(unmapped[0].office_id).toBe("gof_eee");
    expect(census.locations_with_coordinates).toBe(1);
    expect(census.locations_without_coordinates).toBe(1);
    expect(census.category_distribution).toEqual({ healthcare: 1, cash_assistance: 1 });
    expect(census.membership_distribution).toEqual({ safety_crisis: 1 });
    const hospital = mints.find((m) => m.office.office_id === "gof_ccc");
    expect(hospital.canonical_id).toBe("gof_ccc"); // office_id AS-IS, never re-hashed
    expect(hospital.latitude).toBe(42.198);
  });
  it("is deterministic under input shuffling (same manifest hash)", () => {
    const a = projectOffices(fixtureOffices(), EXISTING);
    const b = projectOffices([...fixtureOffices()].reverse(), EXISTING);
    expect(b.manifestSha).toBe(a.manifestSha);
    expect(b.census.minted).toBe(a.census.minted);
  });
});

// Write-path contract tests against the live schema fixtures above.

function fixtureMints() {
  const { mints, merges } = projectOffices(fixtureOffices(), EXISTING);
  return { mints, merges };
}

describe("write path — entity insert contract", () => {
  it("targets only columns that exist on the live entities table", () => {
    for (const col of ENTITY_INSERT_COLUMNS) {
      expect(LIVE_ENTITY_COLUMNS).toContain(col);
    }
  });
  it("supplies every NOT NULL entity column that has no default", () => {
    for (const col of LIVE_ENTITY_NOT_NULL) {
      if (!LIVE_ENTITY_DEFAULTED.includes(col)) {
        expect(ENTITY_INSERT_COLUMNS).toContain(col);
      }
    }
  });
  it("binds canonical_id AS-IS (the office_id), the family key, and the memberships array", () => {
    const { mints } = fixtureMints();
    const hospital = mints.filter((m) => m.office.office_id === "gof_ccc");
    const { text, params } = buildEntityInsert(hospital);
    expect(params).toHaveLength(ENTITY_INSERT_COLUMNS.length);
    expect(params[ENTITY_INSERT_COLUMNS.indexOf("canonical_id")]).toBe("gof_ccc");
    expect(params[ENTITY_INSERT_COLUMNS.indexOf("source_family_key")]).toBe(SOURCE_FAMILY_KEY);
    expect(params[ENTITY_INSERT_COLUMNS.indexOf("source_table")]).toBe(SOURCE_TABLE);
    expect(params[ENTITY_INSERT_COLUMNS.indexOf("resource_category")]).toBe("healthcare");
    expect(params[ENTITY_INSERT_COLUMNS.indexOf("service_categories")]).toEqual(["safety_crisis"]);
    expect(text).toContain("on conflict (canonical_id) do nothing");
  });
  it("casts the UUID, text[] and JSONB parameters explicitly", () => {
    const { text } = buildEntityInsert(fixtureMints().mints.slice(0, 1));
    expect(text).toContain("$1::uuid");
    expect(
      text,
    ).toContain(`$${ENTITY_INSERT_COLUMNS.indexOf("service_categories") + 1}::text[]`);
    expect(text).toContain(`$${ENTITY_INSERT_COLUMNS.indexOf("metadata") + 1}::jsonb`);
  });
  it("carries the locator source + payload hash in entity provenance metadata", () => {
    const { mints } = fixtureMints();
    const { params } = buildEntityInsert(mints.filter((m) => m.office.office_id === "gof_ccc"));
    const metadata = JSON.parse(params[ENTITY_INSERT_COLUMNS.indexOf("metadata")]);
    expect(metadata.projection_version).toBe(PROJECTION_VERSION);
    expect(metadata.category_rule).toBe(CATEGORY_RULE_VERSION);
    expect(metadata.source_id).toBe("hifld_hospitals_arcgis");
    expect(metadata.source_hash8).toBe("0c0751df");
  });
});

describe("write path — location insert contract", () => {
  it("targets only columns that exist on the live locations table", () => {
    for (const col of LOCATION_INSERT_COLUMNS) {
      expect(LIVE_LOCATION_COLUMNS).toContain(col);
    }
  });
  it("aligns VALUES tuples with the derived-table alias list", () => {
    const { mints } = fixtureMints();
    const { text, params } = buildLocationInsert(mints.slice(0, 1));
    expect(text).toContain(`as v(${LOCATION_VALUE_COLUMNS.join(", ")})`);
    const match = /from \(values (.+)\)\s+as v\(/s.exec(text);
    expect(match).not.toBeNull();
    expect(match[1].split(",")).toHaveLength(LOCATION_VALUE_COLUMNS.length);
    expect(params).toHaveLength(LOCATION_VALUE_COLUMNS.length);
  });
  it("casts the UUID, numeric and JSONB parameters explicitly", () => {
    const { text } = buildLocationInsert(fixtureMints().mints.slice(0, 1));
    expect(text).toContain("$1::uuid");
    expect(text).toContain(`$${LOCATION_VALUE_COLUMNS.indexOf("latitude") + 1}::numeric`);
    expect(text).toContain(`$${LOCATION_VALUE_COLUMNS.indexOf("longitude") + 1}::numeric`);
    expect(text).toContain(`$${LOCATION_VALUE_COLUMNS.length}::jsonb`);
  });
  it("copies source coordinates only when the office carries them", () => {
    const { mints } = fixtureMints();
    const pinned = buildLocationInsert(mints.filter((m) => m.office.office_id === "gof_ccc"));
    expect(pinned.params[LOCATION_VALUE_COLUMNS.indexOf("latitude")]).toBe(42.198);
    expect(pinned.params[LOCATION_VALUE_COLUMNS.indexOf("coordinate_quality")]).toBe(
      "source_supplied",
    );
    expect(pinned.params[LOCATION_VALUE_COLUMNS.indexOf("geocode_source")]).toBe(
      "hifld_hospitals_arcgis",
    );
    const unpinned = buildLocationInsert(mints.filter((m) => m.office.office_id === "gof_ddd"));
    expect(unpinned.params[LOCATION_VALUE_COLUMNS.indexOf("latitude")]).toBeNull();
    expect(unpinned.params[LOCATION_VALUE_COLUMNS.indexOf("coordinate_quality")]).toBe(
      "not_geocoded_projection",
    );
    expect(unpinned.params[LOCATION_VALUE_COLUMNS.indexOf("geocode_source")]).toBeNull();
  });
});

describe("write path — link insert contract", () => {
  it("links mints as 'minted' and tier-A merges at the existing entity", () => {
    const { mints, merges } = fixtureMints();
    const { text, params } = buildLinkInsert(mints.slice(0, 1), merges);
    expect(params).toHaveLength(2 * LINK_INSERT_COLUMNS.length);
    expect(params[LINK_INSERT_COLUMNS.indexOf("office_id")]).toBe("gof_ccc");
    expect(params[LINK_INSERT_COLUMNS.indexOf("match_kind")]).toBe("minted");
    const mergeBase = LINK_INSERT_COLUMNS.length;
    expect(params[mergeBase + LINK_INSERT_COLUMNS.indexOf("office_id")]).toBe("gof_aaa");
    expect(params[mergeBase + LINK_INSERT_COLUMNS.indexOf("resource_entity_id")]).toBe(
      EXISTING[0].resource_entity_id,
    );
    expect(params[mergeBase + LINK_INSERT_COLUMNS.indexOf("match_kind")]).toBe("tier_a_merge");
    expect(text).toContain("insert into public.luminari_anchor_office_source_rows");
    expect(text).toContain("on conflict do nothing");
  });
});

describe("write path — family registration + link table (migration)", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261110160000_gov_office_projection_v1.sql",
      import.meta.url,
    ),
    "utf8",
  );
  it("registers the runner's family key in the family contracts", () => {
    expect(migration).toContain("insert into public.luminari_document_family_contracts");
    expect(migration).toContain(`'${SOURCE_FAMILY_KEY}'`);
    expect(migration).toContain("on conflict (family_key) do nothing");
  });
  it("ships in the same migration that creates the projection link table", () => {
    expect(migration).toContain(
      "create table if not exists public.luminari_anchor_office_source_rows",
    );
    expect(migration).toContain("office_id text not null primary key");
    expect(migration).toContain("'minted', 'tier_a_merge'");
  });
});
