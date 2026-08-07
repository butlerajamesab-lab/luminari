import { computeHash, EngineResult } from './utils';
import { ChronologyEvent } from './layer-4-chronology_reconstruction';

export type VerificationState = 
  | 'user_reported' 
  | 'document_stated' 
  | 'supported_by_one_source' 
  | 'supported_by_multiple_sources' 
  | 'contradicted' 
  | 'disputed' 
  | 'incomplete' 
  | 'unresolved';

export interface VerificationRecord {
  fact_id: string;
  verification_state: VerificationState;
  source_refs: string[];
  contradiction_refs: string[];
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

export function processLayer5(events: ChronologyEvent[]): EngineResult<VerificationRecord[]> {
  const input_hash = computeHash(events);
  
  // Group events by "fact identity" (date + event_text)
  const factGroups = new Map<string, ChronologyEvent[]>();
  for (const event of events) {
    const factIdentity = `${event.date}|${event.event_text}`;
    const group = factGroups.get(factIdentity) || [];
    group.push(event);
    factGroups.set(factIdentity, group);
  }

  const records: VerificationRecord[] = [];

  for (const [identity, group] of factGroups.entries()) {
    const sourceRefs = Array.from(new Set(group.map(e => e.source_artifact_id)));
    let state: VerificationState = 'document_stated';

    if (sourceRefs.length >= 2) {
      state = 'supported_by_multiple_sources';
    } else if (sourceRefs.length === 1) {
      state = 'supported_by_one_source';
    }

    records.push({
      fact_id: `fact_${computeHash(identity).substring(0, 8)}`,
      verification_state: state,
      source_refs: sourceRefs,
      contradiction_refs: []
    });
  }

  const output_hash = computeHash(records);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: records,
    unresolved_dependencies: [],
    is_sealed: false
  };
}
