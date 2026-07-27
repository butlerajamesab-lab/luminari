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

  it("supports the current Lighthouse pattern_name schema as a bounded fallback", () => {
    expect(
      resolve_registry_identity_column(
        "pattern_registry",
        ["pattern_name"],
        [{ pattern_name: "Repeat Entity" }],
      ),
    ).toBe("pattern_name");
  });

  it("falls back when an older bundle has no pattern_id values", () => {
    expect(
      resolve_registry_identity_column(
        "pattern_registry",
        ["pattern_id", "pattern_name"],
        [{ pattern_name: "Repeat Entity" }],
      ),
    ).toBe("pattern_name");
  });

  it("fails closed when no complete governed identity exists", () => {
    expect(() =>
      resolve_registry_identity_column(
        "pattern_registry",
        ["pattern_id", "pattern_name"],
        [{ pattern_id: null, pattern_name: "" }],
      ),
    ).toThrow("No complete canonical identity column");
  });
});
