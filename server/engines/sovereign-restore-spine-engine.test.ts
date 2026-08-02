import { describe, expect, it } from "vitest";
import { resolve_registry_identity_column } from "./sovereign-restore-spine-engine";

describe("Sovereign Spine registry identity resolution", () => {
  it("prefers canonical pattern_id when the target and bundle provide it", () => {
    expect(
      resolve_registry_identity_column(
        "pattern_registry",
        ["pattern_id", "pattern_name"],
        [{ pattern_id: "pattern-001", pattern_name: "Repeat Entity" }],
      ),
    ).toBe("pattern_id");
  });

  it("supports pattern_name only when the target has no canonical pattern_id", () => {
    expect(
      resolve_registry_identity_column(
        "pattern_registry",
        ["pattern_name"],
        [{ pattern_name: "Repeat Entity" }],
      ),
    ).toBe("pattern_name");
  });

  it("rejects an older name-only bundle when the target governs pattern_id", () => {
    expect(() =>
      resolve_registry_identity_column(
        "pattern_registry",
        ["pattern_id", "pattern_name"],
        [{ pattern_name: "Repeat Entity" }],
      ),
    ).toThrow("requires complete pattern_id values");
  });

  it("fails closed when no complete governed identity exists", () => {
    expect(() =>
      resolve_registry_identity_column(
        "pattern_registry",
        ["pattern_name"],
        [{ pattern_name: "" }],
      ),
    ).toThrow("No complete canonical identity column");
  });
});
