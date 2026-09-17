import { describe, expect, it } from "vitest";
import {
  legiscan_session_is_current,
  pick_preferred_legiscan_session,
} from "./docket-session";

describe("Docket session currentness", () => {
  it("treats sine die and prior sessions as non-current", () => {
    expect(legiscan_session_is_current({
      session_id: 1,
      sine_die: 1,
      year_start: 2025,
      year_end: 2025,
    })).toBe(false);
    expect(legiscan_session_is_current({
      session_id: 2,
      prior: 1,
      year_start: 2026,
      year_end: 2026,
    })).toBe(false);
  });

  it("fails closed when session flags conflict", () => {
    expect(legiscan_session_is_current({
      session_id: 3,
      prior: 0,
      sine_die: 1,
      year_start: 2026,
      year_end: 2026,
    })).toBe(null);
  });

  it("prefers an active current session over a newer completed one", () => {
    const selected = pick_preferred_legiscan_session([
      { session_id: 2025, prior: 0, sine_die: 1, year_start: 2025, year_end: 2025, session_title: "2025" },
      { session_id: 2026, prior: 0, sine_die: 0, year_start: 2026, year_end: 2026, session_title: "2026" },
    ]);

    expect(selected?.session_id).toBe(2026);
  });

  it("falls back to the newest available session when no current session can be established", () => {
    const selected = pick_preferred_legiscan_session([
      { session_id: 2024, prior: 1, year_start: 2024, year_end: 2024 },
      { session_id: 2025, prior: 1, sine_die: 1, year_start: 2025, year_end: 2025 },
    ]);

    expect(selected?.session_id).toBe(2025);
    expect(legiscan_session_is_current(selected)).toBe(false);
  });
});
