import { useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const mono = "'IBM Plex Mono', monospace";
const muted = "#a7bdb4";
const border = "1px solid rgba(82,193,145,.22)";
const statuses = {
  complete: "Decomposition complete",
  requires_review: "Requires review",
  awaiting_analysis: "Awaiting analysis",
  unavailable: "Unavailable",
};
const colors = {
  complete: "#59d89c",
  requires_review: "#efcb85",
  awaiting_analysis: "#91c9f7",
  unavailable: muted,
};
const precise_statuses = {
  complete: "Decomposition complete",
  processing: "Rosetta processing",
  held: "Rosetta held",
  failed: "Rosetta failed",
  not_admitted: "Source preserved · not admitted",
};
const precise_colors = {
  complete: "#59d89c",
  processing: "#91c9f7",
  held: "#efcb85",
  failed: "#ffabab",
  not_admitted: "#efcb85",
};

function readable_value(value: unknown, depth = 0): ReactNode {
  if (value == null) return <span style={{ color: muted }}>Not reported</span>;
  if (typeof value !== "object") return String(value);
  if (depth > 4) return <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(value, null, 2)}</pre>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={index}>{readable_value(item, depth + 1)}</li>)}</ul> : "None reported";
  return <dl style={{ margin: 0, display: "grid", gap: ".45rem" }}>{Object.entries(value).map(([key, item]) => <div key={key}>
    <dt style={{ color: muted, fontSize: ".72rem", textTransform: "capitalize" }}>{key.replaceAll("_", " ")}</dt>
    <dd style={{ margin: ".15rem 0 0", overflowWrap: "anywhere" }}>{readable_value(item, depth + 1)}</dd>
  </div>)}</dl>;
}

type version = { bill_version_id: string; document_family?: "text" | "amendment"; version_type: string; source_document_key?: string;
  source_url?: string; provider_date?: string | null; provider_sequence?: number;
  processing_state?: string; predecessor_bill_version_id?: string | null; base_bill_version_id?: string | null };
function version_label(item: version) {
  return [item.version_type, item.provider_date, item.provider_sequence ? `text ${item.provider_sequence}` : null].filter(Boolean).join(" · ");
}

export function RosettaEvaluation({ genome_bill_id, current_version, published_version, source_versions = [] }: {
  source_versions?: version[];
  genome_bill_id: string;
  current_version: version | null;
  published_version: version | null;
}) {
  const [selected_version_id, set_selected_version_id] = useState<string | undefined>();
  const [copied, set_copied] = useState(false);
  const versions = [...source_versions, current_version, published_version].filter((item, index, all): item is version =>
    item !== null && all.findIndex(other => other?.bill_version_id === item.bill_version_id) === index);
  const selected_id = versions.some(item => item.bill_version_id === selected_version_id) ? selected_version_id : current_version?.bill_version_id;
  const selected_source = versions.find(item => item.bill_version_id === selected_id);
  const predecessor = versions.find(item => item.bill_version_id === selected_source?.predecessor_bill_version_id);
  const base = versions.find(item => item.bill_version_id === selected_source?.base_bill_version_id);
  const result = trpc.civicGenome.get_rosetta_evaluation.useQuery(
    { genome_bill_id, bill_version_id: selected_id },
    { retry: false, refetchOnWindowFocus: false },
  );
  const current_docket_result = result.data?.current_docket_result;
  const current_result = current_docket_result?.current_result;
  const precise = current_docket_result?.current_source_status;
  const status_label = precise ? precise_statuses[precise.state] : current_docket_result ? statuses[current_docket_result.status] : null;
  const status_color = precise ? precise_colors[precise.state] : current_docket_result ? colors[current_docket_result.status] : muted;
  const precise_message = precise?.state === "not_admitted"
    ? "The exact source is preserved in Rosetta, but it has not been admitted to the declared current processing route."
    : precise?.state === "processing"
      ? "Rosetta has a current processing attempt for this exact source."
      : precise?.state === "held"
        ? `Rosetta is holding this exact source${precise.held_reason ? `: ${precise.held_reason.replaceAll("_", " ")}` : "."}`
        : precise?.state === "failed"
          ? `Rosetta recorded a current failure${precise.failure_stage ? ` at ${precise.failure_stage.replaceAll("_", " ")}` : ""}${precise.failure_code ? ` (${precise.failure_code})` : ""}.`
          : current_docket_result?.public_reason;
  const reference = current_docket_result ? [
    `Rosetta ${precise?.state ?? current_docket_result.status} current result`,
    `Civic Genome version: ${result.data?.binding?.bill_version_id}`,
    `Rosetta source document: ${precise?.rosetta_source_document_id ?? result.data?.binding?.source_document_id ?? "none"}`,
    `Source registry: ${precise?.rosetta_source_registry_id ?? current_docket_result.source_registry_id ?? "none"}`,
    `Docket source key: ${current_docket_result.docket_source_key}`,
    `Content SHA-256: ${current_docket_result.source_content_hash}`,
    `Stage: ${precise?.stage_id ?? "none"}`,
    `Attempt: ${precise?.attempt_id ?? "none"}`,
    `Extraction run: ${current_result?.extraction_run_id ?? precise?.extraction_run_id ?? "none"}`,
    `Engine: ${current_result?.engine_version ?? precise?.current_engine_version ?? "not admitted"}`,
    `Held reason: ${precise?.held_reason ?? "none"}`,
    `Failure: ${precise?.failure_code ?? "none"}`,
    `Reason: ${precise_message ?? current_docket_result.public_reason}`,
    result.data?.review_url,
  ].join("\n") : "";

  return <section aria-label="Rosetta evaluation results" style={{ background: "rgba(13,30,25,.88)", border, borderRadius: 12, padding: "1rem", marginBottom: "1.25rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".8rem", flexWrap: "wrap", alignItems: "center" }}>
      <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{selected_source?.document_family === "amendment" ? "Rosetta amendment status" : "Rosetta decomposition"} {current_result && <span style={{ fontFamily: mono, fontSize: ".85rem", color: muted }}>· {current_result.engine_version}</span>}</h2>
      {status_label && <strong style={{ color: status_color, fontFamily: mono }}>{status_label}</strong>}
    </div>
    <p style={{ color: muted, fontSize: ".83rem", lineHeight: 1.5 }}>Inspect each exact legislative source. Full-text versions are decomposable snapshots; amendment artifacts are deltas that require an exact base and are not decomposed by themselves. Source preservation, current admission, processing, and completion are separate states.</p>
    <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap", alignItems: "center", marginBottom: ".8rem" }}>
      {versions.length > 0 && <label style={{ fontSize: ".8rem" }}>Source version {" "}<select aria-label="Evaluation source version" value={selected_id ?? ""} onChange={event => { set_selected_version_id(event.target.value); set_copied(false); }} style={{ padding: ".4rem", background: "#122e24", color: "#edf7f2", border, borderRadius: 6 }}>
        {versions.map(item => <option key={item.bill_version_id} value={item.bill_version_id}>{version_label(item)}{item.bill_version_id === current_version?.bill_version_id ? " · latest full text" : ""}</option>)}
      </select></label>}
      <button type="button" disabled={result.isFetching} onClick={() => result.refetch()} style={{ padding: ".4rem .7rem", background: "transparent", color: "#59d89c", border, borderRadius: 6, cursor: "pointer" }}>{result.isFetching ? "Reading…" : "Refresh saved results"}</button>
      {result.data && <a href={result.data.review_url} target="_blank" rel="noopener noreferrer" style={{ color: "#91c9f7", fontSize: ".8rem" }}>Open Rosetta reader</a>}
    </div>
    {selected_source && <div style={{ color: muted, fontSize: ".83rem", marginBottom: ".8rem" }}>
      <p>Source: {selected_source.source_document_key} · {selected_source.processing_state ?? "State unavailable"}</p>
      {selected_source.source_url && <a href={selected_source.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#91c9f7" }}>{selected_source.document_family === "amendment" ? "Official amendment artifact" : "Official text for this version"}</a>}
      {predecessor && <p>Preceding text: <button type="button" onClick={() => set_selected_version_id(predecessor.bill_version_id)}>{version_label(predecessor)}</button></p>}
      {base && <p>Recorded amendment base: <button type="button" onClick={() => set_selected_version_id(base.bill_version_id)}>{version_label(base)}</button></p>}
      <p>The preceding text is a recorded version relationship; it does not by itself establish adoption or an amendment’s legal effect.</p>
    </div>}
    {result.isLoading ? <p role="status">Reading saved result…</p> : result.error ? <p role="alert" style={{ color: "#ffabab" }}>Rosetta current result could not be read. Refresh to try again; the bounded status is unknown.</p> : result.data?.availability === "binding_missing" ? <p style={{ color: muted }}>This source version does not yet have an exact Rosetta document and content-hash binding. Use the Rosetta reader to choose a source explicitly.</p> : result.data?.availability === "not_in_evaluation" ? <p style={{ color: muted }}>No current Rosetta result is available for this exact source version.</p> : current_docket_result ? <>
      <p style={{ fontSize: ".82rem", color: muted }}>{result.data?.binding?.version_type} · source key {current_docket_result.docket_source_key}</p>
      <p style={{ color: status_color, overflowWrap: "anywhere" }}>{precise_message ?? current_docket_result.public_reason}</p>
      <details style={{ marginTop: ".9rem" }} open={Boolean(current_result)}><summary style={{ cursor: "pointer", color: "#59d89c" }}>Current result, validation summary, and coverage</summary>
        {precise && <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(precise)}</div>}
        <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(current_result)}</div>
        <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(current_docket_result.validation_summary)}</div>
        <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(current_docket_result.coverage)}</div>
      </details>
      <details style={{ marginTop: ".8rem" }}><summary style={{ cursor: "pointer", color: muted }}>Evidence reference for feedback</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: ".7rem" }}>{reference}</pre></details>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(reference); set_copied(true); } catch { set_copied(false); } }} style={{ marginTop: ".8rem", padding: ".4rem .7rem", background: "transparent", color: "#59d89c", border, borderRadius: 6, cursor: "pointer" }}>{copied ? "Reference copied" : "Copy reference for feedback"}</button>
    </> : null}
  </section>;
}
