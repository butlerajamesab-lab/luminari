import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { use_query } = vi.hoisted(() => ({ use_query: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    civicGenome: {
      get_docket_verified_enrichment: { useQuery: use_query },
      get_docket_archive_auxiliary_receipts: { useQuery: use_query },
    },
  },
}));

import { DocketBillDetailWorkspace } from "./DocketBillDetailWorkspace";

describe("Docket bill detail workspace", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
    vi.resetAllMocks();
    use_query.mockReturnValue({ data: { amendment_disposition_conflicts: [], people: [], roll_calls: [] }, isLoading: false, isError: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows completed procedure separately from a future effective date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00Z"));
    const html = renderToStaticMarkup(
      <DocketBillDetailWorkspace
        session_current={true}
        payload={{
          source: "cache",
          fetched_at: "2026-09-17T00:00:00Z",
          bill: {
            bill_id: 101,
            bill_number: "HB 101",
            title: "Example bill",
            status: 4,
            status_desc: "Signed by the Governor",
            effective_date: "2026-10-01",
            last_action: "Signed by the Governor",
            last_action_date: "2026-09-01",
          },
        }}
      />,
    );

    expect(html).toContain("Procedural status");
    expect(html).toContain("Completed");
    expect(html).toContain("Operational status");
    expect(html).toContain("Takes effect Oct 1, 2026");
    expect(html).not.toContain("Live · changeable");
    vi.useRealTimers();
  });

  it("keeps stale freshness separate from completed procedure", () => {
    const html = renderToStaticMarkup(
      <DocketBillDetailWorkspace
        session_current={false}
        payload={{
          source: "cache_stale_worker_paused",
          fetched_at: "2026-01-01T00:00:00Z",
          refresh_state: "refresh_paused",
          bill: {
            bill_id: 202,
            bill_number: "SB 202",
            title: "Another bill",
            status: 5,
            last_action: "Became law",
            last_action_date: "2025-05-01",
          },
        }}
      />,
    );

    expect(html).toContain("Completed");
    expect(html).toContain("Source freshness");
    expect(html).toContain("Refresh paused");
    expect(html).not.toContain("Stalled / inactive");
  });

  it("labels source-preserved roll calls as unvalidated and renders their receipt provenance", () => {
    use_query.mockReturnValueOnce({ data: { amendment_disposition_conflicts: [] }, isLoading: false, isError: false });
    use_query.mockReturnValueOnce({ data: {
      people: [{ payload: { people_id: 7855, name: "Source Person" }, provenance: { archive_sha256: "a".repeat(64), member_path: "MT/session/people/7855.json", member_sha256: "b".repeat(64), state: "MT", provider_record_id: 7855 } }],
      roll_calls: [{ payload: { roll_call_id: 1481116, bill_id: 101, yea: 12 }, provenance: { archive_sha256: "a".repeat(64), member_path: "MT/session/vote/1481116.json", member_sha256: "c".repeat(64), state: "MT", provider_record_id: 1481116 } }],
    }, isLoading: false, isError: false });
    const html = renderToStaticMarkup(<DocketBillDetailWorkspace payload={{ source: "legiscan_bulk_json", bill: { bill_id: 101, state: "MT", sponsors: [{ people_id: 7855 }] } }} />);
    expect(html).toContain("LegiScan source-preserved people");
    expect(html).toContain("Source-preserved roll-call receipts · not validated/current");
    expect(html).toContain("member_path MT/session/vote/1481116.json");
    expect(html).toContain("archive_sha256");
  });

  it("uses the canonical unknown classification when currentness is missing", () => {
    const html = renderToStaticMarkup(
      <DocketBillDetailWorkspace
        payload={{
          source: "cache",
          fetched_at: "2026-09-17T00:00:00Z",
          bill: {
            bill_id: 303,
            bill_number: "HB 303",
            title: "Sparse bill",
            status: 1,
          },
        }}
      />,
    );

    expect(html).toContain("Procedural status unknown");
    expect(html).toContain("Effective date not supplied");
  });
});
