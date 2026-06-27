import { router, publicProcedure } from "../trpc";
import {
  getArchitectureMapRuntimeState,
} from "../services/architecture-map-runtime-service";

export const architectureMapRuntimeRouter = router({
  getArchitectureRuntimeState: publicProcedure.query(() => {
    return getArchitectureMapRuntimeState();
  }),

  getArchitectureVisibleDomains: publicProcedure.query(() => {
    return getArchitectureMapRuntimeState().visibleDomains;
  }),

  getArchitectureOperationalStatus: publicProcedure.query(() => {
    const state = getArchitectureMapRuntimeState();

    return {
      architecture_status: state.architectureStatus,
      runtime_state: state.runtimeState,
      convergence_stage: state.convergenceStage,
      deterministic: state.deterministic,
      ready_namespaces: state.readyNamespaces,
      operational_surface_count: state.operationalSurfaceCount,
    };
  }),
});
