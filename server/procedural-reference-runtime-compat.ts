import { getPool } from "./db-legacy";

function parse_text_value(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function parse_text_array(value: unknown): string[] {
  const parsed = parse_text_value(value);
  if (Array.isArray(parsed)) return parsed.map(String);
  if (typeof parsed === "string") {
    return parsed.split(/\s*[|,;]\s*/).map(part => part.trim()).filter(Boolean);
  }
  return [];
}

function as_nullable_number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function map_jurisdiction(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    type: String(row.jurisdiction_type ?? ""),
    parentId: as_nullable_number(row.parent_id),
    level: Number(row.level ?? 0),
    abbreviation: row.abbreviation ?? null,
    fipsCode: row.fips_code ?? null,
    preemptionRules: parse_text_value(row.preemption_rules),
    overrideRules: parse_text_value(row.override_rules),
    agencies: parse_text_value(row.agencies),
    keyStatutes: parse_text_value(row.key_statutes),
    filingVenues: parse_text_value(row.filing_venues),
    notes: row.notes ?? null,
    status: String(row.jurisdiction_status ?? "active"),
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export async function list_jurisdictions(input?: { type?: string; status?: string }) {
  const result = await getPool().query(
    `select * from public.jurisdiction_hierarchy
      where ($1::text is null or jurisdiction_type = $1)
        and ($2::text is null or jurisdiction_status = $2)
      order by level, name, id`,
    [input?.type ?? null, input?.status ?? null],
  );
  return result.rows.map(map_jurisdiction);
}

export async function get_jurisdiction(id: number) {
  const result = await getPool().query(
    `select * from public.jurisdiction_hierarchy where id = $1 limit 1`,
    [id],
  );
  return result.rows[0] ? map_jurisdiction(result.rows[0]) : null;
}

export async function get_jurisdiction_chain(id: number) {
  const chain: ReturnType<typeof map_jurisdiction>[] = [];
  const visited = new Set<number>();
  let current: number | null = id;
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const row = await get_jurisdiction(current);
    if (!row) break;
    chain.unshift(row);
    current = row.parentId;
  }
  return chain;
}

export async function resolve_jurisdiction(name: string) {
  const result = await getPool().query(
    `select * from public.jurisdiction_hierarchy
      where name ilike $1
      order by level, name, id`,
    [`%${name}%`],
  );
  return result.rows.map(map_jurisdiction);
}

export function map_node_timeline(row: any) {
  return {
    id: Number(row.id),
    nodeId: String(row.node_id ?? ""),
    nodeType: String(row.node_timeline_type ?? ""),
    title: String(row.title ?? ""),
    effectiveDate: as_nullable_number(row.effective_date),
    amendedDate: row.amended_date ?? null,
    repealedDate: row.repealed_date ?? null,
    supersededBy: row.superseded_by ?? null,
    precedentStrength: row.precedent_strength ?? null,
    jurisdictionScope: row.jurisdiction_scope ?? null,
    citation: row.citation ?? null,
    domain: row.domain ?? null,
    notes: row.notes ?? null,
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export async function list_node_timeline(input?: { nodeType?: string; domain?: string }) {
  const result = await getPool().query(
    `select * from public.node_timeline
      where ($1::text is null or node_timeline_type = $1)
        and ($2::text is null or domain = $2)
      order by effective_date desc nulls last, id`,
    [input?.nodeType ?? null, input?.domain ?? null],
  );
  return result.rows.map(map_node_timeline);
}

export async function get_node_timeline(node_id: string, as_of?: number) {
  const result = await getPool().query(
    `select * from public.node_timeline
      where node_id = $1
        and ($2::bigint is null or effective_date <= $2)
      order by effective_date desc nulls last, id desc`,
    [node_id, as_of ?? null],
  );
  return result.rows.map(map_node_timeline);
}

export function map_workflow(row: any) {
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    domain: String(row.domain ?? ""),
    issueTypes: parse_text_array(row.issue_types),
    jurisdiction: String(row.jurisdiction ?? ""),
    triggerConditions: parse_text_value(row.trigger_conditions),
    primaryAgency: row.primary_agency ?? null,
    entryForms: parse_text_value(row.entry_forms),
    initialDeadlineRule: row.initial_deadline_rule ?? null,
    evidenceProfileId: row.evidence_profile_id == null
      ? null
      : String(row.evidence_profile_id),
    appealChain: parse_text_value(row.appeal_chain),
    weakJointIds: parse_text_value(row.weak_joint_ids),
    estimatedDuration: row.estimated_duration ?? null,
    successRate: row.success_rate ?? null,
    remedies: parse_text_value(row.remedies),
    status: String(row.workflow_status ?? "draft"),
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export function map_workflow_step(row: any) {
  return {
    id: Number(row.id),
    workflowId: Number(row.workflow_id),
    stepNumber: as_nullable_number(row.step_number),
    order: Number(row.step_order ?? row.step_number ?? 0),
    type: String(row.step_type ?? row.action_type ?? "step"),
    stepType: String(row.step_type ?? row.action_type ?? "step"),
    title: String(row.title ?? row.action_description ?? "Untitled step"),
    description: row.description ?? row.action_description ?? null,
    actionType: row.action_type ?? null,
    actionDescription: row.action_description ?? null,
    deadlineDays: as_nullable_number(row.deadline_days),
    requiredInputs: parse_text_value(row.required_inputs),
    decisionLogic: parse_text_value(row.decision_logic),
    nextStepOnSuccess: row.next_step_on_success ?? null,
    nextStepOnFailure: row.next_step_on_failure ?? null,
    estimatedDays: as_nullable_number(row.estimated_days),
    deadline: row.deadline_rule ?? null,
    warnings: parse_text_value(row.warnings),
    metadata: row.metadata ?? {},
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export async function list_workflows(input?: { domain?: string; status?: string }) {
  const result = await getPool().query(
    `select * from public.workflow_master
      where ($1::text is null or domain = $1)
        and ($2::text is null or workflow_status = $2)
      order by title, id`,
    [input?.domain ?? null, input?.status ?? null],
  );
  return result.rows.map(map_workflow);
}

export async function list_workflow_steps(workflow_id: number) {
  const result = await getPool().query(
    `select * from public.workflow_steps
      where workflow_id = $1
      order by coalesce(step_order, step_number, 0), id`,
    [workflow_id],
  );
  return result.rows.map(map_workflow_step);
}

function map_evidence_profile(row: any) {
  return {
    id: Number(row.id),
    issueType: row.issue_type ?? null,
    domain: row.domain ?? null,
    requiredMinimum: parse_text_value(row.required_minimum),
    recommended: parse_text_value(row.recommended),
    highValue: parse_text_value(row.high_value),
    commonFailureModes: parse_text_value(row.common_failure_modes),
    preservationNotes: row.preservation_notes ?? null,
    spoliationRisks: parse_text_value(row.spoliation_risks),
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export async function list_evidence_profiles(id?: number | string) {
  const result = await getPool().query(
    `select * from public.evidence_profiles
      where ($1::text is null or id::text = $1)
      order by domain, issue_type, id`,
    [id == null ? null : String(id)],
  );
  return result.rows.map(map_evidence_profile);
}

function map_escalation_route(row: any) {
  return {
    id: Number(row.id),
    workflowId: Number(row.workflow_id),
    title: row.title ?? null,
    triggerConditions: parse_text_value(row.trigger_conditions),
    routes: parse_text_value(row.routes),
    escalationPriority: row.escalation_priority ?? null,
    preservationRequirements: parse_text_value(row.preservation_requirements),
    notes: row.notes ?? null,
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export async function list_escalation_routes(workflow_id: number) {
  const result = await getPool().query(
    `select * from public.escalation_routes where workflow_id = $1 order by id`,
    [workflow_id],
  );
  return result.rows.map(map_escalation_route);
}

export async function get_workflow(id: number) {
  const result = await getPool().query(
    `select * from public.workflow_master where id = $1 limit 1`,
    [id],
  );
  if (!result.rows[0]) return null;
  const workflow = map_workflow(result.rows[0]);
  const [steps, escalations, profile_rows] = await Promise.all([
    list_workflow_steps(id),
    list_escalation_routes(id),
    workflow.evidenceProfileId ? list_evidence_profiles(workflow.evidenceProfileId) : Promise.resolve([]),
  ]);
  const evidenceProfile = profile_rows[0] ?? null;
  return { ...workflow, steps, escalations, evidenceProfile, evidence_profile: evidenceProfile };
}

export function map_deadline_rule(row: any) {
  return {
    id: Number(row.id),
    workflowId: Number(row.workflow_id ?? 0),
    claimType: row.claim_type ?? null,
    jurisdiction: row.jurisdiction ?? null,
    triggerEvent: row.trigger_event ?? null,
    deadlineType: row.deadline_type ?? null,
    timeLimitDays: as_nullable_number(row.time_limit_days),
    extendedLimitDays: row.extended_limit_days ?? null,
    extendedCondition: row.extended_condition ?? null,
    tollingPossible: Boolean(Number(row.tolling_possible ?? 0)),
    tollingConditions: row.tolling_conditions ?? null,
    warningThresholdDays: as_nullable_number(row.warning_threshold_days),
    criticalThresholdDays: as_nullable_number(row.critical_threshold_days),
    authority: row.authority ?? null,
    notes: row.notes ?? null,
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export async function list_deadline_rules(input?: { claimType?: string; jurisdiction?: string }) {
  const result = await getPool().query(
    `select * from public.deadline_rules
      where ($1::text is null or claim_type = $1)
        and ($2::text is null or jurisdiction = $2)
      order by jurisdiction, claim_type, id`,
    [input?.claimType ?? null, input?.jurisdiction ?? null],
  );
  return result.rows.map(map_deadline_rule);
}

function map_weak_joint_trigger(row: any) {
  return {
    id: Number(row.id),
    weakJointId: Number(row.weak_joint_id),
    triggerName: row.trigger_name ?? null,
    triggerCondition: row.trigger_condition ?? null,
    severityWeight: row.severity_weight ?? null,
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export async function list_weak_joint_triggers(weak_joint_id?: number) {
  const result = await getPool().query(
    `select * from public.weak_joint_triggers
      where ($1::integer is null or weak_joint_id = $1)
      order by weak_joint_id, id`,
    [weak_joint_id ?? null],
  );
  return result.rows.map(map_weak_joint_trigger);
}

function map_claim_detection_rule(row: any) {
  return {
    id: Number(row.id),
    pipelineCategory: row.pipeline_category ?? null,
    triggerPhrase: row.trigger_phrase ?? null,
    claimType: row.claim_type ?? null,
    weight: row.weight ?? null,
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
  };
}

export async function list_claim_detection_rules(input?: { pipelineCategory?: string; claimType?: string }) {
  const result = await getPool().query(
    `select * from public.claim_detection_rules
      where ($1::text is null or pipeline_category = $1)
        and ($2::text is null or claim_type = $2)
      order by pipeline_category, claim_type, id`,
    [input?.pipelineCategory ?? null, input?.claimType ?? null],
  );
  return result.rows.map(map_claim_detection_rule);
}

export async function get_procedural_stats() {
  const result = await getPool().query(
    `select
       (select count(*)::int from public.jurisdiction_hierarchy) as jurisdictions,
       (select count(*)::int from public.node_timeline) as node_timelines,
       (select count(*)::int from public.workflow_master) as workflows,
       (select count(*)::int from public.workflow_steps) as workflow_steps,
       (select count(*)::int from public.evidence_profiles) as evidence_profiles,
       (select count(*)::int from public.escalation_routes) as escalation_routes,
       (select count(*)::int from public.deadline_rules) as deadline_rules,
       (select count(*)::int from public.weak_joint_triggers) as weak_joint_triggers,
       (select count(*)::int from public.claim_detection_rules) as claim_detection_rules`,
  );
  const row = result.rows[0] ?? {};
  return {
    jurisdictions: Number(row.jurisdictions ?? 0),
    nodeTimelines: Number(row.node_timelines ?? 0),
    timelineEvents: 0,
    timelineEdges: 0,
    workflows: Number(row.workflows ?? 0),
    workflowSteps: Number(row.workflow_steps ?? 0),
    evidenceProfiles: Number(row.evidence_profiles ?? 0),
    escalationRoutes: Number(row.escalation_routes ?? 0),
    deadlineRules: Number(row.deadline_rules ?? 0),
    weakJointTriggers: Number(row.weak_joint_triggers ?? 0),
    claimDetectionRules: Number(row.claim_detection_rules ?? 0),
    availability: {
      timelineEvents: "table_unavailable" as const,
      timelineEdges: "table_unavailable" as const,
    },
  };
}
