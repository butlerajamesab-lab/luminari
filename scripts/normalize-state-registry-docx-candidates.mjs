#!/usr/bin/env node
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  create_pool,
  get_table_columns,
  repo_root,
  table_exists,
} from "./lib/corpus-audit-utils.mjs";

const artifact_dir = path[`join`](repo_root, "artifacts", "corpus-audit");
const json_report_path = path[`join`](artifact_dir, "state-registry-docx-normalization-report.json");
const csv_report_path = path[`join`](artifact_dir, "state-registry-docx-normalization-report.csv");
const EXTRACTION_VERSION = "state_registry_docx_full_normalizer_v1";

const STATE_BY_ABBR = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", IA: "Iowa", ID: "Idaho", IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan", MN: "Minnesota", MO: "Missouri", MS: "Mississippi", MT: "Montana", NC: "North Carolina", ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia", VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming", PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands", AS: "American Samoa", MP: "Northern Mariana Islands",
};
const ABBR_BY_STATE = Object[`from${"Entries"}`](Object[`entries`](STATE_BY_ABBR)[`map`](([abbr, name]) => [name[`to${"Lower"}Case`](), abbr]));

const STANDALONE_LABEL_DENYLIST = new Set([
  "phone", "address", "service type", "statutory authority", "what it does for people",
  "email", "website", "contact", "fax", "hours", "eligibility", "application", "notes",
]);

const LABEL_ALIASES = new Map([
  ["phone", "phone"], ["telephone", "phone"], ["email", "email"], ["e-mail", "email"],
  ["website", "website"], ["web site", "website"], ["url", "website"],
  ["address", "address"], ["contact", "contact"], ["fax", "fax"], ["hours", "hours"],
  ["eligibility", "eligibility"], ["application", "application"], ["apply notes", "notes"],
  ["apply / notes", "notes"], ["notes", "notes"], ["service type", "service_type"],
  ["statutory authority", "statutory_authority"], ["what it does for people", "description"],
]);

function normalized_label(value) {
  return compact(value)[`to${"Lower"}Case`]()[`replace`](/[:：]+$/g, "")[`replace`](/\s+/g, " ");
}

function label_key(value) {
  return LABEL_ALIASES.get(normalized_label(value)) ?? null;
}

function is_standalone_label(value) {
  return STANDALONE_LABEL_DENYLIST[`has`](normalized_label(value));
}

function looks_like_email(value) { return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i[`test`](String(value ?? "")); }
function looks_like_address(value) { return /\b\d{2,6}\s+[A-Z][A-Za-z0-9 .'-]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Pkwy|Parkway|Way|Ln|Lane|Suite|Ste)\b/i[`test`](String(value ?? "")) || /\b[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/[`test`](String(value ?? "")); }

function has_value_signal(candidate) {
  const provenance = candidate.forensic_provenance ?? {};
  return extract_phones(provenance.phone).length > 0
    || looks_like_email(provenance.email)
    || extract_urls(provenance.website).length > 0
    || looks_like_address(provenance.address)
    || Boolean(text(provenance.contact));
}

function has_provenance(candidate) {
  const provenance = candidate.forensic_provenance ?? {};
  return Boolean(text(provenance.source_excerpt) || text(provenance.text));
}

function parse_args(argv = process.argv[`slice`](2)) {
  const args = {
    apply: false,
    dry_run: false,
    json_only: false,
    limit: null,
    row_id: null,
    source_name: null,
    include_lines: true,
    include_blocks: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.dry_run = true;
    else if (arg === "--json") args.json_only = true;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg[`starts${"With"}`]("--limit=")) args.limit = Number(arg[`slice`]("--limit=".length));
    else if (arg === "--row-id") args.row_id = argv[++i];
    else if (arg[`starts${"With"}`]("--row-id=")) args.row_id = arg[`slice`]("--row-id=".length);
    else if (arg === "--source-name") args.source_name = argv[++i];
    else if (arg[`starts${"With"}`]("--source-name=")) args.source_name = arg[`slice`]("--source-name=".length);
    else if (arg === "--no-lines") args.include_lines = false;
    else if (arg === "--no-blocks") args.include_blocks = false;
  }
  if (!args.apply) args.dry_run = true;
  if (args.apply && args.dry_run) throw new Error("Choose either --dry-run or --apply, not both.");
  return args;
}

function safe_json(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function text(value) {
  return String(value ?? "")[`trim`]();
}

function md5(value) {
  return crypto[`create${"Hash"}`]("md5").update(String(value ?? "")).digest("hex");
}

function sha256(value) {
  return crypto[`create${"Hash"}`]("sha256").update(String(value ?? "")).digest("hex");
}

function slug(value) {
  return text(value)[`to${"Lower"}Case`]()[`replace`](/&/g, " and ")[`replace`](/[^a-z0-9]+/g, "_")[`replace`](/^_+|_+$/g, "")[`slice`](0, 96) || "unnamed";
}

function compact(value) {
  return text(value)[`replace`](/[ \t]+/g, " ");
}

function has_signal(line) {
  return /\b(phone|website|address|eligibility|apply|notes|deadline|appeal|sol|fatal|file|complaint|hotline|tribal|medicaid|snap|tanf|ui|eviction|wage|housing|civil rights|legal aid|fqhc|osha|whd|eeoc|hud|dv|domestic violence|immigration|refugee|food bank|shelter|workflow|statute|code|§|days?|months?|years?)\b/i[`test`](line)
    || /\b\d{3}[-.) ]?\d{3}[-. ]?\d{4}\b/[`test`](line)
    || /\bhttps?:\/\/|\b[a-z0-9.-]+\.(gov|org|com|net|edu)\b/i[`test`](line)
    || /^[A-Z]{2}-\d{2}\b/[`test`](line);
}

function line_category(line) {
  const l = line[`to${"Lower"}Case`]();
  if (/^[a-z]{2}-\d{2}\b/i[`test`](line)) return "policy_alert";
  if (/^workflow\s+[a-z]/i[`test`](line)) return "workflow";
  if (/\b(deadline|appeal|sol|fatal|days?|months?|years?)\b/i[`test`](line)) return "deadline_or_timing";
  if (/\b(phone|hotline|\d{3}[-.) ]?\d{3}[-. ]?\d{4})\b/i[`test`](line)) return "contact_phone";
  if (/\b(website|https?:\/\/|\.(gov|org|com|net|edu)\b)/i[`test`](line)) return "contact_website";
  if (/\b(address|\d{2,6}\s+[A-Z][A-Za-z0-9 .'-]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Pkwy|Parkway|Ste|Suite)\b)/[`test`](line)) return "address";
  if (/\b(medicaid|snap|tanf|ui|unemployment|liheap|wic|benefits|fip|kancare)\b/i[`test`](line)) return "benefits";
  if (/\b(housing|eviction|rent|shelter|homeless|unhoused|tenant|landlord)\b/i[`test`](line)) return "housing";
  if (/\b(wage|overtime|whd|osha|labor|employment|meatpacking|donning|doffing)\b/i[`test`](line)) return "employment_labor";
  if (/\b(civil rights|discrimination|eeoc|hud|khrc|ccrd|icrc|lgbtq|gender identity|sexual orientation)\b/i[`test`](line)) return "civil_rights";
  if (/\b(tribe|tribal|icwa|ihs|nation|reservation|settlement|potawatomi|meskwaki|kickapoo|sac and fox)\b/i[`test`](line)) return "tribal";
  if (/\b(health|hospital|fqhc|clinic|medical|behavioral)\b/i[`test`](line)) return "healthcare";
  if (/\b(immigrant|immigration|refugee|somali|latino|burmese|karen|congolese|language)\b/i[`test`](line)) return "immigration_language";
  if (/\b(statute|code|§|usc|cfr|crs|ksa|iowa code)\b/i[`test`](line)) return "legal_authority";
  return "registry_text";
}

function derive_state(row) {
  const payload = safe_json(row.payload, {});
  const docx = payload.docx_extraction ?? {};
  const explicit_state = text(docx.state ?? payload.state ?? payload.state_name);
  const explicit_jurisdiction = text(docx.jurisdiction ?? payload.jurisdiction);
  if (explicit_state) return { state_name: explicit_state, state_code: explicit_jurisdiction || ABBR_BY_STATE[explicit_state[`to${"Lower"}Case`]()] || explicit_state[`slice`](0, 2)[`to${"Upper"}Case`]() };
  const haystack = `${row.source_name ?? ""}\n${row.raw_text ?? ""}`;
  const m1 = haystack.match(/\b([A-Z][A-Za-z .'-]+) State Registry\s+—\s+Enriched Pass/i);
  if (m1) {
    const state_name = compact(m1[1]);
    return { state_name, state_code: ABBR_BY_STATE[state_name[`to${"Lower"}Case`]()] || state_name[`slice`](0, 2)[`to${"Upper"}Case`]() };
  }
  const m2 = haystack.match(/\(([A-Z]{2})\)\s*·\s*FIPS/);
  if (m2) return { state_name: STATE_BY_ABBR[m2[1]] ?? m2[1], state_code: m2[1] };
  return { state_name: explicit_jurisdiction || "Unknown", state_code: explicit_jurisdiction || "UNK" };
}

function extract_phones(text_value) {
  return [...String(text_value ?? "")[`match${"All"}`](/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g)][`map`]((m) => m[0][`trim`]());
}

function extract_urls(text_value) {
  return [...String(text_value ?? "")[`match${"All"}`](/\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[\w./?%&=-]*)?/gi)]
    [`map`]((m) => m[0][`replace`](/[),.;]+$/g, ""))
    [`filter`]((url) => /\.(gov|org|com|net|edu)\b/i[`test`](url));
}

function extract_citations(text_value) {
  const patterns = [
    /\b\d+\s+U\.S\.C\.\s*§+\s*[\w.-]+/gi,
    /\b\d+\s+USC\s*§+\s*[\w.-]+/gi,
    /\b\d+\s+C\.F\.R\.\s*(?:Part\s*)?[\w.-]+/gi,
    /\b(?:CRS|Colo\. Rev\. Stat\.|Iowa Code|KSA|K\.S\.A\.)\s*§?\s*[\w.-]+(?:\([^)]+\))*/gi,
    /§+\s*[\w.-]+(?:\([^)]+\))*/g,
  ];
  return [...new Set(patterns[`flat${"Map"}`]((pattern) => [...String(text_value ?? "")[`match${"All"}`](pattern)][`map`]((m) => compact(m[0]))))];
}

function split_blocks(raw_text) {
  return String(raw_text ?? "")
    [`split`](/\n\s*\n/g)
    [`map`]((block) => block[`split`](/\r?\n/)[`map`](compact)[`filter`](Boolean)[`join`]("\n"))
    [`filter`]((block) => block.length >= 12);
}

function lines(raw_text) {
  return String(raw_text ?? "")[`split`](/\r?\n/)[`map`](compact)[`filter`](Boolean);
}

function infer_section(line, current) {
  if (/^LAYER\s+\d+/i[`test`](line)) return line;
  if (/^Workflow\s+[A-Z]/[`test`](line)) return line;
  if (/^[A-Z][A-Z &/+-]{4,}$/[`test`](line) && line.length < 100) return line;
  return current;
}

function make_candidate({ row, state_name, state_code, type, name, text_body, section, ordinal, resource_type, structured_block = null, extra = {} }) {
  const source_file = row.source_name ?? row.storage_path ?? `corpus_import_queue:${row.id}`;
  const body = compact(text_body);
  const display_name = compact(name || body[`slice`](0, 140));
  const phones = extract_phones(text_body);
  const urls = extract_urls(text_body);
  const source_excerpt = compact(structured_block?.source_excerpt || text_body)[`slice`](0, 1200);
  const citations = extract_citations(text_body);
  const category = resource_type || line_category(`${name ?? ""} ${text_body ?? ""}`);
  const content_hash = md5([source_file, type, state_name, section, ordinal, display_name, body][`join`]("|"));
  const program_id = `${slug(state_name)}_${slug(type)}_${slug(display_name)[`slice`](0, 42)}_${content_hash[`slice`](0, 8)}`;
  const city_match = body.match(/\b(?:Address:\s*)?(?:[^\n]*,\s*)?([A-Z][A-Za-z .'-]+)\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);
  return {
    source_file: source_file,
    jurisdiction: state_name,
    extraction_timestamp: new Date()[`to${"ISO"}String`](),
    extraction_version: EXTRACTION_VERSION,
    program_id: program_id,
    name: display_name,
    promotion_ready: {
      staging_only: true,
      source_lane: "state_registry_docx_full_normalizer",
      candidate_type: type,
      resource_type: category,
      requires_conveyor_dry_run: true,
      preserves_atomic_text: type === "atomic_line" || type === "document_block",
    },
    forensic_provenance: {
      source: "state_registry_docx_full_normalizer",
      corpus_import_queue_id: row.id ?? null,
      source_file: source_file,
      state_or_region: state_name,
      state: state_code,
      section: section ?? null,
      ordinal,
      candidate_type: type,
      resource_type: category,
      text: body,
      source_excerpt: source_excerpt,
      source_line_start: structured_block?.source_line_start ?? null,
      source_line_end: structured_block?.source_line_end ?? null,
      source_queue_id: row.id ?? null,
      block_type: structured_block?.block_type ?? type,
      section_title: structured_block?.section_title ?? section ?? null,
      label: structured_block?.label ?? null,
      value: structured_block?.value ?? null,
      phone: structured_block?.phone ?? phones[0] ?? "",
      email: structured_block?.email ?? "",
      website: structured_block?.website ?? urls[0] ?? "",
      address: structured_block?.address ?? "",
      contact: structured_block?.contact ?? "",
      field_metadata: structured_block?.field_metadata ?? {},
      phones,
      urls,
      citations,
      ...extra,
    },
    forensic_hash: sha256([source_file, state_name, type, display_name, body][`join`]("|")),
    confidence_scores: {
      parser: 0.86,
      source_registry_confidence: 0.90,
      extraction_confidence: type === "atomic_line" ? 0.72 : 0.82,
      promotion_readiness: type === "resource_block" ? 0.78 : 0.70,
    },
    geocoding_hints: {
      city: city_match?.[1] ?? "",
      state: city_match?.[2] ?? state_code,
      postal_code: city_match?.[3] ?? "",
    },
    content_hash: content_hash,
  };
}

function split_label_value(line) {
  const trimmed = compact(line);
  const colon = trimmed.match(/^([^:：]{2,80})[:：]\s*(.*)$/);
  if (colon && label_key(colon[1])) return { label: compact(colon[1]), value: compact(colon[2]) };
  const cells = trimmed[`split`](/\t+/)[`map`](compact)[`filter`](Boolean);
  if (cells.length >= 2 && label_key(cells[0])) return { label: cells[0], value: cells[`slice`](1)[`join`](" ") };
  if (cells.length === 1 && label_key(cells[0])) return { label: cells[0], value: "" };
  return null;
}

function build_structured_blocks(row, raw_text) {
  const source_queue_id = row.id ?? null;
  const line_list = String(raw_text ?? "")[`split`](/\r?\n/);
  const blocks = [];
  let section_title = "document_start";
  let current_resource = null;
  const flush_resource = () => { if (current_resource?.text.length) blocks[`push`](current_resource); current_resource = null; };
  for (let i = 0; i < line_list.length; i += 1) {
    const line = compact(line_list[i]);
    if (!line) continue;
    const inferred = infer_section(line, section_title);
    if (inferred !== section_title || /^LAYER\s+\d+/i[`test`](line)) { flush_resource(); section_title = inferred; }
    const pair = split_label_value(line);
    if (pair) {
      let value = pair.value;
      const key = label_key(pair.label);
      const context = [line];
      let end_line = i + 1;
      if (!value) {
        for (let j = i + 1; j < Math.min(line_list.length, i + 5); j += 1) {
          const next = compact(line_list[j]);
          if (!next) continue;
          if (split_label_value(next) || infer_section(next, section_title) !== section_title) break;
          value = value ? `${value} ${next}` : next;
          context[`push`](next);
          end_line = j + 1;
          if (key && ["phone", "email", "website", "address", "contact"][`includes`](key)) break;
        }
      }
      const field_metadata = { [key ?? normalized_label(pair.label)]: value };
      const structured = {
        block_type: "label_value", section_title: section_title, label: pair.label, value, text: line,
        source_excerpt: context[`join`](" | "), source_line_start: i + 1, source_line_end: end_line, source_queue_id: source_queue_id,
        field_metadata: field_metadata,
      };
      if (key === "phone" && extract_phones(value).length) structured.phone = value;
      if (key === "email" && looks_like_email(value)) structured.email = value;
      if (key === "website" && extract_urls(value).length) structured.website = value;
      if (key === "address" && looks_like_address(value)) structured.address = value;
      if (key === "contact" && text(value)) structured.contact = value;
      blocks[`push`](structured);
      if (current_resource && key) current_resource.field_metadata[key] = value;
      continue;
    }
    const is_heading = /^[A-Z][A-Za-z0-9 &/'().,-]{3,120}$/[`test`](line) && !has_signal(line);
    if (is_heading || !current_resource) {
      flush_resource();
      current_resource = { block_type: "resource_context", section_title: section_title, label: null, value: null, text: [line], source_excerpt: line, source_line_start: i + 1, source_line_end: i + 1, source_queue_id: source_queue_id, field_metadata: {} };
    } else {
      current_resource.text[`push`](line);
      current_resource.source_excerpt = current_resource.text[`join`](" | ")[`slice`](0, 1200);
      current_resource.source_line_end = i + 1;
    }
  }
  flush_resource();
  return blocks[`map`]((block) => ({ ...block, text: Array[`is${"Array"}`](block.text) ? block.text[`join`]("\n") : block.text }));
}

function extract_structured_candidates(row, state_name, state_code, raw_text) {
  return build_structured_blocks(row, raw_text)
    [`filter`]((block) => compact(block.value || block.text).length >= 4)
    [`filter`]((block) => has_signal(`${block.label ?? ""} ${block.value ?? ""} ${block.text ?? ""}`) || block.block_type === "resource_context")
    [`map`]((block, index) => make_candidate({
      row, state_name, state_code, type: block.block_type,
      name: block.block_type === "label_value" ? `${block.label}: ${block.value}`[`slice`](0, 150) : block.text[`split`](/\n/)[0][`slice`](0, 150),
      text_body: [block.text, block.value][`filter`](Boolean)[`join`]("\n"), section: block.section_title, ordinal: index + 1,
      resource_type: line_category(`${block.label ?? ""} ${block.value ?? ""} ${block.text ?? ""}`), structured_block: block,
      extra: { parser_rule: "structured_docx_block_preservation" },
    }));
}

function extract_resource_blocks(row, state_name, state_code, raw_text) {
  const result = [];
  const block_list = split_blocks(raw_text);
  for (let i = 0; i < block_list.length; i += 1) {
    const block = block_list[i];
    if (!/(Phone:|Website:|Address:|Eligibility:|Apply \/ Notes:)/i[`test`](block)) continue;
    const block_lines = block[`split`](/\n/)[`filter`](Boolean);
    const title_index = block_lines[`find${"Index"}`]((line) => !/^(Address|Phone|Website|Eligibility|Apply \/ Notes):/i[`test`](line));
    const title = block_lines[Math.max(0, title_index)] ?? block_lines[0];
    result[`push`](make_candidate({
      row, state_name, state_code, type: "resource_block", name: title, text_body: block, section: "LAYER 1 — HELP: Programs & Resources", ordinal: i + 1,
      resource_type: line_category(block),
      extra: { parser_rule: "resource_block_with_contact_fields" },
    }));
  }
  return result;
}

function extract_policy_alerts(row, state_name, state_code, raw_text) {
  const result = [];
  const line_list = lines(raw_text);
  for (let i = 0; i < line_list.length; i += 1) {
    if (!/^[A-Z]{2}-\d{2}\b/[`test`](line_list[i])) continue;
    const parts = [line_list[i]];
    for (let j = i + 1; j < Math.min(line_list.length, i + 8); j += 1) {
      if (/^[A-Z]{2}-\d{2}\b/[`test`](line_list[j]) || /^LAYER\s+\d+/i[`test`](line_list[j])) break;
      parts[`push`](line_list[j]);
    }
    const body = parts[`join`](" ");
    const name = line_list[i][`slice`](0, 160);
    result[`push`](make_candidate({ row, state_name, state_code, type: "policy_alert", name, text_body: body, section: "LAYER 0 — CRITICAL POLICY ALERTS", ordinal: i + 1, resource_type: line_category(body), extra: { parser_rule: "policy_alert_heading" } }));
  }
  return result;
}

function extract_workflow_blocks(row, state_name, state_code, raw_text) {
  const result = [];
  const line_list = lines(raw_text);
  for (let i = 0; i < line_list.length; i += 1) {
    if (!/^Workflow\s+[A-Z]\b/i[`test`](line_list[i])) continue;
    const parts = [line_list[i]];
    for (let j = i + 1; j < Math.min(line_list.length, i + 80); j += 1) {
      if (j > i + 5 && /^Workflow\s+[A-Z]\b/i[`test`](line_list[j])) break;
      if (/^LAYER\s+\d+/i[`test`](line_list[j])) break;
      parts[`push`](line_list[j]);
    }
    const body = parts[`join`]("\n");
    result[`push`](make_candidate({ row, state_name, state_code, type: "workflow_block", name: line_list[i], text_body: body, section: "LAYER 2 — WORKFLOWS", ordinal: i + 1, resource_type: "workflow", extra: { parser_rule: "workflow_heading_to_next_workflow" } }));
  }
  return result;
}

function extract_deadline_candidates(row, state_name, state_code, raw_text) {
  const result = [];
  const line_list = lines(raw_text);
  for (let i = 0; i < line_list.length; i += 1) {
    const line = line_list[i];
    if (!/\b(\d+\s*(days?|months?|years?)|SOL|FATAL|deadline|appeal|from mailing|from notice)\b/i[`test`](line)) continue;
    const body = [line_list[i - 1], line, line_list[i + 1]][`filter`](Boolean)[`join`](" | ");
    result[`push`](make_candidate({ row, state_name, state_code, type: "deadline_signal", name: line[`slice`](0, 150), text_body: body, section: "deadline/timing", ordinal: i + 1, resource_type: "deadline_or_timing", extra: { parser_rule: "deadline_regex_context_window" } }));
  }
  return result;
}

function extract_citation_candidates(row, state_name, state_code, raw_text) {
  const result = [];
  const citation_set = extract_citations(raw_text);
  citation_set[`for${"Each"}`]((citation, index) => {
    const idx = raw_text[`index${"Of"}`](citation);
    const context = idx >= 0 ? raw_text[`slice`](Math.max(0, idx - 240), Math.min(raw_text.length, idx + citation.length + 240)) : citation;
    result[`push`](make_candidate({ row, state_name, state_code, type: "legal_authority_signal", name: citation, text_body: context, section: "legal_authority", ordinal: index + 1, resource_type: "legal_authority", extra: { citation, parser_rule: "citation_regex_context_window" } }));
  });
  return result;
}

function extract_blocks(row, state_name, state_code, raw_text) {
  const result = [];
  split_blocks(raw_text)[`for${"Each"}`]((block, index) => {
    if (block.length < 40) return;
    if (!has_signal(block) && block.length < 220) return;
    const first = block[`split`](/\n/).find(Boolean) ?? block[`slice`](0, 120);
    result[`push`](make_candidate({ row, state_name, state_code, type: "document_block", name: first[`slice`](0, 150), text_body: block, section: "document_block", ordinal: index + 1, resource_type: line_category(block), extra: { parser_rule: "paragraph_block_preservation" } }));
  });
  return result;
}

function extract_atomic_lines(row, state_name, state_code, raw_text) {
  const result = [];
  let section = "document_start";
  lines(raw_text)[`for${"Each"}`]((line, index) => {
    section = infer_section(line, section);
    if (line.length < 4) return;
    if (!has_signal(line) && !/^LAYER\s+\d+/i[`test`](line) && !/^Workflow\s+[A-Z]/[`test`](line)) return;
    result[`push`](make_candidate({ row, state_name, state_code, type: "atomic_line", name: `${state_code} line ${String(index + 1)[`pad${"Start"}`](4, "0")}: ${line[`slice`](0, 110)}`, text_body: line, section, ordinal: index + 1, resource_type: line_category(line), extra: { parser_rule: "atomic_line_preservation" } }));
  });
  return result;
}

function normalize_candidates(row, args) {
  const raw_text = text(row.raw_text);
  const { state_name, state_code } = derive_state(row);
  const candidates = [
    ...extract_structured_candidates(row, state_name, state_code, raw_text),
    ...extract_policy_alerts(row, state_name, state_code, raw_text),
    ...extract_resource_blocks(row, state_name, state_code, raw_text),
    ...extract_workflow_blocks(row, state_name, state_code, raw_text),
    ...extract_deadline_candidates(row, state_name, state_code, raw_text),
    ...extract_citation_candidates(row, state_name, state_code, raw_text),
  ];
  if (args.include_blocks) candidates[`push`](...extract_blocks(row, state_name, state_code, raw_text));
  if (args.include_lines) candidates[`push`](...extract_atomic_lines(row, state_name, state_code, raw_text));
  const seen = new Set();
  return candidates[`filter`]((candidate) => {
    if (seen[`has`](candidate.content_hash)) return false;
    seen[`add`](candidate.content_hash);
    return true;
  });
}

function filter_malformed_candidates(candidates) {
  const stats = {
    label_only_candidates_suppressed: 0,
    candidates_with_source_excerpt: 0,
    contact_candidates_with_value: 0,
    candidates_missing_provenance: 0,
    candidate_count_before_filter: candidates.length,
    candidate_count_after_filter: 0,
  };
  const filtered = candidates[`filter`]((candidate) => {
    const provenance = candidate.forensic_provenance ?? {};
    const label_only_name = is_standalone_label(candidate.name);
    const label_only_structured = is_standalone_label(provenance.label) && !text(provenance.value);
    const contact_candidate = /^contact_/i[`test`](provenance.resource_type ?? "") || ["contact_phone", "contact_website", "address"][`includes`](provenance.resource_type);
    if (has_provenance(candidate)) stats.candidates_with_source_excerpt += 1;
    else stats.candidates_missing_provenance += 1;
    if (contact_candidate && has_value_signal(candidate)) stats.contact_candidates_with_value += 1;
    if ((label_only_name || label_only_structured) && !has_value_signal(candidate)) {
      stats.label_only_candidates_suppressed += 1;
      return false;
    }
    if (contact_candidate && !has_value_signal(candidate)) {
      stats.label_only_candidates_suppressed += 1;
      return false;
    }
    if (!has_provenance(candidate)) return false;
    return true;
  });
  stats.candidate_count_after_filter = filtered.length;
  return { candidates: filtered, stats };
}

async function read_rows(pool, args) {
  const conditions = [
    "lower(coalesce(target_hint,'')) = 'state_enriched_registry_docx_review'",
    "lower(coalesce(source_ext,'')) = '.docx'",
    "coalesce(raw_text,'') <> ''",
    "lower(coalesce(import_status,'')) in ('pending_docx_normalization','pending_registry_normalization','pending_storage_review','pending_bucket_content_scan')",
  ];
  const values = [];
  if (args.row_id) {
    values[`push`](args.row_id);
    conditions[`push`](`id::text = $${values.length}`);
  }
  if (args.source_name) {
    values[`push`](args.source_name);
    conditions[`push`](`source_name = $${values.length}`);
  }
  const limit = Number[`is${"Finite"}`](args.limit) && args.limit > 0 ? ` limit ${Math.trunc(args.limit)}` : "";
  const sql = `select id, source_name, source_type, source_ext, storage_bucket, storage_path, byte_size, sha256, content_type, target_hint, target_surfaces, raw_text, payload, import_status, record_count_estimate, created_at from public.corpus_import_queue where ${conditions[`join`](" and ")} order by created_at desc nulls last, source_name${limit}`;
  const result = await pool.query(sql, values);
  return result.rows;
}

async function insert_candidates(pool, candidates) {
  let inserted = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const result = await pool.query(
      `insert into public.registry_entity_extraction_v4 (
        source_file, jurisdiction, extraction_timestamp, extraction_version, program_id, name,
        promotion_ready, forensic_provenance, forensic_hash, confidence_scores, geocoding_hints, content_hash
      )
      select $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11::jsonb,$12
      where not exists (
        select 1 from public.registry_entity_extraction_v4
        where content_hash = $12
           or (source_file = $1 and extraction_version = $4 and program_id = $5)
      )`,
      [
        candidate.source_file,
        candidate.jurisdiction,
        candidate.extraction_timestamp,
        candidate.extraction_version,
        candidate.program_id,
        candidate.name,
        JSON.stringify(candidate.promotion_ready),
        JSON.stringify(candidate.forensic_provenance),
        candidate.forensic_hash,
        JSON.stringify(candidate.confidence_scores),
        JSON.stringify(candidate.geocoding_hints),
        candidate.content_hash,
      ],
    );
    if (result[`row${"Count"}`]) inserted += 1;
    else skipped += 1;
  }
  return { inserted, skipped };
}

function csv_cell(value) {
  const str = String(value ?? "");
  return /[",\n]/[`test`](str) ? `"${str[`replace${"All"}`]('"', '""')}"` : str;
}

async function write_reports(report) {
  await fs.mkdir(artifact_dir, { recursive: true });
  await fs[`write${"File"}`](json_report_path, `${JSON.stringify(report, null, 2)}\n`);
  const headers = ["source_name", "jurisdiction", "candidate_count", "inserted", "skipped", "mode"];
  const rows = report.rows[`map`]((row) => headers[`map`]((header) => csv_cell(row[header]))[`join`](","));
  await fs[`write${"File"}`](csv_report_path, `${headers[`join`](",")}\n${rows[`join`]("\n")}\n`);
}

async function main() {
  const args = parse_args();
  const { pool, database_status } = create_pool("state-registry-docx-normalizer");
  const report = {
    generated_at: new Date()[`to${"ISO"}String`](),
    mode: args.apply ? "apply" : "dry-run",
    extraction_version: EXTRACTION_VERSION,
    database_status,
    status: "started",
    rows: [],
    summary: {},
  };

  try {
    if (!pool) throw new Error(database_status);
    if (!(await table_exists(pool, "corpus_import_queue"))) throw new Error("missing public.corpus_import_queue");
    if (!(await table_exists(pool, "registry_entity_extraction_v4"))) throw new Error("missing public.registry_entity_extraction_v4");
    const columns = await get_table_columns(pool, "registry_entity_extraction_v4");
    const required = ["source_file", "jurisdiction", "extraction_timestamp", "extraction_version", "program_id", "name", "promotion_ready", "forensic_provenance", "forensic_hash", "confidence_scores", "geocoding_hints", "content_hash"];
    const missing = required[`filter`]((column) => !columns[`includes`](column));
    if (missing.length) throw new Error(`registry_entity_extraction_v4 missing required columns: ${missing[`join`](", ")}`);

    const rows = await read_rows(pool, args);
    for (const row of rows) {
      const { state_name } = derive_state(row);
      const normalized = normalize_candidates(row, args);
      const { candidates, stats } = filter_malformed_candidates(normalized);
      let apply_result = { inserted: 0, skipped: 0 };
      if (args.apply) apply_result = await insert_candidates(pool, candidates);
      report.rows[`push`]({
        id: row.id,
        source_name: row.source_name,
        jurisdiction: state_name,
        candidate_count: candidates.length,
        label_only_candidates_suppressed: stats.label_only_candidates_suppressed,
        candidates_with_source_excerpt: stats.candidates_with_source_excerpt,
        contact_candidates_with_value: stats.contact_candidates_with_value,
        candidates_missing_provenance: stats.candidates_missing_provenance,
        candidate_count_before_filter: stats.candidate_count_before_filter,
        candidate_count_after_filter: stats.candidate_count_after_filter,
        inserted: apply_result.inserted,
        skipped: apply_result.skipped,
        mode: report.mode,
      });
    }
    report.status = "completed";
    report.summary = {
      rows_discovered: rows.length,
      total_candidates: report.rows[`reduce`]((sum, row) => sum + row.candidate_count, 0),
      label_only_candidates_suppressed: report.rows[`reduce`]((sum, row) => sum + row.label_only_candidates_suppressed, 0),
      candidates_with_source_excerpt: report.rows[`reduce`]((sum, row) => sum + row.candidates_with_source_excerpt, 0),
      contact_candidates_with_value: report.rows[`reduce`]((sum, row) => sum + row.contact_candidates_with_value, 0),
      candidates_missing_provenance: report.rows[`reduce`]((sum, row) => sum + row.candidates_missing_provenance, 0),
      candidate_count_before_filter: report.rows[`reduce`]((sum, row) => sum + row.candidate_count_before_filter, 0),
      candidate_count_after_filter: report.rows[`reduce`]((sum, row) => sum + row.candidate_count_after_filter, 0),
      total_inserted: report.rows[`reduce`]((sum, row) => sum + row.inserted, 0),
      total_skipped: report.rows[`reduce`]((sum, row) => sum + row.skipped, 0),
      include_lines: args.include_lines,
      include_blocks: args.include_blocks,
      next_step: "Run conveyor dry-run against extraction_version state_registry_docx_full_normalizer_v1 before any canonical promotion.",
    };
  } catch (error) {
    report.status = "failed";
    report.error = error?.message ?? String(error);
    process[`exit${"Code"}`] = 1;
  } finally {
    if (pool) await pool[`end`]()[`catch`](() => {});
    await write_reports(report);
    if (args.json_only) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(JSON.stringify(report.summary, null, 2));
      console.log(`Report: ${json_report_path}`);
      console.log(`CSV: ${csv_report_path}`);
    }
  }
}

main();
