import { describe, expect, it, vi } from "vitest";

// The page module pulls the live trpc/supabase chain at import time; the
// address formatter under test is pure, so cut the chain the same way the
// other page tests do.
vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/components/CommitToCase", () => ({ CommitToCase: () => null }));

import { format_address } from "./ResourceRecord";

describe("format_address", () => {
  it("appends the locality when the street lines do not carry it", () => {
    expect(
      format_address({
        address_line1: "40 N Central Ave Ste 600",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85004",
      }),
    ).toBe("40 N Central Ave Ste 600, Phoenix AZ 85004");
  });

  it("never prints city, state and ZIP twice when the street line already holds the whole address", () => {
    // The IHS Phoenix Area Office record, as screenshotted by the owner
    // 2026-11-22: "40 N Central Ave Ste 600, Phoenix, AZ 85004, Phoenix AZ 85004".
    expect(
      format_address({
        address_line1: "40 N Central Ave Ste 600, Phoenix, AZ 85004",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85004",
      }),
    ).toBe("40 N Central Ave Ste 600, Phoenix, AZ 85004");
  });

  it("does not mistake a street-name substring for the locality", () => {
    // "IN" appears inside "Main" as a substring, but it is not a token of
    // the street line — the state must still be appended.
    expect(
      format_address({
        address_line1: "123 Main St",
        state: "IN",
      }),
    ).toBe("123 Main St, IN");
  });

  it("falls back to the county when no locality is known", () => {
    expect(
      format_address({
        address_line1: "1 Rural Route",
        county: "Maricopa County",
      }),
    ).toBe("1 Rural Route, Maricopa County");
  });

  it("returns null without a location", () => {
    expect(format_address(undefined)).toBeNull();
  });
});
