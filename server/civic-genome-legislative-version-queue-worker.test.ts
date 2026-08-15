import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, process_version } = vi.hoisted(() => ({
  query: vi.fn(),
  process_version: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query,
}));

vi.mock("./civic-genome-legislative-version-pipeline", () => ({
  process_legislative_version: process_version,
}));

import {
  classify_legislative_version_failure,
  legislative_version_retry_delay_seconds,
  process_legislative_version_job,
  run_legislative_version_queue_cycle,
} from "./civic-genome-legislative-version-queue-worker";

const job = {
  queue_id: "11111111-1111-4111-8111-111111111111",
  bill_version_id: "22222222-2222-4222-8222-222222222222",
  source_document_key: "text:2064783:3298849",
  source_bill_id: 2064783,
  document_family: "text" as const,
  version_type: "introduced",
  attempt_count: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
  process_version.mockResolvedValue({
    bill_version_id: job.bill_version_id,
    genome_bill_id: "33333333-3333-4333-8333-333333333333",
    source_document_key: job.source_document_key,
    source_bill_id: job.source_bill_id,
    document_family: job.document_family,
    version_type: job.version_type,
    rosetta_source_document_id: 41,
    extraction: {
      extraction_run_id: 51,
      engine_version: "rosetta-v3-deterministic-sql-2.1.0",
    },
    assembly: {
      assembly_run_id: "44444444-4444-4444-8444-444444444444",
    },
  });
});

describe("legislative version queue", () => {
  it("uses bounded exponential retry timing", () => {
    expect(legislative_version_retry_delay_seconds(1)).toBe(30);
    expect(legislative_version_retry_delay_seconds(2)).toBe(60);
    expect(legislative_version_retry_delay_seconds(20)).toBe(3600);
  });

  it("classifies source and structural contract failures as terminal", () => {
    expect(classify_legislative_version_failure({
      error: new Error("legislative_version_source_format_unsupported"),
      prior_attempt_count: 0,
    })).toMatchObject({
      queue_state: "permanent_failure",
      failure_class: "deterministic_contract",
      terminal: true,
      retry_delay_seconds: 0,
    });

    expect(classify_legislative_version_failure({
      error: new Error("rosetta_completed_run_has_no_objects"),
      prior_attempt_count: 0,
    })).toMatchObject({
      queue_state: "permanent_failure",
      failure_class: "deterministic_contract",
      terminal: true,
    });
  });

  it("retries transient failures and eventually preserves an unknown terminal state", () => {
    expect(classify_legislative_version_failure({
      error: new Error("legislative_version_source_fetch_failed:503"),
      prior_attempt_count: 0,
    })).toMatchObject({
      queue_state: "degraded",
      failure_class: "transient",
      terminal: false,
      retry_delay_seconds: 30,
    });

    expect(classify_legislative_version_failure({
      error: new Error("unexpected_runtime_failure"),
      prior_attempt_count: 4,
    })).toMatchObject({
      queue_state: "permanent_failure",
      failure_class: "unknown",
      terminal: true,
      retry_delay_seconds: 0,
    });
  });

  it("processes only the exact queued bill-version identity", async () => {
    await process_legislative_version_job(job);

    expect(process_version).toHaveBeenCalledTimes(1);
    expect(process_version).toHaveBeenCalledWith(job.bill_version_id);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain("queue_state = 'completed'");
    expect(query.mock.calls[0][1][0]).toBe(job.queue_id);
  });

  it("prioritizes current versions and cools a failing source host without blocking other legislatures", async () => {
    await run_legislative_version_queue_cycle();

    const claim_sql = query.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes("for update of queue skip locked"));
    expect(claim_sql).toContain("currency.is_current desc");
    expect(claim_sql).toContain("with host_activity as");
    expect(claim_sql).toContain("source_host.last_attempt_at asc nulls first");
    expect(claim_sql).toContain("source_host.blocked_until");
    expect(claim_sql).toContain("split_part(lower(document.source_url), '/', 3)");
    expect(claim_sql).toContain("version.processing_state not in ('verified', 'verified_with_findings')");
  });

  it("preserves queue and version failure receipts", async () => {
    process_version.mockRejectedValue(new Error("legislative_version_source_fetch_failed:503"));

    await process_legislative_version_job(job);

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toContain("queue_state = $2");
    expect(query.mock.calls[0][1][1]).toBe("degraded");
    expect(query.mock.calls[0][1][2]).toBe("transient");
    expect(query.mock.calls[0][1][3]).toBe("legislative_version_source_fetch_failed:503");
    expect(String(query.mock.calls[1][0])).toContain("processing_state = 'failed'");
  });
});
