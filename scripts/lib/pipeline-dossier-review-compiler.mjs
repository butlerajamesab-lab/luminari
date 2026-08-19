import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import JSZip from "jszip";

const COMPILER_VERSION = "pipeline_dossier_review_compiler_v1.0.0";
const CONTRACT_VERSION = "luminari.pipeline_dossier.review_candidate.v1.0.0";
const REQUIRED_PROFILE_FIELDS = Object.freeze([
  "Service Type",
  "Organization Type",
  "Jurisdiction",
  "Phone / Contact",
  "Website",
  "What it does for people",
]);
const REQUIRED_DEADLINE_FIELDS = Object.freeze([
  "Appeal Deadline",
  "Continued-Benefits Deadline",
  "Hearing-Request Deadline",
  "Reconsideration Deadline",
  "Judicial-Review Deadline",
]);
const REQUIRED_RESOURCE_META_FIELDS = Object.freeze([
  "Statutory Authority",
  "Verification Status",
  "Luminari Resource ID",
  "Notes",
]);
const APPENDIX_DEADLINE_FIELDS = Object.freeze({
  appeal_deadline: "Appeal Deadline",
  continued_benefits_deadline: "Continued-Benefits Deadline",
  hearing_request_deadline: "Hearing-Request Deadline",
  reconsideration_deadline: "Reconsideration Deadline",
  judicial_review_deadline: "Judicial-Review Deadline",
});

function fail(code, detail = "") {
  const suffix = detail ? `:${detail}` : "";
  throw new Error(`pipeline_dossier_compiler_${code}${suffix}`);
}

function normalize_space(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decode_xml_entities(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function xml_text(fragment) {
  const values = [];
  const text_re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match;
  while ((match = text_re.exec(fragment)) !== null) {
    values.push(decode_xml_entities(match[1].replace(/<[^>]+>/g, "")));
  }
  return normalize_space(values.join(""));
}

function parse_table_xml(fragment) {
  const rows = [];
  const row_re = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
  let row_match;
  while ((row_match = row_re.exec(fragment)) !== null) {
    const cells = [];
    const cell_re = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
    let cell_match;
    while ((cell_match = cell_re.exec(row_match[1])) !== null) {
      const paragraphs = [];
      const paragraph_re = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
      let paragraph_match;
      while ((paragraph_match = paragraph_re.exec(cell_match[1])) !== null) {
        const text = xml_text(paragraph_match[0]);
        if (text) paragraphs.push(text);
      }
      cells.push(normalize_space(paragraphs.join(" ")));
    }
    rows.push(cells);
  }
  return rows;
}

export function parse_docx_document_xml(document_xml) {
  const body_match = String(document_xml).match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/);
  if (!body_match) fail("document_body_missing");
  const body = body_match[1];
  const items = [];
  const item_re = /<w:(p|tbl)\b[^>]*>[\s\S]*?<\/w:\1>/g;
  let item_match;
  while ((item_match = item_re.exec(body)) !== null) {
    if (item_match[1] === "p") {
      const text = xml_text(item_match[0]);
      if (text) items.push({ type: "paragraph", text });
    } else {
      items.push({ type: "table", rows: parse_table_xml(item_match[0]) });
    }
  }
  if (items.length === 0) fail("document_items_missing");
  return items;
}

function single_cell_text(item) {
  if (item?.type !== "table" || item.rows.length !== 1) return null;
  return normalize_space(item.rows[0].join(" ")) || null;
}

function table_map(rows, required_fields, context) {
  const result = {};
  for (const row of rows ?? []) {
    if (row.length < 2) continue;
    const key = normalize_space(row[0]);
    if (!key) continue;
    result[key] = normalize_space(row.slice(1).join(" "));
  }
  for (const field of required_fields) {
    if (!result[field]) fail("required_field_missing", `${context}:${field}`);
  }
  return result;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonical_json(value) {
  return JSON.stringify(canonicalize(value));
}

function prefix_relation(observed, canonical, context) {
  const observed_text = normalize_space(observed);
  const canonical_text = normalize_space(canonical);
  if (!observed_text) fail("appendix_value_missing", context);
  if (observed_text === canonical_text) return "exact";
  if (canonical_text.startsWith(observed_text)) return "exact_prefix_fragment";
  fail("appendix_value_conflict", context);
}

function header_paragraph(items, predicate, code) {
  const item = items.find(candidate => candidate.type === "paragraph" && predicate(candidate.text));
  if (!item) fail(code);
  return item.text;
}

function extract_header(items) {
  const dossier_title = header_paragraph(
    items,
    text => /Pipeline Dossier\s+[A-Z]+-\d+/.test(text),
    "pipeline_dossier_title_missing",
  );
  const family_line = header_paragraph(
    items,
    text => text.includes("Family Key:") && text.includes("Pipeline Key:") && text.includes("Category Key:"),
    "pipeline_identity_header_missing",
  );
  const counts_line = header_paragraph(
    items,
    text => text.includes("Verified Resources") && text.includes("State/Territory Entry Points") && text.includes("Pipeline:"),
    "declared_counts_missing",
  );

  const dossier_match = dossier_title.match(/Pipeline Dossier\s+([A-Z]+-\d+)\s*\|\s*(.+)$/);
  if (!dossier_match) fail("pipeline_dossier_title_invalid");
  const pipeline_match = family_line.match(/Pipeline Key:\s*([a-z0-9_]+)/);
  const category_match = family_line.match(/Category Key:\s*([a-z0-9_]+)/);
  const family_match = family_line.match(/Family Key:\s*([a-z0-9_]+)/);
  const contract_match = family_line.match(/Family Contract:\s*(.+)$/);
  if (!pipeline_match || !category_match || !family_match) fail("pipeline_identity_header_invalid");

  const counts_match = counts_line.match(
    /(\d+)\s+Verified Resources\s*\|\s*(\d+)\s+[^|]*Authorities\s*\|\s*(\d+)\s+State\/Territory Entry Points\s*\|\s*Pipeline:\s*([a-z0-9_]+)/,
  );
  if (!counts_match) fail("declared_counts_invalid");
  if (counts_match[4] !== pipeline_match[1]) fail("pipeline_key_count_header_conflict");

  return {
    dossier_id: dossier_match[1],
    dossier_title: normalize_space(dossier_match[2]),
    family_key: family_match[1],
    pipeline_key: pipeline_match[1],
    category_key: category_match[1],
    family_contract: contract_match ? normalize_space(contract_match[1]) : null,
    declared_verified_resource_count: Number(counts_match[1]),
    declared_authority_count: Number(counts_match[2]),
    declared_jurisdiction_count: Number(counts_match[3]),
  };
}

function extract_critical_routing(items) {
  const table = items.find(item => {
    const text = single_cell_text(item);
    return text && /CRITICAL ROUTING, READ THIS FIRST:/i.test(text);
  });
  if (!table) fail("critical_routing_missing");
  const full_text = single_cell_text(table);
  const marker = full_text.match(/CRITICAL ROUTING, READ THIS FIRST:\s*/i);
  const body = marker ? full_text.slice(marker.index + marker[0].length) : full_text;
  const matches = [...body.matchAll(/\((\d+)\)\s*/g)];
  if (matches.length === 0) fail("critical_routing_items_missing");
  const results = matches.map((match, index) => {
    const number = Number(match[1]);
    if (number !== index + 1) fail("critical_routing_sequence_invalid", String(number));
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : body.length;
    const text = normalize_space(body.slice(start, end));
    if (!text) fail("critical_routing_text_missing", String(number));
    return {
      critical_item_number: number,
      source_text: `(${number}) ${text}`,
      publication_state: "review_candidate_only",
      user_controls_timing: true,
    };
  });
  return results;
}

function find_previous_section(items, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const text = single_cell_text(items[cursor]);
    if (text?.startsWith("SECTION:")) return text;
    if (text && /\[SAIS-[A-Z0-9-]+\]/.test(text)) break;
  }
  return null;
}

function extract_resources(items) {
  const resources = [];
  const seen_ids = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const heading = single_cell_text(items[index]);
    if (!heading) continue;
    const match = heading.match(/^(.*?)\s*\[(SAIS-[A-Z0-9-]+)\]\s*★?\s*(VERIFIED|UNVERIFIED)?\s*$/);
    if (!match) continue;
    const resource_id = match[2];
    if (seen_ids.has(resource_id)) fail("duplicate_resource_id", resource_id);
    seen_ids.add(resource_id);
    const profile_item = items[index + 1];
    const deadline_header = single_cell_text(items[index + 2]);
    const deadline_item = items[index + 3];
    const metadata_item = items[index + 4];
    if (profile_item?.type !== "table") fail("resource_profile_missing", resource_id);
    if (!deadline_header?.startsWith("DEADLINE MATRIX")) fail("deadline_matrix_header_missing", resource_id);
    if (deadline_item?.type !== "table") fail("deadline_matrix_missing", resource_id);
    if (metadata_item?.type !== "table") fail("resource_metadata_missing", resource_id);

    const profile = table_map(profile_item.rows, REQUIRED_PROFILE_FIELDS, `${resource_id}:profile`);
    const deadlines = table_map(deadline_item.rows, REQUIRED_DEADLINE_FIELDS, `${resource_id}:deadlines`);
    const resource_meta = table_map(metadata_item.rows, REQUIRED_RESOURCE_META_FIELDS, `${resource_id}:metadata`);
    if (resource_meta["Luminari Resource ID"] !== resource_id) {
      fail("resource_id_metadata_conflict", resource_id);
    }
    const heading_status = match[3] ?? null;
    const metadata_status = resource_meta["Verification Status"].split(/\s+--\s+/)[0].trim().toUpperCase();
    if (heading_status && heading_status !== metadata_status) {
      fail("resource_verification_conflict", resource_id);
    }

    resources.push({
      resource_id,
      source_order: resources.length + 1,
      section_heading: find_previous_section(items, index),
      title: normalize_space(match[1]),
      heading_verification_status: heading_status,
      service_type: profile["Service Type"],
      organization_type: profile["Organization Type"],
      jurisdiction: profile["Jurisdiction"],
      jurisdiction_level: normalize_space(profile["Jurisdiction"].split(/\s+--\s+/)[0]),
      official_contact: profile["Phone / Contact"],
      official_url: profile["Website"],
      what_it_does_for_people: profile["What it does for people"],
      deadline_matrix: {
        appeal_deadline: deadlines["Appeal Deadline"],
        continued_benefits_deadline: deadlines["Continued-Benefits Deadline"],
        hearing_request_deadline: deadlines["Hearing-Request Deadline"],
        reconsideration_deadline: deadlines["Reconsideration Deadline"],
        judicial_review_deadline: deadlines["Judicial-Review Deadline"],
      },
      statutory_authority: resource_meta["Statutory Authority"],
      verification_status: metadata_status,
      verification_wording: resource_meta["Verification Status"],
      notes: resource_meta["Notes"],
    });
  }
  if (resources.length === 0) fail("resources_missing");
  return resources;
}

function find_table_by_header(items, expected_header) {
  return items.find(item =>
    item.type === "table"
    && item.rows.length > 0
    && expected_header.every((value, index) => normalize_space(item.rows[0][index]) === value),
  ) ?? null;
}

function extract_authorities(items) {
  const table = find_table_by_header(items, ["Statute / Law", "Citation", "Key Language / Note", "Official Source"]);
  if (!table) fail("authority_table_missing");
  return table.rows.slice(1).map((row, index) => {
    if (row.length < 4) fail("authority_row_invalid", String(index + 1));
    return {
      source_order: index + 1,
      statute_or_law: normalize_space(row[0]),
      citation: normalize_space(row[1]),
      key_language_or_note: normalize_space(row[2]),
      official_source: normalize_space(row[3]),
      publication_state: "review_candidate_only",
    };
  });
}

function extract_jurisdiction_entries(items) {
  const table = find_table_by_header(items, ["State", "Agency", "Phone", "Website", "Statutory Authority", "Verification"]);
  if (!table) fail("jurisdiction_table_missing");
  return table.rows.slice(1).map((row, index) => {
    if (row.length < 6) fail("jurisdiction_row_invalid", String(index + 1));
    const jurisdiction_code = normalize_space(row[0]).toUpperCase();
    const verification_status = normalize_space(row[5]).toUpperCase();
    if (!/^[A-Z]{2}$/.test(jurisdiction_code)) fail("jurisdiction_code_invalid", jurisdiction_code);
    if (!verification_status) fail("jurisdiction_verification_missing", jurisdiction_code);
    return {
      source_order: index + 1,
      jurisdiction_code,
      agency: normalize_space(row[1]),
      phone: normalize_space(row[2]),
      website: normalize_space(row[3]),
      statutory_authority: normalize_space(row[4]),
      verification_status,
      publication_state: verification_status === "VERIFIED" ? "review_candidate_only" : "held_unverified",
    };
  });
}

function extract_appendix(items) {
  const table = items.find(item =>
    item.type === "table"
    && item.rows.length > 1
    && normalize_space(item.rows[0][0]) === "resource_id"
    && item.rows[0].some(cell => normalize_space(cell) === "family_series")
    && item.rows[0].some(cell => normalize_space(cell) === "resource_category"),
  );
  if (!table) fail("metadata_appendix_missing");
  const header = table.rows[0].map(normalize_space);
  return table.rows.slice(1).map((row, index) => {
    const object = {};
    header.forEach((key, column_index) => {
      object[key] = normalize_space(row[column_index] ?? "");
    });
    if (!object.resource_id) fail("metadata_appendix_resource_id_missing", String(index + 1));
    return object;
  });
}

function reconcile_appendix(header, resources, appendix) {
  const resource_by_id = new Map(resources.map(resource => [resource.resource_id, resource]));
  if (appendix.length !== resources.length) fail("metadata_appendix_resource_count_mismatch");
  const reconciled = [];

  for (const observed of appendix) {
    const resource = resource_by_id.get(observed.resource_id);
    if (!resource) fail("metadata_appendix_unknown_resource", observed.resource_id);
    if (observed.family_series !== header.family_key) fail("metadata_family_conflict", observed.resource_id);
    if (observed.document_number !== header.dossier_id) fail("metadata_document_number_conflict", observed.resource_id);
    if (observed.resource_category !== header.pipeline_key) fail("metadata_pipeline_key_conflict", observed.resource_id);
    if (observed.subcategory !== resource.service_type) fail("metadata_subcategory_conflict", observed.resource_id);
    if (observed.jurisdiction_level !== resource.jurisdiction_level) fail("metadata_jurisdiction_level_conflict", observed.resource_id);
    if (observed.jurisdiction !== resource.jurisdiction) fail("metadata_jurisdiction_conflict", observed.resource_id);
    if (observed.verification_status.toUpperCase() !== resource.verification_status) fail("metadata_verification_conflict", observed.resource_id);

    const verification_date_match = resource.verification_wording.match(/--\s*(\d{4}-\d{2}-\d{2})/);
    if (verification_date_match && observed.last_verified !== verification_date_match[1]) {
      fail("metadata_verification_date_conflict", observed.resource_id);
    }

    const canonical_fields = {
      organization_name: resource.title,
      organization_type: resource.organization_type,
      service_type: resource.service_type,
      official_url: resource.official_url,
      official_contact: resource.official_contact,
      statutory_authority: resource.statutory_authority,
      notes: resource.notes,
      appeal_deadline: resource.deadline_matrix.appeal_deadline,
      continued_benefits_deadline: resource.deadline_matrix.continued_benefits_deadline,
      hearing_request_deadline: resource.deadline_matrix.hearing_request_deadline,
      reconsideration_deadline: resource.deadline_matrix.reconsideration_deadline,
      judicial_review_deadline: resource.deadline_matrix.judicial_review_deadline,
    };
    const field_reconciliation = {};
    for (const [field, canonical_value] of Object.entries(canonical_fields)) {
      field_reconciliation[field] = {
        relationship: prefix_relation(observed[field], canonical_value, `${observed.resource_id}:${field}`),
        appendix_observed_value: observed[field],
        canonical_reviewed_value: canonical_value,
      };
    }

    for (const [appendix_field, deadline_label] of Object.entries(APPENDIX_DEADLINE_FIELDS)) {
      if (!field_reconciliation[appendix_field]) fail("deadline_reconciliation_missing", `${observed.resource_id}:${deadline_label}`);
    }

    reconciled.push({
      resource_id: observed.resource_id,
      observed,
      field_reconciliation,
    });
  }
  return reconciled.sort((a, b) => a.resource_id.localeCompare(b.resource_id));
}

function validate_counts(header, resources, authorities, jurisdiction_entries) {
  if (resources.length !== header.declared_verified_resource_count) {
    fail("declared_resource_count_mismatch", `${header.declared_verified_resource_count}:${resources.length}`);
  }
  const verified_count = resources.filter(resource => resource.verification_status === "VERIFIED").length;
  if (verified_count !== header.declared_verified_resource_count) {
    fail("verified_resource_count_mismatch", `${header.declared_verified_resource_count}:${verified_count}`);
  }
  if (authorities.length !== header.declared_authority_count) {
    fail("declared_authority_count_mismatch", `${header.declared_authority_count}:${authorities.length}`);
  }
  if (jurisdiction_entries.length !== header.declared_jurisdiction_count) {
    fail("declared_jurisdiction_count_mismatch", `${header.declared_jurisdiction_count}:${jurisdiction_entries.length}`);
  }
  const jurisdiction_codes = jurisdiction_entries.map(entry => entry.jurisdiction_code);
  if (new Set(jurisdiction_codes).size !== jurisdiction_codes.length) fail("duplicate_jurisdiction_code");
}

export function compile_pipeline_dossier_items(input) {
  const { items, source_filename, source_sha256, document_xml_sha256 } = input;
  if (!Array.isArray(items) || items.length === 0) fail("document_items_missing");
  if (!/^[0-9a-f]{64}$/.test(source_sha256)) fail("source_sha256_invalid");
  if (!/^[0-9a-f]{64}$/.test(document_xml_sha256)) fail("document_xml_sha256_invalid");

  const header = extract_header(items);
  const critical_routing = extract_critical_routing(items);
  const resources = extract_resources(items);
  const authorities = extract_authorities(items);
  const jurisdiction_entries = extract_jurisdiction_entries(items);
  const appendix = extract_appendix(items);
  validate_counts(header, resources, authorities, jurisdiction_entries);
  const metadata_reconciliation = reconcile_appendix(header, resources, appendix);
  const integrity_holds = jurisdiction_entries
    .filter(entry => entry.verification_status !== "VERIFIED")
    .map(entry => ({
      jurisdiction_code: entry.jurisdiction_code,
      reason_code: "source_row_verification_status_unverified",
      source_verification_status: entry.verification_status,
      publication_state: "held_unverified",
    }));

  const package_without_hash = {
    contract_version: CONTRACT_VERSION,
    compiler_version: COMPILER_VERSION,
    publication_state: "review_candidate_only",
    production_write_allowed: false,
    source: {
      filename: source_filename,
      sha256: source_sha256,
      document_xml_sha256,
    },
    dossier: header,
    critical_routing,
    resources,
    authorities,
    jurisdiction_entries,
    integrity_holds,
    metadata_reconciliation,
    validation: {
      resource_count: resources.length,
      authority_count: authorities.length,
      jurisdiction_count: jurisdiction_entries.length,
      integrity_hold_count: integrity_holds.length,
      deadline_assertion_count: resources.length * REQUIRED_DEADLINE_FIELDS.length,
      all_resource_ids_unique: true,
      appendix_reconciled: true,
      declared_counts_match: true,
    },
    review_requirements: {
      manual_page_review_required: true,
      rendered_page_count_required_for_activation: true,
      page_provenance_required_for_activation: true,
      current_access_review_required_for_person_facing_routes: true,
      manual_review_ledger_required_for_activation: true,
      activation_allowed_from_this_package: false,
    },
  };
  const package_sha256 = sha256(canonical_json(package_without_hash));
  return { ...package_without_hash, package_sha256 };
}

export async function compile_pipeline_dossier_docx(file_path) {
  const bytes = await readFile(file_path);
  const source_sha256 = sha256(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const document_file = zip.file("word/document.xml");
  if (!document_file) fail("word_document_xml_missing");
  const document_xml = await document_file.async("string");
  const items = parse_docx_document_xml(document_xml);
  return compile_pipeline_dossier_items({
    items,
    source_filename: basename(file_path),
    source_sha256,
    document_xml_sha256: sha256(document_xml),
  });
}

export const pipeline_dossier_compiler_contract = Object.freeze({
  compiler_version: COMPILER_VERSION,
  contract_version: CONTRACT_VERSION,
  required_deadline_fields: [...REQUIRED_DEADLINE_FIELDS],
  production_write_allowed: false,
});
