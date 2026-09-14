import { query_with_diagnostics } from "./db-legacy";
import type { deadline_reference } from "./resolution-deadline-contract";

// These columns were checked against the live catalog. Legacy Drizzle
// declarations use different physical names and cannot serve this read path.
export const resolution_reference_queries = {
  deadlines: `select id, claim_type, jurisdiction, deadline_type,
    time_limit_days as source_duration_days, trigger_event, authority,
    extended_limit_days as extended_duration_days, extended_condition,
    tolling_conditions, notes from public.deadline_rules order by id`,
  workflows: `select id, title, domain, jurisdiction, primary_agency,
    entry_forms, estimated_duration, remedies from public.workflow_master order by id`,
  agencies: `select id, agency, agency_short, domain, statute, complaint_pathway,
    complaint_types, statutory_authority, response_timeline_days from public.agency_authority_map order by id`,
  courts: `select id, court_id, court_name, court_type, jurisdiction, filing_portal,
    clerk_phone, address, filing_fee, pro_se_resources from public.court_directory order by id`,
  escalations: `select id, workflow_id, title, trigger_conditions, routes,
    escalation_priority from public.escalation_routes order by id`,
} as const;

type workflow_reference = {
  id: number; title: string; domain: string | null; jurisdiction: string | null;
  primary_agency: string | null; entry_forms: unknown; estimated_duration: string | null; remedies: unknown;
};
type agency_reference = {
  id: number; agency: string; agency_short: string | null; domain: string | null;
  statute: string | null; complaint_pathway: string | null; complaint_types: unknown;
  statutory_authority: unknown; response_timeline_days: number | null;
};
type court_reference = {
  id: number; court_id: string; court_name: string; court_type: string | null;
  jurisdiction: string | null; filing_portal: string | null; clerk_phone: string | null;
  address: string | null; filing_fee: unknown; pro_se_resources: unknown;
};
type escalation_reference = {
  id: number; workflow_id: number | null; title: string; trigger_conditions: unknown;
  routes: unknown; escalation_priority: string | null;
};

async function read_references<T extends Record<string, unknown>>(key: keyof typeof resolution_reference_queries) {
  const { rows } = await query_with_diagnostics<T>(resolution_reference_queries[key], [], {
    label: `resolution_${key}_references`, pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000,
  });
  return rows;
}

export const read_resolution_deadlines = () => read_references<deadline_reference>("deadlines");
export const read_resolution_workflows = () => read_references<workflow_reference>("workflows");
export const read_resolution_agencies = () => read_references<agency_reference>("agencies");
export const read_resolution_courts = () => read_references<court_reference>("courts");
export const read_resolution_escalations = () => read_references<escalation_reference>("escalations");
