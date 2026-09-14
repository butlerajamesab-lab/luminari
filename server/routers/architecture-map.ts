import { reviewed_proof_reference_issue } from "../reviewed-claim-references";
import { z } from "zod";
import { publicProcedure as public_procedure, router } from "../_core/trpc";
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
  if (!allowed.has(table_name)) throw new Error("Unregistered architecture table");
  const result = await getPool().query(`select count(*)::int as c from public.${table_name}`);
  if (result.rows[0]?.c == null) throw new Error("Architecture count unavailable");
  return Number(result.rows[0].c);
}

async function read_current_substrate_snapshot() {
  try {
    const result = await getPool().query(
      `select public.get_lighthouse_civic_object_snapshot_v1() as snapshot`,
    );
    const snapshot = result.rows[0]?.snapshot ?? {};
    const by_class = Array.isArray(snapshot.by_class) ? snapshot.by_class : [];
    return {
      availability: "available",
      source: "get_lighthouse_civic_object_snapshot_v1",
      generated_at: snapshot.generated_at ?? null,
      total_current_objects: Number(snapshot.total_current_objects ?? 0),
      typed_ready: Number(snapshot.typed_ready ?? 0),
      jurisdiction_ready: Number(snapshot.jurisdiction_ready ?? 0),
      with_access_point: Number(snapshot.with_access_point ?? 0),
      direct_access_ready: Number(snapshot.direct_access_ready ?? 0),
      unresolved_or_held: Number(snapshot.unresolved_or_held ?? 0),
      object_classes: by_class.map((row: Record<string, unknown>) => ({
        object_class: String(row.object_class ?? "unknown"),
        target_surface: String(row.target_surface ?? "unrouted"),
        object_count: Number(row.object_count ?? 0),
        typed_ready_count: Number(row.typed_ready_count ?? 0),
        jurisdiction_ready_count: Number(row.jurisdiction_ready_count ?? 0),
        direct_access_ready_count: Number(row.direct_access_ready_count ?? 0),
        unresolved_or_held_count: Number(row.unresolved_or_held_count ?? 0),
      })),
    };
  } catch {
    return {
      availability: "unavailable",
      source: "get_lighthouse_civic_object_snapshot_v1",
      generated_at: null,
      total_current_objects: null,
      typed_ready: null,
      jurisdiction_ready: null,
      with_access_point: null,
      direct_access_ready: null,
      unresolved_or_held: null,
      object_classes: [],
    };
  }
}

function parse_proof_list(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => v != null).map(String);
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(v => v != null).map(String) : parsed == null ? [] : [String(parsed)];
  } catch {
    return [value.trim()];
  }
}

function proof_time(value: unknown): number | string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : value;
  }
  return String(value);
}

function map_proof_framework(row: Record<string, any>) {
  const issue = reviewed_proof_reference_issue(String(row.claim_type ?? ""), row.domain ?? null);
  const recorded_reference = {
    elements_of_proof: parse_proof_list(row.elements_of_proof),
    burden_of_proof: row.burden_of_proof == null ? null : String(row.burden_of_proof),
    standard_of_review: row.standard_of_review == null ? null : String(row.standard_of_review),
    required_causation: row.required_causation == null ? null : String(row.required_causation),
    typical_evidence: parse_proof_list(row.typical_evidence),
    common_defenses: parse_proof_list(row.common_defenses),
    key_precedents: parse_proof_list(row.key_precedents),
  };
  return {
    id: Number(row.id), claim_type: String(row.claim_type ?? ""), domain: String(row.domain ?? ""),
    ...recorded_reference,
    elements_of_proof: issue ? [] : recorded_reference.elements_of_proof,
    notes: row.notes == null ? null : String(row.notes),
    created_at: proof_time(row.created_at), updated_at: proof_time(row.updated_at),
    legal_verification: "unverified", case_applicability: "not_assessed",
    review_status: issue ? "needs_source_repair" : "not_independently_verified",
    review_issue: issue,
    validated_proof_available: false,
    recorded_reference,
  };
}

const proof_framework_projection = `
  select id, claim_type, domain, elements_of_proof, burden_of_proof,
         standard_of_review, required_causation, typical_evidence,
         common_defenses, key_precedents, notes, created_at, updated_at
    from public.proof_frameworks
`;

export const architectureMapRouter = router({
  // ═══════════════════════════════════════════════════
  // PROOF FRAMEWORKS
  // ═══════════════════════════════════════════════════
  list_proof_frameworks: public_procedure
    .input(z.object({ domain: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `${proof_framework_projection}
         where ($1::text is null or domain = $1)
           and ($2::text is null or claim_type ilike '%' || $2 || '%')
         order by domain, claim_type, id`,
        [input?.domain ?? null, input?.search ?? null],
      );
      return rows.map(map_proof_framework);
    }),

  get_proof_framework: public_procedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `${proof_framework_projection} where id = $1 limit 1`,
        [input.id],
      );
      return rows[0] == null ? null : map_proof_framework(rows[0]);
    }),

  get_proof_by_claim_type: public_procedure
    .input(z.object({ claim_type: z.string().optional(), claimType: z.string().optional() })
      .transform(value => ({ claim_type: value.claim_type ?? value.claimType ?? "" }))
      .refine(value => value.claim_type.length > 0, "A claim identity is required"))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `${proof_framework_projection}
         where claim_type = $1
         order by domain, claim_type, id`,
        [input.claim_type],
      );
      return rows.map(map_proof_framework);
    }),

  // ═══════════════════════════════════════════════════
  // CLAIM ELEMENT MATRIX
  // ═══════════════════════════════════════════════════
  listClaimElements: public_procedure
    .input(z.object({ claimType: z.string().optional(), domain: z.string().optional() }).optional())
    .query(async ({ input }) => {
      let q = db.select().from(claimElementMatrix);
      if (input?.claimType) q = q.where(eq(claimElementMatrix.claimType, input.claimType)) as any;
      if (input?.domain) q = q.where(eq(claimElementMatrix.domain, input.domain)) as any;
      return q.orderBy(claimElementMatrix.claimType, claimElementMatrix.elementOrder);
    }),

  getClaimElementsByType: public_procedure
    .input(z.object({ claimType: z.string() }))
    .query(async ({ input }) => {
      return db.select().from(claimElementMatrix)
        .where(eq(claimElementMatrix.claimType, input.claimType))
        .orderBy(claimElementMatrix.elementOrder);
    }),

  // ═══════════════════════════════════════════════════
  // INVESTIGATION GUIDANCE
  // ═══════════════════════════════════════════════════
  listInvestigationGuidance: public_procedure
    .input(z.object({ agencyShort: z.string().optional(), pipelineCategory: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return list_live_investigation_guidance({
        agencyShort: input?.agencyShort,
        pipelineCategory: input?.pipelineCategory,
      });
    }),

  getInvestigationGuidance: public_procedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return get_live_investigation_guidance(input.id);
    }),

  // ═══════════════════════════════════════════════════
  // FILING GENERATOR
  // ═══════════════════════════════════════════════════
  listFilingTemplates: public_procedure
    .input(z.object({ agencyShort: z.string().optional(), pipelineCategory: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return list_live_filing_templates({
        agencyShort: input?.agencyShort,
        pipelineCategory: input?.pipelineCategory,
      });
    }),

  getFilingTemplate: public_procedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return get_live_filing_template(input.id);
    }),

  getFilingReadiness: public_procedure
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
  get_architecture_overview: public_procedure.query(async () => {
    // This is a live current-object substrate readout. It is intentionally
    // separate from the eight governed seed layers below so broad corpus
    // records cannot inflate or redefine legal-layer completion.
    const current_substrate_promise = read_current_substrate_snapshot();

    // Count records in every configured seed/library table to build the architecture map.
    // These counts measure seed coverage, not national corpus completion.
    const [
      statute_count,
      case_law_count,
      weak_joint_count,
      contradiction_count,
      enforcement_record_count,
      statute_clause_count,
      doctrine_count,
      doctrine_edge_count,
      barrier_count,
      signal_count,
      narrative_count,
      workflow_count,
      contradiction_template_count,
      agency_auth_count,
      interagency_count,
      agency_form_count,
      guidance_count,
      penalty_count,
      viability_count,
      pipeline_map_count,
      intake_enrich_count,
      timeline_rule_count,
      timeline_signal_count,
      evidence_source_count,
      proof_framework_count,
      claim_element_count,
      investigation_guidance_count,
      filing_generator_count,
      registry_signal_count,
      live_signal_count,
      registry_workflow_count,
      contact_count,
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
    const current_substrate = await current_substrate_promise;

    // Build the 8-layer architecture
    const layers = [
      {
        id: "statutes",
        name: "Statutes & Regulations",
        description: "Federal and state statutes, regulations, and statutory clauses that define legal prohibitions and authority.",
        order: 1,
        tables: [
          { name: "legal_statutes", label: "Statutes", count: statute_count },
          { name: "legal_statute_clauses", label: "Statute Clauses", count: statute_clause_count },
        ],
        total_records: statute_count + statute_clause_count,
        status: (statute_count + statute_clause_count) > 0 ? "populated" : "empty",
        color: "#3b82f6",
      },
      {
        id: "case_law",
        name: "Case Law & Precedent",
        description: "Federal and state court decisions that interpret statutes and establish legal standards.",
        order: 2,
        tables: [
          { name: "legal_case_law", label: "Case Law", count: case_law_count },
          { name: "doctrine_registry", label: "Doctrines", count: doctrine_count },
          { name: "doctrine_graph_edges", label: "Doctrine Connections", count: doctrine_edge_count },
        ],
        total_records: case_law_count + doctrine_count + doctrine_edge_count,
        status: (case_law_count + doctrine_count) > 0 ? "populated" : "empty",
        color: "#8b5cf6",
      },
      {
        id: "claim_elements",
        name: "Claim Elements",
        description: "What must be proven for each claim type. Element-by-element breakdown with evidence types and strength indicators.",
        order: 3,
        tables: [
          { name: "claim_element_matrix", label: "Claim Elements", count: claim_element_count },
        ],
        total_records: claim_element_count,
        status: claim_element_count > 0 ? "populated" : "empty",
        color: "#06b6d4",
      },
      {
        id: "proof_frameworks",
        name: "Proof Frameworks",
        description: "How elements are proven. Burden-shifting frameworks, causation standards, typical evidence, and common defenses.",
        order: 4,
        tables: [
          { name: "proof_frameworks", label: "Proof Frameworks", count: proof_framework_count },
          { name: "contradiction_templates", label: "Contradiction Templates", count: contradiction_template_count },
          { name: "legal_contradictions", label: "Contradictions", count: contradiction_count },
        ],
        total_records: proof_framework_count + contradiction_template_count + contradiction_count,
        status: proof_framework_count > 0 ? "populated" : "empty",
        color: "#10b981",
      },
      {
        id: "enforcement",
        name: "Agency Enforcement",
        description: "Agency authority, enforcement pathways, canonical contact infrastructure, forms, penalties, viability rules, and interagency referrals.",
        order: 5,
        tables: [
          { name: "agency_authority_map", label: "Agency Authority", count: agency_auth_count },
          { name: "contacts", label: "Canonical Contacts", count: contact_count },
          { name: "agency_forms", label: "Agency Forms", count: agency_form_count },
          { name: "enforcement_penalties", label: "Penalties", count: penalty_count },
          { name: "enforcement_viability_rules", label: "Viability Rules", count: viability_count },
          { name: "interagency_referrals", label: "Referrals", count: interagency_count },
          { name: "legal_enforcement_records", label: "Enforcement Records", count: enforcement_record_count },
        ],
        total_records: agency_auth_count + contact_count + agency_form_count + penalty_count + viability_count + interagency_count + enforcement_record_count,
        status: (agency_auth_count + agency_form_count + contact_count) > 0 ? "populated" : "empty",
        color: "#f59e0b",
      },
      {
        id: "regulatory",
        name: "Regulatory Guidance",
        description: "Agency guidance documents, regulatory interpretations, and compliance standards.",
        order: 6,
        tables: [
          { name: "regulatory_guidance", label: "Guidance Documents", count: guidance_count },
        ],
        total_records: guidance_count,
        status: guidance_count > 0 ? "populated" : "empty",
        color: "#ef4444",
      },
      {
        id: "investigation",
        name: "Investigation & Filing",
        description: "Investigation guidance, filing templates, workflow definitions, and evidence source catalogs.",
        order: 7,
        tables: [
          { name: "investigation_guidance", label: "Investigation Guidance", count: investigation_guidance_count },
          { name: "filing_generator", label: "Filing Templates", count: filing_generator_count },
          { name: "workflow_definitions", label: "Workflows", count: workflow_count },
          { name: "registry_workflows", label: "Registry Workflows", count: registry_workflow_count },
          { name: "evidence_sources", label: "Evidence Sources", count: evidence_source_count },
        ],
        total_records: investigation_guidance_count + filing_generator_count + workflow_count + registry_workflow_count + evidence_source_count,
        status: (investigation_guidance_count + filing_generator_count + registry_workflow_count) > 0 ? "populated" : "empty",
        color: "#ec4899",
      },
      {
        id: "intelligence",
        name: "Intelligence & Signals",
        description: "Pattern detection signals, weak joints, litigation barriers, narrative templates, and pipeline intelligence.",
        order: 8,
        tables: [
          { name: "signal_registry", label: "Signal Types", count: signal_count },
          { name: "registry_signals", label: "Registry Signals", count: registry_signal_count },
          { name: "live_signals", label: "Live Signals", count: live_signal_count },
          { name: "legal_weak_joints", label: "Weak Joints", count: weak_joint_count },
          { name: "litigation_barriers", label: "Barriers", count: barrier_count },
          { name: "narrative_templates", label: "Narratives", count: narrative_count },
          { name: "pipeline_intelligence_map", label: "Pipeline Map", count: pipeline_map_count },
          { name: "pipeline_intake_enrichments", label: "Intake Enrichments", count: intake_enrich_count },
          { name: "timeline_rules", label: "Timeline Rules", count: timeline_rule_count },
          { name: "timeline_signals", label: "Timeline Signals", count: timeline_signal_count },
        ],
        total_records: signal_count + registry_signal_count + live_signal_count + weak_joint_count + barrier_count + narrative_count + pipeline_map_count + intake_enrich_count + timeline_rule_count + timeline_signal_count,
        status: (signal_count + registry_signal_count + live_signal_count + weak_joint_count) > 0 ? "populated" : "empty",
        color: "#6366f1",
      },
    ];

    const connections = [
      { from: "statutes", to: "case_law", label: "Statutes interpreted by case law", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "case_law", to: "claim_elements", label: "Case law defines claim elements", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "claim_elements", to: "proof_frameworks", label: "Elements proven through frameworks", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "proof_frameworks", to: "enforcement", label: "Frameworks guide enforcement pathways", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "enforcement", to: "regulatory", label: "Enforcement informed by guidance", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "regulatory", to: "investigation", label: "Guidance shapes investigation approach", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "investigation", to: "intelligence", label: "Investigation feeds signal detection", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "intelligence", to: "statutes", label: "Signals trigger statutory analysis (feedback loop)", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "statutes", to: "enforcement", label: "Statutes define agency authority", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "case_law", to: "proof_frameworks", label: "Precedent establishes proof standards", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "claim_elements", to: "investigation", label: "Elements drive investigation focus", relationship_state: "configured_dependency", verified_edge_count: null },
      { from: "intelligence", to: "proof_frameworks", label: "Weak joints expose proof gaps", relationship_state: "configured_dependency", verified_edge_count: null },
    ];

    const total_records = layers.reduce((sum, l) => sum + l.total_records, 0);
    const total_tables = layers.reduce((sum, l) => sum + l.tables.length, 0);
    const populated_layers = layers.filter(l => l.status === "populated").length;
    const seed_coverage_percent = Math.round((populated_layers / layers.length) * 100);

    return {
      layers,
      connections,
      summary: {
        total_records,
        total_tables,
        total_layers: layers.length,
        populated_layers,
        seed_coverage_percent,
        completion_percent: seed_coverage_percent,
        completion_label: "Seed coverage",
        completion_caveat: "Configured seed-layer coverage only. Not national/full-corpus completion.",
        current_substrate,
      },
    };
  }),
});
