import { operationalCoreRuntimeRouter } from "../routers/operational-core-runtime-router";

export const operationalCoreRuntimeIntegration = {
  namespace: "operational-core-runtime",
  router: operationalCoreRuntimeRouter,
  deterministic: true,
  activationClassification: "SAFE_TO_ACTIVATE",
  runtimePurpose:
    "Deterministic operational-core namespace visibility and readiness integration",
  runtimeDomains: [
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
};

export function getOperationalCoreRuntimeRouter() {
  return operationalCoreRuntimeIntegration.router;
}

export function getOperationalCoreRuntimeDomains() {
  return operationalCoreRuntimeIntegration.runtimeDomains;
}

export function isOperationalCoreDeterministic() {
  return operationalCoreRuntimeIntegration.deterministic;
}
