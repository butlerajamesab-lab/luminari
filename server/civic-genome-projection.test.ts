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

  it("does not persist terminal state from a topic or subsidiary action", () => {
    const bill = {
      bill_id: 4,
      number: "HB4",
      title: "Amending chapter 42.",
      last_action: "Amendment withdrawn.",
    };
    expect(infer_state_position(bill)).toBe("introduced");
    expect(classify_docket_event(bill, null).event_type).toBe("amended");
  });

  it("does not derive amendment movement from a bill title", () => {
    const bill = {
      bill_id: 8,
      number: "HB8",
      title: "An Act amending chapter 42.",
      last_action: "First reading; referred to committee.",
    };
    expect(classify_docket_event(bill, null).event_type).toBe("committee_action");
  });

  it("does not derive other movement from bill subject text", () => {
    const bill = {
      bill_id: 10,
      number: "HB10",
      title: "A bill concerning the judiciary committee and measures passed by the House.",
      last_action: "First reading.",
    };
    expect(classify_docket_event(bill, null).event_type).toBe("docket_cache_observed");
  });

  it("does not terminate a bill when only a subsidiary action is postponed", () => {
    for (const last_action of ["Amendment postponed indefinitely.", "Motion postponed indefinitely."]) {
      const bill = { bill_id: 9, number: "HB9", last_action };
      expect(infer_state_position(bill)).toBe("introduced");
      expect(classify_docket_event(bill, null).event_type).not.toBe("failed");
    }
  });

  it.each(["Bill postponed indefinitely.", "Resolution indefinitely postponed."])(
    "preserves direct whole-measure postponement evidence: %s",
    (last_action) => {
      const bill = { bill_id: 11, number: "HB11", last_action };
      expect(infer_state_position(bill)).toBe("failed");
      expect(classify_docket_event(bill, null).event_type).toBe("failed");
    },
  );

  it("preserves explicit whole-bill enactment evidence", () => {
    const bill = {
      bill_id: 5,
      number: "HB5",
      status: 4,
      last_action: "Bill enacted as Chapter 12.",
    };
    expect(infer_state_position(bill)).toBe("enacted");
    expect(classify_docket_event(bill, null).event_type).toBe("enacted");
  });

  it("aligns terminal provider statuses and governor-signed wording", () => {
    const vetoed = { bill_id: 6, number: "HB6", status: 5, last_action: "Returned to chamber." };
    const signed = { bill_id: 7, number: "HB7", status: 4, last_action: "Governor signed the bill." };
    expect(infer_state_position(vetoed)).toBe("failed");
    expect(classify_docket_event(vetoed, null).event_type).toBe("vetoed");
    expect(infer_state_position(signed)).toBe("enacted");
    expect(classify_docket_event(signed, null).event_type).toBe("enacted");
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
