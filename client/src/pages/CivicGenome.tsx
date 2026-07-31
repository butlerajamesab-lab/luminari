import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import { safeArray } from "@/lib/data-guard";
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
const stable_read_options = { retry: false, refetchOnWindowFocus: false } as const;

type operating_contract = {
  service_key: string;
  display_name: string;
  role: string;
  state: string;
  state_label: string;
  detail: string;
  observed_count: number | null;
  bound_count: number | null;
  last_observed_at: string | null;
  boundary: string;
};

const source_id_from_bill = (bill: { source_bill_id?: unknown; structural_dna_json?: unknown }): string | null => {
  const direct_value = bill.source_bill_id;
  if (
    (typeof direct_value === "number" || typeof direct_value === "string")
    && /^\d+$/.test(String(direct_value))
    && Number.isSafeInteger(Number(direct_value))
    && Number(direct_value) > 0
  ) return String(direct_value);
  const dna = bill.structural_dna_json;
  if (!dna || typeof dna !== "object" || Array.isArray(dna)) return null;
  const value = (dna as Record<string, unknown>).source_bill_id;
  if (
    (typeof value === "number" || typeof value === "string")
    && /^\d+$/.test(String(value))
    && Number.isSafeInteger(Number(value))
    && Number(value) > 0
  ) return String(value);
  return null;
};

const contract_state_color = (state: string) => {
  if (["active", "assembled", "completed", "operational", "ready", "ready_for_assembly"].includes(state)) return p.green;
  if (["available_unbound", "in_progress", "waiting"].includes(state)) return "#e6ba66";
  if (["blocked", "contract_error", "error", "unavailable"].includes(state)) return "#ef8b8b";
  return p.muted;
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
  const { isAuthenticated, loading: auth_loading } = useAuth();
  const source_bill_id = params?.bill_id ?? null;
  const numeric_source_bill_id = source_bill_id ? Number(source_bill_id) : null;
  const valid_source_bill_id = numeric_source_bill_id !== null && Number.isSafeInteger(numeric_source_bill_id) && numeric_source_bill_id > 0;
  const [query, set_query] = useState(source_bill_id ?? "");
  const [operation_message, set_operation_message] = useState<string | null>(null);

  const auth_identity = trpc.auth.me.useQuery();
  const is_admin = isAuthenticated && auth_identity.data?.role === "admin";
  const stats = trpc.civicGenome.stats.useQuery(undefined, stable_read_options);
  const families = trpc.civicGenome.list_families.useQuery({ limit: 30 }, stable_read_options);
  const operating_contracts = trpc.civicGenome.operating_contracts.useQuery(undefined, stable_read_options);
  const bill_lookup = trpc.civicGenome.get_bill_by_source_id.useQuery(
    { source_bill_id: numeric_source_bill_id ?? 0 },
    { enabled: valid_source_bill_id, ...stable_read_options },
  );
  const rosetta_pipeline = trpc.civicGenome.get_rosetta_pipeline_status.useQuery(
    { source_bill_id: numeric_source_bill_id ?? 0 },
    { enabled: is_admin && valid_source_bill_id, ...stable_read_options },
  );

  const selected = bill_lookup.data ?? null;
  const family_id = selected?.family_id ?? null;
  const bill_detail = trpc.civicGenome.get_bill_detail.useQuery(
    { genome_bill_id: selected?.genome_bill_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(selected?.genome_bill_id), ...stable_read_options },
  );
  const family = trpc.civicGenome.get_family.useQuery(
    { family_id: family_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(family_id), ...stable_read_options },
  );
  const family_bills = trpc.civicGenome.list_bills.useQuery({ family_id: family_id ?? undefined, limit: 100 }, { enabled: Boolean(family_id), ...stable_read_options });
  const events = trpc.civicGenome.list_events.useQuery({ family_id: family_id ?? undefined, limit: 100 }, { enabled: Boolean(family_id), ...stable_read_options });
  const lineage = trpc.civicGenome.list_lineage_edges.useQuery({ family_id: family_id ?? undefined, limit: 100 }, { enabled: Boolean(family_id), ...stable_read_options });
  const momentum = trpc.civicGenome.list_momentum_snapshots.useQuery(
    { family_id: family_id ?? "00000000-0000-0000-0000-000000000000", limit: 30 },
    { enabled: Boolean(family_id), ...stable_read_options },
  );
  const refresh_selected_record = async () => {
    await Promise.all([
      operating_contracts.refetch(),
      bill_lookup.refetch(),
      rosetta_pipeline.refetch(),
      bill_detail.refetch(),
      family.refetch(),
      family_bills.refetch(),
      events.refetch(),
      lineage.refetch(),
      momentum.refetch(),
    ]);
  };
  const assemble_docket_cache = trpc.civicGenome.resolve_or_assemble_docket_bill.useMutation({
    onSuccess: async result => {
      if (!result.ok) return;
      set_operation_message("The Docket record is now represented in the Civic Genome.");
      await refresh_selected_record();
    },
  });
  const ingest_rosetta_source = trpc.civicGenome.ingest_docket_bill_to_rosetta_source.useMutation({
    onSuccess: async () => {
      set_operation_message("Rosetta accepted the exact Docket source handoff. Extraction status is shown below.");
      await refresh_selected_record();
    },
  });
  const assemble_rosetta_dna = trpc.civicGenome.assemble_rosetta_structural_dna.useMutation({
    onSuccess: async () => {
      set_operation_message("Admissible Rosetta structural DNA was assembled and family resolution was refreshed.");
      await refresh_selected_record();
    },
  });

  const family_items = safeArray<NonNullable<typeof families.data>[number]>(families.data);
  const family_bill_items = safeArray<NonNullable<typeof family_bills.data>[number]>(family_bills.data);
  const event_items = safeArray<NonNullable<typeof events.data>[number]>(events.data);
  const lineage_items = safeArray<NonNullable<typeof lineage.data>[number]>(lineage.data);
  const momentum_items = safeArray<NonNullable<typeof momentum.data>[number]>(momentum.data);
  const recent_events = useMemo(() => event_items.slice(0, 12), [event_items]);
  const traits = bill_detail.data?.structural_dna.traits ?? [];
  const assembly_runs = bill_detail.data?.structural_dna.assembly_runs ?? [];
  const family_assignment = bill_detail.data?.family_assignment ?? null;
  const grouped_traits = useMemo(() => {
    const groups = new Map<string, typeof traits>();
    for (const trait of traits) groups.set(trait.trait_class, [...(groups.get(trait.trait_class) ?? []), trait]);
    return [...groups.entries()];
  }, [traits]);
  const panel = { background: p.panel, border: `1px solid ${p.border}`, borderRadius: 12, padding: "1rem" } as const;
  const contracts = useMemo(() => {
    const observed_contracts = safeArray<operating_contract>(operating_contracts.data?.contracts);
    if (!operating_contracts.isSuccess) return observed_contracts;
    const explicit_empty_contracts: operating_contract[] = [
      {
        service_key: "atlas",
        display_name: "Atlas",
        role: "Verified signal reference",
        state: "not_established",
        state_label: "No Genome binding",
        detail: "No exact Atlas-to-Civic-Genome binding was returned.",
        observed_count: null,
        bound_count: 0,
        last_observed_at: null,
        boundary: "Signals remain Atlas-owned; Civic Genome may reference only explicit bindings.",
      },
      {
        service_key: "prism",
        display_name: "Prism",
        role: "Reasoning and findings",
        state: "not_established",
        state_label: "Contract not established",
        detail: "No Civic Genome identity seam or Prism ingest envelope was returned.",
        observed_count: null,
        bound_count: 0,
        last_observed_at: null,
        boundary: "Rosetta and Civic Genome do not write findings directly into Prism.",
      },
      {
        service_key: "viewfinder",
        display_name: "Viewfinder",
        role: "Comparison materialization",
        state: "not_established",
        state_label: "No materialized comparison",
        detail: "No Civic Genome comparison matrix or state cell was returned.",
        observed_count: 0,
        bound_count: 0,
        last_observed_at: null,
        boundary: "Comparison artifacts remain explicit, versioned outputs.",
      },
      {
        service_key: "kaleidoscope",
        display_name: "Kaleidoscope",
        role: "Projection and scenario reference",
        state: "not_established",
        state_label: "Contract not established",
        detail: "No Civic Genome projection contract was returned.",
        observed_count: null,
        bound_count: 0,
        last_observed_at: null,
        boundary: "Projections do not mutate source observations or Genome-owned structure.",
      },
    ];
    const returned_keys = new Set(observed_contracts.map(contract => contract.service_key));
    return [...observed_contracts, ...explicit_empty_contracts.filter(contract => !returned_keys.has(contract.service_key))];
  }, [operating_contracts.data, operating_contracts.isSuccess]);

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) window.location.assign(`/civic-genome/bill/${encodeURIComponent(value)}`);
  };
  const assemble_selected = () => {
    if (valid_source_bill_id && numeric_source_bill_id !== null) {
      set_operation_message(null);
      assemble_docket_cache.mutate({ source_bill_id: numeric_source_bill_id });
    }
  };
  const ingest_selected_to_rosetta = () => {
    if (valid_source_bill_id && numeric_source_bill_id !== null && is_admin) {
      set_operation_message(null);
      ingest_rosetta_source.mutate({ source_bill_id: numeric_source_bill_id });
    }
  };
  const assemble_selected_rosetta_dna = () => {
    const pipeline = rosetta_pipeline.data;
    if (
      !is_admin
      || !pipeline?.can_assemble
      || !pipeline.genome_bill_id
      || !pipeline.source_document_id
    ) return;
    set_operation_message(null);
    assemble_rosetta_dna.mutate({
      genome_bill_id: pipeline.genome_bill_id,
      source_document_id: pipeline.source_document_id,
      ...(pipeline.extraction_run_id ? { extraction_run_id: pipeline.extraction_run_id } : {}),
    });
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
        <Metric label="Families" value={stats.data?.total_families ?? "—"}/><Metric label="Bills" value={stats.data?.total_bills ?? "—"}/><Metric label="Events" value={stats.data?.total_events ?? "—"}/><Metric label="Observed states" value={stats.data?.observed_state_count ?? "—"}/><Metric label="Cross-state families" value={stats.data?.cross_state_family_count ?? "—"}/>
      </div>

      <section style={{ ...panel, marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap", marginBottom: ".8rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem" }}><Network size={15}/> Operating contracts</div>
            <p style={{ margin: ".35rem 0 0", color: p.muted, fontFamily: sans, fontSize: ".78rem" }}>Observed integrations are distinguished from empty substrates and contracts that have not been established.</p>
          </div>
          <span style={{ fontFamily: mono, color: p.muted, fontSize: ".61rem" }}>read-only service ledger</span>
        </div>
        {operating_contracts.isLoading ? <Empty>Reading the Civic Genome service ledger…</Empty> : operating_contracts.error ? <Empty>Operating contract lookup failed: {operating_contracts.error.message}</Empty> : contracts.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: ".65rem" }}>
          {contracts.map(contract => <article key={contract.service_key} style={{ background: p.soft, border: `1px solid ${p.border}`, borderRadius: 9, padding: ".8rem", display: "grid", alignContent: "start", gap: ".45rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: ".5rem" }}>
              <strong style={{ fontFamily: sans, fontSize: ".87rem" }}>{contract.display_name}</strong>
              <span style={{ color: contract_state_color(contract.state), fontFamily: mono, fontSize: ".59rem", textTransform: "uppercase", textAlign: "right" }}>{contract.state_label}</span>
            </div>
            <div style={{ fontFamily: mono, color: p.green, fontSize: ".61rem" }}>{contract.role}</div>
            <div style={{ fontFamily: sans, color: p.muted, fontSize: ".73rem", lineHeight: 1.45 }}>{contract.detail}</div>
            <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap", fontFamily: mono, color: p.muted, fontSize: ".58rem" }}>
              <span>observed {contract.observed_count ?? "not reported"}</span>
              <span>bound {contract.bound_count ?? "not reported"}</span>
              <span>latest {date(contract.last_observed_at)}</span>
            </div>
            <div style={{ borderTop: `1px solid ${p.border}`, paddingTop: ".4rem", fontFamily: sans, color: p.muted, fontSize: ".66rem", lineHeight: 1.4 }}>{contract.boundary}</div>
          </article>)}
        </div> : <Empty>No service contracts were returned. No integration is inferred from table or service names alone.</Empty>}
      </section>

      {source_bill_id && valid_source_bill_id && <section style={{ ...panel, marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap", marginBottom: ".75rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem" }}><GitBranch size={15}/> Exact bill pipeline</div>
            <p style={{ margin: ".35rem 0 0", color: p.muted, fontFamily: sans, fontSize: ".78rem" }}>Docket source {source_bill_id} · administrative operations preserve service ownership.</p>
          </div>
          <span style={{ fontFamily: mono, color: p.muted, fontSize: ".61rem" }}>{is_admin ? "authenticated administrator" : "read boundary"}</span>
        </div>
        {auth_loading || auth_identity.isLoading ? <Empty>Checking administrative access…</Empty> : !is_admin ? <Empty>Sign in as an administrator to inspect the exact Rosetta handoff and run controlled assembly operations.</Empty> : rosetta_pipeline.isLoading ? <Empty>Reading the exact Docket-to-Rosetta pipeline…</Empty> : rosetta_pipeline.error ? <Empty>Pipeline lookup failed: {rosetta_pipeline.error.message}</Empty> : rosetta_pipeline.data ? <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".6rem" }}>
            {[
              { label: "Docket source", value: String(rosetta_pipeline.data.source_bill_id), detail: "Exact source identifier" },
              { label: "Genome record", value: rosetta_pipeline.data.genome_bill_id ? "Bound" : "Not assembled", detail: rosetta_pipeline.data.genome_bill_id ?? "No Genome UUID" },
              { label: "Rosetta source", value: rosetta_pipeline.data.source_document_id ? "Bound" : "Not ingested", detail: rosetta_pipeline.data.source_document_id ? `document ${rosetta_pipeline.data.source_document_id}` : "No source document" },
              { label: "Extraction", value: rosetta_pipeline.data.run_status ?? "Not started", detail: rosetta_pipeline.data.extraction_run_id ? `run ${rosetta_pipeline.data.extraction_run_id}` : "No extraction run" },
              { label: "Provenance", value: rosetta_pipeline.data.provenance_state ?? "Not observed", detail: `${rosetta_pipeline.data.object_count ?? 0} Rosetta objects reported` },
              { label: "Assembly gate", value: rosetta_pipeline.data.can_assemble ? "Ready" : "Closed", detail: rosetta_pipeline.data.can_assemble ? "Completed Rosetta run available" : "No completed, admissible run" },
            ].map(stage => <div key={stage.label} style={{ background: p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".7rem" }}>
              <div style={{ fontFamily: mono, color: p.muted, fontSize: ".58rem", textTransform: "uppercase" }}>{stage.label}</div>
              <div style={{ fontFamily: sans, color: stage.value === "Ready" || stage.value === "Bound" ? p.green : p.paper, fontWeight: 650, fontSize: ".82rem", marginTop: ".25rem" }}>{stage.value}</div>
              <div style={{ fontFamily: mono, color: p.muted, fontSize: ".56rem", marginTop: ".3rem", overflowWrap: "anywhere" }}>{stage.detail}</div>
            </div>)}
          </div>
          <div style={{ marginTop: ".65rem", background: p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".7rem" }}>
            <div style={{ fontFamily: mono, color: contract_state_color(rosetta_pipeline.data.contract_state), fontSize: ".62rem", textTransform: "uppercase" }}>{rosetta_pipeline.data.contract_state}</div>
            <div style={{ color: p.muted, fontFamily: sans, fontSize: ".75rem", lineHeight: 1.45, marginTop: ".3rem" }}>{rosetta_pipeline.data.contract_message}</div>
            {rosetta_pipeline.data.coverage != null && <details style={{ marginTop: ".45rem" }}><summary style={{ cursor: "pointer", color: p.green, fontFamily: mono, fontSize: ".61rem" }}>Rosetta layer coverage</summary><Value value={rosetta_pipeline.data.coverage}/></details>}
          </div>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: ".75rem" }}>
            <button onClick={ingest_selected_to_rosetta} disabled={ingest_rosetta_source.isPending || Boolean(rosetta_pipeline.data.source_document_id)} style={{ background: p.green_soft, border: `1px solid ${rosetta_pipeline.data.source_document_id ? p.border : p.green}`, color: rosetta_pipeline.data.source_document_id ? p.muted : p.green, borderRadius: 8, padding: ".6rem .85rem", fontFamily: mono, fontSize: ".67rem", cursor: ingest_rosetta_source.isPending ? "wait" : rosetta_pipeline.data.source_document_id ? "not-allowed" : "pointer" }}>
              {ingest_rosetta_source.isPending ? "Creating exact handoff…" : rosetta_pipeline.data.source_document_id ? "Rosetta source already bound" : "Create Rosetta source handoff"}
            </button>
            <button onClick={assemble_selected_rosetta_dna} disabled={assemble_rosetta_dna.isPending || !rosetta_pipeline.data.can_assemble || !rosetta_pipeline.data.genome_bill_id || !rosetta_pipeline.data.source_document_id} style={{ background: p.green_soft, border: `1px solid ${rosetta_pipeline.data.can_assemble ? p.green : p.border}`, color: rosetta_pipeline.data.can_assemble ? p.green : p.muted, borderRadius: 8, padding: ".6rem .85rem", fontFamily: mono, fontSize: ".67rem", cursor: assemble_rosetta_dna.isPending ? "wait" : rosetta_pipeline.data.can_assemble ? "pointer" : "not-allowed" }}>
              {assemble_rosetta_dna.isPending ? "Assembling admissible DNA…" : "Assemble admissible Rosetta DNA"}
            </button>
          </div>
          {!rosetta_pipeline.data.can_assemble && <p style={{ margin: ".55rem 0 0", fontFamily: sans, color: p.muted, fontSize: ".72rem" }}>Assembly remains disabled until Rosetta reports a completed, admissible extraction run for this exact source document.</p>}
          {operation_message && <p style={{ margin: ".55rem 0 0", fontFamily: mono, color: p.green, fontSize: ".65rem" }}>{operation_message}</p>}
          {ingest_rosetta_source.error && <p style={{ margin: ".55rem 0 0", fontFamily: mono, color: "#ef8b8b", fontSize: ".65rem" }}>Rosetta handoff failed: {ingest_rosetta_source.error.message}</p>}
          {assemble_rosetta_dna.error && <p style={{ margin: ".55rem 0 0", fontFamily: mono, color: "#ef8b8b", fontSize: ".65rem" }}>Structural DNA assembly failed: {assemble_rosetta_dna.error.message}</p>}
        </> : <Empty>No pipeline record was returned. No Rosetta binding or assembly state is inferred.</Empty>}
      </section>}

      {!source_bill_id ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem" }}>
        <aside style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".72rem", marginBottom: ".8rem" }}><Network size={15}/> Highest-momentum families</div><div style={{ display: "grid", gap: ".55rem" }}>{family_items.map(item => <div key={item.family_id} style={{ background: p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".7rem" }}><div style={{ fontFamily: sans, fontWeight: 650 }}>{item.family_label}</div><div style={{ fontFamily: mono, fontSize: ".63rem", color: p.muted, marginTop: ".35rem" }}>{item.policy_domain} · {item.family_status} · momentum {score(item.momentum_score)}</div></div>)}</div></aside>
        <main style={{ ...panel, padding: "clamp(1rem,3vw,2rem)", minHeight: 420, display: "grid", alignContent: "center" }}><GitBranch size={36} color={p.green}/><h2 style={{ fontFamily: serif, fontSize: "2.2rem", margin: ".7rem 0" }}>Choose an entry point</h2><p style={{ color: p.muted, fontFamily: sans, lineHeight: 1.7 }}>Open a bill from the Docket Room or enter its source bill ID. The Genome resolves its family, structural DNA, events, lineage, momentum, and provenance.</p></main>
      </div> : !valid_source_bill_id ? <Empty>The source bill ID must be a positive numeric Docket identifier.</Empty> : bill_lookup.isLoading ? <Empty>Resolving the selected bill against the Civic Genome substrate…</Empty> : bill_lookup.error ? <div style={panel}>
        <h2 style={{ fontFamily: serif, margin: 0 }}>Genome service temporarily unavailable</h2>
        <p style={{ color: p.muted, fontFamily: sans, lineHeight: 1.6 }}>The bounded read could not complete. No Docket or Civic Genome record was changed.</p>
        <button onClick={() => bill_lookup.refetch()} disabled={bill_lookup.isFetching} style={{ background: p.green_soft, border: `1px solid ${p.green}`, color: p.green, borderRadius: 8, padding: ".6rem .85rem", fontFamily: mono, fontSize: ".7rem", cursor: bill_lookup.isFetching ? "wait" : "pointer" }}>{bill_lookup.isFetching ? "Retrying…" : "Retry genome lookup"}</button>
        <details style={{ marginTop: ".7rem" }}><summary style={{ cursor: "pointer", color: p.muted, fontFamily: mono, fontSize: ".62rem" }}>Technical detail</summary><div style={{ marginTop: ".35rem", color: p.muted, fontFamily: mono, fontSize: ".62rem", overflowWrap: "anywhere" }}>{bill_lookup.error.message}</div></details>
      </div> : !selected ? <div style={panel}>
        <h2 style={{ fontFamily: serif, marginTop: 0 }}>Not assembled yet</h2><p style={{ color: p.muted, fontFamily: sans, lineHeight: 1.6 }}>No Civic Genome record currently exists for this Docket bill. The official Docket record remains intact and no relationship has been invented.</p>
        <button onClick={assemble_selected} disabled={assemble_docket_cache.isPending || !is_admin} style={{ background: p.green_soft, border: `1px solid ${is_admin ? p.green : p.border}`, color: is_admin ? p.green : p.muted, borderRadius: 8, padding: ".6rem .85rem", fontFamily: mono, fontSize: ".7rem", cursor: assemble_docket_cache.isPending ? "wait" : is_admin ? "pointer" : "not-allowed" }}>{assemble_docket_cache.isPending ? "Assembling from Docket cache…" : is_admin ? "Assemble from Docket cache" : "Administrator sign-in required"}</button>
        {assemble_docket_cache.error && <p style={{ color: p.muted, fontFamily: mono, fontSize: ".68rem" }}>Assembly failed: {assemble_docket_cache.error.message}</p>}
      </div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: "1rem", alignItems: "start" }}>
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

          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".75rem" }}><BookOpen size={15}/> Family bills</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".6rem" }}>{family_bill_items.map(item => { const sibling_source_id = source_id_from_bill(item); const card = <><div style={{ fontFamily: mono, color: p.green, fontSize: ".66rem" }}>{item.state_code} · {item.source_bill_number}</div><div style={{ fontFamily: sans, fontSize: ".82rem", marginTop: ".35rem" }}>{item.source_bill_title || "Untitled bill"}</div></>; const style = { display: "block", background: item.genome_bill_id === selected.genome_bill_id ? p.green_soft : p.soft, border: `1px solid ${p.border}`, borderRadius: 8, padding: ".75rem", color: p.paper, textDecoration: "none" } as const; return sibling_source_id ? <Link key={item.genome_bill_id} href={`/civic-genome/bill/${encodeURIComponent(sibling_source_id)}`}><a style={style}>{card}</a></Link> : <div key={item.genome_bill_id} style={style}>{card}</div>; })}</div></section>

          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".75rem" }}><Activity size={15}/> Recorded events</div>{recent_events.length ? <div style={{ display: "grid", gap: ".55rem" }}>{recent_events.map(item => <div key={item.event_id} style={{ borderLeft: `2px solid ${p.green}`, padding: ".2rem 0 .2rem .75rem" }}><div style={{ fontFamily: mono, color: p.green, fontSize: ".66rem" }}>{item.event_type} · {item.state_code}</div><div style={{ fontFamily: sans, fontSize: ".8rem", marginTop: ".2rem" }}>{item.prior_status || "unknown"} → {item.next_status || "unknown"}</div><div style={{ fontFamily: mono, color: p.muted, fontSize: ".62rem", marginTop: ".2rem" }}>{new Date(item.event_timestamp).toLocaleString()}</div></div>)}</div> : <Empty>No events have been recorded for this family.</Empty>}</section>
        </main>

        <aside style={{ display: "grid", gap: ".8rem" }}>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><GitBranch size={15}/> Lineage</div>{lineage_items.length ? lineage_items.map(item => <div key={item.lineage_edge_id} style={{ background: p.soft, borderRadius: 8, padding: ".65rem", marginBottom: ".5rem" }}><div style={{ fontFamily: sans, fontSize: ".8rem" }}>{item.relationship_type}</div><div style={{ fontFamily: mono, color: p.muted, fontSize: ".62rem" }}>confidence {score(item.confidence_score)}</div></div>) : <Empty>No verified lineage edges currently exist.</Empty>}</section>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><Network size={15}/> Momentum</div><div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: ".5rem" }}><Metric label="Score" value={score(family.data?.momentum_score)}/><Metric label="Acceleration" value={score(family.data?.acceleration_score)}/><Metric label="Active states" value={family.data?.active_state_count ?? 0}/><Metric label="Snapshots" value={momentum_items.length}/></div></section>
          <section style={panel}><div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: mono, color: p.green, fontSize: ".7rem", marginBottom: ".7rem" }}><ShieldCheck size={15}/> Provenance boundary</div><p style={{ fontFamily: sans, fontSize: ".78rem", lineHeight: 1.55, color: p.muted, margin: 0 }}>Structural traits shown here are persisted Rosetta outputs with source object, source block, extraction run, engine version, rule version, and content hash. Family resolution remains explicit: provisional and unresolved outcomes are displayed rather than hidden.</p></section>
        </aside>
      </div>}
    </div>
  </div>;
}
