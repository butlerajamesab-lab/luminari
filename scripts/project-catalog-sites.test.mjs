import { describe, expect, it } from "vitest";

import {
  buildSiteKey,
  classifySegment,
  extractZip5,
  normalizeForKey,
  parseComponents,
  pickOrgName,
  projectRows,
  splitSegments,
  stableUuid,
  stripLabel,
} from "./project-catalog-sites.mjs";

// Fixtures are real address strings sampled from the live catalog on
// 2026-11-09 (see CATALOG-PROJECTION-DESIGN-2026-11-09.md).

describe("pickOrgName", () => {
  it("rescues a UUID-named row from organization_name", () => {
    expect(
      pickOrgName({
        name: "22476699-9886-53c4-90ab-f51aee3a83f6",
        organization_name: "Indiana Legal Services",
      }),
    ).toEqual({ name: "Indiana Legal Services", unresolved: false });
  });
  it("rescues an artifact-named row from organization_name", () => {
    expect(
      pickOrgName({
        name: "luminari-montana-ENRICHED-PASS3-2026",
        organization_name: "Montana Legal Services",
      }).name,
    ).toBe("Montana Legal Services");
  });
  it("flags a UUID-named row with no organization_name as unresolved", () => {
    expect(
      pickOrgName({ name: "22476699-9886-53c4-90ab-f51aee3a83f6", organization_name: "" })
        .unresolved,
    ).toBe(true);
  });
  it("keeps an ordinary name", () => {
    expect(pickOrgName({ name: "Give an Hour", organization_name: null })).toEqual({
      name: "Give an Hour",
      unresolved: false,
    });
  });
});

describe("segments", () => {
  it("splits multi-site addresses on the segment bar", () => {
    const segs = splitSegments(
      "LACC: 402 N. Harrison Street, Wilmington DE 19806 (302-655-7338) | La Esperanza (Georgetown): 109 Bank Street Suite 2, Georgetown DE 19947 (302-856-0380)",
    );
    expect(segs).toHaveLength(2);
  });
  it("strips a leading label", () => {
    expect(stripLabel("HQ: 1111 I Street Suite 810, Sacramento, CA 95814")).toEqual({
      label: "HQ",
      rest: "1111 I Street Suite 810, Sacramento, CA 95814",
    });
  });
  it("does not strip when there is no early colon", () => {
    expect(stripLabel("251 W Washington St, Phoenix, AZ 85003").label).toBeNull();
  });
});

describe("classifySegment", () => {
  it("classifies clean street addresses as sites", () => {
    expect(classifySegment("1915 W 18th St Ste B, Indianapolis, IN 46202")).toBe("site");
    expect(classifySegment("1220 West Vliet Street, Milwaukee WI 53205")).toBe("site");
    expect(classifySegment("2018 Western Ave, Knoxville TN 37921 (main)")).toBe("site");
  });
  it("classifies PO Boxes as mailing", () => {
    expect(classifySegment("PO Box 1532, Clarksburg, MD 20871")).toBe("mailing");
    expect(classifySegment("PO Box 818, Helena MT 59624")).toBe("mailing");
  });
  it("classifies non-addresses as notes", () => {
    expect(classifySegment("Use ssa.gov locator for current DC addresses (UNVERIFIED)")).toBe(
      "note",
    );
    expect(classifySegment("510-444-6969")).toBe("note");
    expect(classifySegment("19254")).toBe("note");
    expect(classifySegment("Online — statewide")).toBe("note");
    expect(classifySegment("Multiple offices statewide")).toBe("note");
    expect(classifySegment("County offices statewide")).toBe("note");
  });
});

describe("keys", () => {
  it("normalizes case and punctuation", () => {
    expect(normalizeForKey("St. Mary's  Legal-Aid!")).toBe("st mary s legal aid");
  });
  it("merges comma and label variants of one address (live census pair)", () => {
    const a = buildSiteKey(
      "Example Org",
      "120 S LaSalle St Ste 900, Chicago IL 60603 (hosting org)",
      "60603",
    );
    const b = buildSiteKey(
      "Example Org",
      "120 S LaSalle St Ste 900, Chicago, IL 60603",
      "60603",
    );
    expect(a).toBe(b);
  });
  it("keeps different street numbers apart", () => {
    const a = buildSiteKey("Example Org", "120 S LaSalle St, Chicago, IL 60603", "60603");
    const b = buildSiteKey("Example Org", "121 S LaSalle St, Chicago, IL 60603", "60603");
    expect(a).not.toBe(b);
  });
  it("extracts the ZIP5 ahead of a trailing parenthetical", () => {
    expect(extractZip5("2018 Western Ave, Knoxville TN 37921 (main)")).toBe("37921");
    expect(extractZip5("no zip here")).toBeNull();
  });
  it("computes the md5 stable UUID exactly like luminari_stable_uuid_v1", () => {
    expect(stableUuid("")).toBe("d41d8cd9-8f00-b204-e980-0998ecf8427e");
    expect(stableUuid("abc")).toBe("90015098-3cd2-4fb0-d696-3f7d28e17f72");
  });
});

describe("parseComponents", () => {
  it("parses the comma state shape", () => {
    expect(parseComponents("251 W Washington St, Phoenix, AZ 85003")).toEqual({
      street: "251 W Washington St",
      city: "Phoenix",
      state: "AZ",
      zip5: "85003",
    });
  });
  it("parses the space state shape", () => {
    expect(parseComponents("1220 West Vliet Street, Milwaukee WI 53205")).toEqual({
      street: "1220 West Vliet Street",
      city: "Milwaukee",
      state: "WI",
      zip5: "53205",
    });
  });
});

describe("projectRows", () => {
  it("merges duplicate rows into one site and counts the census", () => {
    const rows = [
      {
        civic_object_uid: "uid-b",
        name: "Example Org",
        organization_name: null,
        state_code: "IL",
        address: "120 S LaSalle St Ste 900, Chicago, IL 60603",
      },
      {
        civic_object_uid: "uid-a",
        name: "Example Org",
        organization_name: null,
        state_code: "IL",
        address: "Example Org: 120 S LaSalle St Ste 900, Chicago IL 60603 (hosting org)",
      },
      {
        civic_object_uid: "uid-c",
        name: "Hotline Org",
        organization_name: null,
        state_code: "IL",
        address: "Online — statewide",
      },
    ];
    const { census, sites } = projectRows(rows);
    expect(census.rows).toBe(3);
    expect(census.addressed_rows).toBe(3);
    expect(census.site_segments).toBe(2);
    expect(census.note_segments).toBe(1);
    expect(census.rows_with_key).toBe(2);
    expect(census.physical_sites).toBe(1);
    expect(sites).toHaveLength(1);
    expect(sites[0].members.map((m) => m.civic_object_uid)).toEqual(["uid-a", "uid-b"]);
  });
});
