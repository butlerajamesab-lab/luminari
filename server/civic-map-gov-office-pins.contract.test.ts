import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf-8");
}

describe("Civic Map government-office pin wire", () => {
  const service = source("server/services/resource-directory.ts");
  const router = source("server/routes/civic-map-router.ts");

  it("admits official government-office coordinates into the exact-site points query", () => {
    expect(service).toContain("gov_office_sites");
    expect(service).toContain("public.gov_offices");
    expect(service).toContain("g.superseded_by is null");
    expect(service).toContain("g.lat is not null");
    expect(service).toContain("g.lng is not null");
    // The reviewed v3_13 lane remains the first arm — nothing was displaced.
    expect(service).toContain("l.manual_map_eligible is true");
    expect(service).toContain("reviewed_sites");
  });

  it("keeps the two provenance lanes distinguishable in the point source label", () => {
    expect(router).toContain("reviewed_v3_13_exact_public_sites");
    expect(router).toContain("gov_offices_official_coordinates");
  });

  it("accepts hash-derived gof_ office identities on the detail endpoint", () => {
    expect(router).toContain("isGovOfficeId");
    expect(router).toContain("getGovOfficeDetail");
    expect(service).toContain("getGovOfficeDetail");
  });

  it("reports government-office exact sites as their own counter", () => {
    expect(router).toContain("gov_office_exact_sites");
    expect(service).toContain("getGovOfficeExactSiteCount");
  });
});

describe("Civic Map family distinction (F1)", () => {
  const service = source("server/services/resource-directory.ts");
  const page = source("client/public/civicmap.html");

  it("carries agency_key through the bounds query per lane", () => {
    // Gov lane: the office's real family key.
    expect(service).toContain("g.agency_key as agency_key");
    // Reviewed lane: no family — an explicit null keeps the union aligned.
    expect(service).toContain("null::text as agency_key");
    // The outer select surfaces the column to the payload.
    expect(service).toContain(
      "resource_entity_id, resource_name, resource_category, agency_key, state"
    );
  });

  it("defines display metadata for every loaded gov_offices family", () => {
    expect(page).toContain("FAMILY_META");
    for (const key of [
      "veterans_affairs",
      "ssa",
      "hud",
      "public_housing_authority",
      "american_job_center",
      "apprenticeship",
      "native_american",
      "hospital",
      "health_center",
      "law_enforcement",
    ]) {
      expect(page).toContain(`${key}:`);
    }
  });

  it("keeps family colors distinct from the directory category colors", () => {
    const categoryBlock = page.slice(
      page.indexOf("const CATEGORY_COLORS"),
      page.indexOf("const FAMILY_META")
    );
    const familyBlock = page.slice(
      page.indexOf("const FAMILY_META"),
      page.indexOf("const JURISDICTIONS")
    );
    const hexes = (block: string) =>
      new Set(block.match(/#[0-9a-fA-F]{6}/g) ?? []);
    const categoryColors = hexes(categoryBlock);
    const familyColors = hexes(familyBlock);
    expect(familyColors.size).toBe(10);
    for (const color of familyColors) {
      expect(categoryColors.has(color)).toBe(false);
    }
  });

  it("wires family toggles into pin rendering and the legend", () => {
    expect(page).toContain("hiddenFamilies");
    expect(page).toContain("renderFamilyLegend");
    expect(page).toContain('id="familyLegend"');
    expect(page).toContain('id="familyKey"');
    // Gov pins take the family color; the tooltip names the family.
    expect(page).toContain("point.agency_key");
    expect(page).toContain("Exact public site");
  });
});
