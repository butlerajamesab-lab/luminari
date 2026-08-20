import { FormEvent, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Gavel,
  GitBranch,
  Landmark,
  Loader2,
  Network,
  Scale,
  Search,
  Shield,
  Users,
  X,
} from "lucide-react";
import { LayerNavBar } from "@/components/LayerNavBar";

const c = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.55)",
  cardBg: "rgba(255,255,255,0.03)",
  cardBorder: "rgba(255,255,255,0.08)",
  purple: "#a855f7",
  gold: "#D4A017",
  teal: "#14b8a6",
  red: "#ef4444",
  amber: "#f59e0b",
  green: "#34d399",
  blue: "#3b82f6",
  cyan: "#22d3ee",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

const NODE_TYPES: Record<string, { label: string; color: string; icon: typeof Network }> = {
  legal_authority: { label: "Legal Authority", color: c.gold, icon: Scale },
  doctrine: { label: "Doctrine", color: c.purple, icon: Gavel },
  case_law: { label: "Case Law", color: c.blue, icon: BookOpen },
  workflow: { label: "Workflow", color: c.green, icon: GitBranch },
  enforcement_pathway: { label: "Enforcement", color: c.red, icon: Shield },
  agency: { label: "Agency", color: c.teal, icon: Building2 },
  oversight_route: { label: "Oversight Route", color: c.cyan, icon: Landmark },
  oversight_body: { label: "Oversight Body", color: "#60a5fa", icon: Landmark },
  deadline: { label: "Deadline", color: c.amber, icon: Clock3 },
  policy_alert: { label: "Policy Alert", color: "#fb7185", icon: AlertTriangle },
  policy_pattern: { label: "Policy Pattern", color: "#c084fc", icon: Network },
  organization: { label: "Organization", color: "#a3e635", icon: Users },
  resource: { label: "Resource", color: "#2dd4bf", icon: FileText },
  program: { label: "Program", color: "#4ade80", icon: FileText },
  contact_record: { label: "Contact", color: "#38bdf8", icon: Users },
  jurisdiction: { label: "Jurisdiction", color: "#f8fafc", icon: Landmark },
  weak_joint: { label: "Weak Joint", color: "#f43f5e", icon: AlertTriangle },
  statute: { label: "Statute", color: c.gold, icon: Scale },
  case: { label: "Case Reference", color: c.blue, icon: BookOpen },
  domain: { label: "Domain", color: c.green, icon: Filter },
};

const DEFAULT_FILTER_TYPES = [
  "legal_authority",
  "workflow",
  "enforcement_pathway",
  "agency",
  "oversight_route",
  "oversight_body",
  "deadline",
  "policy_alert",
  "policy_pattern",
  "organization",
  "resource",
  "program",
  "contact_record",
];

function fmt(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}
function cleanLabel(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "[unnamed]";
  const english = text.match(/['\"]english['\"]\s*:\s*['\"]([^'\"]+)['\"]/i)?.[1];
  return english?.trim() || text;
}

type ExplorerNode = {
  id: string;
  type: string;
  label: string;
  jurisdiction?: string | null;
  state?: string | null;
  origin?: string | null;
  nodeState?: string | null;
  sourceLocator?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  reference?: boolean;
};

type ExplorerEdge = {
  id: string;
  source: string;
  target: string;
  edgeType: string;
  evidenceState?: string | null;
  notes?: string | null;
  reference?: boolean;
};

function nodeTypeInfo(type: string) {
  return NODE_TYPES[type] ?? { label: type.replace(/_/g, " "), color: "#94a3b8", icon: Network };
}

function buildWorkingGraph(data: any): { nodes: ExplorerNode[]; edges: ExplorerEdge[] } {
  if (!data) return { nodes: [], edges: [] };
  const nodes = new Map<string, ExplorerNode>();
  const edges: ExplorerEdge[] = [];

  const addCurrentNode = (row: any) => {
    if (!row?.node_id) return;
    nodes.set(String(row.node_id), {
      id: String(row.node_id),
      type: String(row.node_type ?? "unknown"),
      label: cleanLabel(row.label),
      jurisdiction: row.jurisdiction_code ?? null,
      state: row.node_state ?? null,
      origin: row.node_origin ?? null,
      nodeState: row.node_state ?? null,
      sourceLocator: row.source_locator ?? null,
      metadata: row.metadata ?? null,
    });
  };

  for (const row of Array.isArray(data.current_nodes) ? data.current_nodes : []) addCurrentNode(row);
  for (const row of Array.isArray(data.neighborhood_nodes) ? data.neighborhood_nodes : []) addCurrentNode(row);

  for (const doctrine of Array.isArray(data.doctrines) ? data.doctrines : []) {
    const id = `doctrine:${doctrine.id}`;
    nodes.set(id, {
      id,
      type: "doctrine",
      label: cleanLabel(doctrine.name),
      description: doctrine.description ?? null,
      metadata: { primary_cases: doctrine.primary_cases, domains: doctrine.domains },
      reference: true,
    });
  }

  for (const edge of Array.isArray(data.current_edges) ? data.current_edges : []) {
    if (!edge?.from_node_id || !edge?.to_node_id) continue;
    edges.push({
      id: String(edge.edge_id),
      source: String(edge.from_node_id),
      target: String(edge.to_node_id),
      edgeType: String(edge.edge_type ?? "related"),
      evidenceState: edge.evidence_state ?? null,
    });
  }

  for (const edge of Array.isArray(data.doctrine_edges) ? data.doctrine_edges : []) {
    const source = `${edge.from_type}:${edge.from_id}`;
    const target = `${edge.to_type}:${edge.to_id}`;
    if (!nodes.has(source)) {
      nodes.set(source, {
        id: source,
        type: String(edge.from_type ?? "reference"),
        label: cleanLabel(edge.from_id),
        reference: true,
      });
    }
    if (!nodes.has(target)) {
      nodes.set(target, {
        id: target,
        type: String(edge.to_type ?? "reference"),
        label: cleanLabel(edge.to_id),
        reference: true,
      });
    }
    edges.push({
      id: `reference:${edge.id}`,
      source,
      target,
      edgeType: String(edge.edge_type ?? "related"),
      notes: edge.notes ?? null,
      evidenceState: edge.strength ?? "reference_declared",
      reference: true,
    });
  }

  return { nodes: [...nodes.values()], edges };
}

function deterministicPositions(nodes: ExplorerNode[]) {
  const width = 1200;
  const height = 720;
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.44;
  const positions: Record<string, { x: number; y: number }> = {};
  const sorted = [...nodes].sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  sorted.forEach((node, index) => {
    if (index === 0) {
      positions[node.id] = { x: cx, y: cy };
      return;
    }
    const angle = index * 2.399963229728653;
    const radius = 36 + Math.sqrt(index / Math.max(sorted.length - 1, 1)) * (maxRadius - 36);
    positions[node.id] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
  return positions;
}

function ReferenceSection({
  title,
  subtitle,
  items,
  renderItem,
}: {
  title: string;
  subtitle: string;
  items: any[];
  renderItem: (item: any) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 24);
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ color: c.paper, fontFamily: fontSerif, fontSize: 21, margin: 0 }}>{title}</h2>
          <p style={{ color: c.muted, fontSize: 11, margin: "4px 0 0" }}>{subtitle}</p>
        </div>
        <span style={{ color: c.gold, fontFamily: fontMono, fontSize: 12 }}>{fmt(items.length)} records</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 9 }}>
        {visible.map(renderItem)}
      </div>
      {items.length > 24 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          style={{
            marginTop: 12,
            background: c.cardBg,
            color: c.paper,
            border: `1px solid ${c.cardBorder}`,
            borderRadius: 7,
            padding: "8px 12px",
            cursor: "pointer",
            fontFamily: fontMono,
            fontSize: 11,
          }}
        >
          {expanded ? `Show first 24` : `Show all ${fmt(items.length)}`}
        </button>
      )}
    </section>
  );
}

export default function CivicLegalExplorer() {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAllLoaded, setShowAllLoaded] = useState(false);
  const [showGraphWindow, setShowGraphWindow] = useState(false);

  const explorerQuery = trpc.canonicalCore.legalExplorer.useQuery({
    query: search || undefined,
    jurisdiction: jurisdiction || undefined,
    nodeTypes: activeType === "all" ? DEFAULT_FILTER_TYPES : [activeType],
    limit: 260,
  });

  const data = explorerQuery.data as any;
  const working = useMemo(() => buildWorkingGraph(data), [data]);
  const positions = useMemo(() => deterministicPositions(working.nodes), [working.nodes]);
  const nodeMap = useMemo(() => new Map(working.nodes.map((node) => [node.id, node])), [working.nodes]);
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null;
  const selectedEdges = selectedNodeId
    ? working.edges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
    : [];

  const typeCounts = (data?.node_type_counts ?? {}) as Record<string, number>;
  const availableTypes = Object.entries(typeCounts)
    .filter(([type, count]) => Number(count) > 0 && type !== "source_artifact" && type !== "jurisdiction")
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const currentNodes = (Array.isArray(data?.current_nodes) ? data.current_nodes : []) as any[];
  const currentCatalog = showAllLoaded ? currentNodes : currentNodes.slice(0, 60);
  const doctrines = (Array.isArray(data?.doctrines) ? data.doctrines : []) as any[];
  const caseLaw = (Array.isArray(data?.case_law) ? data.case_law : []) as any[];
  const barriers = (Array.isArray(data?.litigation_barriers) ? data.litigation_barriers : []) as any[];
  const weakJoints = (Array.isArray(data?.weak_joints) ? data.weak_joints : []) as any[];

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setSelectedNodeId(null);
  }

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setJurisdiction("");
    setActiveType("all");
    setSelectedNodeId(null);
  }

  return (
    <div style={{ background: c.bg, minHeight: "100vh", padding: "20px clamp(12px,3vw,32px) 56px", fontFamily: fontSans }}>
      <LayerNavBar label="Civic/Legal Explorer" route="/civic-legal-explorer" />

      <header style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Network size={23} color={c.purple} />
          <h1 style={{ color: c.paper, fontFamily: fontSerif, fontSize: 28, margin: 0 }}>Civic/Legal Explorer</h1>
        </div>
        <p style={{ color: c.muted, maxWidth: 850, fontSize: 13, lineHeight: 1.6, margin: "8px 0 0" }}>
          The full current civic/legal universe is discoverable here without redefining the Doctrine Graph. This surface is catalog-first; the bounded relationship diagram stays collapsed until it is useful.
        </p>
      </header>

      {explorerQuery.isLoading && (
        <div style={{ minHeight: 260, display: "grid", placeItems: "center", border: `1px solid ${c.cardBorder}`, borderRadius: 12 }}>
          <div style={{ textAlign: "center", color: c.muted }}>
            <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: c.purple }} />
            <div style={{ marginTop: 8 }}>Loading current legal universe…</div>
          </div>
        </div>
      )}

      {explorerQuery.error && (
        <div style={{ padding: 18, border: `1px solid ${c.red}55`, background: `${c.red}10`, borderRadius: 10, color: "#fecaca" }}>
          <div style={{ fontWeight: 700 }}>Legal explorer read failed.</div>
          <div style={{ fontSize: 12, marginTop: 5, overflowWrap: "anywhere" }}>{explorerQuery.error.message}</div>
          <button onClick={() => explorerQuery.refetch()} style={{ marginTop: 10, padding: "7px 11px", borderRadius: 6, border: `1px solid ${c.red}66`, background: "transparent", color: "#fecaca" }}>Retry</button>
        </div>
      )}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(125px,1fr))", gap: 9, marginBottom: 16 }}>
            {[
              ["Current graph", data.totals?.graph_nodes_all_types, c.cyan],
              ["Explorer universe", data.totals?.default_current_explorer_nodes, c.purple],
              ["Legal authorities", typeCounts.legal_authority, c.gold],
              ["Workflows", typeCounts.workflow, c.green],
              ["Enforcement", typeCounts.enforcement_pathway, c.red],
              ["Policy alerts", typeCounts.policy_alert, "#fb7185"],
              ["Resources", typeCounts.resource, "#2dd4bf"],
              ["Programs", typeCounts.program, "#4ade80"],
              ["Contacts", typeCounts.contact_record, "#38bdf8"],
              ["Doctrines", data.totals?.doctrines, c.purple],
              ["Case law", data.totals?.case_law, c.blue],
              ["Claim elements", data.totals?.claim_elements, c.amber],
            ].map(([label, value, color]) => (
              <div key={String(label)} style={{ border: `1px solid ${c.cardBorder}`, background: c.cardBg, borderRadius: 9, padding: "10px 11px" }}>
                <div style={{ color: String(color), fontFamily: fontMono, fontWeight: 800, fontSize: 19 }}>{fmt(value)}</div>
                <div style={{ color: c.muted, fontSize: 10, marginTop: 2 }}>{String(label)}</div>
              </div>
            ))}
          </div>

          <form onSubmit={submitSearch} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: 8, border: `1px solid ${c.cardBorder}`, background: c.cardBg, borderRadius: 8, padding: "8px 11px" }}>
              <Search size={15} color={c.muted} />
              <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search law, agencies, workflows, programs, resources…" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: c.paper, fontSize: 12 }} />
            </label>
            <input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value.toUpperCase())} placeholder="Jurisdiction" maxLength={10} style={{ width: 120, border: `1px solid ${c.cardBorder}`, background: c.cardBg, borderRadius: 8, padding: "8px 10px", color: c.paper, outline: "none", fontSize: 12 }} />
            <button type="submit" style={{ border: `1px solid ${c.purple}55`, background: `${c.purple}16`, color: "#d8b4fe", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700 }}>Search universe</button>
            {(search || jurisdiction || activeType !== "all") && (
              <button type="button" onClick={clearFilters} style={{ border: `1px solid ${c.cardBorder}`, background: "transparent", color: c.muted, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}><X size={14} /></button>
            )}
          </form>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
            <button onClick={() => setActiveType("all")} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${activeType === "all" ? c.purple : c.cardBorder}`, background: activeType === "all" ? `${c.purple}18` : "transparent", color: activeType === "all" ? "#d8b4fe" : c.muted, cursor: "pointer", fontSize: 10 }}>All current types</button>
            {availableTypes.map(([type, count]) => {
              const info = nodeTypeInfo(type);
              return (
                <button key={type} onClick={() => setActiveType(type)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${activeType === type ? info.color : c.cardBorder}`, background: activeType === type ? `${info.color}18` : "transparent", color: activeType === type ? info.color : c.muted, cursor: "pointer", fontSize: 10 }}>
                  {info.label} · {fmt(count)}
                </button>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: selectedNode && showGraphWindow ? "minmax(0,1fr) minmax(260px,340px)" : "1fr", gap: 12, alignItems: "start" }}>
            <section style={{ border: `1px solid ${c.cardBorder}`, borderRadius: 12, background: "rgba(0,0,0,.28)", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${c.cardBorder}`, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: c.paper, fontWeight: 700, fontSize: 13 }}>Working graph window</div>
                  <div style={{ color: c.muted, fontSize: 10 }}>
                    {fmt(working.nodes.length)} rendered nodes · {fmt(working.edges.length)} rendered edges · {fmt(data.totals?.filtered_current_nodes)} current nodes match this filter
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: c.amber, fontSize: 10, fontFamily: fontMono }}>window ≠ universe</span>
                  <button
                    type="button"
                    onClick={() => setShowGraphWindow((value) => !value)}
                    style={{ border: `1px solid ${c.cardBorder}`, background: c.cardBg, color: c.paper, borderRadius: 7, padding: "6px 9px", cursor: "pointer", fontSize: 10, fontFamily: fontMono }}
                  >
                    {showGraphWindow ? "Hide graph window" : "Show graph window"}
                  </button>
                </div>
              </div>
              {!showGraphWindow && (
                <div style={{ padding: 12, color: c.muted, fontSize: 11, lineHeight: 1.5 }}>
                  Graph window collapsed by default. Use the catalog below for discovery, then open the graph only when tracing a local relationship neighborhood.
                </div>
              )}
              {showGraphWindow && (
                <>
                  <div style={{ overflowX: "auto" }}>
                <svg viewBox="0 0 1200 720" style={{ width: "100%", minWidth: 720, display: "block", background: "radial-gradient(circle at center,rgba(168,85,247,.07),transparent 55%)" }}>
                  {working.edges.map((edge) => {
                    const a = positions[edge.source];
                    const b = positions[edge.target];
                    if (!a || !b) return null;
                    const semantic = edge.edgeType !== "within_jurisdiction";
                    return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={semantic ? c.purple : "#64748b"} strokeWidth={semantic ? 1.6 : 0.7} opacity={semantic ? 0.55 : 0.22} />;
                  })}
                  {working.nodes.map((node, index) => {
                    const pos = positions[node.id];
                    if (!pos) return null;
                    const info = nodeTypeInfo(node.type);
                    const selected = selectedNodeId === node.id;
                    const related = working.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length;
                    const radius = selected ? 8 : Math.min(6, 3 + Math.sqrt(related));
                    return (
                      <g key={node.id} onClick={() => setSelectedNodeId(selected ? null : node.id)} style={{ cursor: "pointer" }}>
                        {selected && <circle cx={pos.x} cy={pos.y} r={13} fill="none" stroke={info.color} strokeWidth={1.5} opacity={0.6} />}
                        <circle cx={pos.x} cy={pos.y} r={radius} fill={`${info.color}45`} stroke={info.color} strokeWidth={selected ? 2 : 1} />
                        {(selected || index < 36 || related > 2) && (
                          <text x={pos.x + 8} y={pos.y + 3} fill={c.paper} fontSize={selected ? 10 : 7.5} opacity={selected ? 1 : 0.65}>
                            {node.label.length > 34 ? `${node.label.slice(0, 31)}…` : node.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", padding: 10, borderTop: `1px solid ${c.cardBorder}` }}>
                    {Object.entries(NODE_TYPES).slice(0, 16).map(([type, info]) => (
                      <span key={type} style={{ display: "inline-flex", gap: 4, alignItems: "center", color: c.muted, fontSize: 9 }}><i style={{ width: 6, height: 6, borderRadius: "50%", background: info.color }} />{info.label}</span>
                    ))}
                  </div>
                </>
              )}
            </section>

            {selectedNode && showGraphWindow && (
              <aside style={{ border: `1px solid ${c.cardBorder}`, borderRadius: 12, background: c.cardBg, padding: 14, position: "sticky", top: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: nodeTypeInfo(selectedNode.type).color }} />
                  <span style={{ color: nodeTypeInfo(selectedNode.type).color, fontFamily: fontMono, fontSize: 10 }}>{nodeTypeInfo(selectedNode.type).label}</span>
                </div>
                <h3 style={{ color: c.paper, fontFamily: fontSerif, fontSize: 18, lineHeight: 1.25, margin: "8px 0" }}>{selectedNode.label}</h3>
                {selectedNode.jurisdiction && <div style={{ color: c.muted, fontSize: 11 }}>Jurisdiction: {selectedNode.jurisdiction}</div>}
                {selectedNode.description && <p style={{ color: c.muted, fontSize: 11, lineHeight: 1.5 }}>{selectedNode.description}</p>}
                {selectedNode.sourceLocator && <div style={{ color: c.muted, fontFamily: fontMono, fontSize: 9, overflowWrap: "anywhere", marginTop: 8 }}>Source: {selectedNode.sourceLocator}</div>}
                <div style={{ marginTop: 12, borderTop: `1px solid ${c.cardBorder}`, paddingTop: 10 }}>
                  <div style={{ color: c.paper, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Connections · {selectedEdges.length}</div>
                  {selectedEdges.slice(0, 30).map((edge) => {
                    const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                    const other = nodeMap.get(otherId);
                    return (
                      <button key={edge.id} onClick={() => other && setSelectedNodeId(other.id)} style={{ width: "100%", textAlign: "left", border: "none", borderTop: `1px solid ${c.cardBorder}`, background: "transparent", color: c.muted, padding: "7px 0", cursor: other ? "pointer" : "default" }}>
                        <div style={{ color: c.purple, fontFamily: fontMono, fontSize: 9 }}>{edge.edgeType}</div>
                        <div style={{ color: c.paper, fontSize: 10, marginTop: 2 }}>{other?.label ?? otherId}</div>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}
          </div>

          <section style={{ marginTop: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 10, marginBottom: 10 }}>
              <div>
                <h2 style={{ color: c.paper, fontFamily: fontSerif, fontSize: 22, margin: 0 }}>Current Civic/Legal Catalog</h2>
                <p style={{ color: c.muted, fontSize: 11, margin: "4px 0 0" }}>This is the current source-reconciled working window. Change type, jurisdiction, or search terms to reach the rest of the universe.</p>
              </div>
              <span style={{ color: c.cyan, fontFamily: fontMono, fontSize: 11 }}>{fmt(data.totals?.filtered_current_nodes)} match · {fmt(currentNodes.length)} loaded</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 8 }}>
              {currentCatalog.map((row: any) => {
                const info = nodeTypeInfo(String(row.node_type));
                return (
                  <button key={row.node_id} onClick={() => { setSelectedNodeId(String(row.node_id)); setShowGraphWindow(true); }} style={{ textAlign: "left", background: c.cardBg, border: `1px solid ${c.cardBorder}`, borderRadius: 9, padding: 11, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: info.color, fontFamily: fontMono, fontSize: 9 }}>{info.label}</span>
                      <span style={{ color: c.muted, fontSize: 9 }}>{row.jurisdiction_code || "—"}</span>
                    </div>
                    <div style={{ color: c.paper, fontSize: 12, fontWeight: 650, lineHeight: 1.35, marginTop: 5, overflowWrap: "anywhere" }}>{cleanLabel(row.label)}</div>
                    {row.source_locator && <div style={{ color: c.muted, fontFamily: fontMono, fontSize: 8, marginTop: 6, overflowWrap: "anywhere" }}>{row.source_locator}</div>}
                  </button>
                );
              })}
            </div>
            {currentNodes.length > 60 && (
              <button onClick={() => setShowAllLoaded((value) => !value)} style={{ marginTop: 10, border: `1px solid ${c.cardBorder}`, background: c.cardBg, color: c.paper, borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontSize: 10 }}>
                {showAllLoaded ? "Show first 60 loaded" : `Show all ${fmt(currentNodes.length)} loaded in this window`}
              </button>
            )}
          </section>

          <ReferenceSection
            title="Doctrine Registry"
            subtitle="Governed doctrine records remain doctrines; they sit inside the larger legal graph rather than defining its size."
            items={doctrines}
            renderItem={(item) => (
              <button key={item.id} onClick={() => setSelectedNodeId(`doctrine:${item.id}`)} style={{ textAlign: "left", background: c.cardBg, border: `1px solid ${c.cardBorder}`, borderRadius: 9, padding: 11, cursor: "pointer" }}>
                <div style={{ color: c.purple, fontFamily: fontMono, fontSize: 9 }}>Doctrine</div>
                <div style={{ color: c.paper, fontFamily: fontSerif, fontSize: 14, marginTop: 5 }}>{cleanLabel(item.name)}</div>
                <div style={{ color: c.muted, fontSize: 10, lineHeight: 1.45, marginTop: 5 }}>{String(item.description ?? "").slice(0, 220)}</div>
              </button>
            )}
          />

          <ReferenceSection
            title="Case Law Reference Library"
            subtitle="Existing governed case-law records are retained beside current canonical legal authorities instead of being hidden by the newer corpus."
            items={caseLaw}
            renderItem={(item) => (
              <div key={item.id} style={{ background: c.cardBg, border: `1px solid ${c.cardBorder}`, borderRadius: 9, padding: 11 }}>
                <div style={{ display: "flex", gap: 7, justifyContent: "space-between" }}><span style={{ color: c.blue, fontFamily: fontMono, fontSize: 9 }}>Case Law</span><span style={{ color: c.muted, fontSize: 9 }}>{item.jurisdiction || item.court || "—"}</span></div>
                <div style={{ color: c.paper, fontFamily: fontSerif, fontSize: 13, marginTop: 5 }}>{cleanLabel(item.case_name || item.citation)}</div>
                {item.citation && <div style={{ color: c.gold, fontFamily: fontMono, fontSize: 9, marginTop: 3 }}>{item.citation}</div>}
                <div style={{ color: c.muted, fontSize: 10, lineHeight: 1.4, marginTop: 5 }}>{String(item.summary ?? "").slice(0, 220)}</div>
              </div>
            )}
          />

          <ReferenceSection
            title="Litigation Barriers & Weak Joints"
            subtitle="Structural obstacles and documented weak joints remain separate types, available for cross-linking without being mislabeled as law."
            items={[...barriers.map((item) => ({ ...item, _kind: "barrier" })), ...weakJoints.map((item) => ({ ...item, _kind: "weak_joint" }))]}
            renderItem={(item) => (
              <div key={`${item._kind}:${item.id}`} style={{ background: c.cardBg, border: `1px solid ${item._kind === "weak_joint" ? "#f43f5e55" : c.cardBorder}`, borderRadius: 9, padding: 11 }}>
                <div style={{ color: item._kind === "weak_joint" ? "#fb7185" : c.amber, fontFamily: fontMono, fontSize: 9 }}>{item._kind === "weak_joint" ? "Weak Joint" : `Barrier · ${item.barrier_type || "structural"}`}</div>
                <div style={{ color: c.paper, fontSize: 12, fontWeight: 650, marginTop: 5 }}>{cleanLabel(item.title || item.name)}</div>
                <div style={{ color: c.muted, fontSize: 10, lineHeight: 1.4, marginTop: 5 }}>{String(item.description ?? "").slice(0, 220)}</div>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}
