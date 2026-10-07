import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";
import {
  get_current_rosetta_live_detail,
  type current_rosetta_live_detail,
} from "./current-law-rosetta-live";

export type civic_genome_report_mode = "summary" | "detailed" | "law_decomposition";

type json_record = Record<string, unknown>;

type rosetta_source_content = {
  source_content_id: string;
  source_document_id: number;
  source_version: string;
  source_url: string;
  media_type: string;
  source_text: string;
  source_content_hash: string;
  source_byte_hash: string | null;
  source_provider_hash: string | null;
  source_identity_hash: string;
  source_metadata: json_record;
  created_at: string;
};

const NO_SECOND_SOURCE_CONDITION =
  "independent_authoritative_source_not_supplied";

function as_record(value: unknown): json_record | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as json_record)
    : null;
}

function as_records(value: unknown): json_record[] {
  return Array.isArray(value)
    ? value.map(as_record).filter((row): row is json_record => Boolean(row))
    : [];
}

function string_value(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
}

function positive_integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function source_link(value: unknown): string {
  const raw = string_value(value);
  if (!raw) return '<span class="muted">Not observed</span>';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return `<a href="${html(parsed.toString())}" rel="noopener noreferrer">${html(raw)}</a>`;
    }
  } catch {
    // Preserve malformed historical values as inert text, never as active links.
  }
  return html(raw);
}

function human_key(value: unknown): string {
  const raw = string_value(value) ?? "Recorded field";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function human_prism_status(
  value: unknown,
  provider_copy_fallback_used = false,
): string {
  const raw = string_value(value);
  if (!raw) return "Prism receipt not attached in this read model";
  if (
    raw === "supported_by_one_source"
    || raw === "independent_authoritative_source_not_supplied"
  ) {
    return provider_copy_fallback_used
      ? "Provider-copy text supports this extraction"
      : "Official legislative source verified";
  }
  if (raw === "contradicted") return "Language did not carry into final bill";
  if (raw === "incomplete") return "Verification incomplete";
  return human_key(raw);
}

function proof_item_title(entry: json_record): string {
  return (
    string_value(entry.check) ??
    string_value(entry.finding) ??
    string_value(entry.requirement) ??
    string_value(entry.condition) ??
    "Recorded proof item"
  );
}

function meaningful_unresolved(value: unknown): json_record[] {
  return as_records(value).filter(
    (entry) => proof_item_title(entry) !== NO_SECOND_SOURCE_CONDITION,
  );
}

function render_value(value: unknown): string {
  if (value === null || value === undefined)
    return '<span class="muted">Not observed</span>';
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="muted">None</span>';
    return `<ul>${value.map((item) => `<li>${render_value(item)}</li>`).join("")}</ul>`;
  }
  const record = as_record(value);
  if (record) {
    const rows = Object.entries(record);
    if (rows.length === 0) return '<span class="muted">None</span>';
    return `<dl class="kv">${rows.map(([key, item]) => `<div><dt>${html(human_key(key))}</dt><dd>${render_value(item)}</dd></div>`).join("")}</dl>`;
  }
  return html(value);
}

function version_label(version: json_record | null): string {
  if (!version) return "Not observed";
  const type = string_value(version.version_type) ?? "unknown version";
  const state = string_value(version.processing_state);
  return state ? `${human_key(type)} · ${human_key(state)}` : human_key(type);
}

function format_date(value: unknown): string {
  const raw = string_value(value);
  if (!raw) return "Not observed";
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
}

type event_temporal_presentation = {
  status_class: "good" | "warn" | "muted";
  row_class: "confirmed-event" | "pending-event" | "unclassified-event";
  label: string;
  confirmed: boolean;
  pending: boolean;
};

function event_temporal_presentation(
  event: json_record,
): event_temporal_presentation {
  const temporal_status = string_value(event.temporal_status);
  if (temporal_status === "confirmed_provider_record") {
    return {
      status_class: "good",
      row_class: "confirmed-event",
      label: "Confirmed provider record",
      confirmed: true,
      pending: false,
    };
  }
  if (temporal_status === "future_dated_provider_record") {
    return {
      status_class: "warn",
      row_class: "pending-event",
      label: "Pending provider record — not confirmed",
      confirmed: false,
      pending: true,
    };
  }
  if (temporal_status === "legacy_mixed_time") {
    return {
      status_class: "muted",
      row_class: "unclassified-event",
      label: "Legacy chronology — confirmation unavailable",
      confirmed: false,
      pending: false,
    };
  }
  return {
    status_class: "muted",
    row_class: "unclassified-event",
    label: "Confirmation status unavailable",
    confirmed: false,
    pending: false,
  };
}

function required_rosetta_config() {
  const base_url = process.env.ROSETTA_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.ROSETTA_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base_url || !key)
    throw new Error(
      "civic_genome_human_report_rosetta_source_access_not_configured",
    );
  return { base_url, key };
}

async function load_rosetta_source_content(
  source_document_ids: number[],
  expected_hash_by_document: Map<number, string> = new Map(),
): Promise<rosetta_source_content[]> {
  const unique_ids = [
    ...new Set(
      source_document_ids.filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
  if (unique_ids.length === 0) return [];

  const { base_url, key } = required_rosetta_config();
  const query = new URLSearchParams({
    select:
      "source_content_id,source_document_id,source_version,source_url,media_type,source_text,source_content_hash,source_byte_hash,source_provider_hash,source_identity_hash,source_metadata,created_at",
    source_document_id: `in.(${unique_ids.join(",")})`,
    order: "created_at.desc",
  });
  const headers = create_rosetta_supabase_headers(key, {
    accept: "application/json",
  });
  const response = await fetch(
    `${base_url}/rest/v1/source_document_content?${query.toString()}`,
    {
      method: "GET",
      headers,
    },
  );
  if (!response.ok) {
    throw new Error(
      `civic_genome_human_report_rosetta_source_fetch_failed:${response.status}`,
    );
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload))
    throw new Error(
      "civic_genome_human_report_rosetta_source_invalid_response",
    );

  const seen = new Set<number>();
  const rows: rosetta_source_content[] = [];
  for (const value of payload) {
    const row = as_record(value);
    const source_document_id = positive_integer(row?.source_document_id);
    if (!row || !source_document_id || seen.has(source_document_id)) continue;
    const source_text = string_value(row.source_text);
    const source_url = string_value(row.source_url);
    const source_content_hash = string_value(row.source_content_hash);
    const source_identity_hash = string_value(row.source_identity_hash);
    if (
      !source_text ||
      !source_url ||
      !source_content_hash ||
      !source_identity_hash
    )
      continue;
    const expected_hash = expected_hash_by_document.get(source_document_id);
    if (
      expected_hash &&
      source_content_hash.toLowerCase() !== expected_hash.toLowerCase()
    )
      continue;
    seen.add(source_document_id);
    rows.push({
      source_content_id: string_value(row.source_content_id) ?? "not_observed",
      source_document_id,
      source_version: string_value(row.source_version) ?? "unknown",
      source_url,
      media_type: string_value(row.media_type) ?? "text/plain",
      source_text,
      source_content_hash,
      source_byte_hash: string_value(row.source_byte_hash),
      source_provider_hash: string_value(row.source_provider_hash),
      source_identity_hash,
      source_metadata: as_record(row.source_metadata) ?? {},
      created_at: string_value(row.created_at) ?? "",
    });
  }
  return rows;
}

function report_css(): string {
  return `
    :root { color-scheme: light; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211d; background: #f5f8f6; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f8f6; color: #17211d; }
    main { max-width: 1120px; margin: 0 auto; padding: 40px 28px 80px; }
    h1, h2, h3, h4 { margin: 0; line-height: 1.15; }
    h1 { font-size: 2.4rem; margin-top: 8px; }
    h2 { font-size: 1.45rem; margin-bottom: 14px; }
    h3 { font-size: 1.05rem; }
    p { line-height: 1.55; }
    a { color: #0c6b49; }
    .eyebrow { text-transform: uppercase; letter-spacing: .12em; font: 700 .72rem ui-monospace, SFMono-Regular, Menlo, monospace; color: #167a56; }
    .subhead { color: #52645c; margin: 10px 0 0; }
    .panel { background: #fff; border: 1px solid #d8e3dd; border-radius: 12px; padding: 20px; margin-top: 18px; break-inside: avoid; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
    .metric { background: #f6faf8; border: 1px solid #dfe9e4; border-radius: 8px; padding: 12px; }
    .metric b { display: block; font-size: 1rem; margin-top: 4px; overflow-wrap: anywhere; }
    .label { text-transform: uppercase; letter-spacing: .08em; color: #667970; font: 700 .66rem ui-monospace, SFMono-Regular, Menlo, monospace; }
    .muted { color: #697b73; }
    .good { color: #0b7048; font-weight: 700; }
    .warn { color: #8b5b00; font-weight: 700; }
    .pending-panel { border-color: #d4a84f; background: #fffaf0; }
    .pending-event { background: #fff8e8; }
    .event-status { font: 700 .72rem ui-monospace, SFMono-Regular, Menlo, monospace; }
    .final-diff { color: #a23434; font-weight: 700; }
    .trait { border: 1px solid #dfe9e4; border-radius: 9px; padding: 14px; margin-top: 10px; break-inside: avoid; }
    .trait-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: baseline; }
    .trait-status { font: 700 .72rem ui-monospace, SFMono-Regular, Menlo, monospace; }
    .kv { margin: 10px 0 0; }
    .kv > div { display: grid; grid-template-columns: minmax(130px, 220px) 1fr; gap: 12px; border-top: 1px solid #edf1ef; padding: 7px 0; }
    .kv dt { color: #667970; font-weight: 700; }
    .kv dd { margin: 0; overflow-wrap: anywhere; }
    ul { margin: 6px 0; padding-left: 22px; }
    blockquote { margin: 8px 0; padding: 10px 12px; border-left: 3px solid #68a88d; background: #f6faf8; white-space: pre-wrap; }
    .proof { margin-top: 9px; border-left: 3px solid #b7c8c0; padding: 8px 10px; background: #fafcfb; }
    .proof.fail { border-left-color: #c26767; }
    .proof.open { border-left-color: #c49a4a; }
    table { width: 100%; border-collapse: collapse; font-size: .88rem; }
    th, td { border-bottom: 1px solid #e3ebe7; text-align: left; padding: 8px 7px; vertical-align: top; overflow-wrap: anywhere; }
    th { color: #53675e; font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; }
    code, pre, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre.source { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .78rem; line-height: 1.5; background: #fbfcfb; border: 1px solid #dfe7e3; padding: 16px; border-radius: 8px; max-height: none; }
    details { margin-top: 10px; }
    summary { cursor: pointer; font-weight: 700; }
    .source-header { display: grid; gap: 5px; margin: 10px 0 12px; font-size: .82rem; }
    .break { break-before: page; }
    .state-split { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
    .state-card { border: 1px solid #dfe9e4; border-radius: 9px; padding: 14px; background: #f8fbf9; }
    .comparison { margin-top: 18px; border: 1px solid #d8e3dd; border-radius: 12px; overflow: hidden; background: #fff; }
    .comparison-head { display: grid; grid-template-columns: minmax(0,1.08fr) minmax(0,.92fr); background: #eef5f1; border-bottom: 1px solid #d8e3dd; }
    .comparison-head > div { padding: 13px 16px; font-weight: 800; }
    .comparison-head > div + div { border-left: 1px solid #d8e3dd; }
    .comparison-row { display: grid; grid-template-columns: minmax(0,1.08fr) minmax(0,.92fr); border-top: 1px solid #edf1ef; break-inside: avoid; }
    .comparison-row:first-of-type { border-top: 0; }
    .comparison-source, .comparison-analysis { padding: 14px 16px; min-width: 0; }
    .comparison-analysis { border-left: 1px solid #d8e3dd; background: #fbfdfc; }
    .comparison-source pre { margin: 7px 0 0; padding: 0; border: 0; background: transparent; white-space: pre-wrap; overflow-wrap: anywhere; font: .79rem/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
    .layer-pill { display: inline-block; margin: 0 6px 6px 0; padding: 3px 7px; border: 1px solid #bed8cc; border-radius: 999px; background: #eef8f3; color: #0b7048; font: 800 .68rem ui-monospace,SFMono-Regular,Menlo,monospace; }
    .unit-meta { color: #697b73; font: .68rem ui-monospace,SFMono-Regular,Menlo,monospace; }
    .analysis-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .82rem; line-height: 1.5; }
    footer { margin-top: 36px; color: #6c7d75; font-size: .78rem; border-top: 1px solid #d8e3dd; padding-top: 14px; }
    @media (max-width: 760px) {
      .state-split, .comparison-head, .comparison-row { grid-template-columns: 1fr; }
      .comparison-head > div + div, .comparison-analysis { border-left: 0; border-top: 1px solid #d8e3dd; }
    }
    @media print {
      body { background: #fff; }
      main { max-width: none; padding: 20px; }
      .panel { box-shadow: none; }
      a { color: inherit; text-decoration: none; }
      details > summary { display: none; }
      details > * { display: block !important; }
      .comparison-head, .comparison-row { grid-template-columns: minmax(0,1.08fr) minmax(0,.92fr); }
      .comparison-analysis { border-left: 1px solid #d8e3dd; border-top: 0; }
    }
  `;
}

function proof_rows(
  title: string,
  value: unknown,
  tone: "pass" | "fail" | "open",
): string {
  const rows =
    title === "Unresolved conditions"
      ? meaningful_unresolved(value)
      : as_records(value);
  if (rows.length === 0) return "";
  return `<section><h4>${html(title)} · ${rows.length}</h4>${rows
    .map((entry) => {
      const source_quote = string_value(entry.source_quote);
      const expected = string_value(entry.expected);
      const observed = string_value(entry.observed);
      const source_section = string_value(entry.source_section);
      return `<div class="proof ${tone}">
      <div class="mono">${html(human_key(proof_item_title(entry)))}</div>
      ${source_quote ? `<blockquote>${html(source_quote)}</blockquote>` : ""}
      ${source_section ? `<div class="muted">Source section: ${html(source_section)}</div>` : ""}
      ${expected || observed ? `<div class="muted">${expected ? `Expected: ${html(expected)}` : ""}${expected && observed ? "<br>" : ""}${observed ? `Observed: ${html(observed)}` : ""}</div>` : ""}
    </div>`;
    })
    .join("")}</section>`;
}

function trait_block(
  trait: json_record,
  detailed: boolean,
  provider_copy_fallback_used: boolean,
): string {
  const trait_class = human_key(trait.trait_class);
  const trait_key = human_key(trait.trait_key);
  const prism_status = human_prism_status(
    trait.prism_verification_status,
    provider_copy_fallback_used,
  );
  const status_class =
    prism_status === "Language did not carry into final bill"
      ? "final-diff"
      : prism_status.includes("verified") || prism_status.includes("supports")
        ? "good"
        : "warn";
  const unresolved = meaningful_unresolved(trait.prism_unresolved_conditions);
  return `<article class="trait">
    <div class="trait-head">
      <div><span class="label">${html(trait_class)}</span><h3>${html(trait_key)}</h3></div>
      <div class="trait-status ${status_class}">${html(prism_status)}</div>
    </div>
    ${render_value(trait.normalized_value_json)}
    ${
      detailed
        ? `
      <div class="grid" style="margin-top:12px">
        <div class="metric"><span class="label">Rosetta</span><b>${html(human_key(trait.rosetta_verification_state ?? trait.verification_state))}</b></div>
        <div class="metric"><span class="label">Source document</span><b>${html(trait.source_document_id ?? "Not observed")}</b></div>
        <div class="metric"><span class="label">Extraction run</span><b>${html(trait.extraction_run_id ?? "Not observed")}</b></div>
        <div class="metric"><span class="label">Confidence</span><b>${html(trait.confidence_score ?? "Not observed")}</b></div>
      </div>
      ${proof_rows("Did not carry into final bill", trait.prism_contradictions, "fail")}
      ${proof_rows("Missing evidence", trait.prism_missing_evidence, "open")}
      ${unresolved.length ? proof_rows("Unresolved conditions", unresolved, "open") : ""}
      ${proof_rows("Supported checks", trait.prism_supported_findings, "pass")}
      <details><summary>Technical receipt</summary>
        <dl class="kv">
          <div><dt>Prism receipt</dt><dd class="mono">${html(trait.prism_verification_receipt_id ?? "Not observed")}</dd></div>
          <div><dt>Prism engine</dt><dd class="mono">${html(trait.prism_engine_version ?? "Not observed")}</dd></div>
          <div><dt>Prism rule set</dt><dd class="mono">${html(trait.prism_rule_set_version ?? "Not observed")}</dd></div>
          <div><dt>Prism input hash</dt><dd class="mono">${html(trait.prism_input_hash ?? "Not observed")}</dd></div>
          <div><dt>Prism output hash</dt><dd class="mono">${html(trait.prism_output_hash ?? "Not observed")}</dd></div>
          <div><dt>Replay key</dt><dd class="mono">${html(trait.prism_deterministic_replay_key ?? "Not observed")}</dd></div>
          <div><dt>Trait fingerprint</dt><dd class="mono">${html(trait.trait_fingerprint ?? "Not observed")}</dd></div>
          <div><dt>Content hash</dt><dd class="mono">${html(trait.content_hash ?? "Not observed")}</dd></div>
        </dl>
      </details>`
        : ""
    }
  </article>`;
}

type source_block_heading = {
  official: string;
  provider_copy: string;
};

function is_provider_copy_fallback(source: rosetta_source_content): boolean {
  return source.source_metadata.provider_copy_fallback_used === true
    || string_value(source.source_metadata.source_fetch_mode)
      === "provider_copy_fallback";
}

function source_block(
  source: rosetta_source_content,
  heading: source_block_heading,
  open = false,
): string {
  const official_source_url =
    string_value(source.source_metadata.docket_official_source_url)
    ?? source.source_url;
  const provider_copy_fallback_used = is_provider_copy_fallback(source);
  const provider_copy_locator_url =
    string_value(source.source_metadata.provider_copy_locator_url)
    ?? string_value(source.source_metadata.provider_copy_retrieval_url)
    ?? string_value(source.source_metadata.docket_source_url)
    ?? source.source_url;
  const provider_copy_retrieval_mode =
    string_value(source.source_metadata.provider_copy_retrieval_mode);
  const provider_copy_verified =
    source.source_metadata.provider_copy_hash_verified === true
    && source.source_metadata.provider_copy_size_verified === true;

  return `<section class="panel source-copy">
    <span class="eyebrow">${provider_copy_fallback_used ? "Verified provider copy" : "Authoritative source copy"}</span>
    <h2>${html(provider_copy_fallback_used ? heading.provider_copy : heading.official)}</h2>
    <div class="source-header">
      <div><b>Official source:</b> ${source_link(official_source_url)}</div>
      ${provider_copy_fallback_used ? `<div><b>Provider locator:</b> ${source_link(provider_copy_locator_url)}</div>` : ""}
      ${provider_copy_fallback_used ? `<div><b>Retrieval path:</b> Official-source transfer failed; Rosetta retrieved the separately identified provider copy${provider_copy_retrieval_mode === "legiscan_api_get_bill_text" ? " through LegiScan's authenticated getBillText API" : provider_copy_retrieval_mode === "legiscan_api_get_amendment" ? " through LegiScan's authenticated getAmendment API" : ""}${provider_copy_verified ? " and verified its exact hash and byte size before parsing" : ""}.</div>` : ""}
      <div><b>Rosetta source version:</b> ${html(source.source_version)}</div>
      <div><b>Source document ID:</b> ${html(source.source_document_id)}</div>
      <div><b>Source content hash:</b> <span class="mono">${html(source.source_content_hash)}</span></div>
      <div><b>Original byte hash:</b> <span class="mono">${html(source.source_byte_hash ?? "Not observed")}</span></div>
      <div><b>Source identity hash:</b> <span class="mono">${html(source.source_identity_hash)}</span></div>
    </div>
    <details ${open ? "open" : ""}>
      <summary>Full source text used by Rosetta</summary>
      <pre class="source">${html(source.source_text)}</pre>
    </details>
  </section>`;
}

const current_layer_labels: Record<string, string> = {
  H: "Help",
  W: "Workflow",
  A: "Accountability",
  O: "Override",
  D: "Definition",
  R: "Rule · current classifier",
};

function current_rosetta_layer_counts(detail: current_rosetta_live_detail | null): json_record {
  return as_record(detail?.decomposition?.layer_counts) ?? {};
}

function render_current_rosetta_comparison(detail: current_rosetta_live_detail | null): string {
  if (!detail) {
    return `<section class="panel"><span class="eyebrow">Law ↔ Rosetta</span><h2>Current decomposition not available</h2><p class="warn">The exact current source remains identifiable, but no selected-runtime Rosetta decomposition is available for this source. Historical decomposition is not substituted.</p></section>`;
  }
  if (!detail.decomposition) {
    const hold = detail.hold_receipt;
    return `<section class="panel"><span class="eyebrow">Law ↔ Rosetta</span><h2>No decomposed current result</h2><p class="warn">Rosetta has no selected-runtime decomposition for this exact source.${hold ? ` Hold: ${html(hold.gate ?? hold.reason ?? "recorded")}` : ""}</p></section>`;
  }

  const rows = detail.units.map((unit) => {
    const labels = unit.layers.length
      ? unit.layers.map(layer => `<span class="layer-pill">${html(current_layer_labels[layer] ?? layer)}</span>`).join("")
      : unit.disposition === "STRUCT"
        ? '<span class="layer-pill">Structure block</span>'
        : unit.disposition === "DELETED"
          ? '<span class="layer-pill">Deleted source span</span>'
          : '<span class="layer-pill">Unresolved source span</span>';
    const source_text = unit.raw_text || detail.source.source_text.slice(unit.raw_start, unit.raw_end);
    const effective_text = unit.effective_text ?? unit.raw_text;
    return `<div class="comparison-row">
      <div class="comparison-source">
        <div class="unit-meta">section ${html(unit.section_ord ?? "—")} · span ${html(unit.raw_start)}–${html(unit.raw_end)}</div>
        <pre>${html(source_text)}</pre>
      </div>
      <div class="comparison-analysis">
        <div>${labels}</div>
        <div class="unit-meta">unit ${html(unit.unit_ord)} · ${html(unit.disposition ?? unit.kind ?? "classified")}</div>
        ${effective_text && effective_text !== source_text ? `<div class="analysis-text">${html(effective_text)}</div>` : ""}
      </div>
    </div>`;
  }).join("");

  return `<section class="comparison">
    <div class="comparison-head"><div>LAW · exact preserved source spans</div><div>ROSETTA · selected-runtime decomposition</div></div>
    ${rows || '<div class="comparison-row"><div class="comparison-source">No source-bound units recorded.</div><div class="comparison-analysis">No decomposition objects recorded.</div></div>'}
  </section>`;
}

export type current_law_report_snapshot = {
  current_version: json_record | null;
  source: rosetta_source_content | null;
  rosetta: current_rosetta_live_detail | null;
  rosetta_availability: "available" | "not_observed" | "error";
  rosetta_error: string | null;
};

export async function build_current_law_report_snapshot(
  payload: unknown,
): Promise<current_law_report_snapshot> {
  const root = as_record(payload);
  const bill_detail = as_record(root?.bill_detail);
  const current_version = as_record(bill_detail?.current_version);
  const source_document_id = positive_integer(current_version?.source_document_id);
  const source_content_hash = string_value(current_version?.source_content_hash);
  if (
    !source_document_id ||
    !source_content_hash ||
    !/^[0-9a-f]{64}$/i.test(source_content_hash)
  ) {
    return {
      current_version,
      source: null,
      rosetta: null,
      rosetta_availability: "not_observed",
      rosetta_error: null,
    };
  }
  const [source] = await load_rosetta_source_content(
    [source_document_id],
    new Map([[source_document_id, source_content_hash]]),
  );
  if (!source) {
    return {
      current_version,
      source: null,
      rosetta: null,
      rosetta_availability: "not_observed",
      rosetta_error: null,
    };
  }
  try {
    const rosetta = await get_current_rosetta_live_detail({
      source_content_id: source.source_content_id,
      source_content_hash: source.source_content_hash,
    });
    return {
      current_version,
      source,
      rosetta,
      rosetta_availability: rosetta ? "available" : "not_observed",
      rosetta_error: null,
    };
  } catch (error) {
    return {
      current_version,
      source,
      rosetta: null,
      rosetta_availability: "error",
      rosetta_error: error instanceof Error ? error.message : "current_rosetta_read_failed",
    };
  }
}

function safe_url(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

function compare_source_versions(left: json_record, right: json_record): number {
  const left_date = string_value(left.provider_date);
  const right_date = string_value(right.provider_date);
  if (!left_date && right_date) return 1;
  if (left_date && !right_date) return -1;
  return (left_date ?? "").localeCompare(right_date ?? "") ||
    Number(left.provider_sequence ?? 0) - Number(right.provider_sequence ?? 0);
}

function version_table(
  versions: json_record[],
  source_by_document: Map<number, rosetta_source_content>,
): string {
  const ordered = [...versions].sort(compare_source_versions);
  return `<table><thead><tr><th>Stage / source identity</th><th>State</th><th>Rosetta source</th><th>Run</th><th>Source copy</th></tr></thead><tbody>${ordered
    .map((version) => {
      const source_document_id = positive_integer(
        version.rosetta_source_document_id,
      );
      return `<tr>
      <td>${html(human_key(version.version_type))}<br><span class="mono">${html(version.source_document_key ?? "")}</span><br>${html(format_date(version.provider_date))}${safe_url(version.source_url) ? `<br><a href="${html(safe_url(version.source_url))}">Read source text</a>` : ""}</td>
      <td>${html(human_key(version.processing_state))}</td>
      <td class="mono">${html(source_document_id ?? "Not observed")}</td>
      <td class="mono">${html(version.rosetta_extraction_run_id ?? "Not observed")}</td>
      <td>${source_document_id && source_by_document.has(source_document_id) ? "Included below" : "Not attached"}</td>
    </tr>`;
    })
    .join("")}</tbody></table>`;
}

export async function render_civic_genome_human_report(
  payload: unknown,
  mode: civic_genome_report_mode,
): Promise<string> {
  const root = as_record(payload);
  const bill_detail = as_record(root?.bill_detail);
  const bill = as_record(bill_detail?.bill);
  const structural_dna = as_record(bill_detail?.structural_dna);
  if (!root || !bill_detail || !bill || !structural_dna) {
    throw new Error("civic_genome_human_report_payload_incomplete");
  }

  const source_bill_id = positive_integer(root.source_bill_id);
  if (!source_bill_id)
    throw new Error("civic_genome_human_report_source_bill_id_missing");

  const versions = as_records(root.bill_versions);
  const current_version = as_record(bill_detail.current_version);
  const published_version = as_record(bill_detail.published_version);
  const final_source_document_id = positive_integer(
    published_version?.source_document_id ??
      current_version?.source_document_id,
  );

  const source_document_ids = versions
    .map((version) => positive_integer(version.rosetta_source_document_id))
    .filter((value): value is number => Boolean(value));
  if (final_source_document_id && !source_document_ids.includes(final_source_document_id))
    source_document_ids.push(final_source_document_id);
  const source_rows = await load_rosetta_source_content(source_document_ids);
  const source_by_document = new Map(
    source_rows.map((row) => [row.source_document_id, row]),
  );
  const final_source = final_source_document_id ? source_by_document.get(final_source_document_id) : undefined;
  if (published_version?.source_document_id && !final_source?.source_text) {
    throw new Error("civic_genome_human_report_verified_source_text_unavailable");
  }
  const final_source_uses_provider_copy = final_source ? is_provider_copy_fallback(final_source) : false;
  const source_gap = !final_source
    ? '<section class="panel"><h2>Source decomposition pending</h2><p class="warn">No exact Rosetta source copy is attached for this snapshot. This report contains available source-version metadata and procedural observations only; it does not establish validated bill content or amendment effects.</p></section>'
    : "";

  const traits = final_source ? as_records(structural_dna.traits) : [];
  const validation = final_source ? as_record(structural_dna.validation_summary) ?? {} : {};
  const family_assignment = as_record(bill_detail.family_assignment);
  const all_traits = final_source ? as_records(root.all_structural_traits) : [];
  const all_runs = final_source ? as_records(root.all_assembly_runs) : [];
  const events = as_records(root.bill_events);
  const presented_events = events.map((event) => ({
    event,
    presentation: event_temporal_presentation(event),
  }));
  const confirmed_event_count = presented_events.filter(
    ({ presentation }) => presentation.confirmed,
  ).length;
  const pending_event_count = presented_events.filter(
    ({ presentation }) => presentation.pending,
  ).length;
  const pending_events = presented_events.filter(
    ({ presentation }) => presentation.pending,
  );
  const unclassified_event_count =
    events.length - confirmed_event_count - pending_event_count;
  const lineage = as_records(root.lineage_edges);
  const family = as_record(root.family);
  const temporal_facts = as_record(root.bill_temporal_facts);
  const detailed = mode === "detailed";
  const law_decomposition = mode === "law_decomposition";
  const current_snapshot = law_decomposition
    ? await build_current_law_report_snapshot(root)
    : null;
  const current_rosetta = current_snapshot?.rosetta ?? null;
  const current_layer_counts = current_rosetta_layer_counts(current_rosetta);

  const trait_groups = new Map<string, json_record[]>();
  for (const trait of traits) {
    const key = string_value(trait.trait_class) ?? "unclassified";
    trait_groups.set(key, [...(trait_groups.get(key) ?? []), trait]);
  }
  const layer_summary = [...trait_groups.entries()]
    .map(
      ([key, rows]) =>
        `<div class="metric"><span class="label">${html(human_key(key))}</span><b>${rows.length}</b></div>`,
    )
    .join("");

  const bill_number =
    string_value(bill.source_bill_number) ?? `Bill ${source_bill_id}`;
  const bill_title = string_value(bill.source_bill_title) ?? "Untitled bill";
  const state = string_value(bill.state_code) ?? "Unknown jurisdiction";
  const session = string_value(bill.session_key) ?? "Unknown session";
  const report_title = `${bill_number} — ${mode === "summary" ? "Civic Genome Summary" : mode === "detailed" ? "Civic Genome Detailed Report" : "Law ↔ Rosetta Report"}`;

  const summary_pending_section = mode === "summary" && pending_events.length > 0
    ? `
    <section class="panel pending-panel">
      <span class="eyebrow">Pending source evidence</span>
      <h2>Provider-reported actions awaiting confirmation</h2>
      <p class="warn">These ${pending_events.length} record${pending_events.length === 1 ? " is" : "s are"} preserved as evidence but not counted as confirmed legislative history.</p>
      <table><thead><tr><th>Provider-reported time</th><th>Observed by Lighthouse</th><th>Type</th><th>Action</th></tr></thead><tbody>${pending_events.map(({ event }) => `<tr class="pending-event"><td>${html(format_date(event.event_at ?? event.valid_at ?? event.event_timestamp))}</td><td>${html(format_date(event.observed_at ?? event.created_at))}</td><td>${html(human_key(event.event_type))}</td><td>${html(event.action_text ?? as_record(event.event_payload_json)?.event_summary ?? "Recorded source event")}</td></tr>`).join("")}</tbody></table>
    </section>`
    : "";

  const current_traits_html = [...trait_groups.entries()]
    .map(
      ([group, rows]) => `
    <section class="panel">
      <span class="eyebrow">Structural DNA</span>
      <h2>${html(human_key(group))}</h2>
      ${rows.map((row) => trait_block(row, detailed, final_source_uses_provider_copy)).join("")}
    </section>`,
    )
    .join("");

  const current_analysis_state = law_decomposition
    ? `<section class="panel">
      <span class="eyebrow">Current law and analysis state</span>
      <div class="state-split">
        <div class="state-card">
          <span class="label">LAW</span>
          <h3>${html(version_label(current_version))}</h3>
          <p>${html(current_version?.source_document_key ?? "Exact source key not observed")}</p>
          <div class="unit-meta">Source document ${html(current_snapshot?.source?.source_document_id ?? "not observed")} · content ${html(current_snapshot?.source?.source_content_id ?? "not observed")}</div>
        </div>
        <div class="state-card">
          <span class="label">ANALYSIS</span>
          <h3>${current_rosetta?.decomposition ? html(human_key(current_rosetta.decomposition.outcome ?? "decomposed")) : current_snapshot?.rosetta_availability === "error" ? "Current Rosetta read unavailable" : "Current decomposition not observed"}</h3>
          <p>${current_rosetta ? html(current_rosetta.target.ruleset_version ?? "Selected runtime") : "Historical decomposition is not substituted."}</p>
          ${current_snapshot?.rosetta_error ? `<div class="unit-meta">${html(current_snapshot.rosetta_error)}</div>` : ""}
        </div>
      </div>
    </section>

    <section class="panel">
      <span class="eyebrow">Current Rosetta coverage</span>
      <h2>Selected-runtime decomposition</h2>
      <div class="grid">
        ${["H","W","A","O","D","R"].map(layer => `<div class="metric"><span class="label">${html(current_layer_labels[layer])}</span><b>${html(current_layer_counts[layer] ?? 0)}</b></div>`).join("")}
        <div class="metric"><span class="label">Units</span><b>${html(current_rosetta?.decomposition?.unit_count ?? current_rosetta?.units.length ?? 0)}</b></div>
        <div class="metric"><span class="label">Sections</span><b>${html(current_rosetta?.decomposition?.section_count ?? current_rosetta?.sections.length ?? 0)}</b></div>
      </div>
      <p class="subhead">R is displayed exactly as the selected Rosetta runtime classifies it. This presentation does not promote Rule into Civic Genome's permanent canonical ontology.</p>
    </section>

    ${render_current_rosetta_comparison(current_rosetta)}
  `
    : "";

  const detailed_sections = detailed
    ? `
    <section class="panel break">
      <span class="eyebrow">Version lineage</span>
      <h2>Legislative text versions</h2>
      <p class="subhead">Each version remains separately identifiable. A later legislative version state does not erase the earlier source.</p>
      ${version_table(versions, source_by_document)}
    </section>

    <section class="panel">
      <span class="eyebrow">Civic Genome history</span>
      <h2>Events and lineage edges</h2>
      <div class="grid">
        <div class="metric"><span class="label">Confirmed events</span><b>${confirmed_event_count}</b></div>
        <div class="metric"><span class="label">Pending provider records</span><b>${pending_event_count}</b></div>
        ${unclassified_event_count > 0 ? `<div class="metric"><span class="label">Confirmation unavailable</span><b>${unclassified_event_count}</b></div>` : ""}
        <div class="metric"><span class="label">Lineage edges</span><b>${lineage.length}</b></div>
        <div class="metric"><span class="label">Historical structural traits</span><b>${all_traits.length}</b></div>
        <div class="metric"><span class="label">Assembly runs</span><b>${all_runs.length}</b></div>
      </div>
      <p class="subhead">Legal event time and Lighthouse observation time are shown separately. Future-dated provider records are preserved as pending evidence and are not assertions that the action occurred. Neither clock is an extraction-run timestamp.</p>
      ${events.length ? `<details><summary>Event ledger</summary><table><thead><tr><th>Legal event time</th><th>Observed by Lighthouse</th><th>Confirmation status</th><th>Type</th><th>Action</th></tr></thead><tbody>${presented_events.map(({ event, presentation }) => `<tr class="${presentation.row_class}"><td>${html(format_date(event.event_at ?? event.valid_at ?? event.event_timestamp))}</td><td>${html(format_date(event.observed_at ?? event.created_at))}</td><td><span class="event-status ${presentation.status_class}">${html(presentation.label)}</span></td><td>${html(human_key(event.event_type))}</td><td>${html(event.action_text ?? as_record(event.event_payload_json)?.event_summary ?? "Recorded source event")}</td></tr>`).join("")}</tbody></table></details>` : ""}
      ${lineage.length ? `<details><summary>Lineage edge ledger</summary>${render_value(lineage)}</details>` : ""}
    </section>

    <section class="panel">
      <span class="eyebrow">Technical appendix</span>
      <h2>Assembly and deterministic receipts</h2>
      <p class="subhead">Run dates below are processing receipts: they say when Rosetta assembled a particular source document, not when the Legislature acted.</p>
      ${all_runs.length ? `<table><thead><tr><th>Run</th><th>Source</th><th>Recorded</th><th>Engine</th><th>Verification</th><th>Output hash</th></tr></thead><tbody>${all_runs.map((run) => `<tr><td class="mono">${html(run.assembly_run_id)}</td><td class="mono">${html(run.source_document_id)}</td><td>${html(format_date(run.created_at))}</td><td class="mono">${html(run.engine_version)}</td><td>${html(human_key(run.verification_state))}</td><td class="mono">${html(run.output_hash)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No assembly runs attached.</p>'}
    </section>

    <div class="break"></div>
    ${versions
      .slice()
      .sort(compare_source_versions)
      .map((version) => {
        const source_document_id = positive_integer(
          version.rosetta_source_document_id,
        );
        const source = source_document_id
          ? source_by_document.get(source_document_id)
          : null;
        if (!source)
          return `<section class="panel"><h2>${html(human_key(version.version_type))}</h2><p class="warn">Rosetta source copy was not attached for this version. The gap is preserved rather than substituted.</p></section>`;
        return source_block(
          source,
          {
            official: `${human_key(version.version_type)} — full official-source snapshot`,
            provider_copy: `${human_key(version.version_type)} — full verified provider-copy snapshot analyzed by Rosetta`,
          },
          false,
        );
      })
      .join("")}
  `
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(report_title)}</title>
<style>${report_css()}</style>
</head>
<body>
<main>
  <header>
    <span class="eyebrow">Luminari · Living Civic Genome</span>
    <h1>${html(report_title)}</h1>
    <p class="subhead">${html(state)} · ${html(session)} · ${html(bill_title)}</p>
    <p class="subhead">${law_decomposition ? "This report binds the exact current source copy to Rosetta’s selected-runtime decomposition. Historical decomposition is not substituted when a current result is unavailable." : "This report is rendered from existing Docket, Civic Genome, Rosetta, and Prism records. It does not re-run analysis, infer motive, or rewrite historical receipts."}</p>
  </header>

  <section class="panel">
    <span class="eyebrow">Bill at a glance</span>
    <h2>${html(bill_number)} — ${html(bill_title)}</h2>
    <div class="grid">
      <div class="metric"><span class="label">Jurisdiction</span><b>${html(state)}</b></div>
      <div class="metric"><span class="label">Session</span><b>${html(session)}</b></div>
      <div class="metric"><span class="label">Bill status</span><b>${html(human_key(bill.bill_status))}</b></div>
      <div class="metric"><span class="label">Last legislative action</span><b>${html(format_date(temporal_facts?.last_action_at ?? bill.last_action_at))}</b></div>
      <div class="metric"><span class="label">Enacted</span><b>${html(format_date(temporal_facts?.enacted_at ?? bill.enacted_at))}</b></div>
      <div class="metric"><span class="label">Effective</span><b>${html(format_date(temporal_facts?.effective_at ?? bill.effective_at))}</b></div>
      <div class="metric"><span class="label">Last observed</span><b>${html(format_date(temporal_facts?.last_observed_at ?? bill.last_observed_at))}</b></div>
      <div class="metric"><span class="label">Confirmed events</span><b>${confirmed_event_count}</b></div>
      <div class="metric"><span class="label">Pending provider records</span><b>${pending_event_count}</b></div>
      ${unclassified_event_count > 0 ? `<div class="metric"><span class="label">Confirmation unavailable</span><b>${unclassified_event_count}</b></div>` : ""}
      <div class="metric"><span class="label">Current version</span><b>${html(version_label(current_version))}</b></div>
      <div class="metric"><span class="label">Highest verified version</span><b>${html(version_label(published_version))}</b></div>
    </div>
    ${bill.last_action_summary ? `<p><b>Latest source action:</b> ${html(bill.last_action_summary)}</p>` : ""}
    <p class="subhead">These are source-event dates. Rosetta extraction receipts and Lighthouse observation receipts retain their own separately labeled timestamps.</p>
  </section>

  ${law_decomposition ? (current_snapshot?.source ? "" : `<section class="panel"><h2>Current source unavailable</h2><p class="warn">The exact current source copy is not attached; the report will not substitute a historical source.</p></section>`) : source_gap}
  ${mode === "summary" ? `<section class="panel"><h2>Legislative text versions</h2>${version_table(versions, source_by_document)}</section>` : ""}
  ${summary_pending_section}

  ${law_decomposition ? current_analysis_state : `
  <section class="panel">
    <span class="eyebrow">${final_source ? "Recorded structural state" : "Decomposition unavailable"}</span>
    <h2>What the current Civic Genome snapshot contains</h2>
    <div class="grid">
      ${layer_summary || '<div class="metric"><span class="label">Structural traits</span><b>None observed</b></div>'}
      <div class="metric"><span class="label">${final_source_uses_provider_copy ? "Provider-copy text supported" : "Official-source supported"}</span><b>${html(validation.supported ?? 0)}</b></div>
      <div class="metric"><span class="label">Did not carry into final bill</span><b>${html(validation.contradicted ?? 0)}</b></div>
      <div class="metric"><span class="label">Unresolved</span><b>${html(validation.unresolved ?? 0)}</b></div>
    </div>
    ${family ? `<p><b>Family:</b> ${html(family.family_label ?? family.family_id ?? "Not observed")}</p>` : ""}
    ${family_assignment ? `<p><b>Family assignment:</b> ${html(human_key(family_assignment.status))}</p>` : ""}
    ${final_source_uses_provider_copy ? '<p class="warn">Support counts reflect deterministic checks against a hash- and byte-size-verified provider copy. They do not assert that Rosetta retrieved or independently confirmed the analyzed text from the official legislative source.</p>' : ""}
  </section>

  ${current_traits_html || '<section class="panel"><h2>No published structural traits</h2><p class="muted">No structural DNA objects are attached to the highest verified snapshot.</p></section>'}`}

  ${law_decomposition ? "" : detailed_sections}

  <div class="break"></div>
  ${law_decomposition
    ? current_snapshot?.source
      ? source_block(current_snapshot.source, {
          official: `${human_key(current_version?.version_type ?? "current")} — full exact current source`,
          provider_copy: `${human_key(current_version?.version_type ?? "current")} — full verified provider copy for the exact current source`,
        }, false)
      : ""
    : final_source ? source_block(final_source, {
        official: `${human_key(published_version?.version_type ?? current_version?.version_type ?? "authoritative")} — full authoritative source used by Rosetta`,
        provider_copy: `${human_key(published_version?.version_type ?? current_version?.version_type ?? "source")} — full verified provider copy analyzed by Rosetta`,
      }, true) : ""}

  <footer>
    <div>Exported: ${html(format_date(root.exported_at))}</div>
    <div>Source bill ID: ${html(source_bill_id)} · Genome bill ID: <span class="mono">${html(root.genome_bill_id)}</span></div>
    <div>${law_decomposition ? "The companion Machine JSON carries the same current-source identity and selected-runtime Rosetta record." : "Machine JSON remains available as the technical companion export."}</div>
  </footer>
</main>
</body>
</html>`;
}
