import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { use_query } = vi.hoisted(() => ({ use_query: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    civicGenome: {
      get_docket_verified_enrichment: { useQuery: use_query },
    },
  },
}));

import { DocketBillDetailWorkspace } from "./DocketBillDetailWorkspace";

describe("Docket bill detail workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    use_query.mockReturnValue({ data: { amendment_disposition_conflicts: [] }, isLoading: false, isError: false });
  });

  it("shows completed procedure separately from a future effective date", () => {
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
