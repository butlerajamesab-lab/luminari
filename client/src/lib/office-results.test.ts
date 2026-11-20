import { describe, expect, it } from "vitest";
import {
  format_distance,
  group_office_results,
  office_card_fields,
  office_radius_note,
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

describe("office_radius_note", () => {
  it("says nothing when the search was satisfied at the initial radius", () => {
    expect(
      office_radius_note({
        filtered: true,
        radius_used_mi: 10,
        initial_radius_mi: 10,
        families_not_found: [],
        results: [result({ distance_mi: 2 })],
      }),
    ).toBeNull();
  });

  it("keeps the no-offices wording for a genuinely empty unfiltered widening", () => {
    // Unfiltered, the ladder only widens when the initial radius
    // held nothing at all — the original wording is exactly true.
    expect(
      office_radius_note({
        filtered: false,
        radius_used_mi: 25,
        initial_radius_mi: 10,
        families_not_found: [],
        results: [result({ distance_mi: 18 })],
      }),
    ).toBe(
      "No offices were within 10 miles, so the search widened to 25 miles.",
    );
  });

  it("names the family that forced a filtered widening when another was already near", () => {
    // SSA at 2 miles, VA at 20.4: the search widened to 25 for the
    // VA office alone. The note must not claim nothing was within
    // 10 miles — an SSA office 2 miles away is on screen.
    const note = office_radius_note({
      filtered: true,
      radius_used_mi: 25,
      initial_radius_mi: 10,
      families_not_found: [],
      results: [
        result({ family: "ssa", distance_mi: 2 }),
        result({
          family: "veterans_affairs",
          name: "VA Puget Sound Health Care",
          distance_mi: 20.4,
        }),
      ],
    });
    expect(note).toBe(
      "Not all the kinds of offices you picked were within 10 miles — the nearest Veterans Affairs site is 20.4 miles away — so the search widened to 25 miles.",
    );
    expect(note).not.toContain("No offices were within 10 miles");
  });

  it("names a never-found family as the widening reason when the found ones were already near", () => {
    const note = office_radius_note({
      filtered: true,
      radius_used_mi: 50,
      initial_radius_mi: 10,
      families_not_found: ["hud"],
      results: [result({ family: "ssa", distance_mi: 2 })],
    });
    expect(note).toBe(
      "Not all the kinds of offices you picked were within 10 miles — HUD Field Offices was not found within 50 miles — so the search widened to 50 miles.",
    );
    expect(note).not.toContain("No offices were within 10 miles");
  });

  it("says none of the picked kinds were near when a filtered search found nothing inside the initial radius", () => {
    expect(
      office_radius_note({
        filtered: true,
        radius_used_mi: 25,
        initial_radius_mi: 10,
        families_not_found: [],
        results: [result({ family: "ssa", distance_mi: 15 })],
      }),
    ).toBe(
      "None of the kinds of offices you picked were within 10 miles, so the search widened to 25 miles.",
    );
  });
});
