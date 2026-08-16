import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Compass, Eye, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ANOMALIES, PATTERNS } from "./viewfinder-data";

/* ═══════════════════════════════════════════════════════════════════════
   LUMINARI — ANOMALY VIEWFINDER
   Live jurisdiction facts come from v_anomaly_viewfinder_live_v1.
   Historical anomaly/pattern cards remain interpretive analysis until
   promoted to their own derived, provenance-bound layer.
   ═══════════════════════════════════════════════════════════════════════ */

const v = {
  bg: "#0D0D0F",
  surface: "#13131A",
  surface2: "#181820",
  border: "rgba(255,255,255,0.07)",
  borderLit: "rgba(255,200,60,0.3)",
  bone: "#F2EDE4",
  smoke: "#B8B0A0",
  muted: "#665E50",
  gold: "#E8A820",
  amber: "#C87820",
  red: "#C84040",
  blue: "#4A8FBF",
  green: "#5A8F5A",
};

type Mode = "spotlight" | "compare" | "anomalies" | "patterns" | "about";
type SortKey = "name" | "ui" | "wage" | "tanf" | "wageSol" | "crSol" | "port";

type LiveStateData = {
  jurisdictionCode: string;
  name: string;
  fips: string;
  pop: string;
  exp: boolean | null;
  lgbtq: boolean | null;
  ui: number | null;
  uiWk: number | null;
  wage: number | null;
  tanf: number | null;
  wageSol: number | null;
  crSol: number | null;
  port: number | null;
  medicaidRaw: string | null;
  minimumWageRaw: string | null;
  uiMaximumRaw: string | null;
  uiDurationRaw: string | null;
  uiAppealRaw: string | null;
  tanfRaw: string | null;
  wageSolRaw: string | null;
  civilRightsSolRaw: string | null;
  tribalRaw: string | null;
  portabilityRaw: string | null;
  regionalOrUniqueRaw: string | null;
  criticalDeadlinesRaw: string | null;
  sourceVerificationRaw: string | null;
  profileState: string;
  dataState: string;
  tribes: string[];
  flags: string[];
  alerts: string[];
  provenance: unknown;
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const rendered = String(value).trim();
  return rendered ? rendered : null;
}

function display(value: string | null | undefined) {
  return value?.trim() || "Unknown";
}

function splitTribes(value: string | null): string[] {
  if (!value) return [];
  const normalized = value.trim();
  if (/^(none|no federally recognized|no tribal)/i.test(normalized)) return [];
  return normalized
    .split(/\s*[;|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mapLiveRow(row: any): LiveStateData {
  const medicaidRaw = text(row.medicaid_raw);
  const minimumWageRaw = text(row.minimum_wage_raw);
  const uiMaximumRaw = text(row.ui_maximum_raw);
  const uiDurationRaw = text(row.ui_duration_raw);
  const uiAppealRaw = text(row.ui_appeal_deadline_raw);
  const tanfRaw = text(row.tanf_raw);
  const wageSolRaw = text(row.wage_sol_raw);
  const civilRightsSolRaw = text(row.civil_rights_sol_raw);
  const tribalRaw = text(row.tribal_raw);
  const portabilityRaw = text(row.portability_raw);
  const regionalOrUniqueRaw = text(row.regional_or_unique_raw);
  const criticalDeadlinesRaw = text(row.critical_deadlines_raw);
  const sourceVerificationRaw = text(row.source_verification_raw);

  const flags = [
    criticalDeadlinesRaw ? `Deadlines: ${criticalDeadlinesRaw}` : null,
    regionalOrUniqueRaw,
    sourceVerificationRaw ? `Source: ${sourceVerificationRaw}` : null,
    row.profile_state === "corpus_fallback" ? "Source-bound corpus fallback" : null,
  ].filter((item): item is string => Boolean(item));

  const alerts = Array.isArray(row.alerts)
    ? row.alerts.map((item: unknown) => text(item)).filter((item: string | null): item is string => Boolean(item))
    : [];

  return {
    jurisdictionCode: String(row.jurisdiction_code ?? ""),
    name: String(row.jurisdiction_name ?? row.jurisdiction_code ?? "Unknown jurisdiction"),
    fips: String(row.fips ?? row.jurisdiction_code ?? "—"),
    pop: display(text(row.population_raw)),
    exp: typeof row.medicaid_expanded === "boolean" ? row.medicaid_expanded : null,
    lgbtq: typeof row.lgbtq_state_protection === "boolean" ? row.lgbtq_state_protection : null,
    ui: finiteNumber(row.ui_maximum_sort),
    uiWk: finiteNumber(row.ui_duration_sort_weeks),
    wage: finiteNumber(row.minimum_wage_sort),
    tanf: finiteNumber(row.tanf_sort),
    wageSol: finiteNumber(row.wage_sol_sort_years),
    crSol: finiteNumber(row.civil_rights_sol_sort_days),
    port: finiteNumber(row.portability_sort),
    medicaidRaw,
    minimumWageRaw,
    uiMaximumRaw,
    uiDurationRaw,
    uiAppealRaw,
    tanfRaw,
    wageSolRaw,
    civilRightsSolRaw,
    tribalRaw,
    portabilityRaw,
    regionalOrUniqueRaw,
    criticalDeadlinesRaw,
    sourceVerificationRaw,
    profileState: String(row.profile_state ?? "unknown"),
    dataState: String(row.data_state ?? "unknown"),
    tribes: splitTribes(tribalRaw),
    flags,
    alerts,
    provenance: row.provenance ?? null,
  };
}

function nullableCompare(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function metricTone(value: number | null, good: number, warn: number, highIsGood = true) {
  if (value === null) return v.muted;
  if (highIsGood) return value >= good ? v.green : value >= warn ? v.gold : v.red;
  return value <= good ? v.green : value <= warn ? v.gold : v.red;
}

function MetricCard({ label, value, sub, accent = v.gold }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: v.surface2, border: `1px solid ${v.border}`, borderRadius: 10, padding: "14px 16px", minHeight: 92 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.13em", textTransform: "uppercase", color: v.muted, marginBottom: 8 }}>{label}</div>
      <div style={{ color: value === "Unknown" ? v.muted : accent, fontSize: 16, fontWeight: 700, lineHeight: 1.35 }}>{value}</div>
      {sub ? <div style={{ color: v.smoke, fontSize: 11, marginTop: 7, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}

function StatusPill({ children, tone = v.gold }: { children: React.ReactNode; tone?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "5px 9px", borderRadius: 999, border: `1px solid ${tone}55`, color: tone, background: `${tone}12`, fontSize: 10, letterSpacing: "0.04em" }}>
      {children}
    </span>
  );
}

function LiveStateDetail({ state }: { state: LiveStateData }) {
  const medicaid = state.exp === true ? "Expanded" : state.exp === false ? "Not expanded" : "Unknown";
  const lgbtq = state.lgbtq === true ? "Yes" : state.lgbtq === false ? "No" : "Unknown";

  return (
    <section style={{ background: v.surface, border: `1px solid ${v.borderLit}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "20px 22px", borderBottom: `1px solid ${v.border}`, background: "linear-gradient(135deg, rgba(232,168,32,0.08), transparent 55%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: v.muted, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" }}>{state.jurisdictionCode} · FIPS {state.fips}</div>
            <h2 style={{ margin: "5px 0 5px", color: v.bone, fontFamily: "Georgia, serif", fontSize: 29 }}>{state.name}</h2>
            <div style={{ color: v.smoke, fontSize: 12 }}>Population: {state.pop}</div>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <StatusPill tone={state.profileState === "corpus_fallback" ? v.amber : v.green}>{state.profileState === "corpus_fallback" ? "Corpus fallback" : "Promoted profile"}</StatusPill>
            <StatusPill tone={state.dataState.includes("source_bound") ? v.blue : v.muted}>{state.dataState}</StatusPill>
          </div>
        </div>
      </div>

      <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: 10 }}>
        <MetricCard label="Medicaid" value={medicaid} sub={display(state.medicaidRaw)} accent={state.exp === false ? v.red : state.exp === true ? v.green : v.muted} />
        <MetricCard label="UI maximum" value={display(state.uiMaximumRaw)} sub={state.uiAppealRaw ? `Appeal: ${state.uiAppealRaw}` : undefined} accent={metricTone(state.ui, 700, 450)} />
        <MetricCard label="UI duration" value={display(state.uiDurationRaw)} accent={metricTone(state.uiWk, 26, 20)} />
        <MetricCard label="Minimum wage" value={display(state.minimumWageRaw)} accent={metricTone(state.wage, 15, 10)} />
        <MetricCard label="TANF" value={display(state.tanfRaw)} accent={metricTone(state.tanf, 700, 400)} />
        <MetricCard label="Wage claim window" value={display(state.wageSolRaw)} accent={metricTone(state.wageSol, 3, 2)} />
        <MetricCard label="Civil-rights window" value={display(state.civilRightsSolRaw)} accent={metricTone(state.crSol, 365, 180)} />
        <MetricCard label="Portability" value={display(state.portabilityRaw)} sub={state.port === null ? "No numeric helper asserted" : "Numeric helper used only for display ordering"} accent={metricTone(state.port, 58, 50)} />
        <MetricCard label="LGBTQ state protection" value={lgbtq} sub="Unknown unless a consistent source-backed jurisdiction field is present" accent={state.lgbtq === null ? v.muted : state.lgbtq ? v.green : v.red} />
      </div>

      <div style={{ padding: "0 18px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <div style={{ border: `1px solid ${v.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ color: v.gold, fontSize: 11, fontWeight: 700, marginBottom: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>Tribal / sovereignty context</div>
          <div style={{ color: v.smoke, fontSize: 12, lineHeight: 1.55 }}>{display(state.tribalRaw)}</div>
        </div>
        <div style={{ border: `1px solid ${v.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ color: v.gold, fontSize: 11, fontWeight: 700, marginBottom: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>Regional / unique context</div>
          <div style={{ color: v.smoke, fontSize: 12, lineHeight: 1.55 }}>{display(state.regionalOrUniqueRaw)}</div>
        </div>
      </div>

      {state.flags.length ? (
        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ color: v.muted, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Source-bound flags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {state.flags.map((flag, i) => <StatusPill key={`${flag}-${i}`} tone={v.amber}>{flag}</StatusPill>)}
          </div>
        </div>
      ) : null}

      <div style={{ borderTop: `1px solid ${v.border}`, padding: 18 }}>
        <div style={{ color: v.muted, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Current policy alerts</div>
        {state.alerts.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {state.alerts.map((alert, index) => (
              <div key={`${alert}-${index}`} style={{ color: v.smoke, fontSize: 12, lineHeight: 1.55, padding: "9px 11px", borderLeft: `2px solid ${v.amber}`, background: "rgba(200,120,32,0.06)" }}>{alert}</div>
            ))}
          </div>
        ) : <div style={{ color: v.muted, fontSize: 12 }}>Unknown — no current alert text was returned.</div>}
      </div>
    </section>
  );
}

function InterpretiveNotice() {
  return (
    <div style={{ border: `1px solid ${v.borderLit}`, background: "rgba(232,168,32,0.055)", color: v.smoke, borderRadius: 10, padding: "12px 14px", fontSize: 12, lineHeight: 1.55, marginBottom: 18 }}>
      <strong style={{ color: v.gold }}>Interpretive layer:</strong> these anomaly and pattern cards are retained historical/analytical content. They are not the live jurisdiction fact feed and should not be treated as current source verification until promoted to their own provenance-bound derived layer.
    </div>
  );
}

export default function AnomalyViewfinder() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("spotlight");
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState("WA");
  const [sortKey, setSortKey] = useState<SortKey>("name");

  const viewfinderQuery = trpc.resourceDirectory.viewfinderStates.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const liveStates = useMemo(
    () => (viewfinderQuery.data?.states ?? []).map((row: any) => mapLiveRow(row)),
    [viewfinderQuery.data]
  );

  const filteredStates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return liveStates;
    return liveStates.filter((state) =>
      state.name.toLowerCase().includes(q) || state.jurisdictionCode.toLowerCase().includes(q)
    );
  }, [liveStates, search]);

  const sortedStates = useMemo(() => {
    const rows = [...filteredStates];
    rows.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      const diff = nullableCompare(a[sortKey], b[sortKey]);
      return diff || a.name.localeCompare(b.name);
    });
    return rows;
  }, [filteredStates, sortKey]);

  const selectedState = liveStates.find((state) => state.jurisdictionCode === selectedCode) ?? liveStates[0] ?? null;
  const knownPortability = liveStates.filter((state) => state.port !== null).length;
  const fallbackCount = liveStates.filter((state) => state.profileState === "corpus_fallback").length;

  const tabs: Array<{ id: Mode; label: string }> = [
    { id: "spotlight", label: "Spotlight" },
    { id: "compare", label: "Compare" },
    { id: "anomalies", label: "Anomalies" },
    { id: "patterns", label: "Patterns" },
    { id: "about", label: "Method" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: v.bg, color: v.bone, fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header style={{ borderBottom: `1px solid ${v.border}`, background: "linear-gradient(180deg, #111117 0%, #0D0D0F 100%)" }}>
        <div style={{ maxWidth: 1420, margin: "0 auto", padding: "18px 22px 22px" }}>
          <button onClick={() => setLocation("/")} style={{ display: "inline-flex", alignItems: "center", gap: 7, color: v.smoke, background: "transparent", border: 0, cursor: "pointer", padding: 0, fontSize: 12, marginBottom: 18 }}>
            <ArrowLeft size={14} /> Lighthouse
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, color: v.gold, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>
                <Eye size={16} /> Luminari · Public Civic Lens
              </div>
              <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(30px, 5vw, 54px)", lineHeight: 1, margin: 0, fontWeight: 400 }}>Anomaly Viewfinder</h1>
              <p style={{ color: v.smoke, margin: "11px 0 0", maxWidth: 760, lineHeight: 1.55, fontSize: 13 }}>
                Live jurisdiction comparisons from promoted state-directory profiles and current corpus evidence. Raw source text is authoritative; unsupported fields remain Unknown.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusPill tone={v.green}>{viewfinderQuery.isLoading ? "Loading jurisdictions" : `${liveStates.length} jurisdictions live`}</StatusPill>
              <StatusPill tone={v.blue}>Service-bound · no browser SQL</StatusPill>
              <StatusPill tone={v.amber}>Unknown stays Unknown</StatusPill>
            </div>
          </div>
        </div>
      </header>

      <nav style={{ borderBottom: `1px solid ${v.border}`, position: "sticky", top: 0, zIndex: 20, background: "rgba(13,13,15,0.96)", backdropFilter: "blur(12px)" }}>
        <div style={{ maxWidth: 1420, margin: "0 auto", padding: "0 22px", display: "flex", gap: 4, overflowX: "auto" }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setMode(tab.id)} style={{ whiteSpace: "nowrap", border: 0, borderBottom: mode === tab.id ? `2px solid ${v.gold}` : "2px solid transparent", background: "transparent", color: mode === tab.id ? v.bone : v.muted, padding: "13px 15px 11px", cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 1420, margin: "0 auto", padding: "24px 22px 70px" }}>
        {viewfinderQuery.error ? (
          <div style={{ border: `1px solid ${v.red}66`, background: "rgba(200,64,64,0.08)", color: v.bone, padding: 16, borderRadius: 10, marginBottom: 18 }}>
            Live jurisdiction profiles unavailable. No static state-fact fallback was used. {viewfinderQuery.error.message}
          </div>
        ) : null}

        {mode === "spotlight" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 20 }}>
              <MetricCard label="Live jurisdiction rows" value={viewfinderQuery.isLoading ? "Loading…" : String(liveStates.length)} sub="50 states + DC + territories when source-backed" accent={v.green} />
              <MetricCard label="Promoted profiles" value={viewfinderQuery.isLoading ? "Loading…" : String(Math.max(liveStates.length - fallbackCount, 0))} sub="State-directory profile promotion" accent={v.blue} />
              <MetricCard label="Corpus fallbacks" value={viewfinderQuery.isLoading ? "Loading…" : String(fallbackCount)} sub="Explicitly labeled; never silent" accent={v.amber} />
              <MetricCard label="Portability coverage" value={viewfinderQuery.isLoading ? "Loading…" : `${knownPortability}/${liveStates.length || "—"}`} sub="Unknown where no source-backed score exists" accent={v.gold} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.45fr)", gap: 18 }} className="viewfinder-spotlight-grid">
              <section style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: 14, padding: 16, minHeight: 400 }}>
                <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 12 }}>
                  <Compass size={16} color={v.gold} />
                  <div style={{ color: v.bone, fontWeight: 700, fontSize: 13 }}>Jurisdiction index</div>
                </div>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jurisdiction or code…" style={{ width: "100%", boxSizing: "border-box", background: v.bg, border: `1px solid ${v.border}`, color: v.bone, borderRadius: 8, padding: "10px 11px", outline: "none", fontSize: 12, marginBottom: 11 }} />

                {viewfinderQuery.isLoading ? <div style={{ color: v.muted, padding: 12 }}>Loading live jurisdiction profiles…</div> : null}
                {!viewfinderQuery.isLoading && !filteredStates.length ? <div style={{ color: v.muted, padding: 12 }}>No live jurisdiction profile matches this search.</div> : null}

                <div style={{ display: "grid", gap: 6, maxHeight: 640, overflowY: "auto", paddingRight: 4 }}>
                  {filteredStates.map((state) => {
                    const active = selectedState?.jurisdictionCode === state.jurisdictionCode;
                    return (
                      <button key={state.jurisdictionCode} onClick={() => setSelectedCode(state.jurisdictionCode)} style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", gap: 10, alignItems: "center", textAlign: "left", background: active ? "rgba(232,168,32,0.08)" : "rgba(255,255,255,0.015)", border: `1px solid ${active ? v.borderLit : v.border}`, borderRadius: 9, padding: "9px 10px", cursor: "pointer" }}>
                        <span style={{ color: active ? v.gold : v.muted, fontWeight: 800, fontSize: 11 }}>{state.jurisdictionCode}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", color: v.bone, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.name}</span>
                          <span style={{ display: "block", color: v.muted, fontSize: 10, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display(state.minimumWageRaw)}</span>
                        </span>
                        <span style={{ color: state.port === null ? v.muted : metricTone(state.port, 58, 50), fontSize: 10 }}>{state.portabilityRaw ?? "Unknown"}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {selectedState ? <LiveStateDetail state={selectedState} /> : (
                <section style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: 14, padding: 20, color: v.muted }}>Select a live jurisdiction profile.</section>
              )}
            </div>
          </>
        ) : null}

        {mode === "compare" ? (
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div style={{ color: v.gold, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>Live comparison plane</div>
                <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 29, margin: 0 }}>Jurisdiction comparison</h2>
                <p style={{ color: v.smoke, margin: "7px 0 0", fontSize: 12 }}>Visible values are raw source-backed text. Numeric helpers only control ordering and color.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter jurisdictions…" style={{ background: v.surface, border: `1px solid ${v.border}`, color: v.bone, borderRadius: 8, padding: "9px 10px", fontSize: 12 }} />
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} style={{ background: v.surface, border: `1px solid ${v.border}`, color: v.bone, borderRadius: 8, padding: "9px 10px", fontSize: 12 }}>
                  <option value="name">Name</option>
                  <option value="ui">UI maximum</option>
                  <option value="wage">Minimum wage</option>
                  <option value="tanf">TANF</option>
                  <option value="wageSol">Wage SOL</option>
                  <option value="crSol">Civil-rights window</option>
                  <option value="port">Portability</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: "auto", border: `1px solid ${v.border}`, borderRadius: 12, background: v.surface }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1320, fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.025)" }}>
                    {["Jurisdiction","Medicaid","UI maximum","UI duration","Minimum wage","TANF","Wage window","Civil-rights window","Portability","LGBTQ protection"].map((heading) => (
                      <th key={heading} style={{ textAlign: "left", color: v.muted, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", padding: "11px 10px", borderBottom: `1px solid ${v.border}` }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStates.map((state) => (
                    <tr key={state.jurisdictionCode} onClick={() => { setSelectedCode(state.jurisdictionCode); setMode("spotlight"); }} style={{ cursor: "pointer" }}>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}` }}><strong style={{ color: v.bone }}>{state.name}</strong><div style={{ color: v.muted, marginTop: 3 }}>{state.jurisdictionCode}</div></td>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.exp === null ? v.muted : state.exp ? v.green : v.red }}>{state.exp === null ? "Unknown" : state.exp ? "Expanded" : "Not expanded"}</td>
                      <td title={state.uiMaximumRaw ?? undefined} style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.ui === null ? v.muted : metricTone(state.ui, 700, 450) }}>{display(state.uiMaximumRaw)}</td>
                      <td title={state.uiDurationRaw ?? undefined} style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.uiWk === null ? v.muted : metricTone(state.uiWk, 26, 20) }}>{display(state.uiDurationRaw)}</td>
                      <td title={state.minimumWageRaw ?? undefined} style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.wage === null ? v.muted : metricTone(state.wage, 15, 10) }}>{display(state.minimumWageRaw)}</td>
                      <td title={state.tanfRaw ?? undefined} style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.tanf === null ? v.muted : metricTone(state.tanf, 700, 400) }}>{display(state.tanfRaw)}</td>
                      <td title={state.wageSolRaw ?? undefined} style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.wageSol === null ? v.muted : metricTone(state.wageSol, 3, 2) }}>{display(state.wageSolRaw)}</td>
                      <td title={state.civilRightsSolRaw ?? undefined} style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.crSol === null ? v.muted : metricTone(state.crSol, 365, 180) }}>{display(state.civilRightsSolRaw)}</td>
                      <td title={state.portabilityRaw ?? undefined} style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.port === null ? v.muted : metricTone(state.port, 58, 50) }}>{display(state.portabilityRaw)}</td>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${v.border}`, color: state.lgbtq === null ? v.muted : state.lgbtq ? v.green : v.red }}>{state.lgbtq === null ? "Unknown" : state.lgbtq ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {mode === "anomalies" ? (
          <section>
            <InterpretiveNotice />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
              {ANOMALIES.map((item, index) => {
                const tone = item.severity === "critical" ? v.red : item.severity === "warning" ? v.amber : v.blue;
                return (
                  <article key={`${item.title}-${index}`} style={{ background: v.surface, border: `1px solid ${v.border}`, borderTop: `2px solid ${tone}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                      <span style={{ color: tone, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>{item.type}</span>
                      <span style={{ color: v.muted, fontSize: 9, textTransform: "uppercase" }}>{item.severity}</span>
                    </div>
                    <h3 style={{ color: v.bone, fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 20, lineHeight: 1.25, margin: "0 0 11px" }}>{item.title}</h3>
                    <div style={{ color: v.smoke, fontSize: 12, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: item.body }} />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 13 }}>
                      {item.tags.map((tag, tagIndex) => <StatusPill key={`${tag.label}-${tagIndex}`} tone={tone}>{tag.bold ? `${tag.bold} · ` : ""}{tag.label}</StatusPill>)}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {mode === "patterns" ? (
          <section>
            <InterpretiveNotice />
            <div style={{ display: "grid", gap: 12 }}>
              {PATTERNS.map((item) => (
                <article key={item.num} style={{ display: "grid", gridTemplateColumns: "54px minmax(0,1fr)", gap: 15, background: v.surface, border: `1px solid ${v.border}`, borderRadius: 12, padding: 18 }}>
                  <div style={{ color: v.gold, fontFamily: "Georgia, serif", fontSize: 26 }}>{item.num}</div>
                  <div>
                    <div style={{ color: v.muted, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>{item.category}</div>
                    <h3 style={{ color: v.bone, fontFamily: "Georgia, serif", fontSize: 19, fontWeight: 400, margin: "0 0 8px" }}>{item.headline}</h3>
                    <div style={{ color: v.smoke, fontSize: 12, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: item.body }} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {mode === "about" ? (
          <section style={{ maxWidth: 980 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}><MapPin size={18} color={v.gold} /><h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 400 }}>Live Viewfinder method</h2></div>
            <div style={{ display: "grid", gap: 12 }}>
              {[
                ["1 · Current jurisdiction facts", "The comparison and spotlight views read from a service-role-backed live projection. The browser does not query Supabase directly."],
                ["2 · Raw source text is authoritative", "Minimum wage, UI, TANF, filing windows, portability, tribal context, and other visible values are shown from preserved source text. Parsed numeric fields only support sorting and visual emphasis."],
                ["3 · Unknown is a first-class result", "If the promoted profile or current corpus does not support a field, Viewfinder shows Unknown. It does not reuse the old static table, infer a value from neighboring states, or silently fill the gap."],
                ["4 · Colorado is explicit", "Colorado currently lacks a promoted jurisdiction_snapshot row, so its profile is assembled from current provenance-bound corpus objects and promoted registry metrics. The UI labels that path as a corpus fallback."],
                ["5 · Anomalies and patterns remain interpretive", "The historical anomaly and hidden-pattern cards are retained as analysis. They are visually separated from the live jurisdiction fact plane until they are rebuilt as derived, provenance-bound outputs."],
              ].map(([title, body]) => (
                <div key={title} style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: 12, padding: 18 }}>
                  <h3 style={{ color: v.gold, fontSize: 13, margin: "0 0 8px" }}>{title}</h3>
                  <p style={{ color: v.smoke, fontSize: 13, lineHeight: 1.65, margin: 0 }}>{body}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <style>{`
        @media (max-width: 900px) {
          .viewfinder-spotlight-grid { grid-template-columns: 1fr !important; }
        }
        button:hover { filter: brightness(1.08); }
        ::selection { background: rgba(232,168,32,.28); color: #F2EDE4; }
      `}</style>
    </div>
  );
}
