import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, reconcile } = vi.hoisted(() => ({
  query: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query,
}));

vi.mock("./civic-genome-legislative-version-pipeline", () => ({
  reconcile_preserved_amendment_source_basis: reconcile,
}));

import { reconcile_preserved_amendment_sources } from "./civic-genome-amendment-source-completion";

const job = {
  queue_id: "88b76f32-18fa-4808-b159-3917a8dfaab4",
  bill_version_id: "feb328c4-f324-48a3-b3a7-381fbc9c924f",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("preserved amendment source-completion lane", () => {
  it("parks a resolved attachment at the delta boundary without consuming an attempt", async () => {
    query
      .mockResolvedValueOnce({ rows: [job] })
      .mockResolvedValueOnce({ rows: [{ queue_id: job.queue_id }] })
      .mockResolvedValueOnce({ rows: [] });
    reconcile.mockResolvedValue({
      failure_class: "awaiting_delta_executor",
      error_code: "legislative_amendment_delta_execution_contract_unavailable",
    });

    await expect(reconcile_preserved_amendment_sources({ limit: 1, concurrency: 1 }))
      .resolves.toEqual({
        checked: 1,
        awaiting_attachment: 0,
        awaiting_base: 0,
        awaiting_delta: 1,
        transient: 0,
      });

    const claimSql = String(query.mock.calls[0][0]);
    expect(claimSql).toContain("version.document_family='amendment'");
    expect(claimSql).toContain("version.processing_state='source_ingested'");
    expect(claimSql).toContain("rosetta_source_content_id");
    expect(claimSql).toContain("source_content_hash");

    const parkSql = String(query.mock.calls[1][0]);
    expect(parkSql).toContain("next_attempt_at='infinity'::timestamptz");
    expect(parkSql).toContain("last_failure_class=$2::text");
    expect(parkSql).not.toContain("attempt_count");
    expect(reconcile).toHaveBeenCalledWith(job.bill_version_id);
  });

  it("uses a delayed observation retry for transport errors without consuming queue attempts", async () => {
    query
      .mockResolvedValueOnce({ rows: [job] })
      .mockResolvedValueOnce({ rows: [{ queue_id: job.queue_id }] });
    reconcile.mockRejectedValue(new Error("legislative_version_rosetta_request_timeout:150000"));

    await expect(reconcile_preserved_amendment_sources({ limit: 1, concurrency: 1 }))
      .resolves.toEqual({
        checked: 1,
        awaiting_attachment: 0,
        awaiting_base: 0,
        awaiting_delta: 0,
        transient: 1,
      });

    const releaseSql = String(query.mock.calls[1][0]);
    expect(releaseSql).toContain("amendment_source_completion_transient");
    expect(releaseSql).toContain("make_interval");
    expect(releaseSql).not.toContain("attempt_count");
  });
});
