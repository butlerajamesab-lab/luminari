import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router_source = readFileSync(
  new URL("./routers/civic-genome-router.ts", import.meta.url),
  "utf8",
);

describe("Civic Genome Rosetta duplicate-work guard", () => {
  it("rejects an already assembled exact pipeline before invoking Rosetta", () => {
    expect(router_source).toContain('status.contract_state === "assembled"');
    expect(router_source).toContain('message: "rosetta_pipeline_already_completed_and_assembled"');

    const guard_index = router_source.indexOf('status.contract_state === "assembled"');
    const invocation_index = router_source.indexOf(
      "return process_docket_bill_through_rosetta_and_genome(source_bill_id)",
    );

    expect(guard_index).toBeGreaterThan(-1);
    expect(invocation_index).toBeGreaterThan(guard_index);
  });

  it("routes both administrator entry points through the same guard", () => {
    const guarded_calls = router_source.match(/process_rosetta_pipeline_once\(input\.source_bill_id\)/g) ?? [];
    expect(guarded_calls).toHaveLength(2);
  });
});
