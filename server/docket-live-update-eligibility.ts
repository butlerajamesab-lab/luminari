import { docket_terminal_action } from "../shared/docket-lifecycle";
import { legiscan_session_is_current } from "./docket-session";

type unknown_record = Record<string, unknown>;

const is_record = (value: unknown): value is unknown_record =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export type docket_live_update_eligibility = {
  eligible: boolean;
  reason: "eligible" | "current_session_unverified" | "session_not_current" | "bill_summary_missing" | "bill_terminal";
};

/**
 * Live LegiScan detail refresh is limited to bills in a positively identified
 * current session whose provider summary has no terminal outcome. Bulk archive
 * jobs use a separate source path and remain eligible for historical processing.
 */
export function resolve_docket_live_update_eligibility(input: {
  summary: unknown;
  session_id: number;
  sessions: unknown;
}): docket_live_update_eligibility {
  const summary = is_record(input.summary) ? input.summary : null;
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  const session = sessions.find(candidate =>
    is_record(candidate) && String(candidate.session_id ?? "") === String(input.session_id),
  );
  const currentness = legiscan_session_is_current(is_record(session) ? session : null);

  if (currentness === null) {
    return { eligible: false, reason: "current_session_unverified" };
  }
  if (!currentness) {
    return { eligible: false, reason: "session_not_current" };
  }
  if (!summary) {
    return { eligible: false, reason: "bill_summary_missing" };
  }
  if (docket_terminal_action(
    summary.status,
    summary.status_desc,
    summary.current_status,
    summary.last_action,
  )) {
    return { eligible: false, reason: "bill_terminal" };
  }

  return { eligible: true, reason: "eligible" };
}

