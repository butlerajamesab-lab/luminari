import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { db, getPool } from "../db";
import { desc, eq, sql, like, count } from "drizzle-orm";
import {
  proofFrameworks,
  claimElementMatrix,
  investigationGuidance,
  filingGenerator,
  // Existing tables for architecture map aggregation
  legalStatutes,
  legalCaseLaw,
  legalWeakJoints,
  legalContradictions,
  legalEnforcementRecords,
  legalStatuteClauses,
  doctrineRegistry,
  doctrineGraphEdges,
  litigationBarriers,
  signalRegistry,
  narrativeTemplates,
  workflowDefinitions,
  contradictionTemplates,
  agencyAuthorityMap,
  interagencyReferrals,
  agencyForms,
  regulatoryGuidance,
  enforcementPenalties,
  enforcementViabilityRules,
  pipelineIntelligenceMap,
  pipelineIntakeEnrichments,
  timelineRules,
  timelineSignals,
  evidenceSources,
  registrySignals,
  liveSignals,
  registryWorkflows,
} from "../../drizzle/schema";

async function count_public_table(table_name: string): Promise<number> {
  const allowed = new Set(["contacts"]);
  if (!allowed.has(table_name)) return 0;
  try {
    const result = await getPool().query(`select count(*)::int as c from public.${table_name}`);
    return Number(result.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export const architectureMapRouter = router({
  // ═══════════════════════════════════════════════════
  // PROOF FRAMEWORKS
  // ═══════════════════════════════════════════════════
  listProofFrameworks: publicProcedure
    .input(z.object({ domain: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      let q = db.select().from(proofFrameworks);
      if (input?.domain) q = q.where(eq(proofFrameworks.domain, input.domain)) as any;
      if (input?.search) q = q.where(like(proofFrameworks.claimType, `%${input.search}%`)) as any;
      return q.orderBy(proofFrameworks.domain, proofFrameworks.claimType);
    }),

  getProofFramework: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(proofFrameworks).where(eq(proofFrameworks.id, input.id));
      return row ?? null;
    }),

  getProofByClaimType: publicProcedure
    .input(z.object({ claimType: z.string() }))
    .query(async ({ input }) => {
      const rows = await db.select().from(proofFrameworks).where(like(proofFrameworks.claimType, `%${input.claimType}%`));
      return rows;
    }),

  // ═══════════════════════════════════════════════════
  // CLAIM ELEMENT MATRIX
  // ═══════════════════════════════════════════════════
  listClaimElements: publicProcedure
    .input(z.object({ claimType: z.string().optional(), domain: z.string().optional() }).optional())
    .query(async ({ input }) => {
      let q = db.select().from(claimElementMatrix);
      if (input?.claimType) q = q.where(eq(claimElementMatrix.claimType, input.claimType)) as any;
      if (input?.domain) q = q.where(eq(claimElementMatrix.domain, input.domain)) as any;
      return q.orderBy(claimElementMatrix.claimType, claimElementMatrix.elementOrder);
    }),

  getClaimElementsByType: publicProcedure
    .input(z.object({ claimType: z.string() }))
    .query(async ({ input }) => {
      return db.select().from(claimElementMatrix)
        .where(eq(claimElementMatrix.claimType, input.claimType))
        .orderBy(claimElementMatrix.elementOrder);
    }),

  // ═══════════════════════════════════════════════════
  // INVESTIGATION GUIDANCE
  // ═══════════════════════════════════════════════════
  listInvestigationGuidance: publicProcedure
    .input(z.object({ agencyShort: z.string().optional(), pipelineCategory: z.string().optional() }).optional())
    .query(async ({ input }) => {
      let q = db.select().from(investigationGuidance);
      if (input?.agencyShort) q = q.where(eq(investigationGuidance.agencyShort, input.agencyShort)) as any;
      if (input?.pipelineCategory) q = q.where(eq(investigationGuidance.pipelineCategory, input.pipelineCategory)) as any;
      return q.orderBy(investigationGuidance.agency, investigationGuidance.claimType);
    }),

  getInvestigationGuidance: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(investigationGuidance).where(eq(investigationGuidance.id, input.id));
      return row ?? null;
    }),

  // ═══════════════════════════════════════════════════
  // FILING GENERATOR
  // ═══════════════════════════════════════════════════
  listFilingTemplates: publicProcedure
    .input(z.object({ agencyShort: z.string().optional(), pipelineCategory: z.string().optional() }).optional())
    .query(async ({ input }) => {
      let q = db.select().from(filingGenerator);
      if (input?.agencyShort) q = q.where(eq(filingGenerator.agencyShort, input.agencyShort)) as any;
      if (input?.pipelineCategory) q = q.where(eq(filingGenerator.pipelineCategory, input.pipelineCategory)) as any;
      return q.orderBy(filingGenerator.agency, filingGenerator.claimType);
    }),

  getFilingTemplate: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(filingGenerator).where(eq(filingGenerator.id, input.id));
      return row ?? null;
    }),

  getFilingReadiness: publicProcedure
    .input(z.object({ claimType: z.string(), agencyShort: z.string() }))
    .query(async ({ input }) => {
      const templates = await db.select().from(filingGenerator)
        .where(eq(filingGenerator.agencyShort, input.agencyShort));
      
      const matching = templates.filter((t: any) => 
        t.claimType.toLowerCase().includes(input.claimType.toLowerCase())
      );

      if (matching.length === 0) return { ready: false, template: null, message: "No filing template found for this claim type and agency." };

      const template = matching[0];
      return {
        ready: true,
        template,
        requiredFieldCount: (template.requiredFields as string[]).length,
        requiredEvidenceCount: (template.requiredEvidence as string[]).length,
        deadline: template.filingDeadline,
        submissionMethods: template.submissionMethods,
      };
    }),

  // ═══════════════════════════════════════════════════
  // ARCHITECTURE MAP — SYSTEM OVERVIEW
  // ═══════════════════════════════════════════════════
  getArchitectureOverview: publicProcedure.query(async () => {
    // Count records in every configured seed/library table to build the architecture map.
    // These counts measure seed coverage, not national corpus completion.
    const [
      statuteCount,
      caseLawCount,
      weakJointCount,
      contradictionCount,
      enforcementRecordCount,
      statuteClauseCount,
      doctrineCount,
      doctrineEdgeCount,
      barrierCount,
      signalCount,
      narrativeCount,
      workflowCount,
      contradictionTemplateCount,
      agencyAuthCount,
      interagencyCount,
      agencyFormCount,
      guidanceCount,
      penaltyCount,
      viabilityCount,
      pipelineMapCount,
      intakeEnrichCount,
      timelineRuleCount,
      timelineSignalCount,
      evidenceSourceCount,
      proofFrameworkCount,
      claimElementCount,
      investigationGuidanceCount,
      filingGeneratorCount,
      registrySignalCount,
      liveSignalCount,
      registryWorkflowCount,
      contactCount,
    ] = await Promise.all([
      db.select({ c: count() }).from(legalStatutes).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(legalCaseLaw).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(legalWeakJoints).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(legalContradictions).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(legalEnforcementRecords).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(legalStatuteClauses).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(doctrineRegistry).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(doctrineGraphEdges).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(litigationBarriers).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(signalRegistry).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(narrativeTemplates).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(workflowDefinitions).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(contradictionTemplates).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(agencyAuthorityMap).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(interagencyReferrals).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(agencyForms).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(regulatoryGuidance).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(enforcementPenalties).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(enforcementViabilityRules).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(pipelineIntelligenceMap).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(pipelineIntakeEnrichments).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(timelineRules).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(timelineSignals).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(evidenceSources).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(proofFrameworks).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(claimElementMatrix).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(investigationGuidance).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(filingGenerator).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(registrySignals).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(liveSignals).then((r: any[]) => r[0]?.c ?? 0),
      db.select({ c: count() }).from(registryWorkflows).then((r: any[]) => r[0]?.c ?? 0),
      count_public_table("contacts"),
    ]);

    // Build the 8-layer architecture
    const layers = [
      {
        id: "statutes",
        name: "Statutes & Regulations",
        description: "Federal and state statutes, regulations, and statutory clauses that define legal prohibitions and authority.",
        order: 1,
        tables: [
          { name: "legal_statutes", label: "Statutes", count: statuteCount },
          { name: "legal_statute_clauses", label: "Statute Clauses", count: statuteClauseCount },
        ],
        totalRecords: statuteCount + statuteClauseCount,
        status: (statuteCount + statuteClauseCount) > 0 ? "populated" : "empty",
        color: "#3b82f6",
      },
      {
        id: "case_law",
        name: "Case Law & Precedent",
        description: "Federal and state court decisions that interpret statutes and establish legal standards.",
        order: 2,
        tables: [
          { name: "legal_case_law", label: "Case Law", count: caseLawCount },
          { name: "doctrine_registry", label: "Doctrines", count: doctrineCount },
          { name: "doctrine_graph_edges", label: "Doctrine Connections", count: doctrineEdgeCount },
        ],
        totalRecords: caseLawCount + doctrineCount + doctrineEdgeCount,
        status: (caseLawCount + doctrineCount) > 0 ? "populated" : "empty",
        color: "#8b5cf6",
      },
      {
        id: "claim_elements",
        name: "Claim Elements",
        description: "What must be proven for each claim type. Element-by-element breakdown with evidence types and strength indicators.",
        order: 3,
        tables: [
          { name: "claim_element_matrix", label: "Claim Elements", count: claimElementCount },
        ],
        totalRecords: claimElementCount,
        status: claimElementCount > 0 ? "populated" : "empty",
        color: "#06b6d4",
      },
      {
        id: "proof_frameworks",
        name: "Proof Frameworks",
        description: "How elements are proven. Burden-shifting frameworks, causation standards, typical evidence, and common defenses.",
        order: 4,
        tables: [
          { name: "proof_frameworks", label: "Proof Frameworks", count: proofFrameworkCount },
          { name: "contradiction_templates", label: "Contradiction Templates", count: contradictionTemplateCount },
          { name: "legal_contradictions", label: "Contradictions", count: contradictionCount },
        ],
        totalRecords: proofFrameworkCount + contradictionTemplateCount + contradictionCount,
        status: proofFrameworkCount > 0 ? "populated" : "empty",
        color: "#10b981",
      },
      {
        id: "enforcement",
        name: "Agency Enforcement",
        description: "Agency authority, enforcement pathways, canonical contact infrastructure, forms, penalties, viability rules, and interagency referrals.",
        order: 5,
        tables: [
          { name: "agency_authority_map", label: "Agency Authority", count: agencyAuthCount },
          { name: "contacts", label: "Canonical Contacts", count: contactCount },
          { name: "agency_forms", label: "Agency Forms", count: agencyFormCount },
          { name: "enforcement_penalties", label: "Penalties", count: penaltyCount },
          { name: "enforcement_viability_rules", label: "Viability Rules", count: viabilityCount },
          { name: "interagency_referrals", label: "Referrals", count: interagencyCount },
          { name: "legal_enforcement_records", label: "Enforcement Records", count: enforcementRecordCount },
        ],
        totalRecords: agencyAuthCount + contactCount + agencyFormCount + penaltyCount + viabilityCount + interagencyCount + enforcementRecordCount,
        status: (agencyAuthCount + agencyFormCount + contactCount) > 0 ? "populated" : "empty",
        color: "#f59e0b",
      },
      {
        id: "regulatory",
        name: "Regulatory Guidance",
        description: "Agency guidance documents, regulatory interpretations, and compliance standards.",
        order: 6,
        tables: [
          { name: "regulatory_guidance", label: "Guidance Documents", count: guidanceCount },
        ],
        totalRecords: guidanceCount,
        status: guidanceCount > 0 ? "populated" : "empty",
        color: "#ef4444",
      },
      {
        id: "investigation",
        name: "Investigation & Filing",
        description: "Investigation guidance, filing templates, workflow definitions, and evidence source catalogs.",
        order: 7,
        tables: [
          { name: "investigation_guidance", label: "Investigation Guidance", count: investigationGuidanceCount },
          { name: "filing_generator", label: "Filing Templates", count: filingGeneratorCount },
          { name: "workflow_definitions", label: "Workflows", count: workflowCount },
          { name: "registry_workflows", label: "Registry Workflows", count: registryWorkflowCount },
          { name: "evidence_sources", label: "Evidence Sources", count: evidenceSourceCount },
        ],
        totalRecords: investigationGuidanceCount + filingGeneratorCount + workflowCount + registryWorkflowCount + evidenceSourceCount,
        status: (investigationGuidanceCount + filingGeneratorCount + registryWorkflowCount) > 0 ? "populated" : "empty",
        color: "#ec4899",
      },
      {
        id: "intelligence",
        name: "Intelligence & Signals",
        description: "Pattern detection signals, weak joints, litigation barriers, narrative templates, and pipeline intelligence.",
        order: 8,
        tables: [
          { name: "signal_registry", label: "Signal Types", count: signalCount },
          { name: "registry_signals", label: "Registry Signals", count: registrySignalCount },
          { name: "live_signals", label: "Live Signals", count: liveSignalCount },
          { name: "legal_weak_joints", label: "Weak Joints", count: weakJointCount },
          { name: "litigation_barriers", label: "Barriers", count: barrierCount },
          { name: "narrative_templates", label: "Narratives", count: narrativeCount },
          { name: "pipeline_intelligence_map", label: "Pipeline Map", count: pipelineMapCount },
          { name: "pipeline_intake_enrichments", label: "Intake Enrichments", count: intakeEnrichCount },
          { name: "timeline_rules", label: "Timeline Rules", count: timelineRuleCount },
          { name: "timeline_signals", label: "Timeline Signals", count: timelineSignalCount },
        ],
        totalRecords: signalCount + registrySignalCount + liveSignalCount + weakJointCount + barrierCount + narrativeCount + pipelineMapCount + intakeEnrichCount + timelineRuleCount + timelineSignalCount,
        status: (signalCount + registrySignalCount + liveSignalCount + weakJointCount) > 0 ? "populated" : "empty",
        color: "#6366f1",
      },
    ];

    const connections = [
      { from: "statutes", to: "case_law", label: "Statutes interpreted by case law", strength: Math.min(statuteCount, caseLawCount) },
      { from: "case_law", to: "claim_elements", label: "Case law defines claim elements", strength: Math.min(caseLawCount, claimElementCount) },
      { from: "claim_elements", to: "proof_frameworks", label: "Elements proven through frameworks", strength: Math.min(claimElementCount, proofFrameworkCount) },
      { from: "proof_frameworks", to: "enforcement", label: "Frameworks guide enforcement pathways", strength: Math.min(proofFrameworkCount, agencyAuthCount) },
      { from: "enforcement", to: "regulatory", label: "Enforcement informed by guidance", strength: Math.min(agencyAuthCount, guidanceCount) },
      { from: "regulatory", to: "investigation", label: "Guidance shapes investigation approach", strength: Math.min(guidanceCount, investigationGuidanceCount) },
      { from: "investigation", to: "intelligence", label: "Investigation feeds signal detection", strength: Math.min(investigationGuidanceCount, signalCount) },
      { from: "intelligence", to: "statutes", label: "Signals trigger statutory analysis (feedback loop)", strength: Math.min(signalCount, statuteCount) },
      { from: "statutes", to: "enforcement", label: "Statutes define agency authority", strength: Math.min(statuteCount, agencyAuthCount) },
      { from: "case_law", to: "proof_frameworks", label: "Precedent establishes proof standards", strength: Math.min(caseLawCount, proofFrameworkCount) },
      { from: "claim_elements", to: "investigation", label: "Elements drive investigation focus", strength: Math.min(claimElementCount, investigationGuidanceCount) },
      { from: "intelligence", to: "proof_frameworks", label: "Weak joints expose proof gaps", strength: Math.min(weakJointCount, proofFrameworkCount) },
    ];

    const totalRecords = layers.reduce((sum, l) => sum + l.totalRecords, 0);
    const totalTables = layers.reduce((sum, l) => sum + l.tables.length, 0);
    const populatedLayers = layers.filter(l => l.status === "populated").length;
    const seedCoveragePercent = Math.round((populatedLayers / layers.length) * 100);

    return {
      layers,
      connections,
      summary: {
        totalRecords,
        totalTables,
        totalLayers: layers.length,
        populatedLayers,
        seedCoveragePercent,
        completionPercent: seedCoveragePercent,
        completionLabel: "Seed coverage",
        completionCaveat: "Configured seed-layer coverage only. Not national/full-corpus completion.",
      },
    };
  }),
});
