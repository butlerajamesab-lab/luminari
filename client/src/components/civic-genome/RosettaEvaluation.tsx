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

type version = { bill_version_id: string; version_type: string };

export function RosettaEvaluation({ genome_bill_id, current_version, published_version }: {
  genome_bill_id: string;
  current_version: version | null;
  published_version: version | null;
}) {
  const [selected_version_id, set_selected_version_id] = useState<string | undefined>();
  const [copied, set_copied] = useState(false);
  const versions = [current_version, published_version].filter((item, index, all): item is version =>
    item !== null && all.findIndex(other => other?.bill_version_id === item.bill_version_id) === index);
  const selected_id = selected_version_id ?? current_version?.bill_version_id;
  const result = trpc.civicGenome.get_rosetta_evaluation.useQuery(
    { genome_bill_id, bill_version_id: selected_id },
    { retry: false, refetchOnWindowFocus: false },
  );
  const current_docket_result = result.data?.current_docket_result;
  const current_result = current_docket_result?.current_result;
  const reference = current_docket_result ? [
    `Rosetta ${current_docket_result.status} current result`,
    `Civic Genome version: ${result.data?.binding?.bill_version_id}`,
    `Source registry: ${current_docket_result.source_registry_id}`,
    `Docket source key: ${current_docket_result.docket_source_key}`,
    `Content SHA-256: ${current_docket_result.source_content_hash}`,
    `Extraction run: ${current_result?.extraction_run_id ?? "none"}`,
    `Engine: ${current_result?.engine_version ?? "not ready"}`,
    `Reason: ${current_docket_result.public_reason}`,
    result.data?.review_url,
  ].join("\n") : "";

  return <section aria-label="Rosetta evaluation results" style={{ background: "rgba(13,30,25,.88)", border, borderRadius: 12, padding: "1rem", marginBottom: "1.25rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".8rem", flexWrap: "wrap", alignItems: "center" }}>
      <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Rosetta decomposition {current_result && <span style={{ fontFamily: mono, fontSize: ".85rem", color: muted }}>· {current_result.engine_version}</span>}</h2>
      {current_docket_result && <strong style={{ color: colors[current_docket_result.status], fontFamily: mono }}>{statuses[current_docket_result.status]}</strong>}
    </div>
    <p style={{ color: muted, fontSize: ".83rem", lineHeight: 1.5 }}>Inspect Rosetta’s current bounded result for this exact source version. Historical attempts and review-detail artifacts are not loaded here.</p>
    <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap", alignItems: "center", marginBottom: ".8rem" }}>
      {versions.length > 0 && <label style={{ fontSize: ".8rem" }}>Source version {" "}<select aria-label="Evaluation source version" value={selected_id ?? ""} onChange={event => { set_selected_version_id(event.target.value); set_copied(false); }} style={{ padding: ".4rem", background: "#122e24", color: "#edf7f2", border, borderRadius: 6 }}>
        {versions.map(item => <option key={item.bill_version_id} value={item.bill_version_id}>{item.version_type}{item.bill_version_id === current_version?.bill_version_id ? " · current source" : " · published source"}</option>)}
      </select></label>}
      <button type="button" disabled={result.isFetching} onClick={() => result.refetch()} style={{ padding: ".4rem .7rem", background: "transparent", color: "#59d89c", border, borderRadius: 6, cursor: "pointer" }}>{result.isFetching ? "Reading…" : "Refresh saved results"}</button>
      {result.data && <a href={result.data.review_url} target="_blank" rel="noopener noreferrer" style={{ color: "#91c9f7", fontSize: ".8rem" }}>Open Rosetta reader</a>}
    </div>
    {result.isLoading ? <p role="status">Reading saved result…</p> : result.error ? <p role="alert" style={{ color: "#ffabab" }}>Rosetta current result could not be read. Refresh to try again; the bounded status is unknown.</p> : result.data?.availability === "binding_missing" ? <p style={{ color: muted }}>This source version does not yet have an exact Rosetta document and content-hash binding. Use the Rosetta reader to choose a source explicitly.</p> : result.data?.availability === "not_in_evaluation" ? <p style={{ color: muted }}>No current Rosetta result is available for this exact source version.</p> : current_docket_result ? <>
      <p style={{ fontSize: ".82rem", color: muted }}>{result.data?.binding?.version_type} · source key {current_docket_result.docket_source_key}</p>
      <p style={{ color: colors[current_docket_result.status], overflowWrap: "anywhere" }}>{current_docket_result.public_reason}</p>
      <details style={{ marginTop: ".9rem" }} open={Boolean(current_result)}><summary style={{ cursor: "pointer", color: "#59d89c" }}>Current result, validation summary, and coverage</summary>
        <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(current_result)}</div>
        <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(current_docket_result.validation_summary)}</div>
        <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(current_docket_result.coverage)}</div>
      </details>
      <details style={{ marginTop: ".8rem" }}><summary style={{ cursor: "pointer", color: muted }}>Evidence reference for feedback</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: ".7rem" }}>{reference}</pre></details>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(reference); set_copied(true); } catch { set_copied(false); } }} style={{ marginTop: ".8rem", padding: ".4rem .7rem", background: "transparent", color: "#59d89c", border, borderRadius: 6, cursor: "pointer" }}>{copied ? "Reference copied" : "Copy reference for feedback"}</button>
    </> : null}
  </section>;
}
