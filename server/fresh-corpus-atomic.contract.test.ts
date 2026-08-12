import { describe, expect, it } from "vitest";
import { parseDocxXmlAtomicRows, parseSqlAtomic } from "./services/fresh-corpus-atomic-v1";

const HASH = "a".repeat(64);

describe("fresh atomic corpus parser", () => {
  it("extracts COPY and INSERT rows without executing SQL", () => {
    const sql = [
      "COPY public.registry_programs (id, name, jurisdiction) FROM stdin;",
      "1\tAlpha Program\tWA",
      "2\tBeta Program\tOR",
      "\\.",
      "INSERT INTO public.legal_statutes (id, title) VALUES ('s1', 'Statute One'), ('s2', 'Statute Two');",
    ].join("\n");

    const rows = parseSqlAtomic(sql, HASH);
    expect(rows).toHaveLength(4);
    expect(rows.map(row => row.source_kind)).toEqual([
      "sql_copy_row",
      "sql_copy_row",
      "sql_insert_row",
      "sql_insert_row",
    ]);
    expect(rows[0].source_relation).toBe("registry_programs");
    expect(rows[0].values_json).toMatchObject({ id: "1", name: "Alpha Program", jurisdiction: "WA" });
    expect(rows[3].source_relation).toBe("legal_statutes");
    expect(rows[3].values_json).toMatchObject({ id: "s2", title: "Statute Two" });
  });

  it("extracts DOCX table rows and body paragraphs as separate atomic records", () => {
    const xml = `
      <w:document xmlns:w="urn:test"><w:body>
        <w:tbl><w:tr>
          <w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Phone</w:t></w:r></w:p></w:tc>
        </w:tr><w:tr>
          <w:tc><w:p><w:r><w:t>Resource A</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>555-555-1212</w:t></w:r></w:p></w:tc>
        </w:tr></w:tbl>
        <w:p><w:r><w:t>This is a separate source-bound policy paragraph.</w:t></w:r></w:p>
      </w:body></w:document>`;

    const rows = parseDocxXmlAtomicRows(xml, HASH);
    expect(rows.filter(row => row.source_kind === "docx_table_row")).toHaveLength(2);
    expect(rows.filter(row => row.source_kind === "document_paragraph")).toHaveLength(1);
    expect(rows.at(-1)?.raw_excerpt).toContain("separate source-bound policy paragraph");
  });

  it("uses content-addressed record keys rather than treating source rows as public resources", () => {
    const sql = "INSERT INTO t (id,name) VALUES ('1','A'),('2','B');";
    const rows = parseSqlAtomic(sql, HASH);
    expect(new Set(rows.map(row => row.atomic_record_key)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.atomic_record_key).toMatch(/^[0-9a-f]{64}$/);
      expect(row.record_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.parser_version).toBe("fresh_atomic_parser_v1.0.0");
    }
  });
});
