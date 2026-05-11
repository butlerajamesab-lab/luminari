export type OperationalCoreNamespaceBinding = {
  namespace: string;
  activationStatus: 'ready' | 'deferred' | 'blocked';
  activationClassification:
    | 'SAFE_TO_ACTIVATE'
    | 'BLOCKED_BY_SCHEMA'
    | 'REQUIRES_REBUILD'
    | 'LEGACY_DRIFT';
  layerOwner: string;
  runtimeView: string;
  deterministic: boolean;
  notes: string;
};

export const operationalCoreRuntimeBindings: OperationalCoreNamespaceBinding[] = [
  {
    namespace: 'mission-control',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L10',
    runtimeView: 'v_mission_control_runtime',
    deterministic: true,
    notes: 'Operational-core governance and visibility projection',
  },
  {
    namespace: 'governance',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L10',
    runtimeView: 'v_operational_core_governance_summary',
    deterministic: true,
    notes: 'Deterministic governance visibility surface',
  },
  {
    namespace: 'legal-library',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L3',
    runtimeView: 'v_legal_library_runtime',
    deterministic: true,
    notes: 'Canonical legal registry projection',
  },
  {
    namespace: 'knowledge-backbone',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L3',
    runtimeView: 'v_case_law_runtime',
    deterministic: true,
    notes: 'Knowledge backbone runtime visibility',
  },
  {
    namespace: 'civil-gideon',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L3',
    runtimeView: 'v_civil_gideon_runtime',
    deterministic: true,
    notes: 'Resource backbone runtime visibility',
  },
  {
    namespace: 'agency-metrics',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L3',
    runtimeView: 'v_agency_directory_runtime',
    deterministic: true,
    notes: 'Agency metrics runtime visibility',
  },
  {
    namespace: 'signal-governance',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L6',
    runtimeView: 'v_signal_runtime',
    deterministic: true,
    notes: 'Signal governance runtime visibility',
  },
  {
    namespace: 'pattern-registry',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L6',
    runtimeView: 'v_pattern_runtime',
    deterministic: true,
    notes: 'Pattern runtime visibility',
  },
  {
    namespace: 'civic-map',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L11',
    runtimeView: 'v_civic_map_runtime',
    deterministic: true,
    notes: 'Operational civic visibility surface',
  },
  {
    namespace: 'atlas-bridges',
    activationStatus: 'ready',
    activationClassification: 'SAFE_TO_ACTIVATE',
    layerOwner: 'L6',
    runtimeView: 'v_atlas_bridge_runtime',
    deterministic: true,
    notes: 'Atlas bridge runtime visibility',
  },
];

export function getOperationalCoreBinding(namespace: string) {
  return operationalCoreRuntimeBindings.find(binding => binding.namespace === namespace);
}

export function getSafeOperationalCoreBindings() {
  return operationalCoreRuntimeBindings.filter(
    binding => binding.activationClassification === 'SAFE_TO_ACTIVATE'
  );
}
