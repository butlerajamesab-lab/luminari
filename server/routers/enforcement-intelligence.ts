import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { db, getPool } from "../db";
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
  enforcementPathwayModels,
} from "../../drizzle/schema";
import { eq, desc, sql, like, inArray, or, and } from "drizzle-orm";
import { missingRecords } from "../../drizzle/schema";

export const enforcementIntelligenceRouter = router({
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
      incidentDate: z.string(), // ISO date string
      formId: z.number().optional(),
      agency_short: z.string().optional(),
    }))
    .query(async ({ input }) => {
      // Get all forms or a specific one
      const forms = input.formId
        ? await db.select().from(agencyForms).where(eq(agencyForms.id, input.formId))
        : input.agency_short
          ? await db.select().from(agencyForms).where(eq(agencyForms.agency_short, input.agency_short))
          : await db.select().from(agencyForms);

      const incident = new Date(input.incidentDate);
      const now = new Date();

      // Parse deadline rules for each form
      const deadlineRules: Array<{
        primaryDays: number | null;
        extendedDays: number | null;
        extendedCondition: string | null;
        noDeadline: boolean;
        rawText: string;
      }> = [];

      const deadlineMap: Record<string, { primaryDays: number | null; extendedDays: number | null; extendedCondition: string | null; noDeadline: boolean }> = {
        'EEOC': { primaryDays: 180, extendedDays: 300, extendedCondition: 'In deferral states with state/local agency', noDeadline: false },
        'HUD': { primaryDays: 365, extendedDays: 730, extendedCondition: 'For federal civil lawsuit', noDeadline: false },
        'OSHA': { primaryDays: 30, extendedDays: null, extendedCondition: 'For whistleblower retaliation under Section 11(c); no strict deadline for general safety complaints', noDeadline: false },
        'FTC': { primaryDays: null, extendedDays: null, extendedCondition: null, noDeadline: true },
      };

      return forms.map((f: any) => {
        const rule = deadlineMap[f.agency_short] || { primaryDays: null, extendedDays: null, extendedCondition: null, noDeadline: true };

        const daysSinceIncident = Math.floor((now.getTime() - incident.getTime()) / (1000 * 60 * 60 * 24));

        const primaryDeadlineDate = rule.primaryDays ? new Date(incident.getTime() + rule.primaryDays * 24 * 60 * 60 * 1000) : null;
        const extendedDeadlineDate = rule.extendedDays ? new Date(incident.getTime() + rule.extendedDays * 24 * 60 * 60 * 1000) : null;

        const primaryDaysRemaining = primaryDeadlineDate ? Math.floor((primaryDeadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
        const extendedDaysRemaining = extendedDeadlineDate ? Math.floor((extendedDeadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

        let urgency: 'expired' | 'critical' | 'warning' | 'safe' | 'no_deadline' = 'no_deadline';
        if (rule.noDeadline) {
          urgency = 'no_deadline';
        } else if (primaryDaysRemaining !== null) {
          if (primaryDaysRemaining < 0) urgency = 'expired';
          else if (primaryDaysRemaining <= 30) urgency = 'critical';
          else if (primaryDaysRemaining <= 90) urgency = 'warning';
          else urgency = 'safe';
        }

        return {
          formId: f.id,
          agency: f.agency,
          agency_short: f.agency_short,
          form_name: f.form_name,
          filing_deadlineText: f.filing_deadline,
          incidentDate: input.incidentDate,
          daysSinceIncident,
          primaryDeadlineDays: rule.primaryDays,
          primaryDeadlineDate: primaryDeadlineDate?.toISOString().split('T')[0] ?? null,
          primaryDaysRemaining,
          extendedDeadlineDays: rule.extendedDays,
          extendedDeadlineDate: extendedDeadlineDate?.toISOString().split('T')[0] ?? null,
          extendedDaysRemaining,
          extendedCondition: rule.extendedCondition,
          noDeadline: rule.noDeadline,
          urgency,
        };
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
        gapType: input.gapType,
        forms: matchingForms,
        guidance: matchingGuidance,
        penalties: matchingPenalties,
        viability_rules: matchingViability,
        barriers: matchingBarriers,
        totalResources: matchingForms.length + matchingGuidance.length + matchingPenalties.length + matchingViability.length + matchingBarriers.length,
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
          recordType: g.recordType,
          label: g.label,
          severity: g.severity,
          agencyType: g.agencyType,
        })),
        suggestions: {
          forms,
          guidance: guidanceDocs,
          penalties,
          viability_rules,
        },
        domains,
        pipelineCategories: allPipelineCategories,
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
        contradictionId: input.contradictionId ?? null,
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

  // ═══════════════════════════════════════════════════════════════
  // IMPROVEMENT 2: Enforcement Pattern Model Switching
  // 4 models: EEOC charge, HUD adjudication, OSHA inspection, FTC oversight
  // ═══════════════════════════════════════════════════════════════

  getEnforcementPathway: publicProcedure
    .input(z.object({
      agency_short: z.string().optional(),
      claim_type: z.string().optional(),
      pipeline_category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      // Define the 4 enforcement pathway models
      const pathwayModels: Record<string, {
        modelName: string;
        modelType: string;
        description: string;
        steps: Array<{ step: number; name: string; description: string; typicalDuration: string; userAction: string }>;
        keyDeadlines: string[];
        typicalOutcomes: string[];
        successRate: string;
      }> = {
        'EEOC': {
          modelName: 'Civil Rights Charge Model',
          modelType: 'charge',
          description: 'File a formal charge of discrimination. EEOC investigates and either mediates, litigates, or issues a Right to Sue letter.',
          steps: [
            { step: 1, name: 'Charge Filing', description: 'File a formal Charge of Discrimination (Form 5) with the EEOC', typicalDuration: '1-2 weeks', userAction: 'Complete Form 5 with incident details, respondent info, and basis of discrimination' },
            { step: 2, name: 'Mediation Offer', description: 'EEOC may offer voluntary mediation before investigation', typicalDuration: '1-3 months', userAction: 'Decide whether to accept mediation or proceed to investigation' },
            { step: 3, name: 'Investigation', description: 'EEOC investigator reviews evidence, interviews witnesses, requests employer records', typicalDuration: '6-18 months', userAction: 'Respond to investigator requests, provide additional evidence' },
            { step: 4, name: 'Determination', description: 'EEOC issues finding: reasonable cause or no reasonable cause', typicalDuration: '1-2 months after investigation', userAction: 'Review determination letter' },
            { step: 5, name: 'Conciliation / Right to Sue', description: 'If cause found, EEOC attempts conciliation. If no cause or conciliation fails, issues Right to Sue letter.', typicalDuration: '30-60 days', userAction: 'If Right to Sue issued, file federal lawsuit within 90 days' },
            { step: 6, name: 'Federal Litigation', description: 'File civil lawsuit in federal court (if Right to Sue issued)', typicalDuration: '1-3 years', userAction: 'Retain attorney, file complaint within 90-day window' },
          ],
          keyDeadlines: ['180/300 days to file charge', '90 days to file lawsuit after Right to Sue'],
          typicalOutcomes: ['Mediated settlement', 'EEOC-negotiated conciliation', 'Federal court judgment', 'Consent decree'],
          successRate: 'EEOC finds reasonable cause in ~15-20% of charges; ~50% resolved through mediation when accepted',
        },
        'HUD': {
          modelName: 'Administrative Adjudication Model',
          modelType: 'adjudication',
          description: 'File a housing discrimination complaint. HUD investigates, attempts conciliation, and if unresolved, refers to an Administrative Law Judge or DOJ.',
          steps: [
            { step: 1, name: 'Complaint Filing', description: 'File a housing discrimination complaint (Form 903) with HUD FHEO', typicalDuration: '1-2 weeks', userAction: 'Complete Form 903 with property details, discriminatory acts, and basis' },
            { step: 2, name: 'Investigation', description: 'HUD investigates the complaint within 100 days', typicalDuration: '100 days (statutory target)', userAction: 'Cooperate with investigator, provide evidence and witness info' },
            { step: 3, name: 'Conciliation', description: 'HUD attempts to resolve through voluntary conciliation agreement', typicalDuration: '30-90 days', userAction: 'Negotiate terms of conciliation if offered' },
            { step: 4, name: 'Charge / Election', description: 'If conciliation fails, HUD issues a charge. Parties may elect federal court trial.', typicalDuration: '20 days to elect', userAction: 'Decide: Administrative Law Judge hearing or federal court' },
            { step: 5, name: 'ALJ Hearing / DOJ Litigation', description: 'Case heard by HUD ALJ or, if elected, DOJ files suit in federal court', typicalDuration: '6-18 months', userAction: 'Participate in hearing or litigation' },
          ],
          keyDeadlines: ['1 year to file complaint', '2 years for federal civil lawsuit'],
          typicalOutcomes: ['Conciliation agreement', 'ALJ order with penalties up to $150K+', 'DOJ consent decree', 'Federal court judgment'],
          successRate: 'HUD finds reasonable cause in ~3-5% of complaints; ~30% resolved through conciliation',
        },
        'OSHA': {
          modelName: 'Regulatory Inspection Model',
          modelType: 'inspection',
          description: 'File a safety complaint or whistleblower retaliation complaint. OSHA inspects the workplace and issues citations with penalties.',
          steps: [
            { step: 1, name: 'Complaint Filing', description: 'File a safety complaint online, by phone, or in writing. For retaliation: file within 30 days.', typicalDuration: '1 day', userAction: 'Describe hazard or retaliation, identify employer and location' },
            { step: 2, name: 'Triage / Prioritization', description: 'OSHA prioritizes based on severity: imminent danger, fatalities, complaints, referrals, planned', typicalDuration: '1-7 days', userAction: 'Respond to any follow-up questions from OSHA' },
            { step: 3, name: 'Workplace Inspection', description: 'OSHA compliance officer conducts on-site inspection', typicalDuration: '1-4 weeks after triage', userAction: 'May participate as employee representative during inspection' },
            { step: 4, name: 'Citation Issuance', description: 'If violations found, OSHA issues citations with proposed penalties', typicalDuration: '6 months (statutory limit)', userAction: 'Review citations and penalties' },
            { step: 5, name: 'Abatement / Contest', description: 'Employer must abate hazards by deadline or contest citations', typicalDuration: '15 working days to contest', userAction: 'Monitor abatement; if employer contests, may participate in hearing' },
          ],
          keyDeadlines: ['30 days for whistleblower retaliation', 'No strict deadline for safety complaints', '6 months for OSHA to issue citations'],
          typicalOutcomes: ['Citation with monetary penalty', 'Compliance order', 'Willful violation penalty up to $156K+', 'Settlement agreement'],
          successRate: 'OSHA issues citations in ~30-40% of inspections; whistleblower complaints have ~2-3% merit finding rate',
        },
        'FTC': {
          modelName: 'Market Oversight Model',
          modelType: 'oversight',
          description: 'Consumer complaints feed into FTC pattern detection. FTC investigates companies showing patterns of deceptive or unfair practices.',
          steps: [
            { step: 1, name: 'Consumer Complaint', description: 'File a consumer complaint through FTC Consumer Sentinel or ReportFraud.ftc.gov', typicalDuration: '1 day', userAction: 'Describe the deceptive practice, company, financial harm' },
            { step: 2, name: 'Pattern Detection', description: 'FTC aggregates complaints to identify companies with systemic violations', typicalDuration: 'Ongoing', userAction: 'No individual action — complaints feed aggregate analysis' },
            { step: 3, name: 'Investigation', description: 'FTC opens formal investigation using Civil Investigative Demands (CIDs)', typicalDuration: '6-24 months', userAction: 'May be contacted as witness if FTC opens investigation' },
            { step: 4, name: 'Corporate Enforcement', description: 'FTC files enforcement action seeking injunction and consumer redress', typicalDuration: '1-3 years', userAction: 'May receive restitution if enforcement succeeds' },
            { step: 5, name: 'Consent Decree / Order', description: 'Company agrees to consent decree with behavioral requirements and penalties', typicalDuration: 'Ongoing compliance', userAction: 'Report future violations of consent decree' },
          ],
          keyDeadlines: ['No individual filing deadline', 'FTC has 3-year SOL for monetary penalties under Section 19'],
          typicalOutcomes: ['Consent decree', 'Consumer redress fund', 'Injunctive relief', 'Civil penalties up to $50K+ per violation'],
          successRate: 'Individual complaints rarely trigger direct action; pattern-based enforcement targets ~50-100 companies/year',
        },
      };

      // If specific agency requested, return that model
      if (input.agency_short && pathwayModels[input.agency_short]) {
        return {
          matchedBy: 'agency',
          pathways: [{ agency_short: input.agency_short, ...pathwayModels[input.agency_short] }],
        };
      }

      // Map pipeline categories to likely agencies
      const pipelineToAgencies: Record<string, string[]> = {
        'workplace': ['EEOC', 'OSHA'],
        'civil_rights': ['EEOC', 'HUD'],
        'housing': ['HUD'],
        'employment': ['EEOC', 'OSHA'],
        'consumer': ['FTC'],
        'safety': ['OSHA'],
        'discrimination': ['EEOC', 'HUD'],
        'retaliation': ['EEOC', 'OSHA'],
        'whistleblower': ['OSHA'],
        'fraud': ['FTC'],
        'deceptive_practices': ['FTC'],
      };

      // Map claim types to likely agencies
      const claimToAgencies: Record<string, string[]> = {
        'discrimination': ['EEOC'],
        'retaliation': ['EEOC', 'OSHA'],
        'harassment': ['EEOC'],
        'housing_discrimination': ['HUD'],
        'fair_housing': ['HUD'],
        'workplace_safety': ['OSHA'],
        'whistleblower': ['OSHA'],
        'consumer_fraud': ['FTC'],
        'deceptive_practices': ['FTC'],
        'unfair_business': ['FTC'],
      };

      let matchedAgencies: string[] = [];
      let matchedBy = 'all';

      if (input.claim_type) {
        const key = input.claim_type.toLowerCase().replace(/\s+/g, '_');
        matchedAgencies = claimToAgencies[key] || [];
        matchedBy = 'claim_type';
      }
      if (matchedAgencies.length === 0 && input.pipeline_category) {
        const key = input.pipeline_category.toLowerCase().replace(/\s+/g, '_');
        matchedAgencies = pipelineToAgencies[key] || [];
        matchedBy = 'pipeline_category';
      }

      // If no match, return all models
      if (matchedAgencies.length === 0) {
        matchedAgencies = Object.keys(pathwayModels);
        matchedBy = 'all';
      }

      return {
        matchedBy,
        claim_type: input.claim_type,
        pipeline_category: input.pipeline_category,
        pathways: matchedAgencies
          .filter(a => pathwayModels[a])
          .map(a => ({ agency_short: a, ...pathwayModels[a] })),
      };
    }),

  // ═══ List ALL enforcement pathway models from DB ═══
  listAllPathways: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      domain: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input?.jurisdiction) conditions.push(sql`jurisdiction ILIKE ${'%' + input.jurisdiction + '%'}`);
      if (input?.domain) conditions.push(sql`domain ILIKE ${'%' + input.domain + '%'}`);
      const where = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined;
      return db.select().from(enforcementPathwayModels).where(where).orderBy(enforcementPathwayModels.pathwayName);
    }),

  // ═══ List all agencies from agencies_registry (dynamic) ═══
  listAgencies: publicProcedure
    .query(async () => {
      const results = await db.execute(sql`SELECT * FROM agencies_registry ORDER BY "agencyName"`);
      return results.rows;
    }),

  // ═══════════════════════════════════════════════════════════════
  // IMPROVEMENT 3: Investigation Workflow Generator
  // Generates structured investigation workflows from case context
  // ═══════════════════════════════════════════════════════════════

  generateInvestigationWorkflow: publicProcedure
    .input(z.object({
      domain: z.string(),
      claim_type: z.string().optional(),
      pipeline_category: z.string().optional(),
      incidentDate: z.string().optional(),
      hasDocuments: z.boolean().default(false),
      hasWitnesses: z.boolean().default(false),
      agency_short: z.string().optional(),
    }))
    .query(async ({ input }) => {
      // Fetch relevant weak joints for this domain
      const weakJoints = await db.select().from(legalWeakJoints)
        .where(sql`JSON_CONTAINS(domains, JSON_QUOTE(${input.domain}))`);

      // Fetch relevant signals
      const signals = await db.select().from(signalRegistry)
        .where(eq(signalRegistry.domain, input.domain));

      // Fetch relevant contradiction templates
      const templates = await db.select().from(contradictionTemplates)
        .where(eq(contradictionTemplates.domain, input.domain));

      // Fetch relevant barriers
      const allBarriers = await db.select().from(litigationBarriers);
      const barriers = allBarriers.filter((b: any) => {
        const domains = b.domains as string[];
        return domains?.includes(input.domain);
      });

      // ── Build Investigation Workflow ──

      // 1. Immediate Actions
      const immediateActions: Array<{ priority: number; action: string; reason: string; deadline: string }> = [];

      // Preservation actions always come first
      immediateActions.push({
        priority: 1,
        action: 'Preserve all relevant documents, communications, and records',
        reason: 'Evidence preservation is foundational — spoliation can result in adverse inference',
        deadline: 'Immediately',
      });

      // Check deadlines
      if (input.incidentDate) {
        const incident = new Date(input.incidentDate);
        const now = new Date();
        const daysSince = Math.floor((now.getTime() - incident.getTime()) / (1000 * 60 * 60 * 24));

        if (input.agency_short === 'OSHA' && daysSince > 15) {
          immediateActions.push({
            priority: 1,
            action: 'File OSHA whistleblower complaint IMMEDIATELY',
            reason: `OSHA 30-day deadline — ${30 - daysSince} days remaining`,
            deadline: new Date(incident.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          });
        } else if (input.agency_short === 'EEOC' && daysSince > 120) {
          immediateActions.push({
            priority: 1,
            action: 'File EEOC Charge of Discrimination as soon as possible',
            reason: `EEOC 180-day deadline — ${180 - daysSince} days remaining (300 in deferral states)`,
            deadline: new Date(incident.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          });
        }
      }

      immediateActions.push({
        priority: 2,
        action: 'Create a chronological timeline of all relevant events',
        reason: 'Timeline reconstruction is the foundation of contradiction detection',
        deadline: 'Within 48 hours',
      });

      // 2. Records to Request
      const recordsToRequest: Array<{ source: string; recordType: string; reason: string; method: string }> = [];

      // Domain-specific records
      const domainRecords: Record<string, Array<{ source: string; recordType: string; reason: string; method: string }>> = {
        'criminal_justice': [
          { source: 'Prosecution', recordType: 'Discovery materials and Brady disclosures', reason: 'Verify completeness of disclosure obligations', method: 'Defense counsel request or FOIA' },
          { source: 'Law enforcement', recordType: 'Investigation reports, body camera footage, interview recordings', reason: 'Verify witness statements and procedural compliance', method: 'FOIA request or subpoena' },
          { source: 'Court', recordType: 'Docket entries, motions, orders, transcripts', reason: 'Establish procedural timeline and judicial decisions', method: 'Court records request' },
          { source: 'Forensic labs', recordType: 'Lab reports, chain of custody records, analyst qualifications', reason: 'Verify forensic evidence reliability', method: 'Discovery request or FOIA' },
        ],
        'civil_rights': [
          { source: 'Employer/Respondent', recordType: 'Personnel file, performance reviews, disciplinary records', reason: 'Establish pretext by comparing stated reasons to documented performance', method: 'EEOC discovery or litigation discovery' },
          { source: 'Employer/Respondent', recordType: 'Policies, handbooks, training materials', reason: 'Verify whether policies were applied consistently', method: 'EEOC investigation request' },
          { source: 'Employer/Respondent', recordType: 'Comparator employee records', reason: 'Identify disparate treatment patterns', method: 'EEOC investigation or interrogatories' },
          { source: 'Complainant', recordType: 'Communications, emails, text messages', reason: 'Document protected activity and retaliatory responses', method: 'Self-collection' },
        ],
        'employment': [
          { source: 'Employer', recordType: 'Pay records, timesheets, benefits documentation', reason: 'Verify wage and hour compliance', method: 'DOL complaint or litigation discovery' },
          { source: 'Employer', recordType: 'Termination documentation, separation agreements', reason: 'Identify inconsistencies in stated termination reasons', method: 'EEOC or state agency investigation' },
          { source: 'Employer', recordType: 'Internal investigation reports', reason: 'Assess adequacy of employer response to complaints', method: 'Discovery request' },
        ],
        'housing': [
          { source: 'Landlord/HOA', recordType: 'Lease agreements, rental applications, screening criteria', reason: 'Identify discriminatory screening practices', method: 'HUD investigation or litigation discovery' },
          { source: 'Landlord/HOA', recordType: 'Maintenance records, complaint logs', reason: 'Document disparate maintenance or service', method: 'HUD investigation request' },
          { source: 'Local government', recordType: 'Zoning records, permit applications, code enforcement', reason: 'Identify discriminatory land use patterns', method: 'FOIA or public records request' },
        ],
        'consumer': [
          { source: 'Company', recordType: 'Terms of service, advertising materials, contracts', reason: 'Identify deceptive representations', method: 'FTC complaint or state AG investigation' },
          { source: 'Company', recordType: 'Billing records, transaction history', reason: 'Document unauthorized charges or hidden fees', method: 'Consumer request or litigation discovery' },
          { source: 'Regulatory agencies', recordType: 'Prior complaints, enforcement actions', reason: 'Establish pattern of violations', method: 'FOIA or public records search' },
        ],
      };

      const domainRecs = domainRecords[input.domain] || domainRecords['civil_rights'] || [];
      recordsToRequest.push(...domainRecs);

      // 3. Witness Targets
      const witnessTargets: Array<{ category: string; description: string; purpose: string }> = [];

      witnessTargets.push(
        { category: 'Complainant', description: 'Primary witness — the person who experienced the harm', purpose: 'Establish factual narrative and timeline' },
        { category: 'Corroborating witnesses', description: 'Co-workers, neighbors, or others who observed relevant events', purpose: 'Corroborate key facts and timeline' },
      );

      if (['civil_rights', 'employment'].includes(input.domain)) {
        witnessTargets.push(
          { category: 'Comparator witnesses', description: 'Similarly situated individuals treated differently', purpose: 'Establish disparate treatment pattern' },
          { category: 'Decision-maker', description: 'Person who made the adverse decision', purpose: 'Document stated reasons for comparison with evidence' },
        );
      }
      if (input.domain === 'criminal_justice') {
        witnessTargets.push(
          { category: 'Alibi witnesses', description: 'Individuals who can establish defendant location/activity', purpose: 'Challenge prosecution timeline' },
          { category: 'Expert witnesses', description: 'Forensic, medical, or technical experts', purpose: 'Challenge or support forensic evidence' },
        );
      }

      // 4. Timeline Tasks
      const timelineTasks: Array<{ phase: string; task: string; duration: string }> = [
        { phase: 'Week 1', task: 'Document preservation and initial evidence collection', duration: '1 week' },
        { phase: 'Week 1-2', task: 'Construct preliminary chronological timeline', duration: '1-2 weeks' },
        { phase: 'Week 2-4', task: 'Submit records requests and FOIA filings', duration: '2-4 weeks' },
        { phase: 'Week 2-4', task: 'Identify and contact potential witnesses', duration: '2-4 weeks' },
        { phase: 'Month 2-3', task: 'Review received records and update timeline', duration: '4-8 weeks' },
        { phase: 'Month 3-4', task: 'Conduct contradiction analysis across documents', duration: '4-6 weeks' },
        { phase: 'Month 4-6', task: 'Prepare investigation summary and evidence dossier', duration: '4-8 weeks' },
      ];

      // 5. Agency Steps (from enforcement pathway)
      const agencySteps: Array<{ agency: string; step: string; deadline: string }> = [];
      if (input.agency_short) {
        const agencyDeadlines: Record<string, Array<{ step: string; deadline: string }>> = {
          'EEOC': [
            { step: 'File Charge of Discrimination (Form 5)', deadline: '180/300 days from incident' },
            { step: 'Cooperate with EEOC investigation', deadline: 'Ongoing after charge filed' },
            { step: 'If Right to Sue issued, file federal lawsuit', deadline: '90 days from Right to Sue letter' },
          ],
          'HUD': [
            { step: 'File Housing Discrimination Complaint (Form 903)', deadline: '1 year from incident' },
            { step: 'Cooperate with HUD investigation', deadline: '100-day investigation period' },
            { step: 'If charge issued, elect ALJ or federal court', deadline: '20 days from charge' },
          ],
          'OSHA': [
            { step: 'File whistleblower retaliation complaint', deadline: '30 days from retaliation' },
            { step: 'File workplace safety complaint', deadline: 'No strict deadline' },
            { step: 'Participate in inspection as employee representative', deadline: 'During inspection' },
          ],
          'FTC': [
            { step: 'File consumer complaint at ReportFraud.ftc.gov', deadline: 'No individual deadline' },
            { step: 'File complaint with state Attorney General', deadline: 'Varies by state' },
            { step: 'Consider private right of action under state UDAP laws', deadline: 'Varies by state SOL' },
          ],
        };
        const steps = agencyDeadlines[input.agency_short] || [];
        agencySteps.push(...steps.map(s => ({ agency: input.agency_short!, ...s })));
      }

      // 6. Risk Flags from weak joints and barriers
      const riskFlags: Array<{ type: string; flag: string; mitigation: string }> = [];

      weakJoints.slice(0, 5).forEach((wj: any) => {
        riskFlags.push({
          type: 'Weak Joint',
          flag: wj.divergenceDescription.slice(0, 200),
          mitigation: (wj.evidenceSources as string[])?.join('; ') || 'Gather additional evidence to address this vulnerability',
        });
      });

      barriers.slice(0, 3).forEach((b: any) => {
        riskFlags.push({
          type: 'Litigation Barrier',
          flag: b.name,
          mitigation: (b.possible_workarounds as string[])?.join('; ') || 'Consult with attorney about strategies to overcome this barrier',
        });
      });

      // 7. Signal Watch List
      const signalWatchList = signals.map((s: any) => ({
        signal_type: s.signal_type,
        severity: s.severity,
        trigger_patterns: s.trigger_patterns,
        nextSteps: s.recommended_next_steps,
      }));

      return {
        domain: input.domain,
        claim_type: input.claim_type,
        agency_short: input.agency_short,
        generatedAt: Date.now(),
        workflow: {
          immediateActions: immediateActions.sort((a, b) => a.priority - b.priority),
          recordsToRequest,
          witnessTargets,
          timelineTasks,
          agencySteps,
          riskFlags,
          signalWatchList,
        },
        metadata: {
          weakJointsConsidered: weakJoints.length,
          signalsConsidered: signals.length,
          contradictionTemplatesConsidered: templates.length,
          barriersConsidered: barriers.length,
        },
      };
    }),

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
      doctrineEdges: counts[5][0]?.count ?? 0,
      barriers: counts[6][0]?.count ?? 0,
      signals: counts[7][0]?.count ?? 0,
      contradictionTemplates: counts[8][0]?.count ?? 0,
      narrativeTemplates: counts[9][0]?.count ?? 0,
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
      // @ts-expect-error pre-existing type mismatch
      if (opts.severity) conditions.push(eq((detectedSignals as any).severityLevel, opts.severity));
      // @ts-expect-error pre-existing type mismatch
      if (opts.datasetId) conditions.push(eq((detectedSignals as any).datasetId, opts.datasetId));
      const rows = await db
        .select()
        .from(detectedSignals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc((detectedSignals as any).detectionTimestamp))
        // @ts-expect-error pre-existing type mismatch
        .limit(opts.limit ?? 100)
        // @ts-expect-error pre-existing type mismatch
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
      bySeverity: { critical: critical[0]?.count ?? 0, high: high[0]?.count ?? 0, medium: medium[0]?.count ?? 0, low: low[0]?.count ?? 0 },
      byDataset: byDataset.map((r: any) => ({ datasetId: r.datasetId, count: r.count })),
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
      const barriers = await db.select().from(litigationBarriers).orderBy(litigationBarriers.barrier_type);
      const weakJoints = await db.select().from(legalWeakJoints).orderBy(sql`jurisdiction`);
      // Normalize weak joints into barrier shape
      const normalizedWeak = weakJoints.map((wj: any) => ({
        id: `wj_${wj.id}`,
        barrier_type: 'weak_joint',
        name: wj.divergenceDescription?.slice(0, 80) || wj.whatLawRequires?.slice(0, 60) || 'Weak Joint',
        description: wj.divergenceDescription || wj.whatActuallyHappens || '',
        domain: Array.isArray(wj.domains) ? wj.domains.join(', ') : (wj.domains || ''),
        legalBasis: wj.statuteCitation || '',
        affectedClaims: [],
        severity: wj.severity || 'medium',
        workaround: wj.whatLawRequires || '',
        jurisdiction: wj.jurisdiction || '',
        affectedPopulation: wj.affectedPopulation || '',
        source: 'weak_joint' as const,
      }));
      const normalizedBarriers = barriers.map((b: any) => ({ ...b, source: 'barrier' as const }));
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
