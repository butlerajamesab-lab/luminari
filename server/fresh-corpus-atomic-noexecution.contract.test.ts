import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic SQL safety", () => {
  it("has no child-process or external SQL execution path", () => {
    expect(service).not.toContain('from "node:child_process"');
    expect(service).not.toContain("execFile(");
    expect(service).not.toContain("spawn(");
    expect(service).not.toContain("psql");
  });

  it("treats SQL contents as source rows only", () => {
    expect(service).toContain('sourceKind: "sql_copy_row"');
    expect(service).toContain('sourceKind: "sql_insert_row"');
    expect(service).toContain("parseSqlAtomic");
  });
});
