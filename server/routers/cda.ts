/**
 * CDA tRPC Router — Claim Denial Analysis UI endpoints
 *
 * Read-only endpoints for run list + run detail.
 * Mutation: startRun — triggers CDA pipeline with role-enforced doc selection.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as cda_db from "../cda-db";
import * as db_helpers from "../db";
import { buildRunBundle } from "../cda-bundle";
import { runCdaPipeline, type CdaInputDocument } from "../cda-orchestrator";
import { createHash } from "crypto";
import { assertActionAllowed } from "../gate-helpers";

export const cdaRouter = router({
  /** List all CDA runs for the authenticated user */
  listRuns: protectedProcedure.query(async ({ ctx }) => {
    return cda_db.listRunsForUser(ctx.user.id);
  }),

  /** List CDA runs for a specific case */
  listRunsForCase: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return cda_db.listRunsForCase(input.caseId);
    }),

  /** Get a single run with full detail */
  getRun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ ctx, input }) => {
      const run = await cda_db.getRun(input.runId);
      if (!run) return null;
      if (run.userId !== ctx.user.id) return null;
      return run;
    }),

  /** Get row counts for a run (S1-S8) */
  getRunCounts: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ ctx, input }) => {
      const run = await cda_db.getRun(input.runId);
      if (!run || run.userId !== ctx.user.id) return null;
      return cda_db.getRunRowCounts(input.runId);
    }),

  /** Get the full run bundle with O1-O4 markdown artifacts */
  getRunBundle: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ ctx, input }) => {
      const run = await cda_db.getRun(input.runId);
      if (!run || run.userId !== ctx.user.id) return null;

      try {
        const bundle = await buildRunBundle(input.runId);
        return {
          run,
          artifacts: bundle.artifacts,
        };
      } catch (error: any) {
        return {
          run,
          artifacts: null,
          error: error.message,
        };
      }
    }),

  /** Get T7 resolution stats for a run */
  getT7Stats: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ ctx, input }) => {
      const run = await cda_db.getRun(input.runId);
      if (!run || run.userId !== ctx.user.id) return null;

      const matrix = await cda_db.getComparisonMatrix(input.runId);
      const total = matrix.length;
      const byMatchType: Record<string, number> = {};
      const byResolutionMethod: Record<string, number> = {};

      for (const row of matrix) {
        const mt = row.matchType ?? "not_assessed";
        byMatchType[mt] = (byMatchType[mt] ?? 0) + 1;
        const rm = row.resolutionMethod ?? "pending";
        byResolutionMethod[rm] = (byResolutionMethod[rm] ?? 0) + 1;
      }

      return {
        total_comparisons: total,
        byMatchType,
        byResolutionMethod,
      };
    }),

  /** Get S6/S7 summary for one-liner framing */
  getFramingSummary: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ ctx, input }) => {
      const run = await cda_db.getRun(input.runId);
      if (!run || run.userId !== ctx.user.id) return null;

      const [matrix, gaps] = await Promise.all([
        cda_db.getComparisonMatrix(input.runId),
        cda_db.getEvidenceGaps(input.runId),
      ]);

      const clauseIds = new Set(matrix.filter(r => r.clauseId).map(r => r.clauseId));

      return {
        clause_count: clauseIds.size,
        gap_count: gaps.length,
        critical_gap_count: gaps.filter(g => g.priorityLevel === "critical").length,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // Mutation: Start CDA Run
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Start a CDA run from the Documents page.
   * 
   * Enforces:
   * - Exactly 1 policy + 1 denial + 1 claim_summary
   * - All docs must belong to the same case owned by the user
   * - All docs must have status "ready" with extracted text
   * - No duplicate active run for the same case + same doc IDs
   * - Lock snapshot: stores doc sha256 hashes at run creation time
   */
  startRun: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      policyDocId: z.number(),
      denialDocId: z.number(),
      claimSummaryDocId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { caseId, policyDocId, denialDocId, claimSummaryDocId } = input;

      // 1. Verify case write access (owner or WRITE collaborator)
      await db_helpers.verifyCaseWriteAccess(caseId, ctx.user.id);

      // Gate B: explicit snapshot resolution — use getOpenSnapshot instead of listSnapshots[0]
      const cdaSnapshot = await db_helpers.getOpenSnapshot(caseId);
      if (cdaSnapshot) await assertActionAllowed(caseId, cdaSnapshot.id, 'runCDA');

      // 2. Ensure all three doc IDs are distinct
      const docIds = [policyDocId, denialDocId, claimSummaryDocId];
      if (new Set(docIds).size !== 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Each role must be assigned to a different document. You selected the same document for multiple roles.",
        });
      }

      // 3. Fetch all three documents and validate
      const [policyDoc, denialDoc, claimDoc] = await Promise.all([
        db_helpers.getDocument(policyDocId),
        db_helpers.getDocument(denialDocId),
        db_helpers.getDocument(claimSummaryDocId),
      ]);

      // Existence check
      if (!policyDoc) throw new TRPCError({ code: "NOT_FOUND", message: `Policy document (ID: ${policyDocId}) not found` });
      if (!denialDoc) throw new TRPCError({ code: "NOT_FOUND", message: `Denial document (ID: ${denialDocId}) not found` });
      if (!claimDoc) throw new TRPCError({ code: "NOT_FOUND", message: `Claim summary document (ID: ${claimSummaryDocId}) not found` });

      // Case membership check
      if (policyDoc.caseId !== caseId || denialDoc.caseId !== caseId || claimDoc.caseId !== caseId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "All documents must belong to the selected case" });
      }

      // Status check — all must be "ready" with extracted text
      for (const [role, doc] of [["Policy", policyDoc], ["Denial", denialDoc], ["Claim Summary", claimDoc]] as const) {
        if (doc.status !== "ready") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `${role} document "${doc.filename}" is not ready (status: ${doc.status}). All documents must be fully analyzed before running CDA.`,
          });
        }
        if (!doc.textContent || doc.textContent.trim().length === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `${role} document "${doc.filename}" has no extracted text. Re-analyze this document first.`,
          });
        }
      }

      // 4. Duplicate run prevention — block if active run exists for same docs
      const activeRun = await cda_db.findActiveRunForDocs(caseId, policyDocId, denialDocId, claimSummaryDocId);
      if (activeRun) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A CDA run is already in progress for these documents (Run #${activeRun.id}, status: ${activeRun.status}). Wait for it to complete or view its results.`,
        });
      }

      // 5. Build CDA input with lock snapshot (sha256 hashes frozen at this moment)
      function buildInputDoc(doc: NonNullable<Awaited<ReturnType<typeof db_helpers.getDocument>>>): CdaInputDocument {
        const textHash = createHash("sha256").update(doc.textContent!).digest("hex");
        return {
          source_document_id: doc.id,
          text_content: doc.textContent!,
          file_name: doc.filename,
          page_count: doc.pageCount ?? undefined,
          hash: textHash,
        };
      }

      const cdaInput = {
        caseId,
        userId: ctx.user.id,
        policy: buildInputDoc(policyDoc),
        denial: buildInputDoc(denialDoc),
        claimSummary: buildInputDoc(claimDoc),
      };

      // 6. Audit log
      await db_helpers.logAudit({
        caseId,
        userId: ctx.user.id,
        action: "start_cda_run",
        targetType: "case",
        targetId: caseId,
        details: {
          policyDocId,
          denialDocId,
          claimSummaryDocId,
          policyHash: cdaInput.policy.hash,
          denialHash: cdaInput.denial.hash,
          claimHash: cdaInput.claimSummary.hash,
        },
      });

      // 7. Fire the pipeline (runs async — returns immediately with runId)
      // We run in background so the mutation returns quickly
      const resultPromise = runCdaPipeline(cdaInput);

      // Wait briefly for the run to be created (createRun happens synchronously at start)
      const result = await resultPromise;

      return {
        run_id: result.runId,
        status: result.status,
      };
    }),
});
