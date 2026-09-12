import { createHash as create_hash } from "node:crypto";
import { posix } from "node:path";
import JSZip from "jszip";
import { SaxesParser as xml_parser } from "saxes";
import { parse_docx_document_xml, compile_pipeline_dossier_items } from "./pipeline-dossier-review-compiler.mjs";

export const DOCX_SOURCE_PARSER_VERSION = "corpus_docx_source_v1.0.1";
const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main";
const RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const source_sha256 = value => create_hash("sha256").update(value).digest("hex");
export const canonical_source_json = value => value !== null && typeof value === "object"
  ? Array.isArray(value) ? `[${value.map(canonical_source_json).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical_source_json(value[key])}`).join(",")}}`
  : JSON.stringify(value);

function xml_tree(xml) {
  const parser = new xml_parser({ xmlns: true });
  const root = { children: [] };
  const stack = [root];
  parser.on("doctype", () => { throw new Error("doctype_not_supported"); });
  parser.on("opentag", tag => {
    const node = { local: tag.local, uri: tag.uri, attributes: tag.attributes, children: [] };
    stack.at(-1).children.push(node);
    stack.push(node);
  });
  parser.on("text", text => stack.at(-1).children.push(text));
  parser.on("cdata", text => stack.at(-1).children.push(text));
  parser.on("closetag", () => stack.pop());
  parser.write(xml).close();
  return root;
}

function descendants(node, local, namespace = WORD_NAMESPACE) {
  if (typeof node === "string") return [];
  return [...(node.local === local && node.uri === namespace ? [node] : []),
    ...node.children.flatMap(child => descendants(child, local, namespace))];
}

function word_text(node) {
  if (typeof node === "string") return "";
  if (node.uri === WORD_NAMESPACE && node.local === "t") return node.children.join("");
  if (node.uri === WORD_NAMESPACE && ["br", "cr"].includes(node.local)) return "\n";
  if (node.uri === WORD_NAMESPACE && node.local === "tab") return "\t";
  return node.children.map(word_text).join("");
}

function attribute(node, local, namespace) {
  return Object.values(node.attributes || {}).find(value => value.local === local
    && (namespace === undefined || value.uri === namespace))?.value;
}

/** JSZip normalizes names and overwrites duplicate entries. Reject those before loading. */
export function inspect_zip_directory(bytes) {
  let end = bytes.length - 22;
  const floor = Math.max(0, bytes.length - 65_557);
  while (end >= floor && (bytes.readUInt32LE(end) !== 0x06054b50
    || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)) end--;
  if (end < floor) throw new Error("zip_directory_missing");
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error("multipart_zip_unsupported");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  if (count === 65_535 || offset === 0xffffffff) throw new Error("zip64_requires_explicit_adapter");
  const names = new Set();
  const entries = [];
  let total_size = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("invalid_zip_directory");
    const name_length = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + name_length).toString("utf8");
    if (names.has(name)) throw new Error(`duplicate_zip_member:${name}`);
    if (!name || name.startsWith("/") || name.includes("\\") || name.includes("\0")
      || name.split("/").some(segment => segment === ".." || segment === ".")) throw new Error("unsafe_zip_member_path");
    if (bytes.readUInt16LE(offset + 8) & 1) throw new Error("encrypted_zip_member_unsupported");
    const byte_size = bytes.readUInt32LE(offset + 24);
    total_size += byte_size;
    if (byte_size > 128 * 1024 * 1024 || total_size > 256 * 1024 * 1024 || count > 10_000) {
      throw new Error("archive_expansion_limit_exceeded");
    }
    names.add(name);
    entries.push({ name, byte_size });
    offset += 46 + name_length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return entries;
}

function escape_literal_controls(raw) {
  let quoted = false;
  let escaped = false;
  let output = "";
  for (const char of raw) {
    if (quoted && !escaped && char.charCodeAt(0) < 32) {
      output += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }
    output += char;
    if (!escaped && char === '"') quoted = !quoted;
    if (quoted && !escaped && char === "\\") escaped = true;
    else escaped = false;
  }
  return output;
}

/** Resynchronize at independently identified blocks; an incomplete first block cannot hide later ones. */
export function extract_native_json_blocks(text) {
  const starts = [...text.matchAll(/^\{\s*"([A-Za-z0-9_]+)"\s*:\s*\[/gm)];
  return starts.map((start, index) => {
    const raw = text.slice(start.index, starts[index + 1]?.index ?? text.length);
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let end = null;
    for (let position = 0; position < raw.length; position++) {
      const char = raw[position];
      if (!escaped && char === '"') quoted = !quoted;
      if (!quoted) {
        if (char === "{" || char === "[") depth++;
        if (char === "}" || char === "]") depth--;
        if (depth === 0) { end = position + 1; break; }
      }
      escaped = quoted && !escaped && char === "\\";
    }
    const fragment = end === null ? raw : raw.slice(0, end);
    const result = { block_index: index, start_offset: start.index, end_offset: start.index + fragment.length,
      raw_text: fragment, raw_sha256: source_sha256(fragment), state: "incomplete_or_malformed", decoded: null };
    if (end !== null) {
      try { result.decoded = JSON.parse(fragment); result.state = "strict_json"; }
      catch {
        try { result.decoded = JSON.parse(escape_literal_controls(fragment)); result.state = "literal_control_characters_retained"; }
        catch { /* Retain the raw fragment and the explicit hold. */ }
      }
    }
    return result;
  });
}

/** Parse only source observations. Neither source VERIFIED labels nor OCR authorize publication. */
export async function parse_corpus_docx(bytes, source_name, recognize_images = null) {
  const source_hash = source_sha256(bytes);
  const directory = inspect_zip_directory(bytes);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const result = { parser_version: DOCX_SOURCE_PARSER_VERSION, source_name, source_sha256: source_hash,
    publication_state: "governed_non_public", observations: [], resources: [], native_records: [], parts: [], holds: [] };
  const observe = (source_kind, source_locator, values, extra = {}) => {
    if (result.observations.length >= 200_000) throw new Error("document_observation_limit_exceeded");
    result.observations.push({ source_kind, source_locator, values, source_record_sha256: source_sha256(canonical_source_json(values)),
      review_state: "source_observation", ...extra });
  };
  for (const entry of directory) {
    if (entry.name.endsWith("/")) continue;
    const part = await zip.file(entry.name)?.async("nodebuffer");
    if (!part || part.length !== entry.byte_size) throw new Error("docx_part_size_mismatch");
    result.parts.push({ part_path: entry.name, byte_size: part.length, sha256: source_sha256(part),
      role: entry.name.startsWith("word/media/") ? "embedded_media" : "package_part" });
  }
  const document_xml = await zip.file("word/document.xml")?.async("text");
  if (!document_xml) throw new Error("docx_document_part_missing");
  let document;
  try { document = xml_tree(document_xml); }
  catch (error) {
    result.holds.push({ code: "malformed_document_xml", detail: String(error.message), part_path: "word/document.xml" });
    observe("docx_unparsed_xml", "docx:word/document.xml", { raw_xml: document_xml }, { review_state: "held_malformed_xml" });
    return result;
  }
  if (!descendants(document, "body").length) throw new Error("docx_word_body_or_namespace_unsupported");
  for (const part of result.parts) {
    if (!/^word\/(header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(part.part_path)) continue;
    const raw_xml = await zip.file(part.part_path).async("text");
    observe("docx_auxiliary_part", `docx:part:${part.part_path}`, { part_path: part.part_path, raw_xml });
    try {
      const auxiliary = xml_tree(raw_xml);
      for (const [index, node] of descendants(auxiliary, "p").entries()) {
        observe("docx_auxiliary_paragraph", `docx:part:${part.part_path}:paragraph:${index}`, { text: word_text(node) });
      }
    } catch (error) { result.holds.push({ code: "malformed_auxiliary_xml", part_path: part.part_path, detail: String(error.message) }); }
  }
  const resource_map = new Map();
  for (const [table_index, table] of descendants(document, "tbl").entries()) {
    const rows = table.children.filter(node => node.local === "tr" && node.uri === WORD_NAMESPACE)
      .map(row => row.children.filter(node => node.local === "tc" && node.uri === WORD_NAMESPACE)
        .map(cell => descendants(cell, "p").map(word_text).join("\n").trim()));
    observe("docx_table_receipt", `docx:table:${table_index}`, { table_index, row_count: rows.length });
    const headers = rows[0] || [];
    const metadata = headers.includes("resource_id");
    const seen_ids = new Set();
    for (const [row_index, cells] of rows.entries()) {
      const source_locator = `docx:table:${table_index}:row:${row_index}`;
      observe("docx_table_row", source_locator, { cells, row_role: row_index === 0 && metadata ? "header" : "source_row" });
      if (!metadata || row_index === 0) continue;
      if (cells.length !== headers.length || new Set(headers).size !== headers.length) {
        result.holds.push({ code: "metadata_table_cardinality", source_locator }); continue;
      }
      const record = Object.fromEntries(headers.map((key, index) => [key, cells[index]]));
      if (!record.resource_id) {
        result.holds.push({ code: "missing_or_duplicate_resource_id", source_locator }); continue;
      }
      const duplicate_id = seen_ids.has(record.resource_id);
      if (duplicate_id) result.holds.push({ code: "missing_or_duplicate_resource_id", source_locator, resource_id: record.resource_id });
      seen_ids.add(record.resource_id);
      const prior = resource_map.get(record.resource_id) || { record: {}, source_locators: [], conflicts: [] };
      if (duplicate_id) prior.duplicate_id = true;
      for (const [key, value] of Object.entries(record)) {
        if (key in prior.record && prior.record[key] !== value) prior.conflicts.push({ field: key, values: [prior.record[key], value] });
        else prior.record[key] = value;
      }
      prior.source_locators.push(source_locator);
      resource_map.set(record.resource_id, prior);
    }
  }
  for (const value of resource_map.values()) {
    result.resources.push(value.record);
    if (value.conflicts.length) result.holds.push({ code: "resource_field_conflict", resource_id: value.record.resource_id, conflicts: value.conflicts });
    observe("sais_resource_source", `docx:resource:${value.record.resource_id}`, value.record,
      { source_record_id: value.record.resource_id, source_locators: value.source_locators,
        review_state: value.duplicate_id ? "held_duplicate_resource_id" : value.conflicts.length ? "held_field_conflict" : "source_observation" });
  }
  const paragraphs = descendants(document, "p");
  for (const [paragraph_index, paragraph] of paragraphs.entries()) {
    observe("docx_paragraph", `docx:paragraph:${paragraph_index}`, { text: word_text(paragraph), paragraph_index });
  }
  const native_text = paragraphs.map(word_text).join("\n");
  for (const block of extract_native_json_blocks(native_text)) {
    observe("docx_native_block", `docx:native_block:${block.block_index}`, block);
    if (!block.decoded) { result.holds.push({ code: "incomplete_native_block", block_index: block.block_index }); continue; }
    for (const [family, records] of Object.entries(block.decoded)) {
      if (!Array.isArray(records)) continue;
      for (const [record_index, record] of records.entries()) {
        result.native_records.push({ family, record, block_index: block.block_index, record_index });
        observe("docx_native_record", `docx:native_block:${block.block_index}:${family}:${record_index}`, record,
          { source_relation: family, source_record_id: record.resource_id || record.uuid || record.id || null,
            normalization: block.state });
      }
    }
  }
  if (/Pipeline Key:\s*[a-z0-9_]+/.test(native_text)) {
    try {
      const candidate = compile_pipeline_dossier_items({ items: parse_docx_document_xml(document_xml),
        source_filename: source_name, source_sha256: source_hash, document_xml_sha256: source_sha256(document_xml) });
      observe("pipeline_dossier_review_candidate", "docx:pipeline_dossier", candidate, { review_state: "review_candidate_only" });
    } catch (error) { result.holds.push({ code: "pipeline_compiler_hold", detail: String(error.message) }); }
  }
  const relationships = new Map();
  const relation_xml = await zip.file("word/_rels/document.xml.rels")?.async("text");
  if (relation_xml) {
    const relation_root = xml_tree(relation_xml);
    for (const node of descendants(relation_root, "Relationship", "http://schemas.openxmlformats.org/package/2006/relationships")) {
      relationships.set(attribute(node, "Id"), { target: attribute(node, "Target"), mode: attribute(node, "TargetMode") });
    }
  }
  const anchors = new Map();
  for (const [paragraph_index, paragraph] of paragraphs.entries()) {
    for (const blip of descendants(paragraph, "blip", DRAWING_NAMESPACE)) {
      const relation_id = attribute(blip, "embed", RELATIONSHIP_NAMESPACE);
      const relationship = relationships.get(relation_id);
      if (!relationship || relationship.mode === "External") {
        result.holds.push({ code: "unresolved_image_relationship", paragraph_index, relation_id }); continue;
      }
      const part_path = relationship.target.startsWith("/") ? relationship.target.slice(1) : posix.normalize(`word/${relationship.target}`);
      const existing = anchors.get(part_path) || [];
      existing.push({ paragraph_index, relationship_id: relation_id }); anchors.set(part_path, existing);
      if (!zip.file(part_path)) result.holds.push({ code: "image_part_missing", part_path, paragraph_index });
    }
  }
  let recognized = new Map();
  const media = result.parts.filter(part => part.role === "embedded_media");
  if (media.length && recognize_images) {
    try { recognized = await recognize_images(bytes, source_hash); }
    catch (error) { result.holds.push({ code: "image_ocr_failed", detail: String(error.message) }); }
  }
  for (const part of media) {
    const ocr = recognized.get(part.part_path);
    observe("docx_embedded_image", `docx:part:${part.part_path}`, { ...part, anchors: anchors.get(part.part_path) || [],
      ocr_text: ocr?.text ?? null, ocr_engine: ocr?.engine ?? null, completeness: "unverified",
      publication_state: "governed_non_public" }, { review_state: ocr ? "unverified_ocr" : "held_ocr_unavailable" });
    result.holds.push({ code: ocr ? "image_requires_source_review" : "image_ocr_unavailable", part_path: part.part_path });
  }
  // Each byte-bearing part has a receipt even when its content needs another adapter.
  observe("docx_package_receipt", "docx:package", { parts: result.parts, holds: result.holds,
    resource_count: result.resources.length, native_record_occurrences: result.native_records.length });
  return result;
}
