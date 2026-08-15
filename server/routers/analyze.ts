import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getPool } from '../db';
import * as db_helpers from '../db';
import { execute_intake_spine_session, INTAKE_SPINE_LAYER_NAMES } from '../intake-spine-orchestrator';
import { read_canonical_case_layer_outputs } from '../intake-case-layer-reader';
import { read_case_intake_integrity_projection } from '../intake-case-integrity-projection';
import type { VerificationRecord } from '../engines/intake-spine/layer-5-verification_gate';
import type { DetectedPattern } from '../engines/intake-spine/layer-10-pattern_registry';
import type { CascadeChain } from '../engines/intake-spine/layer-11-cascade_registry';
import type { ClaimCandidate } from '../engines/intake-spine/layer-12-rights_and_duties_matrix';
import type { ActionPath } from '../engines/intake-spine/layer-14-action_paths';

const SHA256_RE = /^[0-9a-f]{64}$/;

export const analyzeRouter = router({
  /**
   * Execute the governed Universal Intake Spine for the one live upload session
   * bound to this case. Preservation remains separate; this is an explicit
   * analysis action.
   */
  runIntakeSpine: protectedProcedure
    .input(z.object({
      caseId: z.number().int().positive(),
      jurisdiction: z.string().trim().min(1).max(32),
      asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      intakeSessionId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db_helpers.verifyCaseWriteAccess(input.caseId, ctx.user.id);
      const pool = getPool();

      const session_result = await pool.query<{
        intake_session_id: string;
      }>(
        `select s.intake_session_id::text
           from public.intake_sessions s
           join public.case_intake_links cil
             on cil.intake_session_id = s.intake_session_id
           join public.case_identity_bridge cib
             on cib.case_uuid = cil.case_uuid
          where cib.legacy_case_id = $1
            and cil.is_primary = true
            and cil.link_type = 'primary_projection'
            and s.session_type = 'live'
            and s.entry_channel = 'upload'
            and ($2::uuid is null or s.intake_session_id = $2::uuid)
          order by s.created_at asc`,
        [input.caseId, input.intakeSessionId ?? null],
      );

      if (session_result.rows.length === 0) {
        throw new Error('intake_spine_runtime_live_upload_session_not_found');
      }
      const result = await execute_intake_spine_session({
        intake_session_id: session_result.rows[0].intake_session_id,
        jurisdiction: input.jurisdiction,
        as_of: input.asOf,
      });
      await db_helpers.logAudit({
        caseId: input.caseId,
        userId: ctx.user.id,
        action: 'run_intake_spine',
        targetType: 'case',
        targetId: input.caseId,
        details: {
          intake_session_id: result.intake_session_id,
          jurisdiction: input.jurisdiction.trim().toUpperCase(),
          rule_as_of: input.asOf,
          source_artifact_count: result.source_artifact_count,
          sealed_receipt_count: result.receipts.length,
          receipt_hashes: result.receipts.map(receipt => receipt.receipt_hash),
        },
      });
      return result;
    }),

  /**
   * Truthful runtime state for the case's Intake Spine sessions. The UI can use
   * this instead of inferring health from legacy document-analysis status.
   */
  getIntakeSpineStatus: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      const { rows } = await getPool().query<{
        intake_session_id: string;
        session_type: string;
        entry_channel: string;
        source_label: string | null;
        session_status: string;
        completion_state: string;
        created_at: string;
        source_artifact_count: string | number;
        layer_run_count: string | number;
        sealed_layer_run_count: string | number;
        sealed_layer_names: string[] | null;
        latest_receipt_hash: string | null;
        last_governed_jurisdiction: string | null;
        last_governed_rule_as_of: string | null;
        projection_invalidated_at: string | null;
      }>(
        `select
           s.intake_session_id::text,
           s.session_type,
           s.entry_channel,
           s.source_label,
           s.session_status,
           s.completion_state,
           s.created_at::text,
           count(distinct ia.artifact_id) filter (
             where ia.artifact_type = 'source_document'
               and coalesce(d.document_resolution, 'active') = 'active'
           ) as source_artifact_count,
           count(distinct ilr.layer_run_id) as layer_run_count,
           count(distinct ilr.layer_run_id) filter (where ilr.is_sealed = true) as sealed_layer_run_count,
           array_agg(distinct ilr.layer_name order by ilr.layer_name) filter (
             where ilr.run_status = 'completed'
               and ilr.is_sealed = true
               and ilr.receipt ->> 'receipt_type' = 'layer_execution'
               and ilr.receipt ->> 'execution_contract_version' = 'luminari.intake.layer-execution.v1'
               and ilr.canonicalization_version = 'luminari.intake.canonical-json.v2'
           ) as sealed_layer_names,
           (array_agg(ilr.receipt_hash order by ilr.sealed_at desc nulls last)
             filter (where ilr.receipt_hash ~ '^[0-9a-f]{64}$'))[1] as latest_receipt_hash,
           s.metadata #>> '{last_governed_execution,jurisdiction}' as last_governed_jurisdiction,
           s.metadata #>> '{last_governed_execution,rule_as_of}' as last_governed_rule_as_of,
           s.metadata ->> 'runtime_projection_invalidated_at' as projection_invalidated_at
         from public.intake_sessions s
         join public.case_intake_links cil
           on cil.intake_session_id = s.intake_session_id
         join public.case_identity_bridge cib
           on cib.case_uuid = cil.case_uuid
         left join public.intake_artifacts ia
           on ia.intake_session_id = s.intake_session_id
         left join public.documents d
           on coalesce(ia.metadata ->> 'legacy_document_id', '') ~ '^[0-9]+$'
          and d.id = (ia.metadata ->> 'legacy_document_id')::integer
          and d.case_id = cib.legacy_case_id
         left join public.intake_layer_runs ilr
           on ilr.intake_session_id = s.intake_session_id
        where cib.legacy_case_id = $1
          and cil.is_primary = true
          and cil.link_type = 'primary_projection'
          and s.session_type = 'live'
          and s.entry_channel = 'upload'
        group by s.intake_session_id, s.session_type, s.entry_channel, s.source_label,
                 s.session_status, s.completion_state, s.created_at, s.metadata
        order by s.created_at asc`,
        [input.caseId],
      );

      const integrity = await read_case_intake_integrity_projection(input.caseId);
      return rows.map(row => {
        const session_artifacts = integrity.artifacts.filter(
          artifact => artifact.intake_session_id === row.intake_session_id,
        );
        const sealed_layer_names = (row.sealed_layer_names ?? [])
          .filter((name): name is string => typeof name === 'string')
          .filter(name => (INTAKE_SPINE_LAYER_NAMES as readonly string[]).includes(name));
        const missing_layer_names = INTAKE_SPINE_LAYER_NAMES.filter(
          name => !sealed_layer_names.includes(name),
        );
        return ({
        intake_session_id: row.intake_session_id,
        session_type: row.session_type,
        entry_channel: row.entry_channel,
        source_label: row.source_label,
        session_status: row.session_status,
        completion_state: row.completion_state,
        created_at: row.created_at,
        source_artifact_count: Number(row.source_artifact_count),
        registered_source_count: session_artifacts.length,
        preserved_source_count: session_artifacts.filter(artifact => artifact.integrity_status === 'preserved').length,
        blocked_source_count: session_artifacts.filter(artifact =>
          artifact.integrity_status === 'quarantined' || artifact.integrity_status === 'referenced_missing'
        ).length,
        layer_run_count: Number(row.layer_run_count),
        sealed_layer_run_count: Number(row.sealed_layer_run_count),
        sealed_layer_name_count: sealed_layer_names.length,
        sealed_layer_names,
        required_layer_count: INTAKE_SPINE_LAYER_NAMES.length,
        missing_layer_names,
        execution_complete:
          row.completion_state === 'governed_execution_complete'
          && session_artifacts.length > 0
          && session_artifacts.every(artifact => artifact.integrity_status === 'preserved')
          && missing_layer_names.length === 0,
        latest_receipt_hash:
          row.latest_receipt_hash && SHA256_RE.test(row.latest_receipt_hash)
            ? row.latest_receipt_hash
            : null,
        last_governed_jurisdiction: row.last_governed_jurisdiction,
        last_governed_rule_as_of: row.last_governed_rule_as_of,
        projection_invalidated_at: row.projection_invalidated_at,
        });
      });
    }),

  /**
   * Canonical relationship state is receipt-bound even when the governed
   * result contains zero explicit relationships. Consumers must not turn that
   * completed-zero state back into an upload or rerun prompt.
   */
  getIntakeRelationshipProjection: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      const projection = await read_canonical_case_layer_outputs<Array<Record<string, unknown>>>(
        input.caseId,
        'relationship_graph',
      );

      return {
        projection_state: projection.state,
        outputs: projection.outputs.map(output => ({
          intake_session_id: output.intake_session_id,
          layer_run_id: output.layer_run_id,
          layer_version: output.layer_version,
          rule_version: output.rule_version,
          input_hash: output.input_hash,
          output_hash: output.output_hash,
          receipt_hash: output.receipt_hash,
          unresolved_dependencies: output.unresolved_dependencies,
          relationships: output.data,
        })),
      };
    }),

  /**
   * Canonical evidence-integrity posture comes from Universal Intake Spine
   * Layer 3. Zero errors without an eligible sealed Layer 3 execution is not a
   * successful integrity result; the projection reports no_evidence, not_run,
   * partial, verified, or blocked explicitly.
   */
  getIntakeIntegrityProjection: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return read_case_intake_integrity_projection(input.caseId);
    }),

  /**
   * Case-bound verification is a Universal Intake Spine Layer 5 projection.
   * It is not silently converted into a legacy narrative finding. The endpoint
   * preserves the exact verification record, source refs, receipt, and session
   * identity so the Findings surface can distinguish verification from findings.
   */
  getIntakeVerificationProjection: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      const projection = await read_canonical_case_layer_outputs<VerificationRecord[]>(
        input.caseId,
        'verification_gate',
      );

      return {
        projection_state: projection.state,
        outputs: projection.outputs.map(output => ({
          intake_session_id: output.intake_session_id,
          layer_run_id: output.layer_run_id,
          layer_version: output.layer_version,
          rule_version: output.rule_version,
          input_hash: output.input_hash,
          output_hash: output.output_hash,
          receipt_hash: output.receipt_hash,
          unresolved_dependencies: output.unresolved_dependencies,
          records: output.data,
        })),
      };
    }),

  /**
   * Case-bound claim applicability comes from Universal Intake Spine Layer 12.
   * These are governed structural candidates only: candidate_unverified remains
   * visible and every required element stays unresolved until the downstream
   * claim-proof system evaluates it.
   */
  getIntakeClaimCandidateProjection: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      const projection = await read_canonical_case_layer_outputs<ClaimCandidate[]>(
        input.caseId,
        'rights_and_duties_matrix',
      );

      return {
        projection_state: projection.state,
        outputs: projection.outputs.map(output => ({
          intake_session_id: output.intake_session_id,
          layer_run_id: output.layer_run_id,
          layer_version: output.layer_version,
          rule_version: output.rule_version,
          input_hash: output.input_hash,
          output_hash: output.output_hash,
          receipt_hash: output.receipt_hash,
          unresolved_dependencies: output.unresolved_dependencies,
          candidates: output.data,
        })),
      };
    }),

  /**
   * Case-bound procedural possibilities come from Universal Intake Spine Layer 14.
   * The engine deliberately does not rank or recommend paths. Candidate status,
   * incomplete footholds, unresolved facts, appeal routes, and every governed
   * source receipt remain visible to the caller.
   */
  getIntakeActionPathProjection: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      const projection = await read_canonical_case_layer_outputs<ActionPath[]>(
        input.caseId,
        'action_paths',
      );

      return {
        projection_state: projection.state,
        outputs: projection.outputs.map(output => ({
          intake_session_id: output.intake_session_id,
          layer_run_id: output.layer_run_id,
          layer_version: output.layer_version,
          rule_version: output.rule_version,
          input_hash: output.input_hash,
          output_hash: output.output_hash,
          receipt_hash: output.receipt_hash,
          unresolved_dependencies: output.unresolved_dependencies,
          paths: output.data,
        })),
      };
    }),

  /** Receipt-bound structural pattern and cascade signals from Layers 10/11. */
  getIntakeStructuralSignalProjection: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      const [patterns, cascades] = await Promise.all([
        read_canonical_case_layer_outputs<DetectedPattern[]>(input.caseId, 'pattern_registry'),
        read_canonical_case_layer_outputs<CascadeChain[]>(input.caseId, 'cascade_registry'),
      ]);

      return {
        projection_state:
          patterns.state === 'canonical_projection' && cascades.state === 'canonical_projection'
            ? 'canonical_projection' as const
            : 'not_projected' as const,
        pattern_outputs: patterns.outputs.map(output => ({
          intake_session_id: output.intake_session_id,
          output_hash: output.output_hash,
          receipt_hash: output.receipt_hash,
          unresolved_dependencies: output.unresolved_dependencies,
          patterns: output.data,
        })),
        cascade_outputs: cascades.outputs.map(output => ({
          intake_session_id: output.intake_session_id,
          output_hash: output.output_hash,
          receipt_hash: output.receipt_hash,
          unresolved_dependencies: output.unresolved_dependencies,
          cascades: output.data,
        })),
      };
    }),
});
