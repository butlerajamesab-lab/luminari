/**
 * Deterministic FOIA response-deadline math.
 *
 * The statutory response clock starts when a request is SUBMITTED, never when
 * the draft is generated. Drafts can sit held indefinitely; anchoring the due
 * date to draft creation skews every deadline the platform reports.
 *
 * Unit handling is explicit: foia_statutes.response_days_unit distinguishes
 * 'business_days' from 'calendar_days'. Unknown/null units are treated as
 * business days (the most common statutory convention) and labelled as such.
 */

export type ResponseDeadlineUnit = "business_days" | "calendar_days";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalize the raw statute unit to the two supported values. */
export function normalizeDeadlineUnit(
  unit: string | null | undefined,
): ResponseDeadlineUnit {
  return unit === "calendar_days" ? "calendar_days" : "business_days";
}

/** Human-readable label for letter templates ("5 business days"). */
export function deadlineUnitLabel(unit: string | null | undefined): string {
  return normalizeDeadlineUnit(unit) === "calendar_days"
    ? "calendar days"
    : "business days";
}

/** Add calendar days. */
function addCalendarDays(startMs: number, days: number): number {
  return startMs + days * DAY_MS;
}

/**
 * Add business days, skipping Saturdays and Sundays.
 * Deterministic: pure UTC date arithmetic, no locale or timezone input.
 */
function addBusinessDays(startMs: number, days: number): number {
  const start = new Date(startMs);
  let cursor = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  );
  let remaining = days;
  while (remaining > 0) {
    cursor += DAY_MS;
    const dow = new Date(cursor).getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return cursor;
}

/**
 * Compute the response-due timestamp from a submission time, a statutory day
 * count, and the statute's unit. Returns null when the statute carries no
 * usable deadline (letter then asks for a response without citing a number).
 */
export function computeResponseDueAt(
  startMs: number,
  days: number | null,
  unit: string | null | undefined,
): number | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null;
  return normalizeDeadlineUnit(unit) === "calendar_days"
    ? addCalendarDays(startMs, days)
    : addBusinessDays(startMs, days);
}
