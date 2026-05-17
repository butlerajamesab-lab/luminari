import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Network, Loader2, ChevronRight, Search, Filter, X,
  BookOpen, Scale, Shield, AlertTriangle, Building2,
  ArrowRight, Maximize2, Minimize2, Info, Layers,
} from "lucide-react";
import { LayerNavBar } from "@/components/LayerNavBar";

/* ═══════════════════════════════════════════════════════════════════════
   DOCTRINE GRAPH EXPLORER
   
   Visualizes the connections between legal doctrines, statutes, agencies,
   case law, and weak joints. Interactive force-directed graph with
   filtering, search, and detail panels.
   ═══════════════════════════════════════════════════════════════════════ */

const c = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.55)",
  cardBg: "rgba(255,255,255,0.03)",
  cardBorder: "rgba(255,255,255,0.08)",
  purple: "#a855f7",
  purpleBg: "rgba(168,85,247,0.08)",
  purpleBorder: "rgba(168,85,247,0.25)",
  gold: "#D4A017",
  goldBg: "rgba(212,160,23,0.08)",
  goldBorder: "rgba(212,160,23,0.3)",
  teal: "#0e7490",
  tealBg: "rgba(14,116,144,0.08)",
  tealBorder: "rgba(14,116,144,0.3)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.06)",
  redBorder: "rgba(239,68,68,0.25)",
  amber: "#f59e0b",
  green: "#34d399",
  blue: "#3b82f6",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

// Node type colors and icons
const NODE_TYPES: Record<string, { color: string; label: string }> = {
  doctrine: { color: c.purple, label: "Doctrine" },
  statute: { color: c.gold, label: "Statute" },
  case: { color: c.blue, label: "Case Law" },
  agency: { color: c.teal, label: "Agency" },
  weak_joint: { color: c.red, label: "Weak Joint" },
  domain: { color: c.green, label: "Domain" },
};

const EDGE_TYPES: Record<string, { color: string; label: string }> = {
  interpreted_by: { color: "#8b5cf6", label: "Interpreted By" },
  creates: { color: "#22c55e", label: "Creates" },
  triggers: { color: "#f59e0b", label: "Triggers" },
  fails_at: { color: "#ef4444", label: "Fails At" },
  enforced_by: { color: "#0ea5e9", label: "Enforced By" },
  routes_to: { color: "#14b8a6", label: "Routes To" },
  associated_with: { color: "#6b7280", label: "Associated With" },
  blocks: { color: "#dc2626", label: "Blocks" },
  supports: { color: "#34d399", label: "Supports" },
};

const STRENGTH_STYLES: Record<string, { width: number; opacity: number }> = {
  strong: { width: 3, opacity: 1 },
  moderate: { width: 2, opacity: 0.7 },
  contextual: { width: 1, opacity: 0.4 },
};

// Simple force-directed graph layout
interface GraphNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
}

interface GraphEdge {
  id: number;
  source: string;
  target: string;
  edgeType: string;
  strength: string;
  notes: string | null;
}

function useForceLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);

  useEffect(() => {
    if (nodes.length === 0) return;

    // Initialize positions in a circle
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;
    const initialized = nodes.map((n, i) => ({
      ...n,
      x: cx + radius * Math.cos((2 * Math.PI * i) / nodes.length) + (Math.random() - 0.5) * 20,
      y: cy + radius * Math.sin((2 * Math.PI * i) / nodes.length) + (Math.random() - 0.5) * 20,
      vx: 0,
      vy: 0,
    }));
    nodesRef.current = initialized;

    let iteration = 0;
    const maxIterations = 200;

    const tick = () => {
      if (iteration >= maxIterations) return;
      iteration++;

      const ns = nodesRef.current;
      const repulsion = 800;
      const attraction = 0.02;
      const damping = 0.85;
      const centerGravity = 0.005;

      // Reset forces
      for (const n of ns) {
        n.vx = 0;
        n.vy = 0;
      }

      // Repulsion between all nodes
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[i].x - ns[j].x;
          const dy = ns[i].y - ns[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          ns[i].vx += fx;
          ns[i].vy += fy;
          ns[j].vx -= fx;
          ns[j].vy -= fy;
        }
      }

      // Attraction along edges
      const nodeMap = new Map(ns.map(n => [n.id, n]));
      for (const e of edges) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * attraction;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Center gravity
      for (const n of ns) {
        n.vx += (cx - n.x) * centerGravity;
        n.vy += (cy - n.y) * centerGravity;
      }

      // Apply velocity with damping
      for (const n of ns) {
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
        // Clamp to bounds
        n.x = Math.max(40, Math.min(width - 40, n.x));
        n.y = Math.max(40, Math.min(height - 40, n.y));
      }

      const newPositions: Record<string, { x: number; y: number }> = {};
      for (const n of ns) {
        newPositions[n.id] = { x: n.x, y: n.y };
      }
      setPositions(newPositions);

      if (iteration < maxIterations) {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes.length, edges.length, width, height]);

  return positions;
}

export default function DoctrineGraph() {
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterEdge, setFilterEdge] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });

  const { data: graphData, isLoading } = trpc.enforcementIntel.getDoctrineGraph.useQuery();
  const { data: doctrineList } = trpc.enforcementIntel.listDoctrines.useQuery();

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDims({ w: entry.contentRect.width, h: expanded ? 700 : 500 });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [expanded]);

  // Build graph nodes and edges
  const { nodes, edges } = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };

    const nodeSet = new Map<string, GraphNode>();
    const graphEdges: GraphEdge[] = [];

    // Build ID -> name lookup for doctrine nodes
    const doctrineById = new Map<string, string>();
    for (const d of graphData.doctrines) {
      doctrineById.set(String(d.id), d.name);
    }

    // Add doctrines as nodes — keyed by numeric ID so edges connect correctly
    for (const d of graphData.doctrines) {
      const id = `doctrine:${d.id}`;
      nodeSet.set(id, {
        id, type: "doctrine", label: d.name,
        x: 0, y: 0, vx: 0, vy: 0, connections: 0,
      });
    }

    // Add edges and create nodes for endpoints
    for (const e of graphData.edges) {
      const sourceId = `${e.fromType}:${e.fromId}`;
      const targetId = `${e.toType}:${e.toId}`;
      const sourceLabel = e.fromType === 'doctrine'
        ? (doctrineById.get(String(e.fromId)) ?? e.fromId)
        : e.fromId;
      const targetLabel = e.toType === 'doctrine'
        ? (doctrineById.get(String(e.toId)) ?? e.toId)
        : e.toId;

      if (!nodeSet.has(sourceId)) {
        nodeSet.set(sourceId, {
          id: sourceId, type: e.fromType, label: sourceLabel,
          x: 0, y: 0, vx: 0, vy: 0, connections: 0,
        });
      }
      if (!nodeSet.has(targetId)) {
        nodeSet.set(targetId, {
          id: targetId, type: e.toType, label: targetLabel,
          x: 0, y: 0, vx: 0, vy: 0, connections: 0,
        });
      }

      nodeSet.get(sourceId)!.connections++;
      nodeSet.get(targetId)!.connections++;

      graphEdges.push({
        id: e.id,
        source: sourceId,
        target: targetId,
        edgeType: e.edgeType,
        strength: e.strength,
        notes: e.notes,
      });
    }

    return { nodes: Array.from(nodeSet.values()), edges: graphEdges };
  }, [graphData]);

  // Apply filters
  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (filterType) result = result.filter(n => n.type === filterType);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(n => n.label.toLowerCase().includes(q));
    }
    return result;
  }, [nodes, filterType, search]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    let result = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    if (filterEdge) result = result.filter(e => e.edgeType === filterEdge);
    return result;
  }, [edges, filteredNodes, filterEdge]);

  const positions = useForceLayout(filteredNodes, filteredEdges, dims.w, dims.h);

  // Selected node details
  const selectedDetails = useMemo(() => {
    if (!selectedNode) return null;
    const node = filteredNodes.find(n => n.id === selectedNode);
    if (!node) return null;
    const connectedEdges = filteredEdges.filter(e => e.source === selectedNode || e.target === selectedNode);
    const connectedNodes = connectedEdges.map(e => {
      const otherId = e.source === selectedNode ? e.target : e.source;
      return { edge: e, node: filteredNodes.find(n => n.id === otherId) };
    }).filter(c => c.node);
    const doctrine = doctrineList?.find(d => `doctrine:${d.id}` === selectedNode);
    return { node, connectedEdges, connectedNodes, doctrine };
  }, [selectedNode, filteredNodes, filteredEdges, doctrineList]);

  if (isLoading) {
    return (
      <div style={{ background: c.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Loader2 size={32} style={{ color: c.purple, animation: "spin 1s linear infinite" }} />
          <p style={{ color: c.muted, fontFamily: fontSans, marginTop: 12 }}>Loading doctrine graph...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: c.bg, minHeight: "100vh", padding: "24px 32px", fontFamily: fontSans }}>
      <LayerNavBar label="Doctrine Graph" route="/doctrine-graph" />
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Network size={22} style={{ color: c.purple }} />
          <h1 style={{ fontFamily: fontSerif, color: c.paper, fontSize: 28, margin: 0 }}>
            Doctrine Graph Explorer
          </h1>
        </div>
        <p style={{ color: c.muted, fontSize: 14, margin: 0, maxWidth: 700 }}>
          Interactive map of legal doctrines, their statutory foundations, case law interpretations,
          agency enforcement pathways, and systemic weak joints. Click any node to explore connections.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Doctrines", value: graphData?.doctrines.length ?? 0, color: c.purple },
          { label: "Connections", value: graphData?.edges.length ?? 0, color: c.gold },
          { label: "Visible Nodes", value: filteredNodes.length, color: c.teal },
          { label: "Visible Edges", value: filteredEdges.length, color: c.blue },
        ].map(s => (
          <div key={s.label} style={{
            background: c.cardBg, border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: s.color, fontFamily: fontMono, fontSize: 20, fontWeight: 700 }}>{s.value}</span>
            <span style={{ color: c.muted, fontSize: 12 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: c.cardBg, border: `1px solid ${c.cardBorder}`,
          borderRadius: 8, padding: "6px 12px", flex: "1 1 200px", maxWidth: 300,
        }}>
          <Search size={14} style={{ color: c.muted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes..."
            style={{
              background: "transparent", border: "none", outline: "none",
              color: c.paper, fontFamily: fontSans, fontSize: 13, width: "100%",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <X size={14} style={{ color: c.muted }} />
            </button>
          )}
        </div>

        {/* Node type filter */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Object.entries(NODE_TYPES).map(([type, { color, label }]) => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              style={{
                background: filterType === type ? color + "22" : "transparent",
                border: `1px solid ${filterType === type ? color : c.cardBorder}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                color: filterType === type ? color : c.muted, fontSize: 11,
                fontFamily: fontSans, transition: "all 0.2s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: c.cardBg, border: `1px solid ${c.cardBorder}`,
            borderRadius: 6, padding: "4px 8px", cursor: "pointer",
            color: c.muted, display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          <span style={{ fontSize: 11 }}>{expanded ? "Compact" : "Expand"}</span>
        </button>
      </div>

      {/* Edge type filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ color: c.muted, fontSize: 11, alignSelf: "center", marginRight: 4 }}>Edges:</span>
        {Object.entries(EDGE_TYPES).map(([type, { color, label }]) => (
          <button
            key={type}
            onClick={() => setFilterEdge(filterEdge === type ? null : type)}
            style={{
              background: filterEdge === type ? color + "22" : "transparent",
              border: `1px solid ${filterEdge === type ? color : c.cardBorder}`,
              borderRadius: 6, padding: "3px 8px", cursor: "pointer",
              color: filterEdge === type ? color : c.muted, fontSize: 10,
              fontFamily: fontMono, transition: "all 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Graph + Detail panel */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* SVG Graph */}
        <div
          ref={containerRef}
          style={{
            flex: 1, background: "rgba(0,0,0,0.3)", border: `1px solid ${c.cardBorder}`,
            borderRadius: 12, overflow: "hidden", position: "relative",
            height: expanded ? 700 : 500,
          }}
        >
          <svg width={dims.w} height={dims.h} style={{ display: "block" }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c.muted} opacity={0.5} />
              </marker>
            </defs>

            {/* Edges */}
            {filteredEdges.map(e => {
              const sp = positions[e.source];
              const tp = positions[e.target];
              if (!sp || !tp) return null;
              const edgeStyle = EDGE_TYPES[e.edgeType] || { color: c.muted };
              const strengthStyle = STRENGTH_STYLES[e.strength] || STRENGTH_STYLES.moderate;
              return (
                <line
                  key={e.id}
                  x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                  stroke={edgeStyle.color}
                  strokeWidth={strengthStyle.width}
                  opacity={strengthStyle.opacity}
                  markerEnd="url(#arrow)"
                  style={{ cursor: "pointer" }}
                />
              );
            })}

            {/* Nodes */}
            {filteredNodes.map(n => {
              const pos = positions[n.id];
              if (!pos) return null;
              const nodeType = NODE_TYPES[n.type] || { color: c.muted };
              const isSelected = selectedNode === n.id;
              const radius = 8 + Math.min(n.connections * 2, 12);
              return (
                <g key={n.id} onClick={() => setSelectedNode(isSelected ? null : n.id)} style={{ cursor: "pointer" }}>
                  {/* Glow ring for selected */}
                  {isSelected && (
                    <circle cx={pos.x} cy={pos.y} r={radius + 6}
                      fill="none" stroke={nodeType.color} strokeWidth={2} opacity={0.5} />
                  )}
                  <circle
                    cx={pos.x} cy={pos.y} r={radius}
                    fill={nodeType.color + "33"}
                    stroke={nodeType.color}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  {/* Label */}
                  <text
                    x={pos.x} y={pos.y + radius + 14}
                    textAnchor="middle" fill={c.paper}
                    fontSize={10} fontFamily={fontSans}
                    opacity={0.8}
                  >
                    {n.label.length > 25 ? n.label.slice(0, 22) + "..." : n.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend overlay */}
          <div style={{
            position: "absolute", bottom: 12, left: 12,
            background: "rgba(12,15,20,0.9)", borderRadius: 8, padding: "8px 12px",
            border: `1px solid ${c.cardBorder}`,
          }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {Object.entries(NODE_TYPES).map(([type, { color, label }]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span style={{ color: c.muted, fontSize: 10 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selectedDetails && (
          <div style={{
            width: 320, background: c.cardBg, border: `1px solid ${c.cardBorder}`,
            borderRadius: 12, padding: 20, overflowY: "auto",
            maxHeight: expanded ? 700 : 500,
          }}>
            {/* Node header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: NODE_TYPES[selectedDetails.node.type]?.color ?? c.muted,
                }} />
                <span style={{
                  color: NODE_TYPES[selectedDetails.node.type]?.color ?? c.muted,
                  fontSize: 11, fontFamily: fontMono, textTransform: "uppercase",
                }}>
                  {NODE_TYPES[selectedDetails.node.type]?.label ?? selectedDetails.node.type}
                </span>
              </div>
              <h3 style={{ color: c.paper, fontFamily: fontSerif, fontSize: 18, margin: 0 }}>
                {selectedDetails.node.label}
              </h3>
            </div>

            {/* Doctrine details if applicable */}
            {selectedDetails.doctrine && (
              <div style={{
                background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
                borderRadius: 8, padding: 12, marginBottom: 16,
              }}>
                <p style={{ color: c.paper, fontSize: 13, margin: "0 0 8px 0", lineHeight: 1.5 }}>
                  {selectedDetails.doctrine.description}
                </p>
                {selectedDetails.doctrine.primaryCases && (
                  <div>
                    <span style={{ color: c.muted, fontSize: 11 }}>Primary Cases:</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {(selectedDetails.doctrine.primaryCases as string[]).map((cs, i) => (
                        <span key={i} style={{
                          background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                          borderRadius: 4, padding: "2px 6px", fontSize: 10, color: c.paper,
                          fontFamily: fontMono,
                        }}>
                          {cs}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDetails.doctrine.domains && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ color: c.muted, fontSize: 11 }}>Domains:</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {(Array.isArray(selectedDetails.doctrine.domains) ? selectedDetails.doctrine.domains : []).map((d, i) => (
                        <span key={i} style={{
                          background: c.goldBg, border: `1px solid ${c.goldBorder}`,
                          borderRadius: 4, padding: "2px 6px", fontSize: 10, color: c.gold,
                        }}>
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Connections */}
            <div>
              <h4 style={{ color: c.muted, fontSize: 12, fontFamily: fontMono, marginBottom: 8, textTransform: "uppercase" }}>
                Connections ({selectedDetails.connectedNodes.length})
              </h4>
              {selectedDetails.connectedNodes.map(({ edge, node }) => {
                if (!node) return null;
                const edgeInfo = EDGE_TYPES[edge.edgeType] || { color: c.muted, label: edge.edgeType };
                const isOutgoing = edge.source === selectedNode;
                return (
                  <div
                    key={edge.id}
                    onClick={() => setSelectedNode(node.id)}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${c.cardBorder}`,
                      borderRadius: 8, padding: "10px 12px", marginBottom: 6,
                      cursor: "pointer", transition: "border-color 0.2s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = edgeInfo.color)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = c.cardBorder)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{
                        color: edgeInfo.color, fontSize: 10, fontFamily: fontMono,
                        background: edgeInfo.color + "15", padding: "1px 6px", borderRadius: 4,
                      }}>
                        {isOutgoing ? "→" : "←"} {edgeInfo.label}
                      </span>
                      <span style={{
                        color: c.muted, fontSize: 9, fontFamily: fontMono,
                        background: c.cardBg, padding: "1px 4px", borderRadius: 3,
                      }}>
                        {edge.strength}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: NODE_TYPES[node.type]?.color ?? c.muted,
                      }} />
                      <span style={{ color: c.paper, fontSize: 12 }}>
                        {node.label.length > 35 ? node.label.slice(0, 32) + "..." : node.label}
                      </span>
                    </div>
                    {edge.notes && (
                      <p style={{ color: c.muted, fontSize: 11, margin: "6px 0 0 0", lineHeight: 1.4 }}>
                        {edge.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Doctrine catalog below */}
      {doctrineList && doctrineList.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontFamily: fontSerif, color: c.paper, fontSize: 22, marginBottom: 16 }}>
            Doctrine Catalog
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {doctrineList.map(d => (
              <div
                key={d.id}
                onClick={() => setSelectedNode(`doctrine:${d.name}`)}
                style={{
                  background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                  borderRadius: 10, padding: 16, cursor: "pointer",
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = c.purpleBorder)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = c.cardBorder)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Scale size={14} style={{ color: c.purple }} />
                  <h3 style={{ color: c.paper, fontFamily: fontSerif, fontSize: 15, margin: 0 }}>
                    {d.name}
                  </h3>
                </div>
                <p style={{ color: c.muted, fontSize: 12, lineHeight: 1.5, margin: "0 0 8px 0" }}>
                  {d.description.length > 150 ? d.description.slice(0, 147) + "..." : d.description}
                </p>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(Array.isArray(d.domains) ? d.domains : (typeof d.domains === "string" ? (() => { try { return JSON.parse(d.domains); } catch { return []; } })() : [])).map((dom, i) => (
                    <span key={i} style={{
                      background: c.goldBg, border: `1px solid ${c.goldBorder}`,
                      borderRadius: 4, padding: "1px 6px", fontSize: 10, color: c.gold,
                    }}>
                      {dom}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
