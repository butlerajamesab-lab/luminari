import { missionControlCompatRouter } from '../routers/mission-control-compat-router';
import { getMissionControlRuntimeConvergence } from '../services/mission-control-runtime-convergence-service';

export const missionControlRuntimeIntegration = {
  namespace: 'mission-control-runtime',
  router: missionControlCompatRouter,
  deterministic: true,
  runtimePurpose:
    'Deterministic Mission Control convergence visibility and operational runtime readiness',
};

export function getMissionControlRuntimeIntegration() {
  return missionControlRuntimeIntegration;
}

export function getMissionControlRuntimeVisibility() {
  return getMissionControlRuntimeConvergence();
}
