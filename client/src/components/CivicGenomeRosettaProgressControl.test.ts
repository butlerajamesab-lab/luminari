import { describe, expect, it } from "vitest";

import { get_rosetta_progress_action } from "./CivicGenomeRosettaProgressControl";

describe("Civic Genome Rosetta progress actions", () => {
  it("runs extraction only while the exact source is waiting for extraction", () => {
    expect(get_rosetta_progress_action("waiting_for_extraction")).toBe("extract_and_assemble");
  });

  it("assembles without rerunning Rosetta when extraction is already admissible", () => {
    expect(get_rosetta_progress_action("ready_for_assembly")).toBe("assemble_only");
  });

  it.each([
    "assembled",
    "not_handed_off",
    "blocked",
    "contract_error",
    null,
    undefined,
  ])("renders no mutation action for %s", state => {
    expect(get_rosetta_progress_action(state)).toBeNull();
  });
});
