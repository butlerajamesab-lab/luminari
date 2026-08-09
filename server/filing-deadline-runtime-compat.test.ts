import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  date_only_to_utc_day,
  days_between_date_only,
  map_filing_deadline_source_text,
  utc_today_date_only,
} from "./filing-deadline-runtime-compat";

describe("filing deadline date-only contract", () => {
  it("wires the production route to the source-bound reader without an agency-name map", () => {
    const router_source = readFileSync(
      fileURLToPath(new URL("./routers/enforcement-intelligence.ts", import.meta.url)),
      "utf8",
    );
    const route_source = router_source.slice(
      router_source.indexOf("calculateDeadline:"),
      router_source.indexOf("suggestResourcesForGap:"),
    );
    expect(route_source).toContain("list_filing_deadline_records");
    expect(route_source).not.toContain("deadlineMap");
    expect(route_source).not.toMatch(/primaryDays:\s*(30|180|365)/);
  });

  it("renders lookup failures distinctly and keeps launcher copy non-operative", () => {
    const calculator_source = readFileSync(
      fileURLToPath(new URL("../client/src/pages/DeadlineCalculator.tsx", import.meta.url)),
      "utf8",
    );
    const shop_source = readFileSync(
      fileURLToPath(new URL("../client/src/pages/ShopOffice.tsx", import.meta.url)),
      "utf8",
    );
    expect(calculator_source).toContain("Deadline catalog unavailable");
    expect(calculator_source).toContain("No conclusion can be drawn from this failed lookup");
    expect(shop_source).toContain("Missing operative values stay unavailable");
    expect(shop_source).not.toContain("Never miss a critical date");
  });

  it("uses calendar-day arithmetic across daylight-saving boundaries", () => {
    expect(days_between_date_only("2026-03-07", "2026-03-09")).toBe(2);
    expect(days_between_date_only("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("validates leap days and rejects calendar rollover", () => {
    expect(date_only_to_utc_day("2028-02-29")).toBeTypeOf("number");
    expect(() => date_only_to_utc_day("2026-02-29")).toThrow(/Invalid calendar date/);
  });

  it("derives the default as-of date in UTC", () => {
    expect(utc_today_date_only(new Date("2026-08-10T00:30:00.000Z"))).toBe("2026-08-10");
  });

  it("preserves source text without synthesizing a day count", () => {
    const record = map_filing_deadline_source_text({
      id: 7,
      agency: "Example Agency",
      agency_short: "EA",
      form_name: "Complaint Form",
      filing_deadline: "See controlling authority and current agency instructions.",
      link: "https://example.gov/form",
    }, "2026-08-01", "2026-08-09");

    expect(record).toMatchObject({
      calculationState: "source_text_only",
      daysSinceIncident: 8,
      primaryDeadlineDays: null,
      primaryDeadlineDate: null,
      sourceUrl: "https://example.gov/form",
    });
  });

  it("refuses an agency form with no source-bound deadline text", () => {
    expect(() => map_filing_deadline_source_text({
      id: 7,
      agency: "Example Agency",
      agency_short: "EA",
      form_name: "Complaint Form",
      filing_deadline: null,
      link: "https://example.gov/form",
    }, "2026-08-01", "2026-08-09")).toThrow(/no source-bound filing deadline text/);
  });
});
