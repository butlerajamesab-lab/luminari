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
  return {
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
}

export function normalizeLensRegistry(input: any): CanonicalLensRegistry {
  return {
    structural_lenses: Array.isArray(input?.structural_lenses)
      ? input.structural_lenses
      : [],
    interpretive_lenses: Array.isArray(input?.interpretive_lenses)
      ? input.interpretive_lenses
      : [],
  };
}

export function validateRegistryIterability(registry: any, key: string) {
  return Array.isArray(registry?.[key]);
}

export function classifyRegistryDrift(registry: any) {
  const failures: string[] = [];

  if (!Array.isArray(registry?.all_canonical_ids)) {
    failures.push('missing_all_canonical_ids');
  }

  if (!Array.isArray(registry?.preserved_legacy_types)) {
    failures.push('missing_preserved_legacy_types');
  }

  if (!Array.isArray(registry?.structural_lenses)) {
    failures.push('missing_structural_lenses');
  }

  if (!Array.isArray(registry?.interpretive_lenses)) {
    failures.push('missing_interpretive_lenses');
  }

  return {
    status: failures.length === 0 ? 'verified' : 'drifted',
    failures,
  };
}
