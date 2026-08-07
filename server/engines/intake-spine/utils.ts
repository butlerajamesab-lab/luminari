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
 * Used for output_hash computation and data identity.
 */
export function computeHash(val: unknown): string {
  const canonical = canonicalStringify(val);
  return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/**
 * Compute the execution-contract input_hash.
 * 
 * The live unique identity for a sealed layer run is:
 *   session + layer_name + layer_version + input_hash
 * 
 * Therefore input_hash must include the full execution envelope so that
 * changing ONLY a rule version produces a different run identity:
 *   canonical_input + layer_version + rule_version + rule_manifest_hash + parser_version + canonicalization_version
 * 
 * This prevents collisions when the same data is re-processed with updated rules.
 */
export function computeExecutionHash(envelope: {
  canonical_input: unknown;
  layer_version: string;
  rule_version: string;
  rule_manifest_hash: string;
  parser_version: string;
  canonicalization_version: string;
}): string {
  return computeHash({
    canonical_input: envelope.canonical_input,
    layer_version: envelope.layer_version,
    rule_version: envelope.rule_version,
    rule_manifest_hash: envelope.rule_manifest_hash,
    parser_version: envelope.parser_version,
    canonicalization_version: envelope.canonicalization_version,
  });
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

/**
 * Named canonicalizer matching the live intake_layer_runs contract.
 * NOT a bare semver — the live spine accepts these exact strings.
 */
export const CANONICALIZATION_VERSION = 'luminari.intake.canonical-json.v2';
