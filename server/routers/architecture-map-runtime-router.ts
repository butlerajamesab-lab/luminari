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
      architectureStatus: state.architectureStatus,
      runtimeState: state.runtimeState,
      convergenceStage: state.convergenceStage,
      deterministic: state.deterministic,
      readyNamespaces: state.readyNamespaces,
      operationalSurfaceCount: state.operationalSurfaceCount,
    };
  }),
});
