export type DriftType =
  | 'stale_field_assumption'
  | 'stale_join_assumption'
  | 'registry_shape_drift'
  | 'startup_loader_drift'
  | 'dead_adapter'
  | 'count_contract_drift'
  | 'schema_drift';

export interface RuntimeDriftEntry {
  surface: string;
  driftType: DriftType;
  expectedContract: string;
  actualContract: string;
  status: 'drifted' | 'verified' | 'reconciled';
  remediation: string;
}

export const runtimeDriftLedger: RuntimeDriftEntry[] = [
  {
    surface: 'CivicMap DSHS Filters',
    driftType: 'stale_field_assumption',
    expectedContract:
      'normalized_civic_resource.source_key local filter',
    actualContract:
      'normalized_civic_resource.source_id -> api_source_registry.id -> api_source_registry.source_key',
    status: 'drifted',
    remediation:
      'Replace direct source_key filters with FK traversal joins',
  },
  {
    surface: 'Pipeline Registry Loader',
    driftType: 'registry_shape_drift',
    expectedContract: '{ categories: {} }',
    actualContract:
      '{ all_canonical_ids: [], categories: {} }',
    status: 'drifted',
    remediation:
      'Normalize canonical pipeline registry structure during startup',
  },
  {
    surface: 'Lens Registry Loader',
    driftType: 'registry_shape_drift',
    expectedContract: '[]',
    actualContract: '{ structural_lenses: [] }',
    status: 'drifted',
    remediation:
      'Normalize lens registry contract before iterable traversal',
  },
  {
    surface: 'Mission Control Metrics',
    driftType: 'dead_adapter',
    expectedContract: 'Legacy runtime metrics adapters',
    actualContract: 'Operational convergence runtime adapters',
    status: 'drifted',
    remediation:
      'Redirect frontend runtime queries to convergence-compatible namespaces',
  },
  {
    surface: 'strategy_outputs.is_quarantined',
    driftType: 'schema_drift',
    expectedContract: 'integer',
    actualContract: 'boolean',
    status: 'drifted',
    remediation:
      'Apply deterministic schema reconciliation migration',
  },
  {
    surface: 'procedural_outputs.created_at',
    driftType: 'schema_drift',
    expectedContract: 'bigint epoch milliseconds',
    actualContract: 'timestamptz',
    status: 'drifted',
    remediation:
      'Apply deterministic timestamp contract reconciliation',
  },
];

export function getRuntimeDriftLedger() {
  return runtimeDriftLedger;
}
