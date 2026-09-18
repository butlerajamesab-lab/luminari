import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const resolver = readFileSync(
  join(root, "server", "civic-genome-amendment-attachment.ts"),
  "utf8",
);
const pipeline = readFileSync(
  join(root, "server", "civic-genome-legislative-version-pipeline.ts"),
  "utf8",
);
const worker = readFileSync(
  join(root, "server", "civic-genome-legislative-version-queue-worker.ts"),
  "utf8",
);
const migration = readFileSync(
  join(root, "supabase", "migrations", "20260918164500_civic_genome_amendment_dependency_routing.sql"),
  "utf8",
);
const genomePage = readFileSync(
  join(root, "client", "src", "pages", "CivicGenome.tsx"),
  "utf8",
);
const evaluation = readFileSync(
  join(root, "client", "src", "components", "civic-genome", "RosettaEvaluation.tsx"),
  "utf8",
);

describe("current legislative amendment/source-role contract", () => {
  it("resolves bases from explicit amendment language and proved chronology, not URL stems", () => {
    expect(resolver).toContain("parse_amendment_target_reference");
    expect(resolver).toContain("louisiana_official_document_sequence");
    expect(resolver).toContain(".sort((a, b) => b.sequence - a.sequence)");
    expect(resolver).not.toContain("source_stem");
    expect(migration).toContain("legacy source-stem amendment base inference was not found");
    expect(migration).toContain("base.source_stem = document.source_stem");
    expect(migration).toContain("URL/source_stem similarity is not legislative attachment evidence");
  });

  it("preserves the amendment before resolving or attaching it, then stops before one-source result processing", () => {
    const start = pipeline.indexOf("export async function process_legislative_version(");
    const end = pipeline.indexOf("\n}\n", start);
    const body = pipeline.slice(start, end + 2);
    const preserve = body.indexOf("register_rosetta_source_content");
    const record = body.indexOf("record_source_ingested");
    const resolve = body.indexOf("resolve_current_amendment_attachment");
    const attach = body.indexOf("register_rosetta_amendment_attachment");
    const deltaHold = body.indexOf("legislative_amendment_delta_execution_contract_unavailable");
    const currentRead = body.indexOf("load_rosetta_current_docket_result_for_binding");
    expect(preserve).toBeGreaterThanOrEqual(0);
    expect(record).toBeGreaterThan(preserve);
    expect(resolve).toBeGreaterThan(record);
    expect(attach).toBeGreaterThan(resolve);
    expect(deltaHold).toBeGreaterThan(attach);
    expect(currentRead).toBeGreaterThan(deltaHold);
    expect(body).not.toMatch(/run_rosetta|replay_execute|class_stage_execute|start_class_stage/i);
  });

  it("parks amendment dependencies without retries or source-host blockage", () => {
    expect(worker).toContain('"awaiting_amendment_attachment"');
    expect(worker).toContain('"awaiting_amendment_base"');
    expect(worker).toContain('"awaiting_delta_executor"');
    expect(worker).toContain("next_attempt_at='infinity'::timestamptz");
    expect(worker).toContain("queue.next_attempt_at < 'infinity'::timestamptz");
    const hold = worker.slice(
      worker.indexOf("async function park_amendment_dependency"),
      worker.indexOf("export async function process_legislative_version_job"),
    );
    expect(hold).not.toContain("attempt_count = attempt_count + 1");
    expect(hold).not.toContain("processing_state = 'failed'");
  });

  it("wakes only an exact base dependency when preserved base content arrives", () => {
    expect(migration).toContain("wake_civic_genome_amendments_for_base_v1");
    expect(migration).toContain("amendment.base_bill_version_id=new.bill_version_id");
    expect(migration).toContain("queue.last_failure_class='awaiting_amendment_base'");
    expect(migration).toContain("queue.next_attempt_at='infinity'::timestamptz");
  });

  it("separates bill overview, exact bill text, and amendment artifact in the UI", () => {
    expect(genomePage).toContain("Bill overview / status");
    expect(genomePage).not.toContain(">Tracked source</a>");
    expect(evaluation).toContain("Official text for this version");
    expect(evaluation).toContain("Official amendment artifact");
    expect(evaluation).toContain("amendment artifacts are deltas that require an exact base");
    expect(evaluation).toContain("Rosetta amendment status");
  });
});
