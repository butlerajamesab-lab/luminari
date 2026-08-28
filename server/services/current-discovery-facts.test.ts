import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../db", () => ({
  getPool: () => ({ query }),
}));

import { readCurrentDiscoveryFacts } from "./current-discovery-facts";

describe("current discovery fact verification semantics", () => {
  beforeEach(() => {
    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{}] });
  });

  it("uses an anchored verification predicate for ranking and summary counts", async () => {
    await readCurrentDiscoveryFacts();

    const pageSql = String(query.mock.calls[0]?.[0]);
    const summarySql = String(query.mock.calls[2]?.[0]);
    const verifiedPredicate =
      "lower(trim(coalesce(verification_status,''))) like 'verified%'";

    expect(pageSql).toContain(`when ${verifiedPredicate} then 100`);
    expect(pageSql).toContain(
      "when website is not null or phone is not null then 70",
    );
    expect(pageSql).toContain("as display_priority");
    expect(pageSql).toContain("order by display_priority desc");
    expect(summarySql).toContain(
      `count(*) filter(where ${verifiedPredicate})::int as verified`,
    );
    expect(`${pageSql}\n${summarySql}`).not.toContain("ilike '%verified%'");
  });
});
