import { architectureMapRuntimeRouter } from "../routers/architecture-map-runtime-router";
import { getArchitectureMapRuntimeState } from "../services/architecture-map-runtime-service";

export const architectureMapRuntimeIntegration = {
  namespace: "architecture-map-runtime",
  router: architectureMapRuntimeRouter,
  deterministic: true,
  runtimePurpose:
    "Deterministic operational architecture visibility and convergence state",
};

export function getArchitectureRuntimeIntegration() {
  return architectureMapRuntimeIntegration;
}

export function getArchitectureRuntimeVisibility() {
  return getArchitectureMapRuntimeState();
}
