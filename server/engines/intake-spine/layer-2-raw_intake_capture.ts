import crypto from 'crypto';
import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';

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
  mime_type: string;
  entry_channel: string;
  is_duplicate: boolean;
  duplicate_of?: string;
}

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

export function processLayer2(input: RawArtifactInput, existing_hashes: string[] = []): EngineResult<ArtifactRecord> {
  const sha256 = crypto.createHash('sha256').update(input.bytes).digest('hex');
  const is_duplicate = existing_hashes.includes(sha256);
  const artifact_key = `art_${sha256.substring(0, 12)}`;
  const input_hash = computeHash({ filename: input.filename, sha256, byte_size: input.bytes.length, mime_type: input.declared_mime_type });

  const data: ArtifactRecord = {
    artifact_key,
    filename: input.filename,
    sha256,
    byte_size: input.bytes.length,
    mime_type: input.declared_mime_type,
    entry_channel: input.entry_channel,
    is_duplicate,
    duplicate_of: is_duplicate ? artifact_key : undefined,
  };

  return {
    layer_name: 'raw_intake_capture',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: [],
    is_sealed: false,
  };
}
