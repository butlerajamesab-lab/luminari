import { describe, it, expect } from "vitest";
import {
  generationOf,
  isAdmissibleRow,
  cleanTextValue,
  extractPhones,
  cleanWebsite,
  cleanEmail,
  planEntity,
  FAITHFUL_SHEETS,
} from "./content-projection-core.mjs";

const V13 = "State Enriched Registry bucket/luminari_resource_directory_v3_13.xlsx";
const NINE = "Everything backbone related/luminari_resource_directory (9).xlsx";
const DOCX = "State Enriched Registry bucket/luminari-WASHINGTON-RESOURCE-DIRECTORY-2026.docx";

function row(overrides = {}) {
  return {
    civic_object_uid: "obj-1",
    artifact_key: V13,
    section_name: "program_master",
    source_locator: "xlsx:program_master:row:1",
    source_content_sha256: "abc",
    description: null,
    eligibility_summary: null,
    apply_notes: null,
    phone: null,
    website_url: null,
    email: null,
    filing_portal_url: null,
    ...overrides,
  };
}

function entity(overrides = {}) {
  return {
    resource_entity_id: "11111111-1111-1111-1111-111111111111",
    description: null,
    eligibility_summary: null,
    apply_notes: null,
    ...overrides,
  };
}

describe("generationOf", () => {
  it("classifies the three generations and other artifacts", () => {
    expect(generationOf(V13)).toBe("v3_13");
    expect(generationOf(NINE)).toBe("nine");
    expect(generationOf(DOCX)).toBe("docx");
    expect(generationOf("some/other/file.csv")).toBe("other");
    expect(generationOf(null)).toBe("other");
  });
});

describe("isAdmissibleRow — the fidelity gate", () => {
  it("admits v3_13 rows on faithful sheets", () => {
    for (const sheet of FAITHFUL_SHEETS) {
      expect(isAdmissibleRow(row({ section_name: sheet }))).toBe(true);
    }
  });
  it("holds v3_13 rows on unverifiable and lossy sheets", () => {
    for (const sheet of [
      "benefits_program_master",
      "master_template_program",
      "substrate_az_program",
      "wa_registry_program",
      "national_benefits_program",
      "bucket_resource",
      "registry_programs",
      "state_enriched_directory_v3_13",
      "markdown_directory",
    ]) {
      expect(isAdmissibleRow(row({ section_name: sheet }))).toBe(false);
    }
  });
  it("holds (9)-generation rows even on faithful sheets", () => {
    expect(
      isAdmissibleRow(row({ artifact_key: NINE, section_name: "pass3_program_card" })),
    ).toBe(false);
  });
  it("admits DOCX rows regardless of section (source documents)", () => {
    expect(isAdmissibleRow(row({ artifact_key: DOCX, section_name: "document_start" }))).toBe(true);
    expect(isAdmissibleRow(row({ artifact_key: DOCX, section_name: null }))).toBe(true);
  });
  it("holds unknown artifacts and unlisted v3_13 sections by default", () => {
    expect(isAdmissibleRow(row({ artifact_key: "x/y.csv", section_name: "program_master" }))).toBe(false);
    expect(isAdmissibleRow(row({ section_name: "wa_oversight_body" }))).toBe(false);
    expect(isAdmissibleRow(row({ section_name: null }))).toBe(false);
  });
  it("does not let a benefits_program_master substring pass as program_master", () => {
    // Token-exact sheet matching: the cleared list is matched whole,
    // never by substring (the naming gate's substring trap).
    expect(isAdmissibleRow(row({ section_name: "benefits_program_master" }))).toBe(false);
  });
});

describe("cleanTextValue", () => {
  it("passes ordinary prose, trimmed", () => {
    expect(cleanTextValue("  Provides housing help. ")).toEqual({
      value: "Provides housing help.",
      reason: null,
    });
  });
  it("rejects markup, undefined, and bare filenames", () => {
    expect(cleanTextValue("foo </w:r></w:p> bar").reason).toBe("rejected_markup");
    expect(cleanTextValue("undefined").reason).toBe("rejected_filename_or_undefined");
    expect(cleanTextValue("luminari-texas-registry.docx").reason).toBe(
      "rejected_filename_or_undefined",
    );
  });
  it("treats blanks as empty, not rejections", () => {
    expect(cleanTextValue("   ")).toEqual({ value: null, reason: "empty" });
    expect(cleanTextValue(null)).toEqual({ value: null, reason: "empty" });
  });
});

describe("extractPhones", () => {
  it("extracts a single parenthesized number, normalized", () => {
    expect(extractPhones("(202) 547-9204").numbers).toEqual(["202-547-9204"]);
  });
  it("extracts main + hotline from a rich cell, in order", () => {
    const { numbers } = extractPhones(
      "(202) 401-4634; Eldercare Locator 1-800-677-1116; Disability Information and Access Line (DIAL) national hotline",
    );
    expect(numbers).toEqual(["202-401-4634", "1-800-677-1116"]);
  });
  it("keeps the 1- prefix form distinct in display", () => {
    expect(extractPhones("1-800-522-4700").numbers).toEqual(["1-800-522-4700"]);
  });
  it("skips fax-labeled candidates", () => {
    const { numbers } = extractPhones(
      "(202) 872-8600; Member Services Hotline: (202) 872-4001; Fax: (202) 872-8690",
    );
    expect(numbers).toEqual(["202-872-8600", "202-872-4001"]);
  });
  it("rejects bare junk digit strings", () => {
    expect(extractPhones("19948").numbers).toEqual([]);
    expect(extractPhones("20385").numbers).toEqual([]);
  });
  it("rejects markup cells whole", () => {
    const out = extractPhones("206-555-1234 </w:r></w:p></w:tc>");
    expect(out.numbers).toEqual([]);
    expect(out.rejected).toBe("rejected_markup");
  });
  it("does not mine numbers out of longer digit runs", () => {
    expect(extractPhones("id 120255512345 end").numbers).toEqual([]);
  });
  it("dedupes repeat occurrences within a cell", () => {
    expect(
      extractPhones("(206) 555-1234 or 206-555-1234").numbers,
    ).toEqual(["206-555-1234"]);
  });
});

describe("cleanWebsite / cleanEmail", () => {
  it("accepts plain http(s) URLs only", () => {
    expect(cleanWebsite("https://example.org/help")).toEqual({
      value: "https://example.org/help",
      reason: null,
    });
    expect(cleanWebsite("example.org").reason).toBe("rejected_bad_shape");
    expect(cleanWebsite("call 206-555-1234").reason).toBe("rejected_bad_shape");
    expect(cleanWebsite("https://x.org,https://y.org").reason).toBe("rejected_bad_shape");
  });
  it("accepts one shaped email, rejects junk and multiples", () => {
    expect(cleanEmail("help@example.org")).toEqual({
      value: "help@example.org",
      reason: null,
    });
    expect(cleanEmail("12510").reason).toBe("rejected_bad_shape");
    expect(cleanEmail("a@x.org, b@y.org").reason).toBe("rejected_bad_shape");
    expect(cleanEmail("Not published").reason).toBe("rejected_bad_shape");
  });
});

describe("planEntity", () => {
  it("projects text and contacts from an admissible row", () => {
    const plan = planEntity(entity(), [
      row({
        description: "Helps people appeal benefit denials.",
        eligibility_summary: "Anyone denied benefits.",
        phone: "(206) 555-1234",
        website_url: "https://example.org",
        email: "help@example.org",
        filing_portal_url: "https://example.org/file",
      }),
    ], []);
    expect(plan.textSets.map((t) => t.field)).toEqual([
      "description",
      "eligibility_summary",
    ]);
    expect(plan.contactMints.map((m) => m.contact_type)).toEqual([
      "phone",
      "website",
      "email",
      "portal",
    ]);
    expect(plan.contactMints[0].is_primary).toBe(true);
    expect(plan.held).toBeNull();
  });

  it("never overwrites an existing text field", () => {
    const plan = planEntity(entity({ description: "Already here." }), [
      row({ description: "Other text.", apply_notes: "Apply by phone." }),
    ], []);
    expect(plan.textSets.map((t) => t.field)).toEqual(["apply_notes"]);
  });

  it("takes description from the longest-description row, fills gaps from the next", () => {
    const short = row({
      civic_object_uid: "obj-short",
      source_locator: "xlsx:program_master:row:1",
      description: "Short.",
      apply_notes: "Apply online.",
    });
    const long = row({
      civic_object_uid: "obj-long",
      source_locator: "xlsx:program_master:row:2",
      description: "A much longer description of the program and what it does.",
    });
    const plan = planEntity(entity(), [short, long], []);
    const desc = plan.textSets.find((t) => t.field === "description");
    const apply = plan.textSets.find((t) => t.field === "apply_notes");
    expect(desc.source_civic_object_uid).toBe("obj-long");
    expect(apply.source_civic_object_uid).toBe("obj-short");
  });

  it("holds an entity whose only rows are (9)-generation", () => {
    const plan = planEntity(entity(), [
      row({ artifact_key: NINE, section_name: "pass3_program_card", description: "Text." }),
    ], []);
    expect(plan.textSets).toEqual([]);
    expect(plan.held.rule).toBe("held_no_admissible_rows_only_nine");
  });

  it("holds an entity whose only rows sit on held sheets", () => {
    const plan = planEntity(entity(), [
      row({ section_name: "benefits_program_master", description: "Text." }),
    ], []);
    expect(plan.held.rule).toBe("held_no_admissible_rows_held_sheets");
  });

  it("holds an entity with admissible rows but no valid values", () => {
    const plan = planEntity(entity(), [
      row({ phone: "19948", email: "12510" }),
    ], []);
    expect(plan.contactMints).toEqual([]);
    expect(plan.held.rule).toBe("held_no_valid_values");
    expect(plan.rejections.map((r) => r.rule).sort()).toEqual([
      "rejected_bad_shape",
      "rejected_no_valid_nanp",
    ]);
  });

  it("does not mint contact types the entity already has", () => {
    const plan = planEntity(entity(), [
      row({ phone: "206-555-1234", website_url: "https://example.org" }),
    ], ["phone"]);
    expect(plan.contactMints.map((m) => m.contact_type)).toEqual(["website"]);
  });

  it("caps phones at three across rows and dedupes by core number", () => {
    const plan = planEntity(entity(), [
      row({ civic_object_uid: "a", phone: "206-555-0001; 206-555-0002" }),
      row({ civic_object_uid: "b", source_locator: "xlsx:program_master:row:9", phone: "1-206-555-0001; 206-555-0003; 206-555-0004" }),
    ], []);
    const phones = plan.contactMints.filter((m) => m.contact_type === "phone");
    expect(phones.map((m) => m.contact_value)).toEqual([
      "206-555-0001",
      "206-555-0002",
      "206-555-0003",
    ]);
  });

  it("prefers the v3_13 twin over the (9) twin and still projects", () => {
    const plan = planEntity(entity(), [
      row({ artifact_key: NINE, section_name: "pass3_program_card", description: "Nine text." }),
      row({ section_name: "pass3_program_card", description: "V13 text." }),
    ], []);
    expect(plan.textSets).toHaveLength(1);
    expect(plan.textSets[0].new_value).toBe("V13 text.");
  });
});
