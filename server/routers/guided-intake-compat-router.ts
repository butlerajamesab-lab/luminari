import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { chronologyEvents, powerDynamicsRegistry, cascadeRegistry } from '../../drizzle/schema';
import { getOperationalActivationSummary } from '../runtime/operational-core-activation-orchestrator';
import { GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS, SYSTEM_INGESTION_EXTRACTION_MAP } from '../intake-spine-types';
import {
  normalizeChronologyEvent,
  normalizeGuidedIntakeToPowerDynamics,
  normalizeGuidedIntakeToCascade,
} from '../intake-spine-normalization';

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
   * These questions are integrated into the existing guided intake question flow.
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

  /**
   * Persists guided intake spine data after case creation.
   *
   * Called from the guided intake UI after the case UUID is obtained from
   * cases.create. Normalizes answers from the existing guided intake flow into
   * chronology → power_dynamics → cascade rows and writes them in a single
   * transaction, enforcing the ordering invariant at the DB round trip.
   *
   * Input: case_id (uuid from cases.create), all guided intake answers
   * including the 8 power dynamics questions (pd_*) and cascade_trigger.
   */
  submitSpineData: protectedProcedure
    .input(z.object({
      case_id: z.string().uuid(),
      answers: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ input }) => {
      const { case_id, answers } = input;

      // Step 1: Build chronology event from the intake narrative answers.
      // The "what_happened" answer is the primary observed event.
      // The "who_involved" and "where" answers are the people/context.
      const what_happened = answers['what_happened'] ?? null;
      if (!what_happened) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'submitSpineData: what_happened answer is required to create a chronology event.',
        });
      }

      const chronology_record = normalizeChronologyEvent({
        case_id,
        observed_event: what_happened,
        people_involved: answers['who_involved'] ? [answers['who_involved']] : [],
        evidence_source: answers['documents_available'] ?? null,
        outstanding_follow_up: answers['additional_context'] ?? null,
        source_references: answers['documents_available'] ? [answers['documents_available']] : [],
        event_confidence_level: 'reported',
        created_from_path: 'guided_intake',
      });

      // Step 2: Build power dynamics record from pd_* answers.
      const power_dynamics_record = normalizeGuidedIntakeToPowerDynamics({
        case_id,
        answers,
        source_event_ids: [chronology_record.chronology_event_id],
      });

      // Step 3: Build cascade record if cascade_trigger is answered.
      // Cascade requires at least one chronology_event_id (enforced by both
      // the normalization function and the DB CHECK constraint).
      const cascade_trigger = answers['cascade_trigger'] ?? null;
      const cascade_record = cascade_trigger
        ? normalizeGuidedIntakeToCascade({
            case_id,
            trigger_event_id: chronology_record.chronology_event_id,
            trigger_summary: cascade_trigger,
            immediate_effect: cascade_trigger,
            related_chronology_ids: [chronology_record.chronology_event_id],
          })
        : null;

      // Step 4: Persist chronology → power_dynamics → cascade in a single
      // transaction to enforce the ordering invariant durably.
      await db.transaction(async (tx) => {
        await tx.insert(chronologyEvents).values({
          case_id: chronology_record.case_id,
          chronology_event_id: chronology_record.chronology_event_id,
          event_date: null,
          source_date: chronology_record.source_date ?? null,
          observed_event: chronology_record.observed_event,
          people_involved: chronology_record.people_involved,
          evidence_source: chronology_record.evidence_source ?? null,
          immediate_consequence: chronology_record.immediate_consequence ?? null,
          outstanding_follow_up: chronology_record.outstanding_follow_up ?? null,
          source_references: chronology_record.source_references,
          event_confidence_level: chronology_record.event_confidence_level,
          created_from_path: chronology_record.created_from_path ?? null,
          normalization_version: chronology_record.normalization_version ?? null,
          status: chronology_record.status,
        });

        await tx.insert(powerDynamicsRegistry).values({
          case_id: power_dynamics_record.case_id,
          power_dynamics_id: power_dynamics_record.power_dynamics_id,
          authority_holder: power_dynamics_record.authority_holder ?? null,
          resident_representative: power_dynamics_record.resident_representative ?? null,
          alternate_representative: power_dynamics_record.alternate_representative ?? null,
          decision_maker: power_dynamics_record.decision_maker ?? null,
          access_controller: power_dynamics_record.access_controller ?? null,
          gatekeeper: power_dynamics_record.gatekeeper ?? null,
          dependency_path: power_dynamics_record.dependency_path ?? null,
          procedural_barrier: power_dynamics_record.procedural_barrier ?? null,
          exclusion_event: power_dynamics_record.exclusion_event ?? null,
          retaliation_concern: power_dynamics_record.retaliation_concern ?? null,
          documentation_holder: power_dynamics_record.documentation_holder ?? null,
          communication_bottleneck: power_dynamics_record.communication_bottleneck ?? null,
          burden_shift: power_dynamics_record.burden_shift ?? null,
          user_capacity_limit: power_dynamics_record.user_capacity_limit ?? null,
          disputed_authority: power_dynamics_record.disputed_authority ?? null,
          informal_power_actor: power_dynamics_record.informal_power_actor ?? null,
          power_imbalance_summary: power_dynamics_record.power_imbalance_summary ?? null,
          source_event_ids: power_dynamics_record.source_event_ids,
          evidence_source_ids: power_dynamics_record.evidence_source_ids,
          confidence_level: power_dynamics_record.confidence_level,
          created_from_path: power_dynamics_record.created_from_path ?? null,
          normalization_version: power_dynamics_record.normalization_version ?? null,
          status: power_dynamics_record.status,
        });

        if (cascade_record) {
          await tx.insert(cascadeRegistry).values({
            case_id: cascade_record.case_id,
            cascade_id: cascade_record.cascade_id,
            trigger_event_id: cascade_record.trigger_event_id ?? null,
            trigger_summary: cascade_record.trigger_summary ?? null,
            immediate_effect: cascade_record.immediate_effect ?? null,
            secondary_effect: cascade_record.secondary_effect ?? null,
            affected_people: cascade_record.affected_people,
            affected_entities: cascade_record.affected_entities,
            related_chronology_ids: cascade_record.related_chronology_ids,
            related_pattern_ids: cascade_record.related_pattern_ids,
            related_power_dynamics_ids: cascade_record.related_power_dynamics_ids,
            related_rights_duties_ids: cascade_record.related_rights_duties_ids,
            evidence_source_ids: cascade_record.evidence_source_ids,
            confidence_level: cascade_record.confidence_level,
            open_questions: cascade_record.open_questions ?? null,
            created_from_path: cascade_record.created_from_path ?? null,
            normalization_version: cascade_record.normalization_version ?? null,
            status: cascade_record.status,
          });
        }
      });

      return {
        success: true,
        chronology_event_id: chronology_record.chronology_event_id,
        power_dynamics_id: power_dynamics_record.power_dynamics_id,
        cascade_id: cascade_record?.cascade_id ?? null,
      };
    }),
});
