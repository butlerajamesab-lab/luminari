import crypto from 'crypto';
import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { ArtifactRecord } from './layer-2-raw_intake_capture';

export interface PreservationResult {
  artifact_key: string;
  stored_sha256: string;
  verified_sha256: string;
  integrity_status: 'preserved' | 'quarantined' | 'referenced_missing';
  verification_timestamp: string;
}

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

export function processLayer3(input: { record: ArtifactRecord; actual_bytes: Buffer | null }, as_of: string): EngineResult<PreservationResult> {
  const input_hash = computeHash({ artifact_key: input.record.artifact_key, stored_sha256: input.record.sha256, as_of });
  const unresolved: UnresolvedDependency[] = [];

  let integrity_status: PreservationResult['integrity_status'];
  let verified_sha256: string;

  if (!input.actual_bytes) {
    integrity_status = 'referenced_missing';
    verified_sha256 = '';
    unresolved.push({ field: 'actual_bytes', reason: 'referenced_missing', detail: 'Artifact bytes not available for verification' });
  } else {
    verified_sha256 = crypto.createHash('sha256').update(input.actual_bytes).digest('hex');
    integrity_status = verified_sha256 === input.record.sha256 ? 'preserved' : 'quarantined';
    if (integrity_status === 'quarantined') {
      unresolved.push({ field: 'sha256', reason: 'contradicted', detail: `Stored: ${input.record.sha256}, Verified: ${verified_sha256}` });
    }
  }

  const data: PreservationResult = {
    artifact_key: input.record.artifact_key,
    stored_sha256: input.record.sha256,
    verified_sha256,
    integrity_status,
    verification_timestamp: as_of,
  };

  return {
    layer_name: 'evidence_preservation',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}
