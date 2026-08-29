import { beforeEach, describe, expect, it, vi } from "vitest";

const pool_state = vi.hoisted(() => ({
  active_queries: 0,
  maximum_active_queries: 0,
  query: vi.fn(),
}));

vi.mock("../db", () => ({
  getPool: () => ({ query: pool_state.query }),
  pool: { query: pool_state.query },
}));

import { adminDashboardRouter } from "./admin-dashboard";

describe("Mission Control admin dashboard pool budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pool_state.active_queries = 0;
    pool_state.maximum_active_queries = 0;
    pool_state.query.mockImplementation(async () => {
      pool_state.active_queries += 1;
      pool_state.maximum_active_queries = Math.max(
        pool_state.maximum_active_queries,
        pool_state.active_queries,
      );

      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      pool_state.active_queries -= 1;

      return {
        rows: [{
          cnt: 0,
          id: "1",
          case_id: "1",
          name: "test",
          run_type: "test",
          run_status: "completed",
          severity: "low",
          category: "test",
          title: "test",
          created_at: 0,
          started_at: 0,
          completed_at: 0,
        }],
        rowCount: 1,
      };
    });
  });

  it("keeps the four first-paint read models to one active query each", async () => {
    const caller = adminDashboardRouter.createCaller({} as any);

    await Promise.all([
      caller.systemHealth(),
      caller.caseActivity(),
      caller.structuralSignals(),
      caller.workQueue(),
    ]);

    expect(pool_state.query).toHaveBeenCalledTimes(22);
    expect(pool_state.maximum_active_queries).toBeLessThanOrEqual(4);
    expect(pool_state.active_queries).toBe(0);
  });
});
