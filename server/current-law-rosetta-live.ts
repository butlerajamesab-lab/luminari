import { get_rosetta_review_base_url } from "./civic-genome-rosetta-evaluation";

const CURRENT_ROSETTA_LAYERS = new Set(["H", "W", "A", "O", "D", "R"]);
const CURRENT_ROSETTA_LIVE_TIMEOUT_MS = 10_000;

type json_record = Record<string, unknown>;

export type current_rosetta_live_unit = {
  unit_ord: number;
  section_ord: number | null;
  kind: string | null;
  disposition: string | null;
  layers: Array<"H" | "W" | "A" | "O" | "D" | "R">;
  raw_start: number;
  raw_end: number;
  raw_text: string;
  effective_text: string | null;
};

export type current_rosetta_live_detail = {
  contract: "rosetta-rule-live-detail-v1";
  observed_at: string | null;
  target: json_record;
  source: {
    source_content_id: string;
    source_document_id: number;
    source_content_hash: string;
    source_url: string | null;
    source_version: string | null;
    media_type: string | null;
    source_text: string;
    document_name: string | null;
    document_identifier: string | null;
    document_type: string | null;
  };
  decomposition: json_record | null;
  sections: unknown[];
  units: current_rosetta_live_unit[];
  markup_events: unknown[];
  hold_receipt: json_record | null;
  failure_receipts: unknown[];
};

function as_record(value: unknown): json_record | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as json_record
    : null;
}

function string_value(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function integer_value(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalize_hash(value: string): string {
  return value.toLowerCase();
}

function normalize_unit(value: unknown, source_length: number): current_rosetta_live_unit {
  const row = as_record(value);
  if (!row) throw new Error("current_rosetta_live_unit_invalid");
  const unit_ord = integer_value(row.unit_ord);
  const section_ord = row.section_ord == null ? null : integer_value(row.section_ord);
  const raw_start = integer_value(row.raw_start);
  const raw_end = integer_value(row.raw_end);
  if (
    unit_ord == null || unit_ord < 0 ||
    (section_ord != null && section_ord < 0) ||
    raw_start == null || raw_start < 0 ||
    raw_end == null || raw_end < raw_start ||
    raw_end > source_length
  ) {
    throw new Error("current_rosetta_live_unit_span_invalid");
  }
  const layers = Array.isArray(row.layers) ? row.layers : [];
  if (layers.some(layer => typeof layer !== "string" || !CURRENT_ROSETTA_LAYERS.has(layer))) {
    throw new Error("current_rosetta_live_unit_layer_invalid");
  }
  return {
    unit_ord,
    section_ord,
    kind: string_value(row.kind),
    disposition: string_value(row.disposition),
    layers: layers as current_rosetta_live_unit["layers"],
    raw_start,
    raw_end,
    raw_text: typeof row.raw_text === "string" ? row.raw_text : "",
    effective_text: string_value(row.effective_text),
  };
}

/**
 * Read Rosetta's selected-runtime source-bound detail for presentation only.
 *
 * This deliberately does not reuse the Civic Genome five-layer assembly adapter:
 * the current Rosetta reader may expose R ("Rule") as a current classifier, while
 * Civic Genome's canonical semantic ontology remains independently governed.
 */
export async function get_current_rosetta_live_detail(input: {
  source_content_id: string;
  source_content_hash: string;
}): Promise<current_rosetta_live_detail | null> {
  const url = new URL(
    `/api/live-rule/${encodeURIComponent(input.source_content_id)}`,
    get_rosetta_review_base_url(),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CURRENT_ROSETTA_LIVE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`current_rosetta_live_read_failed:${response.status}`);
    }
    const payload = as_record(await response.json());
    const target = as_record(payload?.target);
    const source = as_record(payload?.source);
    if (
      !payload ||
      payload.contract !== "rosetta-rule-live-detail-v1" ||
      !target ||
      target.identity_valid !== true ||
      !source
    ) {
      throw new Error("current_rosetta_live_contract_invalid");
    }

    const source_content_id = string_value(source.source_content_id);
    const source_content_hash = string_value(source.source_content_hash);
    const source_text = typeof source.source_text === "string" ? source.source_text : null;
    const source_document_id = integer_value(source.source_document_id);
    if (
      !source_content_id ||
      source_content_id.toLowerCase() !== input.source_content_id.toLowerCase() ||
      !source_content_hash ||
      normalize_hash(source_content_hash) !== normalize_hash(input.source_content_hash) ||
      !source_text ||
      source_document_id == null ||
      source_document_id <= 0
    ) {
      throw new Error("current_rosetta_live_source_identity_mismatch");
    }

    const units = Array.isArray(payload.units)
      ? payload.units.map(unit => normalize_unit(unit, source_text.length))
      : [];
    return {
      contract: "rosetta-rule-live-detail-v1",
      observed_at: string_value(payload.observed_at),
      target,
      source: {
        source_content_id,
        source_document_id,
        source_content_hash: normalize_hash(source_content_hash),
        source_url: string_value(source.source_url),
        source_version: string_value(source.source_version),
        media_type: string_value(source.media_type),
        source_text,
        document_name: string_value(source.document_name),
        document_identifier: string_value(source.document_identifier),
        document_type: string_value(source.document_type),
      },
      decomposition: as_record(payload.decomposition),
      sections: Array.isArray(payload.sections) ? payload.sections : [],
      units,
      markup_events: Array.isArray(payload.markup_events) ? payload.markup_events : [],
      hold_receipt: as_record(payload.hold_receipt),
      failure_receipts: Array.isArray(payload.failure_receipts) ? payload.failure_receipts : [],
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("current_rosetta_live_read_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
