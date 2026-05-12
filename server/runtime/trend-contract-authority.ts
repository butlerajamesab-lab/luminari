export interface CanonicalTrendActivityContract {
  canonicalActivitySemantic: 'active' | 'inactive' | 'derived';
  sourceFields: string[];
  derivationStrategy:
    | 'boolean_field'
    | 'status_field'
    | 'temporal_window'
    | 'derived_runtime';
}

export interface TrendActivityResolution {
  canonical: CanonicalTrendActivityContract;
  staleAliases: string[];
  classification:
    | 'stale_field_assumption'
    | 'semantic_authority_fragmentation';
}

const TREND_ACTIVITY_CONTRACT: CanonicalTrendActivityContract = {
  canonicalActivitySemantic: 'derived',
  sourceFields: ['status', 'updated_at', 'created_at'],
  derivationStrategy: 'derived_runtime',
};

export function resolveTrendActiveContract(): TrendActivityResolution {
  return {
    canonical: TREND_ACTIVITY_CONTRACT,
    staleAliases: ['is_current', 'active', 'current_flag'],
    classification: 'semantic_authority_fragmentation',
  };
}

export function classifyTrendFieldDrift(field: string) {
  const staleAliases = ['is_current', 'active', 'current_flag'];

  if (staleAliases.includes(field)) {
    return {
      status: 'drifted',
      classification: 'stale_field_assumption',
      remediation:
        'Resolve activity semantics through resolveTrendActiveContract()',
    };
  }

  return {
    status: 'verified',
    classification: 'verified',
    remediation: null,
  };
}

export function deriveCanonicalTrendActivity(input: {
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}) {
  if (input.status === 'active') {
    return true;
  }

  if (input.status === 'inactive') {
    return false;
  }

  return input.updated_at !== null || input.created_at !== null;
}
