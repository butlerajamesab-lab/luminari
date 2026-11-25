import { describe, expect, it } from "vitest";
import { CANONICAL_DIRECTORY_CATEGORIES } from "@shared/directory-categories";
import { PLACE_CATEGORY_LABELS, STATE_NAMES, group_in_order } from "./PlaceBrowse";

describe("PlaceBrowse helpers", () => {
  it("groups in the given order with unknown keys last", () => {
    const groups = group_in_order(["b", "x", "a", "b"], value => value, ["a", "b"]);
    expect(groups.map(group => group.key)).toEqual(["a", "b", "x"]);
    expect(groups[1].items).toEqual(["b", "b"]);
  });

  it("labels every canonical directory category plus the uncategorized bucket", () => {
    for (const key of CANONICAL_DIRECTORY_CATEGORIES) expect(PLACE_CATEGORY_LABELS[key]).toBeTruthy();
    expect(PLACE_CATEGORY_LABELS.other).toBe("Not yet categorized");
  });

  it("names all fifty states and DC", () => {
    expect(Object.keys(STATE_NAMES).filter(code => !["PR", "GU", "VI", "AS", "MP"].includes(code))).toHaveLength(51);
  });
});
