import { describe, expect, it } from "vitest";
import { related_subject_for_case_path } from "./caseIntakeContinuity";

describe("case intake related subject", () => {
  it("binds document and entity detail routes to the visible subject", () => {
    expect(related_subject_for_case_path("/documents/41?caseId=11")).toEqual({
      type: "document",
      id: "41",
      label: "Document 41",
    });
    expect(related_subject_for_case_path("/entities/9?caseId=11")).toEqual({
      type: "entity",
      id: "9",
      label: "Entity 9",
    });
  });

  it("supports explicit related subjects and timeline document filters", () => {
    expect(related_subject_for_case_path(
      "/findings?caseId=11&relatedType=finding&relatedId=abc&relatedLabel=Billing%20finding",
    )).toEqual({
      type: "finding",
      id: "abc",
      label: "Billing finding",
    });
    expect(related_subject_for_case_path("/timeline?caseId=11&document=41")).toEqual({
      type: "document",
      id: "41",
      label: "Document 41",
    });
  });
});
