export interface SignalTraversalContract {
  baseTable: 'detected_signals';
  canonicalSeverityField: 'severity';
  canonicalClusterField: 'cluster_id';
  canonicalStatusField: 'status';
}

export const SIGNAL_TRAVERSAL_CONTRACT: SignalTraversalContract = {
  baseTable: 'detected_signals',
  canonicalSeverityField: 'severity',
  canonicalClusterField: 'cluster_id',
  canonicalStatusField: 'status',
};

export function resolveSignalFilterTraversal(filters: {
  severity?: string;
  clusterId?: string;
  status?: string;
}) {
  const clauses: Array<{ field: string; operator: 'eq'; value: string }> = [];

  if (filters.severity) {
    clauses.push({
      field: 'severity',
      operator: 'eq',
      value: filters.severity,
    });
  }

  if (filters.clusterId) {
    clauses.push({
      field: 'cluster_id',
      operator: 'eq',
      value: filters.clusterId,
    });
  }

  if (filters.status) {
    clauses.push({
      field: 'status',
      operator: 'eq',
      value: filters.status,
    });
  }

  return {
    from: 'detected_signals',
    select: '*',
    filters: clauses,
  };
}

export function classifySignalQueryDrift(query: string) {
  if (query.includes('signal_severity') || query.includes('signal_cluster')) {
    return {
      driftType: 'stale_field_assumption',
      status: 'drifted',
      remediation:
        'Replace stale signal field assumptions with canonical detected_signals traversal',
    };
  }

  return {
    driftType: 'verified',
    status: 'verified',
    remediation: null,
  };
}
