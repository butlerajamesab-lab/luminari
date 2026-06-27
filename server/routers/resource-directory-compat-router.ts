import { router, publicProcedure } from '../trpc';
import { getOperationalVisibilitySummary } from '../services/activation-aware-operational-surface-service';

export const resourceDirectoryCompatRouter = router({
  getResources: publicProcedure.query(() => {
    const visibility = getOperationalVisibilitySummary();

    const resourceSurfaces = visibility.surfaces.filter(surface =>
      ['civil-gideon', 'agency-metrics'].includes(surface.namespace)
    );

    return {
      resources: resourceSurfaces.map(surface => ({
        id: surface.namespace,
        name: surface.namespace,
        runtimeView: surface.runtimeView,
        activationReady: surface.activationReady,
        stabilizationState: surface.stabilizationState,
        deterministic: surface.deterministic,
      })),
      summary: {
        operationalSurfaceCount: visibility.operationalSurfaceCount,
        readyNamespaces: visibility.readyNamespaces,
        deterministic: visibility.deterministic,
      },
    };
  }),
});