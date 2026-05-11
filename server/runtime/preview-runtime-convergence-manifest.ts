export const previewRuntimeConvergenceManifest = {
  runtimeMode: "preview-reconstruction",
  deterministic: true,
  productionProtected: true,
  reconstructionBranchProjectRef: "ickuyayatfmbtbayiqvd",
  activationDomains: [
    "mission-control",
    "governance",
    "legal-library",
    "knowledge-backbone",
    "civil-gideon",
    "agency-metrics",
    "signal-governance",
    "pattern-registry",
    "civic-map",
  ],
  requiredRouters: [
    "operational-core-runtime-router",
    "operational-core-activation-router",
    "activation-aware-operational-visibility-router",
  ],
  runtimeViews: [
    "v_mission_control_runtime",
    "v_legal_library_runtime",
    "v_case_law_runtime",
    "v_civil_gideon_runtime",
    "v_agency_directory_runtime",
    "v_signal_runtime",
    "v_pattern_runtime",
    "v_civic_map_runtime",
    "v_atlas_bridge_runtime",
  ],
  nextMilestone: "render-preview-runtime-mount",
};

export function getPreviewRuntimeManifest() {
  return previewRuntimeConvergenceManifest;
}
