import { query_with_diagnostics } from "./db";

type architecture_list_options = {
  agencyShort?: string;
  pipelineCategory?: string;
};

type investigation_guidance_row = {
  id: number;
  agency: string | null;
  agency_short: string | null;
  claim_type: string | null;
  pipeline_category: string | null;
  investigation_focus: string | null;
  typical_questions: string | null;
  critical_evidence: string | null;
  secondary_evidence: string | null;
  common_mistakes: string | null;
  recommended_preparation: string | null;
  investigation_stages: string | null;
  notes: string | null;
  created_at: number | string | null;
  updated_at: number | string | null;
};

type filing_generator_row = {
  id: number;
  claim_type: string | null;
  jurisdiction: string | null;
  pipeline_category: string | null;
  agency: string | null;
  agency_short: string | null;
  form_name: string | null;
  form_number: string | null;
  filing_link: string | null;
  filing_deadline: string | null;
  required_fields: string | null;
  required_evidence: string | null;
  recommended_attachments: string | null;
  submission_methods: string | null;
  expected_timeline: string | null;
  intake_warnings: string | null;
  priority_flags: string | null;
  next_steps: string | null;
  notes: string | null;
  created_at: number | string | null;
  updated_at: number | string | null;
};

function parse_text_list(value: string | null): string[] {
  if (!value || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (parsed === null) return [];
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item !== null).map(String);
    }
    return [String(parsed)];
  } catch {
    return [value.trim()];
  }
}

function integer_wire_value(value: number | string | null): number | string | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  if (!/^\d+$/.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

function map_investigation_guidance(row: investigation_guidance_row) {
  return {
    id: Number(row.id),
    agency: row.agency,
    agencyShort: row.agency_short,
    claimType: row.claim_type,
    pipelineCategory: row.pipeline_category,
    investigationFocus: row.investigation_focus,
    typicalQuestions: parse_text_list(row.typical_questions),
    criticalEvidence: parse_text_list(row.critical_evidence),
    secondaryEvidence: parse_text_list(row.secondary_evidence),
    commonMistakes: parse_text_list(row.common_mistakes),
    recommendedPreparation: parse_text_list(row.recommended_preparation),
    investigationStages: parse_text_list(row.investigation_stages),
    notes: row.notes,
    createdAt: integer_wire_value(row.created_at),
    updatedAt: integer_wire_value(row.updated_at),
    projectionState: "live_investigation_guidance" as const,
  };
}

function map_filing_template(row: filing_generator_row) {
  return {
    id: Number(row.id),
    claimType: row.claim_type,
    jurisdiction: row.jurisdiction,
    pipelineCategory: row.pipeline_category,
    agency: row.agency,
    agencyShort: row.agency_short,
    formName: row.form_name,
    formNumber: row.form_number,
    filingLink: row.filing_link,
    filingDeadline: row.filing_deadline,
    requiredFields: parse_text_list(row.required_fields),
    requiredEvidence: parse_text_list(row.required_evidence),
    recommendedAttachments: parse_text_list(row.recommended_attachments),
    submissionMethods: parse_text_list(row.submission_methods),
    expectedTimeline: row.expected_timeline,
    intakeWarnings: parse_text_list(row.intake_warnings),
    priorityFlags: parse_text_list(row.priority_flags),
    nextSteps: parse_text_list(row.next_steps),
    notes: row.notes,
    createdAt: integer_wire_value(row.created_at),
    updatedAt: integer_wire_value(row.updated_at),
    projectionState: "live_filing_generator" as const,
  };
}

const INVESTIGATION_GUIDANCE_PROJECTION = `
  select id, agency, agency_short, claim_type, pipeline_category,
         investigation_focus, typical_questions, critical_evidence,
         secondary_evidence, common_mistakes, recommended_preparation,
         investigation_stages, notes, created_at, updated_at
    from public.investigation_guidance
`;

const FILING_GENERATOR_PROJECTION = `
  select id, claim_type, jurisdiction, pipeline_category, agency,
         agency_short, form_name, form_number, filing_link, filing_deadline,
         required_fields, required_evidence, recommended_attachments,
         submission_methods, expected_timeline, intake_warnings,
         priority_flags, next_steps, notes, created_at, updated_at
    from public.filing_generator
`;

export async function list_live_investigation_guidance(
  options: architecture_list_options = {},
) {
  const { rows } = await query_with_diagnostics<investigation_guidance_row>(
    `${INVESTIGATION_GUIDANCE_PROJECTION}
     where ($1::text is null or agency_short = $1)
       and ($2::text is null or pipeline_category = $2)
     order by agency, claim_type, id`,
    [options.agencyShort ?? null, options.pipelineCategory ?? null],
    { label: "architecture_live_investigation_guidance" },
  );
  return rows.map(map_investigation_guidance);
}

export async function get_live_investigation_guidance(id: number) {
  const { rows } = await query_with_diagnostics<investigation_guidance_row>(
    `${INVESTIGATION_GUIDANCE_PROJECTION} where id = $1 limit 1`,
    [id],
    { label: "architecture_live_investigation_guidance_by_id" },
  );
  return rows[0] ? map_investigation_guidance(rows[0]) : null;
}

export async function list_live_filing_templates(
  options: architecture_list_options = {},
) {
  const { rows } = await query_with_diagnostics<filing_generator_row>(
    `${FILING_GENERATOR_PROJECTION}
     where ($1::text is null or agency_short = $1)
       and ($2::text is null or pipeline_category = $2)
     order by agency, claim_type, id`,
    [options.agencyShort ?? null, options.pipelineCategory ?? null],
    { label: "architecture_live_filing_templates" },
  );
  return rows.map(map_filing_template);
}

export async function get_live_filing_template(id: number) {
  const { rows } = await query_with_diagnostics<filing_generator_row>(
    `${FILING_GENERATOR_PROJECTION} where id = $1 limit 1`,
    [id],
    { label: "architecture_live_filing_template_by_id" },
  );
  return rows[0] ? map_filing_template(rows[0]) : null;
}

export async function find_live_filing_template(
  claim_type: string,
  agency_short: string,
) {
  const { rows } = await query_with_diagnostics<filing_generator_row>(
    `${FILING_GENERATOR_PROJECTION}
     where agency_short = $1
       and lower(btrim(claim_type)) = lower(btrim($2))
     order by claim_type, id
     limit 1`,
    [agency_short, claim_type],
    { label: "architecture_live_filing_readiness" },
  );
  return rows[0] ? map_filing_template(rows[0]) : null;
}
