import { describe, expect, it } from "vitest";
import {
  docket_live_feed_eligible,
  docket_lifecycle,
  docket_terminal_action,
  resolve_docket_lifecycle,
  resolve_docket_source_freshness,
} from "./docket-lifecycle";

describe("Docket procedure presentation", () => {
  it.each([
    "Approved by Governor 4/1/2026 - House Journal",
    "Signed by the President",
    "Became law",
    "Chaptered",
    "Failed final passage.",
    "Amendment failed; bill postponed indefinitely",
    "Bill enacted as amended",
  ])("recognizes whole-measure terminal disposition: %s", action => {
    expect(docket_terminal_action(4, action)).toBe(true);
  });

  it.each([
    "Amendment signed by governor",
    "Failed amendment to bill",
    "Motion postponed indefinitely",
    "Amendment failed final passage",
    "Passed Senate",
  ])("does not terminate a parent measure from subsidiary text: %s", action => {
    expect(docket_terminal_action(4, action)).toBe(false);
  });

  it("keeps passed legislation completed even when the action date is old", () => {
    const resolution = resolve_docket_lifecycle({
      status: 4,
      last_action: "Approved by Governor",
      last_action_date: "2025-03-01",
      session: { is_current: true },
      freshness: { is_fresh: false },
    }, Date.parse("2026-09-17T00:00:00Z"));

    expect(resolution.procedural_state).toBe("completed");
    expect(resolution.is_terminal).toBe(true);
    expect(resolution.live_feed_eligible).toBe(false);
    expect(resolution.freshness_state).toBe("stale");
  });

  it("separates future effective dates from terminal procedure", () => {
    const resolution = resolve_docket_lifecycle({
      status: 4,
      status_text: "Signed by the Governor",
      effective_date: "2026-09-30",
      last_action_date: "2026-09-01",
      session: { is_current: true },
    }, Date.parse("2026-09-17T00:00:00Z"));

    expect(resolution.procedural_state).toBe("completed");
    expect(resolution.effective_state).toBe("effective_future");
    expect(docket_lifecycle({
      status: 4,
      status_text: "Signed by the Governor",
      effective_date: "2026-09-30",
      session: { is_current: true },
    }, Date.parse("2026-09-17T00:00:00Z"))).toBe("completed");
  });

  it("treats a same-day effective date as effective now", () => {
    const resolution = resolve_docket_lifecycle({
      status: 4,
      status_text: "Signed by the Governor",
      effective_date: "2026-09-17",
      session: { is_current: true },
    }, Date.parse("2026-09-17T20:00:00Z"));

    expect(resolution.procedural_state).toBe("completed");
    expect(resolution.effective_state).toBe("effective_now");
  });

  it("does not let freshness overwrite terminal procedure", () => {
    const resolution = resolve_docket_lifecycle({
      status: 5,
      last_action: "Signed by the President",
      freshness: { state: "refresh_paused", last_observed_at: "2026-01-01T00:00:00Z" },
      session: { is_current: false },
    });

    expect(resolution.procedural_state).toBe("completed");
    expect(resolution.freshness_state).toBe("refresh_paused");
  });

  it("keeps current active bills eligible for the live feed", () => {
    const resolution = resolve_docket_lifecycle({
      status: 1,
      last_action: "Referred to committee",
      last_action_date: "2026-09-10",
      radar: { events_14d: 3, velocity_score: 4.2, next_event_date: "2026-09-20" },
      session: { is_current: true },
      freshness: { is_fresh: true },
    }, Date.parse("2026-09-17T00:00:00Z"));

    expect(resolution.procedural_state).toBe("action_approaching");
    expect(resolution.live_feed_eligible).toBe(true);
    expect(docket_live_feed_eligible({
      status: 1,
      last_action_date: "2026-09-10",
      radar: { events_14d: 3, next_event_date: "2026-09-20" },
      session: { is_current: true },
    }, Date.parse("2026-09-17T00:00:00Z"))).toBe(true);
  });

  it("excludes old completed-session records from the live feed", () => {
    const resolution = resolve_docket_lifecycle({
      status: 4,
      last_action: "Became law",
      effective_date: "2026-09-30",
      last_action_date: "2025-05-12",
      session: { is_current: false },
      freshness: { is_fresh: true },
    }, Date.parse("2026-09-17T00:00:00Z"));

    expect(resolution.procedural_state).toBe("completed");
    expect(resolution.live_feed_eligible).toBe(false);
  });

  it("fails closed when current session evidence is missing", () => {
    expect(() => resolve_docket_lifecycle({
      status: 1,
      last_action: null,
      last_action_date: null,
      session: { is_current: null },
      freshness: {},
    })).not.toThrow();

    expect(resolve_docket_lifecycle({
      status: 1,
      last_action: null,
      last_action_date: null,
      session: { is_current: null },
      freshness: {},
    }).procedural_state).toBe("unknown");
    expect(resolve_docket_source_freshness({ freshness: {} })).toBe("unknown");
  });
});
