import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { eq, like, and, or, desc, sql, inArray, count, gte, isNotNull } from "drizzle-orm";
import {
  litigationBarriers,
  agencyAuthorityMap,
  signalRegistry,
  doctrineRegistry,
} from "../../drizzle/schema";
import { enrichSignalWithInterpretation, loadInterpretationPack, getCategoryContext } from "../ingestion/interpretation-layer";
import { query_with_diagnostics } from "../db-legacy";
import { getCurrentCanonicalState } from "../services/current-canonical-state";

import { barrier_reference_scope, reference_matches_domain, reference_strings } from "../diagnostic-reference-contract";
import { read_diagnostic_signals, read_diagnostic_signal_summary } from "../diagnostic-signal-runtime";
import { get_reviewed_claim_reference, match_catalog_claims, reviewed_barrier_references, reviewed_claim_catalog, reviewed_source_context, reviewed_proof_reference_issue, type claim_catalog_row } from "../reviewed-claim-references";
import { assess_resolution_deadlines, deadline_jurisdiction_code, deadline_review_action } from "../resolution-deadline-contract";
import { read_resolution_deadlines, read_resolution_workflows, read_resolution_agencies,
  read_resolution_courts, read_resolution_escalations } from "../resolution-reference-runtime";

// Normalize legacy request keys once, at the transport boundary.
const resolution_action_input = z.preprocess((value) => {
  const input = value as Record<string, unknown> | null;
  if (!input || typeof input !== "object") return value;
  return {
    claim_type: input.claim_type ?? input.claimType,
    jurisdiction: input.jurisdiction,
    domain: input.domain,
    forum: input.forum,
    trigger_event: input.trigger_event ?? input.triggerEvent,
    event_date: input.event_date ?? input.eventDate,
  };
}, z.object({
  claim_type: z.string().trim().min(1).max(256),
  jurisdiction: z.string().trim().max(128).default(""),
  domain: z.string().trim().max(128).optional(),
  forum: z.string().trim().max(256).optional(),
  trigger_event: z.string().trim().max(512).optional(),
  event_date: z.string().date().optional(),
}));

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
   * Returns topic matches with the source terms that matched; applicability is unresolved.
   */
  match_claims: publicProcedure
    .input(z.object({
      problem_description: z.string().min(5).optional(),
      problemDescription: z.string().min(5).optional(), // legacy input boundary
      jurisdiction: z.string().optional(),
      category: z.string().optional(),
    }).transform(value => ({
      problem_description: value.problem_description ?? value.problemDescription ?? "",
      jurisdiction: value.jurisdiction, category: value.category,
    })).refine(value => value.problem_description.length >= 5, "Describe the situation in at least five characters"))
    .query(async ({ input }) => {
      const { rows } = await query_with_diagnostics<claim_catalog_row>(`
        select id, claim_type_id, canonical_name, domain, description
        from public.claim_catalog where deprecated = 0 order by id`, [],
        { label: "resolution_existing_claim_catalog", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 });
      return {
        matches: match_catalog_claims(rows, input.problem_description, input.category),
        total_claims: rows.length, query: input.problem_description,
        jurisdiction: input.jurisdiction ?? null,
        case_applicability: "not_assessed" as const,
      };
    }),

  get_proof_checklist: publicProcedure
    .input(z.object({
      claim_type: z.string().optional(), claimType: z.string().optional(), // legacy input boundary
      domain: z.string().optional(),
    }).transform(value => ({ claim_type: value.claim_type ?? value.claimType ?? "", domain: value.domain }))
      .refine(value => value.claim_type.length > 0, "A claim identity is required"))
    .query(async ({ input }) => {
      const source_reference = get_reviewed_claim_reference(input.claim_type);
      // A source claim ID is not a proof_frameworks primary key. Do not fabricate
      // evidence links or substitute a neighboring domain's checklist.
      const results = source_reference ? [] : (await query_with_diagnostics<{
        id: number; claim_type: string; domain: string; elements_of_proof: string | null;
        burden_of_proof: string | null; standard_of_review: string | null; required_causation: string | null;
        typical_evidence: string | null; common_defenses: string | null; key_precedents: string | null;
      }>(`select id, claim_type, domain, elements_of_proof, burden_of_proof,
                 standard_of_review, required_causation, typical_evidence, common_defenses, key_precedents
            from public.proof_frameworks where claim_type = $1 order by id`, [input.claim_type],
          { label: "resolution_exact_proof_reference", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 })).rows;
      const eligible = results.filter(row => reviewed_proof_reference_issue(row.claim_type, row.domain) === null);
      return {
        frameworks: eligible.map(row => ({
          id: row.id, claim_type: row.claim_type, domain: row.domain,
          elements_of_proof: row.elements_of_proof, burden_of_proof: row.burden_of_proof,
          standard_of_review: row.standard_of_review, required_causation: row.required_causation,
          typical_evidence: row.typical_evidence, common_defenses: row.common_defenses,
          key_precedents: row.key_precedents, legal_verification: "unverified" as const,
        })),
        count: eligible.length, source_reference,
        excluded_misclassified_frameworks: results.length - eligible.length,
        source_context: source_reference ? reviewed_source_context() : null,
        evidence_link_status: source_reference ? "source_reference_not_bound_to_proof_framework" : "existing_framework_ids_only",
      };
    }),

  get_barrier_alerts: publicProcedure
    .input(z.object({
      claim_type: z.string().optional(), claimType: z.string().optional(), // legacy input boundary
      jurisdiction: z.string().optional(), domain: z.string().optional(),
    }).transform(value => ({ claim_type: value.claim_type ?? value.claimType ?? "", jurisdiction: value.jurisdiction, domain: value.domain }))
      .refine(value => value.claim_type.length > 0, "A claim identity is required"))
    .query(async ({ input }) => {
      const all_barriers: Array<{ domains?: unknown; added_by?: string | null }> = await db.select().from(litigationBarriers);
      const barriers = reviewed_barrier_references(input.claim_type);
      return {
        barriers, total_barriers: barriers.length,
        excluded_unverified_references: all_barriers.filter(row => barrier_reference_scope(row) !== "catalog_reference").length,
        unmatched_catalog_references: all_barriers.filter(row => barrier_reference_scope(row) === "catalog_reference").length,
        source_context: reviewed_source_context(),
        case_applicability: "not_assessed" as const,
      };
    }),

  get_reference_catalog: publicProcedure.query(() => ({
    claims: reviewed_claim_catalog.claims,
    barriers: reviewed_barrier_references(),
    ...reviewed_source_context(),
  })),

  /**
   * Step 4: Find the right agency and forum for a claim.
   * Returns agencies, courts, and filing information.
   */
  find_agency_and_forum: publicProcedure
    .input(resolution_action_input)
    .query(async ({ input }) => {
      const jurisdiction_code = deadline_jurisdiction_code(input.jurisdiction);
      const [agencies, courts, workflows, deadline_references, escalations] = await Promise.all([
        read_resolution_agencies(), read_resolution_courts(), read_resolution_workflows(),
        read_resolution_deadlines(), read_resolution_escalations(),
      ]);
      const domain_keywords = (input.domain || input.claim_type).toLowerCase().split(/[\s_-]+/).filter(word => word.length > 2);
      const relevant_agencies = agencies.filter(reference => {
        const text = [reference.agency, reference.agency_short, reference.domain, reference.statute,
          reference.complaint_pathway, JSON.stringify(reference.statutory_authority)].join(" ").toLowerCase();
        return domain_keywords.some(word => text.includes(word));
      });
      const relevant_courts = jurisdiction_code ? courts.filter(reference =>
        deadline_jurisdiction_code(reference.jurisdiction) === jurisdiction_code,
      ) : [];
      const relevant_workflows = jurisdiction_code ? workflows.filter(reference => {
        const text = [reference.domain, reference.primary_agency, reference.title].join(" ").toLowerCase();
        return deadline_jurisdiction_code(reference.jurisdiction) === jurisdiction_code &&
          domain_keywords.some(word => text.includes(word));
      }) : [];
      const workflow_ids = new Set(relevant_workflows.map(reference => reference.id));
      const relevant_escalations = escalations.filter(reference =>
        reference.workflow_id != null && workflow_ids.has(reference.workflow_id),
      );
      const deadline_assessment = assess_resolution_deadlines(deadline_references, input);
      return {
        reference_status: "applicability_not_established" as const,
        agencies: relevant_agencies.slice(0, 8),
        courts: relevant_courts.slice(0, 5),
        workflows: relevant_workflows.slice(0, 3),
        deadlines: deadline_assessment.references,
        deadline_assessment,
        escalations: relevant_escalations.slice(0, 3),
      };
    }),

  /**
   * Step 5: Generate the next action recommendation.
   * Combines all resolution data into a prioritized action list.
   */
  get_next_action: publicProcedure
    .input(resolution_action_input)
    .query(async ({ input }) => {
      const [deadline_references, workflows] = await Promise.all([
        read_resolution_deadlines(), read_resolution_workflows(),
      ]);
      const deadline_assessment = assess_resolution_deadlines(deadline_references, input);
      const jurisdiction_code = deadline_jurisdiction_code(input.jurisdiction);
      const domain_keywords = (input.domain || input.claim_type).toLowerCase().split(/[\s_-]+/).filter(word => word.length > 2);
      const matched_workflow = jurisdiction_code ? workflows.find(reference => {
        const text = [reference.domain, reference.primary_agency, reference.title].join(" ").toLowerCase();
        return deadline_jurisdiction_code(reference.jurisdiction) === jurisdiction_code &&
          domain_keywords.some(word => text.includes(word));
      }) : undefined;

      // Build action items
      const actions: Array<{
        priority: number;
        action: string;
        detail: string;
        urgency: "critical" | "high" | "medium" | "low" | "unknown";
        type: "deadline" | "filing" | "evidence" | "consultation" | "research";
        href?: string;
      }> = [];

      actions.push(deadline_review_action(deadline_assessment));

      // Add workflow-driven actions
      if (matched_workflow) {
        actions.push({
          priority: 2,
          action: `Review ${matched_workflow.title} workflow`,
          detail: `Catalog reference: ${matched_workflow.primary_agency} in ${matched_workflow.jurisdiction}. Confirm the agency, eligibility and filing requirements before using this route.`,
          href: "/enforcement-pathway",
          urgency: "high",
          type: "filing",
        });
      }

      // Add evidence-gathering action
      actions.push({
        priority: 3,
        action: "Gather supporting evidence",
        detail: `Collect documents, communications, and records related to your ${input.claim_type} claim`,
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
        has_urgent_deadline: deadline_assessment.has_urgent_deadline,
        nearest_deadline_days: deadline_assessment.nearest_deadline_days,
        deadline_assessment,
        workflow_available: !!matched_workflow,
      };
    }),

  /**
   * Source-reference preview using the same identities as the stepwise lens.
   * This does not declare a complete or applicable legal resolution.
   */
  resolve_case: publicProcedure
    .input(z.object({
      problem_description: z.string().min(5).optional(), problemDescription: z.string().min(5).optional(),
      jurisdiction: z.string(), category: z.string().optional(),
    }).transform(value => ({ problem_description: value.problem_description ?? value.problemDescription ?? "", jurisdiction: value.jurisdiction, category: value.category }))
      .refine(value => value.problem_description.length >= 5, "Describe the situation in at least five characters"))
    .query(async ({ input }) => {
      const { rows } = await query_with_diagnostics<claim_catalog_row>(`
        select id, claim_type_id, canonical_name, domain, description
        from public.claim_catalog where deprecated = 0 order by id`, [],
        { label: "resolution_existing_claim_catalog", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 });
      const matches = match_catalog_claims(rows, input.problem_description, input.category);
      const claim_match = matches[0] ?? null;
      const source_reference = claim_match ? get_reviewed_claim_reference(claim_match.claim_type) : null;
      return {
        resolved: false,
        reference_match_found: claim_match !== null,
        resolution_status: claim_match ? "references_available_applicability_unresolved" : "no_topic_match",
        message: claim_match ? `Source references for ${claim_match.canonical_name}; case applicability remains unresolved.` : "No catalog topic matched the supplied description.",
        claim_match, proof_checklist: source_reference,
        barriers: claim_match ? reviewed_barrier_references(claim_match.claim_type) : [],
        agency: null, next_action: null,
        unresolved_requirements: ["claim_applicability", "forum_and_agency", "event_based_deadline", "reviewed_proof_binding"],
        source_context: source_reference ? reviewed_source_context() : null,
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
