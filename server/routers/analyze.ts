import { router, publicProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getPool } from '../db';

export const analyzeRouter = router({
  /**
   * 1. CLAIM ELEMENTS - Extract and analyze claim structure
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
