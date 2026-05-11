import {
  getOperationalCoreRuntimeDomains,
  isOperationalCoreDeterministic,
} from "./register-operational-core-runtime";

export type RuntimeConvergenceState = {
  deterministic: boolean;
  runtimeDomains: string[];
  convergenceStage:
    | "operational-core"
    | "runtime-reconciliation"
    | "runtime-spine-convergence";
  productionProtected: boolean;
  reconstructionBranchOnly: boolean;
};

export const operationalCoreRuntimeConvergence: RuntimeConvergenceState = {
  deterministic: isOperationalCoreDeterministic(),
  runtimeDomains: getOperationalCoreRuntimeDomains(),
  convergenceStage: "runtime-spine-convergence",
  productionProtected: true,
  reconstructionBranchOnly: true,
};

export function getRuntimeConvergenceState(): RuntimeConvergenceState {
  return operationalCoreRuntimeConvergence;
}

export function getRuntimeConvergenceDomains(): string[] {
  return operationalCoreRuntimeConvergence.runtimeDomains;
}

export function isDeterministicRuntimeConvergence(): boolean {
  return operationalCoreRuntimeConvergence.deterministic;
}
