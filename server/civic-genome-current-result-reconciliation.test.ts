import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, attach_current } = vi.hoisted(() => ({
  query: vi.fn(),
  attach_current: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query,
}));

vi.mock("./civic-genome-legislative-version-pipeline", () => ({
  attach_completed_current_result: attach_current,
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
  it("attaches only an exact current key/hash and completes the queue without consuming an attempt", async () => {
    query
      .mockResolvedValueOnce({ rows: [candidate] })
      .mockResolvedValueOnce({ rows: [{ queue_id: candidate.queue_id }] });
    attach_current.mockResolvedValue({
      bill_version_id: candidate.bill_version_id,
      source_document_key: candidate.source_document_key,
      extraction_run_id: 1014063,
      assembly_run_id: "11111111-1111-4111-8111-111111111111",
    });

    await expect(reconcile_awaiting_current_results({ limit: 1, concurrency: 1 }))
      .resolves.toEqual({
        checked: 1,
        attached: 1,
        still_held: 0,
        read_errors: 0,
      });

    expect(attach_current).toHaveBeenCalledWith(candidate.bill_version_id);

    const claim_sql = String(query.mock.calls[0][0]);
    expect(claim_sql).toContain("version.document_family = 'text'");
    expect(claim_sql).toContain("version.processing_state = 'source_ingested'");
    expect(claim_sql).toContain("version.rosetta_extraction_run_id is null");
    expect(claim_sql).toContain("not exists (");
    expect(claim_sql).toContain("queue.queue_state = 'eligible'");
    expect(claim_sql).toContain("queue.attempt_count = 0");
    expect(claim_sql).toContain("last_failure_class = 'awaiting_current_result'");
    expect(claim_sql).toContain("current_docket_result_awaiting_publication");

    const complete_sql = String(query.mock.calls[1][0]);
    expect(complete_sql).toContain("queue_state = 'completed'");
    expect(complete_sql).toContain("version.source_document_key = $3::text");
    expect(complete_sql).toContain("lower(version.receipt_json->>'source_content_hash') = $4::text");
    expect(complete_sql).toContain("version.rosetta_extraction_run_id = $5::text");
    expect(complete_sql).toContain("version.assembly_run_id = $6::uuid");
    expect(complete_sql).not.toContain("attempt_count =");
  });

  it("leaves a source observed when Rosetta has no complete current result", async () => {
    query.mockResolvedValueOnce({ rows: [candidate] });
    attach_current.mockResolvedValue(null);

    await expect(reconcile_awaiting_current_results({ limit: 1, concurrency: 1 }))
      .resolves.toEqual({
        checked: 1,
        attached: 0,
        still_held: 1,
        read_errors: 0,
      });

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain(
      "set current_result_checked_at = now()",
    );
  });

  it("records an attachment/read error without changing queue state", async () => {
    query.mockResolvedValueOnce({ rows: [candidate] });
    attach_current.mockRejectedValue(
      new Error("current_result_attachment_source_receipt_incomplete"),
    );

    await expect(reconcile_awaiting_current_results({ limit: 1, concurrency: 1 }))
      .resolves.toEqual({
        checked: 1,
        attached: 0,
        still_held: 0,
        read_errors: 1,
      });

    expect(query).toHaveBeenCalledTimes(1);
  });
});
