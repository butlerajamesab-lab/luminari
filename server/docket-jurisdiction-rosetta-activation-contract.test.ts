import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("Docket jurisdiction to Rosetta activation contract", () => {
  const migration = read_repo_file(
    "../supabase/migrations/20260806182000_docket_jurisdiction_rosetta_activation.sql",
  );
  const activation_worker = read_repo_file("./docket-jurisdiction-activation-queue-worker.ts");
  const version_worker = read_repo_file("./civic-genome-legislative-version-queue-worker.ts");
  const startup = read_repo_file("./services/prism-rosetta-startup-activation.ts");

  it("activates every persisted jurisdiction cache generation without a bill click", () => {
    expect(migration).toContain("create trigger docket_state_cache_enqueue_activation");
    expect(migration).toContain("after insert or update of bills, fetched_at");
    expect(migration).toContain("on public.docket_bill_state_cache");
    expect(migration).toContain("jsonb_array_elements(coalesce(p_bills, '[]'::jsonb))");
    expect(migration).toContain("source_bill_id, summary_fingerprint");
  });

  it("deduplicates shared work while preserving each jurisdiction activation", () => {
    expect(migration).toContain("docket_bill_processing_generation_unique");
    expect(migration).toContain("unique (source_bill_id, summary_fingerprint)");
    expect(migration).toContain("docket_jurisdiction_activation_bill");
    expect(migration).toContain("primary key (activation_id, source_bill_id)");
  });

  it("uses the existing legislative-version spine instead of a second Rosetta path", () => {
    expect(activation_worker).toContain("register_docket_legislative_version_spine");
    expect(activation_worker).not.toContain("invoke_rosetta_extraction");
    expect(activation_worker).not.toContain("assemble_rosetta_and_resolve_family");
    expect(activation_worker).not.toContain("submit_prism_verification_request");
  });

  it("keeps external retrieval bounded but removes the one-version-per-ten-second Rosetta bottleneck", () => {
    expect(activation_worker).toContain("DOCKET_BILL_ACTIVATION_CONCURRENCY");
    expect(activation_worker).toContain("Promise.all(jobs.map");
    expect(version_worker).toContain("LEGISLATIVE_VERSION_QUEUE_CONCURRENCY");
    expect(version_worker).toContain("Promise.all(jobs.map");
    expect(version_worker).toContain("const DEFAULT_POLL_INTERVAL_MS = 1_000");
    expect(version_worker).not.toContain("limit 1");
  });

  it("starts the pre-Rosetta activation worker with the existing downstream workers", () => {
    expect(startup).toContain("start_docket_bill_activation_queue_worker");
    expect(startup).toContain("start_legislative_version_queue_worker");
    expect(startup).toContain("start_prism_rosetta_queue_worker");
  });

  it("preserves explicit source absence and immutable historical versions", () => {
    expect(migration).toContain("'source_unavailable'");
    expect(activation_worker).toContain("registered_document_count > 0");
    expect(activation_worker).toContain("source_unavailable");
    expect(migration).not.toMatch(/delete\s+from\s+public\.docket_bill_source_document/i);
    expect(migration).not.toMatch(/truncate/i);
  });
});
