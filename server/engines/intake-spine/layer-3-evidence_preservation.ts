import { computeHash, EngineResult } from './utils';
import { ArtifactRecord } from './layer-2-raw_intake_capture';

export interface PreservationInput {
  record: ArtifactRecord;
  actual_bytes: Buffer | null;
}

export interface PreservationOutput {
  artifact_key: string;
  artifact_status: 'preserved' | 'quarantined' | 'referenced_missing';
  verification_timestamp: string;
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

export function processLayer3(input: PreservationInput): EngineResult<PreservationOutput> {
  const input_hash = computeHash({
    artifact_key: input.record.artifact_key,
    expected_sha256: input.record.sha256,
    has_bytes: !!input.actual_bytes
  });

  let status: 'preserved' | 'quarantined' | 'referenced_missing';

  if (!input.actual_bytes) {
    status = 'referenced_missing';
  } else {
    const actual_sha256 = computeHash(input.actual_bytes.toString('binary'));
    status = actual_sha256 === input.record.sha256 ? 'preserved' : 'quarantined';
  }

  const data: PreservationOutput = {
    artifact_key: input.record.artifact_key,
    artifact_status: status,
    verification_timestamp: new Date('2026-08-07T00:00:00Z').toISOString() // Deterministic for engine
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
