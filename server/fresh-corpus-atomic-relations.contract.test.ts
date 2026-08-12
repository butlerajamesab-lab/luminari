import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic relations", () => {
  it("retains source table/sheet/document relation identity where available", () => {
    expect(service).toContain("source_relation");
    expect(service).toContain("normalizeSqlRelation");
    expect(service).toContain("decodeXmlEntities(sheet[1])");
  });
});
