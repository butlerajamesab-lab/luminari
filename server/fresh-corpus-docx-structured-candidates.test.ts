import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseDocxStructuredCandidates } from "./services/fresh-corpus-reconciliation-v1";

async function docxFixture(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="urn:test"><w:body><w:tbl>
    <w:tr>
      <w:tc><w:p><w:r><w:t>Program</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Layer</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Phone / Contact</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Eligibility</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Apply / Notes</w:t></w:r></w:p></w:tc>
    </w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Food &amp; Nutrition</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:t>Example SNAP</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>State/Federal</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>855-432-7587 / healthearizonaplus.gov</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Income under 130% FPL</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Apply at healthearizonaplus.gov</w:t></w:r></w:p></w:tc>
    </w:tr>
  </w:tbl></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("native DOCX typed candidate extraction", () => {
  it("preserves the authored program row and access fields without flat-text reconstruction", async () => {
    const buffer = await docxFixture();
    const rows = await parseDocxStructuredCandidates({
      runId: "11111111-1111-4111-8111-111111111111",
      artifact: {
        artifact_key: "State Enriched Registry bucket/example.docx",
        bucket_id: "State Enriched Registry bucket",
        object_name: "example.docx",
        transport_etag: null,
        byte_size: buffer.length,
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        artifact_role: "state_registry_source",
        jurisdiction_hint: "AZ",
        semantic_family: "state_registry",
        generation_label: null,
        exact_duplicate_of: null,
      },
      contentSha256: "a".repeat(64),
      text: "",
    } as any, buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      candidate_type: "program",
      source_locator: "docx:table:1:row:3",
      section_name: "Food & Nutrition",
      name: "Example SNAP",
      category: "food_nutrition",
      layer: "State/Federal",
      phone: "855-432-7587",
      website_url: "healthearizonaplus.gov",
      eligibility_summary: "Income under 130% FPL",
      apply_notes: "Apply at healthearizonaplus.gov",
      candidate_state: "typed_preserved",
    });
    expect(rows[0].payload).toMatchObject({
      parser_rule: "native_docx_program_row",
      table_index: 1,
      row_index: 3,
      section_context: "Food & Nutrition",
      fields: {
        phone: "855-432-7587",
        website_url: "healthearizonaplus.gov",
        eligibility_summary: "Income under 130% FPL",
        apply_notes: "Apply at healthearizonaplus.gov",
        filing_portal: "Apply at healthearizonaplus.gov",
      },
    });
  });
});
