import { getPool } from "./db";

export type EnforcementPathwayInput = {
  agencyShort?: string;
  claimType?: string;
  pipelineCategory?: string;
};

export type EnforcementPathwaySourceRows = {
  pathways: Array<Record<string, unknown>>;
  agencyForms: Array<Record<string, unknown>>;
};

type SourceState = "source_text_only" | "unavailable";

type PathwayDto = {
  id: string;
  pathwayId: string | null;
  pathwayName: string;
  jurisdiction: string | null;
  domain: string | null;
  description: string | null;
  agencyShort: string | null;
  claimTypes: string[];
  pipelineCategories: string[];
  sourceState: "source_text_only";
  sourcePending: boolean;
  sourceUrl: string | null;
  sourceFile: string | null;
  sourceSha256: string | null;
  createdAt: string | null;
};

function object_value(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text_value(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function text_list(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(text_value)
      .filter((entry): entry is string => entry != null);
  }
  const text = text_value(value);
  return text == null ? [] : [text];
}

function unique_sorted(values: string[]): string[] {
  return [...new Map(
    values.map(value => [value.toLowerCase(), value] as const),
  ).values()].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function source_agency_shorts(
  pathwayName: unknown,
  originalAgency: unknown,
  explicitAgencyShort: unknown,
  agencyForms: Array<Record<string, unknown>>,
): string[] {
  const explicit = text_value(explicitAgencyShort);
  const candidates = agencyForms.flatMap(form => {
    const short = text_value(form.agency_short);
    const agency = text_value(form.agency);
    if (short == null) return [];

    const directNameMatch = agency != null && (
      normalized(agency) === normalized(pathwayName)
      || normalized(agency) === normalized(originalAgency)
    );
    const directShortMatch = normalized(short) === normalized(pathwayName)
      || normalized(short) === normalized(originalAgency);
    return directNameMatch || directShortMatch ? [short] : [];
  });
  return unique_sorted(explicit == null ? candidates : [explicit, ...candidates]);
}

function map_pathway(
  row: Record<string, unknown>,
  agencyForms: Array<Record<string, unknown>>,
): PathwayDto {
  const metadata = object_value(row.metadata);
  const original = object_value(metadata.original_record);
  const agencyShorts = source_agency_shorts(
    row.pathway_name,
    original.agency,
    original.agency_short,
    agencyForms,
  );
  const pipelineCategories = unique_sorted([
    ...text_list(original.pipeline_category),
    ...text_list(original.pipeline_categories),
    ...agencyForms.flatMap(form => {
      const short = text_value(form.agency_short);
      return short != null && agencyShorts.some(value => normalized(value) === normalized(short))
        ? text_list(form.pipeline_category)
        : [];
    }),
  ]);

  return {
    id: String(row.id),
    pathwayId: text_value(row.pathway_id),
    pathwayName: text_value(row.pathway_name) ?? "Unnamed source record",
    jurisdiction: text_value(row.jurisdiction),
    domain: text_value(row.domain),
    description: text_value(row.description),
    agencyShort: agencyShorts[0] ?? null,
    claimTypes: unique_sorted(text_list(original.claim_types)),
    pipelineCategories,
    sourceState: "source_text_only",
    sourcePending: metadata.source_pending === true,
    sourceUrl: text_value(row.source_url) ?? text_value(metadata.source_url),
    sourceFile: text_value(metadata.source_file),
    sourceSha256: text_value(metadata.source_sha256),
    createdAt: text_value(row.created_at),
  };
}

function requested_filter(input: EnforcementPathwayInput): {
  key: "agencyShort" | "claimType" | "pipelineCategory";
  value: string;
} | null {
  if (text_value(input.agencyShort) != null) {
    return { key: "agencyShort", value: text_value(input.agencyShort)! };
  }
  if (text_value(input.claimType) != null) {
    return { key: "claimType", value: text_value(input.claimType)! };
  }
  if (text_value(input.pipelineCategory) != null) {
    return { key: "pipelineCategory", value: text_value(input.pipelineCategory)! };
  }
  return null;
}

function pathway_matches(
  pathway: PathwayDto,
  filter: NonNullable<ReturnType<typeof requested_filter>>,
): boolean {
  if (filter.key === "agencyShort") {
    return normalized(pathway.agencyShort) === normalized(filter.value);
  }
  const values = filter.key === "claimType"
    ? pathway.claimTypes
    : pathway.pipelineCategories;
  return values.some(value => normalized(value) === normalized(filter.value));
}

export function build_enforcement_pathway_dto(
  input: EnforcementPathwayInput,
  rows: EnforcementPathwaySourceRows,
) {
  const allPathways = rows.pathways.map(row => map_pathway(row, rows.agencyForms));
  const filter = requested_filter(input);
  const pathways = filter == null
    ? allPathways
    : allPathways.filter(pathway => pathway_matches(pathway, filter));
  const status: SourceState = pathways.length > 0
    ? "source_text_only"
    : "unavailable";

  return {
    availability: {
      status,
      reason: status === "unavailable"
        ? filter == null
          ? "No enforcement pathway source rows are available."
          : `No exact live source row matched ${filter.key}.`
        : "Only stored source text is available; no deadline, action, outcome, penalty, or success-rate claim is calculated or endorsed.",
    },
    matchedBy: filter == null
      ? pathways.length > 0 ? "all" as const : "none" as const
      : pathways.length > 0 ? filter.key : "none" as const,
    requested: {
      agencyShort: text_value(input.agencyShort),
      claimType: text_value(input.claimType),
      pipelineCategory: text_value(input.pipelineCategory),
    },
    filterOptions: {
      agencyShorts: unique_sorted(
        allPathways.flatMap(pathway => pathway.agencyShort == null ? [] : [pathway.agencyShort]),
      ),
      claimTypes: unique_sorted(allPathways.flatMap(pathway => pathway.claimTypes)),
      pipelineCategories: unique_sorted(
        allPathways.flatMap(pathway => pathway.pipelineCategories),
      ),
    },
    totalSourceRows: allPathways.length,
    pathways,
  };
}

/**
 * Takes one pool lease and returns one exact live-table snapshot. Filtering and
 * camel-case projection happen after the snapshot so every returned field can
 * be traced to the same read without procedural inference or fallback maps.
 */
export async function read_enforcement_pathways(input: EnforcementPathwayInput) {
  const { rows } = await getPool().query(`
    select coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', id,
                        'pathway_id', pathway_id,
                        'pathway_name', pathway_name,
                        'jurisdiction', jurisdiction,
                        'domain', domain,
                        'description', description,
                        'metadata', jsonb_build_object(
                          'source_pending', metadata->'source_pending',
                          'source_file', metadata->'source_file',
                          'source_sha256', metadata->'source_sha256',
                          'source_url', metadata->'source_url',
                          'original_record', jsonb_build_object(
                            'agency', metadata#>'{original_record,agency}',
                            'agency_short', metadata#>'{original_record,agency_short}',
                            'claim_types', metadata#>'{original_record,claim_types}',
                            'pipeline_category', metadata#>'{original_record,pipeline_category}',
                            'pipeline_categories', metadata#>'{original_record,pipeline_categories}'
                          )
                        ),
                        'source_url', source_url,
                        'created_at', created_at
                      )
                      order by pathway_name, id
                    )
               from public.enforcement_pathway_models
           ), '[]'::jsonb) as pathways,
           coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'agency', agency,
                        'agency_short', agency_short,
                        'pipeline_category', pipeline_category
                      )
                      order by agency_short, agency, pipeline_category
                    )
               from (
                 select distinct agency, agency_short, pipeline_category
                   from public.agency_forms
                  where nullif(btrim(agency_short), '') is not null
               ) source_forms
           ), '[]'::jsonb) as agency_forms
  `);
  const snapshot = rows[0] ?? {};
  return build_enforcement_pathway_dto(input, {
    pathways: Array.isArray(snapshot.pathways) ? snapshot.pathways : [],
    agencyForms: Array.isArray(snapshot.agency_forms) ? snapshot.agency_forms : [],
  });
}
