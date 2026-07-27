import { describe, expect, it } from "vitest";
import { preflight_spine_restore_request } from "./spine-restore-preflight";

function bundle(bundleType: "full" | "schema" | "config" | "deployment") {
  return {
    _manifest: { bundleType },
    schema: { tables: [] },
    config: { registryTables: [] },
    data: [],
  };
}

describe("Sovereign Spine restore preflight", () => {
  it("allows only declared restore capabilities for each signed bundle type", () => {
    expect(preflight_spine_restore_request(bundle("full"), "full")).toEqual({
      manifestType: "full",
      restoreType: "full",
    });
    expect(preflight_spine_restore_request(bundle("deployment"), "config")).toEqual({
      manifestType: "deployment",
      restoreType: "config",
    });
    expect(() => preflight_spine_restore_request(bundle("schema"), "full")).toThrow(
      "cannot execute requested full restore",
    );
    expect(() => preflight_spine_restore_request(bundle("config"), "schema")).toThrow(
      "cannot execute requested schema restore",
    );
  });

  it("requires every full-restore section before mutation", () => {
    const value = bundle("full");
    delete (value as any).data;
    expect(() => preflight_spine_restore_request(value, "full")).toThrow(
      "complete data section",
    );
  });

  it("requires schema and registry sections for deployment restore", () => {
    const missingSchema = bundle("deployment");
    delete (missingSchema as any).schema;
    expect(() => preflight_spine_restore_request(missingSchema, "deployment")).toThrow(
      "complete schema.tables section",
    );

    const missingConfig = bundle("deployment");
    delete (missingConfig as any).config;
    expect(() => preflight_spine_restore_request(missingConfig, "deployment")).toThrow(
      "complete config.registryTables section",
    );
  });

  it("rejects missing or unsupported manifest types", () => {
    expect(() => preflight_spine_restore_request({}, "config")).toThrow(
      "unsupported manifest type",
    );
  });
});
