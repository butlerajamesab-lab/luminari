import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { db, getPool } from "../db";
import { eq, count } from "drizzle-orm";
import {
  find_live_filing_template,
  get_live_filing_template,
  get_live_investigation_guidance,
  list_live_filing_templates,
  list_live_investigation_guidance,
} from "../architecture-map-live-read-compat";
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

function parseProofList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => v != null).map(String);
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(v => v != null).map(String) : parsed == null ? [] : [String(parsed)];
  } catch {
    return [value.trim()];
  }
}

function proofTime(value: unknown): number | string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : value;
  }
  return String(value);
}

function mapProofFramework(row: Record<string, any>) {
  return {
    id: Number(row.id),
    claimType: String(row.claim_type ?? ""),
    domain: String(row.domain ?? ""),
    elementsOfProof: parseProofList(row.elements_of_proof),
    burdenOfProof: row.burden_of_proof == null ? null : String(row.burden_of_proof),
    standardOfReview: row.standard_of_review == null ? null : String(row.standard_of_review),
    requiredCausation: row.required_causation == null ? null : String(row.required_causation),
    typicalEvidence: parseProofList(row.typical_evidence),
    commonDefenses: parseProofList(row.common_defenses),
    keyPrecedents: parseProofList(row.key_precedents),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: proofTime(row.created_at),
    updatedAt: proofTime(row.updated_at),
  };
}

const proofFrameworkProjection = `
  select id, claim_type, domain, elements_of_proof, burden_of_proof,
         standard_of_review, required_causation, typical_evidence,
         common_defenses, key_precedents, notes, created_at, updated_at
    from public.proof_frameworks
`;

export const architectureMapRouter = router({
  // ═══════════════════════════════════════════════════
  // PROOF FRAMEWORKS
  // ═══════════════════════════════════════════════════
  listProofFrameworks: publicProcedure
    .input(z.object({ domain: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `${proofFrameworkProjection}
         where ($1::text is null or domain = $1)
           and ($2::text is null or claim_type ilike '%' || $2 || '%')
         order by domain, claim_type, id`,
        [input?.domain ?? null, input?.search ?? null],
      );
      return rows.map(mapProofFramework);
    }),

  getProofFramework: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `${proofFrameworkProjection} where id = $1 limit 1`,
        [input.id],
      );
      return rows[0] == null ? null : mapProofFramework(rows[0]);
    }),

  getProofByClaimType: publicProcedure
    .input(z.object({ claimType: z.string() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `${proofFrameworkProjection}
         where claim_type ilike '%' || $1 || '%'
         order by domain, claim_type, id`,
        [input.claimType],
      );
      return rows.map(mapProofFramework);
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
      return list_live_investigation_guidance({
        agencyShort: input?.agencyShort,
        pipelineCategory: input?.pipelineCategory,
      });
    }),

  getInvestigationGuidance: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return get_live_investigation_guidance(input.id);
    }),

  // ═══════════════════════════════════════════════════
  // FILING GENERATOR
  // ═══════════════════════════════════════════════════
  listFilingTemplates: publicProcedure
    .input(z.object({ agencyShort: z.string().optional(), pipelineCategory: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return list_live_filing_templates({
        agencyShort: input?.agencyShort,
        pipelineCategory: input?.pipelineCategory,
      });
    }),

  getFilingTemplate: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return get_live_filing_template(input.id);
    }),

  getFilingReadiness: publicProcedure
    .input(z.object({ claimType: z.string(), agencyShort: z.string() }))
    .query(async ({ input }) => {
      const template = await find_live_filing_template(
        input.claimType,
        input.agencyShort,
      );
      if (!template) return { ready: false, template: null, message: "No filing template found for this claim type and agency." };

      return {
        ready: true,
        template,
        required_field_count: (template.requiredFields as string[]).length,
        required_evidence_count: (template.requiredEvidence as string[]).length,
        deadline: template.filingDeadline,
        submission_methods: template.submissionMethods,
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
        total_layers: layers.length,
        populatedLayers,
        seedCoveragePercent,
        completion_percent: seedCoveragePercent,
        completion_label: "Seed coverage",
        completion_caveat: "Configured seed-layer coverage only. Not national/full-corpus completion.",
      },
    };
  }),
});
