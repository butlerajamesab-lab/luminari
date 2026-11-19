import { describe, expect, it } from "vitest";
import { resolve_docket_live_update_eligibility } from "./docket-live-update-eligibility";

const active_session = [{ session_id: 2026, prior: 0, sine_die: 0 }];
const active_bill = { status: 1, last_action: "Referred to committee" };

describe("Docket live update eligibility", () => {
  it("allows a nonterminal bill only in a positively identified current session", () => {
    expect(resolve_docket_live_update_eligibility({
      summary: active_bill,
      session_id: 2026,
      sessions: active_session,
    })).toEqual({ eligible: true, reason: "eligible" });
  });

  it.each(["prior", "sine_die"] as const)("rejects a session marked %s", flag => {
    const sessions = [{ session_id: 2026, [flag]: 1 }];
    expect(resolve_docket_live_update_eligibility({
      summary: active_bill,
      session_id: 2026,
      sessions,
    })).toEqual({ eligible: false, reason: "session_not_current" });
  });

  it("fails closed when current-session evidence is missing or inconclusive", () => {
    expect(resolve_docket_live_update_eligibility({
      summary: active_bill,
      session_id: 2026,
      sessions: [],
    })).toEqual({ eligible: false, reason: "current_session_unverified" });
  });

  it.each([
    { status: 5 },
    { status: 6 },
    { status: 1, last_action: "Bill signed by the governor" },
    { status: 1, last_action: "Bill failed final passage" },
  ])("rejects a terminal provider outcome: %o", summary => {
    expect(resolve_docket_live_update_eligibility({
      summary,
      session_id: 2026,
      sessions: active_session,
    })).toEqual({ eligible: false, reason: "bill_terminal" });
  });

  it("fails closed when a live activation lacks its provider summary", () => {
    expect(resolve_docket_live_update_eligibility({
      summary: null,
      session_id: 2026,
      sessions: active_session,
    })).toEqual({ eligible: false, reason: "bill_summary_missing" });
  });
});
