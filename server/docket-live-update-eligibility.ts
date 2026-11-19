import { legiscan_session_is_current } from "./docket-session";

type unknown_record = Record<string, unknown>;

const is_record = (value: unknown): value is unknown_record =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const whole_bill_terminal_patterns = [
  /^\s*(?:chapter(?:ed)?|enacted|withdrawn|dead|vetoed|expired|became law|postponed indefinitely|indefinitely postponed)\b/i,
  /^\s*failed(?:\s+(?:final passage|to pass))?\s*[.;]?\s*$/i,
  /\b(?:signed|approved) by (?:the )?(?:governor|president)\b|\b(?:governor|president) signed\b/i,
  /\b(?:bill|measure|resolution)\s+(?:has\s+)?(?:enacted|failed(?:\s+(?:final passage|to pass))?|withdrawn|vetoed|expired|died|dead|(?:been\s+)?postponed\s+indefinitely|indefinitely\s+postponed)(?:\s*[.;]|$)/i,
] as const;

const summary_is_whole_bill_terminal = (summary: unknown_record): boolean => {
  if ([5, 6].includes(Number(summary.status))) return true;
  return [summary.status_desc, summary.current_status, summary.last_action]
    .flatMap(value => typeof value === "string" ? value.split(/[;\n]/) : [])
    .some(clause => whole_bill_terminal_patterns.some(pattern => pattern.test(clause.trim())));
};

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
  if (summary_is_whole_bill_terminal(summary)) {
    return { eligible: false, reason: "bill_terminal" };
  }

  return { eligible: true, reason: "eligible" };
}

