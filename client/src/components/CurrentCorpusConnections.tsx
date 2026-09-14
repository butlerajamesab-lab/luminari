import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { current_object_inspection_route } from "../../../shared/architecture-routes";

type corpus_row = Record<string, unknown>;
const text_value = (value: unknown) => typeof value === "string" && value.trim() ? value : "Not recorded";

function PageControls({ total, offset, set_offset }: {
  total: number; offset: number; set_offset: (value: number) => void;
}) {
  return <div className="flex flex-wrap items-center gap-3 text-xs">
    <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => set_offset(Math.max(0, offset - 25))}>Previous</Button>
    <span>{total === 0 ? "0 records" : `${Math.min(offset + 1, total)}–${Math.min(offset + 25, total)} of ${total.toLocaleString()}`}</span>
    <Button size="sm" variant="outline" disabled={offset + 25 >= total} onClick={() => set_offset(offset + 25)}>Next</Button>
  </div>;
}

export default function CurrentCorpusConnections({ object_classes }: { object_classes: string[] }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const object_class = params.get("object_class") ?? "";
  const selected_node_id = params.get("node_id") ?? "";
  const [query, set_query] = useState("");
  const [submitted_query, set_submitted_query] = useState("");
  const [offset, set_offset] = useState(0);
  const [edge_offset, set_edge_offset] = useState(0);
  const [unresolved_offset, set_unresolved_offset] = useState(0);
  useEffect(() => { set_offset(0); set_edge_offset(0); set_unresolved_offset(0); }, [object_class, selected_node_id, submitted_query]);
  const node_page = trpc.canonicalCore.graph_node_page.useQuery({
    node_type: object_class || undefined, query: submitted_query || undefined, limit: 25, offset,
  }, { enabled: Boolean(object_class), staleTime: 30_000 });
  const selected_page = trpc.canonicalCore.graph_node_page.useQuery({
    node_id: selected_node_id || undefined, limit: 1,
  }, { enabled: Boolean(selected_node_id), staleTime: 30_000 });
  const selected_source = trpc.canonicalCore.graph_node_source.useQuery({ node_id: selected_node_id },
    { enabled: Boolean(selected_node_id), staleTime: 30_000 });
  const edge_page = trpc.canonicalCore.graph_edge_page.useQuery({
    node_id: selected_node_id || undefined, semantic_only: false, limit: 25, offset: edge_offset,
  }, { enabled: Boolean(selected_node_id), staleTime: 30_000 });
  const unresolved_page = trpc.canonicalCore.unresolved_relationship_page.useQuery({
    node_id: selected_node_id || undefined, limit: 25, offset: unresolved_offset,
  }, { enabled: Boolean(selected_node_id), staleTime: 30_000 });
  const selected = selected_page.data?.items[0] as corpus_row | undefined;

  return <Card id="current-object-connections" className="border-cyan-400/20">
    <CardHeader><CardTitle>Current records and connections</CardTitle>
      <p className="text-xs text-muted-foreground">Inspect each source-backed record, its recorded relationships and unresolved links. A typed record or shared source does not establish eligibility, identity equivalence or legal applicability.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="text-xs">Record class
          <select aria-label="Record class" className="ml-2 rounded border bg-background p-2" value={object_class}
            onChange={(event) => navigate(current_object_inspection_route(event.target.value))}>
            <option value="">Choose a class</option>
            {[...new Set([...object_classes, "source_artifact", "jurisdiction", ...(object_class ? [object_class] : [])])].map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); set_submitted_query(query); set_offset(0); }}>
          <input aria-label="Search current records" className="rounded border bg-background px-2 text-sm" value={query} maxLength={240} onChange={(event) => set_query(event.target.value)} placeholder="Name, jurisdiction or source location" />
          <Button size="sm" variant="outline" disabled={!object_class}>Search records</Button>
        </form>
      </div>
      {!object_class && <p className="text-sm text-muted-foreground">Choose a class above or select “Inspect records and connections” on a class card.</p>}
      {object_class && node_page.isLoading && <p role="status">Loading current records…</p>}
      {node_page.error && <p role="alert">Current records could not be loaded. The record count is unknown. <button className="underline" onClick={() => node_page.refetch()}>Retry</button></p>}
      {object_class && node_page.data && <>
        <PageControls total={node_page.data.total} offset={offset} set_offset={set_offset} />
        <div className="space-y-2">{node_page.data.items.map((item: corpus_row) => <button type="button" key={String(item.node_id)}
          className="block w-full rounded border border-white/10 p-3 text-left hover:bg-white/5"
          onClick={() => navigate(current_object_inspection_route(String(item.node_type), String(item.node_id)))}>
          <span className="block text-sm font-medium">{text_value(item.label)}</span>
          <span className="text-xs text-muted-foreground">{text_value(item.jurisdiction_code)} · {text_value(item.node_state)} · {text_value(item.source_locator)}</span>
        </button>)}</div>
        {node_page.data.total === 0 && <p>No current records matched these filters.</p>}
      </>}
      {selected_node_id && <section className="space-y-3 rounded border border-white/10 p-4" aria-label="Selected record connections">
        {selected_page.isLoading && <p role="status">Loading selected record…</p>}
        {selected_page.error && <p role="alert">The selected record could not be loaded. <button className="underline" onClick={() => selected_page.refetch()}>Retry</button></p>}
        {selected_page.data && !selected && <p>This record is not in the current projection. Its source identity has not been substituted.</p>}
        {selected && <>
          <h3 className="font-semibold">{text_value(selected.label)}</h3>
          <dl className="grid gap-1 text-xs break-words">
            <div><dt className="inline font-semibold">Identity: </dt><dd className="inline">{text_value(selected.node_id)}</dd></div>
            <div><dt className="inline font-semibold">Source: </dt><dd className="inline">{text_value(selected.artifact_key)}</dd></div>
            <div><dt className="inline font-semibold">Source location: </dt><dd className="inline">{text_value(selected.source_locator)}</dd></div>
            <div><dt className="inline font-semibold">Source SHA-256: </dt><dd className="inline">{text_value(selected.source_content_sha256)}</dd></div>
          </dl>
          {selected_source.data?.source_access.url ? <a className="text-sm text-cyan-200 underline" href={selected_source.data.source_access.url} target="_blank" rel="noopener noreferrer">Open original source document</a>
            : <p className="text-xs text-muted-foreground">{selected_source.error ? "Source access could not be checked." : selected_source.isLoading ? "Checking source access…" : selected_source.data?.source_access.status === "source_access_restricted" ? "This source requires authorized access." : "An accessible, version-bound original source has not been established."}</p>}
        </>}
        <h4 className="font-medium">Recorded relationships</h4>
        {edge_page.isLoading && <p role="status">Loading recorded relationships…</p>}
        {edge_page.error && <p role="alert">Relationships could not be loaded; their presence or absence is unknown. <button className="underline" onClick={() => edge_page.refetch()}>Retry</button></p>}
        {edge_page.data && <>
          <PageControls total={edge_page.data.total} offset={edge_offset} set_offset={set_edge_offset} />
          {edge_page.data.items.map((edge: corpus_row) => {
            const outgoing = edge.from_node_id === selected_node_id;
            const other_id = outgoing ? edge.to_node_id : edge.from_node_id;
            const other_type = outgoing ? edge.to_node_type : edge.from_node_type;
            const label = outgoing ? edge.to_label : edge.from_label;
            return <div key={String(edge.edge_id)} className="rounded border border-white/10 p-2 text-xs">
              <div>{outgoing ? "Outgoing" : "Incoming"} · {text_value(edge.edge_type)} · {text_value(edge.evidence_state)}</div>
              {other_type ? <button className="mt-1 text-cyan-200 underline" onClick={() => navigate(current_object_inspection_route(String(other_type), String(other_id)))}>{text_value(label ?? other_id)}</button> : <p>Target not in current projection: {text_value(other_id)}</p>}
              <p className="break-all text-muted-foreground">Evidence: {text_value(edge.evidence_hash)}</p>
            </div>;
          })}
          {edge_page.data.total === 0 && <p className="text-sm">No recorded relationships were returned for this exact identity.</p>}
        </>}
        <h4 className="font-medium">Unresolved links</h4>
        {unresolved_page.isLoading && <p role="status">Loading unresolved links…</p>}
        {unresolved_page.error && <p role="alert">Unresolved links could not be loaded. <button className="underline" onClick={() => unresolved_page.refetch()}>Retry</button></p>}
        {unresolved_page.data && <>
          <PageControls total={unresolved_page.data.total} offset={unresolved_offset} set_offset={set_unresolved_offset} />
          {unresolved_page.data.items.map((item: corpus_row) => <div key={String(item.declaration_id)} className="rounded border border-amber-400/20 p-2 text-xs">
            <p>{text_value(item.intended_edge_type)} → {text_value(item.target_reference)}</p>
            <p>{text_value(item.resolution_state)} · Source field: {text_value(item.source_field)}</p>
          </div>)}
          {unresolved_page.data.total === 0 && <p className="text-sm">No unresolved declarations were returned. This does not establish that every needed relationship has been recorded.</p>}
        </>}
      </section>}
    </CardContent>
  </Card>;
}
