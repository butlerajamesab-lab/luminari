import { query_with_diagnostics } from "./db-legacy";

type docket_list_options = {
  jurisdiction?: string;
  jurisdictionLevel?: string;
  lawType?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

type similar_law = {
  jurisdiction: string;
  title: string;
  note: string;
};

type historical_precedent = {
  title: string;
  year: string;
  note: string;
};

export type live_docket_entry_write = {
  slug: string;
  title: string;
  shortTitle?: string;
  jurisdiction: string;
  jurisdictionLevel: string;
  lawType: string;
  status: string;
  dateIntroduced?: string;
  dateEnacted?: string;
  dateEffective?: string;
  summary?: string;
  keyChanges?: string[];
  implementationAgencies?: string[];
  adminSteps?: string[];
  complianceObligations?: string[];
  rolloutTimeline?: string[];
  structuralExemptions?: string[];
  enforcementGaps?: string[];
  reportingGaps?: string[];
  delegatedAuthority?: string[];
  similarLaws?: similar_law[];
  historicalPrecedents?: historical_precedent[];
  implementationVariations?: string[];
  primarySourceUrl?: string;
};

export type live_docket_entry_update = Partial<live_docket_entry_write>;

type live_docket_row = {
  id: string;
  title: string;
  entry_type: string | null;
  jurisdiction: string | null;
  status: string | null;
  introduced_date: string | null;
  summary: string | null;
  full_text: string | null;
  source_url: string | null;
  domains: unknown;
  metadata: Record<string, unknown> | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

function timestamp_to_iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function metadata_text(
  metadata: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function metadata_string_list(
  metadata: Record<string, unknown> | null,
  ...keys: string[]
): string[] | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      return value;
    }
  }
  return null;
}

function metadata_similar_laws(
  metadata: Record<string, unknown> | null,
): similar_law[] | null {
  const value = metadata?.similar_laws ?? metadata?.similarLaws;
  if (!Array.isArray(value)) return null;
  if (
    !value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).jurisdiction === "string" &&
        typeof (item as Record<string, unknown>).title === "string" &&
        typeof (item as Record<string, unknown>).note === "string",
    )
  ) {
    return null;
  }
  return value as similar_law[];
}

function metadata_historical_precedents(
  metadata: Record<string, unknown> | null,
): historical_precedent[] | null {
  const value =
    metadata?.historical_precedents ?? metadata?.historicalPrecedents;
  if (!Array.isArray(value)) return null;
  if (
    !value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).title === "string" &&
        typeof (item as Record<string, unknown>).year === "string" &&
        typeof (item as Record<string, unknown>).note === "string",
    )
  ) {
    return null;
  }
  return value as historical_precedent[];
}

const metadata_write_keys: ReadonlyArray<
  readonly [keyof live_docket_entry_write, string]
> = [
  ["slug", "slug"],
  ["shortTitle", "short_title"],
  ["jurisdictionLevel", "jurisdiction_level"],
  ["lawType", "law_type"],
  ["dateEnacted", "date_enacted"],
  ["dateEffective", "date_effective"],
  ["keyChanges", "key_changes"],
  ["implementationAgencies", "implementation_agencies"],
  ["adminSteps", "admin_steps"],
  ["complianceObligations", "compliance_obligations"],
  ["rolloutTimeline", "rollout_timeline"],
  ["structuralExemptions", "structural_exemptions"],
  ["enforcementGaps", "enforcement_gaps"],
  ["reportingGaps", "reporting_gaps"],
  ["delegatedAuthority", "delegated_authority"],
  ["similarLaws", "similar_laws"],
  ["historicalPrecedents", "historical_precedents"],
  ["implementationVariations", "implementation_variations"],
];

function project_write_metadata(
  input: live_docket_entry_update,
  include_analysis_version = false,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const [input_key, metadata_key] of metadata_write_keys) {
    const value = input[input_key];
    if (value !== undefined) metadata[metadata_key] = value;
  }
  if (include_analysis_version) metadata.analysis_version = "1.0";
  return metadata;
}

function project_live_docket_row(row: live_docket_row) {
  const metadata = row.metadata ?? {};
  return {
    id: row.id,
    slug: metadata_text(metadata, "slug"),
    title: row.title,
    shortTitle: metadata_text(metadata, "short_title", "shortTitle"),
    jurisdiction: row.jurisdiction,
    jurisdictionLevel: metadata_text(
      metadata,
      "jurisdiction_level",
      "jurisdictionLevel",
    ),
    lawType: metadata_text(metadata, "law_type", "lawType") ?? row.entry_type,
    status: row.status,
    dateIntroduced: row.introduced_date,
    dateEnacted: metadata_text(metadata, "date_enacted", "dateEnacted"),
    dateEffective: metadata_text(metadata, "date_effective", "dateEffective"),
    summary: row.summary,
    keyChanges: metadata_string_list(metadata, "key_changes", "keyChanges"),
    implementationAgencies: metadata_string_list(
      metadata,
      "implementation_agencies",
      "implementationAgencies",
    ),
    adminSteps: metadata_string_list(metadata, "admin_steps", "adminSteps"),
    complianceObligations: metadata_string_list(
      metadata,
      "compliance_obligations",
      "complianceObligations",
    ),
    rolloutTimeline: metadata_string_list(
      metadata,
      "rollout_timeline",
      "rolloutTimeline",
    ),
    structuralExemptions: metadata_string_list(
      metadata,
      "structural_exemptions",
      "structuralExemptions",
    ),
    enforcementGaps: metadata_string_list(
      metadata,
      "enforcement_gaps",
      "enforcementGaps",
    ),
    reportingGaps: metadata_string_list(
      metadata,
      "reporting_gaps",
      "reportingGaps",
    ),
    delegatedAuthority: metadata_string_list(
      metadata,
      "delegated_authority",
      "delegatedAuthority",
    ),
    similarLaws: metadata_similar_laws(metadata),
    historicalPrecedents: metadata_historical_precedents(metadata),
    implementationVariations: metadata_string_list(
      metadata,
      "implementation_variations",
      "implementationVariations",
    ),
    primarySourceUrl: row.source_url,
    sourceDocumentUrl: null,
    sourceDocumentName: null,
    analysisVersion: metadata_text(
      metadata,
      "analysis_version",
      "analysisVersion",
    ),
    domains: row.domains,
    fullText: row.full_text,
    metadata,
    createdAt: timestamp_to_iso(row.created_at),
    updatedAt: timestamp_to_iso(row.updated_at),
    projectionState: "live_docket_registry",
  };
}

const LIVE_DOCKET_COLUMNS = `
  id,
  title,
  entry_type,
  jurisdiction,
  status,
  introduced_date,
  summary,
  full_text,
  source_url,
  domains,
  metadata,
  created_at,
  updated_at
`;

export async function list_live_docket_entries(
  options: docket_list_options = {},
) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (options.jurisdiction)
    conditions.push(`jurisdiction = ${bind(options.jurisdiction)}`);
  if (options.jurisdictionLevel) {
    const parameter = bind(options.jurisdictionLevel);
    conditions.push(
      `coalesce(metadata->>'jurisdiction_level', metadata->>'jurisdictionLevel') = ${parameter}`,
    );
  }
  if (options.lawType) {
    const parameter = bind(options.lawType);
    conditions.push(
      `coalesce(metadata->>'law_type', metadata->>'lawType', entry_type) = ${parameter}`,
    );
  }
  if (options.status) conditions.push(`status = ${bind(options.status)}`);
  if (options.search) {
    const parameter = bind(`%${options.search}%`);
    conditions.push(
      `(title ilike ${parameter} or summary ilike ${parameter} or jurisdiction ilike ${parameter})`,
    );
  }

  const limit = bind(Math.min(Math.max(options.limit ?? 50, 1), 100));
  const offset = bind(Math.max(options.offset ?? 0, 0));
  const { rows } = await query_with_diagnostics<live_docket_row>(
    `select ${LIVE_DOCKET_COLUMNS}
       from public.docket_entries
      ${conditions.length > 0 ? `where ${conditions.join(" and ")}` : ""}
      order by updated_at desc nulls last, id desc
      limit ${limit} offset ${offset}`,
    values,
    { label: "docket_live_list" },
  );
  return rows.map(project_live_docket_row);
}

export async function get_live_docket_entry(id: string) {
  const { rows } = await query_with_diagnostics<live_docket_row>(
    `select ${LIVE_DOCKET_COLUMNS}
       from public.docket_entries
      where id = $1::uuid
      limit 1`,
    [id],
    { label: "docket_live_get" },
  );
  return rows[0] ? project_live_docket_row(rows[0]) : null;
}

export async function get_live_docket_entry_by_slug(slug: string) {
  const { rows } = await query_with_diagnostics<live_docket_row>(
    `select ${LIVE_DOCKET_COLUMNS}
       from public.docket_entries
      where coalesce(metadata->>'slug', '') = $1
      limit 1`,
    [slug],
    { label: "docket_live_get_by_slug" },
  );
  return rows[0] ? project_live_docket_row(rows[0]) : null;
}

export async function get_live_docket_stats() {
  const { rows } = await query_with_diagnostics<{
    total: number;
    by_type: Record<string, number>;
    by_jurisdiction: Record<string, number>;
  }>(
    `select
       count(*)::int as total,
       coalesce((
         select jsonb_object_agg(entry_type, entry_count)
         from (
           select entry_type, count(*)::int as entry_count
           from public.docket_entries
           where entry_type is not null
           group by entry_type
         ) type_counts
       ), '{}'::jsonb) as by_type,
       coalesce((
         select jsonb_object_agg(jurisdiction, entry_count)
         from (
           select jurisdiction, count(*)::int as entry_count
           from public.docket_entries
           where jurisdiction is not null
           group by jurisdiction
         ) jurisdiction_counts
       ), '{}'::jsonb) as by_jurisdiction
     from public.docket_entries`,
    [],
    { label: "docket_live_stats" },
  );
  const stats = rows[0] ?? { total: 0, by_type: {}, by_jurisdiction: {} };
  return {
    total: Number(stats.total ?? 0),
    byLevel: {},
    byType: stats.by_type ?? {},
    byJurisdiction: stats.by_jurisdiction ?? {},
    projectionState: "live_docket_registry",
    jurisdictionLevelAvailable: false,
  };
}

export async function create_live_docket_entry(
  input: live_docket_entry_write,
): Promise<string> {
  const metadata = project_write_metadata(input, true);
  const { rows } = await query_with_diagnostics<{ id: string }>(
    `insert into public.docket_entries (
       title,
       entry_type,
       jurisdiction,
       status,
       introduced_date,
       summary,
       source_url,
       metadata,
       updated_at
     ) values (
       $1,
       $2,
       $3,
       $4,
       nullif($5, '')::date,
       $6,
       $7,
       $8::jsonb,
       now()
     )
     returning id`,
    [
      input.title,
      input.lawType,
      input.jurisdiction,
      input.status,
      input.dateIntroduced ?? null,
      input.summary ?? null,
      input.primarySourceUrl ?? null,
      JSON.stringify(metadata),
    ],
    { label: "docket_live_create" },
  );
  if (!rows[0]?.id) {
    throw new Error("Live docket create did not return an identity");
  }
  return rows[0].id;
}

export async function update_live_docket_entry(
  id: string,
  input: live_docket_entry_update,
): Promise<boolean> {
  const values: unknown[] = [];
  const assignments: string[] = [];
  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (input.title !== undefined)
    assignments.push(`title = ${bind(input.title)}`);
  if (input.lawType !== undefined)
    assignments.push(`entry_type = ${bind(input.lawType)}`);
  if (input.jurisdiction !== undefined)
    assignments.push(`jurisdiction = ${bind(input.jurisdiction)}`);
  if (input.status !== undefined)
    assignments.push(`status = ${bind(input.status)}`);
  if (input.dateIntroduced !== undefined) {
    assignments.push(
      `introduced_date = nullif(${bind(input.dateIntroduced)}, '')::date`,
    );
  }
  if (input.summary !== undefined)
    assignments.push(`summary = ${bind(input.summary)}`);
  if (input.primarySourceUrl !== undefined) {
    assignments.push(`source_url = ${bind(input.primarySourceUrl)}`);
  }

  const metadata = project_write_metadata(input);
  if (Object.keys(metadata).length > 0) {
    assignments.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || ${bind(JSON.stringify(metadata))}::jsonb`,
    );
  }

  assignments.push("updated_at = now()");
  const id_parameter = bind(id);
  const { rows } = await query_with_diagnostics<{ id: string }>(
    `update public.docket_entries
        set ${assignments.join(", ")}
      where id = ${id_parameter}::uuid
      returning id`,
    values,
    { label: "docket_live_update" },
  );
  return rows[0]?.id === id;
}

export async function delete_live_docket_entry(id: string): Promise<boolean> {
  const { rows } = await query_with_diagnostics<{ id: string }>(
    `delete from public.docket_entries
      where id = $1::uuid
      returning id`,
    [id],
    { label: "docket_live_delete" },
  );
  return rows[0]?.id === id;
}
