import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { audit_registry_workbook } from "./services/registry-workbook-audit";

describe("workbook preservation receipts", () => {
  it("includes empty and blank-only sheets alongside populated sheets", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", `<workbook><sheets><sheet name="Empty" r:id="r1"/><sheet name="Blank" r:id="r2"/><sheet name="Data" r:id="r3"/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Target="worksheets/1.xml" Id="r1"/><Relationship Target="worksheets/2.xml" Id="r2"/><Relationship Target="worksheets/3.xml" Id="r3"/></Relationships>`);
    zip.file("xl/worksheets/1.xml", `<worksheet><sheetData/></worksheet>`);
    zip.file("xl/worksheets/2.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t> </t></is></c></row></sheetData></worksheet>`);
    zip.file("xl/worksheets/3.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Address</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Resource</t></is></c><c r="B2" t="inlineStr"><is><t>Main Street</t></is></c></row></sheetData></worksheet>`);
    const report = await audit_registry_workbook(await zip.generateAsync({ type: "nodebuffer" }));
    expect(report.sheet_count).toBe(3);
    expect(report.nonempty_rows).toBe(2);
    expect(Object.keys(report.sheets)).toEqual(["Empty", "Blank", "Data"]);
    expect(report.sheets.Empty).toMatchObject({ total: 0, data: 0, header: 0, preamble: 0 });
    expect(report.sheets.Blank).toMatchObject({ total: 0, data: 0, header: 0, preamble: 0 });
    expect(report.sheets.Data).toMatchObject({ total: 2, data: 1, header: 1, preamble: 0 });
    zip.remove("xl/worksheets/1.xml");
    await expect(audit_registry_workbook(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow("xlsx_worksheet_part_missing");
  });
});

it.each([
  ['truncated worksheet', '<worksheet><sheetData><row r="1">', 'invalid_worksheet_structure'],
  ['unclosed row', '<worksheet><sheetData><row r="1"></sheetData></worksheet>', 'unclosed_worksheet_content'],
  ['missing shared string', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>', 'invalid_shared_string_reference'],
])('rejects %s instead of certifying an empty sheet', async (_label, worksheet, error) => {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Source" r:id="r1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Target="worksheets/source.xml" Id="r1"/></Relationships>');
  zip.file('xl/worksheets/source.xml', worksheet);
  await expect(audit_registry_workbook(await zip.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow(error);
});
