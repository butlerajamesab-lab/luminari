import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowLeft, BookOpen, GitBranch, Network, Search, ShieldCheck } from "lucide-react";

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

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div style={{ background: p.soft, border: `1px solid ${p.border}`, borderRadius: 10, padding: ".9rem" }}>
    <div style={{ fontFamily: mono, fontSize: ".66rem", color: p.muted, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontFamily: serif, fontSize: "1.45rem", marginTop: ".2rem" }}>{value}</div>
  </div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ border: `1px dashed ${p.border}`, borderRadius: 10, padding: "1rem", color: p.muted, fontFamily: sans, fontSize: ".84rem" }}>{children}</div>;
}

export default function CivicGenomePage() {
  const [, params] = useRoute("/civic-genome/bill/:bill_id");
  const source_bill_id = params?.bill_id ?? null;
  const [query, set_query] = useState(source_bill_id ?? "");

  const stats = trpc.civicGenome.stats.useQuery();
  const families = trpc.civicGenome.list_families.useQuery({ limit: 30 });
  const bill_page_1 = trpc.civicGenome.list_bills.useQuery({ limit: 200, offset: 0 }, { enabled: Boolean(source_bill_id) });
  const bill_page_2 = trpc.civicGenome.list_bills.useQuery({ limit: 200, offset: 200 }, { enabled: Boolean(source_bill_id) });
  const bill_page_3 = trpc.civicGenome.list_bills.useQuery({ limit: 200, offset: 400 }, { enabled: Boolean(source_bill_id) });

  const selected = useMemo(() => {
    if (!source_bill_id) return null;
    return [...(bill_page_1.data ?? []), ...(bill_page_2.data ?? []), ...(bill_page_3.data ?? [])]
      .find(item => String(item.bill_id) === source_bill_id) ?? null;
  }, [source_bill_id, bill_page_1.data, bill_page_2.data, bill_page_3.data]);

  const lookup_loading = bill_page_1.isLoading || bill_page_2.isLoading || bill_page_3.isLoading;
  const lookup_error = bill_page_1.error || bill_page_2.error || bill_page_3.error;
  const family_id = selected?.family_id ?? null;
  const family = trpc.civicGenome.get_family.useQuery(
    { family_id: family_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(family_id) },
  );
  const family_bills = trpc.civicGenome.list_bills.useQuery(
    { family_id: family_id ?? undefined, limit: 100 },
    { enabled: Boolean(family_id) },
  );
  const events = trpc.civicGenome.list_events.useQuery(
    { family_id: family_id ?? undefined, limit: 100 },
    { enabled: Boolean(family_id) },
  );
  const lineage = trpc.civicGenome.list_lineage_edges.useQuery(
    { family_id: family_id ?? undefined, limit: 100 },
    { enabled: Boolean(family_id) },
  );
  const momentum = trpc.civicGenome.list_momentum_snapshots.useQuery(
    { family_id: family_id ?? "00000000-0000-0000-0000-000000000000", limit: 30 },
    { enabled: Boolean(family_id) },
  );
  const recent_events = useMemo(() => (events.data ?? []).slice(0, 12), [events.data]);
  const panel = { background: p.panel, border: `1px solid ${p.border}`, borderRadius: 12, padding: "1rem" } as const;

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) window.location.assign(`/civic-genome/bill/${encodeURIComponent(value)}`);
  };

  return <div style={{ minHeight: "100vh", background: `radial-gradient(circle at 50% 0%,rgba(89,216,156,.09),transparent 38%),${p.bg}`, color: p.paper, padding: "clamp(1rem,3vw,2rem)" }}>
    <div style={{ maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ borderBottom: `1px solid ${p.border}`, paddingBottom: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: ".7rem", color: p.green, letterSpacing: ".12em" }}>LIGHTHOUSE ANALYTICAL ENVIRONMENT</div>
            <h1 style={{ fontFamily: serif, fontSize: "clamp(2rem,5vw,4rem)", fontWeight: 500, margin: ".2rem 0", lineHeight: 1 }}>Living Civic Genome</h1>
            <p style={{ fontFamily: sans, color: p.muted, margin: 0 }}>Explore legislative families, lineage, events, momentum, and provenance without modifying the official record.</p>
          </div>
          <Link href="/docket"><a style={{ display: "inline-flex", alignItems: "center", gap: ".4rem", color: p.green, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".55rem .75rem", textDecoration: "none", fontFamily: mono, fontSize: ".7rem" }}><ArrowLeft size={14}/> Docket Room</a></Link>
        </div>
      </header>

      <form onSubmit={search} style={{ display: "flex", gap: ".6rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", display: "flex", alignItems: "center", gap: ".55rem", ...panel, padding: ".65rem .8rem" }}>
          <Search size={16} color={p.green}/>
          <input value={query} onChange={event => set_query(event.target.value)} placeholder="Enter a source bill ID from the Docket Room" style={{ flex: 1, background: "transparent", border: 0, outline: 0, color: p.paper, fontFamily: mono, fontSize: ".78rem" }}/>
        </div>
        <button type="submit" style={{ background: p.green_soft, border: `1px solid ${p.green}`, color: p.green, borderRadius: 10, padding: ".65rem 1rem", fontFamily: mono, fontSize: ".72rem", cursor: "pointer" }}>Open genome record</button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".75rem", marginBottom: "1.25rem" }}>
        <Metric label="Families" value={stats.data?.total_families ?? "—"}/>
        <Metric label="Active families" value={stats.data?.active_families ?? "—"}/>
        <Metric label="Bills" value={stats.data?.total_bills ?? "—"}/>
        <Metric label="Events" value={stats.data?.total_events ?? "—"}/>
      </div>

      {!source_bill_id ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem" }}>
        <aside style={panel}>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".72rem", marginBottom: ".8rem" }}><Network size={15}/> Highest-momentum families</div>
          <div style={{ display: "grid", gap: ".55rem" }}>{(families.data ?? []).map(item => <div key={item.family_id} style={{ background: p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".7rem" }}><div style={{ fontFamily: sans, fontWeight: 650 }}>{item.family_label}</div><div style={{ fontFamily: mono, fontSize: ".63rem", color: p.muted, marginTop: ".35rem" }}>{item.policy_domain} · {item.family_status} · momentum {score(item.momentum_score)}</div></div>)}</div>
        </aside>
        <main style={{ ...panel, padding: "clamp(1rem,3vw,2rem)", minHeight: 420, display: "grid", alignContent: "center" }}>
          <GitBranch size={36} color={p.green}/><h2 style={{ fontFamily: serif, fontSize: "2.2rem", margin: ".7rem 0" }}>Choose an entry point</h2><p style={{ color: p.muted, fontFamily: sans, lineHeight: 1.7 }}>Open a bill from the Docket Room or enter its source bill ID. The Genome resolves its family, sibling bills, events, lineage, momentum, and provenance.</p>
        </main>
      </div> : lookup_loading ? <Empty>Resolving the selected bill against the Civic Genome substrate…</Empty> : lookup_error ? <Empty>Genome lookup failed: {lookup_error.message}</Empty> : !selected ? <Empty>No Civic Genome record currently exists for this Docket bill. The official record remains intact; no relationship has been invented.</Empty> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem", alignItems: "start" }}>
        <aside style={{ display: "grid", gap: ".8rem" }}>
          <section style={panel}><div style={{ fontFamily: mono, fontSize: ".68rem", color: p.green }}>SELECTED BILL</div><h2 style={{ fontFamily: serif, margin: ".45rem 0", fontSize: "1.45rem" }}>{selected.source_bill_number}</h2><div style={{ fontFamily: sans, lineHeight: 1.5 }}>{selected.source_bill_title || "Untitled bill"}</div><div style={{ display: "grid", gap: ".35rem", fontFamily: mono, color: p.muted, fontSize: ".66rem", marginTop: ".75rem" }}><span>{selected.state_code} · {selected.session_key}</span><span>status {selected.bill_status || "unknown"}</span><span>position {selected.current_state_position}</span><span>last action {date(selected.last_action_at)}</span></div>{selected.source_bill_url && <a href={selected.source_bill_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: ".75rem", color: p.green, fontFamily: mono, fontSize: ".66rem" }}>Official source</a>}</section>
          <section style={panel}><div style={{ fontFamily: mono, fontSize: ".68rem", color: p.green, marginBottom: ".6rem" }}>FAMILY</div><div style={{ fontFamily: serif, fontSize: "1.25rem" }}>{family.data?.family_label || "Resolving family…"}</div><div style={{ fontFamily: mono, fontSize: ".64rem", color: p.muted, marginTop: ".5rem" }}>{family.data?.policy_domain} · {family.data?.family_status}</div></section>
        </aside>
        <main style={{ display: "grid", gap: ".8rem" }}>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".75rem" }}><BookOpen size={15}/> Family bills</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".6rem" }}>{(family_bills.data ?? []).map(item => <Link key={item.genome_bill_id} href={`/civic-genome/bill/${item.bill_id}`}><a style={{ display: "block", background: item.genome_bill_id === selected.genome_bill_id ? p.green_soft : p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".75rem", color: p.paper, textDecoration: "none" }}><div style={{ fontFamily: mono, color: p.green, fontSize: ".66rem" }}>{item.state_code} · {item.source_bill_number}</div><div style={{ fontFamily: sans, fontSize: ".82rem", marginTop: ".35rem" }}>{item.source_bill_title || "Untitled bill"}</div></a></Link>)}</div></section>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".75rem" }}><Activity size={15}/> Recorded events</div>{recent_events.length ? <div style={{ display: "grid", gap: ".55rem" }}>{recent_events.map(item => <div key={item.event_id} style={{ borderLeft: `2px solid ${p.green}`, padding: ".2rem 0 .2rem .75rem" }}><div style={{ fontFamily: mono, color: p.green, fontSize: ".66rem" }}>{item.event_type} · {item.state_code}</div><div style={{ fontFamily: sans, fontSize: ".8rem", marginTop: ".2rem" }}>{item.prior_status || "unknown"} → {item.next_status || "unknown"}</div><div style={{ fontFamily: mono, color: p.muted, fontSize: ".62rem", marginTop: ".2rem" }}>{new Date(item.event_timestamp).toLocaleString()}</div></div>)}</div> : <Empty>No events have been recorded for this family.</Empty>}</section>
        </main>
        <aside style={{ display: "grid", gap: ".8rem" }}>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><GitBranch size={15}/> Lineage</div>{(lineage.data ?? []).length ? (lineage.data ?? []).map(item => <div key={item.lineage_edge_id} style={{ background: p.soft, borderRadius: 8, padding: ".65rem", marginBottom: ".5rem" }}><div style={{ fontFamily: sans, fontSize: ".8rem" }}>{item.relationship_type}</div><div style={{ fontFamily: mono, color: p.muted, fontSize: ".62rem" }}>confidence {score(item.confidence_score)}</div></div>) : <Empty>No verified lineage edges currently exist.</Empty>}</section>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><Network size={15}/> Momentum</div><div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: ".5rem" }}><Metric label="Score" value={score(family.data?.momentum_score)}/><Metric label="Acceleration" value={score(family.data?.acceleration_score)}/><Metric label="Active states" value={family.data?.active_state_count ?? 0}/><Metric label="Snapshots" value={momentum.data?.length ?? 0}/></div></section>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><ShieldCheck size={15}/> Provenance boundary</div><p style={{ fontFamily: sans, fontSize: ".78rem", lineHeight: 1.55, color: p.muted, margin: 0 }}>This page reads the Civic Genome substrate. Empty relationships remain empty. Rosetta, Atlas, Prism, and Esquire overlays are not asserted until verified contracts are connected.</p></section>
        </aside>
      </div>}
    </div>
  </div>;
}
