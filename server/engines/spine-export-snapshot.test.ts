import { describe, expect, it, vi } from "vitest";

const { connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}));

vi.mock("../db", () => ({
  getPool: () => ({ connect: connectMock }),
}));

import { with_spine_export_snapshot } from "./spine-export-snapshot";

describe("Sovereign Spine bundle-wide snapshot", () => {
  it("runs all work inside one repeatable-read read-only transaction", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });

    const result = await with_spine_export_snapshot(async (client) => {
      await client.query("select 1");
      await client.query("select 2");
      return "complete";
    });

    expect(result).toBe("complete");
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls.map((call) => call[0])).toEqual([
      "begin transaction isolation level repeatable read read only",
      "select 1",
      "select 2",
      "commit",
    ]);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases the snapshot client on failure", async () => {
    queryMock.mockReset();
    releaseMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });

    await expect(
      with_spine_export_snapshot(async () => {
        throw new Error("snapshot failed");
      }),
    ).rejects.toThrow("snapshot failed");

    expect(queryMock.mock.calls.map((call) => call[0])).toEqual([
      "begin transaction isolation level repeatable read read only",
      "rollback",
    ]);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
