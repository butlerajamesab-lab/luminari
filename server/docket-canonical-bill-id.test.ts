import { describe, expect, it } from "vitest";
import { canonical_docket_bill_uuid } from "./docket-canonical-bill-id";

describe("Docket bill identity is identical across archive and API sources", () => {
  it("exactly matches two source-bound bills verified from production after the 2026-11-16 pilot", () => {
    expect(canonical_docket_bill_uuid(1890234)).toBe("0e4ae74c-f189-42a8-86f2-5b06006b2269");
    expect(canonical_docket_bill_uuid(1890236)).toBe("fb06bbd2-623d-4e3c-9012-2e06f6a0c3a8");
  });

  it("is deterministic and never accepts nonpositive/fractional source IDs", () => {
    expect(canonical_docket_bill_uuid(1890233)).toBe("666483fc-a03c-40ac-b966-182e87c9992b");
    expect(canonical_docket_bill_uuid(1890233)).toBe(canonical_docket_bill_uuid(1890233));
    for (const id of [-1, 0, 1.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => canonical_docket_bill_uuid(id)).toThrow("docket_canonical_bill_uuid_invalid_source_bill_id");
    }
  });
});
