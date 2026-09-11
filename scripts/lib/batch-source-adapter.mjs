import { extname } from "node:path";
import JSZip from "jszip";
import { parse_corpus_docx, inspect_zip_directory, source_sha256, canonical_source_json } from "./corpus-docx-source.mjs";

export const BATCH_SOURCE_PARSER_VERSION = "batch_source_adapter_v1.0.0";

function parse_csv(text) {
  const rows = [];
  let row = [], value = "", quoted = false, closed = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (char === ",") { row.push(value); value = ""; closed = false; }
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(value); rows.push(row); row = []; value = ""; closed = false;
    } else {
      if (closed || char === '"') throw new Error("invalid_csv_quoting");
      value += char;
    }
  }
  if (quoted) throw new Error("unterminated_csv_field");
  if (row.length || value || closed) { row.push(value); rows.push(row); }
  return rows;
}

export async function parse_batch_source(bytes, source_name, recognize_images = null, depth = 0) {
  if (depth > 5) throw new Error("nested_archive_depth_exceeded");
  const source_hash = source_sha256(bytes);
  const extension = extname(source_name).toLowerCase();
  if (extension === ".docx") return parse_corpus_docx(bytes, source_name, recognize_images);
  const result = { parser_version: BATCH_SOURCE_PARSER_VERSION, source_name, source_sha256: source_hash,
    publication_state: "governed_non_public", observations: [], holds: [], parts: [] };
  const observe = (source_kind, source_locator, values, extra = {}) => result.observations.push({
    source_kind, source_locator, values, source_record_sha256: source_sha256(canonical_source_json(values)),
    review_state: "source_observation", ...extra,
  });
  if (extension === ".zip") {
    const entries = inspect_zip_directory(bytes);
    const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const member_bytes = new Map();
    for (const entry of entries) {
      if (entry.name.endsWith("/")) {
        observe("archive_directory", `zip:${entry.name}`, { member_path: entry.name }); continue;
      }
      const member = await archive.file(entry.name)?.async("nodebuffer");
      if (!member || member.length !== entry.byte_size) throw new Error("archive_member_size_mismatch");
      member_bytes.set(entry.name, member);
      const receipt = { member_path: entry.name, sha256: source_sha256(member), byte_size: member.length };
      result.parts.push(receipt);
      observe("archive_member_receipt", `zip:${entry.name}`, receipt);
      try {
        const parsed = await parse_batch_source(member, entry.name, recognize_images, depth + 1);
        for (const row of parsed.observations) result.observations.push({ ...row,
          source_locator: `zip:${entry.name}!${row.source_locator}`,
          member_path: row.member_path ? `${entry.name}!${row.member_path}` : entry.name,
          member_sha256: row.member_sha256 || receipt.sha256 });
        result.holds.push(...parsed.holds.map(hold => ({ ...hold, member_path: entry.name })));
      } catch (error) { result.holds.push({ code: "archive_member_parse_failed", member_path: entry.name, detail: String(error.message) }); }
    }
    for (const [name, raw] of member_bytes) {
      if (/(^|\/)manifest\.json$/i.test(name)) {
        const manifest = JSON.parse(raw.toString("utf8"));
        for (const entry of [...(Array.isArray(manifest.included_files) ? manifest.included_files : []),
          ...(Array.isArray(manifest.files) ? manifest.files : [])]) {
          const path = entry.relative_path || entry.filename || entry.file_name;
          if (typeof path !== "string" || !/^[a-f0-9]{64}$/i.test(entry.sha256 || "")) {
            result.holds.push({ code: "manifest_entry_unsupported", manifest_path: name }); continue;
          }
          const relative_path = name.slice(0, name.lastIndexOf("/") + 1) + path.replace(/^\.\//, "");
          const target = member_bytes.get(path) || member_bytes.get(relative_path);
          const actual_sha256 = target ? source_sha256(target) : null;
          const receipt = { manifest_path: name, member_path: path, expected_sha256: entry.sha256, actual_sha256,
            expected_bytes: entry.bytes ?? null, actual_bytes: target?.length ?? null };
          observe("archive_manifest_entry", `zip:${name}:${path}`, receipt);
          if (actual_sha256 !== entry.sha256.toLowerCase() || (entry.bytes !== undefined && entry.bytes !== target?.length)) {
            result.holds.push({ code: "archive_manifest_mismatch", ...receipt });
          }
        }
      }
      if (!/(^|\/)SHA256SUMS(?:\.txt)?$/i.test(name)) continue;
      for (const line of raw.toString("utf8").split(/\r?\n/).filter(Boolean)) {
        const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
        if (!match) { result.holds.push({ code: "checksum_line_unsupported", member_path: name, raw_text: line }); continue; }
        const relative_path = name.slice(0, name.lastIndexOf("/") + 1) + match[2].replace(/^\.\//, "");
        const target = member_bytes.get(match[2]) || member_bytes.get(relative_path);
        const actual_sha256 = target ? source_sha256(target) : null;
        observe("archive_checksum", `zip:${name}:${match[2]}`, { member_path: match[2], expected_sha256: match[1], actual_sha256 });
        if (actual_sha256 !== match[1].toLowerCase()) result.holds.push({ code: "archive_checksum_mismatch", member_path: match[2] });
      }
    }
    if (result.holds.some(hold => ["archive_manifest_mismatch", "archive_checksum_mismatch", "manifest_entry_unsupported"].includes(hold.code))) {
      for (const observation of result.observations) observation.review_state = "held_archive_integrity";
    }
    return result;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  const add_json = (value, location) => {
    if (Array.isArray(value)) {
      value.forEach((record, index) => add_json(record, `${location}/${index}`));
      if (!value.length) observe("json_empty_array", location, { value });
    } else if (value && typeof value === "object") {
      // Preserve the entire record, including mixed metadata and arrays.
      observe("json_source_record", location, value, { source_record_id: value.resource_id || value.uuid || value.id || null });
      if (!value.resource_id && !value.uuid && !value.id) {
        for (const [key, child] of Object.entries(value)) {
          if (Array.isArray(child)) add_json(child, `${location}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
        }
      }
    } else observe("json_source_value", location, { value });
  };
  if (extension === ".json" || [".ndjson", ".jsonl"].includes(extension)) {
    observe("json_source_document", "json:source", { raw_text: text });
    if (extension === ".json") add_json(JSON.parse(text), "json:");
    else {
      for (const [line_index, line] of text.split(/\r?\n/).entries()) {
        if (!line.trim()) continue;
        try { add_json(JSON.parse(line), `jsonl:line:${line_index + 1}`); }
        catch (error) {
          observe("json_unparsed_line", `jsonl:line:${line_index + 1}`, { raw_text: line }, { review_state: "held_parse_error" });
          result.holds.push({ code: "invalid_json_line", line: line_index + 1, detail: String(error.message) });
        }
      }
    }
  } else if (extension === ".csv") {
    const rows = parse_csv(text);
    const headers = rows[0] || [];
    if (!headers.length || headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error("invalid_csv_headers");
    observe("csv_header", "csv:row:1", { headers });
    for (const [index, cells] of rows.slice(1).entries()) {
      const valid = cells.length === headers.length;
      observe("csv_source_row", `csv:row:${index + 2}`, valid ? Object.fromEntries(headers.map((key, index) => [key, cells[index]])) : { cells },
        { review_state: valid ? "source_observation" : "held_cardinality" });
      if (!valid) result.holds.push({ code: "csv_cardinality_mismatch", row: index + 2 });
    }
  } else if (extension === ".sql") {
    observe("sql_preserved_source", "sql:source", { raw_sql: text, execution_allowed: false }, { review_state: "held_sql_source_only" });
    result.holds.push({ code: "sql_requires_structured_adapter", source_sha256: source_hash });
  } else if (["", ".md", ".txt", ".html", ".mjs"].includes(extension)) {
    observe("document_source_text", "text:source", { text, source_extension: extension, execution_allowed: false });
  } else {
    observe("unsupported_source_receipt", "source:receipt", { byte_size: bytes.length, sha256: source_hash, extension }, { review_state: "held_unsupported_format" });
    result.holds.push({ code: "unsupported_source_format", extension });
  }
  return result;
}
