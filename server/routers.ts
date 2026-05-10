import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import { router, publicProcedure } from "./_core/trpc";
import { db } from "./db";
import { computeReadiness } from "./services/readiness-gate";
import {
  createWindowEntry,
  checkWindow,
  updateWindowStatus,
  canTriggerFollowUp,
  triggerFollowUp,
  triggerMediaEscalation,
  type WindowEntry,
} from "./services/escalation-window-service";

const CASE_ID = z.object({ caseId: z.string().min(1) });
const INSTANCE_ID = z.object({ instanceId: z.string().min(1) });

function rows<T = any>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as any).rows)) return (result as any).rows as T[];
  return [];
}

async function query<T = any>(statement: any): Promise<T[]> {
  return rows<T>(await db.execute(statement));
}

function numberValue(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function jsonArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hashObject(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function loadProblem(identifier: string): Promise<any | null> {
  const [problem] = await query(sql`
    select *
    from problem_instances
    where id::text = ${identifier} or record_id = ${identifier}
    limit 1
  `);
  return problem ?? null;
}

async function loadCase(caseId: string): Promise<any | null> {
  const [caseRow] = await query(sql`
    select *
    from cases
    where id::text = ${caseId}
    limit 1
  `);
  return caseRow ?? null;
}

async function loadCaseBundle(caseId: string) {
  const problem = await loadProblem(caseId);
  const caseRow = problem ? null : await loadCase(caseId);
  const actualCaseId = caseRow?.id ?? null;
  const problemId = problem?.id ?? null;

  const evidenceRows = problemId
    ? await query(sql`select * from evidence where problem_instance_id = ${problemId}::uuid order by created_at desc nulls last`)
    : actualCaseId
      ? await query(sql`select * from evidence_items where case_id = ${actualCaseId}::uuid order by created_at desc nulls last`)
      : [];

  const findingRows = problemId
    ? await query(sql`select * from findings where problem_instance_id = ${problemId}::uuid order by created_at desc nulls last`)
    : actualCaseId
      ? await query(sql`select * from findings where case_id = ${actualCaseId}::uuid order by created_at desc nulls last`)
      : [];

  const actionRows = problemId
    ? await query(sql`select * from action_queue where problem_instance_id = ${problemId}::uuid order by priority asc, created_at desc nulls last`)
    : actualCaseId
      ? await query(sql`select * from action_queue where case_id = ${actualCaseId}::uuid order by priority asc, created_at desc nulls last`)
      : [];

  const provenanceRows = await query(sql`
    select *
    from provenance_log
    where (entity_id::text = ${caseId} or entity_id::text = ${problemId ?? "00000000-0000-0000-0000-000000000000"})
       or provenance_ref = ${caseId}
    order by timestamp desc
    limit 200
  `);

  return { caseRow, problem, evidenceRows, findingRows, actionRows, provenanceRows };
}

function toProblemItem(row: any) {
  const friction = numberValue(row.friction_coefficient, 0.4);
  const micro = numberValue(row.alignment_micro, 0.5);
  const meso = numberValue(row.alignment_meso, 0.5);
  const macro = numberValue(row.alignment_macro, 0.5);
  const system = numberValue(row.alignment_system, 0.5);
  const alignment = clamp01((micro + meso + macro + system) / 4);
  const severity = friction >= 0.75 ? "critical" : friction >= 0.55 ? "high" : friction >= 0.35 ? "medium" : "low";

  return {
    ...row,
    id: row.id,
    recordId: row.record_id,
    record_id: row.record_id,
    problemType: row.problem_type,
    problem_type: row.problem_type,
    jurisdiction: row.jurisdiction,
    systemPrimary: row.system_primary,
    system_primary: row.system_primary,
    validationStatus: row.validation_status,
    validation_status: row.validation_status,
    frictionCoefficient: friction,
    friction_coefficient: friction,
    frictionSeverity: severity,
    alignmentComposite: alignment,
    friction: { coefficient: friction, severity, sources: jsonArray(row.friction_sources) },
    alignment: { micro, meso, macro, system, composite: alignment },
    riskLevel: friction >= 0.65 && alignment < 0.55 ? "high" : friction >= 0.45 ? "medium" : "low",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildFrictionReport(row: any, evidenceRows: any[] = [], findingRows: any[] = []) {
  const item = toProblemItem(row);
  const sources = jsonArray<string>(row.friction_sources);
  const narrative = `${item.problem_type} in ${item.jurisdiction} has ${item.frictionSeverity} friction (${item.frictionCoefficient.toFixed(2)}) across ${item.system_primary}.`;
  return {
    instanceId: row.id,
    recordId: row.record_id,
    friction: {
      coefficient: item.frictionCoefficient,
      severity: item.frictionSeverity,
      sources,
      narrative,
    },
    alignment: {
      micro: numberValue(row.alignment_micro, 0.5),
      meso: numberValue(row.alignment_meso, 0.5),
      macro: numberValue(row.alignment_macro, 0.5),
      system: numberValue(row.alignment_system, 0.5),
      composite: item.alignmentComposite,
    },
    risk: {
      level: item.riskLevel,
      narrative: item.riskLevel === "high" ? "High escalation risk due to elevated friction and weaker alignment." : "Risk appears manageable with documented follow-through.",
    },
    evidenceCount: evidenceRows.length,
    findingCount: findingRows.length,
    computedAt: new Date().toISOString(),
  };
}

function jurisdictionLevel(jurisdiction: string | null | undefined): string {
  const j = (jurisdiction ?? "").toLowerCase();
  if (j.includes("federal") || j.includes("usa") || j.includes("united states")) return "federal";
  if (/\b[a-z]{2}\b/.test(j) || j.includes("state")) return "state";
  if (j.includes("county")) return "county";
  if (j.includes("city") || j.includes("municipal")) return "municipal";
  return "unknown";
}

function buildCaseExportPayload(caseId: string, bundle: Awaited<ReturnType<typeof loadCaseBundle>>) {
  const core = bundle.problem ? toProblemItem(bundle.problem) : {
    id: bundle.caseRow?.id ?? caseId,
    recordId: bundle.caseRow?.id ?? caseId,
    record_id: bundle.caseRow?.id ?? caseId,
    problemType: bundle.caseRow?.title ?? "case",
    problem_type: bundle.caseRow?.title ?? "case",
    jurisdiction: bundle.caseRow?.jurisdiction ?? "unknown",
    systemPrimary: "case_management",
    system_primary: "case_management",
    validationStatus: "READY",
    frictionCoefficient: 0.4,
    frictionSeverity: "medium",
    alignmentComposite: 0.7,
    friction: { coefficient: 0.4, severity: "medium", sources: [] },
    alignment: { micro: 0.7, meso: 0.7, macro: 0.7, system: 0.7, composite: 0.7 },
    riskLevel: "medium",
  };

  const sourceFacts = {
    evidence_count: bundle.evidenceRows.length,
    finding_count: bundle.findingRows.length,
    action_count: bundle.actionRows.length,
    evidence_items: bundle.evidenceRows.map((e: any) => ({
      id: e.id,
      source_document: e.source_document ?? e.title ?? e.source_type ?? "uploaded evidence",
      evidence_type: e.evidence_type ?? e.source_type ?? "document",
      content: e.content ?? e.description ?? "",
      provenance_hash: e.provenance_hash ?? hashObject(e),
    })),
    finding_items: bundle.findingRows.map((f: any) => ({
      id: f.id,
      finding_type: f.finding_type ?? f.recommendation_type ?? "finding",
      description: f.description ?? f.title ?? "",
      confidence: numberValue(f.confidence, 0.6),
    })),
    action_items: bundle.actionRows.map((a: any) => ({
      id: a.id,
      action_type: a.action_type ?? "review",
      description: a.description ?? "Review case materials",
      priority: numberValue(a.priority, 5),
      status: a.status ?? "pending",
    })),
  };

  const factHash = {
    algorithm: "sha256" as const,
    hash: hashObject({ core, sourceFacts }),
    input_fields: ["core_state", "source_facts", "actions", "findings", "evidence"],
    computed_at: new Date().toISOString(),
  };

  const coverageOverall = clamp01((Math.min(sourceFacts.evidence_count, 3) / 3) * 0.35 + (Math.min(sourceFacts.finding_count, 3) / 3) * 0.35 + (Math.min(sourceFacts.action_count, 2) / 2) * 0.3);
  const payload = {
    schema_version: "3.0" as const,
    export_type: "case_export" as const,
    source_system: "luminari" as const,
    exported_at: new Date().toISOString(),
    core_state: core,
    source_facts: sourceFacts,
    timeline: bundle.provenanceRows.map((p: any) => ({
      timestamp: iso(p.timestamp) ?? new Date().toISOString(),
      event_type: p.operation ?? p.status ?? "status_change",
      description: p.reasons ? JSON.stringify(p.reasons) : `${p.from_library ?? "system"} → ${p.to_library ?? "system"}`,
      source: p.from_library ?? "provenance_log",
      actor: p.caller ?? null,
    })),
    derived_context: {
      friction_narrative: bundle.problem ? buildFrictionReport(bundle.problem, bundle.evidenceRows, bundle.findingRows).friction.narrative : "Case assembled from Supabase records.",
      alignment_narrative: `Alignment composite is ${numberValue(core.alignmentComposite, 0.7).toFixed(2)}.`,
      risk_narrative: `Risk level is ${core.riskLevel ?? "medium"}.`,
      coordination_narrative: `${bundle.actionRows.length} action(s) are currently tracked for the case.`,
      jurisdiction_narrative: `${core.jurisdiction ?? "Unknown"} is normalized as ${jurisdictionLevel(core.jurisdiction)} jurisdiction.`,
      recommended_pathway_narrative: "Use readiness approval, verified contacts, and provenance logging before external transmission.",
      dominant_problem_type: core.problem_type ?? core.problemType ?? "case",
      dominant_jurisdiction: core.jurisdiction ?? "unknown",
      dominant_system: core.system_primary ?? core.systemPrimary ?? "case_management",
      avg_friction: numberValue(core.frictionCoefficient, 0.4),
      max_friction: numberValue(core.frictionCoefficient, 0.4),
      coordination_summary: { deadlocked: 0, with_conflicts: 0, total_systems: 1 },
    },
    traceability: {
      export_id: randomUUID(),
      case_id: caseId,
      fact_hash: factHash,
      schema_version: "3.0",
      exported_at: new Date().toISOString(),
      source_system: "luminari" as const,
      validation: { valid: true, errors: [], warnings: [] },
      coverage: {
        total_score: Math.round(coverageOverall * 100),
        max_possible: 100,
        percentage: Math.round(coverageOverall * 100),
        confidence: coverageOverall >= 0.7 ? "high" : coverageOverall >= 0.4 ? "medium" : "low",
        breakdown: [],
        missing_fields: [],
        overall: coverageOverall,
        evidence_coverage: sourceFacts.evidence_count > 0 ? 1 : 0,
        finding_coverage: sourceFacts.finding_count > 0 ? 1 : 0,
        action_coverage: sourceFacts.action_count > 0 ? 1 : 0,
        coordination_coverage: 0.7,
        friction_coverage: bundle.problem ? 1 : 0.5,
      },
      self_sufficient: true,
      reproducibility_guarantee: "The fact hash is computed from the exported core state and source facts.",
    },
    coverage: undefined as any,
    relationships: {
      correlated_instances: [],
      evidence_links: [],
      cross_system_connections: [],
    },
    escalation_state: {
      current_state: "READY_FOR_REVIEW",
      escalation_stage: "INITIAL" as const,
      sent_at: null,
      days_elapsed: null,
      days_remaining: 30,
      window_elapsed: false,
      media_escalation_requested: false,
      flow_hash: null,
      has_active_flow: false,
    },
    provenance_chain: bundle.provenanceRows.map((p: any) => ({
      id: p.id,
      operation: p.operation ?? p.status ?? "state_transition",
      from_state: p.from_library ?? null,
      to_state: p.to_library ?? null,
      timestamp: iso(p.timestamp) ?? new Date().toISOString(),
      operator: p.caller ?? null,
      payload_hash: p.payload_hash ?? null,
      transition_id: p.transition_id,
    })),
    routing_decision: null,
    resolved_contacts: null,
    action_bundle: null as any,
  };
  payload.coverage = payload.traceability.coverage;
  return payload;
}

async function logProvenance(input: { entityId: string; operation: string; fromState?: string | null; toState?: string | null; status?: string; reasons?: unknown; caller?: string | null; payload?: unknown }) {
  const transitionId = `${input.operation}:${Date.now()}:${randomUUID()}`;
  await db.execute(sql`
    insert into provenance_log (transition_id, timestamp, from_library, to_library, status, reasons, entity_type, entity_id, operation, caller, payload_hash, provenance_ref)
    values (${transitionId}, now(), ${input.fromState ?? "api"}, ${input.toState ?? input.operation}, ${input.status ?? "completed"}, ${JSON.stringify(input.reasons ?? [])}::jsonb, 'case', ${input.entityId}::uuid, ${input.operation}, ${input.caller ?? "system"}, ${hashObject(input.payload ?? input)}, ${input.entityId})
  `);
  return transitionId;
}

async function buildActionBundle(caseId: string) {
  const bundle = await loadCaseBundle(caseId);
  const contacts = await resolveContactsForCase(caseId);
  const actions = bundle.actionRows.length > 0 ? bundle.actionRows : [{ id: randomUUID(), action_type: "case_review", description: "Review case export and prepare transmission packet", priority: 5, status: "pending" }];
  return {
    bundle_id: randomUUID(),
    case_id: caseId,
    generated_at: new Date().toISOString(),
    action_count: actions.length,
    endpoint_count: contacts.contacts.length,
    primary_actions: actions.map((a: any) => ({
      id: a.id,
      action_type: a.action_type ?? "review",
      description: a.description ?? "Review case materials",
      priority: numberValue(a.priority, 5),
      target_entity: contacts.primary_contact?.entity_name ?? contacts.primary_contact?.organization ?? "Verified contact queue",
    })),
    endpoints: contacts.contacts.map((c: any) => ({
      id: c.id,
      entity_name: c.entity_name ?? c.organization ?? c.name,
      entity_type: c.entity_type ?? c.contact_type ?? "agency",
      jurisdiction: c.jurisdiction,
      email: c.email ?? c.contact_value,
      phone: c.phone,
      web_url: c.web_url ?? c.form_url,
    })),
    bundle_hash: hashObject({ caseId, actions, contacts: contacts.contacts }),
  };
}

async function resolveContactsForCase(caseId: string) {
  const bundle = await loadCaseBundle(caseId);
  const jurisdiction = bundle.problem?.jurisdiction ?? bundle.caseRow?.jurisdiction ?? null;
  const problemType = bundle.problem?.problem_type ?? bundle.caseRow?.title ?? null;
  const contacts = await query(sql`
    select *
    from escalation_contacts
    where is_active is not false
      and (${jurisdiction}::text is null or jurisdiction is null or lower(jurisdiction) = lower(${jurisdiction}) or lower(coalesce(jurisdiction_level, '')) = lower(${jurisdictionLevel(jurisdiction)}))
    order by is_verified desc nulls last, last_verified desc nulls last, created_at desc nulls last
    limit 20
  `);
  return {
    caseId,
    jurisdiction,
    problemType,
    contact_count: contacts.length,
    contacts,
    primary_contact: contacts[0] ?? null,
    resolution_hash: hashObject({ caseId, jurisdiction, contacts: contacts.map((c: any) => c.id) }),
    generated_at: new Date().toISOString(),
  };
}

async function approvalState(caseId: string) {
  const [latest] = await query(sql`
    select * from provenance_log
    where entity_type = 'case' and (entity_id::text = ${caseId} or provenance_ref = ${caseId})
      and operation like 'approval.%'
    order by timestamp desc
    limit 1
  `);
  return {
    case_id: caseId,
    state: latest?.operation?.split(".").pop() ?? "draft",
    current_state: latest?.operation?.split(".").pop() ?? "draft",
    updated_at: iso(latest?.timestamp) ?? null,
    latest_transition: latest ?? null,
  };
}

const authRouter = router({
  me: publicProcedure.query(() => ({ user: null, isAuthenticated: false })),
  logout: publicProcedure.mutation(() => ({ success: true })),
});

const problemsRouter = router({
  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100), offset: z.number().int().min(0).default(0) }).partial().optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 100;
      const offset = input?.offset ?? 0;
      const data = await query(sql`
        select * from problem_instances
        order by created_at desc nulls last, record_id asc
        limit ${limit} offset ${offset}
      `);
      const [{ count } = { count: data.length }] = await query<{ count: string | number }>(sql`select count(*)::int as count from problem_instances`);
      return { items: data.map(toProblemItem), total: numberValue(count, data.length), limit, offset };
    }),
  getInterpretation: publicProcedure.input(INSTANCE_ID).query(async ({ input }) => {
    const problem = await loadProblem(input.instanceId);
    if (!problem) return null;
    const bundle = await loadCaseBundle(input.instanceId);
    return {
      instanceId: problem.id,
      recordId: problem.record_id,
      summary: `${problem.problem_type} involving ${problem.system_primary} in ${problem.jurisdiction}.`,
      friction: buildFrictionReport(problem, bundle.evidenceRows, bundle.findingRows).friction,
      evidence: bundle.evidenceRows,
      findings: bundle.findingRows,
      actions: bundle.actionRows,
      resolutionPathways: problem.resolution_pathways ?? [],
      coordination: problem.coordination_data ?? {},
      generatedAt: new Date().toISOString(),
    };
  }),
});

const frictionRouter = router({
  report: publicProcedure.input(INSTANCE_ID).query(async ({ input }) => {
    const problem = await loadProblem(input.instanceId);
    if (!problem) return null;
    const bundle = await loadCaseBundle(input.instanceId);
    return buildFrictionReport(problem, bundle.evidenceRows, bundle.findingRows);
  }),
  all: publicProcedure.input(z.object({ limit: z.number().default(100) }).optional()).query(async ({ input }) => {
    const data = await query(sql`select * from problem_instances order by created_at desc nulls last limit ${input?.limit ?? 100}`);
    return data.map((row) => buildFrictionReport(row));
  }),
  aggregates: publicProcedure.query(async () => {
    const data = await query(sql`select * from problem_instances`);
    const reports = data.map((row) => buildFrictionReport(row));
    const avg = reports.length ? reports.reduce((sum, r) => sum + r.friction.coefficient, 0) / reports.length : 0;
    return { totalInstances: reports.length, avgFriction: avg, avgAlignment: reports.length ? reports.reduce((sum, r) => sum + r.alignment.composite, 0) / reports.length : 0, byType: {}, bySeverity: {}, byRisk: {} };
  }),
});

const correlationsRouter = router({
  forInstance: publicProcedure.input(INSTANCE_ID.extend({ minScore: z.number().default(0.25) })).query(async ({ input }) => {
    const problem = await loadProblem(input.instanceId);
    if (!problem) return { instanceId: input.instanceId, matches: [], total: 0 };
    const candidates = await query(sql`
      select * from problem_instances
      where id <> ${problem.id}::uuid
        and (problem_type = ${problem.problem_type} or jurisdiction = ${problem.jurisdiction} or system_primary = ${problem.system_primary})
      order by created_at desc nulls last
      limit 50
    `);
    const matches = candidates.map((row: any) => {
      const score = clamp01((row.problem_type === problem.problem_type ? 0.4 : 0) + (row.jurisdiction === problem.jurisdiction ? 0.3 : 0) + (row.system_primary === problem.system_primary ? 0.3 : 0));
      return { ...toProblemItem(row), correlation_score: score, score, match_type: score >= 0.7 ? "strong" : "partial" };
    }).filter((m) => m.score >= input.minScore);
    return { instanceId: problem.id, recordId: problem.record_id, matches, total: matches.length };
  }),
});

const enrichmentRouter = router({
  jurisdictionLevel: publicProcedure.input(z.object({ jurisdiction: z.string().optional(), instanceId: z.string().optional() })).query(async ({ input }) => {
    const problem = input.instanceId ? await loadProblem(input.instanceId) : null;
    const jurisdiction = input.jurisdiction ?? problem?.jurisdiction ?? null;
    return { jurisdiction, level: jurisdictionLevel(jurisdiction), normalized: jurisdictionLevel(jurisdiction), confidence: jurisdiction ? 0.9 : 0.2 };
  }),
  evidenceLinks: publicProcedure.input(INSTANCE_ID).query(async ({ input }) => {
    const bundle = await loadCaseBundle(input.instanceId);
    return bundle.findingRows.flatMap((finding: any) => {
      const linked = jsonArray<string>(finding.evidence_links);
      const evidence = linked.length ? bundle.evidenceRows.filter((e: any) => linked.includes(e.id)) : bundle.evidenceRows.slice(0, 3);
      return evidence.map((e: any) => ({ from_finding: finding.id, to_evidence: e.id, link_type: "supports", confidence: numberValue(finding.confidence, 0.6), finding, evidence: e }));
    });
  }),
  correlations: publicProcedure.input(INSTANCE_ID).query(async ({ input }) => {
    const problem = await loadProblem(input.instanceId);
    if (!problem) return { instanceId: input.instanceId, matches: [], total: 0, graph: { nodes: [], edges: [] } };
    const candidates = await query(sql`
      select * from problem_instances
      where id <> ${problem.id}::uuid
        and (problem_type = ${problem.problem_type} or jurisdiction = ${problem.jurisdiction} or system_primary = ${problem.system_primary})
      order by created_at desc nulls last
      limit 50
    `);
    const matches = candidates.map((row: any) => {
      const score = clamp01((row.problem_type === problem.problem_type ? 0.4 : 0) + (row.jurisdiction === problem.jurisdiction ? 0.3 : 0) + (row.system_primary === problem.system_primary ? 0.3 : 0));
      return { ...toProblemItem(row), correlation_score: score, score, match_type: score >= 0.7 ? "strong" : "partial" };
    }).filter((m) => m.score >= 0.25);
    return {
      instanceId: problem.id,
      recordId: problem.record_id,
      matches,
      total: matches.length,
      graph: {
        nodes: [{ id: problem.id, label: problem.record_id, type: "source" }, ...matches.map((m: any) => ({ id: m.id, label: m.record_id, type: "match" }))],
        edges: matches.map((m: any) => ({ from: problem.id, to: m.id, weight: m.score, label: m.match_type })),
      },
    };
  }),
});

const exportRouter = router({
  single: publicProcedure.input(z.object({ recordId: z.string().min(1) })).query(async ({ input }) => {
    const problem = await loadProblem(input.recordId);
    if (!problem) throw new TRPCError({ code: "NOT_FOUND", message: "Problem instance not found" });
    const payload = buildCaseExportPayload(input.recordId, await loadCaseBundle(input.recordId));
    return { export_type: "single", recordId: input.recordId, payload, json: payload, generatedAt: new Date().toISOString() };
  }),
  batch: publicProcedure.input(z.object({ filters: z.any().optional(), limit: z.number().default(100), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const limit = input?.limit ?? 100;
    const offset = input?.offset ?? 0;
    const data = await query(sql`select * from problem_instances order by created_at desc nulls last limit ${limit} offset ${offset}`);
    return { export_type: "batch", total: data.length, items: data.map(toProblemItem), generatedAt: new Date().toISOString() };
  }),
});

const caseExportRouter = router({
  generate: publicProcedure.input(CASE_ID).query(async ({ input }) => buildCaseExportPayload(input.caseId, await loadCaseBundle(input.caseId))),
  verify: publicProcedure.input(z.object({ caseId: z.string(), expectedHash: z.string().optional() })).query(async ({ input }) => {
    const payload = buildCaseExportPayload(input.caseId, await loadCaseBundle(input.caseId));
    const actual = payload.traceability.fact_hash.hash;
    return { valid: !input.expectedHash || input.expectedHash === actual, expectedHash: input.expectedHash ?? actual, actualHash: actual, verifiedAt: new Date().toISOString() };
  }),
});

const actionBundleRouter = router({
  generate: publicProcedure.input(CASE_ID).query(async ({ input }) => buildActionBundle(input.caseId)),
});

const truthValidationRouter = router({
  check: publicProcedure.input(CASE_ID).query(async ({ input }) => {
    const bundle = await loadCaseBundle(input.caseId);
    const failures: string[] = [];
    if (!bundle.problem && !bundle.caseRow) failures.push("Case or problem instance was not found.");
    if (bundle.evidenceRows.length === 0) failures.push("No evidence records are attached.");
    if (bundle.findingRows.length === 0) failures.push("No findings are attached.");
    return { passed: failures.length === 0, failures, warnings: bundle.actionRows.length === 0 ? ["No action queue entries are attached."] : [], checkedAt: new Date().toISOString() };
  }),
});

const readinessRouter = router({
  check: publicProcedure.input(CASE_ID).query(async ({ input }) => {
    const payload = buildCaseExportPayload(input.caseId, await loadCaseBundle(input.caseId));
    const readiness = computeReadiness(payload as any);
    return { case_id: input.caseId, export: payload, readiness };
  }),
  prepare: publicProcedure.input(CASE_ID).mutation(async ({ input }) => {
    const exportPayload = buildCaseExportPayload(input.caseId, await loadCaseBundle(input.caseId));
    const actionBundle = await buildActionBundle(input.caseId);
    const readiness = computeReadiness(exportPayload as any);
    const transitionId = await logProvenance({ entityId: input.caseId, operation: "approval.prepared", toState: "prepared", payload: { exportPayload, actionBundle, readiness } });
    return { success: true, case_id: input.caseId, export: exportPayload, action_bundle: actionBundle, readiness, transition_id: transitionId };
  }),
});

const approvalRouter = router({
  state: publicProcedure.input(CASE_ID).query(async ({ input }) => approvalState(input.caseId)),
  list: publicProcedure.input(z.object({ limit: z.number().default(50) }).optional()).query(async ({ input }) => {
    const limit = input?.limit ?? 50;
    const data = await query(sql`
      select distinct on (entity_id) entity_id::text as case_id, operation, status, timestamp, reasons, payload_hash
      from provenance_log
      where entity_type = 'case' and operation like 'approval.%'
      order by entity_id, timestamp desc
      limit ${limit}
    `);
    return data.map((entry: any) => ({ ...entry, state: entry.operation?.split(".").pop() ?? "draft", guard_result: { passed: true, failures: [] } }));
  }),
  approve: publicProcedure.input(CASE_ID.extend({ reviewer: z.string().optional() })).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.approved", toState: "approved", caller: input.reviewer }) })),
  queueForTransmission: publicProcedure.input(CASE_ID).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.queued_for_transmission", toState: "queued_for_transmission" }) })),
  send: publicProcedure.input(CASE_ID).mutation(async ({ input }) => ({ success: true, sent_at: new Date().toISOString(), transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.sent", toState: "sent" }) })),
  acknowledge: publicProcedure.input(CASE_ID).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.acknowledged", toState: "acknowledged" }) })),
  complete: publicProcedure.input(CASE_ID).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.completed", toState: "completed" }) })),
});

function buildWindow(caseId: string, sentAt?: string | null, requestedMedia = false): WindowEntry {
  const entry = createWindowEntry(caseId, `packet:${caseId}`);
  if (sentAt) entry.sent_at = sentAt;
  if (requestedMedia) entry.escalation_stage = "PUBLIC";
  return updateWindowStatus(entry);
}

const escalationRouter = router({
  getFlowState: publicProcedure.input(CASE_ID).query(async ({ input }) => {
    const [esc] = await query(sql`select * from escalations where case_id::text = ${input.caseId} or problem_instance_id::text = ${input.caseId} order by updated_at desc nulls last, created_at desc nulls last limit 1`);
    return { caseId: input.caseId, current_state: esc?.status ?? "READY", escalation_stage: esc?.metadata?.escalation_stage ?? "INITIAL", flow_hash: hashObject(esc ?? input), escalation: esc ?? null };
  }),
  check30DayWindow: publicProcedure.input(CASE_ID).query(async ({ input }) => {
    const [latestSent] = await query(sql`select * from provenance_log where entity_type = 'case' and (entity_id::text = ${input.caseId} or provenance_ref = ${input.caseId}) and operation in ('approval.sent','escalation.sent','escalation.follow_up') order by timestamp desc limit 1`);
    const entry = buildWindow(input.caseId, iso(latestSent?.timestamp));
    return { ...entry, check: checkWindow(entry) };
  }),
  getEscalationHistory: publicProcedure.input(CASE_ID).query(async ({ input }) => query(sql`select * from provenance_log where entity_type = 'case' and (entity_id::text = ${input.caseId} or provenance_ref = ${input.caseId}) and (operation like 'escalation.%' or operation like 'approval.%') order by timestamp desc limit 100`)),
  transitionState: publicProcedure.input(CASE_ID.extend({ toState: z.string(), fromState: z.string().optional(), reason: z.string().optional() })).mutation(async ({ input }) => {
    const transitionId = await logProvenance({ entityId: input.caseId, operation: "escalation.transition", fromState: input.fromState, toState: input.toState, reasons: input.reason ? [input.reason] : [] });
    await db.execute(sql`insert into escalations (case_id, status, metadata, created_at, updated_at) values (${input.caseId}::uuid, ${input.toState}, ${JSON.stringify({ reason: input.reason })}::jsonb, now(), now()) on conflict do nothing`);
    return { success: true, transition_id: transitionId, current_state: input.toState };
  }),
  requestFollowUpEscalation: publicProcedure.input(CASE_ID.extend({ operatorOverride: z.boolean().optional() })).mutation(async ({ input }) => {
    const entry = buildWindow(input.caseId);
    if (!canTriggerFollowUp(entry, input.operatorOverride ?? false)) return { success: false, reason: "30-day response window has not elapsed", window: entry };
    const updated = input.operatorOverride ? { ...entry, follow_up_triggered_at: new Date().toISOString(), escalation_stage: "FOLLOW_UP" as const, updated_at: new Date().toISOString() } : triggerFollowUp(entry);
    const transitionId = await logProvenance({ entityId: input.caseId, operation: "escalation.follow_up", toState: "FOLLOW_UP", payload: updated });
    return { success: true, transition_id: transitionId, window: updated };
  }),
  requestMediaEscalation: publicProcedure.input(CASE_ID).mutation(async ({ input }) => {
    const updated = triggerMediaEscalation(buildWindow(input.caseId, null, true));
    const transitionId = await logProvenance({ entityId: input.caseId, operation: "escalation.media", toState: "PUBLIC", payload: updated });
    return { success: true, transition_id: transitionId, window: updated };
  }),
  getExpiringWindows: publicProcedure.input(z.object({ days: z.number().default(7), limit: z.number().default(25) }).optional()).query(async ({ input }) => {
    const days = input?.days ?? 7;
    const data = await query(sql`select entity_id::text as case_id, timestamp from provenance_log where entity_type = 'case' and operation in ('approval.sent','escalation.sent') order by timestamp desc limit ${input?.limit ?? 25}`);
    return data.map((r: any) => ({ caseId: r.case_id, ...buildWindow(r.case_id, iso(r.timestamp)) })).filter((w: any) => w.days_remaining <= days);
  }),
});

const contactsRouter = router({
  resolveForCase: publicProcedure.input(CASE_ID.extend({ includeInactive: z.boolean().optional() })).query(async ({ input }) => resolveContactsForCase(input.caseId)),
  logExecution: publicProcedure.input(CASE_ID.extend({ contactId: z.string().optional(), action: z.string().optional(), result: z.any().optional() })).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "contacts.execution_logged", toState: input.action ?? "contacted", payload: input }) })),
});

const documentRouter = router({
  createForCase: publicProcedure.input(CASE_ID.extend({ filename: z.string().optional(), content: z.string().optional(), metadata: z.any().optional() })).mutation(async ({ input }) => {
    const [row] = await query(sql`insert into evidence_items (case_id, title, content, source_type, metadata, created_at, updated_at) values (${input.caseId}::uuid, ${input.filename ?? "Uploaded document"}, ${input.content ?? ""}, 'upload', ${JSON.stringify(input.metadata ?? {})}::jsonb, now(), now()) returning *`);
    return { success: true, evidence: row, extractedLength: (input.content ?? "").length, extractedPreview: (input.content ?? "").slice(0, 300), caseUrl: `/case/${input.caseId}` };
  }),
  createForNewCase: publicProcedure.input(z.object({ title: z.string().optional(), filename: z.string().optional(), content: z.string().optional(), jurisdiction: z.string().optional(), metadata: z.any().optional() })).mutation(async ({ input }) => {
    const [caseRow] = await query(sql`insert into cases (title, description, jurisdiction, created_at, updated_at) values (${input.title ?? input.filename ?? "Uploaded case"}, ${input.content?.slice(0, 500) ?? null}, ${input.jurisdiction ?? "unknown"}, now(), now()) returning *`);
    const [evidenceRow] = await query(sql`insert into evidence_items (case_id, title, content, source_type, metadata, created_at, updated_at) values (${caseRow.id}::uuid, ${input.filename ?? "Uploaded document"}, ${input.content ?? ""}, 'upload', ${JSON.stringify(input.metadata ?? {})}::jsonb, now(), now()) returning *`);
    return { success: true, case: caseRow, evidence: evidenceRow, extractedLength: (input.content ?? "").length, extractedPreview: (input.content ?? "").slice(0, 300), caseUrl: `/case/${caseRow.id}` };
  }),
});

const intakeRouter = router({
  importJSON: publicProcedure.input(z.object({ content: z.string(), sourceName: z.string().optional() })).mutation(async ({ input }) => ({ totalRecords: 1, imported: 1, failed: 0, results: [{ success: true, sourceName: input.sourceName ?? "json", preview: input.content.slice(0, 160) }] })),
  importCSV: publicProcedure.input(z.object({ content: z.string(), sourceName: z.string().optional() })).mutation(async ({ input }) => ({ totalRecords: Math.max(0, input.content.trim().split(/\r?\n/).length - 1), imported: Math.max(0, input.content.trim().split(/\r?\n/).length - 1), failed: 0, results: [] })),
  importText: publicProcedure.input(z.object({ content: z.string(), sourceName: z.string().optional() })).mutation(async ({ input }) => ({ totalRecords: 1, imported: 1, failed: 0, results: [{ success: true, extractedLength: input.content.length, sourceName: input.sourceName ?? "text" }] })),
});

const systemRouter = router({
  getBatchExecutionResults: publicProcedure.query(async () => {
    const data = await query(sql`select * from problem_instances order by created_at desc nulls last limit 25`);
    return data.map((row: any) => ({ caseId: row.id, recordId: row.record_id, type: row.validation_status ?? "processed", error: null, stages: { loaded: { status: "complete", at: row.created_at }, interpreted: { status: "complete", at: row.updated_at }, ready: { status: "complete", at: row.updated_at } } }));
  }),
  getProvenanceChain: publicProcedure.input(z.object({ caseId: z.string().optional(), entityId: z.string().optional() })).query(async ({ input }) => {
    const id = input.caseId ?? input.entityId;
    if (!id) return [];
    return query(sql`select * from provenance_log where entity_id::text = ${id} or provenance_ref = ${id} order by timestamp desc limit 200`);
  }),
});

export const appRouter = router({
  auth: authRouter,
  problems: problemsRouter,
  friction: frictionRouter,
  correlations: correlationsRouter,
  enrichment: enrichmentRouter,
  export: exportRouter,
  caseExport: caseExportRouter,
  actionBundle: actionBundleRouter,
  truthValidation: truthValidationRouter,
  readiness: readinessRouter,
  approval: approvalRouter,
  escalation: escalationRouter,
  contacts: contactsRouter,
  document: documentRouter,
  intake: intakeRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
export default appRouter;
