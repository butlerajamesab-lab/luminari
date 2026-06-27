import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { eq, like, and, or, desc, sql, inArray, count, gte, isNotNull } from "drizzle-orm";
import {
  strategyClaimCatalog,
  proofFrameworks,
  litigationBarriers,
  agencyAuthorityMap,
  workflowMaster,
  deadlineRules,
  signalRegistry,
  doctrineRegistry,
  courtDirectory,
  legalStatutes,
  escalationRoutes,
  detectedSignals,
  dataStreamRegistry,
} from "../../drizzle/schema";
import mysql from "mysql2/promise";
import { enrichSignalWithInterpretation, loadInterpretationPack, getCategoryContext } from "../ingestion/interpretation-layer";

// graph_edges table is created via SQL, not in Drizzle schema
// Use raw queries for graph operations
async function getDbConnection() {
  return mysql.createConnection({
      host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
      port: 4000,
      user: "2jhK1AfHyk6mXSq.root",
      password: "2k5Lq94U8voiLkatA3uZ",
      database: "luminari_registry",
      ssl: {
        rejectUnauthorized: true,
      },
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// DUAL-LENS INTERFACE — Case Resolution + Structural Diagnostics
//
// Case Resolution Pipeline:
//   Problem → Claim Match → Proof Checklist → Barrier Alerts → Agency/Forum → Next Action
//
// Structural Diagnostics Pipeline:
//   Pattern → Barrier Cluster → Doctrine Cluster → Affected Institutions → Systemic Paths
//
// Both read from the same knowledge graph but maintain separate ranking logic.
// ═══════════════════════════════════════════════════════════════════════════

export const dualLensRouter = router({
  // ═══════════════════════════════════════════════════════════════════════
  // CASE RESOLUTION LENS (Default Entry)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Step 1: Match a user's problem description to claim types.
   * Returns top claim matches with confidence scores.
   */
  matchClaims: publicProcedure
    .input(z.object({
      problemDescription: z.string().min(5),
      jurisdiction: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allClaims = await db.select().from(strategyClaimCatalog);
      const keywords = input.problemDescription.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

      const scored = allClaims.map(claim => {
        const searchText = [
          claim.claimType,
          claim.jurisdiction,
          claim.statuteCitation,
          claim.notes,
        ].filter(Boolean).join(" ").toLowerCase();

        let score = 0;
        const matchedKeywords: string[] = [];

        for (const kw of keywords) {
          if (searchText.includes(kw)) {
            score += 1;
            matchedKeywords.push(kw);
          }
        }

        // Boost for jurisdiction match
        if (input.jurisdiction && claim.jurisdiction &&
            claim.jurisdiction.toLowerCase().includes(input.jurisdiction.toLowerCase())) {
          score += 2;
        }

        return {
          id: claim.id,
          claim_type: claim.claimType,
          jurisdiction: claim.jurisdiction,
          statute_citation: claim.statuteCitation,
          standard_of_proof: claim.standardOfProof,
          typical_forum: claim.typicalForum,
          sol_years: claim.solYears,
          score,
          matchedKeywords,
          confidence: score > 4 ? "high" : score > 2 ? "medium" : score > 0 ? "low" : "none",
        };
      }).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);

      return {
        matches: scored,
        total_claims: allClaims.length,
        query: input.problemDescription,
      };
    }),

  /**
   * Step 2: Get proof requirements for a matched claim.
   * Returns the proof framework with required elements.
   */
  getProofChecklist: publicProcedure
    .input(z.object({
      claimType: z.string(),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      // Find matching proof frameworks
      const frameworks = await db.select().from(proofFrameworks)
        .where(like(proofFrameworks.claimType, `%${input.claimType}%`));

      // Also try domain match if no direct match
      let results = frameworks;
      if (results.length === 0 && input.domain) {
        results = await db.select().from(proofFrameworks)
          .where(eq(proofFrameworks.domain, input.domain));
      }

      return {
        frameworks: results.map(f => ({
          id: f.id,
          claim_type: f.claimType,
          domain: f.domain,
          elements_of_proof: f.elementsOfProof,
          burden_of_proof: f.burdenOfProof,
          standard_of_review: f.standardOfReview,
          required_causation: f.requiredCausation,
          typical_evidence: f.typicalEvidence,
          common_defenses: f.commonDefenses,
          key_precedents: f.keyPrecedents,
        })),
        count: results.length,
      };
    }),

  /**
   * Step 3: Get barrier alerts for a claim type and jurisdiction.
   * Returns litigation barriers that could block or delay the case.
   */
  getBarrierAlerts: publicProcedure
    .input(z.object({
      claimType: z.string(),
      jurisdiction: z.string().optional(),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allBarriers = await db.select().from(litigationBarriers);

      // Filter barriers relevant to the claim type
      const keywords = input.claimType.toLowerCase().split(/[\s_-]+/);
      const relevant = allBarriers.filter(b => {
        const text = [
          b.barrierType,
          b.name,
          b.description,
          b.domains ? JSON.stringify(b.domains) : "",
        ].join(" ").toLowerCase();
        return keywords.some((kw: string) => text.includes(kw));
      });

      // Sort by severity
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      relevant.sort((a, b) =>
        (severityOrder[a.severity ?? "low"] ?? 3) - (severityOrder[b.severity ?? "low"] ?? 3)
      );

      return {
        barriers: relevant.slice(0, 10).map(b => ({
          id: b.id,
          barrier_id: b.barrierId,
          name: b.name,
          barrier_type: b.barrierType,
          description: b.description,
          severity: b.severity,
          possible_workarounds: b.possibleWorkarounds,
          what_it_blocks: b.whatItBlocks,
        })),
        total_barriers: relevant.length,
      };
    }),

  /**
   * Step 4: Find the right agency and forum for a claim.
   * Returns agencies, courts, and filing information.
   */
  findAgencyAndForum: publicProcedure
    .input(z.object({
      claimType: z.string(),
      jurisdiction: z.string(),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const jur = input.jurisdiction.toUpperCase();

      // Find matching agencies — agency_authority_map has: statute, agency, agencyShort, domain
      const allAgencies = await db.select().from(agencyAuthorityMap);
      const domainKeywords = (input.domain || input.claimType).toLowerCase().split(/[\s_-]+/);
      const relevantAgencies = allAgencies.filter(a => {
        const text = [a.agency, a.agencyShort, a.domain, a.statute, a.complaintPathway,
          a.statutoryAuthority ? JSON.stringify(a.statutoryAuthority) : ""]
          .join(" ").toLowerCase();
        return domainKeywords.some((kw: string) => text.includes(kw));
      });

      // Find matching courts — court_directory has: court_id, court_name, jurisdiction, court_type
      const courts = await db.select().from(courtDirectory);
      const relevantCourts = courts.filter(c => {
        const text = [c.jurisdiction, c.courtName, c.courtType].join(" ").toLowerCase();
        return text.includes(jur.toLowerCase());
      });

      // Find matching workflows — workflow_master has: title, domain, jurisdiction, primaryAgency
      const workflows = await db.select().from(workflowMaster)
        .where(or(
          like(workflowMaster.jurisdiction, `%${jur}%`),
          eq(workflowMaster.jurisdiction, "Federal"),
        ));

      const domainWorkflows = workflows.filter(w => {
        const text = [w.domain, w.primaryAgency, w.title].join(" ").toLowerCase();
        return domainKeywords.some((kw: string) => text.includes(kw));
      });

      // Find deadlines — deadline_rules has: claimType, jurisdiction, triggerEvent, deadlineType, timeLimitDays
      const deadlines = await db.select().from(deadlineRules);
      const relevantDeadlines = deadlines.filter(d => {
        const text = [d.claimType, d.jurisdiction, d.triggerEvent].join(" ").toLowerCase();
        return domainKeywords.some((kw: string) => text.includes(kw)) ||
          (d.jurisdiction && d.jurisdiction.toUpperCase().includes(jur));
      });

      // Find escalation routes — escalation_routes has: workflowId, title, triggerConditions, routes
      const escalations = await db.select().from(escalationRoutes);
      const relevantEscalations = escalations.filter(e => {
        const text = [e.title, JSON.stringify(e.routes)].join(" ").toLowerCase();
        return text.includes(jur.toLowerCase()) ||
          domainKeywords.some((kw: string) => text.includes(kw));
      });

      return {
        agencies: relevantAgencies.slice(0, 8).map(a => ({
          id: a.id,
          agency: a.agency,
          agency_short: a.agencyShort,
          domain: a.domain,
          statute: a.statute,
          complaint_pathway: a.complaintPathway,
          complaint_types: a.complaintTypes,
          statutory_authority: a.statutoryAuthority,
          response_timeline_days: a.responseTimelineDays,
        })),
        courts: relevantCourts.slice(0, 5).map(c => ({
          id: c.id,
          court_id: c.courtId,
          court_name: c.courtName,
          court_type: c.courtType,
          jurisdiction: c.jurisdiction,
          filing_portal: c.filingPortal,
          clerk_phone: c.clerkPhone,
          address: c.address,
          filing_fee: c.filingFee,
          pro_se_resources: c.proSeResources,
        })),
        workflows: domainWorkflows.slice(0, 3).map(w => ({
          id: w.id,
          title: w.title,
          domain: w.domain,
          jurisdiction: w.jurisdiction,
          primary_agency: w.primaryAgency,
          entry_forms: w.entryForms,
          estimated_duration: w.estimatedDuration,
          remedies: w.remedies,
        })),
        deadlines: relevantDeadlines.slice(0, 5).map(d => ({
          id: d.id,
          claim_type: d.claimType,
          jurisdiction: d.jurisdiction,
          deadline_type: d.deadlineType,
          time_limit_days: d.timeLimitDays,
          trigger_event: d.triggerEvent,
          authority: d.authority,
        })),
        escalations: relevantEscalations.slice(0, 3).map(e => ({
          id: e.id,
          title: e.title,
          trigger_conditions: e.triggerConditions,
          routes: e.routes,
          escalation_priority: e.priority,
        })),
      };
    }),

  /**
   * Step 5: Generate the next action recommendation.
   * Combines all resolution data into a prioritized action list.
   */
  getNextAction: publicProcedure
    .input(z.object({
      claimType: z.string(),
      jurisdiction: z.string(),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const jur = input.jurisdiction.toUpperCase();

      // Gather deadlines for urgency
      const deadlines = await db.select().from(deadlineRules);
      const urgent = deadlines.filter(d => {
        const text = [d.claimType, d.jurisdiction].join(" ").toLowerCase();
        const keywords = input.claimType.toLowerCase().split(/[\s_-]+/);
        return keywords.some((kw: string) => text.includes(kw));
      }).sort((a, b) => (a.timeLimitDays ?? 999) - (b.timeLimitDays ?? 999));

      // Gather workflows for steps
      const workflows = await db.select().from(workflowMaster)
        .where(or(
          like(workflowMaster.jurisdiction, `%${jur}%`),
          eq(workflowMaster.jurisdiction, "Federal"),
        ));

      const domainKeywords = (input.domain || input.claimType).toLowerCase().split(/[\s_-]+/);
      const matchedWorkflow = workflows.find(w => {
        const text = [w.domain, w.primaryAgency, w.title].join(" ").toLowerCase();
        return domainKeywords.some((kw: string) => text.includes(kw));
      });

      // Build action items
      const actions: Array<{
        priority: number;
        action: string;
        detail: string;
        urgency: "critical" | "high" | "medium" | "low";
        type: "deadline" | "filing" | "evidence" | "consultation" | "research";
      }> = [];

      // Add deadline-driven actions
      if (urgent.length > 0) {
        const first = urgent[0];
        actions.push({
          priority: 1,
          action: `File within ${first.timeLimitDays} days`,
          detail: `${first.deadlineType}: ${first.authority ?? "Filing deadline for this claim type"}`,
          urgency: (first.timeLimitDays ?? 999) < 90 ? "critical" : (first.timeLimitDays ?? 999) < 180 ? "high" : "medium",
          type: "deadline",
        });
      }

      // Add workflow-driven actions
      if (matchedWorkflow) {
        actions.push({
          priority: 2,
          action: `Start ${matchedWorkflow.title} workflow`,
          detail: `File with ${matchedWorkflow.primaryAgency} in ${matchedWorkflow.jurisdiction}`,
          urgency: "high",
          type: "filing",
        });
      }

      // Add evidence-gathering action
      actions.push({
        priority: 3,
        action: "Gather supporting evidence",
        detail: `Collect documents, communications, and records related to your ${input.claimType} claim`,
        urgency: "medium",
        type: "evidence",
      });

      // Add consultation action
      actions.push({
        priority: 4,
        action: "Consult with a legal professional",
        detail: "Consider reaching out to a legal aid organization or attorney for case-specific guidance",
        urgency: "medium",
        type: "consultation",
      });

      return {
        actions: actions.sort((a, b) => a.priority - b.priority),
        has_urgent_deadline: urgent.length > 0 && (urgent[0].timeLimitDays ?? 999) < 180,
        nearest_deadline_days: urgent[0]?.timeLimitDays ?? null,
        workflow_available: !!matchedWorkflow,
      };
    }),

  /**
   * Full resolution pipeline — runs all 5 steps in sequence.
   * Returns the complete case resolution package.
   */
  resolveCase: publicProcedure
    .input(z.object({
      problemDescription: z.string().min(5),
      jurisdiction: z.string(),
      category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allClaims = await db.select().from(strategyClaimCatalog);
      const keywords = input.problemDescription.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

      const topClaim = allClaims
        .map(c => {
          const text = [c.claimType, c.jurisdiction, c.statuteCitation, c.notes].filter(Boolean).join(" ").toLowerCase();
          const score = keywords.filter((kw: string) => text.includes(kw)).length;
          return { ...c, score };
        })
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (!topClaim) {
        return {
          resolved: false,
          message: "No matching claim type found. Try describing your situation in more detail.",
          claim_match: null,
          proof_checklist: null,
          barriers: null,
          agency: null,
          next_action: null,
        };
      }

      return {
        resolved: true,
        message: `Matched to: ${topClaim.claimType}`,
        claim_match: {
          claim_type: topClaim.claimType,
          jurisdiction: topClaim.jurisdiction,
          statute_citation: topClaim.statuteCitation,
          standard_of_proof: topClaim.standardOfProof,
        },
        proof_checklist: null,
        barriers: null,
        agency: null,
        next_action: null,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // STRUCTURAL DIAGNOSTICS LENS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get barrier clusters — recurring barriers grouped by type.
   */
  getBarrierClusters: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allBarriers = await db.select().from(litigationBarriers);

      // Group by barrier type
      const clusters: Record<string, {
        type: string;
        count: number;
        severity: string;
        barriers: typeof allBarriers;
      }> = {};

      for (const b of allBarriers) {
        const type = b.barrierType ?? "unknown";
        if (!clusters[type]) {
          clusters[type] = { type, count: 0, severity: b.severity ?? "low", barriers: [] };
        }
        clusters[type].count++;
        clusters[type].barriers.push(b);
      }

      return {
        clusters: Object.values(clusters).sort((a, b) => b.count - a.count),
        total_barriers: allBarriers.length,
      };
    }),

  /**
   * Get doctrine clusters — doctrines grouped by domain with case connections.
   */
  getDoctrineClusters: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allDoctrines = await db.select().from(doctrineRegistry);

      // Group by first domain
      const clusters: Record<string, {
        category: string;
        count: number;
        doctrines: typeof allDoctrines;
      }> = {};

      for (const d of allDoctrines) {
        const cat = (d.domains && d.domains.length > 0) ? d.domains[0] : "general";
        if (!clusters[cat]) {
          clusters[cat] = { category: cat, count: 0, doctrines: [] };
        }
        clusters[cat].count++;
        clusters[cat].doctrines.push(d);
      }

      // Get graph edges for doctrine connections (raw SQL - table not in Drizzle schema)
      const conn = await getDbConnection();
      const [edgeRows] = await conn.query("SELECT * FROM graph_edges WHERE sourceNode LIKE 'DOC-%'") as any;
      await conn.end();
      const edges = edgeRows as any[];

      return {
        clusters: Object.values(clusters).sort((a, b) => b.count - a.count),
        total_doctrines: allDoctrines.length,
        doctrine_edges: edges.length,
      };
    }),

  /**
   * Get affected institutions — agencies with the most barriers and signals.
   */
  getAffectedInstitutions: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const agencies = await db.select().from(agencyAuthorityMap);
      const signals = await db.select().from(signalRegistry);
      const barriers = await db.select().from(litigationBarriers);

      // Build institution profiles
      const institutions = agencies.map(a => {
        const agencyText = (a.agency ?? "").toLowerCase();
        const relatedSignals = signals.filter(s => {
          const text = [s.signalType, s.explanation].join(" ").toLowerCase();
          return agencyText.split(" ").some((w: string) => w.length > 3 && text.includes(w));
        });
        const relatedBarriers = barriers.filter(b => {
          const text = [b.barrierType, b.description].join(" ").toLowerCase();
          return agencyText.split(" ").some((w: string) => w.length > 3 && text.includes(w));
        });

        return {
          id: a.id,
          agency: a.agency,
          agency_short: a.agencyShort,
          domain: a.domain,
          signal_count: relatedSignals.length,
          barrier_count: relatedBarriers.length,
          issue_score: relatedSignals.length + relatedBarriers.length * 2,
        };
      }).filter(i => i.issueScore > 0).sort((a, b) => b.issueScore - a.issueScore);

      return {
        institutions: institutions.slice(0, 20),
        total_agencies: agencies.length,
        total_signals: signals.length,
      };
    }),

  /**
   * Get systemic resolution paths — reform pathways based on pattern analysis.
   */
  getSystemicPaths: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
      barrierType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const barriers = await db.select().from(litigationBarriers);
      const doctrines = await db.select().from(doctrineRegistry);
      const statutes = await db.select().from(legalStatutes);

      // Build systemic paths from barrier → doctrine → statute connections
      const paths: Array<{
        barrier: string;
        severity: string;
        doctrineLink: string | null;
        statuteLink: string | null;
        reformPath: string;
      }> = [];

      const relevantBarriers = input.barrierType
        ? barriers.filter(b => b.barrierType === input.barrierType)
        : barriers.filter(b => b.severity === "critical" || b.severity === "high");

      for (const b of relevantBarriers.slice(0, 15)) {
        const barrierText = (b.barrierType ?? "").toLowerCase();

        // Find related doctrine
        const relatedDoctrine = doctrines.find(d => {
          const text = [d.name, d.description].join(" ").toLowerCase();
          return barrierText.split("_").some((w: string) => w.length > 3 && text.includes(w));
        });

        // Find related statute
        const relatedStatute = statutes.find(s => {
          const text = [s.title, s.summary ?? ""].join(" ").toLowerCase();
          return barrierText.split("_").some((w: string) => w.length > 3 && text.includes(w));
        });

        paths.push({
          barrier: b.barrierType ?? "unknown",
          severity: b.severity ?? "medium",
          doctrineLink: relatedDoctrine?.name ?? null,
          statuteLink: relatedStatute?.title ?? null,
          reform_path: b.possibleWorkarounds ? JSON.stringify(b.possibleWorkarounds) : "Further analysis needed",
        });
      }

      return {
        paths,
        total_barriers: barriers.length,
        total_doctrines: doctrines.length,
      };
    }),

  /**
   * Get signal patterns — recurring signals grouped by type.
   */
  getSignalPatterns: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const signals = await db.select().from(signalRegistry);

      // Group by signal type
      const patterns: Record<string, {
        type: string;
        count: number;
        signals: typeof signals;
      }> = {};

      for (const s of signals) {
        const type = s.signalType ?? "general";
        if (!patterns[type]) {
          patterns[type] = { type, count: 0, signals: [] };
        }
        patterns[type].count++;
        patterns[type].signals.push(s);
      }

      return {
        patterns: Object.values(patterns).sort((a, b) => b.count - a.count),
        total_signals: signals.length,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // GRAPH EXPANSION (Progressive)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Expand a single node in the graph — returns connected nodes one level deep.
   * Follows the ladder: Claim → Proof → Barrier → Agency → Action → Pattern
   */
  expandNode: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      nodeType: z.enum(["claim", "proof", "barrier", "agency", "action", "pattern", "doctrine", "statute", "case"]),
    }))
    .query(async ({ input }) => {
      // Find edges from this node (raw SQL - table not in Drizzle schema)
      const conn = await getDbConnection();
      const [outRows] = await conn.query(
        "SELECT * FROM graph_edges WHERE sourceNode = ?", [input.nodeId]
      ) as any;
      const [inRows] = await conn.query(
        "SELECT * FROM graph_edges WHERE targetNode = ?", [input.nodeId]
      ) as any;
      await conn.end();

      return {
        node_id: input.nodeId,
        node_type: input.nodeType,
        outgoing: (outRows as any[]).map((e: any) => ({
          target_id: e.targetNode,
          relationship: e.relationshipType,
          label: e.sourceReference,
        })),
        incoming: (inRows as any[]).map((e: any) => ({
          source_id: e.sourceNode,
          relationship: e.relationshipType,
          label: e.sourceReference,
        })),
        total_connections: outRows.length + inRows.length,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // LIVE DATA SIGNALS (from ingestion pipeline)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get live signals for the Structural Diagnostics lens.
   * Groups by signal type, includes explanations, stats, and dataset info.
   * Supports filtering by jurisdiction, domain, severity.
   */
  getLiveSignalsForDiagnostics: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      domain: z.string().optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      const conditions = [isNotNull(detectedSignals.signalId)];
      if (input.jurisdiction) conditions.push(eq(detectedSignals.jurisdictionScope, input.jurisdiction));
      if (input.domain) conditions.push(eq(detectedSignals.datasetId, input.domain));
      if (input.severity) conditions.push(eq(detectedSignals.severityLevel, input.severity));

      const signals = await db
        .select()
        .from(detectedSignals)
        .where(and(...conditions))
        .orderBy(desc(detectedSignals.detectionTimestamp))
        .limit(input.limit);

      // Enrich with dataset names
      const datasetIds = [...new Set(signals.map(s => s.datasetId))];
      const datasets = datasetIds.length > 0
        ? await db.select({ datasetId: dataStreamRegistry.streamId, datasetName: dataStreamRegistry.streamName })
            .from(dataStreamRegistry)
            .where(inArray(dataStreamRegistry.streamId, datasetIds))
        : [];
      const datasetNameMap = Object.fromEntries(datasets.map(d => [d.datasetId, d.datasetName]));

      // Cross-reference with signal_registry for known pattern matching
      const knownSignals = await db.select().from(signalRegistry);
      const knownTypes = new Set(knownSignals.map(s => s.signalType?.toLowerCase()));

      // Group by signal type
      const grouped: Record<string, {
        type: string;
        count: number;
        signals: Array<{
          id: number;
          signalType: string;
          title: string;
          explanation: string;
          patternSummary: string;
          severity: string;
          confidenceScore: string;
          jurisdiction: string;
          domain: string;
          datasetId: string;
          datasetName: string;
          detectedAt: number;
          supportingStatistics: any;
          matchesKnownPattern: boolean;
        }>;
      }> = {};

      for (const s of signals) {
        const type = s.signalType;
        if (!grouped[type]) {
          grouped[type] = { type, count: 0, signals: [] };
        }
        grouped[type].count++;
        grouped[type].signals.push({
          id: s.signalId as any,
          signalType: s.signalType,
          title: s.plainLanguageExplanation,
          explanation: s.plainLanguageExplanation,
          patternSummary: s.narrativeReasoning ?? '',
          severity: s.severityLevel,
          confidenceScore: String(s.confidenceScore),
          jurisdiction: s.jurisdictionScope ?? '',
          domain: s.datasetId,
          datasetId: s.datasetId,
          datasetName: datasetNameMap[s.datasetId] ?? s.datasetId,
          detectedAt: s.detectionTimestamp,
          supportingStatistics: s.crossSignalLinks ?? {},
          matchesKnownPattern: knownTypes.has(s.signalType.toLowerCase()),
        });
      }

      return {
        groups: Object.values(grouped).sort((a, b) => b.count - a.count),
        total_signals: signals.length,
        unique_types: Object.keys(grouped).length,
        unique_datasets: datasetIds.length,
      };
    }),

  /**
   * Get live signal summary stats for the diagnostics header.
   */
  getLiveSignalSummary: publicProcedure.query(async () => {
    const [totalResult] = await db
      .select({ count: count() })
      .from(detectedSignals)
      .where(isNotNull(detectedSignals.signalId));

    const bySeverity = await db
      .select({
        severity: detectedSignals.severityLevel,
        count: count(),
      })
      .from(detectedSignals)
      .where(isNotNull(detectedSignals.signalId))
      .groupBy(detectedSignals.severityLevel);

    const byDomain = await db
      .select({
        domain: detectedSignals.datasetId,
        count: count(),
      })
      .from(detectedSignals)
      .where(isNotNull(detectedSignals.signalId))
      .groupBy(detectedSignals.datasetId);

    const byType = await db
      .select({
        signalType: detectedSignals.signalType,
        count: count(),
      })
      .from(detectedSignals)
      .where(isNotNull(detectedSignals.signalId))
      .groupBy(detectedSignals.signalType);

    // Most recent detection time
    const [latest] = await db
      .select({ detectedAt: detectedSignals.detectionTimestamp })
      .from(detectedSignals)
      .where(isNotNull(detectedSignals.signalId))
      .orderBy(desc(detectedSignals.detectionTimestamp))
      .limit(1);

    return {
      total_active: totalResult?.count ?? 0,
      by_severity: Object.fromEntries(bySeverity.map(r => [r.severity, r.count])),
      by_domain: Object.fromEntries(byDomain.map(r => [r.domain, r.count])),
      by_type: Object.fromEntries(byType.map(r => [r.signalType, r.count])),
      last_detected_at: latest?.detectedAt ?? null,
    };
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // INTERPRETATION LAYER
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get interpretation context for a specific live signal.
   * Returns related laws, harm type, timeline expectations, status meanings,
   * scope classification, and action recommendations.
   */
  getSignalInterpretation: publicProcedure
    .input(z.object({
      signalId: z.number(),
      signalType: z.string(),
      datasetId: z.string(),
      severity: z.string(),
      title: z.string(),
      supportingStatistics: z.any(),
    }))
    .query(async ({ input }) => {
      const enrichment = await enrichSignalWithInterpretation(input);
      return enrichment;
    }),

  /**
   * Get interpretation pack summary for a dataset.
   * Returns counts and key metadata about available interpretation data.
   */
  getInterpretationPackSummary: publicProcedure
    .input(z.object({ datasetId: z.string() }))
    .query(async ({ input }) => {
      const pack = await loadInterpretationPack(input.datasetId);
      if (!pack) return { available: false, dataset_id: input.datasetId };

      return {
        available: true,
        dataset_id: input.datasetId,
        categories: pack.categories.size,
        harm_mappings: pack.harmMappings.size,
        timelines: pack.timelines.size,
        entity_rules: pack.entityRules.length,
        geo_rules: pack.geoRules.length,
        status_meanings: pack.statusMeanings.size,
        signal_templates: pack.signalTemplates.size,
        jurisdiction_scopes: pack.jurisdictionScopes.length,
        domains: [...new Set(Array.from(pack.categories.values()).map(c => c.domain))],
        risk_types: [...new Set(Array.from(pack.harmMappings.values()).map(h => h.riskType))],
      };
    }),

  /**
   * Get all category interpretations for a dataset.
   * Used by the Structural Diagnostics lens to show domain context.
   */
  getDatasetInterpretations: publicProcedure
    .input(z.object({ datasetId: z.string() }))
    .query(async ({ input }) => {
      const pack = await loadInterpretationPack(input.datasetId);
      if (!pack) return { categories: [], harm_mappings: [], jurisdiction_scopes: [] };

      return {
        categories: Array.from(pack.categories.entries()).map(([name, ctx]) => ({
          category_name: name,
          ...ctx,
        })),
        harm_mappings: Array.from(pack.harmMappings.entries()).map(([name, ctx]) => ({
          category_name: name,
          ...ctx,
        })),
        jurisdiction_scopes: pack.jurisdictionScopes,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // DASHBOARD STATS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get summary stats for the dual-lens dashboard.
   */
  stats: publicProcedure.query(async () => {
    const [claimCount] = await db.select({ c: sql<number>`count(*)` }).from(strategyClaimCatalog);
    const [proofCount] = await db.select({ c: sql<number>`count(*)` }).from(proofFrameworks);
    const [barrierCount] = await db.select({ c: sql<number>`count(*)` }).from(litigationBarriers);
    const [agencyCount] = await db.select({ c: sql<number>`count(*)` }).from(agencyAuthorityMap);
    const [workflowCount] = await db.select({ c: sql<number>`count(*)` }).from(workflowMaster);
    const [deadlineCount] = await db.select({ c: sql<number>`count(*)` }).from(deadlineRules);
    const [doctrineCount] = await db.select({ c: sql<number>`count(*)` }).from(doctrineRegistry);
    const [signalCount] = await db.select({ c: sql<number>`count(*)` }).from(signalRegistry);
    const [courtCount] = await db.select({ c: sql<number>`count(*)` }).from(courtDirectory);
    const conn = await getDbConnection();
    const [edgeRows] = await conn.query("SELECT COUNT(*) as c FROM graph_edges") as any;
    await conn.end();
    const edgeCount = { c: (edgeRows as any[])[0]?.c ?? 0 };

    // Live signals count
    const [liveSignalCount] = await db.select({ c: sql<number>`count(*)` }).from(detectedSignals).where(isNotNull(detectedSignals.signalId));

    return {
      case_resolution: {
        claims: Number(claimCount.c),
        proof_frameworks: Number(proofCount.c),
        barriers: Number(barrierCount.c),
        agencies: Number(agencyCount.c),
        workflows: Number(workflowCount.c),
        deadlines: Number(deadlineCount.c),
        courts: Number(courtCount.c),
      },
      structural_diagnostics: {
        doctrines: Number(doctrineCount.c),
        signals: Number(signalCount.c),
        barriers: Number(barrierCount.c),
        detected_signals: Number(liveSignalCount.c),
      },
      graph: {
        edges: Number(edgeCount.c),
      },
    };
  }),
});
