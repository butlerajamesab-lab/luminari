import { useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const layers = [
  ["help", "Help · What exists?"],
  ["workflow", "Workflow · What must happen?"],
  ["accountability", "Accountability · What if it does not?"],
  ["override", "Overrides · What is different here?"],
  ["definition", "Definitions · What do the words mean?"],
] as const;
const mono = "'IBM Plex Mono', monospace";
const muted = "#a7bdb4";
const border = "1px solid rgba(82,193,145,.22)";
const statuses = { passed: "Decomposition complete", failed: "Decomposition failed", held: "Decomposition held", unprocessed: "Not yet decomposed", processing: "Decomposition in progress" };
const colors = { passed: "#59d89c", failed: "#ffabab", held: "#efcb85", unprocessed: muted, processing: "#91c9f7" };

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
  const evaluation = result.data?.evaluation;
  const selected_attempt = evaluation?.selected_attempt;
  const reference = evaluation ? [
    `Rosetta ${evaluation.status} evaluation`,
    `Source: ${evaluation.source.document_name}`,
    `Civic Genome version: ${result.data?.binding?.bill_version_id}`,
    `Source registry: ${evaluation.source.source_registry_id}`,
    `Content SHA-256: ${evaluation.source.source_content_hash}`,
    `Attempt: ${selected_attempt?.attempt_id ?? "none"}`,
    `Engine: ${selected_attempt?.engine_version ?? "not processed"}`,
    result.data?.review_url,
  ].join("\n") : "";

  return <section aria-label="Rosetta evaluation results" style={{ background: "rgba(13,30,25,.88)", border, borderRadius: 12, padding: "1rem", marginBottom: "1.25rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".8rem", flexWrap: "wrap", alignItems: "center" }}>
      <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Rosetta decomposition {selected_attempt && <span style={{ fontFamily: mono, fontSize: ".85rem", color: muted }}>· {selected_attempt.engine_version}</span>}</h2>
      {evaluation && <strong style={{ color: colors[evaluation.status], fontFamily: mono }}>{statuses[evaluation.status]}</strong>}
    </div>
    <p style={{ color: muted, fontSize: ".83rem", lineHeight: 1.5 }}>Rosetta’s saved candidate analysis for this exact source version is shown here. Status describes decomposition, not whether the legislation passed. Earlier publications and their Prism findings are available under Published snapshot and assembly history.</p>
    <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap", alignItems: "center", marginBottom: ".8rem" }}>
      {versions.length > 0 && <label style={{ fontSize: ".8rem" }}>Source version {" "}<select aria-label="Evaluation source version" value={selected_id ?? ""} onChange={event => { set_selected_version_id(event.target.value); set_copied(false); }} style={{ padding: ".4rem", background: "#122e24", color: "#edf7f2", border, borderRadius: 6 }}>
        {versions.map(item => <option key={item.bill_version_id} value={item.bill_version_id}>{item.version_type}{item.bill_version_id === current_version?.bill_version_id ? " · current source" : " · published source"}</option>)}
      </select></label>}
      <button type="button" disabled={result.isFetching} onClick={() => result.refetch()} style={{ padding: ".4rem .7rem", background: "transparent", color: "#59d89c", border, borderRadius: 6, cursor: "pointer" }}>{result.isFetching ? "Reading…" : "Refresh saved results"}</button>
      {result.data && <a href={result.data.review_url} target="_blank" rel="noopener noreferrer" style={{ color: "#91c9f7", fontSize: ".8rem" }}>Open Rosetta reader</a>}
    </div>
    {result.isLoading ? <p role="status">Reading saved evaluation…</p> : result.error ? <p role="alert" style={{ color: "#ffabab" }}>Evaluation results could not be read. Refresh to try again; the evaluation status is unknown.</p> : result.data?.availability === "binding_missing" ? <p style={{ color: muted }}>This source version does not yet have an exact Rosetta document and content-hash binding. Use the Rosetta reader to choose a source explicitly.</p> : result.data?.availability === "not_in_evaluation" ? <p style={{ color: muted }}>This exact source version is not present in the evaluation dataset.</p> : evaluation ? <>
      <p style={{ fontSize: ".82rem", color: muted }}>{evaluation.source.document_name} · {result.data?.binding?.version_type} · observed {new Date(evaluation.observed_at).toLocaleString()}</p>
      {evaluation.failure_class && <p style={{ color: colors[evaluation.status], overflowWrap: "anywhere" }}>Failure class: <code>{evaluation.failure_class}</code></p>}
      {!evaluation.law_view && <p style={{ color: muted }}>{evaluation.status === "unprocessed" ? "This exact source has no recorded processing attempt." : "No layer output was retained for the selected attempt. Its recorded status and validation evidence are available here."}</p>}
      {evaluation.law_view && <div style={{ display: "grid", gap: ".65rem" }}>{layers.map(([layer, label]) => {
        const objects = evaluation.law_view!.objects.filter(object => object.layer === layer);
        return <details key={layer} open={objects.length > 0} style={{ border, borderRadius: 8, padding: ".7rem" }}>
          <summary style={{ cursor: "pointer", color: "#59d89c", fontWeight: 650 }}>{label} · {objects.length}</summary>
          {objects.length ? objects.map(object => <article key={`${object.source_object_type}:${object.source_object_id}`} style={{ marginTop: ".8rem", paddingTop: ".7rem", borderTop: border, fontSize: ".84rem", lineHeight: 1.5 }}>
            {readable_value(object.normalized_value)}
            <details style={{ marginTop: ".6rem", color: muted, fontSize: ".72rem" }}><summary style={{ cursor: "pointer" }}>Source evidence</summary><p>Object {object.source_object_id} · block {object.source_block_id ?? "not reported"} · run {object.extraction_run_id}</p></details>
          </article>) : <p style={{ color: muted, fontSize: ".8rem" }}>No objects were recorded for this layer.</p>}
        </details>;
      })}</div>}
      <details style={{ marginTop: ".9rem" }}><summary style={{ cursor: "pointer", color: "#59d89c" }}>Validation and layer coverage</summary>
        <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(evaluation.validation_results)}</div>
        <div style={{ marginTop: ".6rem", fontSize: ".8rem" }}>{readable_value(evaluation.law_view?.coverage)}</div>
      </details>
      <details style={{ marginTop: ".8rem" }}><summary style={{ cursor: "pointer", color: muted }}>Evidence reference for feedback</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: ".7rem" }}>{reference}</pre></details>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(reference); set_copied(true); } catch { set_copied(false); } }} style={{ marginTop: ".8rem", padding: ".4rem .7rem", background: "transparent", color: "#59d89c", border, borderRadius: 6, cursor: "pointer" }}>{copied ? "Reference copied" : "Copy reference for feedback"}</button>
    </> : null}
  </section>;
}
