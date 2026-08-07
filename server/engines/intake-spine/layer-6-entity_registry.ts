import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { ParsedArtifact, TextSpan } from './parsing-substrate';

// ─── Types ───────────────────────────────────────────────────────────────────

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

/**
 * Near-matches that MIGHT be the same entity but cannot be auto-merged.
 * These are presented for human review only.
 */
export interface ReviewCandidate {
  candidate_entity_id: string;
  similarity_type: 'levenshtein_near_match';
  distance: number;
  reason: string;
}

export interface Layer6Input {
  artifacts: ParsedArtifact[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

// Domain-scoped jurisdiction abbreviations ONLY
// These are safe because they have one canonical expansion in legal/civic context
const JURISDICTION_ABBREVIATIONS: Record<string, string> = {
  'wa': 'washington',
  'ca': 'california',
  'or': 'oregon',
  'ny': 'new york',
  'tx': 'texas',
  'fl': 'florida',
  'il': 'illinois',
  'pa': 'pennsylvania',
  'oh': 'ohio',
  'az': 'arizona',
};

// ─── Extraction Patterns ─────────────────────────────────────────────────────

// Person patterns: Title + Name, or role-labeled names
const PERSON_PATTERNS = [
  /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g,
  /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b(?=\s+(?:was|is|has been|filed|stated|reported|testified|claimed))/g,
];

// Organization patterns
const ORG_PATTERNS = [
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc\.|LLC|Corp\.|Corporation|Company|Co\.))/g,
  // Department/Office patterns: stop at prepositions, dates, lowercase words that aren't part of the name
  /\b(Department\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s+(?:on|in|at|for|from|to|by|with|about|the|a|an|\d)|[,.]|$)/g,
  /\b(Office\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s+(?:on|in|at|for|from|to|by|with|about|the|a|an|\d)|[,.]|$)/g,
  /\b([A-Z]{2,}(?:\s+[A-Z]{2,})*)\b/g, // Acronyms like DSHS, EEOC, HUD
];

// Address patterns
const ADDRESS_PATTERN = /\b(\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Cir)\.?(?:\s*,\s*[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*)?(?:\s*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?)\b/g;

// Contact patterns
const PHONE_PATTERN = /\b(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;
const EMAIL_PATTERN = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Layer 6: Entity Registry
 * 
 * Identifies and normalizes all named entities from parsed artifacts.
 * Deduplication is exact-match on normalized name only.
 * Near-matches (Levenshtein ≤ 2) create review candidates — NEVER auto-merged.
 * Abbreviation normalization is domain-scoped (jurisdictions only).
 */
export function processLayer6(input: Layer6Input): EngineResult<Entity[]> {
  const input_hash = computeHash({ artifacts: input.artifacts.map(a => a.raw_bytes_sha256) });
  const unresolved: UnresolvedDependency[] = [];

  const entityMap = new Map<string, Entity>();

  for (const artifact of input.artifacts) {
    if (artifact.extraction_status !== 'success') {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}`,
        reason: artifact.extraction_status === 'unsupported_format' ? 'unsupported_format' : 'incomplete',
        detail: `Cannot extract entities from ${artifact.extraction_status} artifact`,
      });
      continue;
    }

    const text = artifact.extracted_text;

    // Extract persons
    for (const pattern of PERSON_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const rawName = match[0].replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+/, '');
        addEntity(entityMap, rawName, 'person', artifact.artifact_key, match.index);
      }
    }

    // Extract organizations
    for (const pattern of ORG_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const rawName = match[1];
        // Filter out very short acronyms that are likely false positives
        if (rawName.length <= 2) continue;
        addEntity(entityMap, rawName, 'organization', artifact.artifact_key, match.index);
      }
    }

    // Extract addresses
    ADDRESS_PATTERN.lastIndex = 0;
    let addrMatch: RegExpExecArray | null;
    while ((addrMatch = ADDRESS_PATTERN.exec(text)) !== null) {
      addEntity(entityMap, addrMatch[1], 'address', artifact.artifact_key, addrMatch.index);
    }

    // Extract contacts (phone/email)
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

  // Build review candidates (Levenshtein ≤ 2 between different entities)
  const entities = Array.from(entityMap.values());
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      if (a.type !== b.type) continue; // Only compare same-type entities
      const dist = levenshtein(a.canonical_name, b.canonical_name);
      if (dist > 0 && dist <= 2) {
        a.review_candidates.push({
          candidate_entity_id: b.entity_id,
          similarity_type: 'levenshtein_near_match',
          distance: dist,
          reason: `"${a.canonical_name}" vs "${b.canonical_name}" (distance: ${dist})`,
        });
        b.review_candidates.push({
          candidate_entity_id: a.entity_id,
          similarity_type: 'levenshtein_near_match',
          distance: dist,
          reason: `"${b.canonical_name}" vs "${a.canonical_name}" (distance: ${dist})`,
        });
      }
    }
  }

  // Sort for deterministic output
  const sortedEntities = entities.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const output_hash = computeHash(sortedEntities);

  return {
    layer_name: 'entity_registry',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash,
    data: sortedEntities,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEntityName(name: string, type: EntityType): string {
  let n = name.trim();
  
  // Only apply jurisdiction abbreviation expansion for organizations/addresses
  if (type === 'organization' || type === 'address') {
    // Only expand standalone state abbreviations at word boundaries
    for (const [abbr, full] of Object.entries(JURISDICTION_ABBREVIATIONS)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      n = n.replace(regex, full);
    }
  }

  // Normalize whitespace
  n = n.replace(/\s+/g, ' ').trim();
  
  // Lowercase for canonical comparison
  return n.toLowerCase();
}

function addEntity(
  map: Map<string, Entity>,
  rawName: string,
  type: EntityType,
  artifactKey: string,
  offset: number
): void {
  const canonical = normalizeEntityName(rawName, type);
  if (canonical.length < 2) return; // Skip single-char "entities"

  const existing = map.get(canonical);
  if (existing) {
    existing.raw_mentions.push({ raw_text: rawName, artifact_key: artifactKey, span_offset: offset });
  } else {
    map.set(canonical, {
      entity_id: `ent_${computeHash(canonical)}`.substring(0, 12),
      type,
      canonical_name: canonical,
      raw_mentions: [{ raw_text: rawName, artifact_key: artifactKey, span_offset: offset }],
      review_candidates: [],
    });
  }
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
