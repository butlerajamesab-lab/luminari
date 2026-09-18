import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pipeline = readFileSync(
  join(process.cwd(), "server", "civic-genome-legislative-version-pipeline.ts"),
  "utf8",
);
const lane = readFileSync(
  join(process.cwd(), "server", "civic-genome-amendment-source-completion.ts"),
  "utf8",
);
const worker = readFileSync(
  join(process.cwd(), "server", "civic-genome-legislative-version-queue-worker.ts"),
  "utf8",
);

describe("amendment pre-decomposition source-completion contract", () => {
  it("reconciles historical amendments from immutable preserved source, not provider acquisition", () => {
    const start = pipeline.indexOf("export async function reconcile_preserved_amendment_source_basis");
    const end = pipeline.indexOf("async function record_source_ingested", start);
    const reconciliation = pipeline.slice(start, end);
    expect(reconciliation).toContain("load_preserved_amendment_source");
    expect(reconciliation).toContain("resolve_current_amendment_attachment");
    expect(reconciliation).toContain("register_rosetta_amendment_attachment");
    expect(reconciliation).toContain("awaiting_delta_executor");
    expect(reconciliation).not.toContain("extract_version_source(");
    expect(reconciliation).not.toContain("load_rosetta_current_docket_result_for_binding");
    expect(reconciliation).not.toContain("process_legislative_version(");
  });

  it("reads exact source-content UUID and hash and validates amendment identity", () => {
    expect(pipeline).toContain("source_document_content?");
    expect(pipeline).toContain("rosetta_source_content_id");
    expect(pipeline).toContain("source_content_hash");
    expect(pipeline).toContain("docket_source_document_key");
    expect(pipeline).toContain("docket_document_family");
    expect(pipeline).toContain("legislative_amendment_preserved_source_identity_mismatch");
  });

  it("gives already-preserved amendments one queue owner and never turns source completion into execution", () => {
    expect(worker).toContain("schedule_amendment_source_completion");
    expect(worker).toContain("amendment_source_completion_enabled");
    expect(worker).toContain("version.document_family='amendment'");
    expect(worker).toContain("version.processing_state='source_ingested'");
    expect(lane).not.toMatch(
      /replay_execute|replay_claim|start_class_stage|class_stage_execute|extract_version_source/i,
    );
    expect(lane).not.toContain("attempt_count =");
  });
});
