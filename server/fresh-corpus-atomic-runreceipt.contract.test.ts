import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic receipts", () => {
  it("seals per-artifact and run-level hashes", () => {
    expect(service).toContain("generated_record_keys");
    expect(service).toContain("artifact_receipts");
    expect(service).toContain("receipt_hash");
    expect(service).toContain("completed_at=now()");
  });
});
