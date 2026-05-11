import {
  getDeterministicOperationalRuntimeState,
} from "../runtime/operational-runtime-state-orchestrator";
import {
  getOperationalVisibilitySummary,
} from "./activation-aware-operational-surface-service";

export type MissionControlRuntimeConvergence = {
  runtimeState: string;
  convergenceStage: string;
  deterministic: boolean;
  productionProtected: boolean;
  reconstructionBranchOnly: boolean;
  operationalSurfaceCount: number;
  readyNamespaces: number;
  governanceReady: boolean;
  legalReady: boolean;
  signalReady: boolean;
  civicMapReady: boolean;
};

export function getMissionControlRuntimeConvergence(): MissionControlRuntimeConvergence {
  const runtimeState = getDeterministicOperationalRuntimeState();
  const visibility = getOperationalVisibilitySummary();

  const namespaces = new Set(
    visibility.surfaces.map(surface => surface.namespace)
  );

  return {
    runtimeState: runtimeState.runtimeState,
    convergenceStage: runtimeState.convergenceStage,
    deterministic: runtimeState.deterministic,
    productionProtected: runtimeState.productionProtected,
    reconstructionBranchOnly: runtimeState.reconstructionBranchOnly,
    operationalSurfaceCount: runtimeState.operationalSurfaceCount,
    readyNamespaces: runtimeState.readyNamespaces,
    governanceReady: namespaces.has("governance"),
    legalReady: namespaces.has("legal-library"),
    signalReady: namespaces.has("signal-governance"),
    civicMapReady: namespaces.has("civic-map"),
  };
}
