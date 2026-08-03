import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalSerialize, computeCanonicalHash } from "./determinism";

describe("determinism helpers", () => {
  it("produces one stable SHA-256 identity regardless of object key order", () => {
    const first = { alpha: 1, nested: { zeta: true, beta: [3, 2, 1] } };
    const second = { nested: { beta: [3, 2, 1], zeta: true }, alpha: 1 };

    expect(canonicalSerialize(first)).toBe(canonicalSerialize(second));
    expect(computeCanonicalHash(first)).toBe(computeCanonicalHash(second));
    expect(computeCanonicalHash(first)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses a static ESM Node crypto import and contains no runtime require", () => {
    const source = readFileSync(fileURLToPath(new URL("./determinism.ts", import.meta.url)), "utf8");
    expect(source).toContain('import { createHash } from "node:crypto"');
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});
