import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
}));

vi.mock("../services/resource-directory-unified", () => ({
  get_unified_catalog_detail: vi.fn(),
  get_unified_catalog_map_points: vi.fn(),
  get_unified_catalog_summary: mocks.summary,
}));

const { getUnifiedCoverage } = await import("./civic-map-router");

// U3: coverage is a single unified-catalog read. The pool-budget
// discipline survives the cutover — concurrent health/coverage requests
// coalesce onto one in-flight summary, and a failed summary fails
// closed instead of fanning out to divergent fallback counts.
describe("CivicMap unified coverage pool budget", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.summary.mockResolvedValue({
      total_directory_records: 70264,
      total_resources: 70264,
      direct_resource_count: 70264,
      program_count: 0,
      jurisdiction_count: 57,
      exact_mappable_resources: 59599,
    });
  });

  it("coalesces concurrent coverage reads onto one summary call", async () => {
    let resolve_summary!: (value: Record<string, unknown>) => void;
    mocks.summary.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolve_summary = resolve;
        }),
    );
    const requests = [
      getUnifiedCoverage(),
      getUnifiedCoverage(),
      getUnifiedCoverage(),
    ];

    expect(mocks.summary).toHaveBeenCalledTimes(1);

    resolve_summary({ total_directory_records: 70264, total_resources: 70264 });
    const [a, b, c] = await Promise.all(requests);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.total_directory_records).toBe(70264);
  });

  it("fails closed on a summary read failure and recovers on the next call", async () => {
    mocks.summary.mockRejectedValueOnce(new Error("Query read timeout"));
    await expect(getUnifiedCoverage()).rejects.toThrow("Query read timeout");

    const recovered = await getUnifiedCoverage();
    expect(recovered.total_directory_records).toBe(70264);
    expect(mocks.summary).toHaveBeenCalledTimes(2);
  });
});
