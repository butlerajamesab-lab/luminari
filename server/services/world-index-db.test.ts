import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  query_with_diagnostics: vi.fn(),
}));

import { query_with_diagnostics } from "../db";
import { __testing, pool } from "./world-index-db";

const mocked_query = vi.mocked(query_with_diagnostics);

describe("World Index PostgreSQL adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testing.reset_query_tail();
  });

  it("returns the historical tuple shape from node-postgres rows", async () => {
    mocked_query.mockResolvedValueOnce({
      rows: [{ id: 1 }],
      rowCount: 1,
    });

    const [rows] = await pool.query<{ id: number }>("select id from sample_table");

    expect(rows).toEqual([{ id: 1 }]);
    expect(mocked_query).toHaveBeenCalledWith(
      "select id from sample_table",
      [],
      expect.objectContaining({
        label: "world_index_sample_table",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 7_500,
      }),
    );
  });

  it("allows only one World Index query to occupy the shared pool at a time", async () => {
    let active_queries = 0;
    let maximum_active_queries = 0;
    let release_first_query: (() => void) | null = null;

    mocked_query.mockImplementation(async (text: string) => {
      active_queries += 1;
      maximum_active_queries = Math.max(maximum_active_queries, active_queries);

      if (text.includes("first_table")) {
        await new Promise<void>((resolve) => {
          release_first_query = resolve;
        });
      }

      active_queries -= 1;
      return { rows: [{ text }], rowCount: 1 };
    });

    const first = pool.query("select * from first_table");
    const second = pool.query("select * from second_table");

    await vi.waitFor(() => {
      expect(mocked_query).toHaveBeenCalledTimes(1);
    });

    release_first_query?.();
    await Promise.all([first, second]);

    expect(mocked_query).toHaveBeenCalledTimes(2);
    expect(maximum_active_queries).toBe(1);
  });
});
