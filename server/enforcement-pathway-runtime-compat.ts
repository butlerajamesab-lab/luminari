import { getPool as get_pool } from "./db";
import { workflowJurisdictionCode as jurisdiction_code } from "./engines/intake-spine/source-workflow-registry";
import { computeHash as source_hash } from "./engines/intake-spine/utils";
import { reviewed_enforcement_artifact, reviewed_enforcement_model_bindings } from "./enforcement-pathway-source-review";

export type enforcement_pathway_input = {
  jurisdiction?: string;
  pipeline_category?: string;
  agency_short?: string;
  agency_name?: string;
  claim_type?: string;
  pathway_id?: string;
};

export type enforcement_pathway_source_rows = {
  pathways: Array<Record<string, unknown>>;
  agency_forms: Array<Record<string, unknown>>;
  model_references?: Array<Record<string, unknown>>;
};

const MAX_RETURNED_PATHWAYS = 200;

function object_value(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text_value(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function text_list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text_value).filter((value): value is string => value != null);
  const text = text_value(value);
  return text == null ? [] : text.split(";").map(value => value.trim()).filter(Boolean);
}

function normalized(value: unknown): string { return String(value ?? "").trim().toLowerCase(); }
function unique_sorted(values: string[]): string[] {
  return [...new Map(values.map(value => [normalized(value), value])).values()].sort();
}

function original_record(row: Record<string, unknown>) {
  return object_value(object_value(row.metadata).original_record);
}

function source_agency_shorts(row: Record<string, unknown>, forms: Array<Record<string, unknown>>): string[] {
  const original = original_record(row);
  const names = [row.pathway_name, original.agency, original.oversight_body].map(normalized).filter(Boolean);
  return unique_sorted([
    ...text_list(original.agency_short),
    ...forms.flatMap(form => {
      const short = text_value(form.agency_short);
      return short && (names.includes(normalized(form.agency)) || names.includes(normalized(short))) ? [short] : [];
    }),
  ]);
}

function reviewed_binding(row: Record<string, unknown>) {
  // `_key` was added by the legacy importer; every actual source field is hashed.
  const { _key, ...source_record } = original_record(row);
  const metadata = object_value(row.metadata);
  const fingerprint = source_hash(source_record);
  return reviewed_enforcement_model_bindings.find(binding =>
    binding.model_id === row.id && binding.pathway_id === row.pathway_id
    && normalized(binding.jurisdiction) === normalized(row.jurisdiction)
    && binding.source_bucket === metadata.bucket
    && binding.source_key === (metadata.source_key ?? _key)
    && binding.source_record_sha256 === fingerprint,
  ) ?? null;
}

type source_step = {
  source_index: number;
  source_order: number | null;
  source_name: string | null;
  source_description: string | null;
  source_locator: string | null;
  civic_object_uid: string | null;
  source_state: "source_text_only";
};

function map_pathway(row: Record<string, unknown>, forms: Array<Record<string, unknown>>, is_model = false) {
  const metadata = object_value(row.metadata);
  const original = original_record(row);
  const shorts = source_agency_shorts(row, forms);
  const binding = is_model ? reviewed_binding(row) : null;
  const source_locator = binding?.source_locator ?? (is_model ? null : text_value(metadata.source_locator));
  const record_kind = is_model ? "model" as const
    : source_locator?.includes(".process_steps[") ? "unlinked_step" as const : "source_record" as const;
  const steps: source_step[] = is_model && Array.isArray(original.process_steps)
    ? original.process_steps.map((value, index) => {
      const step = object_value(value);
      return {
        source_index: index,
        source_order: typeof step.step === "number" && Number.isSafeInteger(step.step) && step.step > 0 ? step.step : null,
        source_name: text_value(step.name),
        source_description: text_value(step.description),
        source_locator: source_locator == null ? null : `${source_locator}.process_steps[${index}]`,
        civic_object_uid: null,
        source_state: "source_text_only" as const,
      };
    }) : [];
  return {
    id: String(row.id),
    pathway_id: text_value(row.pathway_id),
    pathway_name: (is_model ? text_value(original.agency) : null) ?? text_value(row.pathway_name) ?? "Unnamed source record",
    jurisdiction: text_value(row.jurisdiction),
    domain: text_value(row.domain),
    description: text_value(row.description),
    agency_name: text_value(original.agency) ?? text_value(original.oversight_body),
    agency_short: shorts[0] ?? null,
    claim_types: unique_sorted(text_list(original.claim_types)),
    pipeline_categories: unique_sorted([
      ...text_list(original.pipeline_category), ...text_list(original.pipeline_categories),
      ...forms.flatMap(form => shorts.some(short => normalized(short) === normalized(form.agency_short))
        ? text_list(form.pipeline_category) : []),
    ]),
    record_kind,
    source_origin: is_model ? "stored_model_reference" as const : "current_civic_object" as const,
    source_identity_status: binding ? "reviewed_content_match" as const
      : is_model ? "unverified_reference" as const : "current_object" as const,
    source_state: "source_text_only" as const,
    source_pending: is_model || metadata.source_pending === true,
    source_url: text_value(row.source_url) ?? text_value(metadata.source_url),
    source_file: binding ? reviewed_enforcement_artifact.artifact_key : text_value(metadata.source_file),
    // Legacy source_sha256 values are not proven file hashes. Never relabel them.
    source_sha256: binding ? reviewed_enforcement_artifact.source_sha256
      : is_model ? null : text_value(metadata.source_sha256),
    source_record_sha256: binding?.source_record_sha256 ?? null,
    source_locator,
    created_at: text_value(row.created_at),
    steps,
  };
}

export function build_enforcement_pathway_dto(input: enforcement_pathway_input, rows: enforcement_pathway_source_rows) {
  const linked_current_ids = new Set<string>();
  const model_rows = (rows.model_references ?? []).filter(row =>
    text_value(row.pathway_id) != null && row.pathway_id === original_record(row).pathway_id,
  );
  const models = model_rows.map(row => {
    const model = map_pathway(row, rows.agency_forms, true);
    if (model.source_identity_status !== "reviewed_content_match") return model;
    const source_steps = original_record(row).process_steps;
    model.steps.forEach(step => {
      const matching = rows.pathways.filter(current => {
        const metadata = object_value(current.metadata);
        return metadata.source_file === model.source_file && metadata.source_sha256 === model.source_sha256
          && metadata.source_locator === step.source_locator
          && Array.isArray(source_steps)
          && source_hash(original_record(current)) === source_hash(source_steps[step.source_index]);
      });
      // Ambiguous or changed candidates stay visible as unlinked current rows.
      if (matching.length !== 1) return;
      step.civic_object_uid = String(matching[0].id);
      linked_current_ids.add(step.civic_object_uid);
    });
    return model;
  });
  const current = rows.pathways.filter(row => !linked_current_ids.has(String(row.id)))
    .map(row => map_pathway(row, rows.agency_forms));
  const requested_jurisdiction = normalized(input.jurisdiction) === "federal" ? "federal" : jurisdiction_code(input.jurisdiction);
  const all_pathways = [...models, ...current].filter(pathway => !input.jurisdiction || (
    requested_jurisdiction != null && requested_jurisdiction === (normalized(pathway.jurisdiction) === "federal"
      ? "federal" : jurisdiction_code(pathway.jurisdiction))
  ));
  const filters = ["agency_short", "agency_name", "claim_type", "pipeline_category", "pathway_id"] as const;
  const active_filters = filters.filter(key => text_value(input[key]) != null);
  const matching = all_pathways.filter(pathway => active_filters.every(key => {
    const value = normalized(input[key]);
    if (key === "pathway_id") return [pathway.pathway_id, pathway.id, ...pathway.steps.map(step => step.civic_object_uid)]
      .some(id => normalized(id) === value || normalized(id) === `corpus:${value}`);
    if (key === "claim_type") return pathway.claim_types.some(tag => normalized(tag) === value);
    if (key === "pipeline_category") return pathway.pipeline_categories.some(tag => normalized(tag) === value);
    return normalized(pathway[key]) === value;
  }));
  const pathways = matching.slice(0, MAX_RETURNED_PATHWAYS);
  return {
    availability: {
      status: matching.length ? "source_text_only" as const : "unavailable" as const,
      reason: matching.length ? "Stored reference text; applicability, deadlines, procedural advice, outcomes and success rates are not verified or calculated."
        : "No source reference matched every requested filter.",
    },
    matched_by: !matching.length ? "none" : active_filters.length ? active_filters.join("+") : "all",
    requested: {
      jurisdiction: text_value(input.jurisdiction), agency_short: text_value(input.agency_short),
      agency_name: text_value(input.agency_name), claim_type: text_value(input.claim_type),
      pipeline_category: text_value(input.pipeline_category), pathway_id: text_value(input.pathway_id),
    },
    filter_options: {
      agency_shorts: unique_sorted(all_pathways.flatMap(pathway => text_list(pathway.agency_short))),
      agency_names: unique_sorted(all_pathways.flatMap(pathway => text_list(pathway.agency_name))),
      claim_types: unique_sorted(all_pathways.flatMap(pathway => pathway.claim_types)),
      pipeline_categories: unique_sorted(all_pathways.flatMap(pathway => pathway.pipeline_categories)),
      jurisdictions: unique_sorted([...models, ...current].flatMap(pathway => text_list(pathway.jurisdiction))),
    },
    total_source_rows: all_pathways.length,
    matched_source_rows: matching.length,
    returned_source_rows: pathways.length,
    return_limit: MAX_RETURNED_PATHWAYS,
    model_count: all_pathways.filter(pathway => pathway.record_kind === "model").length,
    unlinked_step_count: all_pathways.filter(pathway => pathway.record_kind === "unlinked_step").length,
    linked_step_count: all_pathways.flatMap(pathway => pathway.steps).filter(step => step.civic_object_uid).length,
    source_contract: "enforcement_model_step_source_references_v2",
    pathways,
  };
}

/** One read snapshot; references remain separate from operational case paths. */
export async function read_enforcement_pathways(input: enforcement_pathway_input) {
  const { rows } = await get_pool().query(`
    with current_objects as materialized (
      select
        civic_object_uid,
        object_ref,
        source_candidate_hash,
        artifact_key,
        source_locator,
        source_content_sha256,
        parser_version,
        jurisdiction,
        state_code,
        category,
        description,
        website_url,
        filing_portal_url,
        data_state,
        reconciled_at,
        name
      from public.v_lighthouse_civic_object_current_v1
      where object_class = 'enforcement_pathway'
    ), candidate_payloads as materialized (
      select distinct on (p.candidate_hash, p.artifact_key)
        p.candidate_hash,
        p.artifact_key,
        p.payload
      from public.luminari_corpus_candidate_v1 p
      join (
        select distinct source_candidate_hash, artifact_key
        from current_objects
      ) c
        on c.source_candidate_hash = p.candidate_hash
       and c.artifact_key = p.artifact_key
      order by p.candidate_hash, p.artifact_key, p.created_at desc
    ), source_rows as (
      select
        c.*,
        coalesce(p.payload->'row', p.payload->'record', '{}'::jsonb) as source_record
      from current_objects c
      left join candidate_payloads p
        on p.candidate_hash = c.source_candidate_hash
       and p.artifact_key = c.artifact_key
    )
    select coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', civic_object_uid,
                        'pathway_id', coalesce(
                          nullif(source_record->>'pathway_id',''),
                          nullif(source_record->>'fep_uuid',''),
                          object_ref
                        ),
                        'pathway_name', coalesce(
                          nullif(source_record->>'oversight_body',''),
                          nullif(source_record->>'pathway_name',''),
                          nullif(source_record->>'agency',''),
                          nullif(source_record->>'name',''),
                          nullif(name,''),
                          'Unnamed source record'
                        ),
                        'jurisdiction', coalesce(
                          nullif(state_code,''),
                          nullif(jurisdiction,''),
                          nullif(source_record->>'jurisdiction_name',''),
                          nullif(source_record->>'jurisdiction','')
                        ),
                        'domain', coalesce(
                          nullif(source_record->>'entity_type',''),
                          nullif(source_record->>'model_type',''),
                          nullif(source_record->>'domains',''),
                          nullif(source_record->>'domain',''),
                          nullif(category,'')
                        ),
                        'description', coalesce(
                          nullif(source_record->>'what_to_report',''),
                          nullif(source_record->>'description',''),
                          nullif(description,'')
                        ),
                        'metadata', jsonb_build_object(
                          'source_pending', data_state <> 'current_typed',
                          'source_file', artifact_key,
                          'source_sha256', source_content_sha256,
                          'source_url', coalesce(
                            nullif(source_record->>'source_url',''),
                            nullif(website_url,''),
                            nullif(filing_portal_url,'')
                          ),
                          'source_locator', source_locator,
                          'parser_version', parser_version,
                          'original_record', source_record
                        ),
                        'source_url', coalesce(
                          nullif(source_record->>'source_url',''),
                          nullif(website_url,''),
                          nullif(filing_portal_url,'')
                        ),
                        'created_at', reconciled_at
                      )
                      order by
                        coalesce(nullif(state_code,''), nullif(jurisdiction,''), ''),
                        coalesce(
                          nullif(source_record->>'oversight_body',''),
                          nullif(source_record->>'pathway_name',''),
                          nullif(source_record->>'agency',''),
                          nullif(source_record->>'name',''),
                          nullif(name,''),
                          object_ref
                        ),
                        object_ref
                    )
               from source_rows
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
           ), '[]'::jsonb) as agency_forms,
           coalesce((
             select jsonb_agg(to_jsonb(m) order by m.jurisdiction, m.pathway_id, m.id)
             from public.enforcement_pathway_models m
             where nullif(m.pathway_id, '') is not null
               and m.pathway_id = m.metadata->'original_record'->>'pathway_id'
           ), '[]'::jsonb) as model_references
  `);
  const snapshot = rows[0] ?? {};
  return build_enforcement_pathway_dto(input, {
    pathways: Array.isArray(snapshot.pathways) ? snapshot.pathways : [],
    agency_forms: Array.isArray(snapshot.agency_forms) ? snapshot.agency_forms : [],
    model_references: Array.isArray(snapshot.model_references) ? snapshot.model_references : [],
  });
}
