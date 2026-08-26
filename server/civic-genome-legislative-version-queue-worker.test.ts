import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, process_version, rosetta_fetch } = vi.hoisted(() => ({
  query: vi.fn(),
  process_version: vi.fn(),
  rosetta_fetch: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query,
}));

vi.mock("./civic-genome-legislative-version-pipeline", () => ({
  process_legislative_version: process_version,
}));

vi.stubGlobal("fetch", rosetta_fetch);

import {
  classify_legislative_version_failure,
  is_exact_docket_document_identifier,
  legislative_version_retry_delay_seconds,
  load_oldest_unbound_docket_identifiers,
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
  document_identifier: "docket:2064783:text:2064783:3298849",
  durable_content_recovery: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.example.test");
  vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  query.mockResolvedValue({ rows: [] });
  rosetta_fetch.mockResolvedValue(new Response("[]", {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
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

  it("accepts only exact source-bill-bound Docket document identities", () => {
    expect(is_exact_docket_document_identifier(
      "docket:2064783:text:2064783:3298849",
    )).toBe(true);
    expect(is_exact_docket_document_identifier(
      "docket:2064783:amendment:2064783:12345",
    )).toBe(true);
    expect(is_exact_docket_document_identifier(
      "docket:2064783:text:9999999:3298849",
    )).toBe(false);
    expect(is_exact_docket_document_identifier("docket:2064783:text:3298849")).toBe(false);
  });

  it("loads the bounded Rosetta selector in its returned oldest-first order", async () => {
    rosetta_fetch.mockResolvedValueOnce(new Response(JSON.stringify([
      {
        source_document_id: 46,
        document_identifier: "docket:1994334:text:1994334:3157683",
        registered_at: "2026-08-05T22:35:55.418674+00:00",
      },
      {
        source_document_id: 70,
        document_identifier: "docket:2073426:amendment:2073426:282585",
        registered_at: "2026-08-05T22:41:36.027414+00:00",
      },
    ]), { status: 200 }));

    await expect(load_oldest_unbound_docket_identifiers()).resolves.toEqual([
      "docket:1994334:text:1994334:3157683",
      "docket:2073426:amendment:2073426:282585",
    ]);

    expect(rosetta_fetch).toHaveBeenCalledTimes(1);
    expect(String(rosetta_fetch.mock.calls[0][0])).toBe(
      "https://rosetta.example.test/rest/v1/rpc/rosetta_unbound_docket_source_documents_v1",
    );
    expect(rosetta_fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ p_limit: 100 }),
    });
  });

  it("rejects a Rosetta selector response whose identity crosses source bills", async () => {
    rosetta_fetch.mockResolvedValueOnce(new Response(JSON.stringify([{
      source_document_id: 46,
      document_identifier: "docket:1994334:text:2073426:3157683",
      registered_at: "2026-08-05T22:35:55.418674+00:00",
    }]), { status: 200 }));

    await expect(load_oldest_unbound_docket_identifiers()).rejects.toThrow(
      "rosetta_unbound_docket_selector_identity_invalid",
    );
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

  it("prioritizes current Docket sessions, then current versions, while preserving source-host backpressure", async () => {
    await run_legislative_version_queue_cycle();

    const claim_sql = query.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes("with current_sessions as"));
    expect(claim_sql).toBeTruthy();
    expect(claim_sql).toContain("select distinct state, session_id::text as session_key");
    expect(claim_sql).toContain("join public.civic_genome_bill bill");
    expect(claim_sql).toContain("left join current_sessions current_session");
    expect(claim_sql).toContain("current_session.state = bill.state_code");
    expect(claim_sql).toContain("current_session.session_key = bill.session_key");
    expect(claim_sql).toContain("(current_session.state is not null) desc");
    expect(claim_sql).toContain("currency.is_current desc");
    expect(claim_sql).toContain("source_host.last_attempt_at asc nulls first");
    expect(claim_sql).toContain("source_host.blocked_until");
    expect(claim_sql).toContain("split_part(lower(document.source_url), '/', 3)");
    expect(claim_sql).toContain("version.processing_state not in ('verified', 'verified_with_findings')");
    expect(claim_sql).toContain("queue.queue_state = 'permanent_failure'");
    expect(claim_sql).toContain("rosetta_identity.document_identifier = any($4::text[])");
    expect(claim_sql).toContain("array_position($4::text[], rosetta_identity.document_identifier)");
    expect(claim_sql).toContain("'durable_content_recovery_v1'");
    expect(claim_sql).toContain("'contract', $5::text");
    expect(claim_sql).toContain("for update of queue, version skip locked");

    const currentSessionOrder = claim_sql.indexOf("(current_session.state is not null) desc");
    const currentVersionOrder = claim_sql.indexOf("currency.is_current desc");
    const hostFairnessOrder = claim_sql.indexOf("source_host.last_attempt_at asc nulls first");
    expect(currentSessionOrder).toBeGreaterThanOrEqual(0);
    expect(currentVersionOrder).toBeGreaterThan(currentSessionOrder);
    expect(hostFairnessOrder).toBeGreaterThan(currentVersionOrder);
  });

  it("continues ordinary queue claims when the supplemental Rosetta selector is unavailable", async () => {
    rosetta_fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));

    await expect(run_legislative_version_queue_cycle()).resolves.toBeUndefined();

    expect(query.mock.calls.some(call => String(call[0]).includes("candidate as materialized"))).toBe(true);
  });

  it("preserves queue and version failure receipts for real pipeline failures", async () => {
    process_version.mockRejectedValue(new Error("legislative_version_source_fetch_failed:503"));

    await process_legislative_version_job(job);

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toContain("queue_state = $2");
    expect(query.mock.calls[0][1][1]).toBe("degraded");
    expect(query.mock.calls[0][1][2]).toBe("transient");
    expect(query.mock.calls[0][1][3]).toBe("legislative_version_source_fetch_failed:503");
    expect(String(query.mock.calls[1][0])).toContain("processing_state = 'failed'");
  });

  it("does not mark an assembled bill failed when only completion bookkeeping fails", async () => {
    query.mockRejectedValueOnce(new Error("legislative_version_queue_complete query timed out after 5000ms"));

    await expect(process_legislative_version_job(job)).resolves.toBeUndefined();

    expect(process_version).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(call => String(call[0]).includes("processing_state = 'failed'"))).toBe(false);
  });
});
