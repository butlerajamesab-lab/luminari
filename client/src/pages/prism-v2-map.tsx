import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2,
  ChevronDown, ChevronRight, CircleDot, Clock3, Database, Download, Eye,
  FileCheck2, FileSearch, Fingerprint, Gauge, GitBranch, Home, Layers3,
  Link2, ListFilter, LockKeyhole, MapPin, Menu, Network, PanelLeftClose,
  PanelLeftOpen, Route, Search, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, X, Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildCorrelationGraph, computeAggregates, computeHotspots,
  deterministicLayout, downloadJson, normalizeJurisdictionLevel,
  type PrismBatch, type PrismCorrelation, type PrismInstance, type PrismHotspot,
} from "./prism-v2-data";
import {
  FrictionBar, HotspotModal, MiniMetric, PROBLEM_COLORS,
  ProblemBadge, RISK_COLORS, RiskBadge, SectionCard, StatusPill,
  classNames, navigateInstance, percent,
} from "./prism-v2-shared";
import { FilterSelect } from "./prism-v2-control-room";
export function CorrelationMapView({ batch, navigate }: { batch: PrismBatch; navigate: (path: string) => void }) {
  const [jurisdiction, setJurisdiction] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [problemType, setProblemType] = useState("ALL");
  const [strongOnly, setStrongOnly] = useState(false);
  const [colorMode, setColorMode] = useState<"type" | "jurisdiction">("type");
  const [selectedNode, setSelectedNode] = useState<PrismInstance | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<PrismHotspot | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const allEdges = useMemo(() => buildCorrelationGraph(batch.instances), [batch.instances]);
  const hotspots = useMemo(() => computeHotspots(batch.instances), [batch.instances]);
  const jurisdictions = useMemo(() => Array.from(new Set(batch.instances.map((item) => item.jurisdiction))).sort(), [batch.instances]);

  const visibleNodes = useMemo(() => batch.instances.filter((instance) => {
    if (jurisdiction !== "ALL" && instance.jurisdiction !== jurisdiction) return false;
    if (level !== "ALL" && normalizeJurisdictionLevel(instance.jurisdiction) !== level) return false;
    if (problemType !== "ALL" && instance.problem_type !== problemType) return false;
    return true;
  }), [batch.instances, jurisdiction, level, problemType]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.record_id)), [visibleNodes]);
  const visibleEdges = useMemo(() => allEdges.filter((edge) =>
    visibleIds.has(edge.source) && visibleIds.has(edge.target) && (!strongOnly || edge.weight === "strong"),
  ), [allEdges, visibleIds, strongOnly]);
  const positions = useMemo(() => deterministicLayout(visibleNodes, 1180, 700), [visibleNodes]);
  const nodeById = useMemo(() => new Map(batch.instances.map((node) => [node.record_id, node])), [batch.instances]);
  const crossJurisdiction = visibleEdges.filter((edge) => nodeById.get(edge.source)?.jurisdiction !== nodeById.get(edge.target)?.jurisdiction).length;
  const palette = useMemo(() => {
    const values = Array.from(new Set(visibleNodes.map((node) => node.jurisdiction))).sort();
    const colors = ["#22d3ee", "#f97316", "#a855f7", "#22c55e", "#eab308", "#ec4899", "#60a5fa", "#f43f5e", "#14b8a6", "#c084fc", "#84cc16"];
    return new Map(values.map((value, index) => [value, colors[index % colors.length]]));
  }, [visibleNodes]);

  return (
    <div className="space-y-4">
      {selectedHotspot && <HotspotModal hotspot={selectedHotspot} onClose={() => setSelectedHotspot(null)} navigate={navigate} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Visible nodes" value={String(visibleNodes.length)} />
        <MiniMetric label="Visible links" value={String(visibleEdges.length)} />
        <MiniMetric label="Cross-jurisdiction" value={String(crossJurisdiction)} />
        <MiniMetric label="Hotspots" value={String(hotspots.length)} />
      </div>

      <SectionCard title="Correlation filters" icon={<SlidersHorizontal className="h-4 w-4" />}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <FilterSelect value={jurisdiction} onChange={setJurisdiction} options={["ALL", ...jurisdictions]} label="Jurisdiction" />
          <FilterSelect value={level} onChange={setLevel} options={["ALL", "federal", "state", "county", "city", "tribal"]} label="Level" />
          <FilterSelect value={problemType} onChange={setProblemType} options={["ALL", "DENIAL", "ESCALATION", "GAP", "CONTRADICTION", "SIGNAL"]} label="Problem type" />
          <button
            type="button"
            onClick={() => setStrongOnly((value) => !value)}
            className={classNames(
              "rounded-lg border px-3 py-2 text-xs font-medium",
              strongOnly ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : "border-slate-800 bg-slate-950 text-slate-500",
            )}
          >
            Strong edges only
          </button>
          <button
            type="button"
            onClick={() => setColorMode((value) => value === "type" ? "jurisdiction" : "type")}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-400 hover:border-cyan-500/30"
          >
            Color: {colorMode}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Deterministic correlation graph"
        icon={<Network className="h-4 w-4" />}
        action={<StatusPill tone="cyan">frontend-derived · read-only</StatusPill>}
      >
        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#02070c]">
          <svg viewBox="0 0 1180 700" className="h-[520px] w-full min-w-[720px] sm:h-[620px]">
            <defs>
              <radialGradient id="prismGlow">
                <stop offset="0%" stopColor="#0e7490" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#02070c" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="1180" height="700" fill="url(#prismGlow)" />
            {visibleEdges.map((edge) => {
              const source = positions.get(edge.source);
              const target = positions.get(edge.target);
              if (!source || !target) return null;
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={edge.weight === "strong" ? "#22d3ee" : "#8b5cf6"}
                  strokeOpacity={edge.weight === "strong" ? 0.33 : 0.10}
                  strokeWidth={edge.weight === "strong" ? 1.4 : 0.65}
                />
              );
            })}
            {visibleNodes.map((node) => {
              const position = positions.get(node.record_id);
              if (!position) return null;
              const color = colorMode === "type"
                ? PROBLEM_COLORS[node.problem_type] || "#64748b"
                : palette.get(node.jurisdiction) || "#64748b";
              const radius = 5 + Math.max(0, Math.min(1, node.friction.coefficient)) * 7;
              const selected = selectedNode?.record_id === node.record_id;
              return (
                <g
                  key={node.record_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedNode(node)}
                  onDoubleClick={() => navigateInstance(navigate, node.record_id, "correlations")}
                  className="cursor-pointer"
                >
                  {selected && <circle cx={position.x} cy={position.y} r={radius + 8} fill="none" stroke="#fff" strokeOpacity="0.65" strokeWidth="1" />}
                  <circle cx={position.x} cy={position.y} r={radius} fill={color} fillOpacity="0.86" stroke="#02070c" strokeWidth="2" />
                  <title>{node.record_id} · {node.jurisdiction} · {node.system_primary}</title>
                </g>
              );
            })}
          </svg>
          {selectedNode && (
            <div className="absolute bottom-3 left-3 right-3 max-w-lg rounded-xl border border-cyan-500/25 bg-[#071018]/95 p-4 shadow-2xl backdrop-blur sm:right-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><ProblemBadge type={selectedNode.problem_type} /><RiskBadge risk={selectedNode.risk_level} /></div>
                  <div className="mt-2 font-mono text-sm text-slate-100">{selectedNode.record_id}</div>
                  <div className="mt-1 text-xs text-slate-500">{selectedNode.jurisdiction} · {selectedNode.system_primary}</div>
                </div>
                <button type="button" onClick={() => setSelectedNode(null)} className="p-1 text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={() => navigateInstance(navigate, selectedNode.record_id, "correlations")} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200">
                Open in Control Room <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-slate-600">
          {Object.entries(PROBLEM_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{type}</span>
          ))}
          <span className="ml-auto">Double-click node to inspect</span>
        </div>
      </SectionCard>

      <SectionCard title="Friction hotspots" icon={<Activity className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {hotspots.slice(0, 8).map((hotspot) => (
            <button key={hotspot.id} type="button" onClick={() => setSelectedHotspot(hotspot)} className="rounded-lg border border-orange-500/15 bg-orange-500/[0.03] p-3 text-left hover:border-orange-500/35">
              <div className="flex justify-between gap-2"><div><div className="font-semibold text-slate-200">{hotspot.jurisdiction}</div><div className="text-xs text-slate-500">{hotspot.system}</div></div><span className="font-mono text-lg text-orange-300">{percent(hotspot.averageFriction, 0)}</span></div>
              <div className="mt-3 flex justify-between font-mono text-[9px] uppercase tracking-wider text-slate-600"><span>{hotspot.instanceCount} records</span><span>{hotspot.dominantProblemType}</span></div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Diagnostics"
        icon={<Database className="h-4 w-4" />}
        action={<button type="button" onClick={() => setShowDiagnostics((value) => !value)} className="text-xs text-cyan-300">{showDiagnostics ? "Hide" : "Show"}</button>}
      >
        {showDiagnostics ? (
          <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-500">{JSON.stringify({
            source_records: batch.instances.length,
            visible_nodes: visibleNodes.length,
            directed_candidate_edges: allEdges.length * 2,
            deduplicated_edge_count: allEdges.length,
            visible_edge_count: visibleEdges.length,
            rule: "same_problem_type=.35; same_system=.30; same_jurisdiction=.25; same_level=.10; friction_alignment=.10; threshold=.25",
          }, null, 2)}</pre>
        ) : (
          <p className="text-sm text-slate-600">Development accounting is collapsed by default. No debug payload is exposed above the graph.</p>
        )}
      </SectionCard>
    </div>
  );
}

export { ProvenanceIndexView, ExportView } from "./prism-v2-secondary";
