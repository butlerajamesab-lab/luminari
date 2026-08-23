import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { db, getPool } from "../db";
import { read_signal_architecture } from "../signal-architecture-read-model";
import {
  SIGNAL_ARTIFACT_DOMAINS,
  SIGNAL_CASE_RELATIONSHIPS,
  connect_signal_artifact_to_case,
  list_case_signal_artifacts,
  list_signal_artifacts,
  read_signal_artifact,
} from "../signal-artifact-runtime";
import { list_filing_deadline_records } from "../filing-deadline-runtime-compat";
import { read_investigation_workflow } from "../investigation-workflow-runtime-compat";
import { read_enforcement_pathways } from "../enforcement-pathway-runtime-compat";
import {
  agencyForms, regulatoryGuidance, enforcementPenalties,
  enforcementViabilityRules,
  doctrineRegistry, doctrineGraphEdges,
  litigationBarriers, signalRegistry,
  agencyIntakeRules, interagencyReferrals, agencyCoordinationMatrix,
  enforcementPriorityIndex, enforcementTrends,
  contradictionTemplates, narrativeTemplates, workflowDefinitions,
  legalWeakJoints, legalContradictions, agencyAuthorityMap,
  agencyPerformanceMetrics, legalCaseLaw, checklistItems,
  detectedSignals, registrySignals, liveSignals, registryWorkflows,
} from "../../drizzle/schema";
import { eq, desc, sql, like, inArray, or, and } from "drizzle-orm";
import { missingRecords } from "../../drizzle/schema";

function parseTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => v != null).map(String);
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(v => v != null).map(String) : parsed == null ? [] : [String(parsed)];
  } catch {
    return [value.trim()];
  }
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function wireTime(value: unknown): string | number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : value;
  }
  return String(value);
}

type BarrierDto = {
  id: number | string; canonicalId: number | string;
  barrier_id: string | null; barrierId: string | null;
  barrier_type: string; barrierType: string; name: string;
  domains: string[]; domain: string; description: string;
  leading_authorities: string[]; leadingAuthorities: string[];
  what_it_blocks: string | null; whatItBlocks: string | null;
  common_trigger_patterns: string[]; commonTriggerPatterns: string[];
  usual_outcome: string[]; usualOutcome: string[]; severity: string;
  linked_weak_joints: string[]; linkedWeakJoints: string[];
  possible_workarounds: string[]; possibleWorkarounds: string[];
  notes: string | null; added_by: string | null; addedBy: string | null;
  created_at: string | number | null; createdAt: string | number | null;
  updated_at: string | number | null; updatedAt: string | number | null;
  legalBasis: string; affectedClaims: string[]; workaround: string;
  jurisdiction: string; affectedPopulation: string;
  severityRationale: string | null; reformStatus: string | null;
  sourceUrl: string | null; metadata: Record<string, unknown>;
  source: "barrier" | "weak_joint";
};

function mapLitigationBarrier(row: Record<string, any>): BarrierDto {
  const domains = parseTextList(row.domains);
  const leading = parseTextList(row.leading_authorities);
  const triggers = parseTextList(row.common_trigger_patterns);
  const outcomes = parseTextList(row.usual_outcome);
  const weakJoints = parseTextList(row.linked_weak_joints);
  const workarounds = parseTextList(row.possible_workarounds);
  const createdAt = wireTime(row.created_at);
  const updatedAt = wireTime(row.updated_at);
  const barrierId = row.barrier_id == null ? null : String(row.barrier_id);
  const barrierType = row.barrier_type == null ? "" : String(row.barrier_type);
  const whatItBlocks = row.what_it_blocks == null ? null : String(row.what_it_blocks);
  const addedBy = row.added_by == null ? null : String(row.added_by);
  return {
    id: Number(row.id), canonicalId: Number(row.id),
    barrier_id: barrierId, barrierId,
    barrier_type: barrierType, barrierType,
    name: String(row.name ?? ""), domains, domain: domains.join(", "),
    description: String(row.description ?? ""),
    leading_authorities: leading, leadingAuthorities: leading,
    what_it_blocks: whatItBlocks, whatItBlocks,
    common_trigger_patterns: triggers, commonTriggerPatterns: triggers,
    usual_outcome: outcomes, usualOutcome: outcomes,
    severity: String(row.severity ?? ""),
    linked_weak_joints: weakJoints, linkedWeakJoints: weakJoints,
    possible_workarounds: workarounds, possibleWorkarounds: workarounds,
    notes: row.notes == null ? null : String(row.notes),
    added_by: addedBy, addedBy,
    created_at: createdAt, createdAt, updated_at: updatedAt, updatedAt,
    legalBasis: leading.join("; "), affectedClaims: [], workaround: workarounds.join("; "),
    jurisdiction: "", affectedPopulation: "", severityRationale: null,
    reformStatus: null, sourceUrl: null, metadata: {}, source: "barrier",
  };
}

function mapLegalWeakJoint(row: Record<string, any>): BarrierDto {
  const metadata = metadataRecord(row.metadata);
  const domains = parseTextList(metadata.domains);
  const leading = parseTextList(metadata.leading_authorities);
  const triggers = parseTextList(metadata.common_trigger_patterns);
  const outcomes = parseTextList(metadata.usual_outcome);
  const weakJoints = parseTextList(metadata.linked_weak_joints);
  const workarounds = parseTextList(metadata.possible_workarounds);
  const canonicalId = String(row.id);
  const barrierId = row.weak_joint_id == null ? null : String(row.weak_joint_id);
  const createdAt = wireTime(row.created_at);
  const severityRationale = row.severity_rationale == null ? null : String(row.severity_rationale);
  const reformStatus = row.reform_status == null ? null : String(row.reform_status);
  const sourceUrl = row.source_url == null ? null : String(row.source_url);
  return {
    id: `wj_${canonicalId}`, canonicalId, barrier_id: barrierId, barrierId,
    barrier_type: "weak_joint", barrierType: "weak_joint",
    name: String(row.title ?? ""), domains, domain: domains.join(", "),
    description: String(row.description ?? ""),
    leading_authorities: leading, leadingAuthorities: leading,
    what_it_blocks: null, whatItBlocks: null,
    common_trigger_patterns: triggers, commonTriggerPatterns: triggers,
    usual_outcome: outcomes, usualOutcome: outcomes,
    severity: String(row.severity_level ?? ""),
    linked_weak_joints: weakJoints, linkedWeakJoints: weakJoints,
    possible_workarounds: workarounds, possibleWorkarounds: workarounds,
    notes: null, added_by: null, addedBy: null,
    created_at: createdAt, createdAt, updated_at: null, updatedAt: null,
    legalBasis: leading.join("; "), affectedClaims: [], workaround: workarounds.join("; "),
    jurisdiction: typeof metadata.jurisdiction === "string" ? metadata.jurisdiction : "",
    affectedPopulation: typeof metadata.affected_population === "string" ? metadata.affected_population : "",
    severityRationale, reformStatus, sourceUrl, metadata, source: "weak_joint",
  };
}

export const enforcementIntelligenceRouter = router({
  get_signal_architecture: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(24) }).optional())
    .query(({ input }) => read_signal_architecture(input?.limit ?? 24)),

  list_signal_artifacts: protectedProcedure
    .input(z.object({
      domain: z.enum(SIGNAL_ARTIFACT_DOMAINS).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
      query: z.string().trim().max(200).optional(),
    }))
    .query(({ input }) => list_signal_artifacts(input)),

  get_signal_artifact: protectedProcedure
    .input(z.object({
      domain: z.enum(SIGNAL_ARTIFACT_DOMAINS),
      record_id: z.string().uuid(),
    }))
    .query(({ input }) => read_signal_artifact(input.domain, input.record_id)),

  connect_signal_artifact_to_case: protectedProcedure
    .input(z.object({
      domain: z.enum(SIGNAL_ARTIFACT_DOMAINS),
      record_id: z.string().uuid(),
      case_id: z.number().int().positive(),
      relationship_type: z.enum(SIGNAL_CASE_RELATIONSHIPS),
      reviewer_notes: z.string().trim().max(2000).optional(),
    }))
    .mutation(({ ctx, input }) => connect_signal_artifact_to_case({
      ...input,
      user_id: ctx.user.id,
    })),

  list_case_signal_artifacts: protectedProcedure
    .input(z.object({ case_id: z.number().int().positive() }))
    .query(({ ctx, input }) => list_case_signal_artifacts({
      case_id: input.case_id,
      user_id: ctx.user.id,
    })),

  // ═══ Agency Forms ═══
  listForms: publicProcedure
    .input(z.object({ agency: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const where = input?.agency ? eq(agencyForms.agency_short, input.agency) : undefined;
      return db.select().from(agencyForms).where(where).orderBy(agencyForms.agency);
    }),

  getForm: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(agencyForms).where(eq(agencyForms.id, input.id));
      return row ?? null;
    }),

  // ═══ Regulatory Guidance ═══
  listGuidance: publicProcedure
    .input(z.object({ agency: z.string().optional(), issue_area: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input?.agency) conditions.push(eq(regulatoryGuidance.agency_short, input.agency));
      if (input?.issue_area) conditions.push(like(regulatoryGuidance.issue_area, `%${input.issue_area}%`));
      const where = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`) : undefined;
      return db.select().from(regulatoryGuidance).where(where).orderBy(regulatoryGuidance.agency);
    }),

  getGuidance: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(regulatoryGuidance).where(eq(regulatoryGuidance.id, input.id));
      return row ?? null;
    }),

  // ═══ Enforcement Penalties ═══
  listPenalties: publicProcedure
    .input(z.object({ agency: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const where = input?.agency ? eq(enforcementPenalties.agency_short, input.agency) : undefined;
      return db.select().from(enforcementPenalties).where(where).orderBy(enforcementPenalties.agency);
    }),

  getPenalty: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(enforcementPenalties).where(eq(enforcementPenalties.id, input.id));
      return row ?? null;
    }),

  // ═══ Enforcement Viability Rules ═══
  listViabilityRules: publicProcedure
    .input(z.object({ agency: z.string().optional(), pipeline_category: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input?.agency) conditions.push(eq(enforcementViabilityRules.agency_short, input.agency));
      if (input?.pipeline_category) conditions.push(eq(enforcementViabilityRules.pipeline_category, input.pipeline_category));
      const where = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`) : undefined;
      return db.select().from(enforcementViabilityRules).where(where);
    }),

  // ═══ Doctrine Graph ═══
  listDoctrines: publicProcedure.query(async () => {
    // Intentionally unbounded: doctrine_registry is the governed semantic
    // universe for this surface. UI pagination must never become a data cap.
    const { rows } = await getPool().query(`
      select
        id,
        name,
        description,
        primary_cases,
        domains,
        added_by,
        created_at,
        updated_at
      from public.doctrine_registry
      order by name
    `);
    return rows ?? [];
  }),

  getDoctrine: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(`
        select
          id,
          name,
          description,
          primary_cases,
          domains,
          added_by,
          created_at,
          updated_at
        from public.doctrine_registry
        where id = $1
        limit 1
      `, [input.id]);
      return rows[0] ?? null;
    }),

  listDoctrineEdges: publicProcedure
    .input(z.object({ edge_type: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const params: unknown[] = [];
      const where = input?.edge_type ? `where edge_type = $1` : "";
      if (input?.edge_type) params.push(input.edge_type);
      const { rows } = await getPool().query(`
        select
          id,
          from_type,
          from_id,
          edge_type,
          to_type,
          to_id,
          strength,
          notes,
          added_by,
          created_at,
          updated_at
        from public.doctrine_graph_edges
        ${where}
        order by from_type, edge_type
      `, params);
      return rows ?? [];
    }),

  getDoctrineGraph: publicProcedure.query(async () => {
    // Read every governed doctrine and every explicit doctrine edge. Broader
    // civic graph nodes stay in bounded canonical-core corpus readers, not here.
    const [doctrineResult, edgeResult] = await Promise.all([
      getPool().query(`
        select
          id,
          name,
          description,
          primary_cases,
          domains,
          added_by,
          created_at,
          updated_at
        from public.doctrine_registry
        order by name
      `),
      getPool().query(`
        select
          id,
          from_type,
          from_id,
          edge_type,
          to_type,
          to_id,
          strength,
          notes,
          added_by,
          created_at,
          updated_at
        from public.doctrine_graph_edges
        order by from_type, edge_type
      `),
    ]);
    const doctrines = doctrineResult.rows ?? [];
    const edges = edgeResult.rows ?? [];
    // Group edges by from_type for visualization
    const byFromType: Record<string, typeof edges> = {};
    for (const e of edges) {
      const key = `${e.from_type}:${e.from_id}`;
      if (!byFromType[key]) byFromType[key] = [];
      byFromType[key].push(e);
    }
    return { doctrines, edges, groups: byFromType };
  }),

  // ═══ Litigation Barriers ═══
  listBarriers: publicProcedure.query(async () => {
    return db.select().from(litigationBarriers).orderBy(litigationBarriers.barrier_type);
  }),

  getBarrier: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(litigationBarriers).where(eq(litigationBarriers.id, input.id));
      return row ?? null;
    }),

  // ═══ Signal Registry ═══
  listSignals: publicProcedure.query(async () => {
    return db.select().from(signalRegistry)
      .where(sql`"signal_type" NOT LIKE 'contradiction_%' AND "signal_type" NOT LIKE 'missing_evidence_%' AND "signal_type" NOT LIKE 'inconsistency_%'`)
      .orderBy(signalRegistry.signal_type);
  }),

  getSignal: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(signalRegistry).where(eq(signalRegistry.id, input.id));
      return row ?? null;
    }),

  // ═══ Contradiction Templates ═══
  listContradictionTemplates: publicProcedure.query(async () => {
    return db.select().from(contradictionTemplates).orderBy(contradictionTemplates.name);
  }),

  // ═══ Narrative Templates ═══
  listNarrativeTemplates: publicProcedure.query(async () => {
    return db.select().from(narrativeTemplates).orderBy(narrativeTemplates.name);
  }),

  // ═══ Workflow Definitions ═══
  listWorkflows: publicProcedure.query(async () => {
    return db.select().from(workflowDefinitions).orderBy(workflowDefinitions.name);
  }),

  getWorkflow: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, input.id));
      return row ?? null;
    }),

  // ═══ Agency Intake Rules ═══
  listIntakeRules: publicProcedure.query(async () => {
    return db.select().from(agencyIntakeRules).orderBy(agencyIntakeRules.agency);
  }),

  // ═══ Interagency Referrals ═══
  listReferrals: publicProcedure.query(async () => {
    return db.select().from(interagencyReferrals).orderBy(interagencyReferrals.originAgency);
  }),

  // ═══ Agency Coordination Matrix ═══
  listCoordination: publicProcedure.query(async () => {
    return db.select().from(agencyCoordinationMatrix);
  }),

  // ═══ Enforcement Priority Index ═══
  listPriorities: publicProcedure.query(async () => {
    return db.select().from(enforcementPriorityIndex).orderBy(enforcementPriorityIndex.agency);
  }),

  // ═══ Enforcement Trends ═══
  listTrends: publicProcedure.query(async () => {
    return db.select().from(enforcementTrends).orderBy(enforcementTrends.agency);
  }),

  // ═══ Deadline Calculator ═══
  calculateDeadline: publicProcedure
    .input(z.object({
      incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      formId: z.number().int().positive().optional(),
      agencyShort: z.string().min(1).optional(),
      agency_short: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return list_filing_deadline_records({
        incidentDate: input.incidentDate,
        asOfDate: input.asOfDate,
        formId: input.formId,
        agencyShort: input.agencyShort ?? input.agency_short,
      });
    }),

  // ═══ Cross-Link: Gap → Enforcement Resources ═══
  suggestResourcesForGap: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
      gapType: z.string().optional(),
      agencyType: z.string().optional(),
      severity: z.string().optional(),
    }))
    .query(async ({ input }) => {
      // Map domains to pipeline categories
      const domainToPipeline: Record<string, string[]> = {
        'civil_rights': ['civil_rights'],
        'employment': ['civil_rights'],
        'housing': ['civil_rights'],
        'criminal_justice': ['justice'],
        'consumer': ['justice'],
        'benefits': ['justice', 'civil_rights'],
        'disability': ['civil_rights'],
        'foia': ['justice'],
        'immigration': ['justice'],
        'family': ['justice'],
      };

      const pipelineCategories = input.domain ? (domainToPipeline[input.domain] || []) : [];

      // Fetch matching forms
      const matchingForms = pipelineCategories.length > 0
        ? await db.select().from(agencyForms).where(inArray(agencyForms.pipeline_category, pipelineCategories))
        : await db.select().from(agencyForms);

      // Fetch matching guidance
      const matchingGuidance = pipelineCategories.length > 0
        ? await db.select().from(regulatoryGuidance).where(inArray(regulatoryGuidance.pipeline_category, pipelineCategories))
        : await db.select().from(regulatoryGuidance);

      // Fetch matching penalties
      const matchingPenalties = pipelineCategories.length > 0
        ? await db.select().from(enforcementPenalties).where(inArray(enforcementPenalties.pipeline_category, pipelineCategories))
        : await db.select().from(enforcementPenalties);

      // Fetch matching viability rules
      const matchingViability = pipelineCategories.length > 0
        ? await db.select().from(enforcementViabilityRules).where(inArray(enforcementViabilityRules.pipeline_category, pipelineCategories))
        : await db.select().from(enforcementViabilityRules);

      // Fetch matching barriers
      const allBarriers = await db.select().from(litigationBarriers);
      const matchingBarriers = input.domain
        ? allBarriers.filter((b: any) => {
            const domains = b.domains as string[];
            return domains?.includes(input.domain!);
          })
        : allBarriers;

      return {
        domain: input.domain,
        gap_type: input.gapType,
        forms: matchingForms,
        guidance: matchingGuidance,
        penalties: matchingPenalties,
        viability_rules: matchingViability,
        barriers: matchingBarriers,
        total_resources: matchingForms.length + matchingGuidance.length + matchingPenalties.length + matchingViability.length + matchingBarriers.length,
      };
    }),

  // ═══ Cross-Link: Case Missing Records → Resources ═══
  suggestResourcesForCase: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      // Get missing records for the case
      const gaps = await db.select().from(missingRecords).where(eq(missingRecords.caseId, input.caseId));

      if (gaps.length === 0) return { gaps: [], suggestions: [] };

      // Collect unique domains from gaps
      const domains = [...new Set(gaps.map((g: any) => g.domain).filter(Boolean))] as string[];

      const domainToPipeline: Record<string, string[]> = {
        'civil_rights': ['civil_rights'],
        'employment': ['civil_rights'],
        'housing': ['civil_rights'],
        'criminal_justice': ['justice'],
        'consumer': ['justice'],
        'benefits': ['justice', 'civil_rights'],
        'disability': ['civil_rights'],
        'foia': ['justice'],
        'immigration': ['justice'],
        'family': ['justice'],
      };

      const allPipelineCategories = [...new Set(domains.flatMap(d => domainToPipeline[d] || []))];

      const [forms, guidanceDocs, penalties, viability_rules] = await Promise.all([
        allPipelineCategories.length > 0
          ? db.select().from(agencyForms).where(inArray(agencyForms.pipeline_category, allPipelineCategories))
          : db.select().from(agencyForms),
        allPipelineCategories.length > 0
          ? db.select().from(regulatoryGuidance).where(inArray(regulatoryGuidance.pipeline_category, allPipelineCategories))
          : db.select().from(regulatoryGuidance),
        allPipelineCategories.length > 0
          ? db.select().from(enforcementPenalties).where(inArray(enforcementPenalties.pipeline_category, allPipelineCategories))
          : db.select().from(enforcementPenalties),
        allPipelineCategories.length > 0
          ? db.select().from(enforcementViabilityRules).where(inArray(enforcementViabilityRules.pipeline_category, allPipelineCategories))
          : db.select().from(enforcementViabilityRules),
      ]);

      return {
        gaps: gaps.map((g: any) => ({
          id: g.id,
          domain: g.domain,
          record_type: g.recordType,
          label: g.label,
          severity: g.severity,
          agency_type: g.agencyType,
        })),
        suggestions: {
          forms,
          guidance: guidanceDocs,
          penalties,
          viability_rules,
        },
        domains,
        pipeline_categories: allPipelineCategories,
      };
    }),

  // ═══════════════════════════════════════════════════════════════
  // IMPROVEMENT 1: Contradiction Scoring Engine
  // Weighted model: legal severity (25), evidence strength (25),
  // timeline support (20), cross-doc corroboration (20), systemic risk (10)
  // ═══════════════════════════════════════════════════════════════

  scoreContradiction: publicProcedure
    .input(z.object({
      contradictionId: z.number().optional(),
      // Or provide raw contradiction data for ad-hoc scoring
      doctrineA: z.string().optional(),
      doctrineB: z.string().optional(),
      domain: z.string().optional(),
      jurisdiction: z.string().optional(),
      // Evidence context
      hasDirectEvidence: z.boolean().default(false),
      hasCorroboratingDocs: z.boolean().default(false),
      docCount: z.number().default(1),
      hasTimelineSupport: z.boolean().default(false),
      timelineGapDays: z.number().optional(),
      // Systemic indicators
      affectsMultipleParties: z.boolean().default(false),
      hasPatternEvidence: z.boolean().default(false),
      linkedToWeakJoint: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      // If contradictionId provided, load from DB
      let contradiction: any = null;
      if (input.contradictionId) {
        const rows = await db.select().from(legalContradictions).where(eq(legalContradictions.id, input.contradictionId));
        contradiction = rows[0] ?? null;
      }

      // ── Dimension 1: Legal Severity (0-25) ──
      let legal_severity = 10; // baseline
      const domain = input.domain || (contradiction?.domains as string[])?.[0] || 'general';
      const highSeverityDomains = ['criminal_justice', 'civil_rights', 'housing', 'employment'];
      if (highSeverityDomains.includes(domain)) legal_severity += 5;
      // Check if linked to constitutional doctrine
      if (contradiction?.doctrine_a_citation?.includes('Const') || contradiction?.doctrine_b_citation?.includes('Const')) legal_severity += 5;
      // Check if linked to a known weak joint
      if (input.linkedToWeakJoint) legal_severity += 5;
      legal_severity = Math.min(25, legal_severity);

      // ── Dimension 2: Evidence Strength (0-25) ──
      let evidence_strength = 5; // baseline
      if (input.hasDirectEvidence) evidence_strength += 10;
      if (input.docCount > 3) evidence_strength += 5;
      else if (input.docCount > 1) evidence_strength += 3;
      if (input.hasCorroboratingDocs) evidence_strength += 7;
      evidence_strength = Math.min(25, evidence_strength);

      // ── Dimension 3: Timeline Support (0-20) ──
      let timeline_support = 5; // baseline
      if (input.hasTimelineSupport) timeline_support += 10;
      if (input.timelineGapDays !== undefined) {
        if (input.timelineGapDays <= 30) timeline_support += 5; // tight temporal proximity
        else if (input.timelineGapDays <= 90) timeline_support += 3;
      }
      timeline_support = Math.min(20, timeline_support);

      // ── Dimension 4: Cross-Document Corroboration (0-20) ──
      let corroboration = 5; // baseline
      if (input.hasCorroboratingDocs) corroboration += 8;
      if (input.docCount > 5) corroboration += 7;
      else if (input.docCount > 2) corroboration += 4;
      corroboration = Math.min(20, corroboration);

      // ── Dimension 5: Systemic Risk (0-10) ──
      let systemic_risk = 2; // baseline
      if (input.affectsMultipleParties) systemic_risk += 3;
      if (input.hasPatternEvidence) systemic_risk += 3;
      if (input.linkedToWeakJoint) systemic_risk += 2;
      systemic_risk = Math.min(10, systemic_risk);

      const total_score = legal_severity + evidence_strength + timeline_support + corroboration + systemic_risk;

      let severity: 'critical' | 'high' | 'medium' | 'low';
      if (total_score >= 75) severity = 'critical';
      else if (total_score >= 55) severity = 'high';
      else if (total_score >= 35) severity = 'medium';
      else severity = 'low';

      return {
        contradiction_id: input.contradictionId ?? null,
        title: contradiction?.title ?? `${input.doctrineA ?? 'Unknown'} vs. ${input.doctrineB ?? 'Unknown'}`,
        domain,
        total_score,
        severity,
        dimensions: {
          legal_severity: { score: legal_severity, max: 25, weight: '25%' },
          evidence_strength: { score: evidence_strength, max: 25, weight: '25%' },
          timeline_support: { score: timeline_support, max: 20, weight: '20%' },
          corroboration: { score: corroboration, max: 20, weight: '20%' },
          systemic_risk: { score: systemic_risk, max: 10, weight: '10%' },
        },
        recommendation: total_score >= 75
          ? 'Immediate investigation priority — strong evidence of systemic contradiction'
          : total_score >= 55
            ? 'High priority — sufficient evidence to warrant formal review'
            : total_score >= 35
              ? 'Monitor — gather additional evidence before escalation'
              : 'Low priority — insufficient evidence for current action',
      };
    }),

  // Batch score all contradictions in the library
  scoreAllContradictions: publicProcedure.query(async () => {
    const contradictions = await db.select().from(legalContradictions);
    return contradictions.map((c: any) => {
      const domains = c.domains as string[];
      const domain = domains?.[0] || 'general';
      const highSeverityDomains = ['criminal_justice', 'civil_rights', 'housing', 'employment'];

      let legal_severity = 10;
      if (highSeverityDomains.includes(domain)) legal_severity += 5;
      if (c.doctrine_a_citation?.includes('Const') || c.doctrine_b_citation?.includes('Const')) legal_severity += 5;
      legal_severity = Math.min(25, legal_severity);

      // Without case-specific evidence, use baseline scores
      const evidence_strength = 10;
      const timeline_support = 5;
      const corroboration = 5;

      let systemic_risk = 2;
      if (c.harm_description && c.harm_description.length > 100) systemic_risk += 3;
      if (c.reform_status && c.reform_status.toLowerCase().includes('no reform')) systemic_risk += 3;
      systemic_risk = Math.min(10, systemic_risk);

      const total_score = legal_severity + evidence_strength + timeline_support + corroboration + systemic_risk;

      let severity: 'critical' | 'high' | 'medium' | 'low';
      if (total_score >= 75) severity = 'critical';
      else if (total_score >= 55) severity = 'high';
      else if (total_score >= 35) severity = 'medium';
      else severity = 'low';

      return {
        id: c.id,
        title: c.title,
        domain,
        jurisdiction: c.jurisdiction,
        total_score,
        severity,
        legal_severity,
        evidence_strength,
        timeline_support,
        corroboration,
        systemic_risk,
      };
    }).sort((a: any, b: any) => b.total_score - a.total_score);
  }),

  // ═══ Source-bound enforcement pathway reference snapshot ═══
  getEnforcementPathway: publicProcedure
    .input(z.object({
      agencyShort: z.string().trim().min(1).optional(),
      claimType: z.string().trim().min(1).optional(),
      pipelineCategory: z.string().trim().min(1).optional(),
    }).refine(input => [
      input.agencyShort,
      input.claimType,
      input.pipelineCategory,
    ].filter(Boolean).length <= 1, {
      message: "Select only one enforcement pathway filter at a time",
    }))
    .query(({ input }) => read_enforcement_pathways(input)),

  // ═══ List ALL enforcement pathway models from DB ═══
  listAllPathways: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      domain: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const snapshot = await read_enforcement_pathways({});
      const jurisdiction = input?.jurisdiction?.trim().toLowerCase();
      const domain = input?.domain?.trim().toLowerCase();
      return snapshot.pathways.filter(pathway =>
        (!jurisdiction || pathway.jurisdiction?.toLowerCase().includes(jurisdiction))
        && (!domain || pathway.domain?.toLowerCase().includes(domain)),
      );
    }),

  // ═══ Agencies with an operative filing form ═══
  listAgencies: publicProcedure
    .query(async () => {
      const { rows } = await getPool().query(`
        select agency_short, min(agency) as agency_name
          from public.agency_forms
         where nullif(btrim(agency_short), '') is not null
           and nullif(btrim(agency), '') is not null
         group by agency_short
         order by agency_short
      `);
      return rows.map((row: any) => ({
        id: String(row.agency_short),
        agencyName: String(row.agency_name),
        agencyShort: String(row.agency_short),
      }));
    }),

  // ═══ Source-bound investigation workflow ═══
  generateInvestigationWorkflow: publicProcedure
    .input(z.object({
      domain: z.string().trim().min(1),
      claimType: z.string().trim().min(1).optional(),
      incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hasDocuments: z.boolean().default(false),
      hasWitnesses: z.boolean().default(false),
      agencyShort: z.string().trim().min(1).optional(),
    }))
    .query(({ input }) => read_investigation_workflow(input)),

  // ═══ Combined Stats ═══
  stats: publicProcedure.query(async () => {
    const counts = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(agencyForms),
      db.select({ count: sql<number>`COUNT(*)` }).from(regulatoryGuidance),
      db.select({ count: sql<number>`COUNT(*)` }).from(enforcementPenalties),
      db.select({ count: sql<number>`COUNT(*)` }).from(enforcementViabilityRules),
      db.select({ count: sql<number>`COUNT(*)` }).from(doctrineRegistry),
      db.select({ count: sql<number>`COUNT(*)` }).from(doctrineGraphEdges),
      db.select({ count: sql<number>`COUNT(*)` }).from(litigationBarriers),
      db.select({ count: sql<number>`COUNT(*)` }).from(signalRegistry),
      db.select({ count: sql<number>`COUNT(*)` }).from(contradictionTemplates),
      db.select({ count: sql<number>`COUNT(*)` }).from(narrativeTemplates),
      db.select({ count: sql<number>`COUNT(*)` }).from(workflowDefinitions),
    ]);
    return {
      forms: counts[0][0]?.count ?? 0,
      guidance: counts[1][0]?.count ?? 0,
      penalties: counts[2][0]?.count ?? 0,
      viability_rules: counts[3][0]?.count ?? 0,
      doctrines: counts[4][0]?.count ?? 0,
      doctrine_edges: counts[5][0]?.count ?? 0,
      barriers: counts[6][0]?.count ?? 0,
      signals: counts[7][0]?.count ?? 0,
      contradiction_templates: counts[8][0]?.count ?? 0,
      narrative_templates: counts[9][0]?.count ?? 0,
      workflows: counts[10][0]?.count ?? 0,
    };
  }),

  // ═══ Detected Signals (Sunam-approved, canonical source) ═══
  getLiveSignals: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      datasetId: z.string().optional(),
      activeOnly: z.boolean().default(true),
    }).optional())
    .query(async ({ input }) => {
      const opts = input ?? {};
      const conditions = [];
      // detected_signals has no 'active' column — all rows are approved
      // @ts-ignore pre-existing type mismatch
      if (opts.severity) conditions.push(eq((detectedSignals as any).severityLevel, opts.severity));
      // @ts-ignore pre-existing type mismatch
      if (opts.datasetId) conditions.push(eq((detectedSignals as any).datasetId, opts.datasetId));
      const rows = await db
        .select()
        .from(detectedSignals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc((detectedSignals as any).detectionTimestamp))
        // @ts-ignore pre-existing type mismatch
        .limit(opts.limit ?? 100)
        // @ts-ignore pre-existing type mismatch
        .offset(opts.offset ?? 0);
      return rows;
    }),

  getLiveSignalStats: publicProcedure.query(async () => {
    const [total, critical, high, medium, low, byDataset] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(detectedSignals),
      db.select({ count: sql<number>`COUNT(*)` }).from(detectedSignals).where(eq((detectedSignals as any).severityLevel, "critical")),
      db.select({ count: sql<number>`COUNT(*)` }).from(detectedSignals).where(eq((detectedSignals as any).severityLevel, "high")),
      db.select({ count: sql<number>`COUNT(*)` }).from(detectedSignals).where(eq((detectedSignals as any).severityLevel, "medium")),
      db.select({ count: sql<number>`COUNT(*)` }).from(detectedSignals).where(eq((detectedSignals as any).severityLevel, "low")),
      db.select({ datasetId: (detectedSignals as any).datasetId, count: sql<number>`COUNT(*)` })
        .from(detectedSignals)
        .groupBy((detectedSignals as any).datasetId),
    ]);
    return {
      total: total[0]?.count ?? 0,
      by_severity: { critical: critical[0]?.count ?? 0, high: high[0]?.count ?? 0, medium: medium[0]?.count ?? 0, low: low[0]?.count ?? 0 },
      by_dataset: byDataset.map((r: any) => ({ dataset_id: r.datasetId, count: r.count })),
    };
  }),

  getLiveSignal: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(detectedSignals).where(eq((detectedSignals as any).signalId, input.id)).limit(1);
      return row ?? null;
    }),

  // ═══ Registry Signals (per-jurisdiction instances, 59 rows) ═══
  listRegistrySignals: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      category: z.string().optional(),
      severity: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }).optional())
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input?.jurisdiction) conditions.push(eq(registrySignals.jurisdictionId, input.jurisdiction));
      if (input?.category) conditions.push(eq(registrySignals.category, input.category));
      if (input?.severity) conditions.push(eq(registrySignals.severity, input.severity as any));
      return db.select().from(registrySignals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(registrySignals.createdAt))
        .limit(input?.limit ?? 100);
    }),

  // ═══ Registry Workflows (27 workflows) ═══
  listRegistryWorkflows: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
      jurisdiction: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input?.domain) conditions.push(like(registryWorkflows.workflowType, `%${input.domain}%`));
      if (input?.jurisdiction) conditions.push(eq(registryWorkflows.jurisdictionId, input.jurisdiction));
      return db.select().from(registryWorkflows)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(registryWorkflows.workflowType);
    }),

  getRegistryWorkflow: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(registryWorkflows).where(eq(registryWorkflows.id, input.id));
      return row ?? null;
    }),

  // ═══ Litigation Barriers + Weak Joints combined ═══
  listAllBarriers: publicProcedure
    .input(z.object({
      barrier_type: z.string().optional(),
      domain: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const [barrierResult, weakJointResult] = await Promise.all([
        getPool().query(`
          select id, barrier_id, name, barrier_type, domains, description,
                 leading_authorities, what_it_blocks, common_trigger_patterns,
                 usual_outcome, severity, linked_weak_joints,
                 possible_workarounds, notes, added_by, created_at, updated_at
            from public.litigation_barriers
           order by barrier_type, name, id
        `),
        getPool().query(`
          select id, weak_joint_id, title, description, severity_level,
                 severity_rationale, reform_status, metadata, source_url, created_at
            from public.legal_weak_joints
           order by severity_level, title, id
        `),
      ]);
      const normalizedBarriers = barrierResult.rows.map(mapLitigationBarrier);
      const normalizedWeak = weakJointResult.rows.map(mapLegalWeakJoint);
      let combined = [...normalizedBarriers, ...normalizedWeak];
      if (input?.barrier_type && input.barrier_type !== 'all') {
        combined = combined.filter(b => b.barrier_type === input.barrier_type || b.source === input.barrier_type);
      }
      if (input?.domain) {
        combined = combined.filter(b => b.domain?.toLowerCase().includes(input.domain!.toLowerCase()));
      }
      if (input?.search) {
        const s = input.search.toLowerCase();
        combined = combined.filter(b => b.name?.toLowerCase().includes(s) || b.description?.toLowerCase().includes(s));
      }
      return combined;
    }),
});
