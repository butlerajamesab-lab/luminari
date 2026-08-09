import { getPool } from "./db";

export type InvestigationWorkflowInput = {
  domain: string;
  claimType?: string;
  agencyShort?: string;
  incidentDate?: string;
  hasDocuments: boolean;
  hasWitnesses: boolean;
};

type SourceWorkflowRow = {
  id: number;
  title: string | null;
  domain: string | null;
  issue_types: unknown;
  primary_agency: string | null;
  workflow_status: string | null;
};

type SourceStepRow = {
  id: number;
  workflow_id: number;
  step_number: number | null;
  step_order: number | null;
  action_type: string | null;
  action_description: string | null;
  deadline_days: number | null;
  title: string | null;
  description: string | null;
  required_inputs: unknown;
  estimated_days: number | null;
  deadline_rule: string | null;
  warnings: unknown;
  step_type: string | null;
};

type SourceClaimElementRow = {
  id: number;
  claim_type: string | null;
  element_name: string | null;
  element_description: string | null;
  element_order: number | null;
  evidence_types: unknown;
};

type SourceSignalRow = {
  id: number;
  signal_type: string | null;
  severity: string | null;
  trigger_patterns: unknown;
  recommended_next_steps: unknown;
};

type SourceBarrierRow = {
  id: number;
  name: string | null;
  domains: unknown;
  severity: string | null;
  possible_workarounds: unknown;
};

type SourceWeakJointRow = {
  id: string;
  weak_joint_id: string | null;
  title: string | null;
  description: string | null;
  severity_level: string | null;
  severity_rationale: string | null;
  metadata: unknown;
};

type SourceAgencyFormRow = {
  id: number;
  agency: string | null;
  agency_short: string | null;
  form_name: string | null;
  filing_deadline: string | null;
  link: string | null;
};

export type InvestigationWorkflowSourceRows = {
  workflows: SourceWorkflowRow[];
  steps: SourceStepRow[];
  claimElements: SourceClaimElementRow[];
  signals: SourceSignalRow[];
  contradictionTemplateCount: number;
  proofFrameworkCount: number;
  barriers: SourceBarrierRow[];
  weakJoints: SourceWeakJointRow[];
  agencyForms: SourceAgencyFormRow[];
};

function sourceText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function parse_source_text_list(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(sourceText).filter((item): item is string => item !== null);
  }
  const text = sourceText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(sourceText).filter((item): item is string => item !== null);
    }
  } catch {
    // Live compatibility tables store both JSON-encoded lists and plain text.
  }
  return [text];
}

export function parse_source_row_array<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const text = sourceText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  const text = sourceText(value);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function domainMatches(value: unknown, domain: string): boolean {
  const expected = normalizedKey(domain);
  return parse_source_text_list(value).some(item => normalizedKey(item) === expected);
}

function emptyWorkflow() {
  return {
    immediateActions: [] as Array<{
      priority: number;
      action: string;
      reason: string | null;
      deadlineText: string | null;
      deadlineState: "source_text_only" | "unavailable";
    }>,
    recordsToRequest: [] as Array<{
      source: string;
      recordType: string;
      reason: string | null;
      method: null;
    }>,
    witnessTargets: [] as Array<never>,
    timelineTasks: [] as Array<{
      phase: string;
      task: string;
      description: string | null;
      durationText: string | null;
      deadlineText: string | null;
    }>,
    agencySteps: [] as Array<{
      agency: string | null;
      step: string;
      description: string | null;
      deadlineText: string | null;
      deadlineState: "source_text_only" | "unavailable";
    }>,
    riskFlags: [] as Array<{
      type: "Workflow warning" | "Litigation barrier" | "Weak joint";
      flag: string;
      severity: string | null;
      mitigation: string | null;
    }>,
    signalWatchList: [] as Array<{
      signalType: string;
      severity: string;
      triggerPatterns: string[];
      nextSteps: string[];
    }>,
  };
}

function unavailableResult(
  input: InvestigationWorkflowInput,
  workflows: SourceWorkflowRow[],
  reason: string,
) {
  return {
    domain: input.domain,
    claimType: input.claimType ?? null,
    agencyShort: input.agencyShort ?? null,
    context: {
      incidentDate: input.incidentDate ?? null,
      hasDocuments: input.hasDocuments,
      hasWitnesses: input.hasWitnesses,
    },
    availability: {
      status: "unavailable" as const,
      reason,
      source: "workflow_master/workflow_steps" as const,
    },
    selectedWorkflow: null,
    availableWorkflows: workflows.map(row => ({
      id: Number(row.id),
      title: sourceText(row.title) ?? `Workflow ${row.id}`,
      issueTypes: parse_source_text_list(row.issue_types),
    })),
    workflow: emptyWorkflow(),
    deadlineSources: [] as Array<never>,
    sectionAvailability: {
      witnessTargets: {
        status: "unavailable" as const,
        reason: "The live workflow schema does not define witness targets.",
      },
      deadlineCalculations: {
        status: "unavailable" as const,
        reason: "The live sources contain deadline text, not an authority-bound calculation rule.",
      },
    },
    metadata: {
      weakJointsConsidered: 0,
      signalsConsidered: 0,
      contradictionTemplatesConsidered: 0,
      proofFrameworksConsidered: 0,
      barriersConsidered: 0,
      claimElementsConsidered: 0,
    },
  };
}

export function build_investigation_workflow_dto(
  input: InvestigationWorkflowInput,
  source: InvestigationWorkflowSourceRows,
) {
  const claimKey = input.claimType ? normalizedKey(input.claimType) : null;
  const candidates = claimKey
    ? source.workflows.filter(row =>
        parse_source_text_list(row.issue_types).some(issue => normalizedKey(issue) === claimKey),
      )
    : source.workflows;

  if (candidates.length === 0) {
    const reason = claimKey
      ? "No active source workflow matches the selected domain and claim type."
      : "No active source workflow matches the selected domain.";
    return unavailableResult(input, source.workflows, reason);
  }
  if (candidates.length > 1) {
    return unavailableResult(
      input,
      candidates,
      "Multiple active source workflows match this domain; select a matching claim type.",
    );
  }

  const selected = candidates[0];
  const orderedSteps = source.steps
    .filter(row => Number(row.workflow_id) === Number(selected.id))
    .sort((left, right) =>
      Number(left.step_order ?? left.step_number ?? left.id)
      - Number(right.step_order ?? right.step_number ?? right.id),
    );
  const matchingClaimElements = source.claimElements.filter(row =>
    !claimKey || (row.claim_type != null && normalizedKey(row.claim_type) === claimKey),
  );
  const matchingBarriers = source.barriers.filter(row => domainMatches(row.domains, input.domain));
  const matchingWeakJoints = source.weakJoints.filter(row => {
    const metadata = metadataRecord(row.metadata);
    return domainMatches(metadata.domains, input.domain);
  });

  const immediateActions = orderedSteps
    .filter(row => (row.step_type ?? row.action_type) === "eligibility_check")
    .map((row, index) => {
      const deadlineText = sourceText(row.deadline_rule);
      return {
        priority: index + 1,
        action: sourceText(row.title) ?? sourceText(row.action_description) ?? `Step ${row.id}`,
        reason: sourceText(row.description),
        deadlineText,
        deadlineState: deadlineText ? "source_text_only" as const : "unavailable" as const,
      };
    });

  const recordsToRequest = [
    ...orderedSteps.flatMap(row =>
      parse_source_text_list(row.required_inputs).map(recordType => ({
        source: sourceText(selected.title) ?? "Workflow source",
        recordType,
        reason: sourceText(row.description),
        method: null,
      })),
    ),
    ...matchingClaimElements.flatMap(row =>
      parse_source_text_list(row.evidence_types).map(recordType => ({
        source: sourceText(row.element_name) ?? "Claim element source",
        recordType,
        reason: sourceText(row.element_description),
        method: null,
      })),
    ),
  ];

  const timelineTasks = orderedSteps.map(row => ({
    phase: `Step ${row.step_order ?? row.step_number ?? row.id}`,
    task: sourceText(row.title) ?? sourceText(row.action_description) ?? `Step ${row.id}`,
    description: sourceText(row.description),
    durationText: row.estimated_days == null ? null : `Source estimate: ${row.estimated_days} days`,
    deadlineText: sourceText(row.deadline_rule),
  }));

  const agencySteps = orderedSteps
    .filter(row => ["filing", "agency_review", "response_deadline"].includes(row.step_type ?? row.action_type ?? ""))
    .map(row => {
      const deadlineText = sourceText(row.deadline_rule);
      return {
        agency: sourceText(selected.primary_agency),
        step: sourceText(row.title) ?? sourceText(row.action_description) ?? `Step ${row.id}`,
        description: sourceText(row.description),
        deadlineText,
        deadlineState: deadlineText ? "source_text_only" as const : "unavailable" as const,
      };
    });

  const riskFlags = [
    ...orderedSteps.flatMap(row =>
      parse_source_text_list(row.warnings).map(flag => ({
        type: "Workflow warning" as const,
        flag,
        severity: null,
        mitigation: null,
      })),
    ),
    ...matchingBarriers.map(row => ({
      type: "Litigation barrier" as const,
      flag: sourceText(row.name) ?? `Barrier ${row.id}`,
      severity: sourceText(row.severity),
      mitigation: parse_source_text_list(row.possible_workarounds).join("; ") || null,
    })),
    ...matchingWeakJoints.map(row => ({
      type: "Weak joint" as const,
      flag: sourceText(row.title) ?? sourceText(row.description) ?? row.weak_joint_id ?? `Weak joint ${row.id}`,
      severity: sourceText(row.severity_level),
      mitigation: sourceText(row.severity_rationale),
    })),
  ];

  const signalWatchList = source.signals.map(row => ({
    signalType: sourceText(row.signal_type) ?? `Signal ${row.id}`,
    severity: sourceText(row.severity) ?? "unavailable",
    triggerPatterns: parse_source_text_list(row.trigger_patterns),
    nextSteps: parse_source_text_list(row.recommended_next_steps),
  }));

  const deadlineSources = source.agencyForms
    .filter(row => sourceText(row.filing_deadline) !== null)
    .map(row => ({
      formId: Number(row.id),
      agency: sourceText(row.agency),
      agencyShort: sourceText(row.agency_short),
      formName: sourceText(row.form_name) ?? `Form ${row.id}`,
      filingDeadlineText: sourceText(row.filing_deadline)!,
      calculationState: "source_text_only" as const,
      calculatedDeadlineDate: null,
      sourceUrl: sourceText(row.link),
    }));

  return {
    domain: input.domain,
    claimType: input.claimType ?? null,
    agencyShort: input.agencyShort ?? null,
    context: {
      incidentDate: input.incidentDate ?? null,
      hasDocuments: input.hasDocuments,
      hasWitnesses: input.hasWitnesses,
    },
    availability: {
      status: "available" as const,
      reason: null,
      source: "workflow_master/workflow_steps" as const,
    },
    selectedWorkflow: {
      id: Number(selected.id),
      title: sourceText(selected.title) ?? `Workflow ${selected.id}`,
      primaryAgency: sourceText(selected.primary_agency),
      issueTypes: parse_source_text_list(selected.issue_types),
    },
    availableWorkflows: candidates.map(row => ({
      id: Number(row.id),
      title: sourceText(row.title) ?? `Workflow ${row.id}`,
      issueTypes: parse_source_text_list(row.issue_types),
    })),
    workflow: {
      ...emptyWorkflow(),
      immediateActions,
      recordsToRequest,
      timelineTasks,
      agencySteps,
      riskFlags,
      signalWatchList,
    },
    deadlineSources,
    sectionAvailability: {
      witnessTargets: {
        status: "unavailable" as const,
        reason: "The live workflow schema does not define witness targets.",
      },
      deadlineCalculations: {
        status: "unavailable" as const,
        reason: deadlineSources.length > 0
          ? "Deadline source text is available, but no authority-bound calculation rule is stored."
          : "No source-bound deadline record matches the selected agency.",
      },
    },
    metadata: {
      weakJointsConsidered: matchingWeakJoints.length,
      signalsConsidered: source.signals.length,
      contradictionTemplatesConsidered: source.contradictionTemplateCount,
      proofFrameworksConsidered: source.proofFrameworkCount,
      barriersConsidered: matchingBarriers.length,
      claimElementsConsidered: matchingClaimElements.length,
    },
  };
}

export async function read_investigation_workflow(input: InvestigationWorkflowInput) {
  const snapshotResult = await getPool().query<{
    workflows: unknown;
    steps: unknown;
    claim_elements: unknown;
    signals: unknown;
    contradiction_template_count: number;
    proof_framework_count: number;
    barriers: unknown;
    weak_joints: unknown;
    agency_forms: unknown;
  }>(
    `with active_workflows as (
       select id, title, domain, issue_types, primary_agency, workflow_status
         from public.workflow_master
        where domain = $1
          and workflow_status = 'active'
     )
     select
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', workflow.id,
             'title', workflow.title,
             'domain', workflow.domain,
             'issue_types', workflow.issue_types,
             'primary_agency', workflow.primary_agency,
             'workflow_status', workflow.workflow_status
           )
           order by workflow.id
         )
           from active_workflows workflow
       ), '[]'::jsonb) as workflows,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', step.id,
             'workflow_id', step.workflow_id,
             'step_number', step.step_number,
             'step_order', step.step_order,
             'action_type', step.action_type,
             'action_description', step.action_description,
             'deadline_days', step.deadline_days,
             'title', step.title,
             'description', step.description,
             'required_inputs', step.required_inputs,
             'estimated_days', step.estimated_days,
             'deadline_rule', step.deadline_rule,
             'warnings', step.warnings,
             'step_type', step.step_type
           )
           order by coalesce(step.step_order, step.step_number), step.id
         )
           from public.workflow_steps step
           join active_workflows workflow on workflow.id = step.workflow_id
       ), '[]'::jsonb) as steps,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', element.id,
             'claim_type', element.claim_type,
             'element_name', element.element_name,
             'element_description', element.element_description,
             'element_order', element.element_order,
             'evidence_types', element.evidence_types
           )
           order by element.element_order, element.id
         )
           from public.claim_element_matrix element
          where element.domain = $1
       ), '[]'::jsonb) as claim_elements,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', signal.id,
             'signal_type', signal.signal_type,
             'severity', signal.severity,
             'trigger_patterns', signal.trigger_patterns,
             'recommended_next_steps', signal.recommended_next_steps
           )
           order by signal.id
         )
           from public.signal_registry signal
          where signal.domain = $1
       ), '[]'::jsonb) as signals,
       (
         select count(*)::int
           from public.contradiction_templates template
          where template.domain = $1
       ) as contradiction_template_count,
       (
         select count(*)::int
           from public.proof_frameworks framework
          where framework.domain = $1
       ) as proof_framework_count,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', barrier.id,
             'name', barrier.name,
             'domains', barrier.domains,
             'severity', barrier.severity,
             'possible_workarounds', barrier.possible_workarounds
           )
           order by barrier.id
         )
           from public.litigation_barriers barrier
       ), '[]'::jsonb) as barriers,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', weak_joint.id,
             'weak_joint_id', weak_joint.weak_joint_id,
             'title', weak_joint.title,
             'description', weak_joint.description,
             'severity_level', weak_joint.severity_level,
             'severity_rationale', weak_joint.severity_rationale,
             'metadata', weak_joint.metadata
           )
           order by weak_joint.created_at, weak_joint.id
         )
           from public.legal_weak_joints weak_joint
       ), '[]'::jsonb) as weak_joints,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', form.id,
             'agency', form.agency,
             'agency_short', form.agency_short,
             'form_name', form.form_name,
             'filing_deadline', form.filing_deadline,
             'link', form.link
           )
           order by form.agency, form.form_name, form.id
         )
           from public.agency_forms form
          where $2::text is not null
            and form.agency_short = $2
            and nullif(btrim(form.filing_deadline), '') is not null
       ), '[]'::jsonb) as agency_forms`,
    [input.domain, input.agencyShort ?? null],
  );

  const snapshot = snapshotResult.rows[0];
  if (!snapshot) {
    return build_investigation_workflow_dto(input, {
      workflows: [],
      steps: [],
      claimElements: [],
      signals: [],
      contradictionTemplateCount: 0,
      proofFrameworkCount: 0,
      barriers: [],
      weakJoints: [],
      agencyForms: [],
    });
  }

  return build_investigation_workflow_dto(input, {
    workflows: parse_source_row_array<SourceWorkflowRow>(snapshot.workflows),
    steps: parse_source_row_array<SourceStepRow>(snapshot.steps),
    claimElements: parse_source_row_array<SourceClaimElementRow>(snapshot.claim_elements),
    signals: parse_source_row_array<SourceSignalRow>(snapshot.signals),
    contradictionTemplateCount: Number(snapshot.contradiction_template_count ?? 0),
    proofFrameworkCount: Number(snapshot.proof_framework_count ?? 0),
    barriers: parse_source_row_array<SourceBarrierRow>(snapshot.barriers),
    weakJoints: parse_source_row_array<SourceWeakJointRow>(snapshot.weak_joints),
    agencyForms: parse_source_row_array<SourceAgencyFormRow>(snapshot.agency_forms),
  });
}
