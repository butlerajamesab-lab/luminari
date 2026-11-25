import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ query_with_diagnostics: vi.fn() }));

import { query_with_diagnostics } from "../db";
import { create_idle_backoff, reset_idle_backoff_registry_for_tests } from "./idle-backoff";
import { changed_tables, reset_wake_pulse_for_tests, run_wake_pulse_once } from "./idle-wake-pulse";

const DAY_MS = 24 * 60 * 60 * 1000;

function counters(values: Record<string, number>) {
  return {
    rows: Object.entries(values).map(([table_name, writes]) => ({ table_name, writes: String(writes) })),
  } as never;
}

describe("wake pulse", () => {
  beforeEach(() => {
    reset_idle_backoff_registry_for_tests();
    reset_wake_pulse_for_tests();
    vi.mocked(query_with_diagnostics).mockReset();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("the first reading is a baseline, not a change", () => {
    const seen = new Map<string, string>();
    expect(changed_tables(seen, [{ table_name: "public.a", writes: "5" }])).toEqual([]);
    expect(changed_tables(seen, [{ table_name: "public.a", writes: "5" }])).toEqual([]);
    expect(changed_tables(seen, [{ table_name: "public.a", writes: "6" }])).toEqual(["public.a"]);
  });

  it("a write to a watched table wakes only the workers watching it, for one look", async () => {
    const derived = create_idle_backoff("derived", 2_000, { watch_tables: ["public.derived_work"] });
    const capture = create_idle_backoff("capture", 20_000, { watch_tables: ["public.nations"] });
    for (let i = 0; i < 20; i += 1) {
      derived.record(false);
      capture.record(false);
    }
    expect(derived.ms_until_due()).toBeGreaterThan(DAY_MS - 1_000);

    vi.mocked(query_with_diagnostics).mockResolvedValueOnce(counters({ "public.derived_work": 10, "public.nations": 605 }));
    expect(await run_wake_pulse_once()).toEqual([]);

    // The web service writes a bill cache row; the trigger enqueues derived work.
    vi.mocked(query_with_diagnostics).mockResolvedValueOnce(counters({ "public.derived_work": 11, "public.nations": 605 }));
    expect(await run_wake_pulse_once()).toEqual(["derived"]);
    expect(derived.should_run()).toBe(true);
    expect(capture.should_run()).toBe(false);

    // The look finds the row's work already done elsewhere: straight back to the long wait.
    derived.record(false);
    expect(derived.ms_until_due()).toBeGreaterThan(DAY_MS - 1_000);
  });

  it("reads only the tables workers declared", async () => {
    create_idle_backoff("one", 1_000, { watch_tables: ["public.b", "public.a"] });
    create_idle_backoff("two", 1_000, { watch_tables: ["public.a"] });
    vi.mocked(query_with_diagnostics).mockResolvedValueOnce(counters({}));
    await run_wake_pulse_once();
    expect(vi.mocked(query_with_diagnostics).mock.calls[0][1]).toEqual([["public.a", "public.b"]]);
  });

  it("does not query when no worker watches anything", async () => {
    create_idle_backoff("plain", 1_000);
    expect(await run_wake_pulse_once()).toEqual([]);
    expect(query_with_diagnostics).not.toHaveBeenCalled();
  });
});
