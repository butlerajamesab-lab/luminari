import type { ProvenanceState, RosettaLawObject, RosettaLawView, RosettaLayer } from "./civic-genome/assembly-contract";

const rosetta_layers: RosettaLayer[] = [
  "help",
  "workflow",
  "accountability",
  "override",
  "definition",
];

type rosetta_export_row = {
  extraction_run_id: number;
  source_document_id: number;
  corpus_id: number;
  document_name: string;
  document_type: string | null;
  document_identifier: string | null;
  run_version: number;
  run_status: string | null;
  confidence_threshold: number | string;
  created_at: string | null;
  completed_at: string | null;
  objects: unknown;
  coverage: unknown;
  provenance_state: ProvenanceState;
};

export type civic_genome_rosetta_law_view = {
  extraction_run_id: number;
  source_document_id: number;
  corpus_id: number;
  document_name: string;
  document_type: string | null;
  document_identifier: string | null;
  run_version: number;
  run_status: string | null;
  confidence_threshold: number;
  created_at: string | null;
  completed_at: string | null;
  law_view: RosettaLawView;
};

function get_required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }
  return value.replace(/\/$/, "");
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function is_rosetta_layer(value: unknown): value is RosettaLayer {
  return typeof value === "string" && rosetta_layers.includes(value as RosettaLayer);
}

function normalize_object(value: unknown): RosettaLawObject {
  if (!is_record(value)) {
    throw new Error("invalid_rosetta_object");
  }

  const layer = value.layer;
  const key = value.key;
  const source_object_type = value.source_object_type;
  const source_object_id = value.source_object_id;
  const source_block_id = value.source_block_id;
  const extraction_run_id = value.extraction_run_id;
  const confidence = Number(value.confidence);

  if (
    !is_rosetta_layer(layer)
    || typeof key !== "string"
    || typeof source_object_type !== "string"
    || typeof source_object_id !== "string"
    || !(source_block_id === null || typeof source_block_id === "string")
    || typeof extraction_run_id !== "string"
    || !Number.isFinite(confidence)
    || confidence < 0
    || confidence > 1
  ) {
    throw new Error("invalid_rosetta_object_contract");
  }

  return {
    layer,
    key,
    sourceObjectType: source_object_type,
    sourceObjectId: source_object_id,
    sourceBlockId: source_block_id,
    extractionRunId: extraction_run_id,
    normalizedValue: value.normalized_value,
    confidence,
    confirmed: value.confirmed === true,
    metadata: is_record(value.metadata) ? value.metadata : undefined,
  };
}

function normalize_coverage(value: unknown): Partial<Record<RosettaLayer, number>> {
  if (!is_record(value)) {
    return {};
  }

  const coverage: Partial<Record<RosettaLayer, number>> = {};
  for (const layer of rosetta_layers) {
    const entry = value[layer] ?? value[layer === "override" ? "overrides" : layer === "definition" ? "definitions" : layer];
    if (!is_record(entry)) {
      continue;
    }
    coverage[layer] = entry.status === "populated" || entry.status === "not_applicable" ? 1 : 0;
  }
  return coverage;
}

function normalize_export_row(row: rosetta_export_row): civic_genome_rosetta_law_view {
  if (!Array.isArray(row.objects)) {
    throw new Error("invalid_rosetta_objects_payload");
  }

  const objects = row.objects.map(normalize_object);
  const coverage = normalize_coverage(row.coverage);

  return {
    extraction_run_id: row.extraction_run_id,
    source_document_id: row.source_document_id,
    corpus_id: row.corpus_id,
    document_name: row.document_name,
    document_type: row.document_type,
    document_identifier: row.document_identifier,
    run_version: row.run_version,
    run_status: row.run_status,
    confidence_threshold: Number(row.confidence_threshold),
    created_at: row.created_at,
    completed_at: row.completed_at,
    law_view: {
      objects,
      coverage,
      provenanceState: row.provenance_state,
    },
  };
}

async function request_rosetta_rows(query: URLSearchParams): Promise<rosetta_export_row[]> {
  const base_url = get_required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = get_required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const url = `${base_url}/rest/v1/v_civic_genome_law_view_v1?${query.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: service_role_key,
      authorization: `Bearer ${service_role_key}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const preview = (await response.text()).slice(0, 500);
    throw new Error(`rosetta_contract_request_failed:${response.status}:${preview}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("invalid_rosetta_contract_response");
  }

  return payload as rosetta_export_row[];
}

export async function get_rosetta_law_view_by_extraction_run(
  extraction_run_id: number,
): Promise<civic_genome_rosetta_law_view | null> {
  const query = new URLSearchParams({
    select: "*",
    extraction_run_id: `eq.${extraction_run_id}`,
    limit: "1",
  });
  const rows = await request_rosetta_rows(query);
  return rows[0] ? normalize_export_row(rows[0]) : null;
}

export async function get_latest_rosetta_law_view_by_source_document(
  source_document_id: number,
): Promise<civic_genome_rosetta_law_view | null> {
  const query = new URLSearchParams({
    select: "*",
    source_document_id: `eq.${source_document_id}`,
    order: "run_version.desc,extraction_run_id.desc",
    limit: "1",
  });
  const rows = await request_rosetta_rows(query);
  return rows[0] ? normalize_export_row(rows[0]) : null;
}

/**
 * Resolve the Rosetta handoff created for one Docket source bill.
 *
 * The Docket numeric bill ID is persisted as Rosetta's document_identifier.
 * This exact identifier lookup is intentionally narrower than title, URL, or
 * semantic matching so a cross-service contract can never bind the wrong bill.
 */
export async function get_latest_rosetta_law_view_by_document_identifier(
  document_identifier: string,
): Promise<civic_genome_rosetta_law_view | null> {
  const query = new URLSearchParams({
    select: "*",
    document_identifier: `eq.${document_identifier}`,
    document_type: "eq.bill",
    order: "run_version.desc,extraction_run_id.desc",
    limit: "1",
  });
  const rows = await request_rosetta_rows(query);
  return rows[0] ? normalize_export_row(rows[0]) : null;
}
