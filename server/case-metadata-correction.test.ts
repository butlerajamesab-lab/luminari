import { describe, expect, it } from "vitest";
import {
  describe_case_metadata_changes,
  editable_case_metadata_patch_schema,
  normalize_case_metadata_patch,
} from "./case-metadata-correction";

describe("case metadata correction boundary", () => {
  it("accepts only mutable case metadata and rejects source-evidence fields", () => {
    expect(editable_case_metadata_patch_schema.safeParse({
      name: "Corrected name",
      source_document_id: 91,
    }).success).toBe(false);
  });

  it("normalizes clearable metadata without allowing an empty case name", () => {
    const parsed = editable_case_metadata_patch_schema.parse({
      name: "  Corrected case  ",
      description: "   ",
      domain: " Housing ",
      container: "   ",
    });

    expect(normalize_case_metadata_patch(parsed)).toEqual({
      name: "Corrected case",
      description: null,
      domain: "housing",
      container: null,
    });
    expect(editable_case_metadata_patch_schema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("returns an exact before-and-after ledger for changed metadata only", () => {
    const changes = describe_case_metadata_changes(
      {
        name: "General Investigation",
        description: "Original workspace summary",
        status: "active",
        domain: "general",
        container: null,
      },
      {
        name: "Apartment leak and tenancy notice",
        description: "Corrected workspace summary",
        domain: "housing",
        container: null,
      },
    );

    expect(changes).toEqual({
      name: {
        before: "General Investigation",
        after: "Apartment leak and tenancy notice",
      },
      description: {
        before: "Original workspace summary",
        after: "Corrected workspace summary",
      },
      domain: { before: "general", after: "housing" },
    });
  });
});
