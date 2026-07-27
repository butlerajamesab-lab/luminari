import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("../db", () => ({
  query_with_diagnostics: queryMock,
}));

import { export_spine_table_data_consistent } from "./spine-consistent-data-export";

beforeEach(() => {
  queryMock.mockReset();
});

describe("Sovereign Spine consistent data export", () => {
  it("derives truncation and exported rows from one limit-plus-one query", async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const result = await export_spine_table_data_consistent("engine_registry", 2);

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toContain('select * from public."engine_registry" limit 3');
    expect(result).toEqual({
      tableName: "engine_registry",
      rowCount: 2,
      truncated: true,
      rows: [{ id: 1 }, { id: 2 }],
    });
  });

  it("does not mark a complete result as truncated", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await export_spine_table_data_consistent("engine_registry", 2);

    expect(result.truncated).toBe(false);
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ id: 1 }]);
  });

  it("rejects qualified or injected table identifiers", async () => {
    await expect(
      export_spine_table_data_consistent("public.engine_registry", 2),
    ).rejects.toThrow("unqualified PostgreSQL identifier");
    expect(queryMock).not.toHaveBeenCalled();
  });
});
