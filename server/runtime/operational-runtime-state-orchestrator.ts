import {
  getOperationalVisibilitySummary,
} from "../services/activation-aware-operational-surface-service";
import {
  getOperationalActivationSummary,
} from "./operational-core-activation-orchestrator";
import {
  getRuntimeConvergenceState,
} from "./operational-core-runtime-convergence";

export type DeterministicOperationalRuntimeState = {
  convergenceStage: string;
  deterministic: boolean;
  productionProtected: boolean;
  reconstructionBranchOnly: boolean;
  operationalSurfaceCount: number;
  readyNamespaces: number;
  runtimeState:
    | "initializing"
    | "operational-core-active"
    | "runtime-converging"
    | "stabilized";
};

export function getDeterministicOperationalRuntimeState(): DeterministicOperationalRuntimeState {
  const convergence = getRuntimeConvergenceState();
  const activation = getOperationalActivationSummary();
  const visibility = getOperationalVisibilitySummary();

  return {
    convergenceStage: convergence.convergenceStage,
    deterministic: convergence.deterministic,
    productionProtected: convergence.productionProtected,
    reconstructionBranchOnly: convergence.reconstructionBranchOnly,
    operationalSurfaceCount: visibility.operationalSurfaceCount,
    readyNamespaces: activation.readyNamespaces,
    runtimeState: determineRuntimeState(
      activation.readyNamespaces,
      visibility.operationalSurfaceCount
    ),
  };
}

function determineRuntimeState(
  readyNamespaces: number,
  operationalSurfaceCount: number
): DeterministicOperationalRuntimeState["runtimeState"] {
  if (readyNamespaces === 0) {
    return "initializing";
  }

  if (readyNamespaces > 0 && operationalSurfaceCount === 0) {
    return "operational-core-active";
  }

  if (readyNamespaces > 0 && operationalSurfaceCount > 0) {
    return "runtime-converging";
  }

  return "stabilized";
}
