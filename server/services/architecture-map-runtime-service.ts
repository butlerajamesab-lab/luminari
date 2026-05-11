import { getDeterministicOperationalRuntimeState } from "../runtime/operational-runtime-state-orchestrator";
import { getOperationalVisibilitySummary } from "./activation-aware-operational-surface-service";

export type ArchitectureMapRuntimeState = {
  runtimeState: string;
  convergenceStage: string;
  deterministic: boolean;
  productionProtected: boolean;
  operationalSurfaceCount: number;
  readyNamespaces: number;
  architectureStatus: "loading" | "partial" | "operational";
  visibleDomains: string[];
};

export function getArchitectureMapRuntimeState(): ArchitectureMapRuntimeState {
  const runtime = getDeterministicOperationalRuntimeState();
  const visibility = getOperationalVisibilitySummary();

  const visibleDomains = visibility.surfaces.map(surface => surface.namespace);

  return {
    runtimeState: runtime.runtimeState,
    convergenceStage: runtime.convergenceStage,
    deterministic: runtime.deterministic,
    productionProtected: runtime.productionProtected,
    operationalSurfaceCount: runtime.operationalSurfaceCount,
    readyNamespaces: runtime.readyNamespaces,
    architectureStatus:
      runtime.readyNamespaces === 0
        ? "loading"
        : runtime.readyNamespaces < 5
          ? "partial"
          : "operational",
    visibleDomains,
  };
}
