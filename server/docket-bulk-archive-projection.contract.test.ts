import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("LegiScan bulk intake shares the API projection and registration", () => {
  const runner = readFileSync("scripts/legiscan-bulk-docket-intake.ts","utf8");
  const projector = readFileSync("server/civic-genome-projection.ts","utf8");
  it("reuses the same deterministic projector, without inventing getMasterList", () => {
    expect(projector).toContain("export async function project_docket_bulk_bill_to_civic_genome");
    expect(projector).toContain("return project_bill(row, master, 0)");
    expect(projector).toContain('source: "legiscan_bulk_json_derived_bill"');
    expect(projector).toContain("docket_bulk_projection_missing_source_event_date");
  });
  it("calls independent source registration with Rosetta execution disabled", () => {
    const p=runner.indexOf("await project_docket_bulk_bill_to_civic_genome");
    const q=runner.indexOf("register_docket_legislative_version_spine($1::integer, false)",p);
    expect(p).toBeGreaterThan(0); expect(q).toBeGreaterThan(p);
    expect(runner).not.toContain("register_docket_legislative_version_spine($1::integer, true)");
  });
  it("never projects API-owned bills or silently reports an incomplete run as success", () => {
    expect(runner).toContain('outcome.stored_source === "legiscan_bulk_json"');
    expect(runner).toContain("counts.held += 1");
    expect(runner).toContain("result.totals.held > 0");
  });
});
