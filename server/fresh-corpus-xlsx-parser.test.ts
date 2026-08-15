import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { forEachXlsxRow, type XlsxSourceRow } from "./services/fresh-corpus-reconciliation-v1";

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
