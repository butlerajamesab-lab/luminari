import crypto from 'crypto';

// ─── Canonical Serialization ─────────────────────────────────────────────────

/**
 * Recursively key-sorted JSON serialization.
 * Produces identical strings for semantically equivalent objects
 * regardless of insertion order.
 */
export function canonicalStringify(val: unknown): string {
  if (val === null || val === undefined) return JSON.stringify(val);
  if (typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',') + '}';
}

/**
 * SHA-256 hash of the canonical JSON representation.
 * Used for input_hash and output_hash computation.
 */
export function computeHash(val: unknown): string {
  const canonical = canonicalStringify(val);
  return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

// ─── Engine Contract Types ───────────────────────────────────────────────────

/**
 * Every layer engine returns this structure.
 * Y = F_v(X, R) — same X + R + v → identical Y and output_hash.
 */
export interface EngineResult<T> {
  layer_name: string;
  layer_version: string;
  rule_version: string;
  parser_version: string;
  canonicalization_version: string;
  input_hash: string;
  output_hash: string;
  data: T;
  unresolved_dependencies: UnresolvedDependency[];
  is_sealed: boolean;
}

export interface UnresolvedDependency {
  field: string;
  reason: 'unknown' | 'unresolved' | 'contradicted' | 'incomplete' | 'referenced_missing' | 'unsupported_format';
  detail?: string;
}

/**
 * First-class status for any value that may be incomplete or contested.
 * NEVER silently promote these to positive facts.
 */
export type FactStatus =
  | 'user_reported'
  | 'document_stated'
  | 'supported_by_one_source'
  | 'supported_by_multiple_sources'
  | 'contradicted'
  | 'disputed'
  | 'incomplete'
  | 'unresolved'
  | 'referenced_missing';

// ─── Constants ───────────────────────────────────────────────────────────────

export const CANONICALIZATION_VERSION = '2.0.0';
