import { router, publicProcedure } from '../trpc';
import { getOperationalActivationSummary } from '../runtime/operational-core-activation-orchestrator';

export const guidedIntakeCompatRouter = router({
  getPipelineCategories: publicProcedure.query(() => {
    const activation = getOperationalActivationSummary();

    return {
      categories: [
        {
          id: 'legal-library',
          name: 'Legal Library',
          ready: true,
        },
        {
          id: 'civil-gideon',
          name: 'Civil Gideon',
          ready: true,
        },
        {
          id: 'signal-governance',
          name: 'Signal Governance',
          ready: true,
        },
        {
          id: 'civic-map',
          name: 'Civic Map',
          ready: true,
        },
      ],
      deterministic: activation.deterministic,
      convergenceStage: activation.convergenceStage,
      readyNamespaces: activation.readyNamespaces,
    };
  }),
});