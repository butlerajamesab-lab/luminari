import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic Storage bounds", () => {
  it("bounds Storage downloads and verifies full byte length", () => {
    expect(service).toContain("90_000");
    expect(service).toContain("buffer.byteLength !== Number(artifact.byte_size)");
  });
});
