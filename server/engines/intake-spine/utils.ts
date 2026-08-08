import crypto from 'crypto';

// ─── Canonical Serialization ─────────────────────────────────────────────────

/**
 * Canonical JSON serializer used only for values that are valid JSON.
 *
 * JavaScript `undefined`, functions, symbols, bigint, NaN, and Infinity are
 * not valid PostgreSQL jsonb values. Silently serializing any of them would
 * create a JS-only digest that the v3 PostgreSQL verifier must reject. Fail
 * before persistence instead.
 *
 * Object keys are recursively sorted. Array order is preserved because arrays
 * may be semantically ordered; callers must sort set-like arrays explicitly.
 */
export function canonicalStringify(val: unknown): string {
  if (val === undefined) {
    throw new Error('intake_canonicalization_undefined_not_allowed');
  }
  if (typeof val === 'function' || typeof val === 'symbol' || typeof val === 'bigint') {
    throw new Error(`intake_canonicalization_${typeof val}_not_allowed`);
  }
  if (typeof val === 'number' && !Number.isFinite(val)) {
    throw new Error('intake_canonicalization_nonfinite_number_not_allowed');
  }
  if (val === null) return 'null';
  if (typeof val !== 'object') {
    const rendered = JSON.stringify(val);
    if (rendered === undefined) {
      throw new Error('intake_canonicalization_unrenderable_value');
    }
    return rendered;
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',') + '}';
}

/** SHA-256 hash of the canonical JSON representation. */
export function computeHash(val: unknown): string {
  const canonical = canonicalStringify(val);
  return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

export type SerializableRegex = {
  source: string;
  flags: string;
};

/** Serialize RegExp rule data without relying on engine-specific object shape. */
export function serializeRegex(regex: RegExp): SerializableRegex {
  return { source: regex.source, flags: regex.flags };
}

/** Build a RegExp from a manifest-owned serialized form. */
export function regexFromManifest(regex: SerializableRegex): RegExp {
  return new RegExp(regex.source, regex.flags);
}

/** Hash the exact rule data consumed by a governed engine. */
export function computeRuleManifestHash(manifest: unknown): string {
  return computeHash(manifest);
}

/**
 * Compute the execution-contract input_hash.
 *
 * Live sealed identity is session + layer_name + layer_version + input_hash.
 * input_hash therefore includes R/v explicitly so a rule-only change cannot
 * collide with an older run.
 */
export function computeExecutionHash(envelope: {
  canonical_input: unknown;
  layer_version: string;
  rule_version: string;
  rule_manifest_hash: string;
  parser_version: string;
  canonicalization_version: string;
}): string {
  if (!/^[0-9a-f]{64}$/.test(envelope.rule_manifest_hash)) {
    throw new Error('intake_execution_rule_manifest_hash_required');
  }
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

/** Every layer engine returns this structure. */
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

/** First-class status for any value that may be incomplete or contested. */
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

/** Exact live identifier accepted by the Universal Intake Spine v3 verifier. */
export const CANONICALIZATION_VERSION = 'luminari.intake.canonical-json.v2';
