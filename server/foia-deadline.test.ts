import { describe, expect, it } from "vitest";
import {
  computeResponseDueAt,
  deadlineUnitLabel,
  normalizeDeadlineUnit,
} from "./foia-deadline";

const DAY_MS = 24 * 60 * 60 * 1000;
// A known Monday: 2026-08-24T12:00:00Z (UTC day-of-week = 1)
const MONDAY = Date.UTC(2026, 7, 24, 12, 0, 0, 0);

describe("foia-deadline", () => {
  it("normalizes units, defaulting unknown values to business days", () => {
    expect(normalizeDeadlineUnit("calendar_days")).toBe("calendar_days");
    expect(normalizeDeadlineUnit("business_days")).toBe("business_days");
    expect(normalizeDeadlineUnit(null)).toBe("business_days");
    expect(normalizeDeadlineUnit("garbage")).toBe("business_days");
    expect(deadlineUnitLabel("calendar_days")).toBe("calendar days");
    expect(deadlineUnitLabel(null)).toBe("business days");
  });

  it("adds calendar days straight across weekends", () => {
    expect(computeResponseDueAt(MONDAY, 5, "calendar_days")).toBe(
      MONDAY + 5 * DAY_MS,
    );
  });

  it("skips weekends for business days", () => {
    // Monday + 5 business days = following Monday
    const due = computeResponseDueAt(MONDAY, 5, "business_days");
    expect(due).toBe(MONDAY + 7 * DAY_MS);
    expect(new Date(due!).getUTCDay()).toBe(1);
  });

  it("never counts the submission day itself", () => {
    // Friday + 1 business day = Monday
    const friday = Date.UTC(2026, 7, 28, 9, 0, 0, 0);
    const due = computeResponseDueAt(friday, 1, "business_days");
    expect(new Date(due!).getUTCDay()).toBe(1);
  });

  it("returns null when the statute has no usable deadline", () => {
    expect(computeResponseDueAt(MONDAY, null, "business_days")).toBeNull();
    expect(computeResponseDueAt(MONDAY, 0, "calendar_days")).toBeNull();
    expect(computeResponseDueAt(MONDAY, -3, "calendar_days")).toBeNull();
  });
});
