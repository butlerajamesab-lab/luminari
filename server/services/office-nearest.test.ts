import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ getPool: () => ({ query }) }));

const {
  OFFICE_RESULTS_OVERALL_CAP,
  OFFICE_RESULTS_PER_FAMILY_CAP,
  OFFICE_SITE_MATCH_TOLERANCE_MI,
  assemble_office_results,
  build_office_coverage_sql,
  build_office_nearest_sql,
  find_nearest_offices,
  office_site_match_sql,
} = await import("./office-nearest");
type catalog_contact =
  import("./resource-directory-unified").catalog_contact;

const CONTACTS_SQL_MARKER = "v_luminari_resource_contact_points_current_v3_13";

function nearest_row(overrides: Record<string, unknown> = {}) {
  return {
    resource_entity_id: "11111111-1111-4111-8111-111111111111",
    canonical_id: "gof_0123456789abcdef01234567",
    resource_name: "Social Security Administration",
    family: "ssa",
    address_line1: "915 2nd Ave",
    address_line2: null,
    city: "Seattle",
    state: "WA",
    postal_code: "98174",
    office_hours: "Mon-Fri 9:00 AM - 4:00 PM",
    office_phone: "800-772-1213",
    office_url: "https://www.ssa.gov",
    office_email: null,
    distance_mi: 1.2,
    ...overrides,
  };
}

describe("nearest-office SQL shape (live schema contract)", () => {
  it("reads the unified catalog corpus, not the gov_offices lane", () => {
    const sql = build_office_nearest_sql();
    // The same person-facing corpus CTE the directory and map read.
    expect(sql).toContain("public.luminari_resource_entities");
    expect(sql).toContain("luminari_resource_publication_resolutions");
    expect(sql).toContain("coalesce(p.publication_status, 'active') <> 'inactive'");
    // The person-facing name guard rides inside the corpus CTE.
    expect(sql).toContain("[0-9a-f]{8}-[0-9a-f]{4}");
    // Exact catalog locations only: a place the directory cannot pin
    // cannot appear here.
    expect(sql).toContain("public.luminari_resource_locations");
    expect(sql).toContain("l.latitude is not null");
    expect(sql).toContain("l.longitude is not null");
  });

  it("anchors the population by family provenance through the link table", () => {
    const sql = build_office_nearest_sql();
    expect(sql).toContain("public.luminari_anchor_office_source_rows");
    expect(sql).toContain("public.gov_offices");
    expect(sql).toContain("g.superseded_by is null");
    expect(sql).toContain("office.agency_key as family");
  });

  it("computes haversine distance in SQL with the acos clamp", () => {
    const sql = build_office_nearest_sql();
    expect(sql).toContain("3959 * acos(least(1, greatest(-1,");
    expect(sql).toContain("radians($1)");
    expect(sql).toContain("radians($2)");
    expect(sql).toContain("round((");
    expect(sql).toContain("::numeric, 1)::float8 as distance_mi");
  });

  it("filters radius and families by parameter, caps by rank", () => {
    const sql = build_office_nearest_sql();
    expect(sql).toContain("<= $3");
    expect(sql).toContain("$4::text[] is null or office.agency_key = any($4::text[])");
    expect(sql).toContain("row_number() over");
    expect(sql).toContain("family_rank <= $5");
    expect(sql).toContain("$6::int is null or overall_rank <= $6");
    expect(sql).toContain("order by distance_mi asc");
  });

  it("picks a representative office per family, not one per location", () => {
    const sql = build_office_nearest_sql();
    // A site can link offices of several families; the lateral pick
    // must keep the best-linked office of EACH family (one candidate
    // per location × family) so the family filter — and the
    // families_not_found computation built on it — sees every family
    // the site carries. A single pick per location would silently
    // drop the site's other families.
    expect(sql).toMatch(
      /distinct on \(g\.agency_key\)[\s\S]*?order by\s+g\.agency_key,/,
    );
  });

  it("restricts each family's office candidate to the office's own site", () => {
    const sql = build_office_nearest_sql();
    // The site association is applied INSIDE the lateral, before
    // the per-family pick: an office is a candidate only at the
    // site it belongs to, never at every location of its entity.
    const lateral_start = sql.indexOf("join lateral");
    const lateral_end = sql.indexOf(") office on true");
    const match_at = sql.indexOf("l.source_pk = a.office_id", lateral_start);
    expect(lateral_start).toBeGreaterThan(-1);
    expect(match_at).toBeGreaterThan(lateral_start);
    expect(match_at).toBeLessThan(lateral_end);
    // 1. The minted site key: the projection stamps the location
    //    it mints for an office with the office_id as source_pk.
    expect(sql).toContain(
      "l.source_table = 'gov_office_projection_v1' and l.source_pk = a.office_id",
    );
    // 2. Coordinate agreement for offices with no minted location
    //    (tier-A merges): the office's own coordinates must sit
    //    within the documented tolerance of the site's.
    expect(sql).toContain("g.lat is not null and g.lng is not null");
    expect(sql).toContain(`<= ${OFFICE_SITE_MATCH_TOLERANCE_MI}`);
    expect(OFFICE_SITE_MATCH_TOLERANCE_MI).toBeLessThan(1);
    // 3. The sole-site fallback for coordinate-less offices is
    //    guarded by the absence of a minted location and of any
    //    other geocoded location of the entity.
    expect(sql).toContain("site_key_loc.source_pk = a.office_id");
    expect(sql).toContain("other_loc.location_id <> l.location_id");
  });

  it("coverage counts only sites where a linked office belongs", () => {
    const sql = build_office_coverage_sql();
    // Same association as the search: a multi-site entity's other
    // locations do not inflate the counted population.
    expect(sql).toContain(office_site_match_sql());
  });

  it("coverage counts the same anchored population the search reads", () => {
    const sql = build_office_coverage_sql();
    expect(sql).toContain("count(distinct l.location_id)::int as anchored_office_sites");
    expect(sql).toContain("public.luminari_resource_locations");
    expect(sql).toContain("public.luminari_anchor_office_source_rows");
    expect(sql).toContain("g.superseded_by is null");
  });
});

describe("assemble_office_results", () => {
  it("renders a VA card without a phone when the record carries none", () => {
    const [result] = assemble_office_results(
      [
        nearest_row({
          resource_name: "Everett VA Clinic",
          family: "veterans_affairs",
          office_phone: null,
          office_url: "https://www.va.gov/puget-sound-health-care/",
          office_hours: null,
        }),
      ],
      new Map(),
    );
    expect(result.family).toBe("veterans_affairs");
    expect("phone" in result).toBe(false);
    expect("hours" in result).toBe(false);
    expect(result.url).toBe("https://www.va.gov/puget-sound-health-care/");
    expect(result.distance_mi).toBe(1.2);
  });

  it("falls back to the linked office row when the entity has no reviewed contacts", () => {
    const [result] = assemble_office_results([nearest_row()], new Map());
    expect(result.phone).toBe("800-772-1213");
    expect(result.url).toBe("https://www.ssa.gov");
    expect(result.hours).toBe("Mon-Fri 9:00 AM - 4:00 PM");
    expect(result.address).toBe("915 2nd Ave");
  });

  it("prefers reviewed contact points over the office row, like the directory", () => {
    const entity_id = "11111111-1111-4111-8111-111111111111";
    const reviewed: catalog_contact[] = [
      {
        contact_point_id: "cp-1",
        contact_type: "phone",
        contact_value: "206-555-0147",
        label: "Phone",
        is_primary: true,
        contact_quality: "reviewed",
        manually_reviewed: true,
        manual_source_reference: null,
      },
    ];
    const [result] = assemble_office_results(
      [nearest_row()],
      new Map([[entity_id, reviewed]]),
    );
    expect(result.phone).toBe("206-555-0147");
    // The directory presents the reviewed set alone: no website row
    // exists in it, so none is borrowed from the office row.
    expect("url" in result).toBe(false);
    // Hours live only on the office row and still render.
    expect(result.hours).toBe("Mon-Fri 9:00 AM - 4:00 PM");
  });

  it("drops contact values that are not the kind of contact they claim", () => {
    const entity_id = "11111111-1111-4111-8111-111111111111";
    const reviewed: catalog_contact[] = [
      {
        contact_point_id: "cp-2",
        contact_type: "website",
        contact_value: "call the front desk",
        label: "Website",
        is_primary: true,
        contact_quality: "reviewed",
        manually_reviewed: false,
        manual_source_reference: null,
      },
    ];
    const [result] = assemble_office_results(
      [nearest_row()],
      new Map([[entity_id, reviewed]]),
    );
    expect("url" in result).toBe(false);
  });

  it("composes the street address and leaves it null when the record has none", () => {
    const [with_suite] = assemble_office_results(
      [nearest_row({ address_line2: "Suite 200" })],
      new Map(),
    );
    expect(with_suite.address).toBe("915 2nd Ave, Suite 200");
    const [no_address] = assemble_office_results(
      [nearest_row({ address_line1: null, address_line2: null })],
      new Map(),
    );
    expect(no_address.address).toBeNull();
  });

  it("assembles both family candidates of one site, each from its own office row", () => {
    // The same entity + location linked to an SSA office and a VA
    // office produces one candidate per family; each candidate's
    // hours and fallback contacts come from ITS family's office row.
    const results = assemble_office_results(
      [
        nearest_row(),
        nearest_row({
          resource_name: "VA Puget Sound Health Care",
          family: "veterans_affairs",
          office_hours: "Mon-Fri 8:00 AM - 4:30 PM",
          office_phone: null,
          office_url: "https://www.va.gov/puget-sound-health-care/",
        }),
      ],
      new Map(),
    );
    expect(results.map((r) => r.family)).toEqual([
      "ssa",
      "veterans_affairs",
    ]);
    expect(results[0].phone).toBe("800-772-1213");
    expect(results[0].hours).toBe("Mon-Fri 9:00 AM - 4:00 PM");
    expect(results[1].hours).toBe("Mon-Fri 8:00 AM - 4:30 PM");
    expect(results[1].url).toBe(
      "https://www.va.gov/puget-sound-health-care/",
    );
    expect("phone" in results[1]).toBe(false);
  });

  it("treats blank hours as absent", () => {
    const [result] = assemble_office_results(
      [nearest_row({ office_hours: "   " })],
      new Map(),
    );
    expect("hours" in result).toBe(false);
  });
});

describe("find_nearest_offices", () => {
  beforeEach(() => {
    query.mockReset();
  });

  /**
   * Route the mocked pool: contacts-view queries return no reviewed
   * points; nearest queries answer from a per-radius row table and
   * record every radius they were asked for.
   */
  function mock_radii(rows_by_radius: Record<number, unknown[]>) {
    const radii_asked: number[] = [];
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes(CONTACTS_SQL_MARKER)) return { rows: [] };
      const radius = Number(params[2]);
      radii_asked.push(radius);
      return { rows: rows_by_radius[radius] ?? [] };
    });
    return radii_asked;
  }

  it("returns results in the SQL distance order", async () => {
    mock_radii({
      10: [
        nearest_row({ resource_name: "Near Office", distance_mi: 0.8 }),
        nearest_row({
          resource_entity_id: "22222222-2222-4222-8222-222222222222",
          resource_name: "Far Office",
          distance_mi: 6.4,
        }),
      ],
    });
    const outcome = await find_nearest_offices({
      latitude: 47.606,
      longitude: -122.33,
    });
    expect(outcome.results.map((r) => r.name)).toEqual([
      "Near Office",
      "Far Office",
    ]);
    expect(outcome.results.map((r) => r.distance_mi)).toEqual([0.8, 6.4]);
    expect(outcome.radius_used_mi).toBe(10);
  });

  it("expands the radius 10 → 25 → 50 until an unfiltered search finds an office", async () => {
    const radii_asked = mock_radii({
      50: [nearest_row({ distance_mi: 44.1 })],
    });
    const outcome = await find_nearest_offices({
      latitude: 47.9,
      longitude: -122.2,
    });
    expect(radii_asked).toEqual([10, 25, 50]);
    expect(outcome.radius_used_mi).toBe(50);
    expect(outcome.results).toHaveLength(1);
    expect(outcome.families_not_found).toEqual([]);
  });

  it("passes the overall top-25 cap when unfiltered and no cap when filtered", async () => {
    const seen_params: unknown[][] = [];
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes(CONTACTS_SQL_MARKER)) return { rows: [] };
      seen_params.push(params);
      return { rows: [nearest_row()] };
    });
    await find_nearest_offices({ latitude: 47.6, longitude: -122.3 });
    expect(seen_params[0][3]).toBeNull();
    expect(seen_params[0][4]).toBe(OFFICE_RESULTS_PER_FAMILY_CAP);
    expect(seen_params[0][5]).toBe(OFFICE_RESULTS_OVERALL_CAP);

    seen_params.length = 0;
    await find_nearest_offices({
      latitude: 47.6,
      longitude: -122.3,
      families: ["ssa"],
    });
    expect(seen_params[0][3]).toEqual(["ssa"]);
    expect(seen_params[0][5]).toBeNull();
  });

  it("expands until every requested family has an office in reach", async () => {
    const radii_asked = mock_radii({
      10: [nearest_row()],
      25: [
        nearest_row(),
        nearest_row({
          resource_entity_id: "33333333-3333-4333-8333-333333333333",
          resource_name: "VA Puget Sound",
          family: "veterans_affairs",
          office_phone: null,
          distance_mi: 21.5,
        }),
      ],
    });
    const outcome = await find_nearest_offices({
      latitude: 47.6,
      longitude: -122.3,
      families: ["ssa", "veterans_affairs"],
    });
    expect(radii_asked).toEqual([10, 25]);
    expect(outcome.radius_used_mi).toBe(25);
    expect(outcome.families_not_found).toEqual([]);
    expect(outcome.results.map((r) => r.family)).toEqual([
      "ssa",
      "veterans_affairs",
    ]);
  });

  it("finds the second family of a two-family site without expanding or reporting it missing", async () => {
    // One catalog site (one entity, one location) linked to offices
    // of two families. The nearest query produces one candidate per
    // family for the site, so a filter on the family a single-pick
    // query would have dropped still finds its candidate at the
    // initial radius; the mocked pool applies the family parameter
    // to the candidate rows the way the SQL does.
    const site_candidates = [
      nearest_row({ distance_mi: 1.2 }),
      nearest_row({
        resource_name: "VA Puget Sound Health Care",
        family: "veterans_affairs",
        office_hours: "Mon-Fri 8:00 AM - 4:30 PM",
        office_phone: null,
        office_url: "https://www.va.gov/puget-sound-health-care/",
        distance_mi: 1.2,
      }),
    ];
    const radii_asked: number[] = [];
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes(CONTACTS_SQL_MARKER)) return { rows: [] };
      radii_asked.push(Number(params[2]));
      const families = params[3] as string[] | null;
      const rows = families
        ? site_candidates.filter((row) =>
            families.includes(String(row.family)),
          )
        : site_candidates;
      return { rows };
    });
    const outcome = await find_nearest_offices({
      latitude: 47.6,
      longitude: -122.3,
      families: ["veterans_affairs"],
    });
    expect(radii_asked).toEqual([10]);
    expect(outcome.initial_radius_mi).toBe(10);
    expect(outcome.families_not_found).toEqual([]);
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].family).toBe("veterans_affairs");
    // Hours and website come from the VA office row picked for that
    // family — not from the same site's SSA row.
    expect(outcome.results[0].hours).toBe("Mon-Fri 8:00 AM - 4:30 PM");
    expect(outcome.results[0].url).toBe(
      "https://www.va.gov/puget-sound-health-care/",
    );
    expect("phone" in outcome.results[0]).toBe(false);
  });

  it("names a family that no radius can satisfy instead of substituting another", async () => {
    const radii_asked = mock_radii({
      10: [nearest_row()],
      25: [nearest_row()],
      50: [nearest_row()],
    });
    const outcome = await find_nearest_offices({
      latitude: 47.6,
      longitude: -122.3,
      families: ["ssa", "hud"],
    });
    expect(radii_asked).toEqual([10, 25, 50]);
    expect(outcome.families_not_found).toEqual(["hud"]);
    expect(outcome.results.every((r) => r.family === "ssa")).toBe(true);
  });

  it("drops unknown family keys before they can reach SQL", async () => {
    const seen_params: unknown[][] = [];
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes(CONTACTS_SQL_MARKER)) return { rows: [] };
      seen_params.push(params);
      return { rows: [nearest_row()] };
    });
    await find_nearest_offices({
      latitude: 47.6,
      longitude: -122.3,
      families: ["ssa", "not_a_family", "ssa"],
    });
    expect(seen_params[0][3]).toEqual(["ssa"]);
  });
});

describe("find_nearest_offices — two-location entity (site association)", () => {
  beforeEach(() => {
    query.mockReset();
  });

  // One entity with TWO catalog sites: an SSA office in Seattle and
  // a VA office in Tacoma (the dedupe-merge shape). Each office's
  // minted location carries the office_id as its source_pk — the
  // true site key. The mocked pool emulates the documented SQL
  // semantics over this fixture: candidates are per (location,
  // family) and an office is a candidate only at its own site
  // (minted key → coordinate tolerance → sole-site fallback), so a
  // VA candidate can never materialize at the Seattle address.
  const ENTITY_ID = "44444444-4444-4444-8444-444444444444";
  const SEATTLE = { latitude: 47.6062, longitude: -122.3321 };
  const TACOMA = { latitude: 47.2529, longitude: -122.4443 };

  type fixture_location = {
    location_id: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    latitude: number;
    longitude: number;
    source_table: string | null;
    source_pk: string | null;
  };
  type fixture_office = {
    office_id: string;
    agency_key: string;
    lat: number | null;
    lng: number | null;
    hours: string | null;
    phone_raw: string | null;
    url: string | null;
    email: string | null;
  };

  const locations: fixture_location[] = [
    {
      location_id: "loc-seattle",
      address_line1: "915 2nd Ave",
      city: "Seattle",
      state: "WA",
      postal_code: "98174",
      ...SEATTLE,
      source_table: "gov_office_projection_v1",
      source_pk: "ssa-seattle-office",
    },
    {
      location_id: "loc-tacoma",
      address_line1: "1715 Pacific Ave",
      city: "Tacoma",
      state: "WA",
      postal_code: "98402",
      ...TACOMA,
      source_table: "gov_office_projection_v1",
      source_pk: "va-tacoma-office",
    },
  ];
  const offices: fixture_office[] = [
    {
      office_id: "ssa-seattle-office",
      agency_key: "ssa",
      lat: SEATTLE.latitude,
      lng: SEATTLE.longitude,
      hours: "Mon-Fri 9:00 AM - 4:00 PM",
      phone_raw: "800-772-1213",
      url: "https://www.ssa.gov",
      email: null,
    },
    {
      office_id: "va-tacoma-office",
      agency_key: "veterans_affairs",
      lat: TACOMA.latitude,
      lng: TACOMA.longitude,
      hours: "Mon-Fri 8:00 AM - 4:30 PM",
      phone_raw: "253-555-0180",
      url: "https://www.va.gov/puget-sound-health-care/",
      email: null,
    },
  ];

  function haversine_mi(
    lat_a: number,
    lng_a: number,
    lat_b: number,
    lng_b: number,
  ): number {
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const arg =
      Math.cos(rad(lat_a)) *
        Math.cos(rad(lat_b)) *
        Math.cos(rad(lng_b) - rad(lng_a)) +
      Math.sin(rad(lat_a)) * Math.sin(rad(lat_b));
    return 3959 * Math.acos(Math.min(1, Math.max(-1, arg)));
  }

  /** The site-association rule office_site_match_sql documents. */
  function office_belongs_at_site(
    office: fixture_office,
    location: fixture_location,
  ): boolean {
    if (
      location.source_table === "gov_office_projection_v1" &&
      location.source_pk === office.office_id
    ) {
      return true;
    }
    if (office.lat != null && office.lng != null) {
      return (
        haversine_mi(
          office.lat,
          office.lng,
          location.latitude,
          location.longitude,
        ) <= OFFICE_SITE_MATCH_TOLERANCE_MI
      );
    }
    const has_minted_site = locations.some(
      (candidate) =>
        candidate.source_table === "gov_office_projection_v1" &&
        candidate.source_pk === office.office_id,
    );
    if (has_minted_site) return false;
    return locations.length === 1;
  }

  function mock_fixture_pool() {
    const rows_by_radius = new Map<number, ReturnType<typeof nearest_row>[]>();
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes(CONTACTS_SQL_MARKER)) return { rows: [] };
      const [search_lat, search_lng, radius, families] = params as [
        number,
        number,
        number,
        string[] | null,
      ];
      const rows: ReturnType<typeof nearest_row>[] = [];
      for (const location of locations) {
        const distance = haversine_mi(
          search_lat,
          search_lng,
          location.latitude,
          location.longitude,
        );
        if (distance > radius) continue;
        for (const office of offices) {
          if (!office_belongs_at_site(office, location)) continue;
          if (families && !families.includes(office.agency_key)) continue;
          rows.push(
            nearest_row({
              resource_entity_id: ENTITY_ID,
              resource_name: "Puget Sound Federal Services",
              family: office.agency_key,
              address_line1: location.address_line1,
              city: location.city,
              state: location.state,
              postal_code: location.postal_code,
              office_hours: office.hours,
              office_phone: office.phone_raw,
              office_url: office.url,
              office_email: office.email,
              distance_mi: Math.round(distance * 10) / 10,
            }),
          );
        }
      }
      rows.sort((a, b) => Number(a.distance_mi) - Number(b.distance_mi));
      rows_by_radius.set(radius, rows);
      return { rows };
    });
    return rows_by_radius;
  }

  it("never produces a VA candidate at the Seattle site of a two-site entity", async () => {
    const rows_by_radius = mock_fixture_pool();
    const outcome = await find_nearest_offices({
      latitude: SEATTLE.latitude,
      longitude: SEATTLE.longitude,
      families: ["veterans_affairs"],
    });
    // At the initial radius the VA family has NO candidate: its
    // only office belongs to the Tacoma site ~25 miles away. The
    // pre-fix query returned it at the Seattle address, distance 0,
    // and stopped there.
    const at_initial_radius = rows_by_radius.get(10) ?? [];
    expect(
      at_initial_radius.some((row) => row.family === "veterans_affairs"),
    ).toBe(false);
    expect(outcome.radius_used_mi).toBeGreaterThan(10);
    // Widened, the VA office is found — at ITS site, with ITS
    // office's hours and phone.
    expect(outcome.families_not_found).toEqual([]);
    expect(outcome.results).toHaveLength(1);
    const [va] = outcome.results;
    expect(va.family).toBe("veterans_affairs");
    expect(va.city).toBe("Tacoma");
    expect(va.address).toBe("1715 Pacific Ave");
    expect(va.distance_mi).toBeGreaterThan(10);
    expect(va.hours).toBe("Mon-Fri 8:00 AM - 4:30 PM");
    expect(va.phone).toBe("253-555-0180");
    // No result pairs the VA family with the Seattle site.
    expect(
      outcome.results.some(
        (row) => row.family === "veterans_affairs" && row.city === "Seattle",
      ),
    ).toBe(false);
  });

  it("shows each family at its own site in an unfiltered search", async () => {
    mock_fixture_pool();
    // Midpoint between the two sites: both are inside 25 miles,
    // neither inside 10, so the ladder widens once and returns both.
    const outcome = await find_nearest_offices({
      latitude: 47.4296,
      longitude: -122.3882,
    });
    expect(outcome.radius_used_mi).toBe(25);
    const by_family = new Map(outcome.results.map((row) => [row.family, row]));
    const ssa = by_family.get("ssa");
    expect(ssa?.city).toBe("Seattle");
    expect(ssa?.address).toBe("915 2nd Ave");
    expect(ssa?.hours).toBe("Mon-Fri 9:00 AM - 4:00 PM");
    expect(ssa?.phone).toBe("800-772-1213");
    const va = by_family.get("veterans_affairs");
    expect(va?.city).toBe("Tacoma");
    expect(va?.address).toBe("1715 Pacific Ave");
    expect(va?.hours).toBe("Mon-Fri 8:00 AM - 4:30 PM");
    expect(va?.phone).toBe("253-555-0180");
    // No cross-site rows at all.
    expect(
      outcome.results.some(
        (row) => row.family === "veterans_affairs" && row.city === "Seattle",
      ),
    ).toBe(false);
    expect(
      outcome.results.some(
        (row) => row.family === "ssa" && row.city === "Tacoma",
      ),
    ).toBe(false);
  });
});
