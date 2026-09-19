import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const router = readFileSync(
  join(root, "server", "routes", "civic-genome-export-router.ts"),
  "utf8",
);
const page = readFileSync(
  join(root, "client", "src", "pages", "CivicGenome.tsx"),
  "utf8",
);
const frame = readFileSync(
  join(root, "client", "src", "components", "civic-genome", "CivicGenomeHumanReportFrame.tsx"),
  "utf8",
);
const rosetta = readFileSync(
  join(root, "client", "src", "components", "civic-genome", "RosettaEvaluation.tsx"),
  "utf8",
);

describe("Civic Genome human-readable primary view", () => {
  it("reuses the existing summary renderer for an inline same-origin view", () => {
    expect(router).toContain('"/bill/:source_bill_id/summary/view"');
    expect(router).toContain('"inline"');
    expect(router).toContain("render_civic_genome_human_report");
  });

  it("presents the human report before technical Rosetta diagnostics", () => {
    const report = page.indexOf("<CivicGenomeHumanReportFrame");
    const technical = page.indexOf("Technical processing, Rosetta receipts, and source-version diagnostics");
    expect(report).toBeGreaterThan(-1);
    expect(technical).toBeGreaterThan(report);
  });

  it("renders the report directly rather than forcing the export download surface", () => {
    expect(frame).toContain("/summary/view");
    expect(frame).toContain("<iframe");
    expect(frame).toContain("Civic Genome human-readable report");
  });

  it("keeps the verbose Rosetta result tree collapsed by default", () => {
    expect(rosetta).toContain("Current result, validation summary, and coverage");
    expect(rosetta).not.toContain('open={Boolean(current_result)}');
  });
});
