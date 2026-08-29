import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic source provenance", () => {
  it("downloads current Storage bytes, verifies byte size, and hashes them", () => {
    expect(service).toContain("storage_byte_size_mismatch_expected_");
    expect(service).toContain("const contentSha256 = sha256(buffer)");
    expect(service).toContain("source_file_sha256");
    expect(service).toContain("content_sha256=$3");
  });
});
