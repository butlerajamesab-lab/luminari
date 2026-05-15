import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, Database, ArrowDown, ArrowRight, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, AlertCircle, XCircle, Siren, ArrowUpRight, Wrench } from "lucide-react";

/* ─── helpers ─── */
function fmt(n: number) {
  return n.toLocaleString();
}

function StatusIcon({ status }: { status: string }) {
  if (status === "populated") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "partial") return <AlertCircle className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-red-400" />;
}

/* ─── types ─── */
interface LayerTable {
  name: string;
  label: string;
  count: number;
}

interface Layer {
  id: string;
  name: string;
  description: string;
  order: number;
  tables: LayerTable[];
  totalRecords: number;
  status: string;
  color: string;
}

interface Connection {
  from: string;
  to: string;
  label: string;
  strength: number;
}

/* ─── Layer Card ─── */
function LayerCard({ layer, isExpanded, onToggle, index }: { layer: Layer; isExpanded: boolean; onToggle: () => void; index: number }) {
  const populatedTables = layer.tables.filter(t => t.count > 0).length;
  const totalTables = layer.tables.length;

  return (
    <div className="relative">
      {/* Connection arrow from previous layer */}
      {index > 0 && (
        <div className="flex justify-center py-1">
          <div className="flex flex-col items-center">
            <div className="w-px h-4 bg-gradient-to-b from-white/20 to-white/40" />
            <ArrowDown className="h-4 w-4 text-white/40" />
          </div>
        </div>
      )}

      <Card
        className="border cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-black/20"
        style={{
          borderColor: `${layer.color}40`,
          background: `linear-gradient(135deg, ${layer.color}08 0%, ${layer.color}04 100%)`,
        }}
        onClick={onToggle}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: layer.color }}
              >
                L{layer.order}
              </div>
              <div>
                <CardTitle className="text-base text-white">{layer.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{layer.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusIcon status={layer.status} />
              <div className="text-right">
                <div className="text-lg font-bold text-white">{fmt(layer.totalRecords)}</div>
                <div className="text-xs text-muted-foreground">{populatedTables}/{totalTables} tables</div>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>

          {/* Mini progress bar */}
          <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${totalTables > 0 ? (populatedTables / totalTables) * 100 : 0}%`,
                backgroundColor: layer.color,
              }}
            />
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0">
            <div className="border-t border-white/10 pt-3 mt-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-left pb-2 font-medium">Table</th>
                    <th className="text-right pb-2 font-medium">Records</th>
                    <th className="text-right pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {layer.tables.map((table) => (
                    <tr key={table.name} className="border-t border-white/5">
                      <td className="py-1.5">
                        <code className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-white/80">{table.name}</code>
                      </td>
                      <td className="text-right py-1.5 font-mono text-white/80">{fmt(table.count)}</td>
                      <td className="text-right py-1.5">
                        {table.count > 0 ? (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-xs">populated</Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs">empty</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// Map layer IDs to their explore-layer page routes
const LAYER_ROUTES: Record<string, string> = {
  "l1": "/legal-library",
  "l2": "/doctrine-graph",
  "l3": "/enforcement-intel",
  "l4": "/litigation-barriers",
  "l5": "/enforcement-pathway",
  "l6": "/signal-registry",
  "l7": "/investigation-workflow",
  "l8": "/signal-registry",
  // fallback by name fragment
  "statutes": "/legal-library",
  "case": "/doctrine-graph",
  "claim": "/litigation-barriers",
  "proof": "/enforcement-intel",
  "agency": "/enforcement-pathway",
  "regulatory": "/enforcement-intel",
  "investigation": "/investigation-workflow",
  "intelligence": "/signal-registry",
};

/* ─── Connection Map ─── */
function ConnectionMap({ connections, layers }: { connections: Connection[]; layers: Layer[] }) {
  const [, navigate] = useLocation();
  const layerMap = new Map(layers.map(l => [l.id, l]));

  // Separate primary (sequential) from cross-connections
  const primaryIds = new Set<string>();
  for (let i = 0; i < layers.length - 1; i++) {
    primaryIds.add(`${layers[i].id}-${layers[i + 1].id}`);
  }
  // Feedback loop
  if (layers.length > 1) primaryIds.add(`${layers[layers.length - 1].id}-${layers[0].id}`);

  const primary = connections.filter(c => primaryIds.has(`${c.from}-${c.to}`));
  const cross = connections.filter(c => !primaryIds.has(`${c.from}-${c.to}`));

  function getLayerRoute(layerId: string, layerName?: string): string {
    if (LAYER_ROUTES[layerId]) return LAYER_ROUTES[layerId];
    if (layerName) {
      const key = layerName.toLowerCase().split(" ")[0];
      if (LAYER_ROUTES[key]) return LAYER_ROUTES[key];
    }
    return "/architecture";
  }

  function renderConnectionRow(conn: Connection, i: number) {
    const fromLayer = layerMap.get(conn.from);
    const toLayer = layerMap.get(conn.to);
    const fromRoute = getLayerRoute(conn.from, fromLayer?.name);
    const toRoute = getLayerRoute(conn.to, toLayer?.name);
    return (
      <div key={i} className="flex items-center gap-2 text-sm group">
        <Badge
          variant="outline"
          className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
          style={{ color: fromLayer?.color, borderColor: `${fromLayer?.color}40` }}
          onClick={() => navigate(fromRoute)}
          title={`Open ${fromLayer?.name ?? conn.from}`}
        >
          {fromLayer?.name?.split(" ")[0] ?? conn.from}
        </Badge>
        <ArrowRight className="h-3 w-3 text-white/30 flex-shrink-0" />
        <Badge
          variant="outline"
          className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
          style={{ color: toLayer?.color, borderColor: `${toLayer?.color}40` }}
          onClick={() => navigate(toRoute)}
          title={`Open ${toLayer?.name ?? conn.to}`}
        >
          {toLayer?.name?.split(" ")[0] ?? conn.to}
        </Badge>
        <span className="text-xs text-muted-foreground truncate flex-1">{conn.label}</span>
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-muted-foreground hover:text-white"
          onClick={() => navigate(fromRoute)}
          title="Navigate to source layer"
        >
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <Card className="border-white/10">
      <CardHeader>
        <CardTitle className="text-base text-white flex items-center gap-2">
          <ArrowRight className="h-4 w-4" />
          Cross-Layer Connections
        </CardTitle>
        <p className="text-xs text-muted-foreground">Click any layer badge to navigate directly to that layer. Hover a row to reveal the jump arrow.</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Primary Pipeline Flow</h4>
            <div className="space-y-1.5">
              {primary.map((conn, i) => renderConnectionRow(conn, i))}
            </div>
          </div>

          {cross.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Cross-Layer Dependencies</h4>
              <div className="space-y-1.5">
                {cross.map((conn, i) => renderConnectionRow(conn, i + 1000))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ─── */
function InterventionStatusOverlay() {
  const dashQ = trpc.interventionNetwork.dashboard.useQuery();
  const stratQ = trpc.systemicStrategy.dashboard.useQuery();
  const outcomeQ = trpc.outcomeEngine.dashboard.useQuery();

  const endpoints = dashQ.data?.endpoints || [];
  // @ts-expect-error pre-existing type mismatch
  const submissions = dashQ.data?.recentSubmissions || [];
  const stratPaths = stratQ.data?.paths || [];
  // @ts-expect-error pre-existing type mismatch
  const outcomes = outcomeQ.data?.recentOutcomes || [];

  const activeInterventions = submissions.filter((s: any) => s.response_status === "submitted" || s.response_status === "investigation_open");
  const executingStrategies = stratPaths.filter((p: any) => p.status === "executing");

  if (dashQ.isLoading) return null;

  return (
    <Card className="border-white/10">
      <CardHeader>
        <CardTitle className="text-base text-white flex items-center gap-2">
          <Siren className="h-4 w-4 text-red-400" />
          Intervention Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Intervention Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
            <div className="text-xl font-bold text-cyan-400">{endpoints.length}</div>
            <div className="text-xs text-muted-foreground">Authority Endpoints</div>
          </div>
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
            <div className="text-xl font-bold text-amber-400">{activeInterventions.length}</div>
            <div className="text-xs text-muted-foreground">Active Interventions</div>
          </div>
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
            <div className="text-xl font-bold text-blue-400">{executingStrategies.length}</div>
            <div className="text-xs text-muted-foreground">Executing Strategies</div>
          </div>
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
            <div className="text-xl font-bold text-emerald-400">{outcomes.length}</div>
            <div className="text-xs text-muted-foreground">Recent Outcomes</div>
          </div>
        </div>

        {/* Active Intervention List */}
        {activeInterventions.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Active Intervention Submissions</div>
            {activeInterventions.slice(0, 5).map((sub: any) => (
              <div key={sub.submission_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/90 truncate">{sub.agency_name || sub.endpoint_id}</div>
                  <div className="text-xs text-muted-foreground">{sub.action_type} · {sub.response_status}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Executing Strategies */}
        {executingStrategies.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Executing Strategy Paths</div>
            {executingStrategies.slice(0, 5).map((p: any) => (
              <div key={p.path_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/90 truncate">{p.strategy_name || p.strategy_id}</div>
                  <div className="text-xs text-muted-foreground">Prob: {p.success_probability || "—"}%</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeInterventions.length === 0 && executingStrategies.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No active interventions or executing strategies. The system is monitoring patterns.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ArchitectureMap() {
  const { data, isLoading } = trpc.architectureMap.getArchitectureOverview.useQuery();
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());
  const [, navigate] = useLocation();

  const toggleLayer = (id: string) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (data) setExpandedLayers(new Set(data.layers.map(l => l.id)));
  };

  const collapseAll = () => setExpandedLayers(new Set());

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return <div className="p-6 text-muted-foreground">Failed to load architecture data.</div>;

  const { layers, connections, summary } = data;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Layers className="h-6 w-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Library Architecture Map</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Structural blueprint of Luminari's legal intelligence system. Eight layers, {fmt(summary.totalTables)} tables, {fmt(summary.totalRecords)} records.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-white">{summary.totalLayers}</div>
            <div className="text-xs text-muted-foreground">Layers</div>
          </CardContent>
        </Card>
        <Card className="border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-white">{summary.totalTables}</div>
            <div className="text-xs text-muted-foreground">Tables</div>
          </CardContent>
        </Card>
        <Card className="border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{fmt(summary.totalRecords)}</div>
            <div className="text-xs text-muted-foreground">Total Records</div>
          </CardContent>
        </Card>
        <Card className="border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{summary.populatedLayers}/{summary.totalLayers}</div>
            <div className="text-xs text-muted-foreground">Populated Layers</div>
          </CardContent>
        </Card>
        <Card className="border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{summary.completionPercent}%</div>
            <div className="text-xs text-muted-foreground">Completion</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={expandAll} className="text-xs">
          Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs">
          Collapse All
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Populated</span>
          <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" /> Empty</span>
        </div>
      </div>

      {/* Layer Stack */}
      <div className="space-y-0">
        {layers.map((layer, i) => (
          <LayerCard
            key={layer.id}
            layer={layer}
            index={i}
            isExpanded={expandedLayers.has(layer.id)}
            onToggle={() => toggleLayer(layer.id)}
          />
        ))}
      </div>

      {/* Feedback loop indicator */}
      <div className="flex justify-center">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground">
          <ArrowRight className="h-3 w-3 text-indigo-400 rotate-180" />
          <span>Intelligence signals feed back into statutory analysis — continuous loop</span>
          <ArrowRight className="h-3 w-3 text-blue-400" />
        </div>
      </div>

      {/* Connection Map */}
      <ConnectionMap connections={connections} layers={layers} />

      {/* Intervention Status Overlay */}
      <InterventionStatusOverlay />

      {/* Explore Layers — rich tiles with live counts and Workshop push-through */}
      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Explore Layers
          </CardTitle>
          <p className="text-xs text-muted-foreground">Each layer links directly to its data view. Use "Open in Workshop" to pull findings into an active case.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { label: "Legal Library", route: "/legal-library", desc: "Statutes, case law & clauses", count: (layers.find(l => l.id === "statutes")?.totalRecords ?? 0) + (layers.find(l => l.id === "case_law")?.totalRecords ?? 0), color: "#6366f1" },
              { label: "Doctrine Graph", route: "/doctrine-graph", desc: "Doctrine nodes & edge map", count: layers.find(l => l.id === "case_law")?.totalRecords ?? 0, color: "#8b5cf6" },
              { label: "Enforcement Intel", route: "/enforcement-intel", desc: "Agency authority & pathways", count: layers.find(l => l.id === "enforcement")?.totalRecords ?? 0, color: "#f59e0b" },
              { label: "Signal Registry", route: "/signal-registry", desc: "Jurisdiction-level signals", count: layers.find(l => l.id === "intelligence")?.totalRecords ?? 0, color: "#10b981" },
              { label: "Litigation Barriers", route: "/litigation-barriers", desc: "Barriers & weak joints", count: layers.find(l => l.id === "claim_elements")?.totalRecords ?? 0, color: "#ef4444" },
              { label: "Contradiction Scoring", route: "/contradiction-scoring", desc: "Contradiction templates & scores", count: layers.find(l => l.id === "proof_frameworks")?.totalRecords ?? 0, color: "#ec4899" },
              { label: "Enforcement Pathway", route: "/enforcement-pathway", desc: "Action paths & remedy matrix", count: layers.find(l => l.id === "enforcement")?.totalRecords ?? 0, color: "#f97316" },
              { label: "Investigation Workflow", route: "/investigation-workflow", desc: "Workflows & proof frameworks", count: layers.find(l => l.id === "investigation")?.totalRecords ?? 0, color: "#06b6d4" },
            ] as const).map(tile => (
              <div
                key={tile.label}
                className="group rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 transition-all p-3 flex flex-col gap-2"
                style={{ borderColor: `${tile.color}30` }}
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="text-sm font-medium text-white leading-tight">{tile.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{tile.desc}</div>
                  </div>
                  <div className="text-lg font-bold shrink-0" style={{ color: tile.color }}>
                    {tile.count.toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-1.5 mt-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-7 text-xs px-2 text-white/70 hover:text-white hover:bg-white/10"
                    onClick={() => navigate(tile.route)}
                  >
                    <ArrowUpRight className="h-3 w-3 mr-1" /> Open
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-7 text-xs px-2 hover:bg-white/10"
                    style={{ color: tile.color }}
                    onClick={() => navigate(`/workshop?from=${encodeURIComponent(tile.label)}&layer=${encodeURIComponent(tile.route)}`)}
                  >
                    <Wrench className="h-3 w-3 mr-1" /> Workshop
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
