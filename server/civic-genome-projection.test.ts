import { describe, expect, it } from "vitest";
import {
  infer_state_position,
  should_append_projection_event,
} from "./civic-genome-projection";
import { classify_docket_event } from "./civic-genome-event-classifier";

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

  it("does not infer enactment from a nonterminal action that mentions an effective date", () => {
    const bill = {
      bill_id: 2,
      number: "HB2",
      last_action: "Committee reported amendment changing the effective date.",
    };

    expect(infer_state_position(bill)).toBe("active_in_committee");
    expect(classify_docket_event(bill, null).event_type).toBe("amended");
  });

  it("does not treat LegiScan Passed status alone as enactment evidence", () => {
    expect(infer_state_position({
      bill_id: 3,
      number: "HB3",
      status: 4,
      last_action: "Passed House.",
    })).toBe("advanced_one_chamber");
  });

  it("emits a correction when derived position changes under the same observation hash", () => {
    expect(should_append_projection_event(
      "same_hash",
      "same_hash",
      "introduced",
      "enacted",
    )).toBe(true);

    expect(should_append_projection_event(
      "same_hash",
      "same_hash",
      "enacted",
      "enacted",
    )).toBe(false);
  });
});
