import { describe, expect, it } from "vitest";
import { office_family_pick_sql } from "./office-nearest";
import {
  build_office_place_sql,
  build_place_cities_sql,
  build_place_other_resources_sql,
  build_place_states_sql,
  normalize_city_key,
  normalize_state_code,
} from "./office-place";

describe("place browse input", () => {
  it("accepts only two-letter state codes", () => {
    expect(normalize_state_code("wa")).toBe("WA");
    expect(normalize_state_code(" WA ")).toBe("WA");
    expect(normalize_state_code("Washington")).toBeNull();
    expect(normalize_state_code("W1")).toBeNull();
    expect(normalize_state_code(undefined)).toBeNull();
  });

  it("keys cities the way the SQL does: trimmed, single-spaced, lower-case", () => {
    expect(normalize_city_key("  Seattle ")).toBe("seattle");
    expect(normalize_city_key("Mercer   Island")).toBe("mercer island");
    expect(normalize_city_key("")).toBeNull();
    expect(normalize_city_key("x".repeat(81))).toBeNull();
    expect(normalize_city_key(42)).toBeNull();
  });
});

describe("place browse SQL", () => {
  it("places offices with the same per-family site match as the nearest search", () => {
    const sql = build_office_place_sql();
    expect(sql).toContain(office_family_pick_sql());
    expect(sql).toContain("upper(btrim(l.state)) = $1");
    expect(sql).toContain("$2::text is null or");
    expect(sql).not.toMatch(/acos\(least\(1, greatest\(-1,\s+cos\(radians\(\$1/);
  });

  it("applies the overall office cap only after the per-family cap", () => {
    const sql = build_office_place_sql();
    const per_family = sql.indexOf("where family_rank <= $4");
    const overall = sql.indexOf("row_number() over (order by family, resource_name, resource_entity_id) as overall_rank");
    expect(per_family).toBeGreaterThan(overall);
    expect(sql.indexOf("where overall_rank <= $5")).toBeGreaterThan(per_family);
  });

  it("ranks a resource's placements only within the requested state", () => {
    const sql = build_place_other_resources_sql();
    const state_filter = sql.indexOf("c.jurisdiction_code) = $1");
    expect(state_filter).toBeGreaterThan(sql.indexOf("as placement_rank"));
  });

  it("labels a record statewide only when it names no city, and never shows another state", () => {
    const sql = build_place_other_resources_sql();
    expect(sql).toContain("when city_key is null then 'statewide'");
    expect(sql).toContain("c.jurisdiction_code) = $1");
    expect(sql).toContain("luminari_anchor_office_source_rows");
    expect(sql).toContain("where scope is not null");
  });

  it("reads the same person-facing catalog as the directory", () => {
    for (const sql of [
      build_place_states_sql(),
      build_place_cities_sql(),
      build_office_place_sql(),
      build_place_other_resources_sql(),
    ]) {
      expect(sql).toContain("from public.luminari_resource_entities e");
      expect(sql).toContain("publication_status");
    }
  });
});
