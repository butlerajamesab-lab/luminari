import { describe, expect, it } from "vitest";
import { infer_state_position } from "./civic-genome-projection";

describe("Civic Genome Docket lifecycle projection", () => {
  it("treats an explicit effective-date action as enacted", () => {
    expect(infer_state_position({
      bill_id: 2_093_644,
      number: "HB2681",
      status: 4,
      title: "Concerning cannabis license fees.",
      last_action: "Effective date 6/11/2026.",
    })).toBe("enacted");
  });

  it("does not infer enactment from a bill topic that merely mentions effective dates", () => {
    expect(infer_state_position({
      bill_id: 1,
      number: "HB1",
      title: "Concerning effective dates for agency rules.",
      last_action: "Referred to committee.",
    })).toBe("active_in_committee");
  });
});
