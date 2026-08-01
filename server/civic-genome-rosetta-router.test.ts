import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router_source = readFileSync(
  new URL("./routers/civic-genome-router.ts", import.meta.url),
  "utf8",
);

describe("Civic Genome Rosetta administrator pipeline", () => {
  it("routes the handoff action through the complete deterministic pipeline", () => {
    expect(router_source).toContain(
      "ingest_docket_bill_to_rosetta_source: adminProcedure",
    );
    expect(router_source).toMatch(
      /ingest_docket_bill_to_rosetta_source:[\s\S]*?process_docket_bill_through_rosetta_and_genome\(input\.source_bill_id\)/,
    );
  });

  it("retains the explicit full-pipeline administrator mutation", () => {
    expect(router_source).toMatch(
      /process_docket_bill_through_rosetta:[\s\S]*?process_docket_bill_through_rosetta_and_genome\(input\.source_bill_id\)/,
    );
  });
});
