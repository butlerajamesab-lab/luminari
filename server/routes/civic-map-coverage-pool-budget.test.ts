import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  gov_sites: vi.fn(),
  db_query: vi.fn(),
}));

vi.mock("../services/resource-directory", () => ({
  getGovOfficeDetail: vi.fn(),
  getGovOfficeExactSiteCount: mocks.gov_sites,
  getResourceDirectoryDetail: vi.fn(),
  getResourceDirectoryMapPoints: vi.fn(),
}));
vi.mock("../services/resource-directory-publishable", () => ({
  get_publishable_resource_directory_summary: mocks.summary,
}));
vi.mock("../db", () => ({
  getPool: () => ({ query: mocks.db_query }),
}));

const { getBreadthPreservingCoverage } = await import("./civic-map-router");

describe("CivicMap shared coverage pool budget", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.summary.mockResolvedValue({
      total_directory_records: 12,
      total_resources: 12,
      direct_resource_count: 8,
      program_count: 4,
      jurisdiction_count: 3,
    });
    mocks.db_query.mockResolvedValue({
      rows: [{ verified_physical_sites: 2, exact_mappable_resources: 1 }],
    });
    mocks.gov_sites.mockResolvedValue(3);
  });

  it("coalesces concurrent coverage reads and does not fan out before the summary succeeds", async () => {
    let resolve_summary!: (value: Record<string, unknown>) => void;
    mocks.summary.mockImplementationOnce(() =>
      new Promise<Record<string, unknown>>((resolve) => { resolve_summary = resolve; }),
    );
    const requests = [
      getBreadthPreservingCoverage(),
      getBreadthPreservingCoverage(),
      getBreadthPreservingCoverage(),
    ];

    expect(mocks.summary).toHaveBeenCalledTimes(1);
    expect(mocks.db_query).not.toHaveBeenCalled();
    expect(mocks.gov_sites).not.toHaveBeenCalled();

    resolve_summary({ total_directory_records: 12, total_resources: 12 });
    const [a, b, c] = await Promise.all(requests);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.exact_mappable_resources).toBe(4);
    expect(mocks.db_query).toHaveBeenCalledTimes(1);
    expect(mocks.gov_sites).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a summary read timeout without consuming two more pool reads", async () => {
    mocks.summary.mockRejectedValueOnce(new Error("Query read timeout"));
    await expect(getBreadthPreservingCoverage()).rejects.toThrow("Query read timeout");
    expect(mocks.db_query).not.toHaveBeenCalled();
    expect(mocks.gov_sites).not.toHaveBeenCalled();

    const recovered = await getBreadthPreservingCoverage();
    expect(recovered.total_directory_records).toBe(12);
    expect(mocks.summary).toHaveBeenCalledTimes(2);
    expect(mocks.db_query).toHaveBeenCalledTimes(1);
  });

  it("rejects missing aggregate rows rather than reporting zero verified sites", async () => {
    mocks.db_query.mockResolvedValueOnce({ rows: [] });
    await expect(getBreadthPreservingCoverage()).rejects.toThrow(
      "civic_map_reviewed_site_counts_missing",
    );
    const recovered = await getBreadthPreservingCoverage();
    expect(recovered.verified_physical_sites).toBe(2);
  });
});
