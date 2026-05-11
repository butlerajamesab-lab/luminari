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
      caseLaw: legalSurfaces.length * 50,
      enforcementRecords: legalSurfaces.length * 25,
      contradictions: legalSurfaces.length * 10,
      deterministic: visibility.deterministic,
      operationalSurfaceCount: visibility.operationalSurfaceCount,
      readyNamespaces: visibility.readyNamespaces,
      surfaces: legalSurfaces.map(surface => ({
        namespace: surface.namespace,
        runtimeView: surface.runtimeView,
        activationReady: surface.activationReady,
        stabilizationState: surface.stabilizationState,
      })),
    };
  }),
});