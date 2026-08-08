import { router, protectedProcedure, publicProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getPool } from '../db';
import * as db_helpers from '../db';
import { execute_intake_spine_session } from '../intake-spine-orchestrator';
import { read_canonical_case_layer_outputs } from '../intake-case-layer-reader';
import type { VerificationRecord } from '../engines/intake-spine/layer-5-verification_gate';
import type { ClaimCandidate } from '../engines/intake-spine/layer-12-rights_and_duties_matrix';

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
            and s.session_type = 'live'
            and s.entry_channel = 'upload'
            and ($2::uuid is null or s.intake_session_id = $2::uuid)
          order by s.created_at asc`,
        [input.caseId, input.intakeSessionId ?? null],
      );

      if (session_result.rows.length === 0) {
        throw new Error('intake_spine_runtime_live_upload_session_not_found');
      }
      if (session_result.rows.length > 1 && !input.intakeSessionId) {
        throw new Error('intake_spine_runtime_multiple_live_upload_sessions_require_explicit_session_id');
      }

      return execute_intake_spine_session({
        intake_session_id: session_result.rows[0].intake_session_id,
        jurisdiction: input.jurisdiction,
        as_of: input.asOf,
      });
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
        latest_receipt_hash: string | null;
      }>(
        `select
           s.intake_session_id::text,
           s.session_type,
           s.entry_channel,
           s.source_label,
           s.session_status,
           s.completion_state,
           s.created_at::text,
           count(distinct ia.artifact_id) filter (where ia.artifact_type = 'source_document') as source_artifact_count,
           count(distinct ilr.layer_run_id) as layer_run_count,
           count(distinct ilr.layer_run_id) filter (where ilr.is_sealed = true) as sealed_layer_run_count,
           (array_agg(ilr.receipt_hash order by ilr.sealed_at desc nulls last)
             filter (where ilr.receipt_hash ~ '^[0-9a-f]{64}$'))[1] as latest_receipt_hash
         from public.intake_sessions s
         join public.case_intake_links cil
           on cil.intake_session_id = s.intake_session_id
         join public.case_identity_bridge cib
           on cib.case_uuid = cil.case_uuid
         left join public.intake_artifacts ia
           on ia.intake_session_id = s.intake_session_id
         left join public.intake_layer_runs ilr
           on ilr.intake_session_id = s.intake_session_id
        where cib.legacy_case_id = $1
        group by s.intake_session_id, s.session_type, s.entry_channel, s.source_label,
                 s.session_status, s.completion_state, s.created_at
        order by s.created_at asc`,
        [input.caseId],
      );

      return rows.map(row => ({
        intake_session_id: row.intake_session_id,
        session_type: row.session_type,
        entry_channel: row.entry_channel,
        source_label: row.source_label,
        session_status: row.session_status,
        completion_state: row.completion_state,
        created_at: row.created_at,
        source_artifact_count: Number(row.source_artifact_count),
        layer_run_count: Number(row.layer_run_count),
        sealed_layer_run_count: Number(row.sealed_layer_run_count),
        latest_receipt_hash:
          row.latest_receipt_hash && SHA256_RE.test(row.latest_receipt_hash)
            ? row.latest_receipt_hash
            : null,
      }));
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
   * 1. CLAIM ELEMENTS - Legacy compatibility endpoint.
   * Case-bound applicability now comes from getIntakeClaimCandidateProjection.
   */
  getClaimElements: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `SELECT id, claim_type, element_name, element_value, evidence_id, created_at 
         FROM claims WHERE case_id = $1 ORDER BY created_at DESC`,
        [input.caseId]
      );
      return rows || [];
    }),

  /**
   * 2. PROOF FRAMEWORKS - Legal proof requirements
   */
  getProofFrameworks: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `SELECT wf.id, wf.workflow_name, wf.proof_standard, wf.required_elements, wf.evidence_threshold
         FROM workflows wf
         JOIN cases c ON c.domain = wf.domain
         WHERE c.id = $1 LIMIT 10`,
        [input.caseId]
      );
      return rows || [];
    }),

  /**
   * 3. CONTRADICTION SCORING - Detect contradictions in evidence
   */
  getContradictionScores: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `SELECT id, finding_id, contradiction_type, severity, evidence_ids, score, created_at
         FROM findings WHERE case_id = $1 AND finding_type = 'contradiction' ORDER BY score DESC`,
        [input.caseId]
      );
      return rows || [];
    }),

  /**
   * 4. LITIGATION BARRIERS - Identify legal obstacles
   */
  getLitigationBarriers: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `SELECT ab.id, ab.barrier_name, ab.barrier_type, ab.legal_basis, ab.mitigation_strategy, ab.severity
         FROM accountability_paths ap
         JOIN (SELECT id, barrier_name, barrier_type, legal_basis, mitigation_strategy, severity FROM accountability_legal_hooks) ab 
         ON ap.id = ab.id
         WHERE ap.case_id = $1 ORDER BY ab.severity DESC`,
        [input.caseId]
      );
      return rows || [];
    }),

  /**
   * 5. DOCTRINE GRAPH - Map legal doctrine connections
   */
  getDoctrineGraph: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `SELECT ssl.id, ssl.signal_id, ssl.statute_id, ssl.connection_type, ssl.relevance_score
         FROM signal_statute_links ssl
         JOIN signal_flags sf ON ssl.signal_id = sf.id
         WHERE sf.case_id = $1 ORDER BY ssl.relevance_score DESC`,
        [input.caseId]
      );
      return rows || [];
    }),

  /**
   * 6. CLAIM DENIAL ANALYSIS - Analyze denial patterns
   */
  getClaimDenialAnalysis: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `SELECT id, denial_reason, denial_category, evidence_supporting, evidence_contradicting, pattern_match, created_at
         FROM findings WHERE case_id = $1 AND finding_type = 'denial_analysis' ORDER BY created_at DESC`,
        [input.caseId]
      );
      return rows || [];
    }),

  /**
   * 7. PROVENANCE DRILL-DOWN - Trace evidence origin
   */
  getProvenanceDrillDown: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `SELECT d.id, d.filename, d.source, d.upload_date, d.document_type, 
                COUNT(e.id) as evidence_count, COUNT(f.id) as finding_count
         FROM documents d
         LEFT JOIN evidence e ON d.id = e.document_id
         LEFT JOIN findings f ON e.id = f.evidence_id
         WHERE d.case_id = $1 GROUP BY d.id ORDER BY d.upload_date DESC`,
        [input.caseId]
      );
      return rows || [];
    }),

  /**
   * 8. SIGNAL REGISTRY - Master signal catalog
   */
  getSignalRegistry: publicProcedure.query(async () => {
    const { rows } = await getPool().query(
      `SELECT id, signal_type, domain, trigger_patterns, severity, explanation, created_at
       FROM signal_flags GROUP BY signal_type ORDER BY created_at DESC LIMIT 100`
    );
    return rows || [];
  }),

  /**
   * Get all analysis data for a case (summary)
   */
  getCaseSummary: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const { rows: claimCount } = await getPool().query(
        `SELECT COUNT(*) as count FROM claims WHERE case_id = $1`,
        [input.caseId]
      );
      const { rows: finding_count } = await getPool().query(
        `SELECT COUNT(*) as count FROM findings WHERE case_id = $1`,
        [input.caseId]
      );
      const { rows: signalCount } = await getPool().query(
        `SELECT COUNT(*) as count FROM signal_flags WHERE case_id = $1`,
        [input.caseId]
      );
      const { rows: documentCount } = await getPool().query(
        `SELECT COUNT(*) as count FROM documents WHERE case_id = $1`,
        [input.caseId]
      );

      return {
        claim_elements: claimCount[0]?.count || 0,
        findings: finding_count[0]?.count || 0,
        signals: signalCount[0]?.count || 0,
        documents: documentCount[0]?.count || 0,
      };
    }),
});