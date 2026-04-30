/**
 * Evidence Layer Router
 *
 * Provides CRUD for evidence_items, evidence_proof_links, evidence_event_links,
 * and evidence_graph_edges. Also provides evidence coverage analysis.
 *
 * This is the State Graph layer — it represents what actually happened in a case.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as dbHelpers from "../db";
import { EVIDENCE_TYPES } from "../../drizzle/schema";

export const evidenceLayerRouter = router({
  // ═══════════════════════════════════════════════════════════════════════
  // EVIDENCE ITEMS CRUD
  // ═══════════════════════════════════════════════════════════════════════

  /** Create a new evidence item */
  create: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      evidenceType: z.string(),
      title: z.string().min(1).max(512),
      description: z.string().optional(),
      sourceName: z.string().optional(),
      sourceDate: z.number().optional(),
      fileReference: z.string().optional(),
      extractedText: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await dbHelpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return dbHelpers.createEvidenceItem(input);
    }),

  /** List all evidence items for a case */
  list: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await dbHelpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return dbHelpers.listEvidenceItems(input.caseId);
    }),

  /** Get a single evidence item */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const item = await dbHelpers.getEvidenceItem(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence item not found" });
      await dbHelpers.verifyCaseOwnership(item.caseId, ctx.user.id);
      return item;
    }),

  /** Update an evidence item */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      evidenceType: z.string().optional(),
      title: z.string().min(1).max(512).optional(),
      description: z.string().optional(),
      sourceName: z.string().optional(),
      sourceDate: z.number().optional(),
      fileReference: z.string().optional(),
      extractedText: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await dbHelpers.getEvidenceItem(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence item not found" });
      await dbHelpers.verifyCaseOwnership(item.caseId, ctx.user.id);
      const { id, ...data } = input;
      await dbHelpers.updateEvidenceItem(id, data);
      return { success: true };
    }),

  /** Delete an evidence item and all related links */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await dbHelpers.getEvidenceItem(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence item not found" });
      await dbHelpers.verifyCaseOwnership(item.caseId, ctx.user.id);
      await dbHelpers.deleteEvidenceItem(input.id);
      return { success: true };
    }),

  /** Get available evidence types */
  types: protectedProcedure
    .query(() => {
      return EVIDENCE_TYPES.map(t => ({
        value: t,
        label: t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      }));
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // EVIDENCE → PROOF LINKS
  // ═══════════════════════════════════════════════════════════════════════

  /** Link evidence to a proof framework element */
  linkToProof: protectedProcedure
    .input(z.object({
      evidenceId: z.number(),
      frameworkId: z.number(),
      elementNumber: z.number().min(1),
      relationshipStrength: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await dbHelpers.getEvidenceItem(input.evidenceId);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence item not found" });
      await dbHelpers.verifyCaseOwnership(item.caseId, ctx.user.id);
      return dbHelpers.createEvidenceProofLink(input);
    }),

  /** List proof links for an evidence item */
  proofLinksByEvidence: protectedProcedure
    .input(z.object({ evidenceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const item = await dbHelpers.getEvidenceItem(input.evidenceId);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence item not found" });
      await dbHelpers.verifyCaseOwnership(item.caseId, ctx.user.id);
      return dbHelpers.listEvidenceProofLinksByEvidence(input.evidenceId);
    }),

  /** List evidence linked to a specific proof element */
  proofLinksByElement: protectedProcedure
    .input(z.object({
      frameworkId: z.number(),
      elementNumber: z.number(),
    }))
    .query(async ({ input }) => {
      return dbHelpers.listEvidenceProofLinksByElement(input.frameworkId, input.elementNumber);
    }),

  /** Remove a proof link */
  unlinkFromProof: protectedProcedure
    .input(z.object({ linkId: z.number() }))
    .mutation(async ({ input }) => {
      await dbHelpers.deleteEvidenceProofLink(input.linkId);
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // EVIDENCE → EVENT LINKS
  // ═══════════════════════════════════════════════════════════════════════

  /** Link evidence to an event */
  linkToEvent: protectedProcedure
    .input(z.object({
      evidenceId: z.number(),
      eventId: z.number(),
      relationship: z.enum(["proves", "corroborates", "contradicts", "references"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await dbHelpers.getEvidenceItem(input.evidenceId);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence item not found" });
      await dbHelpers.verifyCaseOwnership(item.caseId, ctx.user.id);
      return dbHelpers.createEvidenceEventLink(input);
    }),

  /** List event links for an evidence item */
  eventLinksByEvidence: protectedProcedure
    .input(z.object({ evidenceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const item = await dbHelpers.getEvidenceItem(input.evidenceId);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence item not found" });
      await dbHelpers.verifyCaseOwnership(item.caseId, ctx.user.id);
      return dbHelpers.listEvidenceEventLinksByEvidence(input.evidenceId);
    }),

  /** List evidence linked to a specific event */
  eventLinksByEvent: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      return dbHelpers.listEvidenceEventLinksByEvent(input.eventId);
    }),

  /** Remove an event link */
  unlinkFromEvent: protectedProcedure
    .input(z.object({ linkId: z.number() }))
    .mutation(async ({ input }) => {
      await dbHelpers.deleteEvidenceEventLink(input.linkId);
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // EVIDENCE GRAPH EDGES
  // ═══════════════════════════════════════════════════════════════════════

  /** Create a graph edge from evidence/event to claim/barrier/agency */
  createGraphEdge: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      fromType: z.enum(["evidence", "event"]),
      fromId: z.number(),
      edgeType: z.enum(["proves", "supports", "triggers", "involves", "corroborates", "contradicts"]),
      toType: z.enum(["event", "claim", "barrier", "agency", "proof_element"]),
      toId: z.string(),
      strength: z.enum(["strong", "moderate", "weak"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await dbHelpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return dbHelpers.createEvidenceGraphEdge(input);
    }),

  /** List graph edges for a case with optional filters */
  listGraphEdges: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      fromType: z.enum(["evidence", "event"]).optional(),
      toType: z.enum(["event", "claim", "barrier", "agency", "proof_element"]).optional(),
      edgeType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await dbHelpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      const { caseId, ...filters } = input;
      return dbHelpers.listEvidenceGraphEdges(caseId, filters);
    }),

  /** Delete a graph edge */
  deleteGraphEdge: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await dbHelpers.deleteEvidenceGraphEdge(input.id);
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // EVIDENCE COVERAGE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════

  /** Analyze evidence coverage against a proof framework */
  coverage: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      frameworkId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      await dbHelpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return dbHelpers.getEvidenceCoverage(input.caseId, input.frameworkId);
    }),
});
