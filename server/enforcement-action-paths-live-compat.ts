import type { EnforcementActionPath } from "../drizzle/schema";
import { getPool } from "./db-legacy";

const ACTION_PATH_COLUMNS = `
  id,
  pipeline_type as "pipelineType",
  claim_label as "claimLabel",
  jurisdiction,
  priority,
  agency_name as "agencyName",
  agency_acronym as "agencyAcronym",
  agency_description as "agencyDescription",
  agency_phone as "agencyPhone",
  agency_website as "agencyWebsite",
  agency_email as "agencyEmail",
  agency_address as "agencyAddress",
  form_name as "formName",
  form_number as "formNumber",
  form_url as "formUrl",
  form_description as "formDescription",
  submission_methods as "submissionMethods",
  filing_deadline_days as "filingDeadlineDays",
  filing_deadline_description as "filingDeadlineDescription",
  expected_response_days as "expectedResponseDays",
  expected_response_description as "expectedResponseDescription",
  investigation_timeline_days as "investigationTimelineDays",
  investigation_timeline_description as "investigationTimelineDescription",
  steps,
  escalation_paths as "escalationPaths",
  primary_statute_citation as "primaryStatuteCitation",
  primary_statute_title as "primaryStatuteTitle",
  related_statutes as "relatedStatutes",
  possible_outcomes as "possibleOutcomes",
  documents_needed as "documentsNeeded",
  common_mistakes as "commonMistakes",
  practical_tips as "practicalTips",
  is_active as "isActive",
  last_verified_at as "lastVerifiedAt",
  data_source as "dataSource",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

const JSON_ARRAY_FIELDS = [
  "submissionMethods",
  "steps",
  "escalationPaths",
  "relatedStatutes",
  "possibleOutcomes",
  "documentsNeeded",
  "commonMistakes",
  "practicalTips",
] as const;

function parseArray(value: unknown): unknown[] | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeActionPath(row: Record<string, unknown>): EnforcementActionPath {
  const normalized: Record<string, unknown> = { ...row, isActive: Number(row.isActive) === 1 };
  for (const field of JSON_ARRAY_FIELDS) normalized[field] = parseArray(row[field]);
  return normalized as EnforcementActionPath;
}

async function selectActionPaths(where: string, params: unknown[], order: string): Promise<EnforcementActionPath[]> {
  const { rows } = await getPool().query(
    `select ${ACTION_PATH_COLUMNS}
       from public.enforcement_action_paths
      ${where}
      order by ${order}`,
    params,
  );
  return rows.map(normalizeActionPath);
}

export async function getActionPathsByPipeline(pipelineType: string, jurisdiction?: string): Promise<EnforcementActionPath[]> {
  const params: unknown[] = [pipelineType];
  const jurisdictionFilter = jurisdiction
    ? `and jurisdiction in ('federal', $${params.push(jurisdiction)}, 'all')`
    : "";
  return selectActionPaths(
    `where pipeline_type = $1 and is_active = 1 ${jurisdictionFilter}`,
    params,
    "priority asc",
  );
}

export async function getActionPathsByPipelines(pipelineTypes: string[], jurisdiction?: string): Promise<EnforcementActionPath[]> {
  if (pipelineTypes.length === 0) return [];
  const params: unknown[] = [pipelineTypes];
  const jurisdictionFilter = jurisdiction
    ? `and jurisdiction in ('federal', $${params.push(jurisdiction)}, 'all')`
    : "";
  return selectActionPaths(
    `where pipeline_type = any($1::text[]) and is_active = 1 ${jurisdictionFilter}`,
    params,
    "priority asc",
  );
}

export async function getActionPathById(id: number): Promise<EnforcementActionPath | undefined> {
  const rows = await selectActionPaths("where id = $1", [id], "priority asc");
  return rows[0];
}

export async function listAllActionPaths(): Promise<EnforcementActionPath[]> {
  return selectActionPaths("", [], "pipeline_type asc, priority asc");
}
