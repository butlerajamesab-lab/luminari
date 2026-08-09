import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import * as db_helpers from "../db";
import { eq } from "drizzle-orm";
import {
  weakJointHits,
  factClaims,
  caseFactPatterns,
  claimDetectionResults,
  evidenceRecords,
  elementStrength,
  contradictionScores,
  claimViability,
} from "../../drizzle/schema";
import {
  get_jurisdiction,
  get_jurisdiction_chain,
  get_node_timeline,
  get_procedural_stats,
  get_workflow,
  list_claim_detection_rules,
  list_deadline_rules,
  list_escalation_routes,
  list_evidence_profiles,
  list_jurisdictions,
  list_node_timeline,
  list_weak_joint_triggers,
  list_workflow_steps,
  list_workflows,
  resolve_jurisdiction,
} from "../procedural-reference-runtime-compat";

// ═══════════════════════════════════════════════════════════════════════════
// PROCEDURAL ENGINE ROUTER
// Steps 1-3: Jurisdiction Hierarchy, Timeline Law, Workflows
// + Claim Viability Engine pipeline
// ═══════════════════════════════════════════════════════════════════════════

export const proceduralEngineRouter = router({

  // ─── Jurisdiction Hierarchy ───────────────────────────────────────────

  listJurisdictions: publicProcedure
    .input(z.object({
      type: z.enum(["federal", "state", "county", "city", "tribal", "territory"]).optional(),
      status: z.enum(["active", "inactive", "pending"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      return list_jurisdictions(input);
    }),

  getJurisdiction: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return get_jurisdiction(input.id);
    }),

  getHierarchyChain: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return get_jurisdiction_chain(input.id);
    }),

  resolveJurisdiction: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return resolve_jurisdiction(input.name);
    }),

  // ─── Node Timeline ────────────────────────────────────────────────────

  listNodeTimeline: publicProcedure
    .input(z.object({
      nodeType: z.enum(["doctrine", "statute", "regulation", "case_law", "agency_guidance", "executive_order"]).optional(),
      domain: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return list_node_timeline(input);
    }),

  getNodeTimeline: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ input }) => {
      return get_node_timeline(input.nodeId);
    }),

  resolveAtDate: publicProcedure
    .input(z.object({ nodeId: z.string(), date: z.number() }))
    .query(async ({ input }) => {
      const rows = await get_node_timeline(input.nodeId, input.date);
      return rows[0] ?? null;
    }),

  // ─── Timeline Events ──────────────────────────────────────────────────

  listTimelineEvents: publicProcedure
    .input(z.object({
      eventType: z.enum(["court_decision", "statute_enactment", "statute_amendment", "regulation_change", "agency_guidance", "doctrine_shift", "executive_order", "legislative_action"]).optional(),
      jurisdiction: z.string().optional(),
      domain: z.string().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
    }).optional())
    .query(async () => []),

  // ─── Timeline Edges ───────────────────────────────────────────────────

  getTimelineEdges: publicProcedure
    .input(z.object({
      nodeId: z.string().optional(),
      relationshipType: z.enum(["supersedes", "amends", "overturns", "interprets", "limits", "expands", "narrows", "clarifies", "codifies", "implements"]).optional(),
    }).optional())
    .query(async () => []),

  // ─── Workflow Master ──────────────────────────────────────────────────

  listWorkflows: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
      status: z.enum(["draft", "active", "deprecated", "archived"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      return list_workflows(input);
    }),

  getWorkflow: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return get_workflow(input.id);
    }),

  resolveWorkflow: publicProcedure
    .input(z.object({
      issueType: z.string(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allWorkflows = await list_workflows({ status: "active" });
      return allWorkflows.filter((w: any) => {
        const types = w.issueTypes as string[];
        const matchesIssue = types?.some(t =>
          t.toLowerCase().includes(input.issueType.toLowerCase())
        );
        const matchesJurisdiction = !input.jurisdiction ||
          String(w.jurisdiction).toLowerCase().includes(input.jurisdiction.toLowerCase());
        return matchesIssue && matchesJurisdiction;
      });
    }),

  // ─── Workflow Steps ───────────────────────────────────────────────────

  getWorkflowSteps: publicProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ input }) => {
      return list_workflow_steps(input.workflowId);
    }),

  // ─── Evidence Profiles ────────────────────────────────────────────────

  listEvidenceProfiles: publicProcedure
    .query(async () => {
      return list_evidence_profiles();
    }),

  getEvidenceProfile: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const rows = await list_evidence_profiles(input.id);
      return rows[0] ?? null;
    }),

  // ─── Escalation Routes ───────────────────────────────────────────────

  getEscalationRoutes: publicProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ input }) => {
      return list_escalation_routes(input.workflowId);
    }),

  // ─── Deadline Rules ───────────────────────────────────────────────────

  listDeadlineRules: publicProcedure
    .input(z.object({
      claimType: z.string().optional(),
      jurisdiction: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return list_deadline_rules(input);
    }),

  // ─── Weak Joint Triggers ──────────────────────────────────────────────

  listWeakJointTriggers: publicProcedure
    .input(z.object({ weakJointId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return list_weak_joint_triggers(input?.weakJointId);
    }),

  // ─── Claim Detection Rules ────────────────────────────────────────────

  listClaimDetectionRules: publicProcedure
    .input(z.object({
      pipelineCategory: z.string().optional(),
      claimType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return list_claim_detection_rules(input);
    }),

  // ─── Aggregation: Procedural Stats ────────────────────────────────────

  getProceduralStats: publicProcedure
    .query(async () => {
      return get_procedural_stats();
    }),

  // ─── Case Pipeline: Claim Viability Assessment ────────────────────────

  getCaseViability: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      const viabilityRows = await db.select().from(claimViability)
        .where(eq(claimViability.caseId, input.caseId));
      const contradictions = await db.select().from(contradictionScores)
        .where(eq(contradictionScores.caseId, input.caseId));
      const elements = await db.select().from(elementStrength)
        .where(eq(elementStrength.caseId, input.caseId));
      const evidence = await db.select().from(evidenceRecords)
        .where(eq(evidenceRecords.caseId, input.caseId));
      const weakJoints = await db.select().from(weakJointHits)
        .where(eq(weakJointHits.caseId, input.caseId));
      const factClaimsList = await db.select().from(factClaims)
        .where(eq(factClaims.caseId, input.caseId));
      const detectionResults = await db.select().from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.caseId));

      return {
        viability: viabilityRows,
        contradictions,
        elements,
        evidence,
        weakJoints,
        fact_claims: factClaimsList,
        detectionResults,
      };
    }),

  getCaseContradictions: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return db.select().from(contradictionScores)
        .where(eq(contradictionScores.caseId, input.caseId));
    }),

  getCaseElementStrength: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return db.select().from(elementStrength)
        .where(eq(elementStrength.caseId, input.caseId));
    }),

  getCaseEvidenceRecords: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return db.select().from(evidenceRecords)
        .where(eq(evidenceRecords.caseId, input.caseId));
    }),

  getCaseWeakJointHits: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return db.select().from(weakJointHits)
        .where(eq(weakJointHits.caseId, input.caseId));
    }),

  getCaseFactClaims: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return db.select().from(factClaims)
        .where(eq(factClaims.caseId, input.caseId));
    }),

  getCaseDetectionResults: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id);
      return db.select().from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.caseId));
    }),
});
