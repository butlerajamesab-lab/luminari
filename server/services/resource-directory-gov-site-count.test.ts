import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ getPool: () => ({ query }) }));
const { getGovOfficeExactSiteCount } = await import("./resource-directory");

describe("government-office map counts", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("rejects a missing aggregate row instead of fabricating zero physical sites", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(getGovOfficeExactSiteCount()).rejects.toThrow(
      "gov_office_exact_site_count_missing",
    );
  });

  it("preserves genuine zero when the database returns a valid aggregate", async () => {
    query.mockResolvedValueOnce({ rows: [{ gov_office_exact_sites: 0 }] });
    await expect(getGovOfficeExactSiteCount()).resolves.toBe(0);
  });
});
