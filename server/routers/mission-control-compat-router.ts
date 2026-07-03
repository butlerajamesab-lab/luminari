import { router, publicProcedure } from '../trpc';
import { getMissionControlRuntimeConvergence } from '../services/mission-control-runtime-convergence-service';

export const missionControlCompatRouter = router({
  getMissionControlMetrics: publicProcedure.query(() => {
    const convergence = getMissionControlRuntimeConvergence();

    return {
      runtime_state: convergence.runtimeState,
      convergence_stage: convergence.convergenceStage,
      deterministic: convergence.deterministic,
      production_protected: convergence.productionProtected,
      reconstruction_branch_only: convergence.reconstructionBranchOnly,
      operational_surface_count: convergence.operationalSurfaceCount,
      ready_namespaces: convergence.readyNamespaces,
      governance_ready: convergence.governanceReady,
      legal_ready: convergence.legalReady,
      signal_ready: convergence.signalReady,
      civic_map_ready: convergence.civicMapReady,
    };
  }),
});
