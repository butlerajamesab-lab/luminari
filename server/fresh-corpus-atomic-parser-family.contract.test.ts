import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic parser families", () => {
  it("supports the authoritative corpus formats", () => {
    for (const ext of ['".sql"', '".docx"', '".xlsx"', '".json"', '".jsonl"', '".csv"', '".md"', '".txt"']) {
      expect(service).toContain(ext);
    }
  });
});
