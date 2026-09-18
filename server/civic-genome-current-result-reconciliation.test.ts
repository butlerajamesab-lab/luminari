import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, load_current } = vi.hoisted(() => ({
  query: vi.fn(),
  load_current: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query,
}));

vi.mock("./civic-genome-rosetta-evaluation", () => ({
  load_rosetta_current_docket_result_for_binding: load_current,
}));

import { reconcile_awaiting_current_results } from "./civic-genome-current-result-reconciliation";

const candidate = {
  queue_id: "c703eb41-10c2-49ed-9eca-3d5276c1253d",
  bill_version_id: "c3c37795-f156-426d-b648-37f48f15ae19",
  source_document_key: "text:2154300:3458435",
  source_content_hash: "c49622936a92465d729062043d01e2d7ac5eb899e4b220fe7684446f1aee2c7a",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("current Rosetta result arrival reconciliation", () => {
  it("wakes only an exact held key/hash after Rosetta reports complete", async () => {
    query
      .mockResolvedValueOnce({ rows: [candidate] })
      .mockResolvedValueOnce({ rows: [{ queue_id: candidate.queue_id }] });
    load_current.mockResolvedValue({
      status: "complete",
      current_result: { extraction_run_id: 1014063 },
    });

    await expect(reconcile_awaiting_current_results({ limit: 1, concurrency: 1 }))
      .resolves.toEqual({
        checked: 1,
        woken: 1,
        still_held: 0,
        read_errors: 0,
      });

    expect(load_current).toHaveBeenCalledWith({
      source_document_key: candidate.source_document_key,
      source_content_hash: candidate.source_content_hash,
    });

    const claim_sql = String(query.mock.calls[0][0]);
    expect(claim_sql).toContain("last_failure_class = 'awaiting_current_result'");
    expect(claim_sql).toContain("next_attempt_at = 'infinity'::timestamptz");
    expect(claim_sql).toContain("current_result_checked_at nulls first");
    expect(claim_sql).toContain("current_docket_result_awaiting_publication");

    const wake_sql = String(query.mock.calls[1][0]);
    expect(wake_sql).toContain("queue_state = 'eligible'");
    expect(wake_sql).toContain("last_failure_class = null");
    expect(wake_sql).toContain("last_error_code = null");
    expect(wake_sql).toContain("version.source_document_key = $3::text");
    expect(wake_sql).toContain("lower(version.receipt_json->>'source_content_hash') = $4::text");
    expect(wake_sql).not.toContain("attempt_count");
    expect(query.mock.calls[1][1]).toEqual([
      candidate.queue_id,
      candidate.bill_version_id,
      candidate.source_document_key,
      candidate.source_content_hash,
    ]);
  });

  it("leaves an exact hold parked when Rosetta is not complete", async () => {
    query.mockResolvedValueOnce({ rows: [candidate] });
    load_current.mockResolvedValue({
      status: "awaiting_analysis",
      current_result: null,
    });

    await expect(reconcile_awaiting_current_results({ limit: 1, concurrency: 1 }))
      .resolves.toEqual({
        checked: 1,
        woken: 0,
        still_held: 1,
        read_errors: 0,
      });

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain(
      "set current_result_checked_at = now()",
    );
  });

  it("records a read error without changing queue eligibility", async () => {
    query.mockResolvedValueOnce({ rows: [candidate] });
    load_current.mockRejectedValue(new Error("rosetta_public_current_docket_result_read_timeout"));

    await expect(reconcile_awaiting_current_results({ limit: 1, concurrency: 1 }))
      .resolves.toEqual({
        checked: 1,
        woken: 0,
        still_held: 0,
        read_errors: 1,
      });

    expect(query).toHaveBeenCalledTimes(1);
  });
});
