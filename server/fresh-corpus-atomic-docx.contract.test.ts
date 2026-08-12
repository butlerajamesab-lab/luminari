import { describe, expect, it } from "vitest";
import { parseDocxXmlAtomicRows } from "./services/fresh-corpus-atomic-v1";

const HASH = "c".repeat(64);

describe("atomic DOCX parsing", () => {
  it("does not collapse table rows into a single document-level candidate", () => {
    const xml = `<w:document xmlns:w="urn:test"><w:body><w:tbl>${Array.from({ length: 5 }, (_, i) => `<w:tr><w:tc><w:p><w:r><w:t>Row ${i + 1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value ${i + 1}</w:t></w:r></w:p></w:tc></w:tr>`).join("")}</w:tbl></w:body></w:document>`;
    const rows = parseDocxXmlAtomicRows(xml, HASH);
    expect(rows.filter(row => row.source_kind === "docx_table_row")).toHaveLength(5);
  });
});
