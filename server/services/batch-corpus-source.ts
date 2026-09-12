import { createHash as create_hash } from "node:crypto";
import { parse_batch_source, BATCH_SOURCE_PARSER_VERSION } from "../../scripts/lib/batch-source-adapter.mjs";
import { parseImageArchiveWithOcr as parse_image_archive_with_ocr, OCR_RULE_MANIFEST } from "../engines/intake-spine/ocr-substrate";

export type batch_observation = {
  source_kind: string;
  source_locator: string;
  values: Record<string, unknown>;
  source_record_sha256?: string;
  source_record_id?: string | null;
  source_relation?: string;
  member_sha256?: string;
  member_path?: string;
  review_state: string;
};

export async function recognize_docx_images(bytes: Buffer, artifact_key: string) {
  const recognized = await parse_image_archive_with_ocr(bytes, artifact_key);
  const images = new Map<string, { text: string; engine: string }>();
  for (const span of recognized?.spans || []) {
    if (!span.archive_member_path) continue;
    const existing = images.get(span.archive_member_path) || { text: "", engine: OCR_RULE_MANIFEST.engine };
    existing.text += (existing.text ? "\n" : "") + recognized!.text.slice(span.start_offset, span.end_offset);
    images.set(span.archive_member_path, existing);
  }
  return images;
}

export async function parse_batch_atomic_records(bytes: Buffer, source_name: string,
  recognize_images: typeof recognize_docx_images | null = recognize_docx_images) {
  const parsed = await parse_batch_source(bytes, source_name, recognize_images);
  if (parsed.observations.length >= 200_000) throw new Error("batch_source_observation_limit_exceeded");
  const observations: batch_observation[] = [...parsed.observations, {
    source_kind: "batch_source_receipt", source_locator: "source:receipt",
    values: { source_sha256: parsed.source_sha256, parser_version: parsed.parser_version,
      observations: parsed.observations.length, holds: parsed.holds, parts: parsed.parts,
      publication_state: "governed_non_public", canonical_promotion_performed: false },
    review_state: parsed.holds.length ? "completed_with_holds" : "source_observation",
  }];
  return observations.map((observation, index) => {
    const source_file_sha256 = observation.member_sha256 || parsed.source_sha256;
    const values_json = { ...observation, source_sha256: parsed.source_sha256,
      source_record_sha256: observation.source_record_sha256 || create_hash("sha256").update(JSON.stringify(observation.values)).digest("hex") };
    const material = JSON.stringify({ source_file_sha256, source_locator: observation.source_locator,
      parser_version: BATCH_SOURCE_PARSER_VERSION, values_json });
    const record_hash = create_hash("sha256").update(material).digest("hex");
    return { atomic_record_key: record_hash, source_file_sha256, source_kind: observation.source_kind,
      source_relation: observation.source_relation || null, row_ordinal: index + 1,
      column_names: Object.keys(values_json), values_json, raw_excerpt: JSON.stringify(observation.values).slice(0, 8_000),
      parser_version: BATCH_SOURCE_PARSER_VERSION, record_hash, source_locator: observation.source_locator,
      container_member_path: observation.member_path || null };
  });
}
