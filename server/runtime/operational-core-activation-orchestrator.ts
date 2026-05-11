import {
  getRuntimeConvergenceDomains,
  getRuntimeConvergenceState,
} from "./operational-core-runtime-convergence";
import {
  getOperationalRuntimeSurface,
  isNamespaceRuntimeReady,
  type OperationalRuntimeSurface,
} from "../services/operational-core-runtime-service";

export type OperationalActivationState = {
  namespace: string;
  ready: boolean;
  deterministic: boolean;
  activationStage: "pending" | "ready" | "activated";
  runtimeView: string;
  layerOwner: string;
};

export function getOperationalActivationStates(): OperationalActivationState[] {
  return getRuntimeConvergenceDomains()
    .map(namespace => buildActivationState(namespace))
    .filter((value): value is OperationalActivationState => value !== null);
}

export function getReadyOperationalNamespaces(): string[] {
  return getOperationalActivationStates()
    .filter(state => state.ready)
    .map(state => state.namespace);
}

export function getOperationalActivationSummary() {
  const convergence = getRuntimeConvergenceState();
  const activationStates = getOperationalActivationStates();

  return {
    convergenceStage: convergence.convergenceStage,
    deterministic: convergence.deterministic,
    productionProtected: convergence.productionProtected,
    reconstructionBranchOnly: convergence.reconstructionBranchOnly,
    totalNamespaces: activationStates.length,
    readyNamespaces: activationStates.filter(state => state.ready).length,
    activationStates,
  };
}

function buildActivationState(
  namespace: string
): OperationalActivationState | null {
  const surface = getOperationalRuntimeSurface(namespace);

  if (!surface) {
    return null;
  }

  return {
    namespace: surface.namespace,
    ready: isNamespaceRuntimeReady(namespace),
    deterministic: surface.deterministic,
    activationStage: surface.runtimeReady ? "ready" : "pending",
    runtimeView: surface.runtimeView,
    layerOwner: surface.layerOwner,
  };
}

export function activateOperationalNamespace(namespace: string) {
  const surface: OperationalRuntimeSurface | null =
    getOperationalRuntimeSurface(namespace);

  if (!surface) {
    return {
      namespace,
      activated: false,
      reason: "namespace_not_found",
    };
  }

  if (!surface.runtimeReady) {
    return {
      namespace,
      activated: false,
      reason: "runtime_not_ready",
    };
  }

  return {
    namespace,
    activated: true,
    deterministic: surface.deterministic,
    runtimeView: surface.runtimeView,
    layerOwner: surface.layerOwner,
  };
}
