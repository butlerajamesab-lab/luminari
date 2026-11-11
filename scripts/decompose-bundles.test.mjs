import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  APPROVED_SHAPES,
  BATCH_ID,
  DECOMPOSITION_VERSION,
  assignLocations,
  buildEntityInsert,
  buildLedgerMintInsert,
  buildLedgerShellInsert,
  buildLinkInsert,
  buildLocationInsert,
  buildLocationValues,
  buildResolutionInsert,
  classifyPair,
  contactsAgree,
  coreName,
  domainOf,
  filterWave1Bundles,
  manifestFor,
  mintedCanonicalFor,
  mintedEntityIdFor,
  normName,
  parseAddressComponents,
  passesPersonFacingNameTest,
  phone10,
  planDecomposition,
  planVariantPairs,
  siteKey,
  stableUuid,
  verifyEmbeddedMints,
} from "./decompose-bundles.mjs";

// The embedded apply set is the bundle census derivation, staged
// into the repo so the run is reproducible from the repo alone.
// These tests hold it to the wave's declared rules: the mechanical
// universe only (40 bundles / 95 names / 190 rows), variant merges
// only on same-core pairs with agreeing contacts, locations cloned
// per shape and never borrowed across bundles, the drift guards,
// and the manifest the production dry run must reproduce.
const EMBEDDED = JSON.parse(
  readFileSync(
    new URL("./bundle-decomposition-proposals-v1.json", import.meta.url),
    "utf-8",
  ),
);

const EXPECTED_MANIFEST =
  "2e5e96fd4187fd82da0ee641e8f664eaf7469b370fa7d496965c029c4d84de95";

describe("census semantic mirrors", () => {
  it("normName collapses whitespace and case-folds", () => {
    expect(normName("  NewBridge   Services (Bergen County DV) ")).toBe(
      "newbridge services (bergen county dv)",
    );
  });

  it("coreName strips parentheticals and dash qualifiers", () => {
    expect(coreName("Center for Arkansas Legal Services (CALS — Central + West AR)")).toBe(
      "center for arkansas legal services",
    );
    expect(coreName("Seattle Indian Health Board (SIHB) — Urban Tribal FQHC")).toBe(
      "seattle indian health board",
    );
  });

  it("classifyPair: same-core variant phrasings", () => {
    expect(
      classifyPair(
        "Center for Arkansas Legal Services (CALS — Central + West AR)",
        "Center for Arkansas Legal Services (CALS)",
      ),
    ).toBe("same_core");
  });

  it("classifyPair: stem-shared distinct organizations", () => {
    expect(
      classifyPair("Central District Food Bank", "University District Food Bank"),
    ).toBe("stem_shared");
  });

  it("classifyPair: unrelated names are not a pair", () => {
    expect(classifyPair("Alabama Appleseed", "Vermont Reach Up / TANF")).toBeNull();
  });

  it("phone10 and domainOf normalize contact evidence", () => {
    expect(phone10("+1 (601) 656-2211")).toBe("6016562211");
    expect(phone10("555-12")).toBeNull();
    expect(domainOf("https://www.Choctaw.org/health?x=1")).toBe("choctaw.org");
    expect(domainOf("")).toBeNull();
  });

  it("siteKey reduces an address to street identity", () => {
    expect(siteKey("129 pleasant st concord nh 03301")).toBe("129 pleasant st");
    expect(siteKey("disasterassistance gov")).toBeNull();
    expect(siteKey("po box 1555 somewhere")).toBe("po box 1555");
  });

  it("stableUuid matches the live-verified luminari_stable_uuid_v1 vector", () => {
    // Verified against production 2026-11-11:
    // select luminari_stable_uuid_v1('bundle_decomposition:crp_nj_...:cooper ...')
    expect(
      stableUuid(
        "bundle_decomposition:crp_nj_d6cbd49a126d9396368f:cooper university hospital — camden safety net",
      ),
    ).toBe("127c1f19-6069-b7bd-8797-030d81b0ca1c");
  });
});

describe("contactsAgree", () => {
  const rows = (phone, website) => [{ uid: "u1", phone, website }];
  it("agrees when phone and website match in any surface format", () => {
    expect(
      contactsAgree(
        rows("601-656-2211", "choctaw.org"),
        rows("+1 (601) 656-2211", "https://www.choctaw.org/"),
      ),
    ).toBe(true);
  });
  it("disagrees on a different phone", () => {
    expect(
      contactsAgree(rows("601-656-2211", "choctaw.org"), rows("601-656-9999", "choctaw.org")),
    ).toBe(false);
  });
  it("disagrees on a different website", () => {
    expect(
      contactsAgree(rows("601-656-2211", "choctaw.org"), rows("601-656-2211", "other.org")),
    ).toBe(false);
  });
  it("never agrees without phone evidence", () => {
    expect(contactsAgree(rows("", "choctaw.org"), rows("", "choctaw.org"))).toBe(false);
  });
});

describe("planVariantPairs", () => {
  const rec = (program_name, uid, phone, website) => ({
    program_name,
    rows: [{ uid, phone, website }],
  });
  it("merges a same-core pair whose contacts agree, keeping the fuller phrasing", () => {
    const { mints, held } = planVariantPairs([
      rec("Center for Arkansas Legal Services (CALS)", "u2", "501-376-3423", "arkansaslegalservices.org"),
      rec("Center for Arkansas Legal Services (CALS — Central + West AR)", "u1", "(501) 376-3423", "https://arkansaslegalservices.org"),
      rec("Unrelated Program", "u3", "999-999-9999", "unrelated.org"),
    ]);
    expect(held).toEqual([]);
    expect(mints).toHaveLength(2);
    const merged = mints.find((m) => m.absorbed_names.length === 1);
    expect(merged.program_name).toBe(
      "Center for Arkansas Legal Services (CALS — Central + West AR)",
    );
    expect(merged.absorbed_names).toEqual(["Center for Arkansas Legal Services (CALS)"]);
    expect(merged.rows.map((r) => r.uid)).toEqual(["u1", "u2"]);
  });

  it("holds BOTH names of a same-core pair whose contacts disagree", () => {
    const { mints, held } = planVariantPairs([
      rec("Prairie State Legal Services (North/Central IL)", "u1", "815-965-2902", "pslegal.org"),
      rec("Prairie State Legal Services (North/Central IL — 36 Counties)", "u2", "312-555-0100", "pslegal.org"),
    ]);
    expect(mints).toEqual([]);
    expect(held.map((h) => h.program_name).sort()).toEqual([
      "Prairie State Legal Services (North/Central IL — 36 Counties)",
      "Prairie State Legal Services (North/Central IL)",
    ]);
    expect(held.every((h) => h.reason === "variant_pair_contacts_disagree")).toBe(true);
  });

  it("holds stem-shared pairs — distinct programs are a judgment, not a merge", () => {
    const { mints, held } = planVariantPairs([
      rec("Central District Food Bank", "u1", "206-555-0101", "example.org"),
      rec("University District Food Bank", "u2", "206-555-0101", "example.org"),
    ]);
    expect(mints).toEqual([]);
    expect(held).toHaveLength(2);
    expect(held.every((h) => h.reason === "variant_pair_stem_shared")).toBe(true);
  });

  it("a name in a held pair never joins a merge group through a third name", () => {
    const { mints, held } = planVariantPairs([
      rec("Legal Aid Society (Nashville)", "u1", "615-555-0100", "las.org"),
      rec("Legal Aid Society (Nashville — 48 counties)", "u2", "615-555-0199", "las.org"),
      rec("Legal Aid Society", "u3", "615-555-0100", "las.org"),
    ]);
    // u1/u2 disagree -> both held. u3 pairs same-core with both and
    // agrees with u1 but disagrees with u2, so u3 is held too.
    expect(mints).toEqual([]);
    expect(held).toHaveLength(3);
  });
});

describe("filterWave1Bundles", () => {
  const base = {
    bundle_entity_id: "b1",
    bundle_canonical_id: "crp_xx_1",
    state: "XX",
    current_name: "artifact",
    shape: "shared_site_split",
    held_rows: [],
    names: [{ program_name: "A Program", rows: [{ uid: "u1" }] }],
    n_rows_total: 1,
    n_attributed: 1,
    location_descriptors: [],
  };
  it("approves mechanical shapes only", () => {
    expect(APPROVED_SHAPES).toEqual(["clean_split", "shared_site_split"]);
    const { approved, excluded } = filterWave1Bundles([
      base,
      { ...base, bundle_entity_id: "b2", shape: "needs_judgment" },
      { ...base, bundle_entity_id: "b3", held_rows: [{ uid: "u9", why: "unattributable" }] },
      { ...base, bundle_entity_id: "b4", n_attributed: 0 },
      { ...base, bundle_entity_id: "b5", names: [{ program_name: "Rowless", rows: [] }] },
    ]);
    expect(approved.map((b) => b.bundle_entity_id)).toEqual(["b1"]);
    expect(excluded.map((e) => e.reason)).toEqual([
      "shape_not_mechanical",
      "unattributable_rows_present",
      "attribution_incomplete",
      "name_without_rows",
    ]);
  });
});

describe("parseAddressComponents", () => {
  it("parses the real clean-split addresses, including trailing prose", () => {
    expect(parseAddressComponents("One Cooper Plaza, Camden NJ 08103")).toEqual({
      street: "One Cooper Plaza", city: "Camden", state: "NJ", zip5: "08103",
    });
    expect(parseAddressComponents("One Capitol Hill, Providence RI 02908")).toEqual({
      street: "One Capitol Hill", city: "Providence", state: "RI", zip5: "02908",
    });
    expect(
      parseAddressComponents("57 Howard Ave, Cranston RI 02920 DHS offices statewide"),
    ).toEqual({ street: "57 Howard Ave", city: "Cranston", state: "RI", zip5: "02920" });
    expect(
      parseAddressComponents("186 Blackstone St, Woonsocket RI 02895 Also West Warwick"),
    ).toEqual({ street: "186 Blackstone St", city: "Woonsocket", state: "RI", zip5: "02895" });
  });
  it("rejects non-addresses", () => {
    expect(parseAddressComponents("Online — statewide")).toBeNull();
    expect(parseAddressComponents("statewide, call for locations")).toBeNull();
    expect(parseAddressComponents(null)).toBeNull();
  });
});

describe("assignLocations", () => {
  const descriptors = [
    { location_id: "L1", site_key: "129 pleasant st", has_coords: true, city: "Concord" },
    { location_id: "L2", site_key: "410 2nd ave", has_coords: false, city: "Seattle" },
  ];
  it("shared-site: every minted entity clones every bundle location", () => {
    const out = assignLocations(
      { shape: "shared_site_split", location_descriptors: descriptors },
      { site_keys: ["129 pleasant st"], own_address_text: null },
    );
    expect(out.clone_indices).toEqual([0, 1]);
    expect(out.fresh).toBeNull();
  });
  it("shared-site with no bundle locations: fresh base location from the name's own rows", () => {
    const out = assignLocations(
      { shape: "shared_site_split", location_descriptors: [] },
      { site_keys: ["129 pleasant st"], own_address_text: "129 Pleasant St, Concord NH 03301" },
    );
    expect(out.clone_indices).toEqual([]);
    expect(out.fresh).toEqual({
      street: "129 Pleasant St", city: "Concord", state: "NH", zip5: "03301",
    });
  });
  it("clean split: clones only the site-key match; fresh when nothing matches", () => {
    const bundle = { shape: "clean_split", location_descriptors: descriptors };
    expect(
      assignLocations(bundle, { site_keys: ["410 2nd ave"], own_address_text: "410 2nd Ave, Seattle WA 98104" }).clone_indices,
    ).toEqual([1]);
    const fresh = assignLocations(bundle, {
      site_keys: ["999 other st"],
      own_address_text: "999 Other St, Dover NH 03820",
    });
    expect(fresh.clone_indices).toEqual([]);
    expect(fresh.fresh).toEqual({ street: "999 Other St", city: "Dover", state: "NH", zip5: "03820" });
  });
  it("never borrows a sibling bundle's pin: a key that exists only in ANOTHER bundle yields no clone", () => {
    const mine = { shape: "clean_split", location_descriptors: [descriptors[0]] };
    const out = assignLocations(mine, {
      site_keys: ["410 2nd ave"], // a site key of the other bundle's descriptor L2
      own_address_text: "410 2nd Ave, Seattle WA 98104",
    });
    expect(out.clone_indices).toEqual([]);
    expect(out.fresh).toEqual({
      street: "410 2nd Ave", city: "Seattle", state: "WA", zip5: "98104",
    });
  });
  it("a name with no parseable address mints location-less", () => {
    const out = assignLocations(
      { shape: "clean_split", location_descriptors: [] },
      { site_keys: [], own_address_text: "Online — statewide" },
    );
    expect(out).toEqual({ clone_indices: [], fresh: null });
  });
});

describe("planDecomposition drift guards", () => {
  const bundle = {
    bundle_entity_id: "00000000-0000-4000-8000-000000000001",
    bundle_canonical_id: "crp_nh_aaaaaaaaaaaaaaaaaaaa",
    family: "catalog_remainder_projection_v1",
    state: "NH",
    city: "Concord",
    jurisdiction: "NH",
    layer: "backbone_workbook",
    current_name: "luminari-new-hampshire-ENRICHED-PASS3-2026",
    shape: "shared_site_split",
    n_rows_total: 2,
    n_attributed: 2,
    held_rows: [],
    names: [
      {
        program_name: "NH SNAP (DHHS)",
        rows: [
          { uid: "uid:1", sheet: "pass3_program_card", row: 10, gen: "v3_13", via: "direct", phone: "603-271-9700", website: "dhhs.nh.gov" },
          { uid: "uid:2", sheet: "pass3_program_card", row: 10, gen: "(9)", via: "mirror", phone: "603-271-9700", website: "dhhs.nh.gov" },
        ],
        site_keys: ["129 pleasant st"],
        own_address_text: "129 Pleasant St, Concord NH 03301",
      },
    ],
    location_descriptors: [
      { location_id: "loc-1", site_key: "129 pleasant st", has_coords: true, city: "Concord" },
    ],
  };
  bundle.names[0].minted_entity_id = mintedEntityIdFor(bundle.bundle_canonical_id, normName("NH SNAP (DHHS)"));
  bundle.names[0].minted_canonical_id = mintedCanonicalFor(bundle.bundle_canonical_id, "NH", normName("NH SNAP (DHHS)"));
  bundle.names[0].merged_from = [];

  const liveBase = () => ({
    entitiesById: new Map([
      [bundle.bundle_entity_id, { resource_entity_id: bundle.bundle_entity_id, resource_name: bundle.current_name }],
    ]),
    linksByBundle: new Map([
      [bundle.bundle_entity_id, new Map([["uid:1", {}], ["uid:2", {}]])],
    ]),
    locationsByBundle: new Map([
      [bundle.bundle_entity_id, [{ location_id: "loc-1", address_line1: "129 Pleasant St" }]],
    ]),
    resolutionsById: new Map(),
    ledgerBundleIds: new Set(),
    entitiesByCanonical: new Map(),
  });
  const plan = (b, live) =>
    planDecomposition([b], live, new Map([[b.bundle_entity_id, planVariantPairs(b.names)]]));

  it("plans a clean bundle and recomputes the minted identity", () => {
    const { planned, drift, missing } = plan(bundle, liveBase());
    expect(drift).toEqual([]);
    expect(missing).toEqual([]);
    expect(planned).toHaveLength(1);
    expect(planned[0].mints[0].minted_canonical_id).toBe(bundle.names[0].minted_canonical_id);
    expect(planned[0].mints[0].rows.map((r) => r.uid)).toEqual(["uid:1", "uid:2"]);
    expect(planned[0].mints[0].rows[1].via).toBe("mirror");
  });
  it("drifts when the bundle's current name changed since the census", () => {
    const live = liveBase();
    live.entitiesById.get(bundle.bundle_entity_id).resource_name = "renamed!";
    expect(plan(bundle, live).drift[0].reason).toBe("name_changed");
  });
  it("drifts when the link-row set changed", () => {
    const live = liveBase();
    live.linksByBundle.get(bundle.bundle_entity_id).delete("uid:2");
    expect(plan(bundle, live).drift[0].reason).toBe("link_set_changed");
  });
  it("drifts when a bundle location changed", () => {
    const live = liveBase();
    live.locationsByBundle.set(bundle.bundle_entity_id, [
      { location_id: "loc-1", address_line1: "999 Moved Ave" },
    ]);
    expect(plan(bundle, live).drift[0].reason).toBe("locations_changed");
  });
  it("drifts when a publication resolution already exists", () => {
    const live = liveBase();
    live.resolutionsById.set(bundle.bundle_entity_id, "active");
    expect(plan(bundle, live).drift[0].reason).toBe("resolution_present");
  });
  it("drifts when a minted canonical already exists outside the decomposition", () => {
    const live = liveBase();
    live.entitiesByCanonical.set(bundle.names[0].minted_canonical_id, { resource_entity_id: "other" });
    expect(plan(bundle, live).drift[0].reason).toBe("canonical_collision");
  });
  it("classifies a fully decomposed bundle as already_applied (re-runnable)", () => {
    const live = liveBase();
    live.ledgerBundleIds.add(bundle.bundle_entity_id);
    live.resolutionsById.set(bundle.bundle_entity_id, "inactive");
    live.entitiesByCanonical.set(bundle.names[0].minted_canonical_id, {
      resource_entity_id: bundle.names[0].minted_entity_id,
    });
    const { planned, alreadyApplied } = plan(bundle, live);
    expect(planned).toEqual([]);
    expect(alreadyApplied).toHaveLength(1);
  });
  it("reports a vanished bundle as missing", () => {
    const live = liveBase();
    live.entitiesById.clear();
    expect(plan(bundle, live).missing).toEqual([bundle.bundle_entity_id]);
  });
  it("holds the bundle when the recomputed variant plan holds a name", () => {
    const twoNames = {
      ...bundle,
      names: [
        bundle.names[0],
        {
          program_name: "NH SNAP (DHHS — statewide)",
          rows: [{ uid: "uid:3", sheet: "pass3_program_card", row: 11, gen: "v3_13", via: "direct", phone: "603-555-0000", website: "dhhs.nh.gov" }],
          site_keys: ["129 pleasant st"],
          own_address_text: "129 Pleasant St, Concord NH 03301",
        },
      ],
    };
    const { planned, drift } = plan(twoNames, liveBase());
    expect(planned).toEqual([]);
    expect(drift[0].reason).toBe("variant_names_held");
  });
});

describe("write builders", () => {
  const bundle = {
    bundle_entity_id: "00000000-0000-4000-8000-000000000001",
    bundle_canonical_id: "crp_nh_aaaaaaaaaaaaaaaaaaaa",
    state: "NH",
    city: "Concord",
    jurisdiction: "NH",
    layer: "backbone_workbook",
    shape: "shared_site_split",
    held_rows: [],
    location_descriptors: [
      { location_id: "loc-1", site_key: "129 pleasant st", has_coords: true, city: "Concord" },
    ],
  };
  const mint = {
    bundle_entity_id: bundle.bundle_entity_id,
    program_name: "NH SNAP (DHHS)",
    norm_name: "nh snap (dhhs)",
    minted_entity_id: "11111111-1111-4111-8111-111111111111",
    minted_canonical_id: "bdp_nh_0123456789abcdef0123",
    absorbed_names: [],
    rows: [{ uid: "uid:1", sheet: "pass3_program_card", row: 10, gen: "v3_13", via: "direct" }],
    site_keys: ["129 pleasant st"],
    own_address_text: "129 Pleasant St, Concord NH 03301",
    city: "Concord",
  };

  it("entity insert: canonical identity, category NULL (unreviewed), source_pk = canonical", () => {
    const built = buildEntityInsert(bundle, [mint]);
    expect(built.text).toContain("insert into public.luminari_resource_entities");
    expect(built.params).toHaveLength(19);
    expect(built.params[1]).toBe("bdp_nh_0123456789abcdef0123"); // canonical_id
    expect(built.params[4]).toBe("bdp_nh_0123456789abcdef0123"); // source_pk
    expect(built.params[8]).toBeNull(); // resource_category stays UNREVIEWED
    expect(built.params[6]).toBe("NH SNAP (DHHS)");
  });

  it("location values: clones copy coordinates and provenance; fresh rows carry none", () => {
    const liveById = new Map([
      ["loc-1", {
        location_id: "loc-1", address_line1: "129 Pleasant St", address_line2: null,
        city: "Concord", county: null, state: "NH", postal_code: "03301",
        country: "US", latitude: 43.2, longitude: -71.5,
        coordinate_quality: "census_match_exact", geocode_source: "us_census_geocoder_batch",
        metadata: { site_kind: "site" },
      }],
    ]);
    const cloneRows = buildLocationValues(bundle, mint, liveById);
    expect(cloneRows).toHaveLength(1);
    expect(cloneRows[0].latitude).toBe(43.2);
    expect(cloneRows[0].source_pk).toBe("bdp_nh_0123456789abcdef0123_loc1");
    expect(cloneRows[0].metadata.cloned_from_location_id).toBe("loc-1");
    expect(cloneRows[0].metadata.site_kind).toBe("site");

    const noLocBundle = { ...bundle, location_descriptors: [] };
    const freshRows = buildLocationValues(noLocBundle, mint, new Map());
    expect(freshRows).toHaveLength(1);
    expect(freshRows[0].latitude).toBeNull();
    expect(freshRows[0].coordinate_quality).toBe("not_geocoded_projection");
    expect(freshRows[0].address_line1).toBe("129 Pleasant St");

    const insert = buildLocationInsert(cloneRows);
    expect(insert.params).toHaveLength(15);
    expect(insert.text).toContain("insert into public.luminari_resource_locations");
  });

  it("link insert records the census attribution per row", () => {
    const live = new Map([
      ["uid:1", { object_ref: "ref-1", artifact_key: "v3_13.xlsx", source_content_sha256: "abc" }],
    ]);
    const built = buildLinkInsert(bundle, [mint], live);
    expect(built.text).toContain("luminari_bundle_decomposition_source_rows");
    expect(built.params).toContain("pass3_program_card");
    expect(built.params).toContain("v3_13");
    expect(built.params).toContain("direct");
    expect(built.params).toContain(DECOMPOSITION_VERSION);
  });

  it("ledger inserts: mint rows carry evidence; the shell row enumerates held rows", () => {
    const mintBuilt = buildLedgerMintInsert(bundle, [mint], EXPECTED_MANIFEST);
    expect(mintBuilt.params).toContain("mint");
    expect(mintBuilt.params).toContain(BATCH_ID);
    const evidence = JSON.parse(mintBuilt.params[7]);
    expect(evidence.rows).toHaveLength(1);
    expect(evidence.merged_from).toEqual([]);

    const shellBuilt = buildLedgerShellInsert(bundle, [mint], EXPECTED_MANIFEST);
    expect(shellBuilt.params[0]).toBe("shell_retirement");
    expect(shellBuilt.params[3]).toBeNull(); // minted_entity_id
    expect(JSON.parse(shellBuilt.params[10])).toEqual([]); // held_rows

    const heldBundle = { ...bundle, held_rows: [{ uid: "uid:9", why: "(9)-gen row, mirror uncorroborated" }] };
    const heldShell = buildLedgerShellInsert(heldBundle, [mint], EXPECTED_MANIFEST);
    expect(JSON.parse(heldShell.params[10])).toHaveLength(1);
  });

  it("resolution insert retires the shell as inactive and names the successors", () => {
    const built = buildResolutionInsert(bundle, [mint]);
    expect(built.params[0]).toBe(bundle.bundle_entity_id);
    expect(built.params[1]).toBe("inactive");
    expect(built.params[3]).toContain("bdp_nh_0123456789abcdef0123");
    expect(built.text).toContain("on conflict (resource_entity_id) do nothing");
    // reviewed_at is NOT NULL with no default in the live schema —
    // the insert must supply it (dress-rehearsal finding).
    expect(built.text).toContain("reviewed_at");
    expect(built.text).toContain("now()");
  });
});

describe("embedded-set contract (the wave-1 census derivation)", () => {
  const { approved, excluded } = filterWave1Bundles(EMBEDDED);

  it("the filter approves exactly the 40 mechanical bundles", () => {
    expect(approved).toHaveLength(40);
    expect(excluded).toEqual([]);
    const shapes = approved.map((b) => b.shape).sort();
    expect(shapes.filter((s) => s === "clean_split")).toHaveLength(2);
    expect(shapes.filter((s) => s === "shared_site_split")).toHaveLength(38);
  });

  it("40 bundles / 95 names / 190 rows, attribution complete per bundle", () => {
    const names = approved.flatMap((b) => b.names);
    expect(names).toHaveLength(95);
    expect(names.reduce((n, name) => n + name.rows.length, 0)).toBe(190);
    for (const b of approved) {
      const sum = b.names.reduce((n, name) => n + name.rows.length, 0);
      expect(sum).toBe(b.n_rows_total);
      expect(b.n_attributed).toBe(b.n_rows_total);
      expect(b.held_rows).toEqual([]);
    }
  });

  it("the variant recompute finds no pairs inside wave 1: 95 mints, 0 merges, 0 held", () => {
    let mints = 0;
    for (const b of approved) {
      const plan = planVariantPairs(b.names);
      expect(plan.held).toEqual([]);
      expect(plan.mints.every((m) => m.absorbed_names.length === 0)).toBe(true);
      expect(verifyEmbeddedMints(b, plan.mints)).toBe(true);
      mints += plan.mints.length;
    }
    expect(mints).toBe(95);
    for (const b of approved) {
      for (const n of b.names) {
        expect(n.pair_decision).toBe("split");
        expect(n.merged_from).toEqual([]);
      }
    }
  });

  it("identities are the census scheme and every name passes the person-facing test", () => {
    for (const b of approved) {
      for (const n of b.names) {
        const norm = normName(n.program_name);
        expect(n.norm_name).toBe(norm);
        expect(n.minted_canonical_id).toBe(
          mintedCanonicalFor(b.bundle_canonical_id, b.state, norm),
        );
        expect(n.minted_canonical_id).toMatch(/^bdp_[a-z]{2}_[0-9a-f]{20}$/);
        expect(n.minted_entity_id).toBe(mintedEntityIdFor(b.bundle_canonical_id, norm));
        expect(passesPersonFacingNameTest(n.program_name)).toBe(true);
        expect(n.program_name.toLowerCase()).not.toContain("enriched");
      }
    }
  });

  it("location plan reproduces the census: 49 minted with coordinates, 90 locations (68 clones + 22 fresh)", () => {
    let withCoords = 0;
    let clones = 0;
    let fresh = 0;
    for (const b of approved) {
      for (const n of b.names) {
        const out = assignLocations(b, n);
        const embedded = b.assignment[n.norm_name];
        expect(out.clone_indices).toEqual(embedded.clones);
        expect(out.fresh).toEqual(embedded.fresh);
        clones += out.clone_indices.length;
        if (out.fresh) fresh += 1;
        const has = out.clone_indices.some((i) => b.location_descriptors[i].has_coords);
        expect(has).toBe(embedded.has_coords);
        if (has) withCoords += 1;
      }
    }
    expect(withCoords).toBe(49);
    expect(clones).toBe(68);
    expect(fresh).toBe(22);
    expect(clones + fresh).toBe(90);
  });

  it("the manifest reproduces regardless of bundle order", () => {
    const records = approved.flatMap((b) =>
      b.names.map((n) => ({ bundle_entity_id: b.bundle_entity_id, norm_name: n.norm_name })),
    );
    expect(manifestFor(records)).toBe(EXPECTED_MANIFEST);
    expect(manifestFor([...records].reverse())).toBe(EXPECTED_MANIFEST);
  });
});
