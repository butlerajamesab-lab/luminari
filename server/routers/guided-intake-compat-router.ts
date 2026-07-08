import { router, publicProcedure } from '../trpc';
import { getOperationalActivationSummary } from '../runtime/operational-core-activation-orchestrator';
import { GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS, SYSTEM_INGESTION_EXTRACTION_MAP } from '../intake-spine-types';

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
      convergence_stage: activation.convergenceStage,
      ready_namespaces: activation.readyNamespaces,
    };
  }),

  /**
   * Returns the power dynamics and cascade prompts for the guided intake spine.
   *
   * These questions are integrated into existing guided intake steps.
   * They collect neutral structural data — not accusations or legal framing.
   * Answers map directly into power_dynamics_registry and cascade_registry fields.
   */
  getPowerDynamicsQuestions: publicProcedure.query(() => {
    return {
      questions: GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS.map((q) => ({
        question_id: q.question_id,
        text: q.text,
        primary_target_fields: [...q.primary_target_fields],
        secondary_target_fields: [...q.secondary_target_fields],
      })),
      normalization_note: "answers map into power_dynamics_registry and cascade_registry; chronology must precede cascade entries",
    };
  }),

  /**
   * Returns the system-ingestion extraction map for the intake spine.
   *
   * Each source type lists primary extraction targets for power_dynamics_registry
   * and cascade_registry fields. Legacy input is read at the boundary and
   * normalized immediately into snake_case owned structures.
   */
  getIngestionExtractionMap: publicProcedure.query(() => {
    return {
      extraction_map: Object.entries(SYSTEM_INGESTION_EXTRACTION_MAP).map(([source_type, config]) => ({
        source_type,
        description: config.description,
        extraction_focus: [...config.extraction_focus],
        primary_targets: [...config.primary_targets],
      })),
    };
  }),
});
