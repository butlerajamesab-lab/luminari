import { describe, expect, it } from "vitest";
import { computeManifestHash } from "./crypto-signing";

describe("governance chain snapshot signing contract", () => {
  it("normalizes the explicit governance-chain compatibility payload deterministically", () => {
    const payload = {
      snapshotId: "gov-snapshot-3" as const,
      documentHashes: { chainRoot: "a".repeat(64) },
    };
    const first = computeManifestHash(payload);
    const second = computeManifestHash(payload);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it("rejects malformed payloads instead of silently inventing missing signing fields", () => {
    expect(() => computeManifestHash({
      snapshotId: "gov-snapshot-3" as const,
      documentHashes: { chainRoot: "not-a-hash" },
    })).toThrow(/does not satisfy/);
  });
});
