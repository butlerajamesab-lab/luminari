import { describe, expect, it } from "vitest";
import { docket_lifecycle, docket_terminal_action } from "./docket-lifecycle";

describe("Docket procedure presentation", () => {
  it.each([
    "Approved by Governor 4/1/2026 - House Journal",
    "Signed by the President",
    "Became law",
    "Chaptered",
    "Failed final passage.",
    "Amendment failed; bill postponed indefinitely",
  ])("recognizes whole-measure disposition: %s", action => {
    expect(docket_terminal_action(4, action)).toBe(true);
    expect(docket_lifecycle({ status: 4, last_action: action }, true)).toBe("completed");
  });
  it.each([
    "Amendment signed by governor",
    "Failed amendment to bill",
    "Motion postponed indefinitely",
    "Amendment failed final passage",
    "Passed Senate",
  ])("does not terminate a parent measure from: %s", action => {
    expect(docket_terminal_action(4, action)).toBe(false);
  });
  it("does not turn stale or invalid events into approaching action", () => {
    const now = Date.parse("2026-09-14T12:00:00Z");
    for (const next_event_date of ["invalid", "2026-08-01T12:00:00Z"]) {
      expect(docket_lifecycle({ radar: { next_event_date } }, true, now)).toBe("live");
    }
    expect(docket_lifecycle({ radar: { next_event_date: "2026-09-15T12:00:00Z" } }, true, now)).toBe("action_approaching");
    expect(docket_lifecycle({ radar: { next_event_date: "2026-09-15T12:00:00Z" } }, false, now)).toBe("freshness_unknown");
  });
  it("does not erase completed procedure when the source becomes stale", () => {
    expect(docket_lifecycle({ status: 5 }, false)).toBe("completed");
  });
});
