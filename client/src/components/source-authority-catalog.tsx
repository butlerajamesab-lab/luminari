import { CommitToCase } from "./CommitToCase";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

const panel_style = {
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
  padding: 16, marginBottom: 12, overflowWrap: "anywhere" as const,
};

function Source_authority_detail({ object_ref }: { object_ref: string }) {
  const detail = trpc.canonicalCore.legal_authority.useQuery({ object_ref });
  if (detail.error) return <p role="alert">Source detail unavailable: {detail.error.message}</p>;
  if (detail.isLoading) return <p role="status">Loading source detail…</p>;
  if (!detail.data) return <p>This reference is no longer available in the ready catalog.</p>;
  const record = detail.data;
  return <dl style={{ marginTop: 16, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
    <dt>Authority reference in source</dt><dd>{record.source_authority_text ?? record.description ?? record.name ?? "Not recorded"}</dd>
    {record.parent_resource_name && <><dt>Associated resource in source</dt><dd>{record.parent_resource_name}</dd></>}
    <dt>Source document</dt><dd>{record.artifact_key}</dd>
    <dt>Source location</dt><dd>{record.source_locator}</dd>
    <dt>Source jurisdiction</dt><dd>{record.state_code ?? record.jurisdiction ?? "Unknown"}</dd>
    <dt>Jurisdiction resolution</dt><dd>{record.jurisdiction_resolution_state ?? "Not recorded"}</dd>
    <dt>Reference ID</dt><dd>{record.object_ref}</dd>
    <dt>Source SHA-256</dt><dd>{record.source_content_sha256 ?? "Not recorded"}</dd>
    <dt>Source candidate hash</dt><dd>{record.source_candidate_hash}</dd>
    <dt>Field provenance</dt><dd><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(record.field_provenance ?? {}, null, 2)}</pre></dd>
  </dl>;
}

export function Source_authority_catalog({ query, jurisdiction }: { query?: string; jurisdiction?: string }) {
  const [offset, set_offset] = useState(0);
  const [selected_ref, set_selected_ref] = useState<string | null>(null);
  const page_size = 50;
  const result = trpc.canonicalCore.legalAuthorities.useQuery({ query, jurisdiction, limit: page_size, offset });
  const denied = result.error?.data?.code === "UNAUTHORIZED" || result.error?.data?.code === "FORBIDDEN";
  const data = denied ? undefined : result.data;
  return <section aria-label="Source authority references">
    <p style={{ marginBottom: 16, color: "rgba(240,236,228,0.75)" }}>
      Authority references recorded in source documents. These references retain their source context;
      legal text, current legal status, and applicability require separate verification.
    </p>
    {result.error && <p role="alert">Source authority catalog unavailable: {result.error.message}{data ? " Showing the last successful result." : ""}</p>}
    {result.isLoading && <p role="status">Loading source references…</p>}
    {data && <>
      <p style={{ marginBottom: 8 }}>
        {data.inventory_total.toLocaleString()} matching source references · {data.total.toLocaleString()} ready to view · {data.held_total.toLocaleString()} held from publication
      </p>
      {data.held_total > 0 && <p style={{ marginBottom: 16, color: "#fbbf24" }}>
        Held references: {data.jurisdiction_conflict_total.toLocaleString()} with jurisdiction conflicts;
        {" "}{data.jurisdiction_unresolved_total.toLocaleString()} with unresolved jurisdiction.
      </p>}
      {data.items.length === 0 && <p>No ready source references on this page.</p>}
      {data.items.map(record => <article key={record.object_ref} style={panel_style}>
        <p style={{ color: "#c084fc", marginBottom: 4 }}>Source authority reference · {record.state_code ?? record.jurisdiction ?? "Unknown jurisdiction"}</p>
        <h3 style={{ marginBottom: 8, fontSize: 15 }}>{record.name ?? record.description ?? "Untitled source reference"}</h3>
        <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>{record.artifact_key} · {record.source_locator}</p>
        <button type="button" aria-expanded={selected_ref === record.object_ref}
          onClick={() => set_selected_ref(selected_ref === record.object_ref ? null : record.object_ref)}
          style={{ border: "1px solid #a855f7", borderRadius: 6, padding: "6px 12px", color: "#c084fc" }}>
          {selected_ref === record.object_ref ? "Close source detail" : "Read source detail"}
        </button>
        <CommitToCase type="legal_authority" itemId={record.object_ref} label="Attach source reference" size="sm" />
        {selected_ref === record.object_ref && <Source_authority_detail object_ref={record.object_ref} />}
      </article>)}
      <nav aria-label="Source authority pages" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button type="button" disabled={offset === 0 || result.isFetching} onClick={() => { set_offset(Math.max(0, offset - page_size)); set_selected_ref(null); }}>Previous</button>
        <span>{data.items.length ? offset + 1 : 0}–{data.items.length ? offset + data.items.length : 0} of {data.total.toLocaleString()} ready references</span>
        <button type="button" disabled={offset + data.items.length >= data.total || result.isFetching} onClick={() => { set_offset(offset + page_size); set_selected_ref(null); }}>Next</button>
      </nav>
    </>}
  </section>;
}
