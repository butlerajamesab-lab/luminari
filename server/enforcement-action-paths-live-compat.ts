import { createHash } from "node:crypto";
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

type reviewed_route_row = {
  action_key: string;
  situation_key: string;
  action_kind: string;
  action_label: string;
  when_to_use: string | null;
  jurisdiction: string | null;
  source_jurisdiction: string | null;
  supporting_name: string | null;
  what_the_person_can_do: string | null;
  route_instructions: string | null;
  filing_or_complaint_url: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  statutory_authority: string | null;
  verification_status: string | null;
  direct_source_reference: string | null;
  raw_source_record_id: string | null;
  source_page: number | null;
  source_table_index: number | null;
};

type reviewed_supplement_row = {
  supplement_type: string;
  supplement_key: string;
  title: string;
  jurisdiction_code: string | null;
  source_text: string | null;
  deadline_kind: string | null;
  source_resource_id: string | null;
  authority_citation: string | null;
  authority_title: string | null;
  authority_note: string | null;
  critical_item_number: number | null;
  reason_code: string | null;
};

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

function stable_reviewed_action_id(action_key: string): number {
  const digest = createHash("sha256").update(action_key).digest("hex");
  return -(Number.parseInt(digest.slice(0, 7), 16) + 1);
}

function route_deadline_description(
  source_resource_id: string | null,
  supplements: reviewed_supplement_row[],
): string | null {
  if (!source_resource_id) return null;
  const deadlines = supplements
    .filter(row => row.supplement_type === "deadline" && row.source_resource_id === source_resource_id && row.source_text)
    .sort((a, b) => (a.deadline_kind ?? "").localeCompare(b.deadline_kind ?? "") || a.supplement_key.localeCompare(b.supplement_key));
  if (deadlines.length === 0) return null;
  return deadlines
    .map(row => `${row.deadline_kind ?? "Deadline"}: ${row.source_text}`)
    .join("\n\n");
}

function reviewed_authorities(supplements: reviewed_supplement_row[]) {
  return supplements
    .filter(row => row.supplement_type === "authority" && row.authority_citation && row.authority_title)
    .sort((a, b) => a.supplement_key.localeCompare(b.supplement_key))
    .map(row => ({
      citation: row.authority_citation as string,
      title: row.authority_title as string,
      relevance: row.authority_note ?? "Reviewed source authority for this intake pipeline.",
    }));
}

function reviewed_critical_routing(
  supplements: reviewed_supplement_row[],
  jurisdiction?: string,
): string[] {
  const critical = supplements
    .filter(row => row.supplement_type === "optional_action" && row.source_text)
    .sort((a, b) => (a.critical_item_number ?? Number.MAX_SAFE_INTEGER) - (b.critical_item_number ?? Number.MAX_SAFE_INTEGER) || a.supplement_key.localeCompare(b.supplement_key))
    .map(row => row.source_text as string);

  if (jurisdiction) {
    const jurisdiction_code = jurisdiction.trim().toUpperCase();
    const held = supplements.find(
      row => row.supplement_type === "integrity_flag"
        && row.jurisdiction_code === jurisdiction_code
        && row.reason_code === "source_row_verification_status_unverified",
    );
    if (held) {
      critical.push(
        `${jurisdiction_code} state-specific dossier contact is held pending independent verification; use the verified national/federal route until the state row is promoted.`,
      );
    }
  }

  return critical;
}

async function select_reviewed_dossier_action_paths(
  pipeline_type: string,
  jurisdiction?: string,
): Promise<EnforcementActionPath[]> {
  const pool = getPool();
  const [routes_result, supplements_result] = await Promise.all([
    pool.query<reviewed_route_row>(
      `select
         action_key,
         situation_key,
         action_kind,
         action_label,
         when_to_use,
         jurisdiction,
         source_jurisdiction,
         supporting_name,
         what_the_person_can_do,
         route_instructions,
         filing_or_complaint_url,
         phone,
         email,
         website,
         address,
         statutory_authority,
         verification_status,
         direct_source_reference,
         raw_source_record_id,
         source_page,
         source_table_index
       from public.v_lighthouse_reviewed_action_route_current_v1
       where situation_key = $1
       order by source_page nulls last, source_table_index nulls last, action_key`,
      [pipeline_type],
    ),
    pool.query<reviewed_supplement_row>(
      `select
         s.supplement_type,
         s.supplement_key,
         s.title,
         s.jurisdiction_code,
         s.record_payload ->> 'source_text' as source_text,
         s.record_payload ->> 'deadline_kind' as deadline_kind,
         s.record_payload ->> 'source_resource_id' as source_resource_id,
         coalesce(s.record_payload ->> 'citation', s.record_payload ->> 'Citation') as authority_citation,
         coalesce(s.record_payload ->> 'statute_or_law', s.record_payload ->> 'Statute / Law') as authority_title,
         coalesce(s.record_payload ->> 'key_language_or_note', s.record_payload ->> 'Key Language / Note') as authority_note,
         case
           when coalesce(s.record_payload ->> 'critical_item_number', '') ~ '^[0-9]+$'
             then (s.record_payload ->> 'critical_item_number')::integer
           else null
         end as critical_item_number,
         s.record_payload ->> 'reason_code' as reason_code
       from public.luminari_reviewed_source_overlay_v1 o
       join public.luminari_reviewed_source_supplement_revision_v1 s
         on s.run_id = o.active_run_id
       where (
           o.activation_receipt ->> 'pipeline_key' = $1
           or (o.activation_receipt -> 'pipeline_keys') ? $1
         )
         and (
           s.record_payload ->> 'pipeline_key' = $1
           or (s.record_payload -> 'pipeline_keys') ? $1
           or s.supplement_type = 'optional_action'
         )
         and s.supplement_type in ('deadline', 'authority', 'optional_action', 'integrity_flag')
       order by s.supplement_type, s.supplement_key`,
      [pipeline_type],
    ),
  ]);

  if (routes_result.rows.length === 0) return [];

  const supplements = supplements_result.rows;
  const authorities = reviewed_authorities(supplements);
  const practical_tips = reviewed_critical_routing(supplements, jurisdiction);

  return routes_result.rows.map((row, index) => {
    const route_url = row.filing_or_complaint_url ?? row.website;
    const source_resource_id = row.raw_source_record_id;
    const deadline_description = route_deadline_description(source_resource_id, supplements);
    const submission_methods = route_url
      ? [{
          method: "official_route",
          details: row.route_instructions ?? "Open the reviewed official route for this action.",
          url: route_url,
          preferred: true,
        }]
      : null;

    return {
      id: stable_reviewed_action_id(row.action_key),
      pipelineType: row.situation_key,
      claimLabel: row.action_label,
      jurisdiction: row.source_jurisdiction ?? row.jurisdiction ?? "all",
      priority: index + 1,
      agencyName: row.supporting_name ?? row.action_label,
      agencyAcronym: null,
      agencyDescription: row.what_the_person_can_do ?? row.when_to_use,
      agencyPhone: row.phone,
      agencyWebsite: route_url,
      agencyEmail: row.email,
      agencyAddress: row.address,
      formName: null,
      formNumber: null,
      formUrl: null,
      formDescription: row.route_instructions,
      submissionMethods: submission_methods,
      filingDeadlineDays: null,
      filingDeadlineDescription: deadline_description,
      expectedResponseDays: null,
      expectedResponseDescription: null,
      investigationTimelineDays: null,
      investigationTimelineDescription: null,
      steps: null,
      escalationPaths: null,
      primaryStatuteCitation: row.statutory_authority,
      primaryStatuteTitle: row.statutory_authority ? "Reviewed statutory authority" : null,
      relatedStatutes: authorities.length > 0 ? authorities : null,
      possibleOutcomes: null,
      documentsNeeded: null,
      commonMistakes: null,
      practicalTips: practical_tips.length > 0 ? practical_tips : null,
      isActive: true,
      lastVerifiedAt: null,
      dataSource: "luminari_reviewed_pipeline_dossier_v1",
      createdAt: 0,
      updatedAt: 0,
    } as EnforcementActionPath;
  });
}

export async function getActionPathsByPipeline(pipelineType: string, jurisdiction?: string): Promise<EnforcementActionPath[]> {
  const params: unknown[] = [pipelineType];
  const jurisdictionFilter = jurisdiction
    ? `and jurisdiction in ('federal', $${params.push(jurisdiction)}, 'all')`
    : "";
  const legacy_paths = await selectActionPaths(
    `where pipeline_type = $1 and is_active = 1 ${jurisdictionFilter}`,
    params,
    "priority asc",
  );
  if (legacy_paths.length > 0) return legacy_paths;
  return select_reviewed_dossier_action_paths(pipelineType, jurisdiction);
}

export async function getActionPathsByPipelines(pipelineTypes: string[], jurisdiction?: string): Promise<EnforcementActionPath[]> {
  if (pipelineTypes.length === 0) return [];
  const params: unknown[] = [pipelineTypes];
  const jurisdictionFilter = jurisdiction
    ? `and jurisdiction in ('federal', $${params.push(jurisdiction)}, 'all')`
    : "";
  const legacy_paths = await selectActionPaths(
    `where pipeline_type = any($1::text[]) and is_active = 1 ${jurisdictionFilter}`,
    params,
    "priority asc",
  );
  const covered = new Set(legacy_paths.map(path => path.pipelineType));
  const missing = pipelineTypes.filter(pipeline_type => !covered.has(pipeline_type));
  const reviewed_paths = (await Promise.all(
    missing.map(pipeline_type => select_reviewed_dossier_action_paths(pipeline_type, jurisdiction)),
  )).flat();
  return [...legacy_paths, ...reviewed_paths];
}

export async function getActionPathById(id: number): Promise<EnforcementActionPath | undefined> {
  const rows = await selectActionPaths("where id = $1", [id], "priority asc");
  return rows[0];
}

export async function listAllActionPaths(): Promise<EnforcementActionPath[]> {
  return selectActionPaths("", [], "pipeline_type asc, priority asc");
}
