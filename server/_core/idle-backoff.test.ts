import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  create_idle_backoff,
  idle_delay_ms,
  reset_idle_backoff_registry_for_tests,
  wake_idle_worker,
} from "./idle-backoff";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("idle backoff", () => {
  beforeEach(() => {
    reset_idle_backoff_registry_for_tests();
    delete process.env.WORKER_IDLE_MAX_MS;
    delete process.env.WORKER_IDLE_ACTIVITY_WAKE_MS;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("runs every tick while work is found", () => {
    const backoff = create_idle_backoff("busy", 2_000);
    for (let tick = 0; tick < 5; tick += 1) {
      const now = 1_000_000 + tick * 2_000;
      expect(backoff.should_run(now)).toBe(true);
      backoff.record(true, now);
    }
  });

  it("doubles the wait on each empty cycle and stops at one day", () => {
    expect(idle_delay_ms(30_000, 1)).toBe(60_000);
    expect(idle_delay_ms(30_000, 2)).toBe(120_000);
    expect(idle_delay_ms(30_000, 11)).toBe(30_000 * 2 ** 11);
    expect(idle_delay_ms(30_000, 12)).toBe(DAY_MS);
    expect(idle_delay_ms(30_000, 40)).toBe(DAY_MS);
  });

  it("skips ticks until the wait has passed, then checks once", () => {
    const backoff = create_idle_backoff("empty", 30_000);
    const start = 1_000_000;
    backoff.record(false, start);
    expect(backoff.should_run(start + 30_000)).toBe(false);
    expect(backoff.should_run(start + 60_000)).toBe(true);
  });

  it("reaches the daily check after enough empty cycles", () => {
    const backoff = create_idle_backoff("quiet", 30_000);
    let now = 1_000_000;
    let checks = 0;
    // Simulate one week of 30-second ticks against an empty queue.
    for (let elapsed = 0; elapsed < 7 * DAY_MS; elapsed += 30_000) {
      now = 1_000_000 + elapsed;
      if (!backoff.should_run(now)) continue;
      checks += 1;
      backoff.record(false, now);
    }
    // Before: 20,160 checks a week. After: ramp-up plus about one a day.
    expect(checks).toBeLessThan(20);
    expect(backoff.ms_until_due(now)).toBeLessThanOrEqual(DAY_MS);
  });

  it("returns to full speed as soon as work appears", () => {
    const backoff = create_idle_backoff("returning", 2_000);
    backoff.record(false, 0);
    backoff.record(false, 4_000);
    backoff.record(true, 12_000);
    expect(backoff.should_run(12_001)).toBe(true);
    expect(backoff.snapshot().idle_streak).toBe(0);
  });

  it("honours WORKER_IDLE_MAX_MS", () => {
    process.env.WORKER_IDLE_MAX_MS = String(60 * 60 * 1000);
    expect(idle_delay_ms(30_000, 30)).toBe(60 * 60 * 1000);
  });

  it("wakes a named idle worker", () => {
    const backoff = create_idle_backoff("downstream", 30_000);
    backoff.record(false, 0);
    backoff.record(false, 60_000);
    expect(backoff.should_run(60_001)).toBe(false);
    wake_idle_worker("downstream");
    expect(backoff.should_run(60_001)).toBe(true);
  });

  it("a busy worker nudges idle workers at most once per activity window", () => {
    process.env.WORKER_IDLE_ACTIVITY_WAKE_MS = String(15 * 60 * 1000);
    const idle = create_idle_backoff("idle", 30_000);
    const busy = create_idle_backoff("busy", 2_000);
    for (let i = 0; i < 12; i += 1) idle.record(false, 0);
    expect(idle.should_run(1)).toBe(false);

    busy.record(true, 16 * 60 * 1000);
    expect(idle.should_run(16 * 60 * 1000)).toBe(true);
    // Still empty: it goes straight back to its long wait.
    idle.record(false, 16 * 60 * 1000);
    expect(idle.should_run(16 * 60 * 1000 + 1)).toBe(false);

    // Work inside the same window does not nudge at once, but it is not
    // dropped either: the idle worker is brought forward to the window's end.
    busy.record(true, 20 * 60 * 1000);
    expect(idle.should_run(20 * 60 * 1000)).toBe(false);
    expect(idle.should_run(31 * 60 * 1000 - 1)).toBe(false);
    expect(idle.should_run(31 * 60 * 1000)).toBe(true);
  });

  it("activity nudges can be turned off", () => {
    process.env.WORKER_IDLE_ACTIVITY_WAKE_MS = "0";
    const idle = create_idle_backoff("idle", 30_000);
    const busy = create_idle_backoff("busy", 2_000);
    idle.record(false, 0);
    busy.record(true, DAY_MS / 2);
    expect(idle.should_run(30_000)).toBe(false);
  });
});

describe("idle backoff off switch", () => {
  afterEach(() => { delete process.env.WORKER_IDLE_BACKOFF_ENABLED; });

  it("WORKER_IDLE_BACKOFF_ENABLED=false restores fixed-rhythm polling", () => {
    reset_idle_backoff_registry_for_tests();
    const backoff = create_idle_backoff("switch", 30_000);
    for (let i = 0; i < 12; i += 1) backoff.record(false, 0);
    expect(backoff.should_run(1)).toBe(false);
    process.env.WORKER_IDLE_BACKOFF_ENABLED = "false";
    expect(backoff.should_run(1)).toBe(true);
  });
});

describe("idle backoff pipeline handoff", () => {
  afterEach(() => { delete process.env.WORKER_IDLE_ACTIVITY_WAKE_MS; });

  it("a downstream stage that checked too early is looked at again within one window", () => {
    reset_idle_backoff_registry_for_tests();
    process.env.WORKER_IDLE_ACTIVITY_WAKE_MS = String(15 * 60 * 1000);
    const window = 15 * 60 * 1000;
    const upstream = create_idle_backoff("upstream", 2_000);
    const downstream = create_idle_backoff("downstream_stage", 30_000);
    for (let i = 0; i < 12; i += 1) downstream.record(false, 0);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    // First nudge: downstream looks before upstream has produced anything.
    upstream.record(true, window);
    expect(downstream.should_run(window)).toBe(true);
    downstream.record(false, window);
    // Upstream then produces work; downstream must not sleep for a day.
    upstream.record(true, window + 60_000);
    expect(downstream.should_run(2 * window)).toBe(true);
    // Activity stops entirely; the deferred look still happened in-window.
    expect(downstream.ms_until_due(window + 60_000)).toBeLessThanOrEqual(window);
  });
});
