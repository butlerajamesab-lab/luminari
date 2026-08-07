import { computeHash, EngineResult } from './utils';
import { ParsedArtifact } from './parsing-substrate';

export interface Entity {
  entity_id: string;
  type: 'person' | 'organization' | 'address' | 'contact';
  name: string;
  normalized_name: string;
  source_refs: string[];
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

// Simple normalization: trim, lowercase, common abbreviations
function normalize(name: string): string {
  let n = name.trim().toLowerCase();
  n = n.replace(/\bdept\b/g, 'department');
  n = n.replace(/\bwa\b/g, 'washington');
  return n;
}

export function processLayer6(artifacts: ParsedArtifact[]): EngineResult<Entity[]> {
  const input_hash = computeHash(artifacts.map(a => a.sha256));
  const entityMap = new Map<string, Entity>();

  // Simple regex for entities (this is a placeholder for the real engine logic)
  const ORG_REGEX = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc\.|LLC|Corp\.|Department of [A-Z][a-z]+))\b/g;

  for (const artifact of artifacts) {
    let match;
    while ((match = ORG_REGEX.exec(artifact.extracted_text)) !== null) {
      const rawName = match[1];
      const normalized = normalize(rawName);
      const existing = entityMap.get(normalized);

      if (existing) {
        if (!existing.source_refs.includes(artifact.artifact_key)) {
          existing.source_refs.push(artifact.artifact_key);
        }
      } else {
        entityMap.set(normalized, {
          entity_id: `ent_${computeHash(normalized).substring(0, 8)}`,
          type: 'organization',
          name: rawName,
          normalized_name: normalized,
          source_refs: [artifact.artifact_key]
        });
      }
    }
  }

  const entities = Array.from(entityMap.values()).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const output_hash = computeHash(entities);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: entities,
    unresolved_dependencies: [],
    is_sealed: false
  };
}
