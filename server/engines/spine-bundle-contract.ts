import crypto from "node:crypto";

export const SPINE_BUNDLE_FORMAT = "luminari-spine-v5-postgresql";
export const SPINE_SIGNATURE_ALGORITHM = "HMAC-SHA256";

export type spine_bundle_type = "full" | "schema" | "config" | "deployment";

export type spine_bundle_manifest = {
  bundleName: string;
  bundleType: spine_bundle_type;
  bundleFormat: string;
  databaseType: "postgresql";
  createdAt: number;
  appVersion: string;
  includedDirectories: string[];
  includedTables: string[];
  includedConfigs: string[];
  checksum: string;
  signatureAlgorithm: typeof SPINE_SIGNATURE_ALGORITHM;
  signature: string;
};

export type spine_bundle_verification = {
  checksumValid: boolean;
  signatureValid: boolean;
  formatValid: boolean;
  databaseValid: boolean;
  executable: boolean;
  legacyOverride: boolean;
  warnings: string[];
};

export function stringify_spine_json(value: unknown, spacing = 2): string {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    spacing,
  );
}

export function compute_spine_checksum(bundle_without_manifest: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stringify_spine_json(bundle_without_manifest))
    .digest("hex");
}

export function get_spine_signing_key(): string {
  const key =
    process.env.SPINE_EXPORT_SIGNING_KEY?.trim() ||
    process.env.JWT_SECRET?.trim();
  if (!key) {
    throw new Error(
      "Sovereign Spine signing key missing: configure SPINE_EXPORT_SIGNING_KEY or JWT_SECRET",
    );
  }
  return key;
}

export function sign_spine_checksum(checksum: string, key = get_spine_signing_key()): string {
  return crypto.createHmac("sha256", key).update(checksum).digest("hex");
}

export function verify_spine_signature(
  checksum: string,
  signature: unknown,
  key = get_spine_signing_key(),
): boolean {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const expected = Buffer.from(sign_spine_checksum(checksum, key), "hex");
  const observed = Buffer.from(signature, "hex");
  return expected.length === observed.length && crypto.timingSafeEqual(expected, observed);
}

export function parse_spine_bundle_json(bundle_json: string): {
  bundle: any;
  computed_checksum: string;
} {
  const bundle = JSON.parse(bundle_json);
  if (!bundle || typeof bundle !== "object" || !bundle._meta || !bundle._manifest) {
    throw new Error("Invalid Spine bundle: missing _meta or _manifest");
  }
  const bundle_without_manifest = { ...bundle };
  delete bundle_without_manifest._manifest;
  return {
    bundle,
    computed_checksum: compute_spine_checksum(bundle_without_manifest),
  };
}

export function verify_spine_bundle(bundle_json: string): {
  bundle: any;
  verification: spine_bundle_verification;
} {
  const { bundle, computed_checksum } = parse_spine_bundle_json(bundle_json);
  const manifest = bundle._manifest ?? {};
  const warnings: string[] = [];
  const checksumValid =
    typeof manifest.checksum === "string" &&
    manifest.checksum === computed_checksum;
  if (!checksumValid) warnings.push("Bundle checksum mismatch");

  const legacyOverride =
    process.env.ALLOW_LEGACY_UNSIGNED_SPINE_RESTORE === "true";
  let signatureValid = false;
  try {
    signatureValid = verify_spine_signature(
      computed_checksum,
      manifest.signature,
    );
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }
  if (!signatureValid) {
    warnings.push(
      legacyOverride
        ? "Bundle signature is invalid or absent; explicit legacy override is active"
        : "Bundle signature is invalid or absent",
    );
  }

  const formatValid = manifest.bundleFormat === SPINE_BUNDLE_FORMAT;
  if (!formatValid) warnings.push(`Unsupported bundle format: ${String(manifest.bundleFormat ?? "legacy")}`);

  const databaseValid = manifest.databaseType === "postgresql";
  if (!databaseValid) warnings.push(`Unsupported bundle database: ${String(manifest.databaseType ?? "unknown")}`);

  const executable =
    checksumValid &&
    ((signatureValid && formatValid && databaseValid) || legacyOverride);

  return {
    bundle,
    verification: {
      checksumValid,
      signatureValid,
      formatValid,
      databaseValid,
      executable,
      legacyOverride,
      warnings,
    },
  };
}

export function create_spine_manifest(input: {
  bundleName: string;
  bundleType: spine_bundle_type;
  createdAt: number;
  appVersion: string;
  includedDirectories: string[];
  includedTables: string[];
  includedConfigs: string[];
  checksum: string;
}): spine_bundle_manifest {
  return {
    ...input,
    bundleFormat: SPINE_BUNDLE_FORMAT,
    databaseType: "postgresql",
    signatureAlgorithm: SPINE_SIGNATURE_ALGORITHM,
    signature: sign_spine_checksum(input.checksum),
  };
}
