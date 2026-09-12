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
  escalationRoutes,
} from "../../drizzle/schema";
import { enrichSignalWithInterpretation, loadInterpretationPack, getCategoryContext } from "../ingestion/interpretation-layer";
import { query_with_diagnostics } from "../db-legacy";
import { getCurrentCanonicalState } from "../services/current-canonical-state";

import { barrier_reference_scope, reference_matches_domain, reference_strings } from "../diagnostic-reference-contract";
import { read_diagnostic_signals, read_diagnostic_signal_summary } from "../diagnostic-signal-runtime";

const DIAGNOSTICS_STATS_TIMEOUT_MS = 5_000;
const GRAPH_EXPANSION_LIMIT_PER_DIRECTION = 25;
const DOCTRINE_GRAPH_NODE_TYPES = new Set(["statute", "case", "doctrine", "agency"]);

function graph_unavailable_reason(error: unknown): string {
  if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
    return "The canonical graph summary timed out. Retry after the current database load clears.";
  }
  return "The canonical graph summary could not be read. The edge count is unknown.";
}

function doctrine_graph_unavailable_reason(error: unknown): string {
  if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
    return "The doctrine graph count timed out. Retry after the current database load clears.";
  }
  return "The doctrine graph count could not be read. The edge count is unknown.";
}

function canonical_graph_count(value: unknown, field: string): number {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`Canonical graph field ${field} is unavailable`);
  }
  return count;
}

function as_string_array(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [value];
  } catch {
    return [value];
  }
}

async function load_institution_registry_snapshot() {
  const { rows } = await query_with_diagnostics<{
    id: number; statute: string | null; agency: string; agency_short: string | null; domain: string | null;
  }>(`select id, statute, agency, agency_short, domain
        from public.agency_authority_map order by agency, id`, [],
    { label: "dual_lens_institution_registry_snapshot", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 });
  return rows;
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

      const scored = allClaims.map((claim: any) => {
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
      }).filter((c: any) => c.score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 10);

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
        frameworks: results.map((f: any) => ({
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
      const keywords = input.claimType.toLowerCase().split(/[\s_-]+/).filter(Boolean);
      const relevant = allBarriers.filter((b: any) => {
        if (barrier_reference_scope(b) !== "catalog_reference" || !reference_matches_domain(b.domains, input.domain)) return false;
        const text = [
          b.barrier_type,
          b.name,
          b.description,
          b.domains ? JSON.stringify(b.domains) : "",
        ].join(" ").toLowerCase();
        return keywords.some((kw: string) => text.includes(kw));
      });

      // Sort by severity
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      relevant.sort((a: any, b: any) =>
        (severityOrder[a.severity ?? "low"] ?? 3) - (severityOrder[b.severity ?? "low"] ?? 3)
      );

      return {
        barriers: relevant.slice(0, 10).map((b: any) => ({
          id: b.id,
          barrier_id: b.barrier_id,
          name: b.name,
          barrier_type: b.barrier_type,
          description: b.description,
          severity: b.severity,
          possible_workarounds: b.possible_workarounds,
          what_it_blocks: b.what_it_blocks,
        })),
        total_barriers: relevant.length,
        excluded_unverified_references: allBarriers.filter((b: any) => barrier_reference_scope(b) !== "catalog_reference").length,
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
      const relevantAgencies = allAgencies.filter((a: any) => {
        const text = [a.agency, a.agencyShort, a.domain, a.statute, a.complaintPathway,
          a.statutoryAuthority ? JSON.stringify(a.statutoryAuthority) : ""]
          .join(" ").toLowerCase();
        return domainKeywords.some((kw: string) => text.includes(kw));
      });

      // Find matching courts — court_directory has: court_id, court_name, jurisdiction, court_type
      const courts = await db.select().from(courtDirectory);
      const relevantCourts = courts.filter((c: any) => {
        const text = [c.jurisdiction, c.courtName, c.courtType].join(" ").toLowerCase();
        return text.includes(jur.toLowerCase());
      });

      // Find matching workflows — workflow_master has: title, domain, jurisdiction, primaryAgency
      const workflows = await db.select().from(workflowMaster)
        .where(or(
          like(workflowMaster.jurisdiction, `%${jur}%`),
          eq(workflowMaster.jurisdiction, "Federal"),
        ));

      const domainWorkflows = workflows.filter((w: any) => {
        const text = [w.domain, w.primaryAgency, w.title].join(" ").toLowerCase();
        return domainKeywords.some((kw: string) => text.includes(kw));
      });

      // Find deadlines — deadline_rules has: claimType, jurisdiction, triggerEvent, deadlineType, timeLimitDays
      const deadlines = await db.select().from(deadlineRules);
      const relevantDeadlines = deadlines.filter((d: any) => {
        const text = [d.claimType, d.jurisdiction, d.triggerEvent].join(" ").toLowerCase();
        return domainKeywords.some((kw: string) => text.includes(kw)) ||
          (d.jurisdiction && d.jurisdiction.toUpperCase().includes(jur));
      });

      // Find escalation routes — escalation_routes has: workflowId, title, triggerConditions, routes
      const escalations = await db.select().from(escalationRoutes);
      const relevantEscalations = escalations.filter((e: any) => {
        const text = [e.title, JSON.stringify(e.routes)].join(" ").toLowerCase();
        return text.includes(jur.toLowerCase()) ||
          domainKeywords.some((kw: string) => text.includes(kw));
      });

      return {
        agencies: relevantAgencies.slice(0, 8).map((a: any) => ({
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
        courts: relevantCourts.slice(0, 5).map((c: any) => ({
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
        workflows: domainWorkflows.slice(0, 3).map((w: any) => ({
          id: w.id,
          title: w.title,
          domain: w.domain,
          jurisdiction: w.jurisdiction,
          primary_agency: w.primaryAgency,
          entry_forms: w.entryForms,
          estimated_duration: w.estimatedDuration,
          remedies: w.remedies,
        })),
        deadlines: relevantDeadlines.slice(0, 5).map((d: any) => ({
          id: d.id,
          claim_type: d.claimType,
          jurisdiction: d.jurisdiction,
          deadline_type: d.deadlineType,
          time_limit_days: d.timeLimitDays,
          trigger_event: d.triggerEvent,
          authority: d.authority,
        })),
        escalations: relevantEscalations.slice(0, 3).map((e: any) => ({
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
      const urgent = deadlines.filter((d: any) => {
        const text = [d.claimType, d.jurisdiction].join(" ").toLowerCase();
        const keywords = input.claimType.toLowerCase().split(/[\s_-]+/);
        return keywords.some((kw: string) => text.includes(kw));
      }).sort((a: any, b: any) => (a.timeLimitDays ?? 999) - (b.timeLimitDays ?? 999));

      // Gather workflows for steps
      const workflows = await db.select().from(workflowMaster)
        .where(or(
          like(workflowMaster.jurisdiction, `%${jur}%`),
          eq(workflowMaster.jurisdiction, "Federal"),
        ));

      const domainKeywords = (input.domain || input.claimType).toLowerCase().split(/[\s_-]+/);
      const matchedWorkflow = workflows.find((w: any) => {
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
        .map((c: any) => {
          const text = [c.claimType, c.jurisdiction, c.statuteCitation, c.notes].filter(Boolean).join(" ").toLowerCase();
          const score = keywords.filter((kw: string) => text.includes(kw)).length;
          return { ...c, score };
        })
        .filter((c: any) => c.score > 0)
        .sort((a: any, b: any) => b.score - a.score)[0];

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
   * Group civic barrier references; preserve operational rows separately.
   */
  getBarrierClusters: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const catalog = await db.select().from(litigationBarriers);
      const allBarriers = catalog.filter((b: any) => barrier_reference_scope(b) !== "operational_ingestion" && reference_matches_domain(b.domains, input.domain));

      // Group by barrier type
      const clusters: Record<string, {
        type: string;
        count: number;
        severity: string;
        barriers: typeof allBarriers;
      }> = {};

      for (const b of allBarriers) {
        const type = b.barrier_type ?? "unknown";
        if (!clusters[type]) {
          clusters[type] = { type, count: 0, severity: b.severity ?? "low", barriers: [] };
        }
        clusters[type].count++;
        clusters[type].barriers.push({ ...b, reference_scope: barrier_reference_scope(b) } as typeof b);
      }

      return {
        clusters: Object.values(clusters).sort((a, b) => b.count - a.count),
        total_barriers: allBarriers.length,
        source_kind: "catalog_reference" as const,
        operational_references: catalog.filter((b: any) => barrier_reference_scope(b) === "operational_ingestion"),
      };
    }),

  /**
   * Get doctrine clusters — doctrines grouped by domain with case connections.
   */
  getDoctrineClusters: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
      keywords: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
      search: z.string().trim().max(100).default(""),
      offset: z.number().int().min(0).max(1_000_000).default(0),
      limit: z.number().int().min(1).max(500).default(500),
    }))
    .query(async ({ input }) => {
      const keywords = [...new Set([...input.keywords, ...(input.domain ? [input.domain] : [])]
        .map(word => word.trim().toLowerCase()).filter(Boolean))];
      const predicate = `(cardinality($1::text[]) = 0 or exists (
        select 1 from unnest($1::text[]) keyword
         where strpos(lower(concat_ws(' ', name, description, domains::text)), keyword) > 0
      )) and ($2::text = '' or strpos(lower(concat_ws(' ', name, description, domains::text)), $2) > 0)`;
      const filter_params = [keywords, input.search.toLowerCase()];
      const doctrines_request = query_with_diagnostics<any>(
        `select id, name, description, primary_cases, domains, added_by, created_at, updated_at
           from public.doctrine_registry
          where ${predicate}
          order by name asc, id asc
          limit $3 offset $4`,
        [...filter_params, input.limit, input.offset],
        { label: "dual_lens_doctrine_clusters", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 4_000 },
      );
      const doctrine_count_request = query_with_diagnostics<{ doctrine_count: number }>(
        `select count(*)::int as doctrine_count from public.doctrine_registry where ${predicate}`,
        filter_params,
        { label: "dual_lens_doctrine_count", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 4_000 },
      );
      const edge_request = query_with_diagnostics<{ edge_count: number }>(
        `select count(*)::int as edge_count from public.doctrine_graph_edges`,
        [],
        { label: "dual_lens_doctrine_edge_count", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 4_000 },
      ).then(({ rows }) => ({
        count: Number(rows[0]?.edge_count ?? 0),
        available: true as const,
        reason: null,
      })).catch((error: unknown) => ({
        count: null,
        available: false as const,
        reason: doctrine_graph_unavailable_reason(error),
      }));
      const [{ rows: allDoctrines }, { rows: doctrine_count_rows }, doctrine_graph] = await Promise.all([
        doctrines_request,
        doctrine_count_request,
        edge_request,
      ]);
      const total_doctrines = Number(doctrine_count_rows[0]?.doctrine_count);
      if (!Number.isFinite(total_doctrines) || total_doctrines < 0) {
        throw new Error("Doctrine registry count is unavailable");
      }

      // Group by first domain
      const clusters: Record<string, {
        category: string;
        count: number;
        doctrines: typeof allDoctrines;
      }> = {};

      for (const d of allDoctrines) {
        const domains = as_string_array(d.domains);
        const cat = domains[0] ?? "general";
        if (!clusters[cat]) {
          clusters[cat] = { category: cat, count: 0, doctrines: [] };
        }
        clusters[cat].count++;
        clusters[cat].doctrines.push({ ...d, domains });
      }

      return {
        clusters: Object.values(clusters).sort((a, b) => b.count - a.count),
        total_doctrines,
        doctrine_edges: doctrine_graph.count,
        doctrine_edges_available: doctrine_graph.available,
        doctrine_edges_unavailable_reason: doctrine_graph.reason,
        doctrine_results_limited: total_doctrines > allDoctrines.length,
        returned_doctrines: allDoctrines.length,
        offset: input.offset,
        limit: input.limit,
        next_offset: input.offset + allDoctrines.length < total_doctrines
          ? input.offset + input.limit : null,
      };
    }),

  /**
   * Read institution authority references without inferring issue attribution.
   */
  getAffectedInstitutions: publicProcedure
    .input(z.object({ domain: z.string().optional() }))
    .query(async ({ input }) => {
      const agencies = await load_institution_registry_snapshot();
      return {
        source_kind: "authority_reference" as const,
        institutions: agencies.filter(a => reference_matches_domain(a.domain, input.domain)).map(a => ({
          ...a,
          attribution_status: "not_established" as const,
          // Null preserves unknown for existing consumers; word overlap is not evidence.
          signal_count: null, barrier_count: null, issue_score: null,
        })),
        total_agencies: agencies.length,
      };
    }),

  /**
   * Read saved barrier authorities and workarounds without inferring routes.
   */
  getSystemicPaths: publicProcedure
    .input(z.object({ domain: z.string().optional(), barrierType: z.string().optional() }))
    .query(async ({ input }) => {
      const catalog = await db.select().from(litigationBarriers);
      const barriers = catalog.filter((b: any) => barrier_reference_scope(b) !== "operational_ingestion" && reference_matches_domain(b.domains, input.domain));
      const relevant = input.barrierType ? barriers.filter((b: any) => b.barrier_type === input.barrierType) : barriers;
      return {
        source_kind: "barrier_reference" as const,
        paths: relevant.map((b: any) => ({
          barrier: b.barrier_type, barrier_id: b.barrier_id, severity: b.severity,
          reference_scope: barrier_reference_scope(b),
          authority_refs: reference_strings(b.leading_authorities),
          doctrineLink: null, statuteLink: null,
          reformPath: reference_strings(b.possible_workarounds).join("; "),
          route_status: "not_established" as const,
        })),
        total_barriers: barriers.length,
      };
    }),

  /**
   * Group signal definitions. Catalog counts are not occurrence counts.
   */
  getSignalPatterns: publicProcedure
    .input(z.object({
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const signals = (await db.select().from(signalRegistry)).filter((s: any) => reference_matches_domain(s.domain, input.domain));

      // Group by signal type
      const patterns: Record<string, {
        type: string;
        count: number;
        signals: typeof signals;
      }> = {};

      for (const s of signals) {
        const type = s.signal_type ?? "general";
        if (!patterns[type]) {
          patterns[type] = { type, count: 0, signals: [] };
        }
        patterns[type].count++;
        patterns[type].signals.push(s);
      }

      return {
        patterns: Object.values(patterns).sort((a, b) => b.count - a.count),
        total_signals: signals.length,
        source_kind: "signal_definition" as const,
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
      if (!DOCTRINE_GRAPH_NODE_TYPES.has(input.nodeType)) {
        return {
          graph_name: "doctrine_graph" as const,
          node_id: input.nodeId,
          node_type: input.nodeType,
          outgoing: [],
          incoming: [],
          returned_connections: 0,
          graph_available: false,
          graph_unavailable_reason: `Node type ${input.nodeType} is not owned by the doctrine graph.`,
          truncated: false,
        };
      }

      try {
        const { rows } = await query_with_diagnostics<any>(
          `(select 'outgoing'::text as direction,id,from_type::text,from_id,edge_type::text,to_type::text,to_id,strength::text,notes
              from public.doctrine_graph_edges
             where from_type = $1::public.doctrine_graph_edges_from_type_enum and from_id = $2
             order by id asc
             limit ${GRAPH_EXPANSION_LIMIT_PER_DIRECTION})
           union all
           (select 'incoming'::text as direction,id,from_type::text,from_id,edge_type::text,to_type::text,to_id,strength::text,notes
              from public.doctrine_graph_edges
             where to_type = $1::public.doctrine_graph_edges_to_type_enum and to_id = $2
             order by id asc
             limit ${GRAPH_EXPANSION_LIMIT_PER_DIRECTION})`,
          [input.nodeType, input.nodeId],
          { label: "dual_lens_doctrine_graph_expand", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 4_000 },
        );
        const outgoing = rows.filter((row) => row.direction === "outgoing");
        const incoming = rows.filter((row) => row.direction === "incoming");
        return {
          graph_name: "doctrine_graph" as const,
          node_id: input.nodeId,
          node_type: input.nodeType,
          outgoing,
          incoming,
          returned_connections: rows.length,
          graph_available: true,
          graph_unavailable_reason: null,
          truncated: outgoing.length === GRAPH_EXPANSION_LIMIT_PER_DIRECTION || incoming.length === GRAPH_EXPANSION_LIMIT_PER_DIRECTION,
        };
      } catch (error) {
        return {
          graph_name: "doctrine_graph" as const,
          node_id: input.nodeId,
          node_type: input.nodeType,
          outgoing: [],
          incoming: [],
          returned_connections: 0,
          graph_available: false,
          graph_unavailable_reason: graph_unavailable_reason(error),
          truncated: false,
        };
      }
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // LIVE DATA SIGNALS (from ingestion pipeline)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get live signals for the Structural Diagnostics lens.
   * Groups by signal type, includes explanations, stats, and dataset info.
   * Supports filtering by jurisdiction, domain, severity.
   */
  getLiveSignalsForDiagnostics: protectedProcedure
    .input(z.object({
      jurisdiction: z.string().max(128).optional(), domain: z.string().max(128).optional(),
      query: z.string().max(128).optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      limit: z.number().int().min(1).max(100).default(100),
      offset: z.number().int().min(0).max(1_000_000).default(0),
    }))
    .query(({ input }) => read_diagnostic_signals(input)),

  getLiveSignalSummary: protectedProcedure
    .input(z.object({
      jurisdiction: z.string().max(128).optional(), domain: z.string().max(128).optional(),
      query: z.string().max(128).optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
    }).optional())
    .query(({ input }) => read_diagnostic_signal_summary(input)),

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
      const enrichment = await enrichSignalWithInterpretation(input as any);
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
    const counts_request = query_with_diagnostics<{
      claim_count: number;
      proof_count: number;
      barrier_count: number;
      agency_count: number;
      workflow_count: number;
      deadline_count: number;
      doctrine_count: number;
      signal_count: number;
      court_count: number;
      live_signal_count: number;
    }>(
      `select
         (select count(*)::int from public.strategy_claim_catalog) as claim_count,
         (select count(*)::int from public.proof_frameworks) as proof_count,
         (select count(*)::int from public.litigation_barriers) as barrier_count,
         (select count(*)::int from public.agency_authority_map) as agency_count,
         (select count(*)::int from public.workflow_master) as workflow_count,
         (select count(*)::int from public.deadline_rules) as deadline_count,
         (select count(*)::int from public.doctrine_registry) as doctrine_count,
         (select count(*)::int from public.signal_registry) as signal_count,
         (select count(*)::int from public.court_directory) as court_count,
         (select count(*)::int from public.live_data_signals where is_current) as live_signal_count`,
      [],
      {
        label: "dual_lens_stats",
        pool_acquire_timeout_ms: 1_000,
        query_timeout_ms: DIAGNOSTICS_STATS_TIMEOUT_MS,
      },
    );
    // The graph total comes from the governed canonical-state contract. Keep
    // it independent from registry counts so a graph timeout is represented as
    // unavailable instead of turning the entire diagnostics summary into a 504.
    const graph_request = getCurrentCanonicalState()
      .then((state) => ({
        name: "canonical_civic_graph" as const,
        edges: canonical_graph_count(state.graph_edges, "graph_edges"),
        structural_edges: canonical_graph_count(state.structural_graph_edges, "structural_graph_edges"),
        semantic_edges: canonical_graph_count(state.semantic_graph_edges, "semantic_graph_edges"),
        unresolved_relationships: canonical_graph_count(state.unresolved_relationships, "unresolved_relationships"),
        available: true as const,
        reason: null,
        contract: state.contract,
      }))
      .catch((error: unknown) => ({
        name: "canonical_civic_graph" as const,
        edges: null,
        structural_edges: null,
        semantic_edges: null,
        unresolved_relationships: null,
        available: false as const,
        reason: graph_unavailable_reason(error),
        contract: null,
      }));

    const [{ rows }, graph] = await Promise.all([counts_request, graph_request]);
    const counts = rows[0] ?? {
      claim_count: 0,
      proof_count: 0,
      barrier_count: 0,
      agency_count: 0,
      workflow_count: 0,
      deadline_count: 0,
      doctrine_count: 0,
      signal_count: 0,
      court_count: 0,
      live_signal_count: 0,
    };

    return {
      case_resolution: {
        claims: Number(counts.claim_count),
        proof_frameworks: Number(counts.proof_count),
        barriers: Number(counts.barrier_count),
        agencies: Number(counts.agency_count),
        workflows: Number(counts.workflow_count),
        deadlines: Number(counts.deadline_count),
        courts: Number(counts.court_count),
      },
      structural_diagnostics: {
        doctrines: Number(counts.doctrine_count),
        signals: Number(counts.signal_count),
        source_kind: "reference_catalog" as const,
        barriers: Number(counts.barrier_count),
        detected_signals: Number(counts.live_signal_count),
      },
      graph,
    };
  }),
});
