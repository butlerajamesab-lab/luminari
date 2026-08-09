import crypto from "crypto";
import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  CANONICALIZATION_VERSION,
} from "./utils";

export interface RawArtifactInput {
  filename: string;
  bytes: Buffer;
  declared_mime_type: string;
  entry_channel: string;
}

export interface ArtifactRecord {
  artifact_key: string;
  filename: string;
  sha256: string;
  byte_size: number;
  declared_mime_type: string;
  entry_channel: string;
  is_duplicate: boolean;
  duplicate_of_artifact_key: string | null;
}

export const LAYER_VERSION = "2.1.0";
export const RULE_VERSION = "2.1.0";

export const RULE_MANIFEST = {
  hash_algorithm: "sha256_raw_bytes",
  artifact_identity: "art_<first_12_hex_of_sha256>",
  duplicate_scope: "exact_sha256_only",
  mime_posture: "declared_only_parser_performs_magic_byte_detection",
} as const;
export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Layer 2 deliberately uses a compact engine-local artifact key while the
 * source registry keeps its full `sha256:<digest>` identity. Keep that mapping
 * in one function so receipt validation never compares the two namespaces as
 * if they were the same identifier.
 */
export function derive_raw_artifact_key(sha256: string): string {
  if (!SHA256_RE.test(sha256)) throw new Error("layer2_source_sha256_invalid");
  return `art_${sha256.substring(0, 12)}`;
}

export function processLayer2(
  input: RawArtifactInput,
  existing_hashes: string[] = [],
): EngineResult<ArtifactRecord> {
  const sha256 = crypto.createHash("sha256").update(input.bytes).digest("hex");
  const normalizedExistingHashes = Array.from(new Set(existing_hashes)).sort();
  const is_duplicate = normalizedExistingHashes.includes(sha256);
  const artifact_key = derive_raw_artifact_key(sha256);
  const input_hash = computeHash({
    filename: input.filename,
    sha256,
    byte_size: input.bytes.length,
    declared_mime_type: input.declared_mime_type,
    entry_channel: input.entry_channel,
    existing_hashes: normalizedExistingHashes,
  });

  const data: ArtifactRecord = {
    artifact_key,
    filename: input.filename,
    sha256,
    byte_size: input.bytes.length,
    declared_mime_type: input.declared_mime_type,
    entry_channel: input.entry_channel,
    is_duplicate,
    duplicate_of_artifact_key: is_duplicate ? artifact_key : null,
  };

  return {
    layer_name: "raw_intake_capture",
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: "N/A",
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: [],
    is_sealed: false,
  };
}
