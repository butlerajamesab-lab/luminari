import { describe, expect, it } from "vitest";
import {
  format_distance,
  group_office_results,
  office_card_fields,
  sort_by_distance,
  website_href,
  type OfficeSearchResult,
} from "./office-results";

function result(overrides: Partial<OfficeSearchResult> = {}): OfficeSearchResult {
  return {
    resource_entity_id: "11111111-1111-4111-8111-111111111111",
    canonical_id: "gof_0123456789abcdef01234567",
    family: "ssa",
    name: "Social Security Administration",
    address: "915 2nd Ave",
    city: "Seattle",
    state: "WA",
    postal_code: "98174",
    distance_mi: 1.2,
    ...overrides,
  };
}

describe("sort_by_distance", () => {
  it("orders nearest first and breaks ties by name", () => {
    const sorted = sort_by_distance([
      result({ name: "Beta", distance_mi: 3.5 }),
      result({ name: "Alpha", distance_mi: 3.5 }),
      result({ name: "Near", distance_mi: 0.4 }),
    ]);
    expect(sorted.map((r) => r.name)).toEqual(["Near", "Alpha", "Beta"]);
  });

  it("does not mutate the input", () => {
    const input = [
      result({ name: "Far", distance_mi: 9 }),
      result({ name: "Near", distance_mi: 1 }),
    ];
    sort_by_distance(input);
    expect(input.map((r) => r.name)).toEqual(["Far", "Near"]);
  });
});

describe("group_office_results", () => {
  it("groups in family legend order, distance-sorted within each group", () => {
    const groups = group_office_results([
      result({ family: "hospital", name: "Far Hospital", distance_mi: 8 }),
      result({ family: "ssa", name: "SSA Far", distance_mi: 5 }),
      result({ family: "hospital", name: "Near Hospital", distance_mi: 2 }),
      result({ family: "ssa", name: "SSA Near", distance_mi: 1 }),
    ]);
    // Legend order puts ssa ahead of hospital.
    expect(groups.map((g) => g.family)).toEqual(["ssa", "hospital"]);
    expect(groups[0].results.map((r) => r.name)).toEqual([
      "SSA Near",
      "SSA Far",
    ]);
    expect(groups[1].results.map((r) => r.name)).toEqual([
      "Near Hospital",
      "Far Hospital",
    ]);
  });

  it("omits families with no results", () => {
    const groups = group_office_results([result({ family: "hud" })]);
    expect(groups.map((g) => g.family)).toEqual(["hud"]);
  });
});

describe("office_card_fields", () => {
  it("renders no phone row for a VA card whose record carries no phone", () => {
    const fields = office_card_fields(
      result({
        family: "veterans_affairs",
        name: "Everett VA Clinic",
        url: "https://www.va.gov/puget-sound-health-care/",
      }),
    );
    expect(fields.map((f) => f.kind)).toEqual(["url"]);
  });

  it("renders phone, hours, and website in card order when all are carried", () => {
    const fields = office_card_fields(
      result({
        phone: "800-772-1213",
        hours: "Mon-Fri 9:00 AM - 4:00 PM",
        url: "https://www.ssa.gov",
      }),
    );
    expect(fields).toEqual([
      { kind: "phone", label: "Phone", value: "800-772-1213" },
      { kind: "hours", label: "Hours", value: "Mon-Fri 9:00 AM - 4:00 PM" },
      { kind: "url", label: "Website", value: "https://www.ssa.gov" },
    ]);
  });

  it("treats blank values as absent", () => {
    const fields = office_card_fields(
      result({ phone: "  ", hours: "", url: undefined }),
    );
    expect(fields).toEqual([]);
  });
});

describe("format_distance", () => {
  it("reads as a person expects", () => {
    expect(format_distance(1)).toBe("1.0 mile");
    expect(format_distance(12.34)).toBe("12.3 miles");
    expect(format_distance(0.26)).toBe("0.3 miles");
  });
});

describe("website_href", () => {
  it("prefixes bare domains and leaves full URLs alone", () => {
    expect(website_href("www.ssa.gov")).toBe("https://www.ssa.gov");
    expect(website_href("https://www.ssa.gov")).toBe("https://www.ssa.gov");
    expect(website_href("http://example.org/x")).toBe("http://example.org/x");
  });
});
