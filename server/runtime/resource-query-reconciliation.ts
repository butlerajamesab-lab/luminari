export interface ResourceSourceTraversalContract {
  baseTable: 'normalized_civic_resource';
  foreignKey: 'source_id';
  foreignTable: 'api_source_registry';
  foreignKeyTarget: 'id';
  canonicalFilterField: 'source_key';
}

export const RESOURCE_SOURCE_TRAVERSAL_CONTRACT: ResourceSourceTraversalContract = {
  baseTable: 'normalized_civic_resource',
  foreignKey: 'source_id',
  foreignTable: 'api_source_registry',
  foreignKeyTarget: 'id',
  canonicalFilterField: 'source_key',
};

export function resolveResourceSourceTraversal(sourceKey: string) {
  return {
    from: 'normalized_civic_resource',
    select: `
      *,
      api_source_registry!inner(
        source_key,
        name
      )
    `,
    filter: {
      field: 'api_source_registry.source_key',
      operator: 'eq',
      value: sourceKey,
    },
  };
}

export function classifyResourceQueryDrift(query: string) {
  if (query.includes('source_key=') && !query.includes('api_source_registry')) {
    return {
      driftType: 'stale_join_assumption',
      status: 'drifted',
      remediation:
        'Replace local source_key filtering with canonical FK traversal',
    };
  }

  return {
    driftType: 'verified',
    status: 'verified',
    remediation: null,
  };
}
