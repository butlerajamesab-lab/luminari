import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  regexFromManifest,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { ParsedArtifact } from './parsing-substrate';

export type EntityType = 'person' | 'organization' | 'address' | 'contact' | 'unknown';

export interface Entity {
  entity_id: string;
  type: EntityType;
  canonical_name: string;
  raw_mentions: EntityMention[];
  review_candidates: ReviewCandidate[];
}

export interface EntityMention {
  raw_text: string;
  artifact_key: string;
  span_offset: number;
}

export interface ReviewCandidate {
  candidate_entity_id: string;
  similarity_type: 'levenshtein_near_match';
  distance: number;
  reason: string;
}

export interface Layer6Input {
  artifacts: ParsedArtifact[];
}

export const LAYER_VERSION = '2.1.0';
export const RULE_VERSION = '2.1.0';

const ADDRESS_STATE_ABBREVIATIONS: Record<string, string> = {
  wa: 'washington', ca: 'california', or: 'oregon', ny: 'new york', tx: 'texas',
  fl: 'florida', il: 'illinois', pa: 'pennsylvania', oh: 'ohio', az: 'arizona',
};

export const RULE_MANIFEST = {
  person_patterns: [
    { source: '\\b(Mr\\.|Mrs\\.|Ms\\.|Dr\\.|Prof\\.)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})\\b', flags: 'g' },
    { source: '\\b([A-Z][a-z]+\\s+[A-Z][a-z]+)\\b(?=\\s+(?:was|is|has been|filed|stated|reported|testified|claimed))', flags: 'g' },
  ],
  organization_patterns: [
    { source: '\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\s+(?:Inc\\.|LLC|Corp\\.|Corporation|Company|Co\\.))', flags: 'g' },
    { source: '\\b(Department\\s+of\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)(?=\\s+(?:on|in|at|for|from|to|by|with|about|the|a|an|\\d)|[,.]|$)', flags: 'g' },
    { source: '\\b(Office\\s+of\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)(?=\\s+(?:on|in|at|for|from|to|by|with|about|the|a|an|\\d)|[,.]|$)', flags: 'g' },
    { source: '\\b([A-Z]{2,}(?:\\s+[A-Z]{2,})*)\\b', flags: 'g' },
  ],
  address_pattern: {
    source: '\\b(\\d{1,5}\\s+[A-Z][a-z]+(?:\\s+[A-Z]?[a-z]+)*\\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Cir)\\.?(?:\\s*,\\s*[A-Z][a-z]+(?:\\s+[A-Z]?[a-z]+)*)?(?:\\s*,\\s*[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?)?)\\b',
    flags: 'g',
  },
  phone_pattern: { source: '\\b(\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4})\\b', flags: 'g' },
  email_pattern: { source: '\\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})\\b', flags: 'g' },
  address_state_abbreviations: ADDRESS_STATE_ABBREVIATIONS,
  organization_abbreviation_expansion: false,
  exact_normalized_match_auto_merge: true,
  levenshtein_review_threshold: 2,
  near_match_auto_merge: false,
} as const;

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

const PERSON_PATTERNS = RULE_MANIFEST.person_patterns.map(regexFromManifest);
const ORG_PATTERNS = RULE_MANIFEST.organization_patterns.map(regexFromManifest);
const ADDRESS_PATTERN = regexFromManifest(RULE_MANIFEST.address_pattern);
const PHONE_PATTERN = regexFromManifest(RULE_MANIFEST.phone_pattern);
const EMAIL_PATTERN = regexFromManifest(RULE_MANIFEST.email_pattern);

export function processLayer6(input: Layer6Input): EngineResult<Entity[]> {
  const artifacts = [...input.artifacts].sort((a, b) => a.artifact_key.localeCompare(b.artifact_key));
  const parser_version = parserVersion(artifacts);
  const input_hash = computeHash({
    artifacts: artifacts.map(artifact => ({
      artifact_key: artifact.artifact_key,
      raw_bytes_sha256: artifact.raw_bytes_sha256,
      parser_version: artifact.parser_version,
      extraction_status: artifact.extraction_status,
      parsed_output_hash: computeHash({ extracted_text: artifact.extracted_text, spans: artifact.spans }),
    })),
  });
  const unresolved: UnresolvedDependency[] = [];
  const entityMap = new Map<string, Entity>();

  for (const artifact of artifacts) {
    if (artifact.extraction_status !== 'success') {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}`,
        reason: artifact.extraction_status === 'unsupported_format' ? 'unsupported_format' : 'incomplete',
        detail: `Entity extraction cannot run against artifact state ${artifact.extraction_status}`,
      });
      continue;
    }
    const text = artifact.extracted_text;

    for (const pattern of PERSON_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const rawName = match[0].replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+/, '');
        addEntity(entityMap, rawName, 'person', artifact.artifact_key, match.index);
      }
    }

    for (const pattern of ORG_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const rawName = match[1];
        if (!rawName || rawName.length <= 2) continue;
        addEntity(entityMap, rawName, 'organization', artifact.artifact_key, match.index);
      }
    }

    ADDRESS_PATTERN.lastIndex = 0;
    let addressMatch: RegExpExecArray | null;
    while ((addressMatch = ADDRESS_PATTERN.exec(text)) !== null) {
      addEntity(entityMap, addressMatch[1], 'address', artifact.artifact_key, addressMatch.index);
    }

    PHONE_PATTERN.lastIndex = 0;
    let phoneMatch: RegExpExecArray | null;
    while ((phoneMatch = PHONE_PATTERN.exec(text)) !== null) {
      addEntity(entityMap, phoneMatch[1], 'contact', artifact.artifact_key, phoneMatch.index);
    }

    EMAIL_PATTERN.lastIndex = 0;
    let emailMatch: RegExpExecArray | null;
    while ((emailMatch = EMAIL_PATTERN.exec(text)) !== null) {
      addEntity(entityMap, emailMatch[1], 'contact', artifact.artifact_key, emailMatch.index);
    }
  }

  const entities = Array.from(entityMap.values()).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      if (a.type !== b.type) continue;
      const distance = levenshtein(a.canonical_name, b.canonical_name);
      if (distance <= 0 || distance > RULE_MANIFEST.levenshtein_review_threshold) continue;
      a.review_candidates.push({
        candidate_entity_id: b.entity_id,
        similarity_type: 'levenshtein_near_match',
        distance,
        reason: `"${a.canonical_name}" and "${b.canonical_name}" are review-only near matches at distance ${distance}`,
      });
      b.review_candidates.push({
        candidate_entity_id: a.entity_id,
        similarity_type: 'levenshtein_near_match',
        distance,
        reason: `"${b.canonical_name}" and "${a.canonical_name}" are review-only near matches at distance ${distance}`,
      });
    }
  }

  for (const entity of entities) {
    entity.raw_mentions = dedupeMentions(entity.raw_mentions);
    entity.review_candidates.sort((a, b) => a.candidate_entity_id.localeCompare(b.candidate_entity_id));
  }

  return {
    layer_name: 'entity_registry',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version,
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(entities),
    data: entities,
    unresolved_dependencies: unresolved.sort((a, b) => a.field.localeCompare(b.field)),
    is_sealed: false,
  };
}

function normalizeEntityName(name: string, type: EntityType): string {
  let normalized = name.trim().replace(/\s+/g, ' ');
  if (type === 'address') {
    for (const [abbr, full] of Object.entries(ADDRESS_STATE_ABBREVIATIONS)) {
      normalized = normalized.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
    }
  }
  return normalized.toLowerCase();
}

function addEntity(
  map: Map<string, Entity>,
  rawName: string,
  type: EntityType,
  artifactKey: string,
  offset: number,
): void {
  const canonical = normalizeEntityName(rawName, type);
  if (canonical.length < 2) return;
  const mapKey = `${type}|${canonical}`;
  const mention: EntityMention = { raw_text: rawName, artifact_key: artifactKey, span_offset: offset };
  const existing = map.get(mapKey);
  if (existing) {
    existing.raw_mentions.push(mention);
    return;
  }
  map.set(mapKey, {
    entity_id: `ent_${computeHash({ type, canonical_name: canonical }).substring(0, 16)}`,
    type,
    canonical_name: canonical,
    raw_mentions: [mention],
    review_candidates: [],
  });
}

function dedupeMentions(mentions: EntityMention[]): EntityMention[] {
  const map = new Map<string, EntityMention>();
  for (const mention of mentions) {
    map.set(`${mention.artifact_key}|${mention.span_offset}|${mention.raw_text}`, mention);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.artifact_key.localeCompare(b.artifact_key) || a.span_offset - b.span_offset || a.raw_text.localeCompare(b.raw_text),
  );
}

function parserVersion(artifacts: ParsedArtifact[]): string {
  const versions = Array.from(new Set(artifacts.map(artifact => artifact.parser_version))).sort();
  return versions.length === 0 ? 'N/A' : versions.join('|');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
