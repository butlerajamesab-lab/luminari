export interface CanonicalPipelineRegistry {
  all_canonical_ids: string[];
  preserved_legacy_types: string[];
  categories: Record<string, unknown>;
}

export interface CanonicalLensRegistry {
  structural_lenses: unknown[];
  interpretive_lenses: unknown[];
}

export function normalizePipelineRegistry(input: any): CanonicalPipelineRegistry {
  const normalized = {
    all_canonical_ids: Array.isArray(input?.all_canonical_ids)
      ? input.all_canonical_ids
      : [],
    preserved_legacy_types: Array.isArray(input?.preserved_legacy_types)
      ? input.preserved_legacy_types
      : [],
    categories:
      input?.categories && typeof input.categories === 'object'
        ? input.categories
        : {},
  };

  console.log('[Registry Governance] Pipeline registry normalized');

  return normalized;
}

export function normalizeLensRegistry(input: any): CanonicalLensRegistry {
  const normalized = {
    structural_lenses: Array.isArray(input?.structural_lenses)
      ? input.structural_lenses
      : [],
    interpretive_lenses: Array.isArray(input?.interpretive_lenses)
      ? input.interpretive_lenses
      : [],
  };

  console.log('[Registry Governance] Lens registry normalized');

  return normalized;
}

export function validateRegistryIterability(registry: any, key: string) {
  const valid = Array.isArray(registry?.[key]);

  if (!valid) {
    console.error(
      `[Registry Governance] Iterable validation failed for ${key}`
    );

    throw new Error(
      `[Registry Governance] Invalid iterable contract for ${key}`
    );
  }

  console.log('[Registry Governance] Iterable validation passed');

  return true;
}

export function recordRegistryDrift(event: {
  classification: string;
  source: string;
  detail: string;
}) {
  console.warn('[Registry Governance Drift]', {
    classification: event.classification,
    source: event.source,
    detail: event.detail,
    timestamp: new Date().toISOString(),
  });
}
