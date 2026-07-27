import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./world-index", () => ({
  getWorldIndex: vi.fn(),
}));

import { getWorldIndex } from "./world-index";
import { __testing, get_cached_world_index } from "./world-index-cache";

const mocked_get_world_index = vi.mocked(getWorldIndex);

const sample_index = {
  nodes: [
    {
      id: "jurisdiction_WA",
      type: "jurisdiction" as const,
      jurisdiction: "WA",
      domain: "general",
      source_table: "test",
      source_id: "WA",
      metadata: {},
    },
  ],
  edges: [],
};

describe("World Index single-flight cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testing.reset();
  });

  it("shares one cold build across concurrent callers", async () => {
    let resolve_build: ((value: typeof sample_index) => void) | null = null;
    mocked_get_world_index.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolve_build = resolve;
        }),
    );

    const first = get_cached_world_index();
    const second = get_cached_world_index();
    const third = get_cached_world_index();

    expect(mocked_get_world_index).toHaveBeenCalledTimes(1);

    resolve_build?.(sample_index);
    const results = await Promise.all([first, second, third]);

    expect(results).toEqual([sample_index, sample_index, sample_index]);
    expect(mocked_get_world_index).toHaveBeenCalledTimes(1);
  });

  it("returns a fresh cached projection without rebuilding", async () => {
    mocked_get_world_index.mockResolvedValue(sample_index);

    await expect(get_cached_world_index()).resolves.toEqual(sample_index);
    await expect(get_cached_world_index()).resolves.toEqual(sample_index);

    expect(mocked_get_world_index).toHaveBeenCalledTimes(1);
    expect(__testing.get_state()).toMatchObject({
      has_cached_entry: true,
      has_in_flight_build: false,
    });
  });
});
