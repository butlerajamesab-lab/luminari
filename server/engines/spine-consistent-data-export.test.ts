import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}));

vi.mock("../db", () => ({
  connect_with_pool_timeout: connectMock,
}));

import { export_spine_table_data_consistent } from "./spine-consistent-data-export";

beforeEach(() => {
  connectMock.mockReset();
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
});

describe("Sovereign Spine consistent data export", () => {
  it("derives truncation and exported rows from one limit-plus-one query", async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const result = await export_spine_table_data_consistent("engine_registry", 2);

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0].text).toContain(
      'select * from public."engine_registry" limit 3',
    );
    expect(result).toEqual({
      tableName: "engine_registry",
      rowCount: 2,
      truncated: true,
      rows: [{ id: 1 }, { id: 2 }],
    });
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("preserves PostgreSQL temporal text without timezone conversion", async () => {
    queryMock.mockImplementation(async (query: any) => {
      const timestampWithoutZone = query.types.getTypeParser(1114, "text");
      const date = query.types.getTypeParser(1082, "text");
      return {
        rows: [
          {
            observed_at: timestampWithoutZone("2026-07-27 16:00:00"),
            snapshot_date: date("2026-07-27"),
          },
        ],
      };
    });

    const result = await export_spine_table_data_consistent("strategy_registry", 2);

    expect(result.rows).toEqual([
      {
        observed_at: "2026-07-27 16:00:00",
        snapshot_date: "2026-07-27",
      },
    ]);
  });

  it("does not mark a complete result as truncated", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await export_spine_table_data_consistent("engine_registry", 2);

    expect(result.truncated).toBe(false);
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ id: 1 }]);
  });

  it("uses a supplied snapshot client without releasing it", async () => {
    const client = { query: queryMock, release: releaseMock } as any;
    queryMock.mockResolvedValue({ rows: [{ id: 1 }] });

    await export_spine_table_data_consistent("engine_registry", 2, client);

    expect(connectMock).not.toHaveBeenCalled();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it("rejects qualified or injected table identifiers", async () => {
    await expect(
      export_spine_table_data_consistent("public.engine_registry", 2),
    ).rejects.toThrow("unqualified PostgreSQL identifier");
    expect(connectMock).not.toHaveBeenCalled();
  });
});
