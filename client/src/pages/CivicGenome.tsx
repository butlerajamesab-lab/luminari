import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Braces,
  GitBranch,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react";

const p = {
  bg: "#08110f",
  panel: "rgba(13,30,25,.88)",
  soft: "rgba(20,48,39,.72)",
  border: "rgba(82,193,145,.22)",
  green: "#59d89c",
  green_soft: "rgba(89,216,156,.12)",
  paper: "#edf7f2",
  muted: "#91a9a0",
};
const mono = "'IBM Plex Mono', monospace";
const sans = "'Inter', system-ui, sans-serif";
const serif = "'Cormorant Garamond', serif";
const score = (value?: number | null) => Number(value ?? 0).toFixed(2);
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "Not observed";

const source_id_from_bill = (bill: { structural_dna_json?: unknown }): string | null => {
  const dna = bill.structural_dna_json;
  if (!dna || typeof dna !== "object" || Array.isArray(dna)) return null;
  const value = (dna as Record<string, unknown>).source_bill_id;
  return typeof value === "number" || typeof value === "string" ? String(value) : null;
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div style={{ background: p.soft, border: `1px solid ${p.border}`, borderRadius: 10, padding: ".9rem" }}>
    <div style={{ fontFamily: mono, fontSize: ".66rem", color: p.muted, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontFamily: serif, fontSize: "1.45rem", marginTop: ".2rem" }}>{value}</div>
  </div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ border: `1px dashed ${p.border}`, borderRadius: 10, padding: "1rem", color: p.muted, fontFamily: sans, fontSize: ".84rem" }}>{children}</div>;
}

function Value({ value }: { value: unknown }) {
  return <pre style={{ margin: ".45rem 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: mono, fontSize: ".66rem", color: p.muted }}>
    {JSON.stringify(value, null, 2)}
  </pre>;
}

export default function CivicGenomePage() {
  const [, params] = useRoute("/civic-genome/bill/:bill_id");
  const source_bill_id = params?.bill_id ?? null;
  const numeric_source_bill_id = source_bill_id ? Number(source_bill_id) : null;
  const valid_source_bill_id = numeric_source_bill_id !== null && Number.isSafeInteger(numeric_source_bill_id) && numeric_source_bill_id > 0;
  const [query, set_query] = useState(source_bill_id ?? "");

  const stats = trpc.civicGenome.stats.useQuery();
  const families = trpc.civicGenome.list_families.useQuery({ limit: 30 });
  const bill_lookup = trpc.civicGenome.get_bill_by_source_id.useQuery(
    { source_bill_id: numeric_source_bill_id ?? 0 },
    { enabled: valid_source_bill_id },
  );
  const assemble = trpc.civicGenome.resolve_or_assemble_docket_bill.useMutation({
    onSuccess: async result => {
      if (result.ok) await bill_lookup.refetch();
    },
  });

  const selected = bill_lookup.data ?? null;
  const family_id = selected?.family_id ?? null;
  const bill_detail = trpc.civicGenome.get_bill_detail.useQuery(
    { genome_bill_id: selected?.genome_bill_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(selected?.genome_bill_id) },
  );
  const family = trpc.civicGenome.get_family.useQuery(
    { family_id: family_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(family_id) },
  );
  const family_bills = trpc.civicGenome.list_bills.useQuery({ family_id: family_id ?? undefined, limit: 100 }, { enabled: Boolean(family_id) });
  const events = trpc.civicGenome.list_events.useQuery({ family_id: family_id ?? undefined, limit: 100 }, { enabled: Boolean(family_id) });
  const lineage = trpc.civicGenome.list_lineage_edges.useQuery({ family_id: family_id ?? undefined, limit: 100 }, { enabled: Boolean(family_id) });
  const momentum = trpc.civicGenome.list_momentum_snapshots.useQuery(
    { family_id: family_id ?? "00000000-0000-0000-0000-000000000000", limit: 30 },
    { enabled: Boolean(family_id) },
  );

  const recent_events = useMemo(() => (events.data ?? []).slice(0, 12), [events.data]);
  const traits = bill_detail.data?.structural_dna.traits ?? [];
  const assembly_runs = bill_detail.data?.structural_dna.assembly_runs ?? [];
  const family_assignment = bill_detail.data?.family_assignment ?? null;
  const grouped_traits = useMemo(() => {
    const groups = new Map<string, typeof traits>();
    for (const trait of traits) groups.set(trait.trait_class, [...(groups.get(trait.trait_class) ?? []), trait]);
    return [...groups.entries()];
  }, [traits]);
  const panel = { background: p.panel, border: `1px solid ${p.border}`, borderRadius: 12, padding: "1rem" } as const;

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) window.location.assign(`/civic-genome/bill/${encodeURIComponent(value)}`);
  };
  const assemble_selected = () => {
    if (valid_source_bill_id && numeric_source_bill_id !== null) assemble.mutate({ source_bill_id: numeric_source_bill_id });
  };

  return <div style={{ minHeight: "100vh", background: `radial-gradient(circle at 50% 0%,rgba(89,216,156,.09),transparent 38%),${p.bg}`, color: p.paper, padding: "clamp(1rem,3vw,2rem)" }}>
    <div style={{ maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ borderBottom: `1px solid ${p.border}`, paddingBottom: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: ".7rem", color: p.green, letterSpacing: ".12em" }}>LIGHTHOUSE ANALYTICAL ENVIRONMENT</div>
            <h1 style={{ fontFamily: serif, fontSize: "clamp(2rem,5vw,4rem)", fontWeight: 500, margin: ".2rem 0", lineHeight: 1 }}>Living Civic Genome</h1>
            <p style={{ fontFamily: sans, color: p.muted, margin: 0 }}>Explore legislative families, lineage, events, momentum, structural DNA, and provenance without modifying the official record.</p>
          </div>
          <Link href="/docket"><a style={{ display: "inline-flex", alignItems: "center", gap: ".4rem", color: p.green, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".55rem .75rem", textDecoration: "none", fontFamily: mono, fontSize: ".7rem" }}><ArrowLeft size={14}/> Docket Room</a></Link>
        </div>
      </header>

      <form onSubmit={search} style={{ display: "flex", gap: ".6rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", display: "flex", alignItems: "center", gap: ".55rem", ...panel, padding: ".65rem .8rem" }}>
          <Search size={16} color={p.green}/><input value={query} onChange={event => set_query(event.target.value)} placeholder="Enter a numeric source bill ID from the Docket Room" style={{ flex: 1, background: "transparent", border: 0, outline: 0, color: p.paper, fontFamily: mono, fontSize: ".78rem" }}/>
        </div>
        <button type="submit" style={{ background: p.green_soft, border: `1px solid ${p.green}`, color: p.green, borderRadius: 10, padding: ".65rem 1rem", fontFamily: mono, fontSize: ".72rem", cursor: "pointer" }}>Open genome record</button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".75rem", marginBottom: "1.25rem" }}>
        <Metric label="Families" value={stats.data?.total_families ?? "—"}/><Metric label="Active families" value={stats.data?.active_families ?? "—"}/><Metric label="Bills" value={stats.data?.total_bills ?? "—"}/><Metric label="Events" value={stats.data?.total_events ?? "—"}/>
      </div>

      {!source_bill_id ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem" }}>
        <aside style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".72rem", marginBottom: ".8rem" }}><Network size={15}/> Highest-momentum families</div><div style={{ display: "grid", gap: ".55rem" }}>{(families.data ?? []).map(item => <div key={item.family_id} style={{ background: p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".7rem" }}><div style={{ fontFamily: sans, fontWeight: 650 }}>{item.family_label}</div><div style={{ fontFamily: mono, fontSize: ".63rem", color: p.muted, marginTop: ".35rem" }}>{item.policy_domain} · {item.family_status} · momentum {score(item.momentum_score)}</div></div>)}</div></aside>
        <main style={{ ...panel, padding: "clamp(1rem,3vw,2rem)", minHeight: 420, display: "grid", alignContent: "center" }}><GitBranch size={36} color={p.green}/><h2 style={{ fontFamily: serif, fontSize: "2.2rem", margin: ".7rem 0" }}>Choose an entry point</h2><p style={{ color: p.muted, fontFamily: sans, lineHeight: 1.7 }}>Open a bill from the Docket Room or enter its source bill ID. The Genome resolves its family, structural DNA, events, lineage, momentum, and provenance.</p></main>
      </div> : !valid_source_bill_id ? <Empty>The source bill ID must be a positive numeric Docket identifier.</Empty> : bill_lookup.isLoading ? <Empty>Resolving the selected bill against the Civic Genome substrate…</Empty> : bill_lookup.error ? <Empty>Genome lookup failed: {bill_lookup.error.message}</Empty> : !selected ? <div style={panel}>
        <h2 style={{ fontFamily: serif, marginTop: 0 }}>Not assembled yet</h2><p style={{ color: p.muted, fontFamily: sans, lineHeight: 1.6 }}>No Civic Genome record currently exists for this Docket bill. The official Docket record remains intact and no relationship has been invented.</p>
        <button onClick={assemble_selected} disabled={assemble.isPending} style={{ background: p.green_soft, border: `1px solid ${p.green}`, color: p.green, borderRadius: 8, padding: ".6rem .85rem", fontFamily: mono, fontSize: ".7rem", cursor: assemble.isPending ? "wait" : "pointer" }}>{assemble.isPending ? "Assembling from Docket cache…" : "Assemble from Docket cache"}</button>
        {assemble.error && <p style={{ color: p.muted, fontFamily: mono, fontSize: ".68rem" }}>Assembly failed: {assemble.error.message}</p>}
      </div> : <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,.75fr) minmax(0,1.7fr) minmax(240px,.75fr)", gap: "1rem", alignItems: "start" }}>
        <aside style={{ display: "grid", gap: ".8rem" }}>
          <section style={panel}><div style={{ fontFamily: mono, fontSize: ".68rem", color: p.green }}>SELECTED BILL</div><h2 style={{ fontFamily: serif, margin: ".45rem 0", fontSize: "1.45rem" }}>{selected.source_bill_number}</h2><div style={{ fontFamily: sans, lineHeight: 1.5 }}>{selected.source_bill_title || "Untitled bill"}</div><div style={{ display: "grid", gap: ".35rem", fontFamily: mono, color: p.muted, fontSize: ".66rem", marginTop: ".75rem" }}><span>{selected.state_code} · {selected.session_key}</span><span>status {selected.bill_status || "unknown"}</span><span>position {selected.current_state_position}</span><span>last action {date(selected.last_action_at)}</span></div>{selected.source_bill_url && <a href={selected.source_bill_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: ".75rem", color: p.green, fontFamily: mono, fontSize: ".66rem" }}>Official source</a>}</section>
          <section style={panel}>
            <div style={{ fontFamily: mono, fontSize: ".68rem", color: p.green, marginBottom: ".6rem" }}>FAMILY</div>
            <div style={{ fontFamily: serif, fontSize: "1.25rem" }}>{family.data?.family_label || "Unassigned"}</div>
            <div style={{ fontFamily: mono, fontSize: ".64rem", color: p.muted, marginTop: ".5rem" }}>{family.data ? `${family.data.policy_domain} · ${family.data.family_status}` : "No family record"}</div>
            <div style={{ marginTop: ".75rem", padding: ".65rem", borderRadius: 8, background: p.soft, border: `1px solid ${p.border}` }}>
              <div style={{ fontFamily: mono, fontSize: ".63rem", color: p.green, textTransform: "uppercase" }}>{family_assignment?.status ?? "loading"}</div>
              <div style={{ fontFamily: sans, fontSize: ".75rem", color: p.muted, lineHeight: 1.45, marginTop: ".35rem" }}>
                {family_assignment?.status === "structurally_assigned"
                  ? "Assigned by an exact, unambiguous structural DNA match."
                  : family_assignment?.status === "unresolved"
                    ? `No forced assignment. ${family_assignment.latest_resolution?.resolution_reason ?? "Resolution remains open."}`
                    : "Current family is the provisional Docket ingestion grouping until structural resolution runs."}
              </div>
              {family_assignment?.latest_resolution && <div style={{ fontFamily: mono, fontSize: ".58rem", color: p.muted, marginTop: ".45rem", overflowWrap: "anywhere" }}>method {family_assignment.latest_resolution.methodology_version}<br/>observed {new Date(family_assignment.latest_resolution.observed_at).toLocaleString()}</div>}
            </div>
          </section>
        </aside>

        <main style={{ display: "grid", gap: ".8rem" }}>
          <section style={panel}>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".75rem" }}><Braces size={15}/> Structural DNA</div>
            {bill_detail.isLoading ? <Empty>Loading persisted structural DNA…</Empty> : bill_detail.error ? <Empty>Structural DNA lookup failed: {bill_detail.error.message}</Empty> : grouped_traits.length ? <div style={{ display: "grid", gap: ".8rem" }}>{grouped_traits.map(([trait_class, class_traits]) => <div key={trait_class}><div style={{ fontFamily: mono, color: p.green, fontSize: ".66rem", textTransform: "uppercase", marginBottom: ".45rem" }}>{trait_class}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".55rem" }}>{class_traits.map(trait => <article key={trait.trait_id} style={{ background: p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".75rem" }}><div style={{ fontFamily: sans, fontWeight: 650, fontSize: ".82rem" }}>{trait.trait_key}</div><div style={{ fontFamily: mono, fontSize: ".61rem", color: p.muted, marginTop: ".3rem" }}>{trait.verification_state} · confidence {score(trait.confidence_score)}</div><Value value={trait.normalized_value_json}/><div style={{ fontFamily: mono, fontSize: ".58rem", color: p.muted, marginTop: ".55rem", overflowWrap: "anywhere" }}>object {trait.source_object_id}{trait.source_block_id ? ` · block ${trait.source_block_id}` : ""}<br/>hash {trait.content_hash}</div></article>)}</div></div>)}</div> : <Empty>No Rosetta structural traits have been assembled for this bill yet.</Empty>}
          </section>

          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".75rem" }}><ShieldCheck size={15}/> Assembly history</div>{assembly_runs.length ? <div style={{ display: "grid", gap: ".55rem" }}>{assembly_runs.map(run => <div key={run.assembly_run_id} style={{ background: p.soft, borderRadius: 8, padding: ".7rem" }}><div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}><span style={{ fontFamily: mono, color: p.green, fontSize: ".65rem" }}>{run.verification_state} · {run.run_status}</span><span style={{ fontFamily: mono, color: p.muted, fontSize: ".61rem" }}>{run.completed_at ? new Date(run.completed_at).toLocaleString() : "not completed"}</span></div><div style={{ fontFamily: mono, color: p.muted, fontSize: ".61rem", marginTop: ".4rem", overflowWrap: "anywhere" }}>traits {run.trait_count} · engine {run.engine_version} · rule {run.rule_version}<br/>input {run.input_hash}<br/>output {run.output_hash}</div></div>)}</div> : <Empty>No assembly runs have been persisted for this bill.</Empty>}</section>

          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".75rem" }}><BookOpen size={15}/> Family bills</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".6rem" }}>{(family_bills.data ?? []).map(item => { const sibling_source_id = source_id_from_bill(item); const card = <><div style={{ fontFamily: mono, color: p.green, fontSize: ".66rem" }}>{item.state_code} · {item.source_bill_number}</div><div style={{ fontFamily: sans, fontSize: ".82rem", marginTop: ".35rem" }}>{item.source_bill_title || "Untitled bill"}</div></>; const style = { display: "block", background: item.genome_bill_id === selected.genome_bill_id ? p.green_soft : p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".75rem", color: p.paper, textDecoration: "none" } as const; return sibling_source_id ? <Link key={item.genome_bill_id} href={`/civic-genome/bill/${encodeURIComponent(sibling_source_id)}`}><a style={style}>{card}</a></Link> : <div key={item.genome_bill_id} style={style}>{card}</div>; })}</div></section>

          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".75rem" }}><Activity size={15}/> Recorded events</div>{recent_events.length ? <div style={{ display: "grid", gap: ".55rem" }}>{recent_events.map(item => <div key={item.event_id} style={{ borderLeft: `2px solid ${p.green}`, padding: ".2rem 0 .2rem .75rem" }}><div style={{ fontFamily: mono, color: p.green, fontSize: ".66rem" }}>{item.event_type} · {item.state_code}</div><div style={{ fontFamily: sans, fontSize: ".8rem", marginTop: ".2rem" }}>{item.prior_status || "unknown"} → {item.next_status || "unknown"}</div><div style={{ fontFamily: mono, color: p.muted, fontSize: ".62rem", marginTop: ".2rem" }}>{new Date(item.event_timestamp).toLocaleString()}</div></div>)}</div> : <Empty>No events have been recorded for this family.</Empty>}</section>
        </main>

        <aside style={{ display: "grid", gap: ".8rem" }}>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><GitBranch size={15}/> Lineage</div>{(lineage.data ?? []).length ? (lineage.data ?? []).map(item => <div key={item.lineage_edge_id} style={{ background: p.soft, borderRadius: 8, padding: ".65rem", marginBottom: ".5rem" }}><div style={{ fontFamily: sans, fontSize: ".8rem" }}>{item.relationship_type}</div><div style={{ fontFamily: mono, color: p.muted, fontSize: ".62rem" }}>confidence {score(item.confidence_score)}</div></div>) : <Empty>No verified lineage edges currently exist.</Empty>}</section>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><Network size={15}/> Momentum</div><div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: ".5rem" }}><Metric label="Score" value={score(family.data?.momentum_score)}/><Metric label="Acceleration" value={score(family.data?.acceleration_score)}/><Metric label="Active states" value={family.data?.active_state_count ?? 0}/><Metric label="Snapshots" value={momentum.data?.length ?? 0}/></div></section>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><ShieldCheck size={15}/> Provenance boundary</div><p style={{ fontFamily: sans, fontSize: ".78rem", lineHeight: 1.55, color: p.muted, margin: 0 }}>Structural traits shown here are persisted Rosetta outputs with source object, source block, extraction run, engine version, rule version, and content hash. Family resolution remains explicit: provisional and unresolved outcomes are displayed rather than hidden.</p></section>
        </aside>
      </div>}
    </div>
  </div>;
}
