import { computeHash, EngineResult } from './utils';

export interface RawArtifactInput {
  filename: string;
  bytes: Buffer;
  mime_type: string;
}

export interface ArtifactRecord {
  artifact_key: string;
  artifact_type: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
  storage_path: string;
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

export function processLayer2(input: RawArtifactInput): EngineResult<ArtifactRecord> {
  // Deterministic Logic: SHA-256 of raw bytes
  const sha256 = computeHash(input.bytes.toString('binary'));
  const input_hash = computeHash({
    filename: input.filename,
    sha256,
    mime_type: input.mime_type
  });

  const data: ArtifactRecord = {
    artifact_key: `art_${sha256.substring(0, 12)}`,
    artifact_type: 'document',
    sha256,
    byte_size: input.bytes.length,
    mime_type: input.mime_type,
    storage_path: `artifacts/${sha256}.bin`
  };

  const output_hash = computeHash(data);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data,
    unresolved_dependencies: [],
    is_sealed: false
  };
}
