import { query_with_diagnostics } from "./db";

type registry_list_options = {
  domain?: string;
  jurisdiction?: string;
  search?: string;
  agencyId?: string;
  direction?: "from" | "to";
  limit?: number;
};

type forms_registry_row = {
  id: string;
  form_name: string;
  issuing_agency: string | null;
  jurisdiction: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string | null;
  agency_id: string | null;
};

type agencies_registry_row = {
  id: string;
  agency_name: string | null;
  jurisdiction: string | null;
  domain: string | null;
  agency_type: string | null;
  website: string | null;
  contact_methods: string | null;
  official_status: string | null;
  notes: Date | string | null;
  created_at: number | string | null;
  updated_at: number | string | null;
  metadata: Record<string, unknown> | null;
};

type escalation_registry_row = {
  uuid: string;
  issue_type: string | null;
  initial_route: string | null;
  secondary_route: string | null;
  federal_escalation: string | null;
  civil_escalation: string | null;
  federal_agencies: unknown;
  related_statutes: unknown;
  verification_status: string | null;
  created_at: Date | string | null;
};

function record_or_empty(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text_or_null(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function text_list(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function timestamp_to_iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function integer_wire_value(value: number | string | null): number | string | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  if (!/^\d+$/.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

function normalize_domain(value: unknown): string | null {
  const domain = text_or_null(value);
  if (!domain) return null;
  return domain.replace(/_domain$/i, "").toLowerCase();
}

function map_form(row: forms_registry_row) {
  const metadata = record_or_empty(row.metadata);
  const original_record = record_or_empty(metadata.original_record);
  const filing_instructions = record_or_empty(
    original_record.filing_instructions,
  );
  const form_of_delivery = text_or_null(
    filing_instructions.form_of_delivery,
  ) ?? text_or_null(original_record.filing_method);
  return {
    id: row.id,
    agencyId: row.agency_id,
    formName: row.form_name,
    issuingAgency: row.issuing_agency,
    jurisdiction: row.jurisdiction,
    domain: normalize_domain(metadata.domain),
    isActive: null,
    url:
      text_or_null(metadata.source_url) ??
      text_or_null(filing_instructions.submission_url) ??
      text_or_null(original_record.submission_url),
    filingDeadline:
      text_or_null(filing_instructions.deadline) ??
      text_or_null(original_record.deadline_from_trigger),
    accessMethods: form_of_delivery ? [form_of_delivery] : [],
    metadata,
    createdAt: timestamp_to_iso(row.created_at),
    projectionState: "live_forms_registry" as const,
    activeStateAvailable: false,
  };
}

function contact_methods_from_row(row: agencies_registry_row) {
  let parsed: Record<string, unknown> = {};
  if (row.contact_methods) {
    try {
      parsed = record_or_empty(JSON.parse(row.contact_methods));
    } catch {
      parsed = {};
    }
  }
  return {
    phone: text_or_null(parsed.phone),
    web: text_or_null(parsed.website) ?? row.website,
    email: text_or_null(parsed.email),
    walk_in: text_or_null(parsed.physical_address),
  };
}

function map_agency(row: agencies_registry_row) {
  return {
    id: row.id,
    agencyName: row.agency_name,
    jurisdiction: row.jurisdiction,
    domain: row.domain,
    agencyType: row.agency_type,
    website: row.website,
    contactMethods: contact_methods_from_row(row),
    officialStatus: row.official_status,
    notes: null,
    notesObservedAt: timestamp_to_iso(row.notes),
    createdAt: integer_wire_value(row.created_at),
    updatedAt: integer_wire_value(row.updated_at),
    metadata: record_or_empty(row.metadata),
    projectionState: "live_agencies_registry" as const,
  };
}

function map_escalation(row: escalation_registry_row) {
  const route_parts = [
    row.initial_route,
    row.secondary_route,
    row.federal_escalation,
    row.civil_escalation,
  ].filter((value): value is string => Boolean(value));
  return {
    id: row.uuid,
    uuid: row.uuid,
    issueType: row.issue_type,
    initialRoute: row.initial_route,
    secondaryRoute: row.secondary_route,
    federalEscalation: row.federal_escalation,
    civilEscalation: row.civil_escalation,
    federalAgencies: text_list(row.federal_agencies),
    relatedStatutes: text_list(row.related_statutes),
    verificationStatus: row.verification_status,
    createdAt: timestamp_to_iso(row.created_at),
    escalationName: row.issue_type,
    fromAgencyId: null,
    toAgencyId: null,
    domain: null,
    jurisdiction: null,
    triggerCondition: row.issue_type,
    pathwayDescription:
      route_parts.length > 0 ? route_parts.join(" → ") : null,
    timeline: null,
    simultaneousFiling: null,
    notes: null,
    projectionState: "live_escalation_registry" as const,
    agencyIdentityAvailable: false,
    jurisdictionFilterAvailable: false,
  };
}

const FORM_PROJECTION = `
  select
    f.id::text as id,
    f.form_name,
    f.issuing_agency,
    f.jurisdiction,
    f.metadata,
    f.created_at,
    matched_agency.id as agency_id
  from public.forms_registry f
  left join lateral (
    select min(a.id) as id
      from public.agencies_registry a
     where lower(btrim(a.agency_name)) = lower(btrim(f.issuing_agency))
    having count(*) = 1
  ) matched_agency on true
`;

const AGENCY_PROJECTION = `
  select id, agency_name, jurisdiction, domain, agency_type, website,
         contact_methods, official_status, notes, created_at, updated_at,
         metadata
    from public.agencies_registry
`;

export async function list_live_registry_forms(
  options: registry_list_options = {},
) {
  const { rows } = await query_with_diagnostics<forms_registry_row>(
    `${FORM_PROJECTION}
     where ($1::text is null or
              lower(regexp_replace(coalesce(f.metadata->>'domain', ''), '_domain$', '', 'i')) =
              lower(regexp_replace($1, '_domain$', '', 'i')))
       and ($2::text is null or f.jurisdiction ilike '%' || $2 || '%')
       and ($3::text is null or f.form_name ilike '%' || $3 || '%')
       and ($4::text is null or matched_agency.id = $4)
     order by f.form_name, f.id
     limit $5`,
    [
      options.domain ?? null,
      options.jurisdiction ?? null,
      options.search ?? null,
      options.agencyId ?? null,
      Math.min(Math.max(options.limit ?? 100, 1), 100),
    ],
    { label: "registry_live_forms" },
  );
  return rows.map(map_form);
}

export async function get_live_registry_form(id: string) {
  const { rows } = await query_with_diagnostics<forms_registry_row>(
    `${FORM_PROJECTION} where f.id = $1::uuid limit 1`,
    [id],
    { label: "registry_live_form_by_id" },
  );
  return rows[0] ? map_form(rows[0]) : null;
}

export async function list_live_registry_agencies(
  options: registry_list_options = {},
) {
  const { rows } = await query_with_diagnostics<agencies_registry_row>(
    `${AGENCY_PROJECTION}
     where official_status in ('active', 'verified')
       and ($1::text is null or domain ilike '%' || $1 || '%')
       and ($2::text is null or jurisdiction ilike '%' || $2 || '%')
     order by agency_name, id
     limit $3`,
    [
      options.domain ?? null,
      options.jurisdiction ?? null,
      Math.min(Math.max(options.limit ?? 100, 1), 100),
    ],
    { label: "registry_live_agencies" },
  );
  return rows.map(map_agency);
}

export async function get_live_registry_agency(id: string) {
  const { rows } = await query_with_diagnostics<agencies_registry_row>(
    `${AGENCY_PROJECTION} where id = $1 limit 1`,
    [id],
    { label: "registry_live_agency_by_id" },
  );
  return rows[0] ? map_agency(rows[0]) : null;
}

export async function list_live_escalation_paths(
  options: registry_list_options = {},
) {
  const unsupported_filters = [
    options.domain ? "domain" : null,
    options.jurisdiction ? "jurisdiction" : null,
    options.agencyId ? "agencyId" : null,
    options.direction ? "direction" : null,
  ].filter((value): value is string => value !== null);

  if (unsupported_filters.length > 0) {
    return {
      available: false as const,
      state: "unavailable" as const,
      reason: "escalation_filter_identity_not_available" as const,
      message:
        "Live escalation rows do not carry domain, jurisdiction, or agency identity, so the requested filtered path cannot be resolved without inventing a binding.",
      source: "escalation_registry" as const,
      requestedFilters: {
        domain: options.domain ?? null,
        jurisdiction: options.jurisdiction ?? null,
        agencyId: options.agencyId ?? null,
        direction: options.direction ?? null,
      },
      unsupportedFilters: unsupported_filters,
      paths: [],
    };
  }

  const { rows } = await query_with_diagnostics<escalation_registry_row>(
    `select e.uuid, e.issue_type, e.initial_route, e.secondary_route,
            e.federal_escalation, e.civil_escalation, e.federal_agencies,
            e.related_statutes, e.verification_status, e.created_at
       from public.escalation_registry e
      order by e.issue_type, e.uuid
      limit $1`,
    [
      Math.min(Math.max(options.limit ?? 100, 1), 100),
    ],
    { label: "registry_live_escalations" },
  );
  return {
    available: true as const,
    state: "available" as const,
    reason: null,
    message: null,
    source: "escalation_registry" as const,
    requestedFilters: null,
    unsupportedFilters: [] as string[],
    paths: rows.map(map_escalation),
  };
}

export const mental_health_resources_unavailable = {
  available: false,
  state: "unavailable" as const,
  reason: "mental_health_resources_table_not_established" as const,
  tableEstablished: false,
  resources: [] as never[],
  message:
    "Mental health resource storage is unavailable because no authoritative live table is established.",
};
