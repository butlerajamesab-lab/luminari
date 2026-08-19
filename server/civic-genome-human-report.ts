import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";

export type civic_genome_report_mode = "summary" | "detailed";

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

const NO_SECOND_SOURCE_CONDITION = "independent_authoritative_source_not_supplied";

function as_record(value: unknown): json_record | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as json_record
    : null;
}

function as_records(value: unknown): json_record[] {
  return Array.isArray(value)
    ? value.map(as_record).filter((row): row is json_record => Boolean(row))
    : [];
}

function string_value(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
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

function human_key(value: unknown): string {
  const raw = string_value(value) ?? "Recorded field";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function human_prism_status(value: unknown): string {
  const raw = string_value(value);
  if (!raw) return "Prism receipt not attached in this read model";
  if (raw === "supported_by_one_source") return "Official legislative source verified";
  if (raw === "independent_authoritative_source_not_supplied") return "Official legislative source verified";
  if (raw === "contradicted") return "Language did not carry into final bill";
  if (raw === "incomplete") return "Verification incomplete";
  return human_key(raw);
}

function proof_item_title(entry: json_record): string {
  return string_value(entry.check)
    ?? string_value(entry.finding)
    ?? string_value(entry.requirement)
    ?? string_value(entry.condition)
    ?? "Recorded proof item";
}

function meaningful_unresolved(value: unknown): json_record[] {
  return as_records(value).filter(entry => proof_item_title(entry) !== NO_SECOND_SOURCE_CONDITION);
}

function render_value(value: unknown): string {
  if (value === null || value === undefined) return '<span class="muted">Not observed</span>';
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="muted">None</span>';
    return `<ul>${value.map(item => `<li>${render_value(item)}</li>`).join("")}</ul>`;
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
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
}

function required_rosetta_config() {
  const base_url = process.env.ROSETTA_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.ROSETTA_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base_url || !key) throw new Error("civic_genome_human_report_rosetta_source_access_not_configured");
  return { base_url, key };
}

async function load_rosetta_source_content(source_document_ids: number[]): Promise<rosetta_source_content[]> {
  const unique_ids = [...new Set(source_document_ids.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (unique_ids.length === 0) return [];

  const { base_url, key } = required_rosetta_config();
  const query = new URLSearchParams({
    select: "source_content_id,source_document_id,source_version,source_url,media_type,source_text,source_content_hash,source_byte_hash,source_provider_hash,source_identity_hash,source_metadata,created_at",
    source_document_id: `in.(${unique_ids.join(",")})`,
    order: "created_at.desc",
  });
  const headers = create_rosetta_supabase_headers(key, { accept: "application/json" });
  const response = await fetch(`${base_url}/rest/v1/source_document_content?${query.toString()}`, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`civic_genome_human_report_rosetta_source_fetch_failed:${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("civic_genome_human_report_rosetta_source_invalid_response");

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
    if (!source_text || !source_url || !source_content_hash || !source_identity_hash) continue;
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
    footer { margin-top: 36px; color: #6c7d75; font-size: .78rem; border-top: 1px solid #d8e3dd; padding-top: 14px; }
    @media print { body { background: #fff; } main { max-width: none; padding: 20px; } .panel { box-shadow: none; } a { color: inherit; text-decoration: none; } details > summary { display: none; } details > * { display: block !important; } }
  `;
}

function proof_rows(title: string, value: unknown, tone: "pass" | "fail" | "open"): string {
  const rows = title === "Unresolved conditions" ? meaningful_unresolved(value) : as_records(value);
  if (rows.length === 0) return "";
  return `<section><h4>${html(title)} · ${rows.length}</h4>${rows.map(entry => {
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
  }).join("")}</section>`;
}

function trait_block(trait: json_record, detailed: boolean): string {
  const trait_class = human_key(trait.trait_class);
  const trait_key = human_key(trait.trait_key);
  const prism_status = human_prism_status(trait.prism_verification_status);
  const status_class = prism_status === "Language did not carry into final bill"
    ? "final-diff"
    : prism_status.includes("verified")
      ? "good"
      : "warn";
  const unresolved = meaningful_unresolved(trait.prism_unresolved_conditions);
  return `<article class="trait">
    <div class="trait-head">
      <div><span class="label">${html(trait_class)}</span><h3>${html(trait_key)}</h3></div>
      <div class="trait-status ${status_class}">${html(prism_status)}</div>
    </div>
    ${render_value(trait.normalized_value_json)}
    ${detailed ? `
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
      </details>` : ""}
  </article>`;
}

function source_block(source: rosetta_source_content, heading: string, open = false): string {
  return `<section class="panel source-copy">
    <span class="eyebrow">Authoritative source copy</span>
    <h2>${html(heading)}</h2>
    <div class="source-header">
      <div><b>Official source:</b> <a href="${html(source.source_url)}">${html(source.source_url)}</a></div>
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

function version_table(versions: json_record[], source_by_document: Map<number, rosetta_source_content>): string {
  const ordered = [...versions].sort((left, right) => {
    const left_rank = Number(left.stage_rank ?? 0);
    const right_rank = Number(right.stage_rank ?? 0);
    if (left_rank !== right_rank) return left_rank - right_rank;
    return Number(left.provider_sequence ?? 0) - Number(right.provider_sequence ?? 0);
  });
  return `<table><thead><tr><th>Stage</th><th>State</th><th>Rosetta source</th><th>Run</th><th>Source copy</th></tr></thead><tbody>${ordered.map(version => {
    const source_document_id = positive_integer(version.rosetta_source_document_id);
    return `<tr>
      <td>${html(human_key(version.version_type))}</td>
      <td>${html(human_key(version.processing_state))}</td>
      <td class="mono">${html(source_document_id ?? "Not observed")}</td>
      <td class="mono">${html(version.rosetta_extraction_run_id ?? "Not observed")}</td>
      <td>${source_document_id && source_by_document.has(source_document_id) ? "Included below" : "Not attached"}</td>
    </tr>`;
  }).join("")}</tbody></table>`;
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
  if (!source_bill_id) throw new Error("civic_genome_human_report_source_bill_id_missing");

  const versions = as_records(root.bill_versions);
  const current_version = as_record(bill_detail.current_version);
  const published_version = as_record(bill_detail.published_version);
  const final_source_document_id = positive_integer(published_version?.source_document_id ?? current_version?.source_document_id);
  if (!final_source_document_id) throw new Error("civic_genome_human_report_verified_source_not_bound");

  const source_document_ids = versions
    .map(version => positive_integer(version.rosetta_source_document_id))
    .filter((value): value is number => Boolean(value));
  if (!source_document_ids.includes(final_source_document_id)) source_document_ids.push(final_source_document_id);
  const source_rows = await load_rosetta_source_content(source_document_ids);
  const source_by_document = new Map(source_rows.map(row => [row.source_document_id, row]));
  const final_source = source_by_document.get(final_source_document_id);
  if (!final_source?.source_text) throw new Error("civic_genome_human_report_verified_source_text_unavailable");

  const traits = as_records(structural_dna.traits);
  const validation = as_record(structural_dna.validation_summary) ?? {};
  const family_assignment = as_record(bill_detail.family_assignment);
  const all_traits = as_records(root.all_structural_traits);
  const all_runs = as_records(root.all_assembly_runs);
  const events = as_records(root.bill_events);
  const lineage = as_records(root.lineage_edges);
  const family = as_record(root.family);
  const detailed = mode === "detailed";

  const trait_groups = new Map<string, json_record[]>();
  for (const trait of traits) {
    const key = string_value(trait.trait_class) ?? "unclassified";
    trait_groups.set(key, [...(trait_groups.get(key) ?? []), trait]);
  }
  const layer_summary = [...trait_groups.entries()]
    .map(([key, rows]) => `<div class="metric"><span class="label">${html(human_key(key))}</span><b>${rows.length}</b></div>`)
    .join("");

  const bill_number = string_value(bill.source_bill_number) ?? `Bill ${source_bill_id}`;
  const bill_title = string_value(bill.source_bill_title) ?? "Untitled bill";
  const state = string_value(bill.state_code) ?? "Unknown jurisdiction";
  const session = string_value(bill.session_key) ?? "Unknown session";
  const report_title = `${bill_number} — ${mode === "summary" ? "Civic Genome Summary" : "Civic Genome Detailed Report"}`;

  const current_traits_html = [...trait_groups.entries()].map(([group, rows]) => `
    <section class="panel">
      <span class="eyebrow">Structural DNA</span>
      <h2>${html(human_key(group))}</h2>
      ${rows.map(row => trait_block(row, detailed)).join("")}
    </section>`).join("");

  const detailed_sections = detailed ? `
    <section class="panel break">
      <span class="eyebrow">Version lineage</span>
      <h2>Legislative text versions</h2>
      <p class="subhead">Each version remains separately identifiable. A later authoritative state does not erase the earlier source.</p>
      ${version_table(versions, source_by_document)}
    </section>

    <section class="panel">
      <span class="eyebrow">Civic Genome history</span>
      <h2>Events and lineage edges</h2>
      <div class="grid">
        <div class="metric"><span class="label">Events</span><b>${events.length}</b></div>
        <div class="metric"><span class="label">Lineage edges</span><b>${lineage.length}</b></div>
        <div class="metric"><span class="label">Historical structural traits</span><b>${all_traits.length}</b></div>
        <div class="metric"><span class="label">Assembly runs</span><b>${all_runs.length}</b></div>
      </div>
      ${events.length ? `<details><summary>Event ledger</summary><table><thead><tr><th>Date</th><th>Type</th><th>Payload</th></tr></thead><tbody>${events.map(event => `<tr><td>${html(format_date(event.event_at ?? event.created_at))}</td><td>${html(human_key(event.event_type))}</td><td>${render_value(event.event_payload_json ?? event.event_data_json ?? event)}</td></tr>`).join("")}</tbody></table></details>` : ""}
      ${lineage.length ? `<details><summary>Lineage edge ledger</summary>${render_value(lineage)}</details>` : ""}
    </section>

    <section class="panel">
      <span class="eyebrow">Technical appendix</span>
      <h2>Assembly and deterministic receipts</h2>
      ${all_runs.length ? `<table><thead><tr><th>Run</th><th>Source</th><th>Engine</th><th>Verification</th><th>Output hash</th></tr></thead><tbody>${all_runs.map(run => `<tr><td class="mono">${html(run.assembly_run_id)}</td><td class="mono">${html(run.source_document_id)}</td><td class="mono">${html(run.engine_version)}</td><td>${html(human_key(run.verification_state))}</td><td class="mono">${html(run.output_hash)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No assembly runs attached.</p>'}
    </section>

    <div class="break"></div>
    ${versions
      .slice()
      .sort((a, b) => Number(a.stage_rank ?? 0) - Number(b.stage_rank ?? 0))
      .map(version => {
        const source_document_id = positive_integer(version.rosetta_source_document_id);
        const source = source_document_id ? source_by_document.get(source_document_id) : null;
        if (!source) return `<section class="panel"><h2>${html(human_key(version.version_type))}</h2><p class="warn">Rosetta source copy was not attached for this version. The gap is preserved rather than substituted.</p></section>`;
        return source_block(source, `${human_key(version.version_type)} — full source snapshot`, false);
      }).join("")}
  ` : "";

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
    <p class="subhead">This report is rendered from existing Docket, Civic Genome, Rosetta, and Prism records. It does not re-run analysis, infer motive, or rewrite historical receipts.</p>
  </header>

  <section class="panel">
    <span class="eyebrow">Bill at a glance</span>
    <h2>${html(bill_number)} — ${html(bill_title)}</h2>
    <div class="grid">
      <div class="metric"><span class="label">Jurisdiction</span><b>${html(state)}</b></div>
      <div class="metric"><span class="label">Session</span><b>${html(session)}</b></div>
      <div class="metric"><span class="label">Bill status</span><b>${html(human_key(bill.bill_status))}</b></div>
      <div class="metric"><span class="label">Last action</span><b>${html(format_date(bill.last_action_at))}</b></div>
      <div class="metric"><span class="label">Current version</span><b>${html(version_label(current_version))}</b></div>
      <div class="metric"><span class="label">Highest verified version</span><b>${html(version_label(published_version))}</b></div>
    </div>
  </section>

  <section class="panel">
    <span class="eyebrow">Current verified structural state</span>
    <h2>What the current Civic Genome snapshot contains</h2>
    <div class="grid">
      ${layer_summary || '<div class="metric"><span class="label">Structural traits</span><b>None observed</b></div>'}
      <div class="metric"><span class="label">Official-source supported</span><b>${html(validation.supported ?? 0)}</b></div>
      <div class="metric"><span class="label">Did not carry into final bill</span><b>${html(validation.contradicted ?? 0)}</b></div>
      <div class="metric"><span class="label">Unresolved</span><b>${html(validation.unresolved ?? 0)}</b></div>
    </div>
    ${family ? `<p><b>Family:</b> ${html(family.family_label ?? family.family_id ?? "Not observed")}</p>` : ""}
    ${family_assignment ? `<p><b>Family assignment:</b> ${html(human_key(family_assignment.status))}</p>` : ""}
  </section>

  ${current_traits_html || '<section class="panel"><h2>No published structural traits</h2><p class="muted">No structural DNA objects are attached to the highest verified snapshot.</p></section>'}

  ${detailed_sections}

  <div class="break"></div>
  ${source_block(final_source, `${human_key(published_version?.version_type ?? current_version?.version_type ?? "authoritative")} — full authoritative source used by Rosetta`, true)}

  <footer>
    <div>Exported: ${html(format_date(root.exported_at))}</div>
    <div>Source bill ID: ${html(source_bill_id)} · Genome bill ID: <span class="mono">${html(root.genome_bill_id)}</span></div>
    <div>Machine JSON remains available as the technical companion export.</div>
  </footer>
</main>
</body>
</html>`;
}
