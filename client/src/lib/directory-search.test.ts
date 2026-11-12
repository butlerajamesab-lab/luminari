import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_DIRECTORY_CATEGORIES,
  buildDirectorySearchInput,
  canonicalDirectoryCategory,
  humanErrorMessage,
  isCanonicalDirectoryCategory,
  visibleDirectoryCategories,
} from "./directory-search";

// The exact validation payload shown in Alexander's 2026-11-11
// screenshots and reproduced live the same night: the directory page
// rendered this string to the reader under "The directory could not
// load."
const ZOD_PAYLOAD =
  '[{"code":"too_big","maximum":64,"type":"string","inclusive":true,"exact":false,"message":"String must contain at most 64 character(s)","path":["category"]},{"validation":"regex","code":"invalid_string","message":"Invalid","path":["category"]}]';

// The exact composite behind that payload, verified in production
// data 2026-11-11: an appendix section-heading list stored verbatim in
// `resource_category`, surfaced as a summary "category" and sent back
// as the `category` filter.
const COMPOSITE_CATEGORY =
  "Disability (SSDI/SSI), retirement, survivors | Federal prosecution / civil rights — central Pennsylvania | Federal prosecution / civil rights — western Pennsylvania / Pittsburgh";

const SHORT_LABEL_CATEGORY = "Municipal Civil Rights — New Orleans";

describe("canonical directory categories", () => {
  it("is exactly the reviewed nine-key taxonomy", () => {
    expect([...CANONICAL_DIRECTORY_CATEGORIES]).toEqual([
      "housing",
      "healthcare",
      "legal_civil_rights",
      "cash_assistance",
      "food_nutrition",
      "tribal",
      "safety_crisis",
      "utilities",
      "employment_labor",
    ]);
  });

  it("accepts every canonical key", () => {
    for (const key of CANONICAL_DIRECTORY_CATEGORIES) {
      expect(isCanonicalDirectoryCategory(key)).toBe(true);
      expect(canonicalDirectoryCategory(key)).toBe(key);
    }
  });

  it("rejects data-derived composites and label text", () => {
    expect(canonicalDirectoryCategory(COMPOSITE_CATEGORY)).toBeUndefined();
    expect(canonicalDirectoryCategory(SHORT_LABEL_CATEGORY)).toBeUndefined();
  });

  it("rejects legacy labels that are not canonical categories", () => {
    for (const legacy of [
      "organization",
      "general_resource",
      "veterans",
      "disability",
      "workbook_record",
    ]) {
      expect(canonicalDirectoryCategory(legacy)).toBeUndefined();
    }
  });

  it("rejects empty, missing, and near-miss values", () => {
    expect(canonicalDirectoryCategory("")).toBeUndefined();
    expect(canonicalDirectoryCategory(null)).toBeUndefined();
    expect(canonicalDirectoryCategory(undefined)).toBeUndefined();
    expect(canonicalDirectoryCategory("Housing")).toBeUndefined();
    expect(canonicalDirectoryCategory("housing ")).toBeUndefined();
    expect(isCanonicalDirectoryCategory(42)).toBe(false);
  });
});

describe("buildDirectorySearchInput", () => {
  it("passes a canonical category through with the other fields", () => {
    expect(
      buildDirectorySearchInput({
        query: "shelter",
        jurisdiction: "MO",
        category: "housing",
        limit: 24,
        offset: 48,
      }),
    ).toEqual({
      query: "shelter",
      jurisdiction: "MO",
      category: "housing",
      limit: 24,
      offset: 48,
    });
  });

  it("omits the category entirely for the screenshot composite", () => {
    const input = buildDirectorySearchInput({
      query: "shelter",
      jurisdiction: "MO",
      category: COMPOSITE_CATEGORY,
      limit: 24,
      offset: 0,
    });
    expect(input).not.toHaveProperty("category");
    expect(input).toEqual({
      query: "shelter",
      jurisdiction: "MO",
      limit: 24,
      offset: 0,
    });
  });

  it("omits label text and legacy labels instead of sending them", () => {
    for (const bad of [SHORT_LABEL_CATEGORY, "organization", "veterans"]) {
      const input = buildDirectorySearchInput({
        category: bad,
        limit: 24,
        offset: 0,
      });
      expect(input).not.toHaveProperty("category");
    }
  });

  it("omits empty query, jurisdiction, and category", () => {
    expect(
      buildDirectorySearchInput({ category: "", limit: 24, offset: 0 }),
    ).toEqual({ limit: 24, offset: 0 });
  });
});

describe("visibleDirectoryCategories", () => {
  it("keeps only canonical chips from a summary-shaped list", () => {
    const options = [
      { id: "safety_crisis", count: 32535 },
      { id: COMPOSITE_CATEGORY, count: 5 },
      { id: "housing", count: 4657 },
      { id: "organization", count: 1824 },
      { id: SHORT_LABEL_CATEGORY, count: 3 },
    ];
    expect(visibleDirectoryCategories(options)).toEqual([
      { id: "safety_crisis", count: 32535 },
      { id: "housing", count: 4657 },
    ]);
  });

  it("tolerates a missing summary", () => {
    expect(visibleDirectoryCategories(undefined)).toEqual([]);
    expect(visibleDirectoryCategories(null)).toEqual([]);
  });
});

describe("humanErrorMessage", () => {
  it("never surfaces the raw Zod validation payload", () => {
    expect(humanErrorMessage(new Error(ZOD_PAYLOAD), "FALLBACK")).toBe(
      "FALLBACK",
    );
    expect(humanErrorMessage(ZOD_PAYLOAD, "FALLBACK")).toBe("FALLBACK");
    expect(humanErrorMessage({ message: ZOD_PAYLOAD }, "FALLBACK")).toBe(
      "FALLBACK",
    );
  });

  it("never surfaces serialized JSON of any shape", () => {
    expect(humanErrorMessage('{"error":"boom"}', "FALLBACK")).toBe("FALLBACK");
    expect(humanErrorMessage('  [{"code":"custom"}]', "FALLBACK")).toBe(
      "FALLBACK",
    );
  });

  it("passes short plain-language messages through", () => {
    expect(humanErrorMessage(new Error("Resource not found"))).toBe(
      "Resource not found",
    );
    expect(humanErrorMessage("Network request failed", "FALLBACK")).toBe(
      "Network request failed",
    );
  });

  it("falls back for empty and message-less errors", () => {
    expect(humanErrorMessage(new Error(""), "FALLBACK")).toBe("FALLBACK");
    expect(humanErrorMessage(null, "FALLBACK")).toBe("FALLBACK");
    expect(humanErrorMessage(undefined, "FALLBACK")).toBe("FALLBACK");
    expect(humanErrorMessage({}, "FALLBACK")).toBe("FALLBACK");
  });

  it("falls back for over-long dumps", () => {
    expect(humanErrorMessage("x".repeat(400), "FALLBACK")).toBe("FALLBACK");
  });
});

describe("directory surfaces are wired through the hygiene helpers", () => {
  function source(path: string): string {
    return readFileSync(join(process.cwd(), path), "utf8");
  }

  it("the directory page builds its search input and error text via the helpers", () => {
    const page = source("client/src/pages/ResourceDirectory.tsx");
    expect(page).toContain("buildDirectorySearchInput");
    expect(page).toContain("visibleDirectoryCategories");
    expect(page).toContain("canonicalDirectoryCategory");
    expect(page).toContain("humanErrorMessage");
    expect(page).not.toContain("directoryQuery.error.message");
  });

  it("the record page never renders a raw error message", () => {
    const page = source("client/src/pages/ResourceRecord.tsx");
    expect(page).toContain("humanErrorMessage");
    expect(page).not.toContain("detail_query.error.message");
  });
});
