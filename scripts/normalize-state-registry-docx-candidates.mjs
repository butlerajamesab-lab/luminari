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

const artifactDir = path.join(repo_root, "artifacts", "corpus-audit");
const jsonReportPath = path.join(artifactDir, "state-registry-docx-normalization-report.json");
const csvReportPath = path.join(artifactDir, "state-registry-docx-normalization-report.csv");
const EXTRACTION_VERSION = "state_registry_docx_full_normalizer_v1";

const STATE_BY_ABBR = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", IA: "Iowa", ID: "Idaho", IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan", MN: "Minnesota", MO: "Missouri", MS: "Mississippi", MT: "Montana", NC: "North Carolina", ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia", VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming", PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands", AS: "American Samoa", MP: "Northern Mariana Islands",
};
const ABBR_BY_STATE = Object.fromEntries(Object.entries(STATE_BY_ABBR).map(([abbr, name]) => [name.toLowerCase(), abbr]));

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

function normalizedLabel(value) {
  return compact(value).toLowerCase().replace(/[:：]+$/g, "").replace(/\s+/g, " ");
}

function labelKey(value) {
  return LABEL_ALIASES.get(normalizedLabel(value)) ?? null;
}

function isStandaloneLabel(value) {
  return STANDALONE_LABEL_DENYLIST.has(normalizedLabel(value));
}

function looksLikeEmail(value) { return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(String(value ?? "")); }
function looksLikeAddress(value) { return /\b\d{2,6}\s+[A-Z][A-Za-z0-9 .'-]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Pkwy|Parkway|Way|Ln|Lane|Suite|Ste)\b/i.test(String(value ?? "")) || /\b[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(String(value ?? "")); }

function hasValueSignal(candidate) {
  const provenance = candidate.forensic_provenance ?? {};
  return extractPhones(provenance.phone).length > 0
    || looksLikeEmail(provenance.email)
    || extractUrls(provenance.website).length > 0
    || looksLikeAddress(provenance.address)
    || Boolean(text(provenance.contact));
}

function hasProvenance(candidate) {
  const provenance = candidate.forensic_provenance ?? {};
  return Boolean(text(provenance.source_excerpt) || text(provenance.text));
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    apply: false,
    dryRun: false,
    jsonOnly: false,
    limit: null,
    rowId: null,
    sourceName: null,
    includeLines: true,
    includeBlocks: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--json") args.jsonOnly = true;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--row-id") args.rowId = argv[++i];
    else if (arg.startsWith("--row-id=")) args.rowId = arg.slice("--row-id=".length);
    else if (arg === "--source-name") args.sourceName = argv[++i];
    else if (arg.startsWith("--source-name=")) args.sourceName = arg.slice("--source-name=".length);
    else if (arg === "--no-lines") args.includeLines = false;
    else if (arg === "--no-blocks") args.includeBlocks = false;
  }
  if (!args.apply) args.dryRun = true;
  if (args.apply && args.dryRun) throw new Error("Choose either --dry-run or --apply, not both.");
  return args;
}

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function text(value) {
  return String(value ?? "").trim();
}

function md5(value) {
  return crypto.createHash("md5").update(String(value ?? "")).digest("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function slug(value) {
  return text(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || "unnamed";
}

function compact(value) {
  return text(value).replace(/[ \t]+/g, " ");
}

function hasSignal(line) {
  return /\b(phone|website|address|eligibility|apply|notes|deadline|appeal|sol|fatal|file|complaint|hotline|tribal|medicaid|snap|tanf|ui|eviction|wage|housing|civil rights|legal aid|fqhc|osha|whd|eeoc|hud|dv|domestic violence|immigration|refugee|food bank|shelter|workflow|statute|code|§|days?|months?|years?)\b/i.test(line)
    || /\b\d{3}[-.) ]?\d{3}[-. ]?\d{4}\b/.test(line)
    || /\bhttps?:\/\/|\b[a-z0-9.-]+\.(gov|org|com|net|edu)\b/i.test(line)
    || /^[A-Z]{2}-\d{2}\b/.test(line);
}

function lineCategory(line) {
  const l = line.toLowerCase();
  if (/^[a-z]{2}-\d{2}\b/i.test(line)) return "policy_alert";
  if (/^workflow\s+[a-z]/i.test(line)) return "workflow";
  if (/\b(deadline|appeal|sol|fatal|days?|months?|years?)\b/i.test(line)) return "deadline_or_timing";
  if (/\b(phone|hotline|\d{3}[-.) ]?\d{3}[-. ]?\d{4})\b/i.test(line)) return "contact_phone";
  if (/\b(website|https?:\/\/|\.(gov|org|com|net|edu)\b)/i.test(line)) return "contact_website";
  if (/\b(address|\d{2,6}\s+[A-Z][A-Za-z0-9 .'-]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Pkwy|Parkway|Ste|Suite)\b)/.test(line)) return "address";
  if (/\b(medicaid|snap|tanf|ui|unemployment|liheap|wic|benefits|fip|kancare)\b/i.test(line)) return "benefits";
  if (/\b(housing|eviction|rent|shelter|homeless|unhoused|tenant|landlord)\b/i.test(line)) return "housing";
  if (/\b(wage|overtime|whd|osha|labor|employment|meatpacking|donning|doffing)\b/i.test(line)) return "employment_labor";
  if (/\b(civil rights|discrimination|eeoc|hud|khrc|ccrd|icrc|lgbtq|gender identity|sexual orientation)\b/i.test(line)) return "civil_rights";
  if (/\b(tribe|tribal|icwa|ihs|nation|reservation|settlement|potawatomi|meskwaki|kickapoo|sac and fox)\b/i.test(line)) return "tribal";
  if (/\b(health|hospital|fqhc|clinic|medical|behavioral)\b/i.test(line)) return "healthcare";
  if (/\b(immigrant|immigration|refugee|somali|latino|burmese|karen|congolese|language)\b/i.test(line)) return "immigration_language";
  if (/\b(statute|code|§|usc|cfr|crs|ksa|iowa code)\b/i.test(line)) return "legal_authority";
  return "registry_text";
}

function deriveState(row) {
  const payload = safeJson(row.payload, {});
  const docx = payload.docx_extraction ?? {};
  const explicitState = text(docx.state ?? payload.state ?? payload.state_name);
  const explicitJurisdiction = text(docx.jurisdiction ?? payload.jurisdiction);
  if (explicitState) return { stateName: explicitState, stateCode: explicitJurisdiction || ABBR_BY_STATE[explicitState.toLowerCase()] || explicitState.slice(0, 2).toUpperCase() };
  const haystack = `${row.source_name ?? ""}\n${row.raw_text ?? ""}`;
  const m1 = haystack.match(/\b([A-Z][A-Za-z .'-]+) State Registry\s+—\s+Enriched Pass/i);
  if (m1) {
    const stateName = compact(m1[1]);
    return { stateName, stateCode: ABBR_BY_STATE[stateName.toLowerCase()] || stateName.slice(0, 2).toUpperCase() };
  }
  const m2 = haystack.match(/\(([A-Z]{2})\)\s*·\s*FIPS/);
  if (m2) return { stateName: STATE_BY_ABBR[m2[1]] ?? m2[1], stateCode: m2[1] };
  return { stateName: explicitJurisdiction || "Unknown", stateCode: explicitJurisdiction || "UNK" };
}

function extractPhones(textValue) {
  return [...String(textValue ?? "").matchAll(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g)].map((m) => m[0].trim());
}

function extractUrls(textValue) {
  return [...String(textValue ?? "").matchAll(/\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[\w./?%&=-]*)?/gi)]
    .map((m) => m[0].replace(/[),.;]+$/g, ""))
    .filter((url) => /\.(gov|org|com|net|edu)\b/i.test(url));
}

function extract_citations(textValue) {
  const patterns = [
    /\b\d+\s+U\.S\.C\.\s*§+\s*[\w.-]+/gi,
    /\b\d+\s+USC\s*§+\s*[\w.-]+/gi,
    /\b\d+\s+C\.F\.R\.\s*(?:Part\s*)?[\w.-]+/gi,
    /\b(?:CRS|Colo\. Rev\. Stat\.|Iowa Code|KSA|K\.S\.A\.)\s*§?\s*[\w.-]+(?:\([^)]+\))*/gi,
    /§+\s*[\w.-]+(?:\([^)]+\))*/g,
  ];
  return [...new Set(patterns.flatMap((pattern) => [...String(textValue ?? "").matchAll(pattern)].map((m) => compact(m[0]))))];
}

function splitBlocks(rawText) {
  return String(rawText ?? "")
    .split(/\n\s*\n/g)
    .map((block) => block.split(/\r?\n/).map(compact).filter(Boolean).join("\n"))
    .filter((block) => block.length >= 12);
}

function lines(rawText) {
  return String(rawText ?? "").split(/\r?\n/).map(compact).filter(Boolean);
}

function inferSection(line, current) {
  if (/^LAYER\s+\d+/i.test(line)) return line;
  if (/^Workflow\s+[A-Z]/.test(line)) return line;
  if (/^[A-Z][A-Z &/+-]{4,}$/.test(line) && line.length < 100) return line;
  return current;
}

function makeCandidate({ row, stateName, stateCode, type, name, textBody, section, ordinal, resourceType, structuredBlock = null, extra = {} }) {
  const sourceFile = row.source_name ?? row.storage_path ?? `corpus_import_queue:${row.id}`;
  const body = compact(textBody);
  const displayName = compact(name || body.slice(0, 140));
  const phones = extractPhones(textBody);
  const urls = extractUrls(textBody);
  const sourceExcerpt = compact(structuredBlock?.source_excerpt || textBody).slice(0, 1200);
  const citations = extract_citations(textBody);
  const category = resourceType || lineCategory(`${name ?? ""} ${textBody ?? ""}`);
  const contentHash = md5([sourceFile, type, stateName, section, ordinal, displayName, body].join("|"));
  const programId = `${slug(stateName)}_${slug(type)}_${slug(displayName).slice(0, 42)}_${contentHash.slice(0, 8)}`;
  const cityMatch = body.match(/\b(?:Address:\s*)?(?:[^\n]*,\s*)?([A-Z][A-Za-z .'-]+)\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);
  return {
    source_file: sourceFile,
    jurisdiction: stateName,
    extraction_timestamp: new Date().toISOString(),
    extraction_version: EXTRACTION_VERSION,
    program_id: programId,
    name: displayName,
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
      source_file: sourceFile,
      state_or_region: stateName,
      state: stateCode,
      section: section ?? null,
      ordinal,
      candidate_type: type,
      resource_type: category,
      text: body,
      source_excerpt: sourceExcerpt,
      source_line_start: structuredBlock?.source_line_start ?? null,
      source_line_end: structuredBlock?.source_line_end ?? null,
      source_queue_id: row.id ?? null,
      block_type: structuredBlock?.block_type ?? type,
      section_title: structuredBlock?.section_title ?? section ?? null,
      label: structuredBlock?.label ?? null,
      value: structuredBlock?.value ?? null,
      phone: structuredBlock?.phone ?? phones[0] ?? "",
      email: structuredBlock?.email ?? "",
      website: structuredBlock?.website ?? urls[0] ?? "",
      address: structuredBlock?.address ?? "",
      contact: structuredBlock?.contact ?? "",
      field_metadata: structuredBlock?.field_metadata ?? {},
      phones,
      urls,
      citations,
      ...extra,
    },
    forensic_hash: sha256([sourceFile, stateName, type, displayName, body].join("|")),
    confidence_scores: {
      parser: 0.86,
      source_registry_confidence: 0.90,
      extraction_confidence: type === "atomic_line" ? 0.72 : 0.82,
      promotion_readiness: type === "resource_block" ? 0.78 : 0.70,
    },
    geocoding_hints: {
      city: cityMatch?.[1] ?? "",
      state: cityMatch?.[2] ?? stateCode,
      postal_code: cityMatch?.[3] ?? "",
    },
    content_hash: contentHash,
  };
}

function splitLabelValue(line) {
  const trimmed = compact(line);
  const colon = trimmed.match(/^([^:：]{2,80})[:：]\s*(.*)$/);
  if (colon && labelKey(colon[1])) return { label: compact(colon[1]), value: compact(colon[2]) };
  const cells = trimmed.split(/\t+/).map(compact).filter(Boolean);
  if (cells.length >= 2 && labelKey(cells[0])) return { label: cells[0], value: cells.slice(1).join(" ") };
  if (cells.length === 1 && labelKey(cells[0])) return { label: cells[0], value: "" };
  return null;
}

function buildStructuredBlocks(row, rawText) {
  const sourceQueueId = row.id ?? null;
  const lineList = String(rawText ?? "").split(/\r?\n/);
  const blocks = [];
  let sectionTitle = "document_start";
  let currentResource = null;
  const flushResource = () => { if (currentResource?.text.length) blocks.push(currentResource); currentResource = null; };
  for (let i = 0; i < lineList.length; i += 1) {
    const line = compact(lineList[i]);
    if (!line) continue;
    const inferred = inferSection(line, sectionTitle);
    if (inferred !== sectionTitle || /^LAYER\s+\d+/i.test(line)) { flushResource(); sectionTitle = inferred; }
    const pair = splitLabelValue(line);
    if (pair) {
      let value = pair.value;
      const key = labelKey(pair.label);
      const context = [line];
      let endLine = i + 1;
      if (!value) {
        for (let j = i + 1; j < Math.min(lineList.length, i + 5); j += 1) {
          const next = compact(lineList[j]);
          if (!next) continue;
          if (splitLabelValue(next) || inferSection(next, sectionTitle) !== sectionTitle) break;
          value = value ? `${value} ${next}` : next;
          context.push(next);
          endLine = j + 1;
          if (key && ["phone", "email", "website", "address", "contact"].includes(key)) break;
        }
      }
      const fieldMetadata = { [key ?? normalizedLabel(pair.label)]: value };
      const structured = {
        block_type: "label_value", section_title: sectionTitle, label: pair.label, value, text: line,
        source_excerpt: context.join(" | "), source_line_start: i + 1, source_line_end: endLine, source_queue_id: sourceQueueId,
        field_metadata: fieldMetadata,
      };
      if (key === "phone" && extractPhones(value).length) structured.phone = value;
      if (key === "email" && looksLikeEmail(value)) structured.email = value;
      if (key === "website" && extractUrls(value).length) structured.website = value;
      if (key === "address" && looksLikeAddress(value)) structured.address = value;
      if (key === "contact" && text(value)) structured.contact = value;
      blocks.push(structured);
      if (currentResource && key) currentResource.field_metadata[key] = value;
      continue;
    }
    const isHeading = /^[A-Z][A-Za-z0-9 &/'().,-]{3,120}$/.test(line) && !hasSignal(line);
    if (isHeading || !currentResource) {
      flushResource();
      currentResource = { block_type: "resource_context", section_title: sectionTitle, label: null, value: null, text: [line], source_excerpt: line, source_line_start: i + 1, source_line_end: i + 1, source_queue_id: sourceQueueId, field_metadata: {} };
    } else {
      currentResource.text.push(line);
      currentResource.source_excerpt = currentResource.text.join(" | ").slice(0, 1200);
      currentResource.source_line_end = i + 1;
    }
  }
  flushResource();
  return blocks.map((block) => ({ ...block, text: Array.isArray(block.text) ? block.text.join("\n") : block.text }));
}

function extractStructuredCandidates(row, stateName, stateCode, rawText) {
  return buildStructuredBlocks(row, rawText)
    .filter((block) => compact(block.value || block.text).length >= 4)
    .filter((block) => hasSignal(`${block.label ?? ""} ${block.value ?? ""} ${block.text ?? ""}`) || block.block_type === "resource_context")
    .map((block, index) => makeCandidate({
      row, stateName, stateCode, type: block.block_type,
      name: block.block_type === "label_value" ? `${block.label}: ${block.value}`.slice(0, 150) : block.text.split(/\n/)[0].slice(0, 150),
      textBody: [block.text, block.value].filter(Boolean).join("\n"), section: block.section_title, ordinal: index + 1,
      resourceType: lineCategory(`${block.label ?? ""} ${block.value ?? ""} ${block.text ?? ""}`), structuredBlock: block,
      extra: { parser_rule: "structured_docx_block_preservation" },
    }));
}

function extractResourceBlocks(row, stateName, stateCode, rawText) {
  const result = [];
  const blockList = splitBlocks(rawText);
  for (let i = 0; i < blockList.length; i += 1) {
    const block = blockList[i];
    if (!/(Phone:|Website:|Address:|Eligibility:|Apply \/ Notes:)/i.test(block)) continue;
    const blockLines = block.split(/\n/).filter(Boolean);
    const titleIndex = blockLines.findIndex((line) => !/^(Address|Phone|Website|Eligibility|Apply \/ Notes):/i.test(line));
    const title = blockLines[Math.max(0, titleIndex)] ?? blockLines[0];
    result.push(makeCandidate({
      row, stateName, stateCode, type: "resource_block", name: title, textBody: block, section: "LAYER 1 — HELP: Programs & Resources", ordinal: i + 1,
      resourceType: lineCategory(block),
      extra: { parser_rule: "resource_block_with_contact_fields" },
    }));
  }
  return result;
}

function extractPolicyAlerts(row, stateName, stateCode, rawText) {
  const result = [];
  const lineList = lines(rawText);
  for (let i = 0; i < lineList.length; i += 1) {
    if (!/^[A-Z]{2}-\d{2}\b/.test(lineList[i])) continue;
    const parts = [lineList[i]];
    for (let j = i + 1; j < Math.min(lineList.length, i + 8); j += 1) {
      if (/^[A-Z]{2}-\d{2}\b/.test(lineList[j]) || /^LAYER\s+\d+/i.test(lineList[j])) break;
      parts.push(lineList[j]);
    }
    const body = parts.join(" ");
    const name = lineList[i].slice(0, 160);
    result.push(makeCandidate({ row, stateName, stateCode, type: "policy_alert", name, textBody: body, section: "LAYER 0 — CRITICAL POLICY ALERTS", ordinal: i + 1, resourceType: lineCategory(body), extra: { parser_rule: "policy_alert_heading" } }));
  }
  return result;
}

function extractWorkflowBlocks(row, stateName, stateCode, rawText) {
  const result = [];
  const lineList = lines(rawText);
  for (let i = 0; i < lineList.length; i += 1) {
    if (!/^Workflow\s+[A-Z]\b/i.test(lineList[i])) continue;
    const parts = [lineList[i]];
    for (let j = i + 1; j < Math.min(lineList.length, i + 80); j += 1) {
      if (j > i + 5 && /^Workflow\s+[A-Z]\b/i.test(lineList[j])) break;
      if (/^LAYER\s+\d+/i.test(lineList[j])) break;
      parts.push(lineList[j]);
    }
    const body = parts.join("\n");
    result.push(makeCandidate({ row, stateName, stateCode, type: "workflow_block", name: lineList[i], textBody: body, section: "LAYER 2 — WORKFLOWS", ordinal: i + 1, resourceType: "workflow", extra: { parser_rule: "workflow_heading_to_next_workflow" } }));
  }
  return result;
}

function extractDeadlineCandidates(row, stateName, stateCode, rawText) {
  const result = [];
  const lineList = lines(rawText);
  for (let i = 0; i < lineList.length; i += 1) {
    const line = lineList[i];
    if (!/\b(\d+\s*(days?|months?|years?)|SOL|FATAL|deadline|appeal|from mailing|from notice)\b/i.test(line)) continue;
    const body = [lineList[i - 1], line, lineList[i + 1]].filter(Boolean).join(" | ");
    result.push(makeCandidate({ row, stateName, stateCode, type: "deadline_signal", name: line.slice(0, 150), textBody: body, section: "deadline/timing", ordinal: i + 1, resourceType: "deadline_or_timing", extra: { parser_rule: "deadline_regex_context_window" } }));
  }
  return result;
}

function extractCitationCandidates(row, stateName, stateCode, rawText) {
  const result = [];
  const citationSet = extract_citations(rawText);
  citationSet.forEach((citation, index) => {
    const idx = rawText.indexOf(citation);
    const context = idx >= 0 ? rawText.slice(Math.max(0, idx - 240), Math.min(rawText.length, idx + citation.length + 240)) : citation;
    result.push(makeCandidate({ row, stateName, stateCode, type: "legal_authority_signal", name: citation, textBody: context, section: "legal_authority", ordinal: index + 1, resourceType: "legal_authority", extra: { citation, parser_rule: "citation_regex_context_window" } }));
  });
  return result;
}

function extractBlocks(row, stateName, stateCode, rawText) {
  const result = [];
  splitBlocks(rawText).forEach((block, index) => {
    if (block.length < 40) return;
    if (!hasSignal(block) && block.length < 220) return;
    const first = block.split(/\n/).find(Boolean) ?? block.slice(0, 120);
    result.push(makeCandidate({ row, stateName, stateCode, type: "document_block", name: first.slice(0, 150), textBody: block, section: "document_block", ordinal: index + 1, resourceType: lineCategory(block), extra: { parser_rule: "paragraph_block_preservation" } }));
  });
  return result;
}

function extractAtomicLines(row, stateName, stateCode, rawText) {
  const result = [];
  let section = "document_start";
  lines(rawText).forEach((line, index) => {
    section = inferSection(line, section);
    if (line.length < 4) return;
    if (!hasSignal(line) && !/^LAYER\s+\d+/i.test(line) && !/^Workflow\s+[A-Z]/.test(line)) return;
    result.push(makeCandidate({ row, stateName, stateCode, type: "atomic_line", name: `${stateCode} line ${String(index + 1).padStart(4, "0")}: ${line.slice(0, 110)}`, textBody: line, section, ordinal: index + 1, resourceType: lineCategory(line), extra: { parser_rule: "atomic_line_preservation" } }));
  });
  return result;
}

function normalizeCandidates(row, args) {
  const rawText = text(row.raw_text);
  const { stateName, stateCode } = deriveState(row);
  const candidates = [
    ...extractStructuredCandidates(row, stateName, stateCode, rawText),
    ...extractPolicyAlerts(row, stateName, stateCode, rawText),
    ...extractResourceBlocks(row, stateName, stateCode, rawText),
    ...extractWorkflowBlocks(row, stateName, stateCode, rawText),
    ...extractDeadlineCandidates(row, stateName, stateCode, rawText),
    ...extractCitationCandidates(row, stateName, stateCode, rawText),
  ];
  if (args.includeBlocks) candidates.push(...extractBlocks(row, stateName, stateCode, rawText));
  if (args.includeLines) candidates.push(...extractAtomicLines(row, stateName, stateCode, rawText));
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.content_hash)) return false;
    seen.add(candidate.content_hash);
    return true;
  });
}

function filterMalformedCandidates(candidates) {
  const stats = {
    label_only_candidates_suppressed: 0,
    candidates_with_source_excerpt: 0,
    contact_candidates_with_value: 0,
    candidates_missing_provenance: 0,
    candidate_count_before_filter: candidates.length,
    candidate_count_after_filter: 0,
  };
  const filtered = candidates.filter((candidate) => {
    const provenance = candidate.forensic_provenance ?? {};
    const labelOnlyName = isStandaloneLabel(candidate.name);
    const labelOnlyStructured = isStandaloneLabel(provenance.label) && !text(provenance.value);
    const contactCandidate = /^contact_/i.test(provenance.resource_type ?? "") || ["contact_phone", "contact_website", "address"].includes(provenance.resource_type);
    if (hasProvenance(candidate)) stats.candidates_with_source_excerpt += 1;
    else stats.candidates_missing_provenance += 1;
    if (contactCandidate && hasValueSignal(candidate)) stats.contact_candidates_with_value += 1;
    if ((labelOnlyName || labelOnlyStructured) && !hasValueSignal(candidate)) {
      stats.label_only_candidates_suppressed += 1;
      return false;
    }
    if (contactCandidate && !hasValueSignal(candidate)) {
      stats.label_only_candidates_suppressed += 1;
      return false;
    }
    if (!hasProvenance(candidate)) return false;
    return true;
  });
  stats.candidate_count_after_filter = filtered.length;
  return { candidates: filtered, stats };
}

async function readRows(pool, args) {
  const conditions = [
    "lower(coalesce(target_hint,'')) = 'state_enriched_registry_docx_review'",
    "lower(coalesce(source_ext,'')) = '.docx'",
    "coalesce(raw_text,'') <> ''",
    "lower(coalesce(import_status,'')) in ('pending_docx_normalization','pending_registry_normalization','pending_storage_review','pending_bucket_content_scan')",
  ];
  const values = [];
  if (args.rowId) {
    values.push(args.rowId);
    conditions.push(`id::text = $${values.length}`);
  }
  if (args.sourceName) {
    values.push(args.sourceName);
    conditions.push(`source_name = $${values.length}`);
  }
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? ` limit ${Math.trunc(args.limit)}` : "";
  const sql = `select id, source_name, source_type, source_ext, storage_bucket, storage_path, byte_size, sha256, content_type, target_hint, target_surfaces, raw_text, payload, import_status, record_count_estimate, created_at from public.corpus_import_queue where ${conditions.join(" and ")} order by created_at desc nulls last, source_name${limit}`;
  const result = await pool.query(sql, values);
  return result.rows;
}

async function insertCandidates(pool, candidates) {
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
    if (result.rowCount) inserted += 1;
    else skipped += 1;
  }
  return { inserted, skipped };
}

function csvCell(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

async function writeReports(report) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
  const headers = ["source_name", "jurisdiction", "candidate_count", "inserted", "skipped", "mode"];
  const rows = report.rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  await fs.writeFile(csvReportPath, `${headers.join(",")}\n${rows.join("\n")}\n`);
}

async function main() {
  const args = parseArgs();
  const { pool, databaseStatus } = create_pool("state-registry-docx-normalizer");
  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    extractionVersion: EXTRACTION_VERSION,
    databaseStatus,
    status: "started",
    rows: [],
    summary: {},
  };

  try {
    if (!pool) throw new Error(databaseStatus);
    if (!(await table_exists(pool, "corpus_import_queue"))) throw new Error("missing public.corpus_import_queue");
    if (!(await table_exists(pool, "registry_entity_extraction_v4"))) throw new Error("missing public.registry_entity_extraction_v4");
    const columns = await get_table_columns(pool, "registry_entity_extraction_v4");
    const required = ["source_file", "jurisdiction", "extraction_timestamp", "extraction_version", "program_id", "name", "promotion_ready", "forensic_provenance", "forensic_hash", "confidence_scores", "geocoding_hints", "content_hash"];
    const missing = required.filter((column) => !columns.includes(column));
    if (missing.length) throw new Error(`registry_entity_extraction_v4 missing required columns: ${missing.join(", ")}`);

    const rows = await readRows(pool, args);
    for (const row of rows) {
      const { stateName } = deriveState(row);
      const normalized = normalizeCandidates(row, args);
      const { candidates, stats } = filterMalformedCandidates(normalized);
      let applyResult = { inserted: 0, skipped: 0 };
      if (args.apply) applyResult = await insertCandidates(pool, candidates);
      report.rows.push({
        id: row.id,
        source_name: row.source_name,
        jurisdiction: stateName,
        candidate_count: candidates.length,
        label_only_candidates_suppressed: stats.label_only_candidates_suppressed,
        candidates_with_source_excerpt: stats.candidates_with_source_excerpt,
        contact_candidates_with_value: stats.contact_candidates_with_value,
        candidates_missing_provenance: stats.candidates_missing_provenance,
        candidate_count_before_filter: stats.candidate_count_before_filter,
        candidate_count_after_filter: stats.candidate_count_after_filter,
        inserted: applyResult.inserted,
        skipped: applyResult.skipped,
        mode: report.mode,
      });
    }
    report.status = "completed";
    report.summary = {
      rowsDiscovered: rows.length,
      totalCandidates: report.rows.reduce((sum, row) => sum + row.candidate_count, 0),
      label_only_candidates_suppressed: report.rows.reduce((sum, row) => sum + row.label_only_candidates_suppressed, 0),
      candidates_with_source_excerpt: report.rows.reduce((sum, row) => sum + row.candidates_with_source_excerpt, 0),
      contact_candidates_with_value: report.rows.reduce((sum, row) => sum + row.contact_candidates_with_value, 0),
      candidates_missing_provenance: report.rows.reduce((sum, row) => sum + row.candidates_missing_provenance, 0),
      candidate_count_before_filter: report.rows.reduce((sum, row) => sum + row.candidate_count_before_filter, 0),
      candidate_count_after_filter: report.rows.reduce((sum, row) => sum + row.candidate_count_after_filter, 0),
      totalInserted: report.rows.reduce((sum, row) => sum + row.inserted, 0),
      totalSkipped: report.rows.reduce((sum, row) => sum + row.skipped, 0),
      includeLines: args.includeLines,
      includeBlocks: args.includeBlocks,
      nextStep: "Run conveyor dry-run against extraction_version state_registry_docx_full_normalizer_v1 before any canonical promotion.",
    };
  } catch (error) {
    report.status = "failed";
    report.error = error?.message ?? String(error);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => {});
    await writeReports(report);
    if (args.jsonOnly) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(JSON.stringify(report.summary, null, 2));
      console.log(`Report: ${jsonReportPath}`);
      console.log(`CSV: ${csvReportPath}`);
    }
  }
}

main();
