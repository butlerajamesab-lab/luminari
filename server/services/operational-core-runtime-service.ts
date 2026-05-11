import {
  getOperationalCoreBinding,
  getSafeOperationalCoreBindings,
  type OperationalCoreNamespaceBinding,
} from "../runtime/operational-core-runtime-bindings";

export type OperationalRuntimeSurface = {
  namespace: string;
  runtimeView: string;
  activationStatus: string;
  deterministic: boolean;
  layerOwner: string;
  runtimeReady: boolean;
  notes: string;
};

export function getOperationalRuntimeSurface(
  namespace: string
): OperationalRuntimeSurface | null {
  const binding = getOperationalCoreBinding(namespace);

  if (!binding) {
    return null;
  }

  return buildOperationalRuntimeSurface(binding);
}

export function getOperationalRuntimeSurfaces(): OperationalRuntimeSurface[] {
  return getSafeOperationalCoreBindings().map(binding =>
    buildOperationalRuntimeSurface(binding)
  );
}

function buildOperationalRuntimeSurface(
  binding: OperationalCoreNamespaceBinding
): OperationalRuntimeSurface {
  return {
    namespace: binding.namespace,
    runtimeView: binding.runtimeView,
    activationStatus: binding.activationStatus,
    deterministic: binding.deterministic,
    layerOwner: binding.layerOwner,
    runtimeReady:
      binding.activationClassification === "SAFE_TO_ACTIVATE" &&
      binding.activationStatus === "ready",
    notes: binding.notes,
  };
}

export function isNamespaceRuntimeReady(namespace: string): boolean {
  const surface = getOperationalRuntimeSurface(namespace);

  return !!surface?.runtimeReady;
}

export function getDeterministicOperationalNamespaces(): string[] {
  return getOperationalRuntimeSurfaces()
    .filter(surface => surface.deterministic)
    .map(surface => surface.namespace);
}
