import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pipeline = readFileSync(
  join(process.cwd(), "server", "civic-genome-legislative-version-pipeline.ts"),
  "utf8",
);

function function_source(name: string, next_name: string): string {
  const start = pipeline.indexOf(`async function ${name}`);
  const end = pipeline.indexOf(`async function ${next_name}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return pipeline.slice(start, end);
}

describe("legislative version external request bounds", () => {
  it("keeps both source transfer and response-body reads inside the abort window", () => {
    const source_fetch = function_source("fetch_bytes", "load_version");
    expect(pipeline).toContain("const SOURCE_FETCH_TIMEOUT_MS = 30_000");
    expect(source_fetch).toContain("const controller = new AbortController()");
    expect(source_fetch).toContain("await response.arrayBuffer()");
    expect(source_fetch.indexOf("await response.arrayBuffer()"))
      .toBeLessThan(source_fetch.indexOf("clearTimeout(timeout)"));
    expect(source_fetch).toContain("legislative_version_source_fetch_timeout");
  });

  it("bounds Rosetta metadata and registration calls while consuming current results", () => {
    const metadata = function_source("rosetta_request", "ensure_rosetta_corpus");
    const registration = function_source(
      "register_rosetta_source_content",
      "record_source_ingested",
    );

    expect(pipeline).toContain("const ROSETTA_REQUEST_TIMEOUT_MS = 150_000");
    expect(pipeline).not.toContain("const ROSETTA_REQUEST_TIMEOUT_MS = 60_000");
    for (const source of [metadata, registration]) {
      expect(source).toContain("const controller = new AbortController()");
      expect(source).toContain("await response.text()");
      expect(source.indexOf("await response.text()"))
        .toBeLessThan(source.indexOf("clearTimeout(timeout)"));
    }
    expect(metadata).toContain("legislative_version_rosetta_request_timeout");
    expect(registration).toContain(
      "legislative_version_rosetta_content_registration_timeout",
    );
    expect(pipeline).not.toContain("invoke_rosetta_extraction");
    expect(pipeline).not.toContain("run_rosetta_v3_extraction");
    expect(pipeline).toContain("await load_rosetta_current_docket_result_for_binding({");
    const reader = readFileSync(join(process.cwd(), "server", "civic-genome-rosetta-evaluation.ts"), "utf8");
    expect(reader).toContain("signal: controller.signal");
    expect(reader.indexOf("await response.json()" )).toBeLessThan(reader.indexOf("clearTimeout(timeout)"));
  });
});
