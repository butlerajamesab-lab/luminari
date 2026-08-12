import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("archive member hashing", () => {
  it("hashes each parsed member buffer as its record source file", () => {
    expect(service).toContain("const sourceFileSha256 = sha256(input.buffer)");
    expect(service).toContain("containerMemberPath: name");
  });
});
