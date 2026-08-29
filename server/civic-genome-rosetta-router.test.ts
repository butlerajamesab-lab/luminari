import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router_source = readFileSync(
  new URL("./routers/civic-genome-router.ts", import.meta.url),
  "utf8",
);

describe("Civic Genome Rosetta administrator pipeline", () => {
  it("keeps the handoff action source-only and worker-gated", () => {
    expect(router_source).toContain(
      "ingest_docket_bill_to_rosetta_source: workerAdminProcedure",
    );
    const handoff_start = router_source.indexOf(
      "ingest_docket_bill_to_rosetta_source: workerAdminProcedure",
    );
    const pipeline_start = router_source.indexOf(
      "process_docket_bill_through_rosetta: workerAdminProcedure",
    );
    const handoff_route = router_source.slice(handoff_start, pipeline_start);

    expect(handoff_route).toContain(
      "create_rosetta_source_handoff(input.source_bill_id)",
    );
    expect(handoff_route).not.toContain("process_rosetta_pipeline_once");
  });

  it("retains the explicit guarded full-pipeline administrator mutation", () => {
    expect(router_source).toMatch(
      /process_docket_bill_through_rosetta: workerAdminProcedure[\s\S]*?process_rosetta_pipeline_once\(input\.source_bill_id\)/,
    );
    expect(router_source).toContain(
      "return process_docket_bill_through_rosetta_and_genome(source_bill_id)",
    );
  });
});
