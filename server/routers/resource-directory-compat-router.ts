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
        runtime_view: surface.runtimeView,
        activation_ready: surface.activationReady,
        stabilization_state: surface.stabilizationState,
        deterministic: surface.deterministic,
      })),
      summary: {
        operational_surface_count: visibility.operationalSurfaceCount,
        ready_namespaces: visibility.readyNamespaces,
        deterministic: visibility.deterministic,
      },
    };
  }),
});