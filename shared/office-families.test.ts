import { describe, expect, it } from "vitest";
import {
  OFFICE_FAMILY_KEYS,
  OFFICE_FAMILY_META,
  is_office_family_key,
  sanitize_office_families,
} from "./office-families";

describe("OFFICE_FAMILY_META", () => {
  it("covers exactly the eleven anchored office families", () => {
    expect([...OFFICE_FAMILY_KEYS].sort()).toEqual(
      [
        "american_job_center",
        "apprenticeship",
        "health_center",
        "hospital",
        "hud",
        "law_enforcement",
        "native_american",
        "public_housing_authority",
        "ssa",
        "tribal_government",
        "veterans_affairs",
      ].sort(),
    );
  });

  it("gives every family a readable label and its own color", () => {
    const colors = new Set<string>();
    for (const key of OFFICE_FAMILY_KEYS) {
      const meta = OFFICE_FAMILY_META[key];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
      colors.add(meta.color);
    }
    expect(colors.size).toBe(OFFICE_FAMILY_KEYS.length);
  });

  it("keeps the family presentation the Civic Map carried (F1)", () => {
    expect(OFFICE_FAMILY_META.veterans_affairs).toEqual({
      label: "Veterans Affairs",
      color: "#6d28d9",
    });
    expect(OFFICE_FAMILY_META.ssa).toEqual({
      label: "Social Security",
      color: "#65a30d",
    });
    expect(OFFICE_FAMILY_META.law_enforcement).toEqual({
      label: "Law Enforcement",
      color: "#dc2626",
    });
  });
});

describe("sanitize_office_families", () => {
  it("keeps known families in request order without duplicates", () => {
    expect(
      sanitize_office_families(["hospital", "ssa", "hospital", "hud"]),
    ).toEqual(["hospital", "ssa", "hud"]);
  });

  it("drops unknown keys and non-array input", () => {
    expect(sanitize_office_families(["ssa", "bogus", 42, null])).toEqual([
      "ssa",
    ]);
    expect(sanitize_office_families("ssa")).toEqual([]);
    expect(sanitize_office_families(undefined)).toEqual([]);
  });

  it("recognizes family keys strictly", () => {
    expect(is_office_family_key("ssa")).toBe(true);
    expect(is_office_family_key("SSA")).toBe(false);
    expect(is_office_family_key("constructor")).toBe(false);
  });
});
