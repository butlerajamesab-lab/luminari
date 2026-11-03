import { describe, expect, it } from "vitest";
import { parse_docket_bulk_json_member as parse } from "./docket-bulk-json-member";

const session = "2159";
const state = "MT";
const root = "MT/2025-2025_Regular_Session";
const data = (wrapper: string, payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify({ [wrapper]: payload }));

describe("LegiScan bulk JSON folder-to-envelope adapter", () => {
  it("accepts the real bill folder and provider bill envelope", () => {
    expect(parse(root + "/bill/HB1.json",
      data("bill", { bill_id: 1895956, session_id: 2159, state, bill_number: "HB1" }), state, session))
      .toMatchObject({ kind: "bill", id: 1895956 });
  });
  it("maps people/ to person rather than incorrectly reading people", () => {
    expect(parse(root + "/people/7855.json",
      data("person", { people_id: 7855 }), state, session))
      .toMatchObject({ kind: "person", id: 7855 });
  });
  it("maps vote/ to roll_call rather than incorrectly reading vote", () => {
    expect(parse(root + "/vote/1481116.json",
      data("roll_call", { roll_call_id: 1481116, bill_id: 1895956 }), state, session))
      .toMatchObject({ kind: "roll_call", id: 1481116 });
  });
  it.each([
    ["people/7855.json", "people", { people_id: 7855 }],
    ["vote/1481116.json", "vote", { roll_call_id: 1481116 }],
    ["bill/HB1.json", "bill", { bill_id: 1895956, session_id: 2159, state: "MT", bill_number: "HB1" }],
  ])("fails closed on wrong JSON wrapper for %s", (path, wrapper, obj) => {
    expect(() => parse(root + "/" + path, data(wrapper, obj), state, session))
      .toThrow("docket_bulk_wrong_member_wrapper");
  });
  it("rejects mismatched bill sessions and jurisdictions", () => {
    expect(() => parse(root + "/bill/HB1.json",
      data("bill", { bill_id: 1895956, session_id: 9999, state, bill_number: "HB1" }), state, session))
      .toThrow("docket_bulk_bill_identity_mismatch");
    expect(() => parse(root + "/bill/HB1.json",
      data("bill", { bill_id: 1895956, session_id: 2159, state: "NV", bill_number: "HB1" }), state, session))
      .toThrow("docket_bulk_bill_identity_mismatch");
  });
  it("rejects path traversal, wrong filename ID and invalid JSON", () => {
    expect(() => parse(root + "/vote/../1481116.json",
      data("roll_call", { roll_call_id: 1481116 }), state, session))
      .toThrow("docket_bulk_member_path_mismatch");
    expect(() => parse(root + "/vote/99.json",
      data("roll_call", { roll_call_id: 1481116 }), state, session))
      .toThrow("docket_bulk_filename_id_mismatch");
    expect(() => parse(root + "/people/7855.json", Buffer.from("{"), state, session))
      .toThrow("docket_bulk_invalid_json_member");
  });
});
