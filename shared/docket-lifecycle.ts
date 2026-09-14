/** Presentation of provider procedure only; never an extraction or legal-effect gate. */
export type docket_lifecycle_state = "live" | "action_approaching" | "completed" | "stalled" | "freshness_unknown";

export function docket_terminal_action(status: unknown, action: unknown): boolean {
  if ([5, 6].includes(Number(status))) return true;
  const evidence = typeof action === "string" ? action.toLowerCase() : "";
  // Match independently scoped clauses. An amendment/motion disposition is not
  // the disposition of its parent bill; a later explicit bill clause still is.
  return evidence.split(/[;.\n]/).some(clause => {
    const whole_measure = /\b(?:bill|measure|resolution)\s+(?:has\s+)?(?:enacted|failed(?:\s+(?:final passage|to pass))?|withdrawn|vetoed|died|(?:been\s+)?postponed\s+indefinitely|indefinitely\s+postponed)\b/.test(clause);
    if (whole_measure) return true;
    if (/\b(?:amendments?|motions?)\b/.test(clause)) return false;
    return /^\s*(?:chapter(?:ed)?|effective date|enacted|withdrawn|dead|vetoed|postponed indefinitely)\b/.test(clause)
      || /^\s*failed(?:\s+(?:final passage|to pass))?\s*$/.test(clause)
      || /\b(?:signed|approved) by (?:the )?(?:governor|president)\b|\b(?:governor|president) signed\b|\bbecame law\b/.test(clause);
  });
}

export function docket_lifecycle(bill: { status?: unknown; last_action?: unknown; last_action_date?: string | null; status_date?: string | null; radar?: { next_event_date?: string | null } }, cache_fresh: boolean, now = Date.now()): docket_lifecycle_state {
  if (docket_terminal_action(bill.status, bill.last_action)) return "completed";
  if (!cache_fresh) return "freshness_unknown";
  const next = Date.parse(bill.radar?.next_event_date ?? "");
  if (Number.isFinite(next) && next >= now) return "action_approaching";
  const last = Date.parse(bill.last_action_date || bill.status_date || "");
  if (Number.isFinite(last) && now - last > 90 * 24 * 60 * 60 * 1000) return "stalled";
  return "live";
}
