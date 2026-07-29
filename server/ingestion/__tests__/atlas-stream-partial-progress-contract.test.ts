import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_sibling(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

describe("Atlas stream partial-progress contract", () => {
  const adapter_source = read_sibling("../atlas-stream-adapter.ts");
  const scheduler_source = read_sibling("../scheduler.ts");

  it("retains committed counts outside the page-processing try scope", () => {
    expect(adapter_source).toContain("let records_processed = 0;");
    expect(adapter_source).toContain("let records_inserted = 0;");
    expect(adapter_source).toContain("let records_updated = 0;");
    expect(adapter_source.indexOf("let records_processed = 0;")).toBeLessThan(
      adapter_source.indexOf("try {", adapter_source.indexOf("const run_id")),
    );
  });

  it("returns committed counts and marks a later-page failure as partial", () => {
    expect(adapter_source).toContain("const partial_failure = records_processed > 0");
    expect(adapter_source).toContain('"atlas_bridge_partial_failure"');
    expect(adapter_source).toContain('outcomeClassification: partial_failure ? "partial_failure"');
    expect(adapter_source).toContain("recordsProcessed: records_processed");
    expect(adapter_source).toContain("recordsInserted: records_inserted");
    expect(adapter_source).toContain("recordsUpdated: records_updated");
  });

  it("does not fail an exactly satisfied bounded request at the page cap", () => {
    expect(adapter_source).toContain(
      "page_count >= ATLAS_MAX_PAGES && records_processed < max_records",
    );
    expect(adapter_source).toContain('select("offset")');
    expect(adapter_source).toContain("remaining_events");
  });

  it("requires the scheduler to preserve an Atlas partial result", () => {
    expect(scheduler_source).toContain('const atlasPartialFailure =');
    expect(scheduler_source).toContain(
      'adapterSource === "atlas_stream" && result.recordsProcessed > 0',
    );
    expect(scheduler_source).toContain(
      'result.diagnostics?.outcomeClassification === "partial_failure"',
    );
  });
});
