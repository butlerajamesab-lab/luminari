import { describe, expect, it } from "vitest";
import { parseDocxXmlAtomicRows } from "./services/fresh-corpus-atomic-v1";

const HASH = "c".repeat(64);

describe("atomic DOCX parsing", () => {
  it("does not collapse table rows into a single document-level candidate", () => {
    const xml = `<w:document xmlns:w="urn:test"><w:body><w:tbl>${Array.from({ length: 5 }, (_, i) => `<w:tr><w:tc><w:p><w:r><w:t>Row ${i + 1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value ${i + 1}</w:t></w:r></w:p></w:tc></w:tr>`).join("")}</w:tbl></w:body></w:document>`;
    const rows = parseDocxXmlAtomicRows(xml, HASH);
    expect(rows.filter(row => row.source_kind === "docx_table_row")).toHaveLength(5);
  });
  it("preserves table headers, section rows, and data-row meaning", () => {
    const xml = `<w:document xmlns:w="urn:test"><w:body><w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Program</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Layer</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Phone / Contact</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Eligibility</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Apply / Notes</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>State Programs</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Example Benefit</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>State/Federal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>800-555-0100 / example.gov</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Income under threshold</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Apply online</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl></w:body></w:document>`;
    const rows = parseDocxXmlAtomicRows(xml, HASH).filter(row => row.source_kind === "docx_table_row");
    expect(rows).toHaveLength(3);
    expect(rows[0].values_json).toEqual({
      row_role: "header",
      source_headers: ["Program", "Layer", "Phone / Contact", "Eligibility", "Apply / Notes"],
    });
    expect(rows[1].values_json).toEqual({ row_role: "section", section_context: "State Programs" });
    expect(rows[2].values_json).toMatchObject({
      row_role: "data",
      Program: "Example Benefit",
      Layer: "State/Federal",
      "Phone / Contact": "800-555-0100 / example.gov",
      Eligibility: "Income under threshold",
      "Apply / Notes": "Apply online",
      section_context: "State Programs",
    });
  });

});
