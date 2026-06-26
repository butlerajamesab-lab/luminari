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
        total_records: runtime.readyNamespaces,
        tables: [],
      })),
      connections: [],
      summary: {
        total_layers: runtime.visibleDomains.length,
        total_tables: runtime.visibleDomains.length,
        total_records: runtime.operationalSurfaceCount,
        populated_layers: runtime.readyNamespaces,
        completion_percent: runtime.readyNamespaces,
      },
    };
  }),
});
