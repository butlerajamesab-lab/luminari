import crypto from 'crypto';

/**
 * Deterministically serializes any value to a JSON string.
 * Keys in objects are recursively sorted.
 */
export function canonicalStringify(val: any): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }

  const keys = Object.keys(val).sort();
  return (
    '{' +
    keys
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(val[key])}`)
      .join(',') +
    '}'
  );
}

/**
 * Computes a SHA-256 hash of the canonicalized value.
 */
export function computeHash(val: any): string {
  const canonical = canonicalStringify(val);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Standard output structure for all engines.
 */
export interface EngineResult<T> {
  layer_version: string;
  rule_version: string;
  canonicalization_version: string;
  input_hash: string;
  output_hash: string;
  data: T;
  unresolved_dependencies: string[];
  is_sealed: boolean;
}

/**
 * Common types for handling unknown or incomplete data.
 */
export type DeterministicValue<T> = T | 'unknown' | 'unresolved' | 'contradicted' | 'incomplete' | 'referenced_missing';
