import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resourceDisplayText } from "./services/resource-directory-fast-current";

describe("current resource directory read contract", () => {
  it("renders preserved multilingual object strings without mutating raw source storage", () => {
    expect(
      resourceDisplayText("{'english': 'Guam Behavioral Health and Wellness Center (GBHWC)', 'local': 'Dipattamenton Salut Hinasso'}"),
    ).toBe("Guam Behavioral Health and Wellness Center (GBHWC)");
    expect(resourceDisplayText('{"english":"Legal Aid","local":"Ayuda Legal"}')).toBe("Legal Aid");
    expect(resourceDisplayText("Plain source name")).toBe("Plain source name");
  });

  it("uses the current resource/program civic-object catalog instead of the repeated-lane breadth view", () => {
    const source = readFileSync("server/services/resource-directory-fast-current.ts", "utf8");
    expect(source).toContain('public.v_lighthouse_resource_program_catalog_v2');
    expect(source).toContain('count(*) over()::int as filtered_total');
    expect(source).not.toContain('v_lighthouse_resource_directory_breadth_v3');
  });

  it("keeps raw source name and presentation name separate", () => {
    const source = readFileSync("server/services/resource-directory-fast-current.ts", "utf8");
    expect(source).toContain("source_resource_name: rawName");
    expect(source).toContain("resource_name: displayName");
  });
});
