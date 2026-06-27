import { router, publicProcedure } from '../trpc';
import { getMissionControlRuntimeConvergence } from '../services/mission-control-runtime-convergence-service';

export const missionControlCompatRouter = router({
  getMissionControlMetrics: publicProcedure.query(() => {
    const convergence = getMissionControlRuntimeConvergence();

    return {
      runtimeState: convergence.runtimeState,
      convergenceStage: convergence.convergenceStage,
      deterministic: convergence.deterministic,
      productionProtected: convergence.productionProtected,
      reconstructionBranchOnly: convergence.reconstructionBranchOnly,
      operationalSurfaceCount: convergence.operationalSurfaceCount,
      readyNamespaces: convergence.readyNamespaces,
      governanceReady: convergence.governanceReady,
      legalReady: convergence.legalReady,
      signalReady: convergence.signalReady,
      civicMapReady: convergence.civicMapReady,
    };
  }),
});