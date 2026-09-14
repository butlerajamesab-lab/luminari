import { describe, expect, it } from "vitest";
import { buildCaseMetadataCorrection } from "./case-metadata-correction";

describe("case metadata correction payload", () => {
  it("sends only fields changed by the person editing the case", () => {
    expect(buildCaseMetadataCorrection(
      42,
      {
        name: "Original name",
        description: "Original summary",
        domain: "housing",
        container: null,
      },
      {
        name: "Corrected name",
        description: "Original summary",
        domain: "housing",
        container: "",
      },
    )).toEqual({ id: 42, name: "Corrected name" });
  });

  it("preserves an intentional metadata clear in the correction payload", () => {
    expect(buildCaseMetadataCorrection(
      42,
      {
        name: "Case name",
        description: "Remove this working summary",
        domain: "housing",
        container: "reference-1",
      },
      {
        name: "Case name",
        description: "",
        domain: "housing",
        container: "",
      },
    )).toEqual({ id: 42, description: "", container: "" });
  });
});
