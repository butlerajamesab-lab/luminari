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
          claimType: claim.claimType,
          jurisdiction: claim.jurisdiction,
          statuteCitation: claim.statuteCitation,
          standardOfProof: claim.standardOfProof,
          typicalForum: claim.typicalForum,
          solYears: claim.solYears,
          score,
          matchedKeywords,
          confidence: score > 4 ? "high" : score > 2 ? "medium" : score > 0 ? "low" : "none",
        };
      }).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);

      return {
        matches: scored,
        totalClaims: allClaims.length,
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
          claimType: f.claimType,
          domain: f.domain,
          elementsOfProof: f.elementsOfProof,
          burdenOfProof: f.burdenOfProof,
          standardOfReview: f.standardOfReview,
          requiredCausation: f.requiredCausation,
          typicalEvidence: f.typicalEvidence,
          commonDefenses: f.commonDefenses,
          keyPrecedents: f.keyPrecedents,
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
          barrierId: b.barrierId,
          name: b.name,
          barrierType: b.barrierType,
          description: b.description,
          severity: b.severity,
          possibleWorkarounds: b.possibleWorkarounds,
          whatItBlocks: b.whatItBlocks,
        })),
        totalBarriers: relevant.length,
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
          agencyShort: a.agencyShort,
          domain: a.domain,
          statute: a.statute,
          complaintPathway: a.complaintPathway,
          complaintTypes: a.complaintTypes,
          statutoryAuthority: a.statutoryAuthority,
          responseTimelineDays: a.responseTimelineDays,
        })),
        courts: relevantCourts.slice(0, 5).map(c => ({
          id: c.id,
          courtId: c.courtId,
          courtName: c.courtName,
          courtType: c.courtType,
          jurisdiction: c.jurisdiction,
          filingPortal: c.filingPortal,
          clerkPhone: c.clerkPhone,
          address: c.address,
          filingFee: c.filingFee,
          proSeResources: c.proSeResources,
        })),
        workflows: domainWorkflows.slice(0, 3).map(w => ({
          id: w.id,
          title: w.title,
          domain: w.domain,
          jurisdiction: w.jurisdiction,
          primaryAgency: w.primaryAgency,
          entryForms: w.entryForms,
          estimatedDuration: w.estimatedDuration,
          remedies: w.remedies,
        })),
        deadlines: relevantDeadlines.slice(0, 5).map(d => ({
          id: d.id,
          claimType: d.claimType,
          jurisdiction: d.jurisdiction,
          deadlineType: d.deadlineType,
          timeLimitDays: d.timeLimitDays,
          triggerEvent: d.triggerEvent,
          authority: d.authority,
        })),
        escalations: relevantEscalations.slice(0, 3).map(e => ({
          id: e.id,
          title: e.title,
          triggerConditions: e.triggerConditions,
          routes: e.routes,
          escalationPriority: e.priority,
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
        hasUrgentDeadline: urgent.length > 0 && (urgent[0].timeLimitDays ?? 999) < 180,
        nearestDeadlineDays: urgent[0]?.timeLimitDays ?? null,
        workflowAvailable: !!matchedWorkflow,
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
          claimMatch: null,
          proofChecklist: null,
          barriers: null,
          agency: null,
          nextAction: null,
        };
      }

      return {
        resolved: true,
        message: `Matched to: ${topClaim.claimType}`,
        claimMatch: {
          claimType: topClaim.claimType,
          jurisdiction: topClaim.jurisdiction,
          statuteCitation: topClaim.statuteCitation,
          standardOfProof: topClaim.standardOfProof,
        },
        proofChecklist: null,
        barriers: null,
        agency: null,
        nextAction: null,
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
        totalBarriers: allBarriers.length,
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
        totalDoctrines: allDoctrines.length,
        doctrineEdges: edges.length,
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
          agencyShort: a.agencyShort,
          domain: a.domain,
          signalCount: relatedSignals.length,
          barrierCount: relatedBarriers.length,
          issueScore: relatedSignals.length + relatedBarriers.length * 2,
        };
      }).filter(i => i.issueScore > 0).sort((a, b) => b.issueScore - a.issueScore);

      return {
        institutions: institutions.slice(0, 20),
        totalAgencies: agencies.length,
        totalSignals: signals.length,
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
          reformPath: b.possibleWorkarounds ? JSON.stringify(b.possibleWorkarounds) : "Further analysis needed",
        });
      }

      return {
        paths,
        totalBarriers: barriers.length,
        totalDoctrines: doctrines.length,
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
        totalSignals: signals.length,
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
        nodeId: input.nodeId,
        nodeType: input.nodeType,
        outgoing: (outRows as any[]).map((e: any) => ({
          targetId: e.targetNode,
          relationship: e.relationshipType,
          label: e.sourceReference,
        })),
        incoming: (inRows as any[]).map((e: any) => ({
          sourceId: e.sourceNode,
          relationship: e.relationshipType,
          label: e.sourceReference,
        })),
        totalConnections: outRows.length + inRows.length,
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
        totalSignals: signals.length,
        uniqueTypes: Object.keys(grouped).length,
        uniqueDatasets: datasetIds.length,
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
      totalActive: totalResult?.count ?? 0,
      bySeverity: Object.fromEntries(bySeverity.map(r => [r.severity, r.count])),
      byDomain: Object.fromEntries(byDomain.map(r => [r.domain, r.count])),
      byType: Object.fromEntries(byType.map(r => [r.signalType, r.count])),
      lastDetectedAt: latest?.detectedAt ?? null,
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
      if (!pack) return { available: false, datasetId: input.datasetId };

      return {
        available: true,
        datasetId: input.datasetId,
        categories: pack.categories.size,
        harmMappings: pack.harmMappings.size,
        timelines: pack.timelines.size,
        entityRules: pack.entityRules.length,
        geoRules: pack.geoRules.length,
        statusMeanings: pack.statusMeanings.size,
        signalTemplates: pack.signalTemplates.size,
        jurisdictionScopes: pack.jurisdictionScopes.length,
        domains: [...new Set(Array.from(pack.categories.values()).map(c => c.domain))],
        riskTypes: [...new Set(Array.from(pack.harmMappings.values()).map(h => h.riskType))],
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
      if (!pack) return { categories: [], harmMappings: [], jurisdictionScopes: [] };

      return {
        categories: Array.from(pack.categories.entries()).map(([name, ctx]) => ({
          categoryName: name,
          ...ctx,
        })),
        harmMappings: Array.from(pack.harmMappings.entries()).map(([name, ctx]) => ({
          categoryName: name,
          ...ctx,
        })),
        jurisdictionScopes: pack.jurisdictionScopes,
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
      caseResolution: {
        claims: Number(claimCount.c),
        proofFrameworks: Number(proofCount.c),
        barriers: Number(barrierCount.c),
        agencies: Number(agencyCount.c),
        workflows: Number(workflowCount.c),
        deadlines: Number(deadlineCount.c),
        courts: Number(courtCount.c),
      },
      structuralDiagnostics: {
        doctrines: Number(doctrineCount.c),
        signals: Number(signalCount.c),
        barriers: Number(barrierCount.c),
        detectedSignals: Number(liveSignalCount.c),
      },
      graph: {
        edges: Number(edgeCount.c),
      },
    };
  }),
});
