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

type spine_unsigned_manifest = Omit<spine_bundle_manifest, "signature">;

export type spine_bundle_verification = {
  checksumValid: boolean;
  signatureValid: boolean;
  metadataValid: boolean;
  formatValid: boolean;
  databaseValid: boolean;
  executable: boolean;
  legacyOverride: boolean;
  warnings: string[];
};

const SPINE_BUNDLE_TYPES = new Set<spine_bundle_type>([
  "full",
  "schema",
  "config",
  "deployment",
]);

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

/**
 * Historical compatibility helper. New bundles sign the complete unsigned
 * manifest through sign_spine_manifest so identity and inventory metadata are
 * authenticated together with the body checksum.
 */
export function sign_spine_checksum(
  checksum: string,
  key = get_spine_signing_key(),
): string {
  return crypto.createHmac("sha256", key).update(checksum).digest("hex");
}

/** Historical compatibility helper for checksum-only signatures. */
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

function is_string_array(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalize_unsigned_manifest(value: unknown): spine_unsigned_manifest | null {
  const manifest = value as Record<string, unknown> | null;
  if (!manifest || typeof manifest !== "object") return null;
  if (typeof manifest.bundleName !== "string" || manifest.bundleName.length === 0) return null;
  if (typeof manifest.bundleType !== "string" || !SPINE_BUNDLE_TYPES.has(manifest.bundleType as spine_bundle_type)) return null;
  if (typeof manifest.bundleFormat !== "string") return null;
  if (manifest.databaseType !== "postgresql") return null;
  if (typeof manifest.createdAt !== "number" || !Number.isFinite(manifest.createdAt)) return null;
  if (typeof manifest.appVersion !== "string") return null;
  if (!is_string_array(manifest.includedDirectories)) return null;
  if (!is_string_array(manifest.includedTables)) return null;
  if (!is_string_array(manifest.includedConfigs)) return null;
  if (typeof manifest.checksum !== "string" || !/^[a-f0-9]{64}$/i.test(manifest.checksum)) return null;
  if (manifest.signatureAlgorithm !== SPINE_SIGNATURE_ALGORITHM) return null;

  return {
    bundleName: manifest.bundleName,
    bundleType: manifest.bundleType as spine_bundle_type,
    bundleFormat: manifest.bundleFormat,
    databaseType: "postgresql",
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    includedDirectories: [...manifest.includedDirectories],
    includedTables: [...manifest.includedTables],
    includedConfigs: [...manifest.includedConfigs],
    checksum: manifest.checksum,
    signatureAlgorithm: SPINE_SIGNATURE_ALGORITHM,
  };
}

export function sign_spine_manifest(
  manifest: spine_unsigned_manifest,
  key = get_spine_signing_key(),
): string {
  const normalized = normalize_unsigned_manifest(manifest);
  if (!normalized) {
    throw new Error("Cannot sign invalid Sovereign Spine manifest metadata");
  }
  return crypto
    .createHmac("sha256", key)
    .update(stringify_spine_json(normalized, 0))
    .digest("hex");
}

export function verify_spine_manifest_signature(
  manifest: unknown,
  signature: unknown,
  key = get_spine_signing_key(),
): boolean {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const normalized = normalize_unsigned_manifest(manifest);
  if (!normalized) return false;
  const expected = Buffer.from(sign_spine_manifest(normalized, key), "hex");
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

function verify_manifest_metadata(bundle: any, manifest: any): boolean {
  const meta = bundle?._meta;
  if (!meta || typeof meta !== "object") return false;
  return (
    meta.bundleName === manifest.bundleName &&
    meta.bundleType === manifest.bundleType &&
    meta.bundleFormat === manifest.bundleFormat &&
    meta.databaseType === manifest.databaseType &&
    meta.createdAt === manifest.createdAt &&
    meta.appVersion === manifest.appVersion
  );
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

  const metadataValid = verify_manifest_metadata(bundle, manifest);
  if (!metadataValid) warnings.push("Bundle identity metadata does not match its signed manifest");

  const legacyOverride =
    process.env.ALLOW_LEGACY_UNSIGNED_SPINE_RESTORE === "true";
  let signatureValid = false;
  try {
    const unsignedManifest = { ...manifest };
    delete unsignedManifest.signature;
    signatureValid = verify_spine_manifest_signature(
      unsignedManifest,
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
    ((signatureValid && metadataValid && formatValid && databaseValid) || legacyOverride);

  return {
    bundle,
    verification: {
      checksumValid,
      signatureValid,
      metadataValid,
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
  const unsignedManifest: spine_unsigned_manifest = {
    ...input,
    bundleFormat: SPINE_BUNDLE_FORMAT,
    databaseType: "postgresql",
    signatureAlgorithm: SPINE_SIGNATURE_ALGORITHM,
  };
  return {
    ...unsignedManifest,
    signature: sign_spine_manifest(unsignedManifest),
  };
}
