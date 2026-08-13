import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("benefit application summary compatibility", () => {
  it("keeps the summary read-only and returns the legacy UI envelope", () => {
    const source = read("server/benefit-application-summary-compat.ts");
    expect(source).toContain("select benefit_app_status as status");
    expect(source).toContain("const total = Object.values(by_status)");
    expect(source).toContain("byStatus: by_status");
    expect(source).not.toContain("insert into");
    expect(source).not.toContain("update public");
    expect(source).not.toContain("delete from");
  });

  it("routes the existing helper name through the read-only adapter", () => {
    const source = read("server/db.ts");
    expect(source).toContain("get_benefit_application_summary as getBenefitApplicationSummary");
    expect(source).not.toContain("getUpcomingBenefitDeadlines,\n  getBenefitApplicationSummary,");
  });
});
