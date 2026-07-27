import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SPINE_BUNDLE_FORMAT,
  compute_spine_checksum,
  create_spine_manifest,
  stringify_spine_json,
  verify_spine_bundle,
} from "./spine-bundle-contract";

const originalSigningKey = process.env.SPINE_EXPORT_SIGNING_KEY;
const originalLegacyOverride = process.env.ALLOW_LEGACY_UNSIGNED_SPINE_RESTORE;

beforeEach(() => {
  process.env.SPINE_EXPORT_SIGNING_KEY = "unit-test-spine-key";
  delete process.env.ALLOW_LEGACY_UNSIGNED_SPINE_RESTORE;
});

afterEach(() => {
  if (originalSigningKey === undefined) delete process.env.SPINE_EXPORT_SIGNING_KEY;
  else process.env.SPINE_EXPORT_SIGNING_KEY = originalSigningKey;
  if (originalLegacyOverride === undefined) delete process.env.ALLOW_LEGACY_UNSIGNED_SPINE_RESTORE;
  else process.env.ALLOW_LEGACY_UNSIGNED_SPINE_RESTORE = originalLegacyOverride;
});

function createBundle() {
  const bundle: Record<string, any> = {
    _meta: {
      bundleName: "test-bundle",
      bundleType: "config",
      bundleFormat: SPINE_BUNDLE_FORMAT,
      databaseType: "postgresql",
      createdAt: 1,
      appVersion: "test",
    },
    config: { registryTables: [] },
  };
  const checksum = compute_spine_checksum(bundle);
  bundle._manifest = create_spine_manifest({
    bundleName: "test-bundle",
    bundleType: "config",
    createdAt: 1,
    appVersion: "test",
    includedDirectories: [],
    includedTables: [],
    includedConfigs: ["registryTables"],
    checksum,
  });
  return bundle;
}

describe("signed Sovereign Spine bundle contract", () => {
  it("accepts an untampered PostgreSQL bundle", () => {
    const result = verify_spine_bundle(stringify_spine_json(createBundle()));
    expect(result.verification).toMatchObject({
      checksumValid: true,
      signatureValid: true,
      metadataValid: true,
      formatValid: true,
      databaseValid: true,
      executable: true,
    });
  });

  it("rejects content modified after signing", () => {
    const bundle = createBundle();
    bundle.config.registryTables.push({ tableName: "engine_registry", rows: [] });
    const result = verify_spine_bundle(stringify_spine_json(bundle));
    expect(result.verification.checksumValid).toBe(false);
    expect(result.verification.executable).toBe(false);
  });

  it("rejects signed-manifest inventory modified after signing", () => {
    const bundle = createBundle();
    bundle._manifest.includedTables.push("engine_registry");
    const result = verify_spine_bundle(stringify_spine_json(bundle));
    expect(result.verification.checksumValid).toBe(true);
    expect(result.verification.signatureValid).toBe(false);
    expect(result.verification.executable).toBe(false);
  });

  it("rejects identity metadata that disagrees with the signed manifest", () => {
    const bundle = createBundle();
    bundle._meta.bundleName = "different-bundle";
    const result = verify_spine_bundle(stringify_spine_json(bundle));
    expect(result.verification.metadataValid).toBe(false);
    expect(result.verification.executable).toBe(false);
  });

  it("rejects a checksum-only bundle without an authentic signature", () => {
    const bundle = createBundle();
    delete bundle._manifest.signature;
    const result = verify_spine_bundle(stringify_spine_json(bundle));
    expect(result.verification.checksumValid).toBe(true);
    expect(result.verification.signatureValid).toBe(false);
    expect(result.verification.executable).toBe(false);
  });

  it("serializes bigint values without breaking the bundle", () => {
    expect(stringify_spine_json({ id: 12n }, 0)).toBe('{"id":"12"}');
  });
});
