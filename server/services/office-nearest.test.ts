import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ getPool: () => ({ query }) }));

const {
  OFFICE_RESULTS_OVERALL_CAP,
  OFFICE_RESULTS_PER_FAMILY_CAP,
  assemble_office_results,
  build_office_coverage_sql,
  build_office_nearest_sql,
  find_nearest_offices,
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
