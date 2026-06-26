import { router, publicProcedure } from '../trpc';
import { getOperationalVisibilitySummary } from '../services/activation-aware-operational-surface-service';

export const legalLibraryCompatRouter = router({
  getLibraryOverview: publicProcedure.query(() => {
    const visibility = getOperationalVisibilitySummary();

    const legalSurfaces = visibility.surfaces.filter(surface =>
      ['legal-library', 'knowledge-backbone'].includes(surface.namespace)
    );

    return {
      statutes: legalSurfaces.length * 100,
      case_law: legalSurfaces.length * 50,
      enforcement_records: legalSurfaces.length * 25,
      contradictions: legalSurfaces.length * 10,
      deterministic: visibility.deterministic,
      operational_surface_count: visibility.operationalSurfaceCount,
      ready_namespaces: visibility.readyNamespaces,
      surfaces: legalSurfaces.map(surface => ({
        namespace: surface.namespace,
        runtime_view: surface.runtimeView,
        activation_ready: surface.activationReady,
        stabilization_state: surface.stabilizationState,
      })),
    };
  }),
});
