import {
  getOperationalActivationSummary,
  getReadyOperationalNamespaces,
} from "../runtime/operational-core-activation-orchestrator";
import {
  getOperationalRuntimeSurface,
  type OperationalRuntimeSurface,
} from "./operational-core-runtime-service";

export type ActivationAwareOperationalSurface = {
  namespace: string;
  runtimeView: string;
  activationReady: boolean;
  deterministic: boolean;
  layerOwner: string;
  stabilizationState:
    | "pending"
    | "activation-ready"
    | "operational-core-active";
  operationalNotes: string;
};

export function getActivationAwareOperationalSurfaces(): ActivationAwareOperationalSurface[] {
  const readyNamespaces = new Set(getReadyOperationalNamespaces());

  return Array.from(readyNamespaces)
    .map(namespace => buildActivationAwareSurface(namespace))
    .filter(
      (surface): surface is ActivationAwareOperationalSurface => surface !== null
    );
}

export function getActivationAwareOperationalSurface(
  namespace: string
): ActivationAwareOperationalSurface | null {
  return buildActivationAwareSurface(namespace);
}

export function getOperationalSurfaceStabilizationSummary() {
  const activationSummary = getOperationalActivationSummary();
  const surfaces = getActivationAwareOperationalSurfaces();

  return {
    convergenceStage: activationSummary.convergenceStage,
    deterministic: activationSummary.deterministic,
    productionProtected: activationSummary.productionProtected,
    reconstructionBranchOnly: activationSummary.reconstructionBranchOnly,
    readyNamespaces: activationSummary.readyNamespaces,
    operationalSurfaceCount: surfaces.length,
    surfaces,
  };
}

function buildActivationAwareSurface(
  namespace: string
): ActivationAwareOperationalSurface | null {
  const runtimeSurface: OperationalRuntimeSurface | null =
    getOperationalRuntimeSurface(namespace);

  if (!runtimeSurface) {
    return null;
  }

  return {
    namespace: runtimeSurface.namespace,
    runtimeView: runtimeSurface.runtimeView,
    activationReady: runtimeSurface.runtimeReady,
    deterministic: runtimeSurface.deterministic,
    layerOwner: runtimeSurface.layerOwner,
    stabilizationState: runtimeSurface.runtimeReady
      ? "operational-core-active"
      : "pending",
    operationalNotes: runtimeSurface.notes,
  };
}
