import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseXlsxAtomic as parse_xlsx_atomic } from "./services/fresh-corpus-atomic-v1";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic relations", () => {
  it("retains source table/sheet/document relation identity where available", () => {
    expect(service).toContain("source_relation");
    expect(service).toContain("normalizeSqlRelation");
  });
  it("retains the decoded worksheet name and physical row in atomic source identity", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", `<workbook><sheets><sheet r:id="rId1" name="Law &amp; Rights"/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Target="/xl/worksheets/sheet1.xml" Id="rId1"/></Relationships>`);
    zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData>
      <row r="2"><c r="A2" t="inlineStr"><is><t>citation</t></is></c><c r="B2" t="inlineStr"><is><t>title</t></is></c></row>
      <row r="4"><c r="A4" t="inlineStr"><is><t>TEST 1</t></is></c><c r="B4" t="inlineStr"><is><t>Source text</t></is></c></row>
    </sheetData></worksheet>`);
    const records = await parse_xlsx_atomic(await zip.generateAsync({ type: "nodebuffer" }), "source-hash", "archive.xlsx");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ source_relation: "Law & Rights", source_locator: "xlsx:Law & Rights:row:4" });
  });
});
