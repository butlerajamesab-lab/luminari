import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRegistryCache,
  getCachedRegistry,
  getLensRegistryLoadStatus,
  loadLensRegistry,
  type LensRegistry,
} from "./lens-engine";

const valid_registry: LensRegistry = {
  version: "test-1.0.0",
  structural_lenses: [{
    lens_id: "source_integrity",
    label: "Source integrity",
    category: "structural",
    description: "Tracks whether an assertion remains bound to its source.",
    priority: 100,
    activation_rules: { always: true },
  }],
  domain_lenses: [],
  interpretive_lenses: [],
  signals: [],
};

beforeEach(() => clearRegistryCache());

describe("lens registry fail-closed contract", () => {
  it("rejects the current empty canonical registry and exposes the reason", () => {
    const result = loadLensRegistry();

    expect(result.hash).toBe("");
    expect(result.errors).toContain("Registry missing 'version' field.");
    expect(result.errors).toContain("Registry contains no lens definitions.");
    expect(getCachedRegistry()).toBeNull();
    expect(getLensRegistryLoadStatus()).toEqual({
      loaded: false,
      errors: result.errors,
    });
  });

  it("rejects array-shaped activation rules and clears any prior cache", () => {
    expect(loadLensRegistry(valid_registry).errors).toEqual([]);
    expect(getCachedRegistry()).not.toBeNull();

    const malformed = structuredClone(valid_registry) as unknown as LensRegistry;
    malformed.structural_lenses[0].activation_rules = [] as never;
    const result = loadLensRegistry(malformed);

    expect(result.errors).toContain(
      "Lens 'source_integrity' has invalid 'activation_rules'; expected an object.",
    );
    expect(getCachedRegistry()).toBeNull();
    expect(getLensRegistryLoadStatus().loaded).toBe(false);
  });

  it("caches a valid registry with a stable non-empty hash", () => {
    const first = loadLensRegistry(valid_registry);
    clearRegistryCache();
    const second = loadLensRegistry(structuredClone(valid_registry));

    expect(first.errors).toEqual([]);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(getCachedRegistry()).toEqual({
      registry: { ...valid_registry, mutual_exclusion_groups: [] },
      hash: first.hash,
    });
  });
});
