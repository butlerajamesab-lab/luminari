import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ getPool: () => ({ query }) }));

const {
  NON_DISPLAY_CATEGORY,
  build_unified_detail_sql,
  build_unified_map_points_sql,
  build_unified_search_sql,
  build_unified_summary_sql,
  clear_unified_catalog_summary_cache,
  display_memberships,
  display_primary_category,
  get_unified_catalog_detail,
  get_unified_catalog_summary,
  is_email_shaped,
  is_human_display_name,
  is_phone_shaped,
  is_url_shaped,
  person_facing_name_sql,
  sanitize_contacts,
  search_unified_catalog,
  unified_corpus_cte_sql,
} = await import("./resource-directory-unified");

describe("person-facing name guard", () => {
  it("accepts real place and organization names", () => {
    expect(is_human_display_name("Butte Falls Police Department")).toBe(true);
    expect(is_human_display_name("MassHire North Central Career Center")).toBe(
      true,
    );
    expect(is_human_display_name("Genesis Shelter")).toBe(true);
  });

  it("rejects UUIDs, bare hashes, and pipeline artifact labels as titles", () => {
    expect(
      is_human_display_name("58475814-e7e2-5b3d-a325-0e807e93f260"),
    ).toBe(false);
    expect(is_human_display_name("9f68be2b4c1d2e3f405060708090a0b1")).toBe(
      false,
    );
    expect(is_human_display_name("luminari-oregon-ENRICHED-PASS3-2026")).toBe(
      false,
    );
    expect(is_human_display_name("")).toBe(false);
    expect(is_human_display_name("   ")).toBe(false);
    expect(is_human_display_name(null)).toBe(false);
    expect(is_human_display_name(undefined)).toBe(false);
  });

  it("rejects artifact-shaped 'enriched' pass labels, hyphen or underscore delimited", () => {
    // No luminari- prefix on these: the enriched clause alone decides.
    expect(is_human_display_name("something_ENRICHED_v2")).toBe(false);
    expect(is_human_display_name("example-ENRICHED-PASS2-2026")).toBe(false);
    expect(is_human_display_name("example-enriched")).toBe(false);
  });

  it("accepts genuine names that contain the word Enriched", () => {
    // A real LAUSD school in the gov-office projection; the blanket
    // 'enriched' clause held it out of the catalog by its own name.
    expect(is_human_display_name("Westchester Enriched Sciences Magnets")).toBe(
      true,
    );
  });

  it("mirrors the same rules in SQL", () => {
    const sql = person_facing_name_sql("e.resource_name");
    expect(sql).toContain("e.resource_name !~*");
    expect(sql).toContain("[0-9a-f]{8}-[0-9a-f]{4}");
    expect(sql).toContain("^luminari[-_]");
    expect(sql).toContain("enriched");
    // The SQL twin carries the same narrowed artifact shape — never
    // the blanket word.
    expect(sql).toContain("(^|[-_])enriched([-_]|$)");
    expect(sql).not.toContain("!~* 'enriched'");
  });
});

describe("contact type-fidelity guards", () => {
  it("requires email-shaped values for email contacts", () => {
    expect(is_email_shaped("help@example.org")).toBe(true);
    expect(is_email_shaped("25170")).toBe(false);
    expect(is_email_shaped("not-an-email")).toBe(false);
    expect(is_email_shaped("a@b")).toBe(false);
    expect(is_email_shaped("")).toBe(false);
  });

  it("requires URL-shaped values for website contacts", () => {
    expect(is_url_shaped("https://genesisshelter.org")).toBe(true);
    expect(is_url_shaped("wscadv.org")).toBe(true);
    expect(is_url_shaped("25170")).toBe(false);
    expect(is_url_shaped("call us maybe")).toBe(false);
  });

  it("requires dialable digits for phone contacts, hotlines included", () => {
    expect(is_phone_shaped("(541) 865-3200")).toBe(true);
    expect(is_phone_shaped("988")).toBe(true);
    expect(is_phone_shaped("n/a")).toBe(false);
  });

  it("drops mislabeled contacts instead of rendering them under the wrong kind", () => {
    const contacts = [
      {
        contact_point_id: "1",
        contact_type: "email",
        contact_value: "25170",
        label: "Email",
        is_primary: true,
        contact_quality: "source_attached",
        manually_reviewed: false,
        manual_source_reference: null,
      },
      {
        contact_point_id: "2",
        contact_type: "email",
        contact_value: "help@genesis.org",
        label: "Email",
        is_primary: false,
        contact_quality: "source_attached",
        manually_reviewed: false,
        manual_source_reference: null,
      },
      {
        contact_point_id: "3",
        contact_type: "website",
        contact_value: "https://genesisshelter.org",
        label: "Website",
        is_primary: false,
        contact_quality: "source_attached",
        manually_reviewed: false,
        manual_source_reference: null,
      },
      {
        contact_point_id: "4",
        contact_type: "phone",
        contact_value: "404-522-5059",
        label: "Phone",
        is_primary: false,
        contact_quality: "source_attached",
        manually_reviewed: false,
        manual_source_reference: null,
      },
    ];
    const kept = sanitize_contacts(contacts);
    expect(kept.map((contact) => contact.contact_point_id)).toEqual([
      "2",
      "3",
      "4",
    ]);
  });
});

describe("category display rules", () => {
  it("never displays the workbook storage class as a need category", () => {
    expect(NON_DISPLAY_CATEGORY).toBe("workbook_record");
    expect(display_primary_category("workbook_record")).toBeNull();
    expect(display_primary_category("healthcare")).toBe("healthcare");
    expect(display_primary_category(null)).toBeNull();
    expect(
      display_memberships(["workbook_record", "housing", " housing "]),
    ).toEqual(["housing", "housing"]);
  });
});

describe("unified catalog query contracts", () => {
  it("roots every read in the one person-facing corpus over the entity catalog", () => {
    for (const sql of [
      build_unified_summary_sql(),
      build_unified_search_sql(),
      build_unified_detail_sql(),
      build_unified_map_points_sql(),
    ]) {
      expect(sql).toContain("public.luminari_resource_entities");
      expect(sql).toContain("corpus as (");
      expect(sql).toContain("[0-9a-f]{8}-[0-9a-f]{4}");
    }
    expect(unified_corpus_cte_sql()).toContain(
      "luminari_resource_publication_resolutions",
    );
  });

  it("serves map points from catalog locations only — no locator-table lane, no reviewed-view lane", () => {
    const sql = build_unified_map_points_sql();
    expect(sql).toContain("public.luminari_resource_locations");
    expect(sql).not.toContain("public.gov_offices");
    expect(sql).not.toContain("v_luminari_resource_locations_current");
    expect(sql).not.toContain("manual_map_eligible is true");
    expect(sql).toContain("l.latitude is not null");
  });

  it("governs pins with the same primary-or-membership category rule as search", () => {
    const points_sql = build_unified_map_points_sql();
    expect(points_sql).toContain("e.resource_category = $5");
    expect(points_sql).toContain("$5 = any(coalesce(e.service_categories");
    const search_sql = build_unified_search_sql();
    expect(search_sql).toContain("c.resource_category = $2");
    expect(search_sql).toContain("$2 = any(coalesce(c.service_categories");
  });

  it("counts the filtered search total exactly so it can reconcile with the summary", () => {
    const sql = build_unified_search_sql();
    expect(sql).toContain("(select count(*)::int from filtered) as total");
  });

  it("excludes publication-retired entities from held_for_naming so the panel reconciles", () => {
    // Regression pin (2026-11-11): the held subquery originally tallied
    // every name-failing entity row with no publication-resolution
    // filter, so bundle wave 1's 40 retired shells stayed counted as
    // held (panel 1,126) after they had left the substantive held
    // population (1,086). The subquery must apply the corpus CTE's own
    // resolution exclusion alongside the negated name test.
    const sql = build_unified_summary_sql();
    const alias_at = sql.indexOf("as held_for_naming_count");
    expect(alias_at).toBeGreaterThan(0);
    const subquery_start = sql.lastIndexOf(
      "(select count(*)::int from public.luminari_resource_entities e",
      alias_at,
    );
    expect(subquery_start).toBeGreaterThan(0);
    const held_subquery = sql.slice(subquery_start, alias_at);
    expect(held_subquery).toContain(
      "left join public.luminari_resource_publication_resolutions p",
    );
    expect(held_subquery).toContain(
      "coalesce(p.publication_status, 'active') <> 'inactive'",
    );
    expect(held_subquery).toContain("and not (");
    // The sibling inactive_resources count is intentionally the mirror
    // image — resolution-based, name-positive — and must not be
    // "fixed" into the held shape.
    const inactive_alias_at = sql.indexOf("as inactive_resources");
    const inactive_start = sql.lastIndexOf(
      "(select count(*)::int from public.luminari_resource_entities e",
      inactive_alias_at,
    );
    const inactive_subquery = sql.slice(inactive_start, inactive_alias_at);
    expect(inactive_subquery).toContain("p.publication_status = 'inactive'");
    expect(inactive_subquery).not.toContain("and not (");
  });

  it("keeps the workbook storage class out of the category dimension", () => {
    expect(build_unified_summary_sql()).toContain(
      "m.category_key <> 'workbook_record'",
    );
    expect(build_unified_map_points_sql()).toContain(
      "e.resource_category = 'workbook_record'",
    );
  });

  it("resolves detail by canonical office key or entity uuid against the corpus", () => {
    const sql = build_unified_detail_sql();
    expect(sql).toContain("canonical_id = $1");
    expect(sql).toContain("resource_entity_id = $2");
  });
});

const ENTITY_ROW = {
  resource_entity_id: "11111111-2222-3333-4444-555555555555",
  canonical_id: "gof_aba26b17335b5218f5b2b1ab3",
  source_family_key: "gov_office_projection",
  source_table: "gov_office_projection_v1",
  source_pk: "gof_aba26b17335b5218f5b2b1ab3",
  resource_name: "Butte Falls Police Department",
  resource_type: "local_police_department",
  resource_category: "safety_crisis",
  service_categories: [],
  state: "OR",
  jurisdiction: null,
  jurisdiction_scope: null,
  county: "Jackson",
  city: "Butte Falls",
  description: null,
  eligibility_summary: null,
  apply_notes: null,
};

describe("unified catalog runtime (mocked pool)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clear_unified_catalog_summary_cache();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("from filtered") || sql.includes("as total")) {
        return { rows: [{ total: 1, items: [ENTITY_ROW] }] };
      }
      if (sql.includes("canonical_id = $1")) {
        return { rows: [ENTITY_ROW] };
      }
      if (sql.includes("v_luminari_resource_contact_points")) {
        return { rows: [] };
      }
      if (sql.includes("luminari_anchor_office_source_rows")) {
        return {
          rows: [
            {
              resource_entity_id: ENTITY_ROW.resource_entity_id,
              phone: "(541) 865-3200",
              email: "25170",
              url: "https://example.gov/butte-falls",
            },
          ],
        };
      }
      if (sql.includes("from public.luminari_resource_locations")) {
        return {
          rows: [
            {
              location_id: "loc-1",
              resource_entity_id: ENTITY_ROW.resource_entity_id,
              address_line1: "442 Oak St",
              address_line2: null,
              city: "Butte Falls",
              county: "Jackson",
              state: "OR",
              postal_code: "97522",
              country: "US",
              latitude: 42.54381,
              longitude: -122.56651,
              coordinate_quality: "source_supplied",
            },
          ],
        };
      }
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    });
  });

  it("search returns catalog items with guarded contacts and coordinate locations", async () => {
    const result = await search_unified_catalog({ query: "Butte Falls" });
    expect(result.total).toBe(1);
    expect(result.total_is_exact).toBe(true);
    const item = result.items[0];
    expect(item.resource_name).toBe("Butte Falls Police Department");
    expect(item.resource_category).toBe("safety_crisis");
    // The office row's "25170" email is dropped by the shape guard; the
    // phone and website survive.
    expect(
      item.contacts.map((contact: any) => contact.contact_type),
    ).toEqual(["phone", "website"]);
    expect(item.locations[0].manual_map_eligible).toBe(true);
    expect(item.locations[0].latitude).toBeCloseTo(42.54381);
  });

  it("detail resolves a gof_ office key through canonical_id", async () => {
    const detail = await get_unified_catalog_detail(
      "gof_aba26b17335b5218f5b2b1ab3",
    );
    expect(detail?.resource_name).toBe("Butte Falls Police Department");
    const detail_call = query.mock.calls.find(([sql]: [string]) =>
      sql.includes("canonical_id = $1"),
    );
    expect(detail_call[1]).toEqual(["gof_aba26b17335b5218f5b2b1ab3", null]);
  });

  it("detail rejects identifiers that are neither office keys nor uuids without querying", async () => {
    await expect(get_unified_catalog_detail("not-an-id")).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("summary maps the corpus totals onto every consumer field from one row", async () => {
    query.mockImplementationOnce(async () => ({
      rows: [
        {
          totals: {
            total_resources: 70264,
            inactive_resources: 1,
            held_for_naming_count: 2530,
            jurisdiction_count: 57,
            category_count: 41,
            program_count: 0,
          },
          categories: [{ id: "healthcare", count: 29278 }],
          jurisdictions: [
            {
              code: "OR",
              count: 1200,
              direct_resource_count: 1200,
              program_count: 0,
              categories: { healthcare: 300 },
            },
          ],
          contact_stats: { contact_count: 10, resources_with_contacts: 9 },
          location_stats: {
            location_count: 70000,
            resources_with_locations: 68631,
            verified_physical_sites: 59599,
            exact_mappable_resources: 59599,
          },
        },
      ],
    }));
    const summary = await get_unified_catalog_summary();
    expect(summary.total_resources).toBe(70264);
    expect(summary.total_directory_records).toBe(70264);
    expect(summary.held_for_naming_count).toBe(2530);
    expect(summary.exact_mappable_resources).toBe(59599);
    expect(summary.verified_physical_sites).toBe(59599);
    expect((summary.categories as any[])[0]).toEqual({
      id: "healthcare",
      count: 29278,
    });
  });
});
