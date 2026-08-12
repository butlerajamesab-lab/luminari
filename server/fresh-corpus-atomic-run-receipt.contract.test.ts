import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic run receipt material", () => {
  it("hashes artifact receipts plus atomic/origin counts", () => {
    expect(service).toContain("artifact_receipts: rows.rows");
    expect(service).toContain("atomic_records: atomicRecords");
    expect(service).toContain("origins");
  });
});
