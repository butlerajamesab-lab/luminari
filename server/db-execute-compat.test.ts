import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeExecuteResultTupleCompatible } from "./db-execute-compat";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("PostgreSQL execute compatibility facade", () => {
  it("preserves native QueryResult properties while supporting legacy tuple destructuring", () => {
    const native = {
      rows: [{ jurisdiction: "WA" }],
      fields: [{ name: "jurisdiction" }],
      rowCount: 1,
      command: "SELECT",
    };

    const compatible = makeExecuteResultTupleCompatible(native);
    const [rows, fields] = compatible as any;

    expect(rows).toEqual(native.rows);
    expect(fields).toEqual(native.fields);
    expect((compatible as any).rows).toBe(native.rows);
    expect((compatible as any).fields).toBe(native.fields);
    expect((compatible as any).rowCount).toBe(1);
    expect((compatible as any).command).toBe("SELECT");
  });

  it("does not wrap results that are already iterable", () => {
    const native = [[{ id: 1 }], [{ name: "id" }]];
    expect(makeExecuteResultTupleCompatible(native)).toBe(native);
  });

  it("wires only db.execute through the facade and leaves the canonical pool untouched", () => {
    const facade = read("./db.ts");
    const adapter = read("./db-execute-compat.ts");

    expect(facade).toContain('export { db } from "./db-execute-compat"');
    expect(facade).toContain('export * from "./db-legacy"');
    expect(adapter).toContain('if (property === "execute")');
    expect(adapter).toContain("makeExecuteResultTupleCompatible(result)");
    expect(adapter).not.toContain("getPool");
    expect(adapter).not.toContain("sql.raw");
  });
});
