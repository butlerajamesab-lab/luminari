import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resource_display_text } from "./services/resource-directory-fast-current";

describe("current resource directory read contract", () => {
  it("renders preserved multilingual object strings without mutating raw source storage", () => {
    expect(
      resource_display_text(
        "{'english': 'Guam Behavioral Health and Wellness Center (GBHWC)', 'local': 'Dipattamenton Salut Hinasso'}",
      ),
    ).toBe("Guam Behavioral Health and Wellness Center (GBHWC)");
    expect(
      resource_display_text('{"english":"Legal Aid","local":"Ayuda Legal"}'),
    ).toBe("Legal Aid");
    expect(resource_display_text("Plain source name")).toBe("Plain source name");
  });

  it("uses the current resource/program civic-object catalog instead of the repeated-lane breadth view", () => {
    const source = readFileSync(
      "server/services/resource-directory-fast-current.ts",
      "utf8",
    );
    expect(source).toContain("public.v_lighthouse_resource_program_classified_v1");
    expect(source).toContain("with catalog as materialized");
    expect(source).toContain("has_more,");
    expect(source).not.toContain("count(*) over()::int as filtered_total");
    expect(source).not.toContain("v_lighthouse_resource_directory_breadth_v3");
  });

  it("reuses one cached summary pass and keeps public pagination bounded", () => {
    const source = readFileSync(
      "server/services/resource-directory-fast-current.ts",
      "utf8",
    );
    expect(source).toContain("SUMMARY_CACHE_TTL_MS");
    expect(source).toContain("summary_in_flight");
    expect(source).toContain("const fetch_limit = limit + 1");
    expect(source).toContain("total_is_exact: !has_more");
  });

  it("uses the existing twelve-category presentation contract without rewriting source category text", () => {
    const source = readFileSync(
      "server/services/resource-directory-fast-current.ts",
      "utf8",
    );
    expect(source).toContain("DIRECTORY_UI_CATEGORY_SQL");
    expect(source).toContain("source_resource_category:");
    expect(source).toContain("else 'general_resource'");
  });

  it("keeps raw source name and presentation name separate", () => {
    const source = readFileSync(
      "server/services/resource-directory-fast-current.ts",
      "utf8",
    );
    expect(source).toContain("source_resource_name: raw_name");
    expect(source).toContain("resource_name: display_name");
  });
});
