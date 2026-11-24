import { describe, expect, it } from "vitest";
import { bounded_derived_work_concurrency } from "./docket-bill-detail-derived-work-worker";

describe("Docket bill detail derived work concurrency", () => {
  it("defaults to one lane and bounds configured lanes to 1..16", () => {
    expect(bounded_derived_work_concurrency({})).toBe(1);
    expect(bounded_derived_work_concurrency({ DOCKET_BILL_DETAIL_DERIVED_CONCURRENCY: "4" })).toBe(4);
    expect(bounded_derived_work_concurrency({ DOCKET_BILL_DETAIL_DERIVED_CONCURRENCY: "64" })).toBe(16);
    expect(bounded_derived_work_concurrency({ DOCKET_BILL_DETAIL_DERIVED_CONCURRENCY: "0" })).toBe(1);
    expect(bounded_derived_work_concurrency({ DOCKET_BILL_DETAIL_DERIVED_CONCURRENCY: "2.5" })).toBe(1);
    expect(bounded_derived_work_concurrency({ DOCKET_BILL_DETAIL_DERIVED_CONCURRENCY: "abc" })).toBe(1);
  });
});
