import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { forEachXlsxRow, type XlsxSourceRow } from "./services/fresh-corpus-reconciliation-v1";
import { parseXlsxAtomic } from "./services/fresh-corpus-atomic-v1";

async function fixtureWorkbook(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="WA Resource Directory" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
    </Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Luminari authored directory</t></is></c></row>
      <row r="2">
        <c r="A2" t="inlineStr"><is><t>Name</t></is></c>
        <c r="B2" t="inlineStr"><is><t>Address</t></is></c>
        <c r="C2" t="inlineStr"><is><t>Computed</t></is></c>
      </row>
      <row r="3">
        <c r="A3" t="inlineStr"><is><t>Example Resource</t></is></c>
        <c r="B3" t="inlineStr"><is><t>123 Main Street</t></is></c>
        <c r="C3"><f>1+1</f><v>2</v></c>
      </row>
    </sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("fresh corpus workbook parser", () => {
  it("reads Target-before-Id relationships and reordered sheet attributes in both parsers", async () => {
    const zip = await JSZip.loadAsync(await fixtureWorkbook());
    zip.file("xl/workbook.xml", `<workbook><sheets><sheet r:id='rId1' sheetId='1' name='WA Resource &amp; Directory'/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet' Target='/xl/worksheets/sheet1.xml' Id='rId1'/></Relationships>`);
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const rows: XlsxSourceRow[] = [];
    expect(await forEachXlsxRow(buffer, row => { rows.push(row); })).toBe(3);
    expect(rows[2].sheet).toBe("WA Resource & Directory");
    expect(rows[2].values.Address).toBe("123 Main Street");
    const atomic = await parseXlsxAtomic(buffer, "fixture", null);
    expect(atomic).toHaveLength(1);
    expect(atomic[0].source_relation).toBe("WA Resource & Directory");
  });

  it.each(["relationship", "worksheet", "metadata"])("fails instead of reporting success when %s is missing", async missing => {
    const zip = await JSZip.loadAsync(await fixtureWorkbook());
    if (missing === "relationship") zip.file("xl/_rels/workbook.xml.rels", "<Relationships/>");
    if (missing === "worksheet") zip.remove("xl/worksheets/sheet1.xml");
    if (missing === "metadata") zip.remove("xl/workbook.xml");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await expect(forEachXlsxRow(buffer, () => {})).rejects.toThrow(/xlsx_/);
    await expect(parseXlsxAtomic(buffer, "fixture", null)).rejects.toThrow(/xlsx_/);
  });

  it("retains preamble, header, data, address, and formula metadata", async () => {
    const rows: XlsxSourceRow[] = [];
    await forEachXlsxRow(await fixtureWorkbook(), row => { rows.push(row); });

    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.row_role)).toEqual(["preamble", "header", "data"]);
    expect(rows[2].header_row).toBe(2);
    expect(rows[2].values).toMatchObject({ Name: "Example Resource", Address: "123 Main Street", Computed: "2" });
    expect(rows[2].cells.find(cell => cell.reference === "C3")).toMatchObject({ value: "2", formula: "1+1" });
  });
});
