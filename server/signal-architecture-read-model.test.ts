import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

import { read_signal_architecture } from "./signal-architecture-read-model";

describe("global signal architecture read boundary", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("preserves intake aggregates but excludes every intake recent-record field", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        domains: [{
          domain_code: "case_intake",
          domain_label: "Case intake",
          canonical_relation: "intake_signals",
          source_owner: "intake",
          description: "aggregate description",
          source_boundary: "case-bound",
          severity_policy: "source",
          confidence_policy: "source",
          is_source_domain: true,
          total_record_count: 12,
          current_record_count: 8,
          latest_record_at: "2026-08-08T00:00:00.000Z",
        }],
        integrity: {
          intake_signal_count: 12,
          legacy_status: "quarantined",
          atlas_status: "current",
        },
        recent_records: [{
          domain_code: "case_intake",
          record_id: "private-intake-id",
          title: "private intake title",
          description: "private intake description",
          jurisdiction_id: "private-jurisdiction",
          status: "private-status",
          source_reference: "private-source",
          occurred_at: "2026-08-08T00:00:00.000Z",
          created_at: "2026-08-08T00:00:00.000Z",
        }, {
          domain_code: "legal_pattern",
          record_id: "public-pattern-id",
          title: "Pattern title",
          description: "Pattern description",
          jurisdiction_id: null,
          status: "current",
          source_reference: "source-pattern",
          occurred_at: "2026-08-07T00:00:00.000Z",
          created_at: "2026-08-07T00:00:00.000Z",
        }],
      }],
    });

    const result = await read_signal_architecture(25);

    expect(result.domains[0]).toMatchObject({
      domain_code: "case_intake",
      total_record_count: 12,
      current_record_count: 8,
    });
    expect(result.integrity.intake_signal_count).toBe(12);
    expect(result.recent_records).toEqual([expect.objectContaining({
      domain_code: "legal_pattern",
      record_id: "public-pattern-id",
    })]);
    expect(JSON.stringify(result.recent_records)).not.toMatch(/private-intake|private intake|private-source|private-status/);

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain("where domain_code <> 'case_intake'");
    expect(query.mock.calls[0][1]).toEqual([25]);
  });
});
