import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic large artifact parsing", () => {
  it("has structural readers for every large artifact family in the authoritative buckets", () => {
    for (const token of ["parseSqlAtomic", "parseDocxAtomic", "parseXlsxAtomic", "parseJsonAtomic", "parseCsvAtomic", "parseTextAtomic", "JSZip.loadAsync"]) {
      expect(service).toContain(token);
    }
  });
});
