import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { eq, desc, sql, and, gte, lte, like } from "drizzle-orm";
import {
  jurisdictionHierarchy,
  nodeTimeline,
  timelineEvents,
  timelineEdges,
  workflowMaster,
  workflowSteps,
  evidenceProfiles,
  escalationRoutes,
  deadlineRules,
  weakJointTriggers,
  weakJointHits,
  factClaims,
  caseFactPatterns,
  claimDetectionRules,
  claimDetectionResults,
  evidenceRecords,
  elementStrength,
  contradictionScores,
  claimViability,
} from "../../drizzle/schema";

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
      const conditions = [];
      if (input?.type) conditions.push(eq(jurisdictionHierarchy.type, input.type));
      if (input?.status) conditions.push(eq(jurisdictionHierarchy.status, input.status));
      return db.select().from(jurisdictionHierarchy)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(jurisdictionHierarchy.level, jurisdictionHierarchy.name);
    }),

  getJurisdiction: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(jurisdictionHierarchy)
        .where(eq(jurisdictionHierarchy.id, input.id));
      return row ?? null;
    }),

  getHierarchyChain: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const chain: (typeof jurisdictionHierarchy.$inferSelect)[] = [];
      let currentId: number | null = input.id;
      while (currentId) {
        const rows = await db.select().from(jurisdictionHierarchy)
          .where(eq(jurisdictionHierarchy.id, currentId));
        const row = rows[0];
        if (!row) break;
        chain.unshift(row);
        currentId = row.parentId;
      }
      return chain;
    }),

  resolveJurisdiction: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return db.select().from(jurisdictionHierarchy)
        .where(like(jurisdictionHierarchy.name, `%${input.name}%`));
    }),

  // ─── Node Timeline ────────────────────────────────────────────────────

  listNodeTimeline: publicProcedure
    .input(z.object({
      nodeType: z.enum(["doctrine", "statute", "regulation", "case_law", "agency_guidance", "executive_order"]).optional(),
      domain: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.nodeType) conditions.push(eq(nodeTimeline.nodeType, input.nodeType));
      if (input?.domain) conditions.push(eq(nodeTimeline.domain, input.domain));
      return db.select().from(nodeTimeline)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(nodeTimeline.effectiveDate));
    }),

  getNodeTimeline: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ input }) => {
      return db.select().from(nodeTimeline)
        .where(eq(nodeTimeline.nodeId, input.nodeId))
        .orderBy(desc(nodeTimeline.effectiveDate));
    }),

  resolveAtDate: publicProcedure
    .input(z.object({ nodeId: z.string(), date: z.number() }))
    .query(async ({ input }) => {
      const rows = await db.select().from(nodeTimeline)
        .where(and(
          eq(nodeTimeline.nodeId, input.nodeId),
          lte(nodeTimeline.effectiveDate, input.date),
        ))
        .orderBy(desc(nodeTimeline.effectiveDate))
        .limit(1);
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
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.eventType) conditions.push(eq(timelineEvents.eventType, input.eventType));
      if (input?.jurisdiction) conditions.push(eq(timelineEvents.jurisdiction, input.jurisdiction));
      if (input?.domain) conditions.push(eq(timelineEvents.domain, input.domain));
      if (input?.startDate) conditions.push(gte(timelineEvents.date, input.startDate));
      if (input?.endDate) conditions.push(lte(timelineEvents.date, input.endDate));
      return db.select().from(timelineEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(timelineEvents.date));
    }),

  // ─── Timeline Edges ───────────────────────────────────────────────────

  getTimelineEdges: publicProcedure
    .input(z.object({
      nodeId: z.string().optional(),
      relationshipType: z.enum(["supersedes", "amends", "overturns", "interprets", "limits", "expands", "narrows", "clarifies", "codifies", "implements"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.nodeId) {
        conditions.push(sql`(${timelineEdges.sourceNode} = ${input.nodeId} OR ${timelineEdges.targetNode} = ${input.nodeId})`);
      }
      if (input?.relationshipType) conditions.push(eq(timelineEdges.relationshipType, input.relationshipType));
      return db.select().from(timelineEdges)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(timelineEdges.effectiveDate));
    }),

  // ─── Workflow Master ──────────────────────────────────────────────────

  listWorkflows: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
      status: z.enum(["draft", "active", "deprecated", "archived"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.domain) conditions.push(eq(workflowMaster.domain, input.domain));
      if (input?.status) conditions.push(eq(workflowMaster.status, input.status));
      return db.select().from(workflowMaster)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(workflowMaster.title);
    }),

  getWorkflow: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [workflow] = await db.select().from(workflowMaster)
        .where(eq(workflowMaster.id, input.id));
      if (!workflow) return null;
      const steps = await db.select().from(workflowSteps)
        .where(eq(workflowSteps.workflowId, String(input.id)))
        .orderBy(workflowSteps.stepOrder);
      const escalations = await db.select().from(escalationRoutes)
        .where(eq(escalationRoutes.workflowId, input.id));
      const profile = workflow.evidenceProfileId
        ? (await db.select().from(evidenceProfiles).where(eq(evidenceProfiles.id, workflow.evidenceProfileId)))[0]
        : null;
      return { ...workflow, steps, escalations, evidence_profile: profile };
    }),

  resolveWorkflow: publicProcedure
    .input(z.object({
      issueType: z.string(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allWorkflows = await db.select().from(workflowMaster)
        .where(eq(workflowMaster.status, "active"));
      return allWorkflows.filter((w: any) => {
        const types = w.issueTypes as string[];
        const matchesIssue = types?.some(t =>
          t.toLowerCase().includes(input.issueType.toLowerCase())
        );
        const matchesJurisdiction = !input.jurisdiction ||
          w.jurisdiction.toLowerCase().includes(input.jurisdiction.toLowerCase());
        return matchesIssue && matchesJurisdiction;
      });
    }),

  // ─── Workflow Steps ───────────────────────────────────────────────────

  getWorkflowSteps: publicProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(workflowSteps)
        .where(eq(workflowSteps.workflowId, String(input.workflowId)))
        .orderBy(workflowSteps.stepOrder);
    }),

  // ─── Evidence Profiles ────────────────────────────────────────────────

  listEvidenceProfiles: publicProcedure
    .query(async () => {
      return db.select().from(evidenceProfiles);
    }),

  getEvidenceProfile: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(evidenceProfiles)
        .where(eq(evidenceProfiles.id, input.id));
      return row ?? null;
    }),

  // ─── Escalation Routes ───────────────────────────────────────────────

  getEscalationRoutes: publicProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(escalationRoutes)
        .where(eq(escalationRoutes.workflowId, input.workflowId));
    }),

  // ─── Deadline Rules ───────────────────────────────────────────────────

  listDeadlineRules: publicProcedure
    .input(z.object({
      claimType: z.string().optional(),
      jurisdiction: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.claimType) conditions.push(eq(deadlineRules.claimType, input.claimType));
      if (input?.jurisdiction) conditions.push(eq(deadlineRules.jurisdiction, input.jurisdiction));
      return db.select().from(deadlineRules)
        .where(conditions.length ? and(...conditions) : undefined);
    }),

  // ─── Weak Joint Triggers ──────────────────────────────────────────────

  listWeakJointTriggers: publicProcedure
    .input(z.object({ weakJointId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.weakJointId) {
        return db.select().from(weakJointTriggers)
          .where(eq(weakJointTriggers.weakJointId, input.weakJointId));
      }
      return db.select().from(weakJointTriggers);
    }),

  // ─── Claim Detection Rules ────────────────────────────────────────────

  listClaimDetectionRules: publicProcedure
    .input(z.object({
      pipelineCategory: z.string().optional(),
      claimType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.pipelineCategory) conditions.push(eq(claimDetectionRules.pipelineCategory, input.pipelineCategory));
      if (input?.claimType) conditions.push(eq(claimDetectionRules.claimType, input.claimType));
      return db.select().from(claimDetectionRules)
        .where(conditions.length ? and(...conditions) : undefined);
    }),

  // ─── Aggregation: Procedural Stats ────────────────────────────────────

  getProceduralStats: publicProcedure
    .query(async () => {
      const [jhCount] = await db.select({ count: sql<number>`count(*)` }).from(jurisdictionHierarchy);
      const [ntCount] = await db.select({ count: sql<number>`count(*)` }).from(nodeTimeline);
      const [teCount] = await db.select({ count: sql<number>`count(*)` }).from(timelineEvents);
      const [edgeCount] = await db.select({ count: sql<number>`count(*)` }).from(timelineEdges);
      const [wmCount] = await db.select({ count: sql<number>`count(*)` }).from(workflowMaster);
      const [wsCount] = await db.select({ count: sql<number>`count(*)` }).from(workflowSteps);
      const [epCount] = await db.select({ count: sql<number>`count(*)` }).from(evidenceProfiles);
      const [erCount] = await db.select({ count: sql<number>`count(*)` }).from(escalationRoutes);
      const [drCount] = await db.select({ count: sql<number>`count(*)` }).from(deadlineRules);
      const [wjtCount] = await db.select({ count: sql<number>`count(*)` }).from(weakJointTriggers);
      const [cdrCount] = await db.select({ count: sql<number>`count(*)` }).from(claimDetectionRules);

      return {
        jurisdictions: jhCount.count,
        node_timelines: ntCount.count,
        timeline_events: teCount.count,
        timeline_edges: edgeCount.count,
        workflows: wmCount.count,
        workflow_steps: wsCount.count,
        evidence_profiles: epCount.count,
        escalation_routes: erCount.count,
        deadline_rules: drCount.count,
        weak_joint_triggers: wjtCount.count,
        claim_detection_rules: cdrCount.count,
      };
    }),

  // ─── Case Pipeline: Claim Viability Assessment ────────────────────────

  getCaseViability: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
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
    .query(async ({ input }) => {
      return db.select().from(contradictionScores)
        .where(eq(contradictionScores.caseId, input.caseId));
    }),

  getCaseElementStrength: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(elementStrength)
        .where(eq(elementStrength.caseId, input.caseId));
    }),

  getCaseEvidenceRecords: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(evidenceRecords)
        .where(eq(evidenceRecords.caseId, input.caseId));
    }),

  getCaseWeakJointHits: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(weakJointHits)
        .where(eq(weakJointHits.caseId, input.caseId));
    }),

  getCaseFactClaims: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(factClaims)
        .where(eq(factClaims.caseId, input.caseId));
    }),

  getCaseDetectionResults: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.caseId));
    }),
});
