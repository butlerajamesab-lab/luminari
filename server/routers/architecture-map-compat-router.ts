import { router, publicProcedure } from '../trpc';
import { getArchitectureMapRuntimeState } from '../services/architecture-map-runtime-service';

export const architectureMapCompatRouter = router({
  getArchitectureOverview: publicProcedure.query(() => {
    const runtime = getArchitectureMapRuntimeState();

    return {
      layers: runtime.visibleDomains.map((domain, index) => ({
        id: domain,
        name: domain,
        description: `Runtime domain ${domain}`,
        order: index + 1,
        status: runtime.architectureStatus,
        color: '#3b82f6',
        totalRecords: runtime.readyNamespaces,
        tables: [],
      })),
      connections: [],
      summary: {
        totalLayers: runtime.visibleDomains.length,
        totalTables: runtime.visibleDomains.length,
        totalRecords: runtime.operationalSurfaceCount,
        populatedLayers: runtime.readyNamespaces,
        completionPercent: runtime.readyNamespaces,
      },
    };
  }),
});