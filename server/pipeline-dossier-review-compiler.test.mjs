import { describe, expect, it } from "vitest";
import {
  compile_pipeline_dossier_items,
  parse_docx_document_xml,
  pipeline_dossier_compiler_contract,
} from "../scripts/lib/pipeline-dossier-review-compiler.mjs";

const hash_a = "a".repeat(64);
const hash_b = "b".repeat(64);

function table(rows) {
  return { type: "table", rows };
}

function paragraph(text) {
  return { type: "paragraph", text };
}

function fixture_items(appendix_overrides = {}) {
  return [
    paragraph("LUMINARI"),
    paragraph("Systemic Abuse Intelligence Series"),
    paragraph("Pipeline Dossier EC-999 | Test Category: Test Pipeline"),
    paragraph("1 Verified Resources | 1 Federal/State Authorities | 1 State/Territory Entry Points | Pipeline: test_pipeline"),
    paragraph("Family: Systemic Abuse Intelligence | Family Key: systemic_abuse_intelligence | Pipeline Key: test_pipeline | Category Key: test_category | Family Contract: Lighthouse test"),
    table([["TEST PIPELINE -- CRITICAL ROUTING, READ THIS FIRST: (1) Preserve the notice. (2) Use the verified national route first."]]),
    table([["SECTION: Test Resource"]]),
    table([["Test Resource Full Name [SAIS-EC-999-01] ★ VERIFIED"]]),
    table([
      ["Service Type", "test_service"],
      ["Organization Type", "federal_agency | state_regulator"],
      ["Jurisdiction", "federal + state -- ALL_STATES"],
      ["Phone / Contact", "Test Agency: 800-555-0100 | State office"],
      ["Website", "https://example.test/route"],
      ["What it does for people", "Provides the verified route for the test pipeline."],
    ]),
    table([["DEADLINE MATRIX -- FIVE DISTINCT CLOCKS, TRACK EACH SEPARATELY"]]),
    table([
      ["Appeal Deadline", "Appeal within the source-defined period."],
      ["Continued-Benefits Deadline", "Request continuation before the action takes effect."],
      ["Hearing-Request Deadline", "Request the hearing within the source-defined window."],
      ["Reconsideration Deadline", "Request reconsideration without consuming the hearing clock."],
      ["Judicial-Review Deadline", "Judicial review follows the source-defined final action."],
    ]),
    table([
      ["Statutory Authority", "Test Act sec. 1 | Test Rule sec. 2"],
      ["Verification Status", "VERIFIED -- 2026-08-18"],
      ["Luminari Resource ID", "SAIS-EC-999-01"],
      ["Notes", "Preserve the exact source and use the verified route."],
    ]),
    table([["FEDERAL AND STATE AUTHORITY -- TEST PIPELINE"]]),
    table([
      ["Statute / Law", "Citation", "Key Language / Note", "Official Source"],
      ["Test Act", "Test Act sec. 1", "Controls the test route.", "example.test"],
    ]),
    table([["STATE ENTRY POINTS (1 Jurisdiction)"]]),
    table([
      ["State", "Agency", "Phone", "Website", "Statutory Authority", "Verification"],
      ["WA", "Washington Test Agency", "800-555-0101", "Website", "RCW test", "UNVERIFIED"],
    ]),
    table([["METADATA APPENDIX -- CANONICAL STRUCTURED DATASET (Supabase Ingest Target)"]]),
    table([
      [
        "resource_id",
        "family_series",
        "document_number",
        "resource_category",
        "subcategory",
        "jurisdiction_level",
        "jurisdiction",
        "organization_name",
        "organization_type",
        "service_type",
        "official_url",
        "official_contact",
        "statutory_authority",
        "appeal_deadline",
        "continued_benefits_deadline",
        "hearing_request_deadline",
        "reconsideration_deadline",
        "judicial_review_deadline",
        "verification_status",
        "last_verified",
        "notes",
        "revision",
      ],
      [
        "SAIS-EC-999-01",
        "systemic_abuse_intelligence",
        "EC-999",
        "test_pipeline",
        "test_service",
        "federal + state",
        "federal + state -- ALL_STATES",
        appendix_overrides.organization_name ?? "Test Resource",
        "federal_agency | state_regulator",
        "test_service",
        "https://example.test/route",
        "Test Agency: 800-555-0100",
        "Test Act sec. 1",
        "Appeal within the source-defined",
        "Request continuation before the action",
        "Request the hearing within the source-defined",
        "Request reconsideration without consuming",
        "Judicial review follows the source-defined",
        "VERIFIED",
        "2026-08-18",
        "Preserve the exact source",
        "v1.0",
      ],
    ]),
  ];
}

describe("pipeline dossier review compiler", () => {
  it("compiles a pipeline-specific dossier into a deterministic non-publishing review candidate", () => {
    const first = compile_pipeline_dossier_items({
      items: fixture_items(),
      source_filename: "pipeline-test.docx",
      source_sha256: hash_a,
      document_xml_sha256: hash_b,
    });
    const second = compile_pipeline_dossier_items({
      items: fixture_items(),
      source_filename: "pipeline-test.docx",
      source_sha256: hash_a,
      document_xml_sha256: hash_b,
    });

    expect(first).toEqual(second);
    expect(first.dossier.pipeline_key).toBe("test_pipeline");
    expect(first.validation.resource_count).toBe(1);
    expect(first.validation.deadline_assertion_count).toBe(5);
    expect(first.validation.integrity_hold_count).toBe(1);
    expect(first.integrity_holds[0]).toMatchObject({
      jurisdiction_code: "WA",
      reason_code: "source_row_verification_status_unverified",
      publication_state: "held_unverified",
    });
    expect(first.production_write_allowed).toBe(false);
    expect(first.review_requirements.activation_allowed_from_this_package).toBe(false);
    expect(first.package_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when an appendix fragment conflicts with the narrative source", () => {
    expect(() => compile_pipeline_dossier_items({
      items: fixture_items({ organization_name: "Different Resource" }),
      source_filename: "pipeline-test.docx",
      source_sha256: hash_a,
      document_xml_sha256: hash_b,
    })).toThrow(/pipeline_dossier_compiler_appendix_value_conflict:SAIS-EC-999-01:organization_name/);
  });

  it("fails closed when the declared pipeline key and appendix pipeline key differ", () => {
    const items = fixture_items();
    const appendix = items.at(-1);
    appendix.rows[1][3] = "different_pipeline";
    expect(() => compile_pipeline_dossier_items({
      items,
      source_filename: "pipeline-test.docx",
      source_sha256: hash_a,
      document_xml_sha256: hash_b,
    })).toThrow(/pipeline_dossier_compiler_metadata_pipeline_key_conflict/);
  });

  it("parses WordprocessingML without treating paragraphs inside a table as top-level items", () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Header</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Footer</w:t></w:r></w:p></w:body></w:document>`;
    expect(parse_docx_document_xml(xml)).toEqual([
      { type: "paragraph", text: "Header" },
      { type: "table", rows: [["Cell A", "Cell B"]] },
      { type: "paragraph", text: "Footer" },
    ]);
  });

  it("exports a dry-run-only compiler contract", () => {
    expect(pipeline_dossier_compiler_contract.production_write_allowed).toBe(false);
    expect(pipeline_dossier_compiler_contract.required_deadline_fields).toHaveLength(5);
  });
});
